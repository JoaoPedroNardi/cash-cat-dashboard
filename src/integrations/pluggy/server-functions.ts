import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authenticateWithToken } from '@/integrations/supabase/server-auth';
import { createConnectToken, getItem, listAccounts, listTransactions } from './client.server';

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

    if (connectionId) {
      const { data: conn, error } = await supabase
        .from('bank_connections')
        .select('id, pluggy_item_id')
        .eq('id', connectionId)
        .single();
      if (error || !conn) throw new Error('Conexão bancária não encontrada');
      pluggyItemId = conn.pluggy_item_id;
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
          last_synced_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      connectionId = inserted.id;
    } else {
      await supabase
        .from('bank_connections')
        .update({ status: item.status, last_synced_at: new Date().toISOString() })
        .eq('id', connectionId);
    }

    const pluggyAccounts = await listAccounts(pluggyItemId);
    let accountsSynced = 0;
    let transactionsInserted = 0;

    for (const pAccount of pluggyAccounts) {
      const { data: existingAccount } = await supabase
        .from('accounts')
        .select('id')
        .eq('pluggy_account_id', pAccount.id)
        .maybeSingle();

      let localAccountId = existingAccount?.id;

      if (!localAccountId) {
        const { data: created, error } = await supabase
          .from('accounts')
          .insert({
            user_id: userId,
            name: pAccount.name,
            type: pAccount.type === 'CREDIT' ? 'credit' : 'checking',
            initial_balance: 0,
            credit_limit: pAccount.creditData?.creditLimit ?? null,
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
      const pluggyTxs = (await listTransactions(pAccount.id)).filter((t) => t.amount !== 0);
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

    return { accountsSynced, transactionsInserted };
  });
