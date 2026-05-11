import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, formatBRL, getCategory,
} from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Trash2, Pencil, Search, X } from "lucide-react";
import { toast } from "sonner";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  cat: fallback(z.string(), "").default(""),
  kind: fallback(z.enum(["all", "income", "expense"]), "all").default("all"),
  range: fallback(z.enum(["30", "90", "180", "365", "all"]), "all").default("all"),
});

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Histórico — Finança" }] }),
  validateSearch: zodValidator(searchSchema),
  component: TxList,
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

function TxList() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/transactions" });
  const setS = (patch: Partial<typeof search>) =>
    navigate({ search: (p: any) => ({ ...p, ...patch }) });

  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tx | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("id,type,amount,category,description,occurred_at,account_id")
      .order("occurred_at", { ascending: false });
    setTxs((data ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.q.trim().toLowerCase();
    let cutoff: string | null = null;
    if (search.range !== "all") {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(search.range));
      cutoff = d.toISOString().slice(0, 10);
    }
    return txs.filter((t) => {
      if (search.kind !== "all" && t.type !== search.kind) return false;
      if (search.cat && t.category !== search.cat) return false;
      if (cutoff && t.occurred_at < cutoff) return false;
      if (q && !((t.description ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [txs, search]);

  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    filtered.forEach((t) => { if (t.type === "income") inc += t.amount; else exp += t.amount; });
    return { inc, exp, balance: inc - exp };
  }, [filtered]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido");
    setTxs((p) => p.filter((t) => t.id !== id));
  };

  const allCats = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  const hasFilters = search.q || search.cat || search.kind !== "all" || search.range !== "all";

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Histórico</h1>
        <p className="text-muted-foreground mt-1">Todas as suas transações</p>
      </header>

      {/* Filters */}
      <div className="bg-gradient-card border border-border rounded-2xl p-4 shadow-card mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search.q} onChange={(e) => setS({ q: e.target.value })}
            placeholder="Buscar descrição..." className="pl-9" />
        </div>
        <Select value={search.kind} onValueChange={(v: any) => setS({ kind: v })}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="income">Ganhos</SelectItem>
            <SelectItem value="expense">Gastos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={search.cat || "__all"} onValueChange={(v) => setS({ cat: v === "__all" ? "" : v })}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas categorias</SelectItem>
            {allCats.map((c) => <SelectItem key={`${c.id}-${c.label}`} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={search.range} onValueChange={(v: any) => setS({ range: v })}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
            <SelectItem value="180">6 meses</SelectItem>
            <SelectItem value="365">1 ano</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="icon"
            onClick={() => setS({ q: "", cat: "", kind: "all", range: "all" })}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Ganhos</p>
          <p className="font-semibold tabular-nums text-[color:var(--success)]">{formatBRL(totals.inc)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Gastos</p>
          <p className="font-semibold tabular-nums text-[color:var(--destructive)]">{formatBRL(totals.exp)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Saldo</p>
          <p className="font-semibold tabular-nums">{formatBRL(totals.balance)}</p>
        </div>
      </div>

      <div className="bg-gradient-card border border-border rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <p className="text-muted-foreground text-center py-12">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">
            {txs.length === 0 ? "Nenhuma transação ainda." : "Nada encontrado nos filtros."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((t) => {
              const c = getCategory(t.type, t.category);
              const Icon = c.icon;
              return (
                <li key={t.id} className="flex items-center gap-4 p-4 group hover:bg-secondary/30">
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center"
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
                  <Button size="icon" variant="ghost" onClick={() => setEditing(t)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(t.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <EditSheet tx={editing} onClose={() => setEditing(null)} onSaved={(updated) => {
        setTxs((p) => p.map((x) => x.id === updated.id ? updated : x));
        setEditing(null);
      }} />
    </div>
  );
}

function EditSheet({ tx, onClose, onSaved }: { tx: Tx | null; onClose: () => void; onSaved: (t: Tx) => void }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tx) return;
    setAmount(String(tx.amount));
    setCategory(tx.category);
    setDescription(tx.description ?? "");
    setDate(tx.occurred_at);
  }, [tx]);

  if (!tx) return null;
  const cats = tx.type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const save = async () => {
    const v = parseFloat(amount.replace(",", "."));
    if (!v || v <= 0) { toast.error("Valor inválido"); return; }
    setSaving(true);
    const patch = { amount: v, category, description: description.trim() || null, occurred_at: date };
    const { error } = await supabase.from("transactions").update(patch).eq("id", tx.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Atualizado");
    onSaved({ ...tx, ...patch });
  };

  return (
    <Sheet open={!!tx} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader><SheetTitle>Editar transação</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-6">
          <div className="space-y-2"><Label>Valor (R$)</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2"><Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2"><Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
