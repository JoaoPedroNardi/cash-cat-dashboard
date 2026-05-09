import { supabase } from "@/integrations/supabase/client";

function addInterval(d: Date, freq: "weekly" | "monthly" | "yearly"): Date {
  const n = new Date(d);
  if (freq === "weekly") n.setDate(n.getDate() + 7);
  else if (freq === "monthly") n.setMonth(n.getMonth() + 1);
  else n.setFullYear(n.getFullYear() + 1);
  return n;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

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
  const todayStr = ymd(today);

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
      });
      next = addInterval(next, t.frequency);
    }

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("transactions").insert(rows);
      if (!insErr) {
        created += rows.length;
        const reachedEnd = end && next > end;
        await supabase
          .from("recurring_transactions")
          .update({
            next_run: ymd(next),
            active: reachedEnd ? false : true,
          })
          .eq("id", t.id);
      }
    } else if (todayStr > t.next_run) {
      // safety: if no rows generated but next_run is in the past somehow
    }
  }

  return created;
}
