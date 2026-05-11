import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_CATEGORIES, formatBRL, getCategory } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({ meta: [{ title: "Orçamentos — Finança" }] }),
  component: BudgetsPage,
});

interface Budget { id: string; category: string; amount: number; }

function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spent, setSpent] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const start = new Date(); start.setDate(1);
    const startStr = start.toISOString().slice(0, 10);

    const [{ data: bs }, { data: txs }] = await Promise.all([
      supabase.from("budgets").select("id,category,amount"),
      supabase.from("transactions").select("category,amount").eq("type", "expense").gte("occurred_at", startStr),
    ]);

    const list = (bs ?? []).map((b: any) => ({ ...b, amount: Number(b.amount) }));
    setBudgets(list);
    const map: Record<string, number> = {};
    (txs ?? []).forEach((t: any) => {
      map[t.category] = (map[t.category] ?? 0) + Number(t.amount);
    });
    setSpent(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const byCat = useMemo(() => {
    const m: Record<string, Budget> = {};
    budgets.forEach((b) => { m[b.category] = b; });
    return m;
  }, [budgets]);

  const save = async (category: string) => {
    const raw = drafts[category];
    if (raw === undefined) return;
    const v = parseFloat(raw.replace(",", "."));
    if (isNaN(v) || v < 0) { toast.error("Valor inválido"); return; }
    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData.user?.id;
    if (!user_id) return;

    // Upsert: evita race condition entre SELECT e INSERT/UPDATE manual
    const { error } = await supabase
      .from("budgets")
      .upsert({ user_id, category, amount: v }, { onConflict: "user_id,category" });
    if (error) { toast.error(error.message); return; }
    toast.success("Orçamento salvo");
    setDrafts((d) => { const n = { ...d }; delete n[category]; return n; });
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("budgets").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido");
    load();
  };

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + (spent[b.category] ?? 0), 0);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Orçamentos</h1>
        <p className="text-muted-foreground mt-1">Limites mensais por categoria</p>
      </header>

      {totalBudget > 0 && (
        <div className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card mb-6">
          <div className="flex justify-between items-baseline mb-2">
            <p className="text-sm text-muted-foreground">Total do mês</p>
            <p className="font-semibold tabular-nums">
              {formatBRL(totalSpent)} <span className="text-muted-foreground">/ {formatBRL(totalBudget)}</span>
            </p>
          </div>
          <Progress value={Math.min(100, (totalSpent / totalBudget) * 100)} />
        </div>
      )}

      <div className="bg-gradient-card border border-border rounded-2xl shadow-card divide-y divide-border">
        {loading ? (
          <p className="text-muted-foreground text-center py-12">Carregando...</p>
        ) : (
          EXPENSE_CATEGORIES.map((c) => {
            const b = byCat[c.id];
            const used = spent[c.id] ?? 0;
            const limit = b?.amount ?? 0;
            const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
            const over = limit > 0 && used > limit;
            const Icon = c.icon;
            const draft = drafts[c.id] ?? (b ? String(b.amount) : "");

            return (
              <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 sm:w-48">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                    style={{ background: `color-mix(in oklab, ${c.color} 20%, transparent)`, color: c.color }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-medium">{c.label}</span>
                </div>

                <div className="flex-1 min-w-0">
                  {limit > 0 ? (
                    <>
                      <div className="flex justify-between text-xs mb-1.5 tabular-nums">
                        <span className={over ? "text-[color:var(--destructive)] font-semibold" : "text-muted-foreground"}>
                          {formatBRL(used)} / {formatBRL(limit)}
                        </span>
                        <span className={over ? "text-[color:var(--destructive)] font-semibold" : "text-muted-foreground"}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={pct} className={over ? "[&>div]:bg-[color:var(--destructive)]" : ""} />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem orçamento definido • gasto este mês: {formatBRL(used)}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:w-64">
                  <Input
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    className="w-32"
                  />
                  <Button size="sm" onClick={() => save(c.id)}>Salvar</Button>
                  {b && (
                    <Button size="icon" variant="ghost" onClick={() => remove(b.id)}
                      className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
