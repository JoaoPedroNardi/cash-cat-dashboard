import { createFileRoute, Link } from "@tanstack/react-router";
import { useMonthlyFilter } from "@/hooks/use-monthly-filter";
import { PeriodSelector } from "@/components/ui/period-selector";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, getCategory } from "@/lib/categories";
import { tooltipStyle } from "@/lib/tooltip-style";
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
  account_id: string | null;
}

/** Data local no formato YYYY-MM-DD (sem deslocamento de fuso do toISOString). */
function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Dashboard() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { filter, setPeriod, setMonth } = useMonthlyFilter();

  // Busca TODAS as transações uma única vez. Cada métrica escolhe sua própria
  // janela de tempo no cliente — assim "patrimônio" é sempre de todos os tempos
  // e o período selecionado nunca conflita com outros cálculos.
  useEffect(() => {
    (async () => {
      const [tx, g, a, r] = await Promise.all([
        supabase
          .from("transactions")
          .select("id,type,amount,category,description,occurred_at,account_id")
          .order("occurred_at", { ascending: false }),
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

  // ─── Patrimônio líquido: SEMPRE de todos os tempos (não depende do filtro) ───
  const netWorth = useMemo(() => {
    const initial = accounts.reduce((s, a) => s + Number(a.initial_balance), 0);
    const byDay = new Map<string, number>();
    for (const t of txs) {
      const v = t.type === "income" ? t.amount : -t.amount;
      byDay.set(t.occurred_at, (byDay.get(t.occurred_at) ?? 0) + v);
    }
    const days = Array.from(byDay.keys()).sort();
    let acc = initial;
    const series = days.map((d) => {
      acc += byDay.get(d)!;
      return {
        date: new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        value: Math.round(acc * 100) / 100,
      };
    });
    if (series.length === 0) series.push({ date: "Hoje", value: initial });
    return { current: acc, series };
  }, [accounts, txs]);

  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, a.initial_balance);
    for (const t of txs) {
      if (!t.account_id || !map.has(t.account_id)) continue;
      map.set(t.account_id, (map.get(t.account_id) ?? 0) + (t.type === "income" ? t.amount : -t.amount));
    }
    return map;
  }, [accounts, txs]);

  // ─── Tudo que segue depende do período selecionado ───
  const stats = useMemo(() => {
    const startStr = toYMD(filter.dateRange.startDate);
    const endStr = toYMD(filter.dateRange.endDate);

    // Período anterior de mesmo tamanho, para comparação de tendência.
    const lenMs = filter.dateRange.endDate.getTime() - filter.dateRange.startDate.getTime();
    const prevEnd = new Date(filter.dateRange.startDate.getTime() - 1);
    const prevStart = new Date(filter.dateRange.startDate.getTime() - lenMs);
    const prevStartStr = toYMD(prevStart);
    const prevEndStr = toYMD(prevEnd);
    // 'all' começa no ano 2000 — comparar com o "período anterior" não faz sentido.
    const canCompare = filter.period !== "all";

    const periodTxs = txs.filter((t) => t.occurred_at >= startStr && t.occurred_at <= endStr);

    let inc = 0, exp = 0, prevInc = 0, prevExp = 0;
    const cats = new Map<string, number>();
    const months = new Map<string, { income: number; expense: number }>();
    const daily = new Map<string, { income: number; expense: number }>();

    for (const t of periodTxs) {
      if (t.type === "income") inc += t.amount;
      else { exp += t.amount; cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount); }
      const cur = daily.get(t.occurred_at) ?? { income: 0, expense: 0 };
      cur[t.type] += t.amount;
      daily.set(t.occurred_at, cur);
      const m = t.occurred_at.slice(0, 7);
      const mc = months.get(m) ?? { income: 0, expense: 0 };
      mc[t.type] += t.amount;
      months.set(m, mc);
    }

    if (canCompare) {
      for (const t of txs) {
        if (t.occurred_at < prevStartStr || t.occurred_at > prevEndStr) continue;
        if (t.type === "income") prevInc += t.amount;
        else prevExp += t.amount;
      }
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
      }));

    // Evolução acumulada do saldo dentro do período
    const sortedDays = Array.from(daily.keys()).sort();
    let acc = 0;
    const evolution = sortedDays.map((d) => {
      const v = daily.get(d)!;
      acc += v.income - v.expense;
      return {
        date: new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        saldo: Math.round(acc * 100) / 100,
      };
    });

    const balance = inc - exp;
    const savingsRate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
    const prevBalance = prevInc - prevExp;
    const balanceTrend = canCompare && prevBalance !== 0
      ? Math.round(((balance - prevBalance) / Math.abs(prevBalance)) * 100)
      : null;

    // ─── Insights (sempre relativos ao período) ───
    type Insight = { kind: "good" | "warn" | "info"; icon: any; text: string };
    const insights: Insight[] = [];

    if (byCat[0]) {
      insights.push({
        kind: "info", icon: Sparkles,
        text: `${byCat[0].name} é sua maior categoria de gasto (${formatBRL(byCat[0].value)}).`,
      });
    }

    if (exp > inc && inc > 0) {
      insights.push({
        kind: "warn", icon: AlertTriangle,
        text: `Você gastou ${formatBRL(exp - inc)} a mais do que ganhou no período.`,
      });
    } else if (savingsRate >= 30) {
      insights.push({
        kind: "good", icon: PiggyBank,
        text: `Excelente! Você economizou ${savingsRate}% do que ganhou no período.`,
      });
    }

    if (balanceTrend !== null && Math.abs(balanceTrend) >= 10) {
      insights.push({
        kind: balanceTrend > 0 ? "good" : "warn",
        icon: balanceTrend > 0 ? TrendingUp : TrendingDown,
        text: `Seu saldo ${balanceTrend > 0 ? "subiu" : "caiu"} ${Math.abs(balanceTrend)}% em relação ao período anterior.`,
      });
    }

    return {
      income: inc, expense: exp, balance, savingsRate, balanceTrend,
      byCat, byMonth, evolution, insights,
      hasData: periodTxs.length > 0,
      multiMonth: months.size > 1,
    };
  }, [txs, filter]);

  const maxCat = stats.byCat[0]?.value ?? 0;

  const periodLabel =
    filter.period === "specific" && filter.selectedMonth
      ? new Date(filter.selectedMonth).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : filter.period === "year" ? "Este ano"
      : filter.period === "12months" ? "Últimos 12 meses"
      : "Todos os meses";

  if (loading) {
    return (
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <p className="text-muted-foreground text-center py-24">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-muted-foreground mt-1">Resumo das suas finanças pessoais</p>
      </header>

      {/* ── Patrimônio líquido — número-herói, sempre de todos os tempos ── */}
      <div className="bg-gradient-primary text-primary-foreground rounded-2xl p-6 md:p-8 shadow-card mb-8">
        <div className="flex items-end justify-between flex-wrap gap-2 mb-4">
          <div>
            <p className="text-sm text-primary-foreground/80 flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Patrimônio líquido
            </p>
            <p className="text-3xl md:text-5xl font-semibold tabular-nums mt-1">
              {formatBRL(netWorth.current)}
            </p>
          </div>
          <span className="text-xs text-primary-foreground/70">Soma de todas as contas · atualizado em tempo real</span>
        </div>
        {accounts.length > 0 && (
          <div className="h-40">
            <ResponsiveContainer>
              <AreaChart data={netWorth.series}>
                <defs>
                  <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="currentColor" opacity={0.6} fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
                <Area type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2} fill="url(#gradNet)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Análise por período ── */}
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="h-4 w-4 text-[color:var(--primary)]" />
        <h2 className="text-sm font-medium text-muted-foreground">Análise por período</h2>
      </div>

      <PeriodSelector
        period={filter.period}
        selectedMonth={filter.selectedMonth}
        onPeriodChange={setPeriod}
        onMonthChange={setMonth}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Saldo do período" value={formatBRL(stats.balance)}
          icon={<Wallet className="h-5 w-5" />} highlight trend={stats.balanceTrend} />
        <StatCard label="Ganhos" value={formatBRL(stats.income)}
          icon={<ArrowUpRight className="h-5 w-5" />} accent="success" />
        <StatCard label="Gastos" value={formatBRL(stats.expense)}
          icon={<ArrowDownRight className="h-5 w-5" />} accent="destructive" />
        <StatCard label="Taxa de economia" value={`${stats.savingsRate}%`}
          icon={<PiggyBank className="h-5 w-5" />} accent="primary"
          sub={stats.savingsRate >= 20 ? "Ótimo ritmo" : stats.savingsRate >= 0 ? "Tudo certo" : "Atenção"} />
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

      {!stats.hasData ? (
        <div className="bg-gradient-card border border-border rounded-2xl p-12 text-center shadow-card mb-8">
          <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium text-lg">Sem transações em {periodLabel.toLowerCase()}</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Escolha outro período acima ou{" "}
            <Link to="/add" className="text-[color:var(--primary)] hover:underline">adicione uma transação</Link>.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          {/* Evolução do saldo */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Evolução do saldo</h3>
              <span className="text-xs text-muted-foreground flex items-center gap-1 capitalize">
                <Calendar className="h-3.5 w-3.5" /> {periodLabel}
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

          {/* Gastos por categoria (pizza + lista) */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
            <h3 className="font-medium mb-4">Gastos por categoria</h3>
            {stats.byCat.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gasto no período.</p>
            ) : (
              <>
                <div className="h-48">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={stats.byCat} dataKey="value" nameKey="name"
                        innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {stats.byCat.map((c, i) => <Cell key={i} fill={c.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-4 space-y-3">
                  {stats.byCat.slice(0, 5).map((c) => {
                    const pct = maxCat > 0 ? (c.value / maxCat) * 100 : 0;
                    return (
                      <li key={c.id}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="flex items-center gap-2 truncate">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                            <span className="truncate">{c.name}</span>
                          </span>
                          <span className="font-medium tabular-nums">{formatBRL(c.value)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {/* Ganhos vs Gastos por mês — só faz sentido com mais de um mês */}
          {stats.multiMonth && (
            <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card lg:col-span-3">
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
          )}

          {/* Transações recentes do período */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Transações recentes</h3>
              <Link to="/transactions" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {txs
                .filter((t) => t.occurred_at >= toYMD(filter.dateRange.startDate) && t.occurred_at <= toYMD(filter.dateRange.endDate))
                .slice(0, 8)
                .map((t) => {
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
                          {c.label} • {new Date(t.occurred_at + "T00:00:00").toLocaleDateString("pt-BR")}
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

      {/* ── Atalhos: Metas, Contas, Recorrentes (independentes do período) ── */}
      <div className="grid gap-4 md:grid-cols-3">
        <SectionCard title="Metas" icon={<Target className="h-4 w-4" />} to="/goals" empty={goals.length === 0} emptyText="Crie sua primeira meta">
          <ul className="space-y-3">
            {goals.slice(0, 3).map((g) => {
              const pct = Math.min(100, (g.current_amount / g.target_amount) * 100);
              return (
                <li key={g.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="truncate">{g.name}</span>
                    <span className="font-medium tabular-nums" style={{ color: g.color }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: g.color }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard title="Contas" icon={<CreditCard className="h-4 w-4" />} to="/accounts" empty={accounts.length === 0} emptyText="Adicione uma conta">
          <ul className="space-y-2.5">
            {accounts.slice(0, 4).map((a) => {
              const bal = accountBalances.get(a.id) ?? a.initial_balance;
              return (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                    <span className="truncate">{a.name}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatBRL(bal)}</span>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard title="Próximas recorrentes" icon={<Repeat className="h-4 w-4" />} to="/recurring" empty={recurring.length === 0} emptyText="Sem recorrências ativas">
          <ul className="space-y-2.5">
            {recurring.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate">
                  <span className="block truncate">{r.description || getCategory(r.type, r.category).label}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.next_run + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                </span>
                <span className={`font-medium tabular-nums shrink-0 ${r.type === "income" ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}>
                  {r.type === "income" ? "+" : "−"}{formatBRL(r.amount)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function StatCard({
  label, value, icon, accent = "primary", highlight, sub, trend,
}: {
  label: string; value: string; icon: React.ReactNode;
  accent?: "primary" | "success" | "destructive"; highlight?: boolean; sub?: string;
  trend?: number | null;
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
      {trend !== undefined && trend !== null && (
        <p className={`text-xs mt-1 ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs período anterior
        </p>
      )}
      {sub && (
        <p className={`text-xs mt-1 ${highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{sub}</p>
      )}
    </div>
  );
}

function SectionCard({
  title, icon, to, empty, emptyText, children,
}: {
  title: string; icon: React.ReactNode; to: string;
  empty: boolean; emptyText: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
          {title}
        </div>
        <Link to={to} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          Ver <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground py-4 text-center flex-1">{emptyText}</p>
      ) : (
        <div className="flex-1">{children}</div>
      )}
    </div>
  );
}
