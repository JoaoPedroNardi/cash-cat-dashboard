import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, CreditCard, Wallet, Banknote, PiggyBank } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({ meta: [{ title: "Contas — Finança" }] }),
  component: AccountsPage,
});

const TYPE_LABEL: Record<string, string> = {
  wallet: "Carteira", checking: "Conta corrente", savings: "Poupança",
  credit: "Cartão de crédito", debit: "Cartão de débito", other: "Outros",
};
const TYPE_ICON: Record<string, any> = {
  wallet: Wallet, checking: Banknote, savings: PiggyBank, credit: CreditCard, debit: CreditCard, other: Wallet,
};
const PALETTE = ["var(--primary)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--accent)"];

interface Account { id: string; name: string; type: string; color: string; initial_balance: number; }

function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [initial, setInitial] = useState("0");
  const [color, setColor] = useState(PALETTE[0]);

  const load = async () => {
    setLoading(true);
    const [{ data: accs }, { data: txs }] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("transactions").select("account_id,type,amount"),
    ]);
    const list = (accs ?? []).map((a: any) => ({ ...a, initial_balance: Number(a.initial_balance) }));
    setAccounts(list);
    const bal: Record<string, number> = {};
    list.forEach((a) => { bal[a.id] = a.initial_balance; });
    (txs ?? []).forEach((t: any) => {
      if (!t.account_id) return;
      const v = Number(t.amount) * (t.type === "income" ? 1 : -1);
      bal[t.account_id] = (bal[t.account_id] ?? 0) + v;
    });
    setBalances(bal);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) { toast.error("Informe um nome"); return; }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("accounts").insert({
      user_id: u.user.id, name: name.trim(), type: type as any, color,
      initial_balance: parseFloat(initial.replace(",", ".")) || 0,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Conta criada");
    setOpen(false); setName(""); setInitial("0"); setColor(PALETTE[0]); setType("checking");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir conta? Transações ficarão sem conta vinculada.")) return;
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Contas e cartões</h1>
          <p className="text-muted-foreground mt-1">Saldo separado por conta</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4 mr-1" /> Nova conta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova conta</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nubank" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Tipo</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Saldo inicial</Label>
                  <Input inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2"><Label>Cor</Label>
                <div className="flex gap-2">
                  {PALETTE.map((c) => (
                    <button key={c} type="button" onClick={() => setColor(c)}
                      className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
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
        : accounts.length === 0 ? (
          <div className="bg-gradient-card border border-border rounded-2xl p-12 text-center shadow-card">
            <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium text-lg">Sem contas ainda</h3>
            <p className="text-muted-foreground text-sm mt-1">Crie uma conta para separar seus saldos.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => {
              const Icon = TYPE_ICON[a.type] ?? Wallet;
              const bal = balances[a.id] ?? a.initial_balance;
              return (
                <div key={a.id} className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card group relative">
                  <button onClick={() => remove(a.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{ background: `color-mix(in oklab, ${a.color} 20%, transparent)`, color: a.color }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{TYPE_LABEL[a.type]}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Saldo atual</p>
                  <p className={`text-2xl font-semibold tabular-nums ${bal < 0 ? "text-[color:var(--destructive)]" : ""}`}>
                    {formatBRL(bal)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
