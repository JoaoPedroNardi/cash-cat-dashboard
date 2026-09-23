import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, CreditCard, Wallet, Banknote, PiggyBank, Landmark, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PALETTE } from "@/lib/palette";
import { getConnectToken, syncItem } from "@/integrations/pluggy/server-functions";

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
  pluggy_account_id: string | null;
  bank_connection_id: string | null;
}

type FormState = { name: string; type: string; initial: string; creditLimit: string; institution: string; color: string };

const emptyForm: FormState = { name: "", type: "checking", initial: "0", creditLimit: "", institution: "", color: PALETTE[0] };

function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [editing, setEditing] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);

  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // O widget da Pluggy (react-pluggy-connect -> zoid) acessa `window` no momento do
  // import, o que quebra a renderização no servidor (SSR). Carregamos só no navegador.
  const [PluggyConnectComp, setPluggyConnectComp] = useState<ComponentType<any> | null>(null);
  useEffect(() => {
    import("react-pluggy-connect").then((mod) => setPluggyConnectComp(() => mod.PluggyConnect));
  }, []);

  const callGetConnectToken = useServerFn(getConnectToken);
  const callSyncItem = useServerFn(syncItem);

  const load = async () => {
    setLoading(true);
    const [{ data: accs }, { data: txs }] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("transactions").select("account_id,type,amount"),
    ]);
    const list = (accs ?? []).map((a: any) => ({
      ...a,
      initial_balance: Number(a.initial_balance),
      credit_limit: a.credit_limit == null ? null : Number(a.credit_limit),
      synced_balance: a.synced_balance == null ? null : Number(a.synced_balance),
    }));
    setAccounts(list);
    const bal: Record<string, number> = {};
    list.forEach((a) => { bal[a.id] = a.initial_balance; });
    (txs ?? []).forEach((t: any) => {
      if (!t.account_id) return;
      const v = Number(t.amount) * (t.type === "income" ? 1 : -1);
      bal[t.account_id] = (bal[t.account_id] ?? 0) + v;
    });
    // Contas sincronizadas usam o saldo que o banco informou, não a soma das transações
    // (o histórico importado é parcial, então a soma não bate com o saldo real).
    list.forEach((a) => { if (a.synced_balance != null) bal[a.id] = a.synced_balance; });
    setBalances(bal);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const create = async () => {
    if (!form.name.trim()) { toast.error("Informe um nome"); return; }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("accounts").insert({
      user_id: u.user.id, name: form.name.trim(), type: form.type as any, color: form.color,
      initial_balance: parseFloat(form.initial.replace(",", ".")) || 0,
      credit_limit: form.type === "credit" ? (parseFloat(form.creditLimit.replace(",", ".")) || null) : null,
      institution_name: form.institution.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Conta criada");
    setOpen(false); setForm(emptyForm);
    load();
  };

  const openEdit = (a: Account) => {
    setEditForm({
      name: a.name, type: a.type, initial: String(a.initial_balance),
      creditLimit: a.credit_limit != null ? String(a.credit_limit) : "",
      institution: a.institution_name ?? "", color: a.color,
    });
    setEditing(a);
  };

  const saveEdit = async () => {
    if (!editing || !editForm.name.trim()) { toast.error("Informe um nome"); return; }
    const { error } = await supabase.from("accounts").update({
      name: editForm.name.trim(), type: editForm.type as any, color: editForm.color,
      initial_balance: parseFloat(editForm.initial.replace(",", ".")) || 0,
      credit_limit: editForm.type === "credit" ? (parseFloat(editForm.creditLimit.replace(",", ".")) || null) : null,
      institution_name: editForm.institution.trim() || null,
    }).eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Conta atualizada");
    setEditing(null);
    load();
  };

  const remove = async (a: Account) => {
    const warn = a.bank_connection_id
      ? "Excluir conta sincronizada? Transações ficarão sem conta vinculada."
      : "Excluir conta? Transações ficarão sem conta vinculada.";
    if (!confirm(warn)) return;
    const { error } = await supabase.from("accounts").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const connectBank = async () => {
    setConnecting(true);
    const accessToken = await getAccessToken();
    if (!accessToken) { toast.error("Sessão expirada"); setConnecting(false); return; }
    try {
      const result = await callGetConnectToken({ data: { accessToken, oauthRedirectUri: window.location.href } });
      setConnectToken(result.accessToken);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao conectar com a Pluggy");
    } finally {
      setConnecting(false);
    }
  };

  const runSync = async (input: { itemId?: string; connectionId?: string }, syncKey: string) => {
    const accessToken = await getAccessToken();
    if (!accessToken) { toast.error("Sessão expirada"); return; }
    setSyncingId(syncKey);
    try {
      const result = await callSyncItem({ data: { accessToken, ...input } });
      // Se o Worker estoura o limite de CPU, o Cloudflare devolve um 503 que chega aqui sem corpo útil.
      if (!result || typeof result.accountsSynced !== "number") {
        throw new Error("O servidor não concluiu a sincronização. Aguarde alguns segundos e tente de novo.");
      }
      toast.success(`${result.accountsSynced} conta(s), ${result.transactionsInserted} transação(ões) nova(s)`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao sincronizar");
    } finally {
      setSyncingId(null);
    }
  };

  // Formato exato do callback ainda varia entre versões do widget da Pluggy;
  // cobrimos os dois formatos documentados (`item.id` e `itemId`) por segurança.
  const handleConnectSuccess = (itemData: any) => {
    setConnectToken(null);
    const itemId = itemData?.item?.id ?? itemData?.itemId;
    if (!itemId) { toast.error("Não foi possível identificar a conexão"); return; }
    runSync({ itemId }, "new");
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Contas e cartões</h1>
          <p className="text-muted-foreground mt-1">Saldo separado por conta</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={connectBank} disabled={connecting}>
            <Landmark className="h-4 w-4 mr-1" /> {connecting ? "Conectando..." : "Conectar banco"}
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary text-primary-foreground shadow-glow">
                <Plus className="h-4 w-4 mr-1" /> Nova conta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova conta</DialogTitle></DialogHeader>
              <AccountForm form={form} setForm={setForm} />
              <DialogFooter><Button onClick={create}>Criar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {connectToken && PluggyConnectComp && (
        <PluggyConnectComp
          connectToken={connectToken}
          onSuccess={handleConnectSuccess}
          onError={(err: any) => {
            console.error("Pluggy Connect error:", err);
            toast.error(err?.message || err?.data?.message || "Erro ao conectar com o banco (veja o console)");
            setConnectToken(null);
          }}
          onClose={() => setConnectToken(null)}
        />
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar conta</DialogTitle></DialogHeader>
          <AccountForm form={editForm} setForm={setEditForm} />
          <DialogFooter><Button onClick={saveEdit}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? <p className="text-muted-foreground text-center py-12">Carregando...</p>
        : accounts.length === 0 ? (
          <div className="bg-gradient-card border border-border rounded-2xl p-12 text-center shadow-card">
            <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium text-lg">Sem contas ainda</h3>
            <p className="text-muted-foreground text-sm mt-1">Crie uma conta ou conecte seu banco para começar.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => {
              const Icon = TYPE_ICON[a.type] ?? Wallet;
              const bal = balances[a.id] ?? a.initial_balance;
              const isCredit = a.type === "credit" && a.credit_limit != null;
              const available = isCredit ? a.credit_limit! + bal : null;
              const syncKey = a.bank_connection_id ?? "";
              return (
                <div key={a.id} className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card group relative">
                  <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    {a.bank_connection_id && (
                      <button onClick={() => runSync({ connectionId: a.bank_connection_id! }, syncKey)}
                        disabled={syncingId !== null}
                        className="text-muted-foreground hover:text-primary" title="Sincronizar agora">
                        <RefreshCw className={`h-4 w-4 ${syncingId === syncKey ? "animate-spin" : ""}`} />
                      </button>
                    )}
                    <button onClick={() => openEdit(a)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(a)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{ background: `color-mix(in oklab, ${a.color} 20%, transparent)`, color: a.color }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.institution_name ? `${a.institution_name} · ` : ""}{TYPE_LABEL[a.type]}
                        {a.account_mask ? ` · final ${a.account_mask}` : ""}
                        {a.bank_connection_id ? " · sincronizado" : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Saldo atual</p>
                  <p className={`text-2xl font-semibold tabular-nums ${bal < 0 ? "text-[color:var(--destructive)]" : ""}`}>
                    {formatBRL(bal)}
                  </p>
                  {isCredit && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Limite {formatBRL(a.credit_limit!)} · Disponível {formatBRL(available!)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

function AccountForm({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2"><Label>Nome</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nubank" />
      </div>
      <div className="space-y-2"><Label>Instituição (agrupa contas no painel)</Label>
        <Input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })}
          placeholder="Ex: Nubank, XP, Clear Corretora" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Tipo</Label>
          <Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.type === "credit" ? (
          <div className="space-y-2"><Label>Limite de crédito</Label>
            <Input inputMode="decimal" value={form.creditLimit}
              onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} placeholder="5000" />
          </div>
        ) : (
          <div className="space-y-2"><Label>Saldo inicial</Label>
            <Input inputMode="decimal" value={form.initial}
              onChange={(e) => setForm({ ...form, initial: e.target.value })} />
          </div>
        )}
      </div>
      <div className="space-y-2"><Label>Cor</Label>
        <div className="flex gap-2">
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
              className={`h-8 w-8 rounded-full border-2 ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  );
}
