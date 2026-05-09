import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, getCategory } from "@/lib/categories";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Histórico — Finança" }] }),
  component: TxList,
});

interface Tx {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string | null;
  occurred_at: string;
}

function TxList() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("id,type,amount,category,description,occurred_at")
      .order("occurred_at", { ascending: false });
    setTxs((data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido");
    setTxs((p) => p.filter((t) => t.id !== id));
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Histórico</h1>
        <p className="text-muted-foreground mt-1">Todas as suas transações</p>
      </header>

      <div className="bg-gradient-card border border-border rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <p className="text-muted-foreground text-center py-12">Carregando...</p>
        ) : txs.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">Nenhuma transação ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {txs.map((t) => {
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
    </div>
  );
}
