import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, getCategory } from "@/lib/categories";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownRight, ArrowUpRight, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/compare")({
  head: () => ({ meta: [{ title: "Comparar — Finança" }] }),
  component: ComparePage,
});

interface Tx { type: "income" | "expense"; amount: number; category: string; occurred_at: string; }

const tooltipStyle = {
  background: "var(--popover)", border: "1px solid var(--border)",
  borderRadius: 12, color: "var(--popover-foreground)", fontSize: 12,
};

function monthLabel(key: string) {
  const d = new Date(key + "-02");
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function ComparePage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("transactions")
        .select("type,amount,category,occurred_at")
        .order("occurred_at", { ascending: false });
      const list = (data ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) }));
      setTxs(list);
      const months = Array.from(new Set(list.map((t) => t.occurred_at.slice(0, 7)))).sort().reverse();
      const now = new Date().toISOString().slice(0, 7);
      const prev = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
      setA(months.includes(now) ? now : months[0] ?? now);
      setB(months.includes(prev) ? prev : months[1] ?? prev);
      setLoading(false);
    })();
  }, []);

  const months = useMemo(
    () => Array.from(new Set(txs.map((t) => t.occurred_at.slice(0, 7)))).sort().reverse(),
    [txs]
  );

  const summary = (key: string) => {
    let inc = 0, exp = 0;
    const cats = new Map<string, number>();
    for (const t of txs) {
      if (t.occurred_at.slice(0, 7) !== key) continue;
      if (t.type === "income") inc += t.amount;
      else { exp += t.amount; cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount); }
    }
    return { inc, exp, balance: inc - exp, cats };
  };

  const sa = useMemo(() => summary(a), [a, txs]);
  const sb = useMemo(() => summary(b), [b, txs]);

  const catKeys = useMemo(() => {
    const set = new Set<string>([...sa.cats.keys(), ...sb.cats.keys()]);
    return Array.from(set).sort((x, y) => (sb.cats.get(y) ?? 0) + (sa.cats.get(y) ?? 0) - (sb.cats.get(x) ?? 0) - (sa.cats.get(x) ?? 0));
  }, [sa, sb]);

  const chartData = catKeys.map((id) => ({
    name: getCategory("expense", id).label,
    [a]: sa.cats.get(id) ?? 0,
    [b]: sb.cats.get(id) ?? 0,
  }));

  const diff = (x: number, y: number) => {
    if (y === 0) return x === 0 ? 0 : null;
    return Math.round(((x - y) / Math.abs(y)) * 100);
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Comparar períodos</h1>
        <p className="text-muted-foreground mt-1">Coloque dois meses lado a lado</p>
      </header>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      ) : months.length < 1 ? (
        <p className="text-muted-foreground text-center py-12">Sem transações para comparar.</p>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <PickerCard label="Período A" value={a} onChange={setA} months={months} />
            <PickerCard label="Período B" value={b} onChange={setB} months={months} />
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <DiffCard title="Ganhos" valA={sa.inc} valB={sb.inc} pct={diff(sa.inc, sb.inc)} icon={<ArrowUpRight className="h-4 w-4" />} good="up" />
            <DiffCard title="Gastos" valA={sa.exp} valB={sb.exp} pct={diff(sa.exp, sb.exp)} icon={<ArrowDownRight className="h-4 w-4" />} good="down" />
            <DiffCard title="Saldo" valA={sa.balance} valB={sb.balance} pct={diff(sa.balance, sb.balance)} icon={<Scale className="h-4 w-4" />} good="up" />
          </div>

          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card mb-6">
            <h3 className="font-medium mb-4">Gastos por categoria</h3>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem gastos nos períodos selecionados.</p>
            ) : (
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBRL(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => monthLabel(String(v))} />
                    <Bar dataKey={a} fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey={b} fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
            <h3 className="font-medium mb-4">Detalhamento por categoria</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2">Categoria</th>
                    <th className="py-2 text-right">{monthLabel(a)}</th>
                    <th className="py-2 text-right">{monthLabel(b)}</th>
                    <th className="py-2 text-right">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {catKeys.map((id) => {
                    const va = sa.cats.get(id) ?? 0;
                    const vb = sb.cats.get(id) ?? 0;
                    const p = diff(va, vb);
                    const c = getCategory("expense", id);
                    return (
                      <tr key={id} className="border-b border-border/50">
                        <td className="py-2.5 flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                          {c.label}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{formatBRL(va)}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatBRL(vb)}</td>
                        <td className={`py-2.5 text-right tabular-nums font-medium ${p === null ? "text-muted-foreground" : p > 0 ? "text-[color:var(--destructive)]" : p < 0 ? "text-[color:var(--success)]" : ""}`}>
                          {p === null ? "—" : `${p > 0 ? "+" : ""}${p}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PickerCard({ label, value, onChange, months }: { label: string; value: string; onChange: (v: string) => void; months: string[] }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DiffCard({ title, valA, valB, pct, icon, good }: {
  title: string; valA: number; valB: number; pct: number | null; icon: React.ReactNode; good: "up" | "down";
}) {
  const isGood = pct === null ? false : good === "up" ? pct > 0 : pct < 0;
  const isBad = pct === null ? false : good === "up" ? pct < 0 : pct > 0;
  const tone = isGood ? "var(--success)" : isBad ? "var(--destructive)" : "var(--muted-foreground)";
  const Trend = pct === null || pct === 0 ? null : (good === "up" ? (pct > 0 ? TrendingUp : TrendingDown) : (pct > 0 ? TrendingUp : TrendingDown));
  return (
    <div className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground flex items-center gap-2">{icon}{title}</span>
        {pct !== null && pct !== 0 && Trend && (
          <span className="text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1"
            style={{ color: tone, background: `color-mix(in oklab, ${tone} 14%, transparent)` }}>
            <Trend className="h-3 w-3" />{pct > 0 ? "+" : ""}{pct}%
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold tabular-nums">{formatBRL(valA)}</p>
      <p className="text-xs text-muted-foreground mt-1">vs {formatBRL(valB)}</p>
    </div>
  );
}
