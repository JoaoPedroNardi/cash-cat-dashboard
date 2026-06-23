import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBillingClosingDay } from "@/hooks/use-billing-closing-day";
import { billingCycleRange } from "@/lib/billing";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/billing-settings")({
  head: () => ({ meta: [{ title: "Fatura — Finança" }] }),
  component: BillingSettingsPage,
});

const MONTHS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function fmtDM(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${MONTHS_PT[d.getMonth()]}`;
}

function BillingSettingsPage() {
  const { day, setDay } = useBillingClosingDay();
  const [value, setValue] = useState(String(day));

  const parsed = Math.max(1, Math.min(28, parseInt(value) || day));
  // Exemplo usando o mês atual como referência
  const now = new Date();
  const cycle = billingCycleRange(now.getFullYear(), now.getMonth() + 1, parsed);

  const save = () => {
    setDay(parsed);
    setValue(String(parsed));
    toast.success("Dia de fechamento salvo");
  };

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Fatura</h1>
        <p className="text-muted-foreground mt-1">
          Em que dia sua fatura fecha — define como os meses são agrupados no painel
        </p>
      </header>

      <div className="bg-gradient-card border border-border rounded-2xl p-6 md:p-8 shadow-card space-y-6">
        <div className="space-y-2">
          <Label htmlFor="closing">Dia de fechamento</Label>
          <Input
            id="closing"
            type="number"
            min={1}
            max={28}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="text-2xl font-semibold h-14 w-32"
          />
          <p className="text-sm text-muted-foreground">
            Compras a partir do dia <strong>{parsed}</strong> entram na fatura do mês seguinte.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-secondary/30 p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div className="text-sm">
            <p className="font-medium">Exemplo</p>
            <p className="text-muted-foreground mt-0.5">
              A fatura de <span className="capitalize">{MONTHS_PT[now.getMonth()]}</span> cobre de{" "}
              <strong>{fmtDM(cycle.start)}</strong> a <strong>{fmtDM(cycle.end)}</strong>.
            </p>
          </div>
        </div>

        <Button
          onClick={save}
          disabled={parsed === day}
          className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow h-12 text-base"
        >
          {parsed === day ? "Salvo" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
