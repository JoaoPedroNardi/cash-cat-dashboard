import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Plus, Target, Trash2, TrendingUp } from "lucide-react";
import { formatDateBR } from "@/lib/utils";
import { toast } from "sonner";
import { PALETTE } from "@/lib/palette";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({ meta: [{ title: "Metas — Finança" }] }),
  component: GoalsPage,
});

interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  color: string;
  created_at: string;
}

function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("0");
  const [date, setDate] = useState("");
  const [color, setColor] = useState(PALETTE[0]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("goals").select("*").order("created_at", { ascending: false });
    setGoals((data ?? []).map((g: any) => ({
      ...g, target_amount: Number(g.target_amount), current_amount: Number(g.current_amount),
    })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setName(""); setTarget(""); setCurrent("0"); setDate(""); setColor(PALETTE[0]); };

  const create = async () => {
    const t = parseFloat(target.replace(",", "."));
    const c = parseFloat(current.replace(",", ".")) || 0;
    if (!name.trim() || !t || t <= 0) { toast.error("Preencha nome e valor alvo"); return; }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("goals").insert({
      user_id: u.user.id, name: name.trim(), target_amount: t,
      current_amount: c, target_date: date || null, color,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Meta criada");
    setOpen(false); reset(); load();
  };

  const addContribution = async (g: Goal) => {
    const raw = window.prompt(`Quanto adicionar à "${g.name}"? (R$)`, "0");
    if (raw === null) return; // cancelled
    const n = parseFloat(raw.replace(",", "."));
    if (!n || n <= 0) { toast.error("Valor inválido"); return; }
    const { error } = await supabase.from("goals").update({ current_amount: g.current_amount + n }).eq("id", g.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Aporte adicionado");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir meta?")) return;
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setGoals((p) => p.filter((g) => g.id !== id));
  };

  const forecastDays = (g: Goal): string => {
    const remaining = g.target_amount - g.current_amount;
    if (remaining <= 0) return "Concluída";
    const created = new Date(g.created_at);
    const days = Math.max(1, (Date.now() - created.getTime()) / 86400000);
    const ratePerDay = g.current_amount / days;
    if (ratePerDay <= 0) return "Sem aportes ainda";
    const daysLeft = Math.ceil(remaining / ratePerDay);
    const date = new Date(Date.now() + daysLeft * 86400000);
    return `≈ ${date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}`;
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Metas</h1>
          <p className="text-muted-foreground mt-1">Acompanhe seus objetivos financeiros</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4 mr-1" /> Nova meta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar meta</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reserva de emergência" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Valor alvo (R$)</Label>
                  <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="10000" />
                </div>
                <div className="space-y-2"><Label>Já guardado (R$)</Label>
                  <Input inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2"><Label>Data alvo (opcional)</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2"><Label>Cor</Label>
                <div className="flex gap-2">
                  {PALETTE.map((c) => (
                    <button key={c} type="button" onClick={() => setColor(c)}
                      className={`h-8 w-8 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={create}>Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {loading ? <p className="text-muted-foreground text-center py-12">Carregando...</p>
        : goals.length === 0 ? (
          <div className="bg-gradient-card border border-border rounded-2xl p-12 text-center shadow-card">
            <Target className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium text-lg">Nenhuma meta ainda</h3>
            <p className="text-muted-foreground text-sm mt-1">Crie sua primeira meta para começar a acompanhar.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {goals.map((g) => {
              const pct = Math.min(100, (g.current_amount / g.target_amount) * 100);
              const done = pct >= 100;
              return (
                <div key={g.id} className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card group relative">
                  <button onClick={() => remove(g.id)}
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{ background: `color-mix(in oklab, ${g.color} 20%, transparent)`, color: g.color }}>
                      <Target className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBRL(g.current_amount)} de {formatBRL(g.target_amount)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: g.color }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: g.color }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {done ? "Concluída 🎉" : `Previsão: ${forecastDays(g)}`}
                    </span>
                    {g.target_date && <span>Alvo: {formatDateBR(g.target_date)}</span>}
                  </div>
                  {!done && (
                    <Button size="sm" variant="secondary" className="w-full mt-4" onClick={() => addContribution(g)}>
                      + Adicionar aporte
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
