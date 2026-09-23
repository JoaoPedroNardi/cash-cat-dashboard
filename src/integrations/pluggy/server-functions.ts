import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authenticateWithToken } from '@/integrations/supabase/server-auth';
import { createConnectToken, getItem, listAccounts, listTransactionsPage } from './client.server';

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

/**
 * Parte leve da sincronização: conexão, contas e saldos. As transações NÃO são importadas aqui —
 * o Worker tem limite de CPU e trazer o histórico inteiro numa requisição só o estoura (erro 1102).
 * Devolvemos a lista de contas e o navegador busca as transações página a página (getTransactionsPage).
 */
export const syncItem = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => syncItemSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase, userId } = await authenticateWithToken(data.accessToken);

    let pluggyItemId = data.itemId;
    let connectionId = data.connectionId;
    // Re-sincronizações só buscam transações desde a última sincronização concluída, com margem
    // de 7 dias para lançamentos que a Pluggy publica com atraso.
    let since: string | null = null;

    if (connectionId) {
      const { data: conn, error } = await supabase
        .from('bank_connections')
        .select('id, pluggy_item_id, last_synced_at')
        .eq('id', connectionId)
        .single();
      if (error || !conn) throw new Error('Conexão bancária não encontrada');
      pluggyItemId = conn.pluggy_item_id;
      if (conn.last_synced_at) {
        since = new Date(new Date(conn.last_synced_at).getTime() - 7 * 86400000).toISOString().slice(0, 10);
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
    const accounts: { localId: string; pluggyId: string; name: string; isNew: boolean }[] = [];

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
      const isNew = !localAccountId;

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

      accounts.push({ localId: localAccountId!, pluggyId: pAccount.id, name: pAccount.name, isNew });
    }

    return { connectionId: connectionId!, accounts, since };
  });

const transactionsPageSchema = z.object({
  accessToken: z.string(),
  pluggyAccountId: z.string().uuid(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  after: z.string().max(500).optional(),
});

// Categorias da Pluggy que são movimentação interna, não ganho nem gasto de verdade.
const INTERNAL_CATEGORIES = new Set([
  'Credit card payment', // pagamento/parcelamento de fatura
  'Same person transfer', // transferência entre contas do próprio titular
  'Transfer - Internal',
  'Investments', // aplicação e resgate (RDB, etc.)
]);
// A XP classifica o pagamento de fatura como "Transfers" genérico; a descrição entrega.
const CARD_BILL_PAYMENT = /pagamento\s+(de|da)\s+fatura/i;

function isInternalMovement(category: string | null, description: string | null): boolean {
  return INTERNAL_CATEGORIES.has(category ?? '') || CARD_BILL_PAYMENT.test(description ?? '');
}

/** Uma página (até 500) de transações de uma conta sincronizada, já no formato do app. */
export const getTransactionsPage = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => transactionsPageSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await authenticateWithToken(data.accessToken);

    // Só entrega transações de contas que pertencem ao usuário (RLS filtra por user_id).
    const { data: owned } = await supabase
      .from('accounts')
      .select('id')
      .eq('pluggy_account_id', data.pluggyAccountId)
      .maybeSingle();
    if (!owned) throw new Error('Conta não encontrada');

    const page = await listTransactionsPage(data.pluggyAccountId, { dateFrom: data.dateFrom, after: data.after });

    // Pluggy pode retornar lançamentos com valor 0 (ex: autorizações pendentes); ignoramos, já que
    // amount > 0 é obrigatório no schema (mesma regra da importação de CSV/OFX).
    const rows = page.results
      .filter((t) => t.amount !== 0)
      .map((t) => ({
        id: t.id,
        type: t.type === 'CREDIT' ? ('income' as const) : ('expense' as const),
        amount: Math.abs(t.amount),
        description: t.description || null,
        date: t.date.slice(0, 10),
        ignoreInTotals: isInternalMovement(t.category, t.description),
      }));

    return { rows, cursor: page.cursor };
  });
