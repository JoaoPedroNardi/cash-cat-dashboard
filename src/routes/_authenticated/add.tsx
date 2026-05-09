import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type TxType } from "@/lib/categories";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/add")({
  head: () => ({ meta: [{ title: "Adicionar — Finança" }] }),
  component: AddPage,
});

function AddPage() {
  const navigate = useNavigate();
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const categories = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) { toast.error("Escolha uma categoria"); return; }
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) { toast.error("Valor inválido"); return; }

    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Sessão expirada"); setLoading(false); return; }

    const { error } = await supabase.from("transactions").insert({
      user_id: u.user.id,
      type,
      amount: value,
      category,
      description: description || null,
      occurred_at: date,
    });

    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success(type === "expense" ? "Gasto adicionado" : "Ganho adicionado");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Nova transação</h1>
        <p className="text-muted-foreground mt-1">Registre um gasto ou ganho</p>
      </header>

      {/* Type toggle */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-secondary rounded-xl mb-6">
        {(["expense", "income"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setType(t); setCategory(""); }}
            className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
              type === t
                ? t === "expense"
                  ? "bg-destructive text-destructive-foreground shadow"
                  : "bg-gradient-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "expense" ? "Gasto" : "Ganho"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="bg-gradient-card border border-border rounded-2xl p-6 md:p-8 space-y-6 shadow-card">
        <div className="space-y-2">
          <Label htmlFor="amount">Valor (R$)</Label>
          <Input id="amount" inputMode="decimal" placeholder="0,00"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className="text-2xl font-semibold h-14" required />
        </div>

        <div className="space-y-2">
          <Label>Categoria</Label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {categories.map((c) => {
              const active = category === c.id;
              const Icon = c.icon;
              return (
                <button
                  key={c.id} type="button" onClick={() => setCategory(c.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    active
                      ? "border-primary bg-primary/10 shadow-glow"
                      : "border-border bg-secondary/40 hover:bg-secondary"
                  }`}
                >
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center"
                    style={{ background: `color-mix(in oklab, ${c.color} 20%, transparent)`, color: c.color }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Descrição (opcional)</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: mercado" />
          </div>
        </div>

        <Button type="submit" disabled={loading}
          className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow h-12 text-base">
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </form>
    </div>
  );
}
