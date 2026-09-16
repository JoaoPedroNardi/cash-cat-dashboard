import { supabase } from "@/integrations/supabase/client";
import { dateToYMD } from "@/lib/utils";

function addInterval(d: Date, freq: "weekly" | "monthly" | "yearly"): Date {
  const n = new Date(d);
  if (freq === "weekly") {
    n.setDate(n.getDate() + 7);
  } else if (freq === "monthly") {
    // Preserva o dia, mas sem estourar para o mês seguinte (31/jan -> 28/fev).
    const day = n.getDate();
    n.setDate(1);
    n.setMonth(n.getMonth() + 1);
    const lastDay = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
    n.setDate(Math.min(day, lastDay));
  } else {
    n.setFullYear(n.getFullYear() + 1);
  }
  return n;
}

const ymd = (d: Date) => dateToYMD(d);

/**
 * For each active recurring template, generate transaction rows for every
 * occurrence whose date is <= today and not yet generated, and bump next_run.
 */
export async function materializeRecurring(): Promise<number> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return 0;

  const { data: tpls, error } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("active", true);
  if (error || !tpls) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let created = 0;

  for (const t of tpls) {
    let next = new Date(t.next_run + "T00:00:00");
    const end = t.end_date ? new Date(t.end_date + "T00:00:00") : null;
    const rows: any[] = [];

    while (next <= today && (!end || next <= end)) {
      rows.push({
        user_id: u.user.id,
        type: t.type,
        amount: Number(t.amount),
        category: t.category,
        description: t.description ? `${t.description} (recorrente)` : "Recorrente",
        occurred_at: ymd(next),
        account_id: t.account_id,
        recurring_transaction_id: t.id,
      });
      next = addInterval(next, t.frequency);
    }

    if (rows.length === 0) continue;

    const reachedEnd = end && next > end;
    // Reivindica o avanço condicionado ao next_run que acabamos de ler: se outra
    // chamada concorrente (outra aba, duplo efeito) já processou este template,
    // o next_run mudou e este update não afeta nenhuma linha — pulamos para não
    // duplicar os lançamentos.
    const { data: claimed, error: claimErr } = await supabase
      .from("recurring_transactions")
      .update({ next_run: ymd(next), active: reachedEnd ? false : true })
      .eq("id", t.id)
      .eq("next_run", t.next_run)
      .select("id");
    if (claimErr || !claimed || claimed.length === 0) continue;

    const { error: insErr } = await supabase.from("transactions").insert(rows);
    if (!insErr) created += rows.length;
  }

  return created;
}
