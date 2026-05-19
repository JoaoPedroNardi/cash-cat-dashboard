import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarDays, Receipt, ArrowLeft, CreditCard } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/billing-settings")({
  head: () => ({ meta: [{ title: "Datas de Fatura — Finança" }] }),
  component: BillingSettingsPage,
});

interface Account {
  id: string; name: string; type: string;
  closing_day: number | null; due_day: number | null;
}

function BillingSettingsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("accounts").select("id,name,type,closing_day,due_day").order("created_at");
    setAccounts((data ?? []).map((a: any) => ({
      ...a, closing_day: a.closing_day ?? null, due_day: a.due_day ?? null,
    })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openEdit = (a: Account) => {
    setEditingId(a.id);
    setClosingDay(a.closing_day != null ? String(a.closing_day) : "");
    setDueDay(a.due_day != null ? String(a.due_day) : "");
  };

  const save = async () => {
    if (!editingId) return;
    const cd = closingDay ? parseInt(closingDay) : null;
    const dd = dueDay ? parseInt(dueDay) : null;
    if (cd && (cd < 1 || cd > 31)) { toast.error("Dia inválido (1-31)"); return; }
    if (dd && (dd < 1 || dd > 31)) { toast.error("Dia inválido (1-31)"); return; }
    setSaving(true);
    const { error } = await supabase.from("accounts")
      .update({ closing_day: cd, due_day: dd })
      .eq("id", editingId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Salvo!");
    setEditingId(null);
    load();
  };

  const creditAccounts = accounts.filter((a) => a.type === "credit");
  const editingAccount = accounts.find((a) => a.id === editingId);

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <header className="mb-8 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/accounts" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Datas de fatura</h1>
          <p className="text-muted-foreground mt-1">Configure fechamento e vencimento por cartão</p>
        </div>
      </header>

      {loading ? <p className="text-muted-foreground text-center py-12">Carregando...</p>
        : creditAccounts.length === 0 ? (
          <div className="bg-gradient-card border border-border rounded-2xl p-12 text-center shadow-card">
            <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium text-lg">Nenhum cartão de crédito</h3>
            <p className="text-muted-foreground text-sm mt-1">Crie uma conta do tipo "Cartão de crédito" primeiro.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {creditAccounts.map((a) => (
              <div key={a.id} className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card flex items-center justify-between">
                <div>
                  <p className="font-medium">{a.name}</p>
                  {(a.closing_day || a.due_day) ? (
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      {a.closing_day && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> Fecha dia {a.closing_day}
                        </span>
                      )}
                      {a.due_day && (
                        <span className="flex items-center gap-1">
                          <Receipt className="h-3 w-3" /> Vence dia {a.due_day}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Sem datas configuradas</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => openEdit(a)}>
                  {(a.closing_day || a.due_day) ? "Editar" : "Configurar"}
                </Button>
              </div>
            ))}
          </div>
        )}

      <Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar fatura — {editingAccount?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Dia de fechamento</Label>
              <Input type="number" min={1} max={31} placeholder="Ex: 15"
                value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
              <p className="text-xs text-muted-foreground">Dia do mês que a fatura fecha</p>
            </div>
            <div className="space-y-2">
              <Label>Dia de vencimento</Label>
              <Input type="number" min={1} max={31} placeholder="Ex: 22"
                value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
              <p className="text-xs text-muted-foreground">Dia do mês que a fatura vence</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
