import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { useMonthlySummary } from "@/hooks/use-monthly-summary";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatBRL, getCategory } from "@/lib/categories";

export const Route = createFileRoute("/_authenticated/monthly-summary")({
  head: () => ({ meta: [{ title: "Resumo Mensal — Finança" }] }),
  component: MonthlySummaryPage,
});

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function MonthlySummaryPage() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [accountId, setAccountId] = useState("all");
  const [accounts, setAccounts] = useState<any[]>([]);
  const { data, loading, load } = useMonthlySummary();

  useEffect(() => {
    if (!user) return;
    supabase.from("accounts").select("id,name").eq("user_id", user.id).then(({ data }) => setAccounts(data ?? []));
  }, [user]);

  useEffect(() => {
    load(month, year, accountId === "all" ? undefined : accountId);
  }, [month, year, accountId, load]);

  const prevMonth = () => month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1);
  const nextMonth = () => month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Resumo mensal</h1>
          <p className="text-muted-foreground mt-1">Visão detalhada por mês</p>
        </div>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as contas</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </header>

      {/* Navegação de mês */}
      <div className="flex justify-center items-center gap-4 mb-8">
        <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="font-semibold min-w-[180px] text-center text-lg">{MONTHS[month]} {year}</span>
        <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {loading && !data ? (
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      ) : data ? (
        <div className="space-y-6">
          {/* Cards de totais */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Receitas", value: data.totalIncome, color: "var(--success)" },
              { label: "Despesas", value: data.totalExpenses, color: "var(--destructive)" },
              { label: "Saldo", value: data.balance, color: data.balance >= 0 ? "var(--success)" : "var(--destructive)" },
            ].map((c) => (
              <div key={c.label} className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card">
                <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
                <p className="text-2xl font-semibold tabular-nums" style={{ color: c.color }}>
                  {formatBRL(c.value)}
                </p>
              </div>
            ))}
          </div>

          {/* Categorias */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
            <h3 className="font-medium mb-4">Gastos por categoria</h3>
            {data.breakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem gastos no período.</p>
            ) : (
              <div className="space-y-4">
                {data.breakdown.map((item) => {
                  const cat = getCategory("expense", item.category);
                  const Icon = cat.icon;
                  return (
                    <div key={item.category}>
                      <div className="flex items-center justify-between mb-1.5 text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-6 w-6 rounded-md flex items-center justify-center"
                            style={{ background: `color-mix(in oklab, ${cat.color} 20%, transparent)`, color: cat.color }}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          {cat.label}
                        </span>
                        <span className="tabular-nums">
                          {formatBRL(item.totalExpenses)}
                          {item.budgetAmount && (
                            <span className="text-muted-foreground ml-1">/ {formatBRL(item.budgetAmount)}</span>
                          )}
                        </span>
                      </div>
                      {item.budgetAmount && (
                        <Progress value={item.percentage} className="h-1.5"
                          style={{ "--progress-color": item.percentage >= 100 ? "var(--destructive)" : cat.color } as any} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Parcelas do mês */}
          {data.activeInstallments.length > 0 && (
            <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
              <h3 className="font-medium mb-4">Parcelas neste mês</h3>
              <div className="divide-y divide-border">
                {data.activeInstallments.map((inst, i) => (
                  <div key={i} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{inst.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Parcela {inst.installmentIndex}/{inst.installmentTotal} •{" "}
                        {new Date(inst.occurred_at + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <p className="text-sm font-medium tabular-nums text-destructive">{formatBRL(inst.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
