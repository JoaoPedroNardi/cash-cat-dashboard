import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authenticateWithToken } from '@/integrations/supabase/server-auth';
import { createConnectToken, getItem, listAccounts, listTransactions } from './client.server';

// Códigos de banco (BACEN) que conseguimos reconhecer pelo transferNumber. Como o conector
// MeuPluggy não informa a instituição de origem, este é o único sinal disponível.
const BANK_CODE_NAMES: Record<string, string> = { '260': 'Nubank', '348': 'XP' };

function bankNameFromTransferNumber(transferNumber?: string | null): string | null {
  const code = transferNumber?.split('/')[0];
  return (code && BANK_CODE_NAMES[code]) || null;
}

const getConnectTokenSchema = z.object({
  accessToken: z.string(),
  oauthRedirectUri: z.string().optional(),
});

export const getConnectToken = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => getConnectTokenSchema.parse(data))
  .handler(async ({ data }) => {
    await authenticateWithToken(data.accessToken);
    const accessToken = await createConnectToken(data.oauthRedirectUri);
    return { accessToken };
  });

const syncItemSchema = z
  .object({
    accessToken: z.string(),
    itemId: z.string().optional(),
    connectionId: z.string().uuid().optional(),
  })
  .refine((v) => v.itemId || v.connectionId, { message: 'itemId ou connectionId é obrigatório' });

export const syncItem = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => syncItemSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase, userId } = await authenticateWithToken(data.accessToken);

    let pluggyItemId = data.itemId;
    let connectionId = data.connectionId;
    // Re-sincronizações só buscam transações recentes: baixar o histórico inteiro toda vez
    // estoura o limite de CPU do Worker (503 "exceeded CPU time limit"). Margem de 7 dias
    // cobre lançamentos que a Pluggy publica com atraso.
    let syncSince: string | undefined;

    if (connectionId) {
      const { data: conn, error } = await supabase
        .from('bank_connections')
        .select('id, pluggy_item_id, last_synced_at')
        .eq('id', connectionId)
        .single();
      if (error || !conn) throw new Error('Conexão bancária não encontrada');
      pluggyItemId = conn.pluggy_item_id;
      if (conn.last_synced_at) {
        syncSince = new Date(new Date(conn.last_synced_at).getTime() - 7 * 86400000).toISOString().slice(0, 10);
      }
    }
    if (!pluggyItemId) throw new Error('itemId ausente');

    const item = await getItem(pluggyItemId);

    if (!connectionId) {
      const { data: inserted, error } = await supabase
        .from('bank_connections')
        .insert({
          user_id: userId,
          pluggy_item_id: pluggyItemId,
          institution_name: item.connector?.name ?? null,
          status: item.status,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      connectionId = inserted.id;
    } else {
      await supabase.from('bank_connections').update({ status: item.status }).eq('id', connectionId);
    }

    const pluggyAccounts = await listAccounts(pluggyItemId);
    let accountsSynced = 0;
    let transactionsInserted = 0;

    // Cartões não trazem bankData; herdam a instituição das contas do mesmo item.
    const itemInstitution =
      pluggyAccounts.map((a) => bankNameFromTransferNumber(a.bankData?.transferNumber)).find(Boolean) ?? null;

    for (const pAccount of pluggyAccounts) {
      // Convenção do app: negativo = devendo. Na Pluggy, o saldo do cartão é o valor da fatura (positivo).
      const syncedBalance = pAccount.type === 'CREDIT' ? -pAccount.balance : pAccount.balance;
      const creditLimit = pAccount.creditData?.creditLimit ?? null;
      const mask = (pAccount.number ?? '').replace(/\D/g, '').slice(-4) || null;

      const derivedInstitution = bankNameFromTransferNumber(pAccount.bankData?.transferNumber) ?? itemInstitution;

      const { data: existingAccount } = await supabase
        .from('accounts')
        .select('id, institution_name')
        .eq('pluggy_account_id', pAccount.id)
        .maybeSingle();

      let localAccountId = existingAccount?.id;
      const isNewAccount = !localAccountId;

      if (localAccountId) {
        // A instituição só é preenchida quando ainda está vazia: se o usuário renomeou
        // (ex: "Clear Corretora"), a sincronização não pode desfazer isso.
        const { error } = await supabase
          .from('accounts')
          .update({
            synced_balance: syncedBalance,
            credit_limit: creditLimit,
            account_mask: mask,
            ...(existingAccount?.institution_name ? {} : { institution_name: derivedInstitution }),
          })
          .eq('id', localAccountId);
        if (error) throw new Error(error.message);
      } else {
        const { data: created, error } = await supabase
          .from('accounts')
          .insert({
            user_id: userId,
            name: pAccount.name,
            type: pAccount.type === 'CREDIT' ? 'credit' : 'checking',
            initial_balance: 0,
            synced_balance: syncedBalance,
            credit_limit: creditLimit,
            account_mask: mask,
            institution_name: derivedInstitution,
            pluggy_account_id: pAccount.id,
            bank_connection_id: connectionId,
          })
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        localAccountId = created.id;
      }
      accountsSynced++;

      // Pluggy pode retornar lançamentos com valor 0 (ex: autorizações pendentes);
      // ignoramos, já que amount > 0 é obrigatório no schema (mesma regra da importação de CSV/OFX).
      // Conta nova precisa do histórico completo; conta existente só do que veio depois da última sincronização.
      const pluggyTxs = (await listTransactions(pAccount.id, isNewAccount ? undefined : syncSince)).filter((t) => t.amount !== 0);
      if (pluggyTxs.length === 0) continue;

      const rows = pluggyTxs.map((t) => ({
        user_id: userId,
        type: t.type === 'CREDIT' ? ('income' as const) : ('expense' as const),
        amount: Math.abs(t.amount),
        category: 'outros',
        description: t.description || null,
        occurred_at: t.date.slice(0, 10),
        account_id: localAccountId,
        pluggy_transaction_id: t.id,
      }));

      const { error, count } = await supabase
        .from('transactions')
        .upsert(rows, { onConflict: 'pluggy_transaction_id', ignoreDuplicates: true, count: 'exact' });
      if (error) throw new Error(error.message);
      transactionsInserted += count ?? 0;
    }

    // Só marca como sincronizado ao terminar: se uma execução falhar no meio, a próxima
    // volta a buscar desde a última sincronização que realmente completou.
    await supabase.from('bank_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', connectionId);

    return { accountsSynced, transactionsInserted };
  });
