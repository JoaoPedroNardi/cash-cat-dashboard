import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, formatBRL, getCategory } from "@/lib/categories";
import { ArrowDownRight, ArrowUpRight, TrendingUp, Wallet } from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Geral — Finança" }] }),
  component: Dashboard,
});

interface Tx {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string | null;
  occurred_at: string;
}

function Dashboard() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id,type,amount,category,description,occurred_at")
        .order("occurred_at", { ascending: false });
      setTxs((data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })));
      setLoading(false);
    })();
  }, []);

  const { income, expense, balance, byCat, byMonth } = useMemo(() => {
    let inc = 0, exp = 0;
    const cats = new Map<string, number>();
    const months = new Map<string, { income: number; expense: number }>();
    for (const t of txs) {
      if (t.type === "income") inc += t.amount;
      else {
        exp += t.amount;
        cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
      }
      const m = t.occurred_at.slice(0, 7);
      const cur = months.get(m) ?? { income: 0, expense: 0 };
      cur[t.type] += t.amount;
      months.set(m, cur);
    }
    const byCat = Array.from(cats.entries()).map(([id, value]) => {
      const c = getCategory("expense", id);
      return { name: c.label, value, color: c.color };
    }).sort((a, b) => b.value - a.value);
    const byMonth = Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([m, v]) => ({
        month: new Date(m + "-02").toLocaleDateString("pt-BR", { month: "short" }),
        ...v,
      }));
    return { income: inc, expense: exp, balance: inc - exp, byCat, byMonth };
  }, [txs]);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-muted-foreground mt-1">Resumo das suas finanças pessoais</p>
      </header>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <StatCard label="Saldo" value={formatBRL(balance)}
          icon={<Wallet className="h-5 w-5" />} accent="primary"
          highlight />
        <StatCard label="Ganhos" value={formatBRL(income)}
          icon={<ArrowUpRight className="h-5 w-5" />} accent="success" />
        <StatCard label="Gastos" value={formatBRL(expense)}
          icon={<ArrowDownRight className="h-5 w-5" />} accent="destructive" />
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      ) : txs.length === 0 ? (
        <div className="bg-gradient-card border border-border rounded-2xl p-12 text-center shadow-card">
          <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium text-lg">Sem transações ainda</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Adicione seu primeiro gasto ou ganho para ver o painel ganhar vida.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
            <h3 className="font-medium mb-4">Gastos por categoria</h3>
            {byCat.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gasto registrado.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byCat} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {byCat.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                      formatter={(v: number) => formatBRL(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <ul className="mt-4 space-y-2">
              {byCat.slice(0, 5).map((c) => (
                <li key={c.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    {c.name}
                  </span>
                  <span className="font-medium">{formatBRL(c.value)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
            <h3 className="font-medium mb-4">Últimos meses</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                    formatter={(v: number) => formatBRL(v)}
                  />
                  <Bar dataKey="income" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card lg:col-span-2">
            <h3 className="font-medium mb-4">Transações recentes</h3>
            <ul className="divide-y divide-border">
              {txs.slice(0, 8).map((t) => {
                const c = getCategory(t.type, t.category);
                const Icon = c.icon;
                return (
                  <li key={t.id} className="flex items-center gap-4 py-3">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{ background: `color-mix(in oklab, ${c.color} 20%, transparent)`, color: c.color }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t.description || c.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.label} • {new Date(t.occurred_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <span className={`font-semibold ${t.type === "income" ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}>
                      {t.type === "income" ? "+" : "−"}{formatBRL(t.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, icon, accent, highlight,
}: { label: string; value: string; icon: React.ReactNode; accent: "primary" | "success" | "destructive"; highlight?: boolean }) {
  const tone = accent === "destructive" ? "var(--destructive)" : "var(--primary)";
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border p-6 shadow-card ${highlight ? "bg-gradient-primary text-primary-foreground" : "bg-gradient-card"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</span>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${highlight ? "bg-primary-foreground/15" : ""}`}
          style={!highlight ? { background: `color-mix(in oklab, ${tone} 18%, transparent)`, color: tone } : undefined}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
