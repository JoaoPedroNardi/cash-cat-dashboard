import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { syncItem, getTransactionsPage } from "@/integrations/pluggy/server-functions";

export const SYNC_DONE_EVENT = "financa:sync-done";

export interface SyncResult {
  accounts: number;
  inserted: number;
  investments: number;
  investmentsError: string | null;
}

// Uma sincronização por vez no app inteiro (manual ou automática).
let running = false;

/** Roda `fn` se não houver outra sincronização em andamento; devolve null se houver. */
async function exclusive<T>(fn: () => Promise<T>): Promise<T | null> {
  if (running) return null;
  running = true;
  try {
    return await fn();
  } finally {
    running = false;
    // Avisa as telas abertas para recarregarem os dados (mesmo em falha parcial).
    window.dispatchEvent(new Event(SYNC_DONE_EVENT));
  }
}

/** Executa `cb` sempre que uma sincronização terminar. */
export function useOnSyncDone(cb: () => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(SYNC_DONE_EVENT, handler);
    return () => window.removeEventListener(SYNC_DONE_EVENT, handler);
  }, []);
}

export function usePluggySync() {
  const callSyncItem = useServerFn(syncItem);
  const callGetTransactionsPage = useServerFn(getTransactionsPage);

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const failure = "O servidor não concluiu a sincronização. Aguarde alguns segundos e tente de novo.";

  /** Sincroniza uma conexão (nova via itemId, ou existente via connectionId). Null = já há uma em andamento. */
  const syncConnection = (
    input: { itemId?: string; connectionId?: string },
    onProgress?: (message: string) => void,
  ): Promise<SyncResult | null> =>
    exclusive(async () => {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Sessão expirada");

      // 1) Parte leve no servidor: contas, saldos e investimentos.
      onProgress?.("Sincronizando contas...");
      const sync = await callSyncItem({ data: { accessToken, ...input } });
      if (!sync || !Array.isArray(sync.accounts)) throw new Error(failure);

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");

      // 2) Transações: o servidor entrega uma página por requisição (o Worker tem limite de CPU)
      // e gravamos direto no Supabase daqui, com a sessão do usuário.
      let inserted = 0;
      for (const acc of sync.accounts) {
        let after: string | undefined;
        let seen = 0;
        const fullImport = acc.isNew || !sync.since;
        do {
          onProgress?.(`Importando ${acc.name}${seen ? ` (${seen} transações)` : ""}...`);
          const page = await callGetTransactionsPage({
            data: {
              accessToken,
              pluggyAccountId: acc.pluggyId,
              dateFrom: !acc.isNew && sync.since ? sync.since : undefined,
              after,
            },
          });
          if (!page || !Array.isArray(page.rows)) throw new Error(failure);

          if (page.rows.length > 0) {
            const { error, count } = await supabase.from("transactions").upsert(
              page.rows.map((r) => ({
                user_id: u.user!.id,
                type: r.type,
                amount: r.amount,
                category: r.category,
                description: r.description,
                occurred_at: r.date,
                account_id: acc.localId,
                pluggy_transaction_id: r.id,
                ignore_in_totals: r.ignoreInTotals,
              })),
              { onConflict: "pluggy_transaction_id", ignoreDuplicates: true, count: "exact" },
            );
            if (error) throw new Error(error.message);
            inserted += count ?? 0;

            // Só em importação completa: marca as internas também nas já existentes (só esse campo,
            // preservando categoria/descrição editadas). Nas incrementais não mexe, pra não desfazer
            // um ajuste manual seu. Em blocos pra não estourar o tamanho da URL.
            const internalIds = fullImport ? page.rows.filter((r) => r.ignoreInTotals).map((r) => r.id) : [];
            for (let i = 0; i < internalIds.length; i += 80) {
              const { error: markError } = await supabase
                .from("transactions")
                .update({ ignore_in_totals: true })
                .in("pluggy_transaction_id", internalIds.slice(i, i + 80));
              if (markError) throw new Error(markError.message);
            }
          }
          seen += page.rows.length;
          after = page.cursor ?? undefined;
        } while (after);
      }

      // Só marca como sincronizado ao terminar: se falhar no meio, a próxima tentativa recomeça
      // desde a última sincronização que realmente completou.
      await supabase.from("bank_connections").update({ last_synced_at: new Date().toISOString() }).eq("id", sync.connectionId);

      return {
        accounts: sync.accounts.length,
        inserted,
        investments: sync.investmentsSynced,
        investmentsError: sync.investmentsError,
      };
    });

  /**
   * Sincroniza as conexões cuja última sincronização passou de `maxAgeHours`, uma de cada vez.
   * Devolve null se nada estava desatualizado (ou se já havia uma sincronização em andamento).
   */
  const syncStale = async (maxAgeHours: number, onProgress?: (message: string) => void): Promise<SyncResult | null> => {
    const { data } = await supabase.from("bank_connections").select("id,last_synced_at");
    const limit = Date.now() - maxAgeHours * 3600_000;
    const stale = (data ?? []).filter((c) => !c.last_synced_at || new Date(c.last_synced_at).getTime() < limit);
    if (stale.length === 0) return null;

    const total: SyncResult = { accounts: 0, inserted: 0, investments: 0, investmentsError: null };
    let ranAny = false;
    for (const c of stale) {
      const r = await syncConnection({ connectionId: c.id }, onProgress);
      if (!r) continue; // outra sincronização já estava em andamento
      ranAny = true;
      total.accounts += r.accounts;
      total.inserted += r.inserted;
      total.investments += r.investments;
      total.investmentsError = total.investmentsError ?? r.investmentsError;
    }
    return ranAny ? total : null;
  };

  return { syncConnection, syncStale };
}
