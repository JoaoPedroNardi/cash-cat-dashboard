import { useEffect, useMemo, useState } from "react";
import { addMonths, startOfMonth, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCategory } from "@/lib/categories";
import { billingCycleRange, billingMonthKey } from "@/lib/billing";
import { dateToYMD, formatDateBR, todayYMD } from "@/lib/utils";
import { useBillingClosingDay } from "@/hooks/use-billing-closing-day";
import { useMoney } from "@/hooks/use-privacy";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Tx {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string | null;
  occurred_at: string;
  ignore_in_totals: boolean;
}

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Compras de um cartão no ciclo de fatura, com navegação entre faturas. */
export function CardInvoiceSheet({
  card, onClose,
}: {
  card: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const { day: closingDay } = useBillingClosingDay();
  const money = useMoney();
  const [month, setMonth] = useState<Date>(() => currentBillingMonth(closingDay));
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);

  // Ao abrir outro cartão, volta para a fatura atual.
  useEffect(() => {
    if (card) setMonth(currentBillingMonth(closingDay));
  }, [card?.id, closingDay]);

  const cycle = useMemo(
    () => billingCycleRange(month.getFullYear(), month.getMonth() + 1, closingDay),
    [month, closingDay],
  );
  const startYMD = dateToYMD(cycle.start);
  const endYMD = dateToYMD(cycle.end);

  useEffect(() => {
    if (!card) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("transactions")
      .select("id,type,amount,category,description,occurred_at,ignore_in_totals")
      .eq("account_id", card.id)
      .gte("occurred_at", startYMD)
      .lte("occurred_at", endYMD)
      .order("occurred_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setTxs((data ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) })));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [card?.id, startYMD, endYMD]);

  // Total da fatura = compras menos estornos. Pagamentos da fatura (marcados como internos) ficam de fora.
  const total = useMemo(
    () => txs.reduce((s, t) => {
      if (t.ignore_in_totals) return s;
      return s + (t.type === "expense" ? t.amount : -t.amount);
    }, 0),
    [txs],
  );

  // Não há fatura futura para navegar: a próxima fica desabilitada na fatura atual.
  const isCurrent = month.getTime() >= currentBillingMonth(closingDay).getTime();
  const fmtDM = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

  return (
    <Sheet open={!!card} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{card?.name ?? "Fatura"}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium capitalize">Fatura de {MONTHS_PT[month.getMonth()]} de {month.getFullYear()}</p>
            <p className="text-xs text-muted-foreground">{fmtDM(cycle.start)} a {fmtDM(cycle.end)}</p>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}
              className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted" aria-label="Fatura anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))} disabled={isCurrent}
              className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40" aria-label="Próxima fatura">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-xs text-muted-foreground">Total da fatura</p>
          <p className="text-2xl font-semibold tabular-nums">{money(total)}</p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
        ) : txs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma compra nessa fatura.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {txs.map((t) => {
              const c = getCategory(t.type, t.category);
              const Icon = c.icon;
              return (
                <li key={t.id} className={`flex items-center gap-3 py-3 ${t.ignore_in_totals ? "opacity-60" : ""}`}>
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `color-mix(in oklab, ${c.color} 20%, transparent)`, color: c.color }}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.description || c.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateBR(t.occurred_at)} • {c.label}{t.ignore_in_totals ? " • pagamento/interno" : ""}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${t.type === "income" ? "text-[color:var(--success)]" : ""}`}>
                    {t.type === "income" ? "+" : ""}{money(t.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}

function currentBillingMonth(closingDay: number): Date {
  const [y, m] = billingMonthKey(todayYMD(), closingDay).split("-").map(Number);
  return new Date(y, m - 1, 1);
}
