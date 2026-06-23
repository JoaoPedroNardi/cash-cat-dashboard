import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, getCategory } from "@/lib/categories";
import { formatDateBR, todayYMD } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Trash2, Layers } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/installments")({
  head: () => ({ meta: [{ title: "Parcelados — Finança" }] }),
  component: InstallmentsPage,
});

interface Parcela {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  occurred_at: string;
  installment_group_id: string;
  installment_number: number;
  installment_total: number;
}

interface Plan {
  groupId: string;
  description: string;
  category: string;
  total: number;
  count: number;
  paid: number;
  remaining: number;
  paidAmount: number;
  remainingAmount: number;
  perInstallment: number;
  nextDue: string | null;
  done: boolean;
}

/** Remove o sufixo " (3/12)" da descrição para mostrar o nome base da compra. */
function baseName(desc: string | null): string {
  if (!desc) return "Parcelado";
  return desc.replace(/\s*\(\d+\/\d+\)\s*$/, "").trim() || "Parcelado";
}

function InstallmentsPage() {
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("id,amount,category,description,occurred_at,installment_group_id,installment_number,installment_total")
      .not("installment_group_id", "is", null)
      .order("occurred_at", { ascending: true });
    setParcelas((data ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const plans = useMemo<Plan[]>(() => {
    const today = todayYMD();
    const groups = new Map<string, Parcela[]>();
    for (const p of parcelas) {
      const arr = groups.get(p.installment_group_id) ?? [];
      arr.push(p);
      groups.set(p.installment_group_id, arr);
    }
    const result: Plan[] = [];
    for (const [groupId, arr] of groups) {
      arr.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
      const total = arr.reduce((s, p) => s + p.amount, 0);
      const count = arr[0]?.installment_total ?? arr.length;
      const paidParc = arr.filter((p) => p.occurred_at <= today);
      const paid = paidParc.length;
      const paidAmount = paidParc.reduce((s, p) => s + p.amount, 0);
      const future = arr.filter((p) => p.occurred_at > today);
      const nextDue = future[0]?.occurred_at ?? null;
      result.push({
        groupId,
        description: baseName(arr[0]?.description),
        category: arr[0]?.category ?? "outros",
        total,
        count,
        paid,
        remaining: count - paid,
        paidAmount,
        remainingAmount: Math.round((total - paidAmount) * 100) / 100,
        perInstallment: arr[0]?.amount ?? 0,
        nextDue,
        done: future.length === 0,
      });
    }
    // Ativos (com parcelas futuras) primeiro; depois os concluídos
    return result.sort((a, b) => Number(a.done) - Number(b.done) || (a.nextDue ?? "").localeCompare(b.nextDue ?? ""));
  }, [parcelas]);

  const removePlan = async (groupId: string, desc: string) => {
    if (!confirm(`Excluir o parcelamento "${desc}" e todas as suas parcelas?`)) return;
    const { error } = await supabase.from("transactions").delete().eq("installment_group_id", groupId);
    if (error) { toast.error(error.message); return; }
    toast.success("Parcelamento excluído");
    setParcelas((p) => p.filter((x) => x.installment_group_id !== groupId));
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Parcelados</h1>
          <p className="text-muted-foreground mt-1">Acompanhe suas compras parceladas</p>
        </div>
        <Button asChild className="bg-gradient-primary text-primary-foreground shadow-glow">
          <Link to="/add">Novo parcelado</Link>
        </Button>
      </header>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      ) : plans.length === 0 ? (
        <div className="bg-gradient-card border border-border rounded-2xl p-12 text-center shadow-card">
          <Layers className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium text-lg">Nenhuma compra parcelada</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Em <Link to="/add" className="text-[color:var(--primary)] hover:underline">Adicionar</Link>, ative
            "Parcelado" ao registrar um gasto.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((p) => {
            const c = getCategory("expense", p.category);
            const Icon = c.icon;
            const pct = p.count > 0 ? (p.paid / p.count) * 100 : 0;
            return (
              <div key={p.groupId} className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card group">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `color-mix(in oklab, ${c.color} 20%, transparent)`, color: c.color }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{p.description}</p>
                      <button onClick={() => removePlan(p.groupId, p.description)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.count}× de {formatBRL(p.perInstallment)} · total {formatBRL(p.total)}
                      {p.done
                        ? " · concluído"
                        : p.nextDue && <> · próxima {formatDateBR(p.nextDue)}</>}
                    </p>

                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1.5 tabular-nums">
                        <span className="text-muted-foreground">{p.paid} de {p.count} pagas</span>
                        <span className={p.done ? "text-[color:var(--success)] font-medium" : "text-muted-foreground"}>
                          {p.done ? "quitado" : `faltam ${formatBRL(p.remainingAmount)}`}
                        </span>
                      </div>
                      <Progress value={pct} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
