import { createFileRoute, Link } from "@tanstack/react-router";
import { startOfMonth, addMonths, subMonths } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, getCategory } from "@/lib/categories";
import { tooltipStyle } from "@/lib/tooltip-style";
import {
  ArrowDownRight, ArrowUpRight, PiggyBank, TrendingUp, Wallet, Calendar,
  Lightbulb, AlertTriangle, Sparkles, TrendingDown, ChevronLeft, ChevronRight,
  Target, CreditCard, Repeat, ArrowRight, Coins,
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

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "YYYY-MM" do mês de uma data, em horário local. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Dashboard() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Mês em foco — começa no mês atual.
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));

  // Busca TODAS as transações uma vez. O "saldo total" precisa de tudo;
  // os cards do mês apenas filtram o mês escolhido no cliente.
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

  // ── Saldo total: o que sobrou de TODOS os meses, somando (todos os tempos) ──
  const total = useMemo(() => {
    const byMonthNet = new Map<string, number>();
    let saldo = 0;
    const sorted = [...txs].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    for (const t of sorted) {
      const v = t.type === "income" ? t.amount : -t.amount;
      saldo += v;
      const mk = t.occurred_at.slice(0, 7);
      byMonthNet.set(mk, (byMonthNet.get(mk) ?? 0) + v);
    }
    // Série mensal acumulada (mostra o total "subindo" mês a mês)
    const keys = Array.from(byMonthNet.keys()).sort();
    let acc = 0;
    const series = keys.map((k) => {
      acc += byMonthNet.get(k)!;
      const [y, m] = k.split("-");
      return { label: `${MONTHS_PT[Number(m) - 1].slice(0, 3)}/${y.slice(2)}`, value: Math.round(acc * 100) / 100 };
    });
    return { saldo, series };
  }, [txs]);

  // ── Números do mês em foco ──
  const mStats = useMemo(() => {
    const mk = monthKey(month);
    const prevMk = monthKey(subMonths(month, 1));
    const monthTxs = txs.filter((t) => t.occurred_at.slice(0, 7) === mk);

    let inc = 0, exp = 0, prevInc = 0, prevExp = 0;
    const cats = new Map<string, number>();
    for (const t of monthTxs) {
      if (t.type === "income") inc += t.amount;
      else { exp += t.amount; cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount); }
    }
    for (const t of txs) {
      if (t.occurred_at.slice(0, 7) !== prevMk) continue;
      if (t.type === "income") prevInc += t.amount;
      else prevExp += t.amount;
    }

    const available = inc - exp;
    const prevAvailable = prevInc - prevExp;
    const availableTrend = prevAvailable !== 0
      ? Math.round(((available - prevAvailable) / Math.abs(prevAvailable)) * 100)
      : null;

    const byCat = Array.from(cats.entries()).map(([id, value]) => {
      const c = getCategory("expense", id);
      return { id, name: c.label, value, color: c.color };
    }).sort((a, b) => b.value - a.value);

    // Insights do mês
    type Insight = { kind: "good" | "warn" | "info"; icon: any; text: string };
    const insights: Insight[] = [];
    if (byCat[0]) {
      insights.push({ kind: "info", icon: Sparkles, text: `${byCat[0].name} foi seu maior gasto do mês (${formatBRL(byCat[0].value)}).` });
    }
    if (exp > inc && inc > 0) {
      insights.push({ kind: "warn", icon: AlertTriangle, text: `Você gastou ${formatBRL(exp - inc)} a mais do que ganhou neste mês.` });
    } else if (inc > 0 && available / inc >= 0.3) {
      insights.push({ kind: "good", icon: PiggyBank, text: `Você guardou ${Math.round((available / inc) * 100)}% do que ganhou neste mês.` });
    }
    if (availableTrend !== null && Math.abs(availableTrend) >= 10) {
      insights.push({
        kind: availableTrend > 0 ? "good" : "warn",
        icon: availableTrend > 0 ? TrendingUp : TrendingDown,
        text: `O que sobrou ${availableTrend > 0 ? "aumentou" : "diminuiu"} ${Math.abs(availableTrend)}% em relação ao mês anterior.`,
      });
    }

    return { inc, exp, available, availableTrend, byCat, insights, count: monthTxs.length, monthTxs };
  }, [txs, month]);

  // Barras: ganhos vs gastos dos últimos 6 meses
  const last6 = useMemo(() => {
    const acc = new Map<string, { income: number; expense: number }>();
    for (const t of txs) {
      const mk = t.occurred_at.slice(0, 7);
      const cur = acc.get(mk) ?? { income: 0, expense: 0 };
      cur[t.type] += t.amount;
      acc.set(mk, cur);
    }
    return Array.from(acc.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([k, v]) => ({ month: MONTHS_PT[Number(k.split("-")[1]) - 1].slice(0, 3), income: v.income, expense: v.expense }));
  }, [txs]);

  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, a.initial_balance);
    for (const t of txs) {
      if (!t.account_id || !map.has(t.account_id)) continue;
      map.set(t.account_id, (map.get(t.account_id) ?? 0) + (t.type === "income" ? t.amount : -t.amount));
    }
    return map;
  }, [accounts, txs]);

  const maxCat = mStats.byCat[0]?.value ?? 0;
  const isCurrentMonth = monthKey(month) === monthKey(new Date());
  const monthLabel = `${MONTHS_PT[month.getMonth()]} de ${month.getFullYear()}`;

  if (loading) {
    return (
      <div className="p-6 md:p-10 max-w-6xl mx-auto">
        <p className="text-muted-foreground text-center py-24">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-muted-foreground mt-1">Resumo das suas finanças pessoais</p>
      </header>

      {/* ── Saldo total — tudo que sobrou, de todos os meses ── */}
      <div className="bg-gradient-primary text-primary-foreground rounded-2xl p-6 md:p-8 shadow-card mb-8">
        <div className="flex items-end justify-between flex-wrap gap-2 mb-3">
          <div>
            <p className="text-sm text-primary-foreground/80 flex items-center gap-1.5">
              <Coins className="h-4 w-4" /> Saldo total
            </p>
            <p className="text-4xl md:text-5xl font-semibold tabular-nums mt-1">
              {formatBRL(total.saldo)}
            </p>
          </div>
          <span className="text-xs text-primary-foreground/70 max-w-[14rem] text-right">
            Tudo que você ganhou menos tudo que gastou, somando todos os meses
          </span>
        </div>
        {total.series.length > 1 && (
          <div className="h-32">
            <ResponsiveContainer>
              <AreaChart data={total.series}>
                <defs>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" stroke="currentColor" opacity={0.6} fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
                <Area type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2} fill="url(#gradTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Navegador de mês ── */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[color:var(--primary)]" />
          <h2 className="text-base font-medium capitalize">{monthLabel}</h2>
        </div>
        <div className="flex items-center gap-1">
          {!isCurrentMonth && (
            <button onClick={() => setMonth(startOfMonth(new Date()))}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
              Mês atual
            </button>
          )}
          <button onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}
            className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
            disabled={isCurrentMonth}
            className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Os 3 números do mês ── */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <StatCard label="Ganhei no mês" value={formatBRL(mStats.inc)}
          icon={<ArrowUpRight className="h-5 w-5" />} accent="success" />
        <StatCard label="Gastei no mês" value={formatBRL(mStats.exp)}
          icon={<ArrowDownRight className="h-5 w-5" />} accent="destructive" />
        <StatCard label="Disponível para gastar" value={formatBRL(mStats.available)}
          icon={<Wallet className="h-5 w-5" />} highlight
          trend={mStats.availableTrend}
          sub={mStats.available >= 0 ? "Sobrou esse valor no mês" : "Você gastou mais do que ganhou"} />
      </div>

      {/* Insights do mês */}
      {mStats.insights.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-[color:var(--primary)]" />
            <h2 className="text-sm font-medium text-muted-foreground">Insights do mês</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {mStats.insights.map((ins, i) => {
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

      {mStats.count === 0 ? (
        <div className="bg-gradient-card border border-border rounded-2xl p-12 text-center shadow-card mb-8">
          <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium text-lg">Nenhuma transação em {monthLabel}</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Use as setas acima para ver outro mês ou{" "}
            <Link to="/add" className="text-[color:var(--primary)] hover:underline">adicione uma transação</Link>.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          {/* Gastos por categoria do mês */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
            <h3 className="font-medium mb-4">Gastos por categoria</h3>
            {mStats.byCat.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gasto neste mês.</p>
            ) : (
              <>
                <div className="h-44">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={mStats.byCat} dataKey="value" nameKey="name"
                        innerRadius={48} outerRadius={78} paddingAngle={2}>
                        {mStats.byCat.map((c, i) => <Cell key={i} fill={c.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-4 space-y-3">
                  {mStats.byCat.slice(0, 5).map((c) => {
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

          {/* Ganhos vs Gastos — últimos 6 meses */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card lg:col-span-2">
            <h3 className="font-medium mb-4">Ganhos vs Gastos — últimos 6 meses</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={last6}>
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

          {/* Transações do mês */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Transações de {monthLabel}</h3>
              <Link to="/transactions" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {mStats.monthTxs.slice(0, 8).map((t) => {
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

      {/* ── Atalhos ── */}
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
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs mês anterior
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
