import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMoney } from "@/hooks/use-privacy";
import { formatDateBR } from "@/lib/utils";
import {
  INVESTMENT_CLASSES, investmentClass, isActiveInvestment, investmentSubtypeLabel, formatRate,
  type Investment,
} from "@/lib/investments";
import { ChevronDown, LineChart } from "lucide-react";
import { useOnSyncDone } from "@/hooks/use-pluggy-sync";

export const Route = createFileRoute("/_authenticated/investments")({
  head: () => ({ meta: [{ title: "Investimentos — Finança" }] }),
  component: InvestmentsPage,
});

type GroupBy = "classe" | "instituicao";

function InvestmentsPage() {
  const money = useMoney();
  const [items, setItems] = useState<Investment[]>([]);
  const [institutionByConnection, setInstitutionByConnection] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("classe");
  const [showClosed, setShowClosed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    {
      const [inv, accs] = await Promise.all([
        supabase.from("investments").select("*").order("balance", { ascending: false }),
        supabase.from("accounts").select("bank_connection_id,institution_name"),
      ]);
      if (inv.error) setLoadError(inv.error.message);
      setItems((inv.data ?? []).map((i: any) => ({
        ...i,
        balance: Number(i.balance),
        quantity: i.quantity == null ? null : Number(i.quantity),
        unit_value: i.unit_value == null ? null : Number(i.unit_value),
        invested_amount: i.invested_amount == null ? null : Number(i.invested_amount),
        rate: i.rate == null ? null : Number(i.rate),
      })));

      // A instituição do ativo é a das contas da mesma conexão (nome editável em Contas).
      const counts = new Map<string, Map<string, number>>();
      for (const a of accs.data ?? []) {
        if (!a.bank_connection_id || !a.institution_name) continue;
        const m = counts.get(a.bank_connection_id) ?? new Map<string, number>();
        m.set(a.institution_name, (m.get(a.institution_name) ?? 0) + 1);
        counts.set(a.bank_connection_id, m);
      }
      const byConn = new Map<string, string>();
      counts.forEach((m, conn) => {
        byConn.set(conn, Array.from(m.entries()).sort((x, y) => y[1] - x[1])[0][0]);
      });
      setInstitutionByConnection(byConn);
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useOnSyncDone(load);

  const institutionOf = (i: Investment) =>
    (i.bank_connection_id && institutionByConnection.get(i.bank_connection_id)) || "Instituição";

  const summary = useMemo(() => {
    const active = items.filter((i) => isActiveInvestment(i.status));
    const closed = items.filter((i) => !isActiveInvestment(i.status));
    const total = active.reduce((s, i) => s + i.balance, 0);

    const keyOf = (i: Investment) => groupBy === "classe" ? investmentClass(i.type, i.subtype).id : institutionOf(i);
    const groups = new Map<string, { key: string; label: string; color: string; total: number; items: Investment[] }>();
    for (const i of active) {
      const key = keyOf(i);
      const cls = investmentClass(i.type, i.subtype);
      const g = groups.get(key) ?? {
        key,
        label: groupBy === "classe" ? cls.label : key,
        color: groupBy === "classe" ? cls.color : "var(--primary)",
        total: 0,
        items: [],
      };
      g.total += i.balance;
      g.items.push(i);
      groups.set(key, g);
    }
    const list = Array.from(groups.values()).sort((a, b) => b.total - a.total);
    if (groupBy === "classe") {
      // Mantém a ordem fixa das classes quando há empate de valor.
      list.sort((a, b) => b.total - a.total || INVESTMENT_CLASSES.findIndex((c) => c.id === a.key) - INVESTMENT_CLASSES.findIndex((c) => c.id === b.key));
    }
    return { active, closed, total, groups: list };
  }, [items, groupBy, institutionByConnection]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (loading) {
    return <div className="p-6 md:p-10 max-w-5xl mx-auto"><p className="text-muted-foreground text-center py-24">Carregando...</p></div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Investimentos</h1>
        <p className="text-muted-foreground mt-1">Sua carteira, como as corretoras informam</p>
      </header>

      {loadError && (
        <div className="rounded-xl border border-border bg-destructive/10 text-sm p-4 mb-6">
          Não foi possível carregar os investimentos ({loadError}). Se a tabela ainda não existe, rode o schema.sql atualizado no Supabase.
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-gradient-card border border-border rounded-2xl p-12 text-center shadow-card">
          <LineChart className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium text-lg">Nenhum investimento sincronizado</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Em <Link to="/accounts" className="text-[color:var(--primary)] hover:underline">Contas</Link>, sincronize uma
            conexão que tenha corretora (ex: XP, Clear) e os ativos aparecem aqui.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Total investido hoje</p>
                <p className="text-3xl md:text-4xl font-semibold tabular-nums mt-1">{money(summary.total)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {summary.active.length} ativo{summary.active.length === 1 ? "" : "s"}
                  {summary.closed.length > 0 && ` · ${summary.closed.length} encerrado${summary.closed.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                {(["classe", "instituicao"] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGroupBy(g)}
                    className={`px-3 py-1.5 rounded-md transition-colors ${groupBy === g ? "bg-primary/15 text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                    {g === "classe" ? "Classes" : "Instituições"}
                  </button>
                ))}
              </div>
            </div>

            {summary.total > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden bg-muted mb-4">
                {summary.groups.map((g) => (
                  <div key={g.key} style={{ width: `${(g.total / summary.total) * 100}%`, background: g.color }} />
                ))}
              </div>
            )}

            <ul className="space-y-3">
              {summary.groups.map((g) => {
                const pct = summary.total > 0 ? (g.total / summary.total) * 100 : 0;
                return (
                  <li key={g.key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                        {g.label} <span className="text-muted-foreground">({g.items.length})</span>
                      </span>
                      <span className="tabular-nums">
                        <span className="text-muted-foreground mr-3">{pct.toFixed(1)}%</span>
                        <span className="font-medium">{money(g.total)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: g.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-6">
            {summary.groups.map((g) => (
              <section key={g.key}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{g.label}</h2>
                  <span className="text-sm font-medium tabular-nums text-muted-foreground">{money(g.total)}</span>
                </div>
                <ul className="bg-gradient-card border border-border rounded-2xl shadow-card divide-y divide-border overflow-hidden">
                  {g.items.map((i) => (
                    <AssetRow key={i.id} inv={i} total={summary.total} institution={institutionOf(i)}
                      open={expanded.has(i.id)} onToggle={() => toggle(i.id)} />
                  ))}
                </ul>
              </section>
            ))}

            {summary.closed.length > 0 && (
              <section>
                <button type="button" onClick={() => setShowClosed((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground px-1">
                  {showClosed ? "Ocultar" : "Mostrar"} encerrados ({summary.closed.length})
                </button>
                {showClosed && (
                  <ul className="mt-2 bg-gradient-card border border-border rounded-2xl shadow-card divide-y divide-border overflow-hidden opacity-70">
                    {summary.closed.map((i) => (
                      <AssetRow key={i.id} inv={i} total={summary.total} institution={institutionOf(i)}
                        open={expanded.has(i.id)} onToggle={() => toggle(i.id)} closed />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AssetRow({
  inv, total, institution, open, onToggle, closed,
}: {
  inv: Investment; total: number; institution: string; open: boolean; onToggle: () => void; closed?: boolean;
}) {
  const money = useMoney();
  const subtype = investmentSubtypeLabel(inv.subtype);
  const pct = total > 0 && !closed ? (inv.balance / total) * 100 : null;
  const profit = inv.invested_amount && inv.invested_amount > 0 ? inv.balance - inv.invested_amount : null;
  const profitPct = profit != null && inv.invested_amount ? (profit / inv.invested_amount) * 100 : null;
  const rate = formatRate(inv.rate, inv.rate_type);

  const details: [string, string][] = [];
  if (inv.quantity != null) details.push(["Quantidade", inv.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 6 })]);
  if (inv.unit_value != null) details.push(["Valor unitário", money(inv.unit_value)]);
  if (inv.invested_amount != null) details.push(["Valor aplicado", money(inv.invested_amount)]);
  if (profit != null) {
    details.push(["Resultado", `${profit >= 0 ? "+" : "−"}${money(Math.abs(profit))} (${profitPct!.toFixed(2)}%)`]);
  }
  if (rate) details.push(["Taxa", rate]);
  if (inv.due_date) details.push(["Vencimento", formatDateBR(inv.due_date)]);
  if (inv.issuer) details.push(["Emissor", inv.issuer]);
  if (inv.as_of) details.push(["Posição em", formatDateBR(inv.as_of)]);

  return (
    <li>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/30">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{inv.name}{closed && <span className="ml-2 text-xs text-muted-foreground font-normal">encerrado</span>}</p>
          <p className="text-xs text-muted-foreground truncate">
            {institution}{subtype ? ` · ${subtype}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold tabular-nums">{money(inv.balance)}</p>
          {pct != null && <p className="text-xs text-muted-foreground tabular-nums">{pct.toFixed(1)}%</p>}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && details.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 pb-4 text-xs">
          {details.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border/50 pb-1">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="tabular-nums text-right">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
