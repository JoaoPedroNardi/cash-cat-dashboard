import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, getCategory } from "@/lib/categories";
import {
  ArrowDownRight, ArrowUpRight, PiggyBank, TrendingUp, Wallet, Calendar,
  Lightbulb, AlertTriangle, Sparkles, TrendingDown,
  Target, CreditCard, Repeat, ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, Legend,
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

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--popover-foreground)",
  fontSize: 12,
};

function Dashboard() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<30 | 90 | 180>(90);

  useEffect(() => {
    (async () => {
      const [tx, g, a, r] = await Promise.all([
        supabase.from("transactions").select("id,type,amount,category,description,occurred_at,account_id").order("occurred_at", { ascending: false }),
        supabase.from("goals").select("*").order("created_at", { ascending: false }),
        supabase.from("accounts").select("*").order("created_at", { ascending: true }),
        supabase.from("recurring_transactions").select("*").eq("active", true).order("next_run", { ascending: true }),
      ]);
      setTxs((tx.data ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) })));
      setGoals((g.data ?? []).map((x: any) => ({ ...x, target_amount: Number(x.target_amount), current_amount: Number(x.current_amount) })));
      setAccounts((a.data ?? []).map((x: any) => ({ ...x, initial_balance: Number(x.initial_balance) })));
      setRecurring((r.data ?? []).map((x: any) => ({ ...x, amount: Number(x.amount) })));
      setLoading(false);
    })();
  }, []);

  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, a.initial_balance);
    for (const t of txs as any[]) {
      if (!t.account_id || !map.has(t.account_id)) continue;
      map.set(t.account_id, (map.get(t.account_id) ?? 0) + (t.type === "income" ? t.amount : -t.amount));
    }
    return map;
  }, [accounts, txs]);

  const stats = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - range);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const monthKey = now.toISOString().slice(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = prevDate.toISOString().slice(0, 7);

    let inc = 0, exp = 0, monthInc = 0, monthExp = 0, prevInc = 0, prevExp = 0;
    const cats = new Map<string, number>();
    const months = new Map<string, { income: number; expense: number }>();
    const daily = new Map<string, { income: number; expense: number }>();
    const monthCats = new Map<string, number>();
    const prevMonthCats = new Map<string, number>();

    for (const t of txs) {
      if (t.occurred_at >= cutoffStr) {
        if (t.type === "income") inc += t.amount;
        else { exp += t.amount; cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount); }
        const cur = daily.get(t.occurred_at) ?? { income: 0, expense: 0 };
        cur[t.type] += t.amount;
        daily.set(t.occurred_at, cur);
      }
      const m = t.occurred_at.slice(0, 7);
      if (m === monthKey) {
        if (t.type === "income") monthInc += t.amount;
        else { monthExp += t.amount; monthCats.set(t.category, (monthCats.get(t.category) ?? 0) + t.amount); }
      }
      if (m === prevKey) {
        if (t.type === "income") prevInc += t.amount;
        else { prevExp += t.amount; prevMonthCats.set(t.category, (prevMonthCats.get(t.category) ?? 0) + t.amount); }
      }
      const mc = months.get(m) ?? { income: 0, expense: 0 };
      mc[t.type] += t.amount;
      months.set(m, mc);
    }

    const byCat = Array.from(cats.entries()).map(([id, value]) => {
      const c = getCategory("expense", id);
      return { id, name: c.label, value, color: c.color };
    }).sort((a, b) => b.value - a.value);

    const byMonth = Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([m, v]) => ({
        month: new Date(m + "-02").toLocaleDateString("pt-BR", { month: "short" }),
        income: v.income,
        expense: v.expense,
        balance: v.income - v.expense,
      }));

    // Cumulative balance evolution
    const sortedDays = Array.from(daily.keys()).sort();
    let acc = 0;
    const evolution = sortedDays.map((d) => {
      const v = daily.get(d)!;
      acc += v.income - v.expense;
      return {
        date: new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        saldo: Math.round(acc * 100) / 100,
        income: v.income,
        expense: v.expense,
      };
    });

    const balance = inc - exp;
    const savingsRate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
    const monthBalance = monthInc - monthExp;
    const prevBalance = prevInc - prevExp;
    const monthVar = prevBalance !== 0
      ? Math.round(((monthBalance - prevBalance) / Math.abs(prevBalance)) * 100)
      : null;

    // Insights
    type Insight = { kind: "good" | "warn" | "info"; icon: any; text: string };
    const insights: Insight[] = [];

    // Maior categoria
    if (byCat[0]) {
      insights.push({
        kind: "info", icon: Sparkles,
        text: `${byCat[0].name} é sua maior categoria (${formatBRL(byCat[0].value)}).`,
      });
    }

    // Variação por categoria mês x mês anterior
    let biggestVar: { name: string; pct: number } | null = null;
    for (const [id, v] of monthCats.entries()) {
      const p = prevMonthCats.get(id) ?? 0;
      if (p <= 0) continue;
      const pct = Math.round(((v - p) / p) * 100);
      if (Math.abs(pct) >= 15 && (!biggestVar || Math.abs(pct) > Math.abs(biggestVar.pct))) {
        biggestVar = { name: getCategory("expense", id).label, pct };
      }
    }
    if (biggestVar) {
      insights.push({
        kind: biggestVar.pct > 0 ? "warn" : "good",
        icon: biggestVar.pct > 0 ? AlertTriangle : TrendingDown,
        text: `Você ${biggestVar.pct > 0 ? "gastou" : "gastou menos"} ${Math.abs(biggestVar.pct)}% ${biggestVar.pct > 0 ? "a mais" : ""} em ${biggestVar.name} esse mês vs o anterior.`,
      });
    }

    // Tendência últimos 3 meses
    const last3 = Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-3);
    if (last3.length === 3) {
      const balances = last3.map(([, v]) => v.income - v.expense);
      const trendDown = balances[0] > balances[1] && balances[1] > balances[2];
      const trendUp = balances[0] < balances[1] && balances[1] < balances[2];
      if (trendDown) insights.push({ kind: "warn", icon: TrendingDown, text: "Seu saldo vem caindo nos últimos 3 meses." });
      else if (trendUp) insights.push({ kind: "good", icon: TrendingUp, text: "Seu saldo vem subindo nos últimos 3 meses 🎉" });
    }

    // Ritmo do mês
    if (monthInc > 0 && monthExp > monthInc) {
      insights.push({ kind: "warn", icon: AlertTriangle, text: `Você já gastou ${formatBRL(monthExp - monthInc)} a mais do que ganhou esse mês.` });
    } else if (savingsRate >= 30) {
      insights.push({ kind: "good", icon: PiggyBank, text: `Excelente! Você está economizando ${savingsRate}% no período.` });
    }

    return {
      income: inc, expense: exp, balance, savingsRate,
      monthInc, monthExp, monthBalance, monthVar,
      byCat, byMonth, evolution, insights,
    };
  }, [txs, range]);

  const maxCat = stats.byCat[0]?.value ?? 0;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Visão geral</h1>
          <p className="text-muted-foreground mt-1">Resumo das suas finanças pessoais</p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          {[30, 90, 180].map((d) => (
            <button
              key={d}
              onClick={() => setRange(d as 30 | 90 | 180)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                range === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Saldo do período" value={formatBRL(stats.balance)}
          icon={<Wallet className="h-5 w-5" />} highlight />
        <StatCard label="Ganhos" value={formatBRL(stats.income)}
          icon={<ArrowUpRight className="h-5 w-5" />} accent="success" />
        <StatCard label="Gastos" value={formatBRL(stats.expense)}
          icon={<ArrowDownRight className="h-5 w-5" />} accent="destructive" />
        <StatCard label="Taxa de economia" value={`${stats.savingsRate}%`}
          icon={<PiggyBank className="h-5 w-5" />} accent="primary"
          sub={stats.savingsRate >= 20 ? "Ótimo ritmo" : stats.savingsRate >= 0 ? "Tudo certo" : "Atenção"} />
      </div>

      {/* Month summary */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <MiniCard label="Ganhos do mês" value={formatBRL(stats.monthInc)} tone="success" />
        <MiniCard label="Gastos do mês" value={formatBRL(stats.monthExp)} tone="destructive" />
        <MiniCard
          label="Saldo do mês"
          value={formatBRL(stats.monthBalance)}
          tone={stats.monthBalance >= 0 ? "success" : "destructive"}
          trend={stats.monthVar}
        />
      </div>

      {/* Insights */}
      {stats.insights.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-[color:var(--primary)]" />
            <h2 className="text-sm font-medium text-muted-foreground">Insights</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {stats.insights.map((ins, i) => {
              const Icon = ins.icon;
              const tone = ins.kind === "good" ? "var(--success)"
                : ins.kind === "warn" ? "var(--destructive)" : "var(--primary)";
              return (
                <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-gradient-card p-4 shadow-card">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `color-mix(in oklab, ${tone} 18%, transparent)`, color: tone }}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm leading-relaxed">{ins.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Evolution area chart - large */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Evolução do saldo</h3>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Últimos {range} dias
              </span>
            </div>
            <div className="h-72">
              <ResponsiveContainer>
                <AreaChart data={stats.evolution}>
                  <defs>
                    <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11}
                    tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
                  <Area type="monotone" dataKey="saldo" stroke="var(--primary)" strokeWidth={2}
                    fill="url(#gradSaldo)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie - categories */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
            <h3 className="font-medium mb-4">Gastos por categoria</h3>
            {stats.byCat.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gasto no período.</p>
            ) : (
              <>
                <div className="h-56">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={stats.byCat} dataKey="value" nameKey="name"
                        innerRadius={50} outerRadius={85} paddingAngle={2}>
                        {stats.byCat.map((c, i) => <Cell key={i} fill={c.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {stats.byCat.slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="font-medium tabular-nums">{formatBRL(c.value)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Income vs Expense bars */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card lg:col-span-2">
            <h3 className="font-medium mb-4">Ganhos vs Gastos por mês</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={stats.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12}
                    tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name="Ganhos" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" name="Gastos" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top categories progress */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
            <h3 className="font-medium mb-4">Top categorias</h3>
            {stats.byCat.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <ul className="space-y-4">
                {stats.byCat.slice(0, 5).map((c) => {
                  const pct = maxCat > 0 ? (c.value / maxCat) * 100 : 0;
                  return (
                    <li key={c.id}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="truncate">{c.name}</span>
                        <span className="font-medium tabular-nums">{formatBRL(c.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: c.color }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Recent transactions */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card lg:col-span-3">
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
                    <span className={`font-semibold tabular-nums ${t.type === "income" ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}>
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
  label, value, icon, accent = "primary", highlight, sub,
}: {
  label: string; value: string; icon: React.ReactNode;
  accent?: "primary" | "success" | "destructive"; highlight?: boolean; sub?: string;
}) {
  const tone =
    accent === "destructive" ? "var(--destructive)" :
    accent === "success" ? "var(--success)" : "var(--primary)";
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border p-6 shadow-card ${highlight ? "bg-gradient-primary text-primary-foreground" : "bg-gradient-card"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</span>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${highlight ? "bg-primary-foreground/15" : ""}`}
          style={!highlight ? { background: `color-mix(in oklab, ${tone} 18%, transparent)`, color: tone } : undefined}>
          {icon}
        </div>
      </div>
      <p className="text-2xl md:text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && (
        <p className={`text-xs mt-1 ${highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{sub}</p>
      )}
    </div>
  );
}

function MiniCard({
  label, value, tone, trend,
}: { label: string; value: string; tone: "success" | "destructive"; trend?: number | null }) {
  const color = tone === "success" ? "var(--success)" : "var(--destructive)";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color }}>{value}</p>
      </div>
      {trend !== undefined && trend !== null && (
        <span className={`text-xs px-2 py-1 rounded-md font-medium ${trend >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}
          style={{ background: `color-mix(in oklab, ${trend >= 0 ? "var(--success)" : "var(--destructive)"} 14%, transparent)` }}>
          {trend >= 0 ? "+" : ""}{trend}%
        </span>
      )}
    </div>
  );
}
