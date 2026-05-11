import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, formatBRL, type TxType } from "@/lib/categories";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  const [installmentsOn, setInstallmentsOn] = useState(false);
  const [installments, setInstallments] = useState("2");
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [accountId, setAccountId] = useState<string>("");

  useEffect(() => {
    supabase.from("accounts").select("id,name").order("created_at").then(({ data }) => {
      setAccounts(data ?? []);
    });
  }, []);

  const categories = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const isInstallment = type === "expense" && installmentsOn;

  const parsedAmount = parseFloat(amount.replace(",", ".")) || 0;
  const parsedInstallments = Math.max(1, Math.min(60, parseInt(installments) || 1));
  const perInstallment = useMemo(
    () => (isInstallment && parsedInstallments > 0 ? parsedAmount / parsedInstallments : 0),
    [isInstallment, parsedAmount, parsedInstallments],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) { toast.error("Escolha uma categoria"); return; }
    if (!parsedAmount || parsedAmount <= 0) { toast.error("Valor inválido"); return; }
    if (isInstallment && parsedInstallments < 2) {
      toast.error("Use pelo menos 2 parcelas"); return;
    }

    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Sessão expirada"); setLoading(false); return; }

    const baseDate = new Date(date + "T00:00:00");
    const baseDesc = description.trim();

    const rows = isInstallment
      ? Array.from({ length: parsedInstallments }, (_, i) => {
          const d = new Date(baseDate);
          d.setMonth(d.getMonth() + i);
          const label = `${baseDesc || "Parcelado"} (${i + 1}/${parsedInstallments})`;
          // Distribute cents on the last installment to avoid rounding drift
          const cents = Math.round(perInstallment * 100);
          const totalCents = Math.round(parsedAmount * 100);
          const value = i === parsedInstallments - 1
            ? (totalCents - cents * (parsedInstallments - 1)) / 100
            : cents / 100;
          return {
            user_id: u.user!.id,
            type,
            amount: value,
            category,
            description: label,
            occurred_at: d.toISOString().slice(0, 10),
            account_id: accountId || null,
          };
        })
      : [{
          user_id: u.user.id,
          type,
          amount: parsedAmount,
          category,
          description: baseDesc || null,
          occurred_at: date,
          account_id: accountId || null,
        }];

    const { error } = await supabase.from("transactions").insert(rows);

    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success(
      isInstallment
        ? `${parsedInstallments} parcelas adicionadas`
        : type === "expense" ? "Gasto adicionado" : "Ganho adicionado",
    );
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
            onClick={() => { setType(t); setCategory(""); if (t === "income") setInstallmentsOn(false); }}
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
          <Label htmlFor="amount">{isInstallment ? "Valor total (R$)" : "Valor (R$)"}</Label>
          <Input id="amount" inputMode="decimal" placeholder="0,00"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className="text-2xl font-semibold h-14" required />
        </div>

        {type === "expense" && (
          <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="installments-toggle" className="cursor-pointer">Parcelado</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Divide em parcelas mensais a partir da data escolhida
                </p>
              </div>
              <Switch
                id="installments-toggle"
                checked={installmentsOn}
                onCheckedChange={setInstallmentsOn}
              />
            </div>

            {installmentsOn && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="n-installments">Número de parcelas</Label>
                  <Input
                    id="n-installments"
                    type="number" min={2} max={60} step={1}
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                  />
                </div>
                {parsedAmount > 0 && parsedInstallments >= 2 && (
                  <div className="rounded-lg bg-card border border-border p-3 text-sm flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {parsedInstallments}× de
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatBRL(perInstallment)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
            <Label htmlFor="date">{isInstallment ? "Data da 1ª parcela" : "Data"}</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Descrição (opcional)</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: mercado" />
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="space-y-2">
            <Label>Conta / cartão (opcional)</Label>
            <Select value={accountId || "__none"} onValueChange={(v) => setAccountId(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sem conta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem conta</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button type="submit" disabled={loading}
          className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow h-12 text-base">
          {loading ? "Salvando..." : isInstallment ? `Salvar ${parsedInstallments} parcelas` : "Salvar"}
        </Button>
      </form>
    </div>
  );
}
