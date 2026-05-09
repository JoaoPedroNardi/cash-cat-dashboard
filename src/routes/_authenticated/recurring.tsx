import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, formatBRL, getCategory } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { materializeRecurring } from "@/lib/recurring";

export const Route = createFileRoute("/_authenticated/recurring")({
  head: () => ({ meta: [{ title: "Recorrentes — Finança" }] }),
  component: RecurringPage,
});

const FREQ_LABEL: Record<string, string> = { weekly: "Semanal", monthly: "Mensal", yearly: "Anual" };

interface Tpl {
  id: string; type: "income" | "expense"; amount: number; category: string;
  description: string | null; frequency: "weekly" | "monthly" | "yearly";
  start_date: string; next_run: string; end_date: string | null; active: boolean;
}

function RecurringPage() {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("recurring_transactions").select("*").order("created_at", { ascending: false });
    setTpls((data ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const cats = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const create = async () => {
    const v = parseFloat(amount.replace(",", "."));
    if (!v || v <= 0) { toast.error("Valor inválido"); return; }
    if (!category) { toast.error("Escolha uma categoria"); return; }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("recurring_transactions").insert({
      user_id: u.user.id, type, amount: v, category,
      description: description.trim() || null, frequency,
      start_date: start, next_run: start, end_date: end || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Recorrência criada");
    setOpen(false);
    setAmount(""); setCategory(""); setDescription(""); setEnd("");
    await load();
    const created = await materializeRecurring();
    if (created > 0) toast.success(`${created} lançamento(s) gerado(s)`);
  };

  const toggle = async (t: Tpl) => {
    await supabase.from("recurring_transactions").update({ active: !t.active }).eq("id", t.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir recorrência?")) return;
    await supabase.from("recurring_transactions").delete().eq("id", id);
    load();
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Recorrentes</h1>
          <p className="text-muted-foreground mt-1">Aluguel, salário, assinaturas — automáticos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4 mr-1" /> Nova recorrência
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nova recorrência</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-secondary rounded-lg">
                {(["expense", "income"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => { setType(t); setCategory(""); }}
                    className={`py-2 rounded-md text-sm font-medium ${type === t ? "bg-card shadow" : "text-muted-foreground"}`}>
                    {t === "expense" ? "Gasto" : "Ganho"}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Valor (R$)</Label>
                  <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-2"><Label>Frequência</Label>
                  <Select value={frequency} onValueChange={(v: any) => setFrequency(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FREQ_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Escolha..." /></SelectTrigger>
                  <SelectContent>
                    {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Descrição</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Netflix" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Início</Label>
                  <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="space-y-2"><Label>Fim (opcional)</Label>
                  <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={create}>Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="bg-gradient-card border border-border rounded-2xl shadow-card overflow-hidden">
        {loading ? <p className="text-muted-foreground text-center py-12">Carregando...</p>
          : tpls.length === 0 ? (
            <div className="text-center py-12">
              <Repeat className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Nenhuma recorrência ainda.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {tpls.map((t) => {
                const c = getCategory(t.type, t.category);
                const Icon = c.icon;
                return (
                  <li key={t.id} className="flex items-center gap-4 p-4">
                    <div className="h-11 w-11 rounded-xl flex items-center justify-center"
                      style={{ background: `color-mix(in oklab, ${c.color} 20%, transparent)`, color: c.color }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t.description || c.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {FREQ_LABEL[t.frequency]} • Próximo: {new Date(t.next_run).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <span className={`font-semibold tabular-nums ${t.type === "income" ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}>
                      {t.type === "income" ? "+" : "−"}{formatBRL(t.amount)}
                    </span>
                    <Switch checked={t.active} onCheckedChange={() => toggle(t)} />
                    <Button size="icon" variant="ghost" onClick={() => remove(t.id)}
                      className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </div>
  );
}
