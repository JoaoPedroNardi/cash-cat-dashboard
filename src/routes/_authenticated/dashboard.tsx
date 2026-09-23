import { createFileRoute, Link } from "@tanstack/react-router";
import { startOfMonth, addMonths, subMonths } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, getCategory } from "@/lib/categories";
import { tooltipStyle } from "@/lib/tooltip-style";
import {
  ArrowDownRight, ArrowUpRight, PiggyBank, TrendingUp, Wallet, Calendar,
  Lightbulb, AlertTriangle, Sparkles, TrendingDown, ChevronLeft, ChevronRight,
  Repeat, ArrowRight, Coins, Landmark, CreditCard, LineChart, Clock, ChevronDown,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, Legend, Tooltip,
} from "recharts";
import { todayYMD } from "@/lib/utils";
import { billingMonthKey, billingCycleRange } from "@/lib/billing";
import { useBillingClosingDay } from "@/hooks/use-billing-closing-day";

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

interface Account {
  id: string;
  name: string;
  type: string;
  color: string;
  initial_balance: number;
  credit_limit: number | null;
  synced_balance: number | null;
  institution_name: string | null;
  account_mask: string | null;
}

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "YYYY-MM" do mês de uma data, em horário local. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Agrupa transações de gasto por categoria, ordenado do maior pro menor. */
function groupByCategory(txs: Tx[]) {
  const cats = new Map<string, number>();
  for (const t of txs) cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
  return Array.from(cats.entries())
    .map(([id, value]) => {
      const c = getCategory("expense", id);
      return { id, name: c.label, value, color: c.color };
    })
    .sort((a, b) => b.value - a.value);
}

function Dashboard() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { day: closingDay } = useBillingClosingDay();
  // Fatura em foco — começa na fatura que contém o dia de hoje.
  const [month, setMonth] = useState<Date>(() => {
    const [y, m] = billingMonthKey(todayYMD(), closingDay).split("-").map(Number);
    return new Date(y, m - 1, 1);
  });

  // Busca TODAS as transações uma vez. O "saldo total" precisa de tudo;
  // os cards do mês apenas filtram o mês escolhido no cliente.
  useEffect(() => {
    (async () => {
      const [tx, a, r] = await Promise.all([
        supabase
          .from("transactions")
          .select("id,type,amount,category,description,occurred_at,account_id")
          .order("occurred_at", { ascending: false }),
        supabase.from("accounts").select("*").order("created_at", { ascending: true }),
        supabase.from("recurring_transactions").select("*").eq("active", true).order("next_run", { ascending: true }),
      ]);

      setTxs((tx.data ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) })));
      setAccounts((a.data ?? []).map((x: any) => ({
        ...x,
        initial_balance: Number(x.initial_balance),
        credit_limit: x.credit_limit == null ? null : Number(x.credit_limit),
        synced_balance: x.synced_balance == null ? null : Number(x.synced_balance),
      })));
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
      const mk = billingMonthKey(t.occurred_at, closingDay);
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
  }, [txs, closingDay]);

  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, a.initial_balance);
    for (const t of txs) {
      if (!t.account_id || !map.has(t.account_id)) continue;
      map.set(t.account_id, (map.get(t.account_id) ?? 0) + (t.type === "income" ? t.amount : -t.amount));
    }
    // Contas sincronizadas usam o saldo informado pelo banco (a soma das transações é parcial).
    for (const a of accounts) if (a.synced_balance != null) map.set(a.id, a.synced_balance);
    return map;
  }, [accounts, txs]);

  // ── Visão geral: contas bancárias agrupadas por instituição ──
  const bankGroups = useMemo(() => {
    const nonCredit = accounts.filter((a) => a.type !== "credit");
    const groups = new Map<string, { name: string; total: number; accounts: { id: string; name: string; balance: number; mask: string | null }[] }>();
    let grandTotal = 0;
    for (const a of nonCredit) {
      const key = a.institution_name ?? a.name;
      const bal = accountBalances.get(a.id) ?? a.initial_balance;
      const g = groups.get(key) ?? { name: key, total: 0, accounts: [] };
      g.total += bal;
      g.accounts.push({ id: a.id, name: a.name, balance: bal, mask: a.account_mask });
      groups.set(key, g);
      grandTotal += bal;
    }
    const list = Array.from(groups.values()).sort((a, b) => b.total - a.total);
    return { total: grandTotal, groups: list };
  }, [accounts, accountBalances]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (name: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  // ── Visão geral: cartões de crédito ──
  const creditSummary = useMemo(() => {
    const cards = accounts.filter((a) => a.type === "credit");
    let owed = 0, limit = 0;
    const items = cards.map((a) => {
      const bal = accountBalances.get(a.id) ?? a.initial_balance;
      owed += Math.max(0, -bal);
      if (a.credit_limit) limit += a.credit_limit;
      return { id: a.id, name: a.name, balance: bal, mask: a.account_mask };
    }).sort((a, b) => a.balance - b.balance);
    const pctUsed = limit > 0 ? Math.min(100, (owed / limit) * 100) : null;
    return { owed, limit, pctUsed, items };
  }, [accounts, accountBalances]);

  // ── Números do mês em foco ──
  const mStats = useMemo(() => {
    const mk = monthKey(month);
    const prevMk = monthKey(subMonths(month, 1));
    const monthTxs = txs.filter((t) => billingMonthKey(t.occurred_at, closingDay) === mk);

    let inc = 0, exp = 0, prevInc = 0, prevExp = 0;
    for (const t of monthTxs) {
      if (t.type === "income") inc += t.amount;
      else exp += t.amount;
    }
    for (const t of txs) {
      if (billingMonthKey(t.occurred_at, closingDay) !== prevMk) continue;
      if (t.type === "income") prevInc += t.amount;
      else prevExp += t.amount;
    }

    const available = inc - exp;
    const prevAvailable = prevInc - prevExp;
    const availableTrend = prevAvailable !== 0
      ? Math.round(((available - prevAvailable) / Math.abs(prevAvailable)) * 100)
      : null;

    const byCat = groupByCategory(monthTxs.filter((t) => t.type === "expense"));

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
  }, [txs, month, closingDay]);

  // ── Despesas futuras: gastos com data ainda não chegada (ex: parcelas futuras) ──
  const futureExpenses = useMemo(() => {
    const today = todayYMD();
    const future = txs.filter((t) => t.type === "expense" && t.occurred_at > today);
    const total = future.reduce((s, t) => s + t.amount, 0);
    return { total, byCat: groupByCategory(future), count: future.length };
  }, [txs]);

  // Barras: ganhos vs gastos dos últimos 6 meses
  const last6 = useMemo(() => {
    const acc = new Map<string, { income: number; expense: number }>();
    for (const t of txs) {
      const mk = billingMonthKey(t.occurred_at, closingDay);
      const cur = acc.get(mk) ?? { income: 0, expense: 0 };
      cur[t.type] += t.amount;
      acc.set(mk, cur);
    }
    return Array.from(acc.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([k, v]) => ({ month: MONTHS_PT[Number(k.split("-")[1]) - 1].slice(0, 3), income: v.income, expense: v.expense }));
  }, [txs, closingDay]);

  const maxCat = mStats.byCat[0]?.value ?? 0;
  const maxFutureCat = futureExpenses.byCat[0]?.value ?? 0;
  const isCurrentMonth = monthKey(month) === billingMonthKey(todayYMD(), closingDay);
  const monthLabel = `${MONTHS_PT[month.getMonth()]} de ${month.getFullYear()}`;
  const cycle = billingCycleRange(month.getFullYear(), month.getMonth() + 1, closingDay);
  const fmtDM = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const cycleLabel = `${fmtDM(cycle.start)} a ${fmtDM(cycle.end)}`;
  const goToCurrent = () => {
    const [y, m] = billingMonthKey(todayYMD(), closingDay).split("-").map(Number);
    setMonth(new Date(y, m - 1, 1));
  };

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

      {/* ── Visão geral: Contas / Cartões / Investimentos ── */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <OverviewCard icon={<Landmark className="h-4 w-4" />} label="Contas bancárias" value={formatBRL(bankGroups.total)}>
          {bankGroups.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nenhuma conta ainda.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {bankGroups.groups.map((g) => {
                const pct = bankGroups.total !== 0 ? (g.total / bankGroups.total) * 100 : 0;
                const open = expandedGroups.has(g.name);
                return (
                  <li key={g.name} className="py-2.5">
                    <button type="button" onClick={() => toggleGroup(g.name)}
                      className="w-full flex items-center justify-between text-sm text-left">
                      <span className="truncate">
                        <span className="block truncate">{g.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {g.accounts.length} conta{g.accounts.length > 1 ? "s" : ""} · {pct.toFixed(1)}%
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`font-medium tabular-nums ${g.total < 0 ? "text-[color:var(--destructive)]" : "text-[color:var(--success)]"}`}>
                          {formatBRL(g.total)}
                        </span>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                      </span>
                    </button>
                    {open && (
                      <ul className="mt-2 space-y-1.5 pl-3 border-l border-border">
                        {g.accounts.map((acc) => (
                          <li key={acc.id} className="flex items-center justify-between text-xs">
                            <span className="truncate text-muted-foreground">
                              {acc.name}{acc.mask ? ` · final ${acc.mask}` : ""}
                            </span>
                            <span className="tabular-nums shrink-0 ml-2">{formatBRL(acc.balance)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </OverviewCard>

        <OverviewCard icon={<CreditCard className="h-4 w-4" />} label="Cartões de crédito" value={formatBRL(creditSummary.owed)} valueTone="destructive">
          {creditSummary.pctUsed !== null && (
            <div className="mt-2 mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{creditSummary.pctUsed.toFixed(0)}% utilizado</span>
                <span>Limite: {formatBRL(creditSummary.limit)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-[color:var(--destructive)]" style={{ width: `${creditSummary.pctUsed}%` }} />
              </div>
            </div>
          )}
          {creditSummary.items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nenhum cartão ainda.</p>
          ) : (
            <ul className="space-y-2.5">
              {creditSummary.items.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">
                    <span className="block truncate">{c.name}</span>
                    {c.mask && <span className="text-xs text-muted-foreground">xxxx {c.mask}</span>}
                  </span>
                  <span className="font-medium tabular-nums text-[color:var(--destructive)] shrink-0 ml-2">{formatBRL(Math.max(0, -c.balance))}</span>
                </li>
              ))}
            </ul>
          )}
        </OverviewCard>

        <OverviewCard icon={<LineChart className="h-4 w-4" />} label="Investimentos" value="Em breve">
          <p className="text-sm text-muted-foreground py-2">
            Acompanhamento de ativos e carteira ainda não disponível — chegando em breve.
          </p>
        </OverviewCard>
      </div>

      {/* ── Evolução do saldo ── */}
      <div className="bg-gradient-primary text-primary-foreground rounded-2xl p-6 md:p-8 shadow-card mb-8">
        <div className="flex items-end justify-between flex-wrap gap-2 mb-3">
          <div>
            <p className="text-sm text-primary-foreground/80 flex items-center gap-1.5">
              <Coins className="h-4 w-4" /> Evolução do saldo
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

      {/* ── Navegador de fatura ── */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-[color:var(--primary)] shrink-0" />
          <div>
            <h2 className="text-base font-medium leading-tight">Fatura de {monthLabel}</h2>
            <p className="text-xs text-muted-foreground">{cycleLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isCurrentMonth && (
            <button onClick={goToCurrent}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
              Fatura atual
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

      {/* Despesas atuais e futuras */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
          <h3 className="font-medium mb-4">Despesas</h3>
          {mStats.byCat.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum gasto na fatura de {monthLabel}.</p>
          ) : (
            <ul className="space-y-3">
              {mStats.byCat.map((c) => {
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
          )}
        </div>

        <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">Despesas futuras</h3>
          </div>
          {futureExpenses.byCat.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma despesa futura agendada (ex: parcelas).</p>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums mb-4">{formatBRL(futureExpenses.total)}</p>
              <ul className="space-y-3">
                {futureExpenses.byCat.slice(0, 6).map((c) => {
                  const pct = maxFutureCat > 0 ? (c.value / maxFutureCat) * 100 : 0;
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
      </div>

      {mStats.count === 0 ? (
        <div className="bg-gradient-card border border-border rounded-2xl p-12 text-center shadow-card mb-8">
          <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium text-lg">Nenhuma transação na fatura de {monthLabel}</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Use as setas acima para ver outro mês ou{" "}
            <Link to="/add" className="text-[color:var(--primary)] hover:underline">adicione uma transação</Link>.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 mb-8">
          {/* Ganhos vs Gastos — últimos 6 meses */}
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
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
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Transações da fatura de {monthLabel}</h3>
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
      <div className="grid gap-4 md:grid-cols-2">
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

        <SectionCard title="Histórico completo" icon={<TrendingUp className="h-4 w-4" />} to="/transactions" empty={txs.length === 0} emptyText="Nenhuma transação ainda">
          <p className="text-sm text-muted-foreground">
            {txs.length} transaç{txs.length === 1 ? "ão registrada" : "ões registradas"} no total — busque, filtre e edite tudo por lá.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}

function OverviewCard({
  icon, label, value, valueTone, children,
}: {
  icon: React.ReactNode; label: string; value: string; valueTone?: "destructive"; children: React.ReactNode;
}) {
  return (
    <div className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        {icon} {label}
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${valueTone === "destructive" ? "text-[color:var(--destructive)]" : ""}`}>
        {value}
      </p>
      {children}
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
