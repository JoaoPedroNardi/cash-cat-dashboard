import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileText, Check, X } from "lucide-react";
import { formatBRL, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Importar — Finança" }] }),
  component: ImportPage,
});

interface Row {
  selected: boolean;
  date: string;          // yyyy-mm-dd
  amount: number;        // absolute
  type: "income" | "expense";
  description: string;
  category: string;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  s = s.trim();
  // OFX: YYYYMMDD or YYYYMMDDHHMMSS
  let m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // ISO
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // BR dd/mm/yyyy
  m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // US mm/dd/yyyy fallback
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseAmount(s: string): number | null {
  if (!s) return null;
  let v = s.trim().replace(/[R$\s]/g, "");
  // BR style "1.234,56" -> "1234.56"; US style "1,234.56" -> "1234.56"
  if (/,\d{1,2}$/.test(v) && /\./.test(v)) v = v.replace(/\./g, "").replace(",", ".");
  else if (/,\d{1,2}$/.test(v)) v = v.replace(",", ".");
  else v = v.replace(/,/g, "");
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function splitCSVLine(line: string, sep = ","): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === sep && !inQ) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCSV(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const header = splitCSVLine(lines[0], sep).map((h) => h.toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const di = idx(["date", "data"]);
  const ai = idx(["amount", "valor", "value"]);
  const desci = idx(["desc", "memo", "histórico", "historic", "title", "name"]);
  const ti = idx(["type", "tipo"]);
  if (di < 0 || ai < 0) return [];

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], sep);
    const date = parseDate(cols[di] ?? "");
    const amt = parseAmount(cols[ai] ?? "");
    if (!date || amt === null) continue;
    const desc = (desci >= 0 ? cols[desci] : "") || "";
    let type: "income" | "expense";
    if (ti >= 0 && cols[ti]) {
      const tv = cols[ti].toLowerCase();
      type = /(in|cred|ent|rec|gan)/.test(tv) ? "income" : "expense";
    } else {
      type = amt >= 0 ? "income" : "expense";
    }
    rows.push({ selected: true, date, amount: Math.abs(amt), type, description: desc, category: type === "income" ? "outros" : "outros" });
  }
  return rows;
}

function parseOFX(text: string): Row[] {
  const rows: Row[] = [];
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
  let m;
  while ((m = re.exec(text))) {
    const block = m[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i").exec(block);
      return r ? r[1].trim() : "";
    };
    const date = parseDate(get("DTPOSTED"));
    const amt = parseAmount(get("TRNAMT"));
    if (!date || amt === null) continue;
    const desc = get("MEMO") || get("NAME") || "";
    const type: "income" | "expense" = amt >= 0 ? "income" : "expense";
    rows.push({ selected: true, date, amount: Math.abs(amt), type, description: desc, category: "outros" });
  }
  return rows;
}

function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [accountId, setAccountId] = useState<string>("none");
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    supabase.from("accounts").select("id,name").order("created_at").then(({ data }) => {
      setAccounts(data ?? []);
    });
  }, []);

  const handleFile = async (f: File) => {
    setFile(f);
    setParsing(true);
    const text = await f.text();
    const lower = f.name.toLowerCase();
    const r = lower.endsWith(".ofx") || text.includes("<STMTTRN>") ? parseOFX(text) : parseCSV(text);
    setRows(r);
    setParsing(false);
    if (r.length === 0) toast.error("Nenhuma transação reconhecida no arquivo");
    else toast.success(`${r.length} transação(ões) encontrada(s)`);
  };

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const selectedCount = useMemo(() => rows.filter((r) => r.selected).length, [rows]);
  const total = useMemo(
    () => rows.filter((r) => r.selected).reduce((acc, r) => acc + (r.type === "income" ? r.amount : -r.amount), 0),
    [rows]
  );

  const submit = async () => {
    const sel = rows.filter((r) => r.selected);
    if (sel.length === 0) { toast.error("Selecione ao menos uma transação"); return; }
    setImporting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setImporting(false); return; }
    const payload = sel.map((r) => ({
      user_id: u.user!.id,
      type: r.type,
      amount: r.amount,
      category: r.category,
      description: r.description || null,
      occurred_at: r.date,
      account_id: accountId === "none" ? null : accountId,
    }));
    const { error } = await supabase.from("transactions").insert(payload);
    setImporting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${sel.length} transação(ões) importada(s)`);
    setRows([]); setFile(null);
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Importar extrato</h1>
        <p className="text-muted-foreground mt-1">CSV ou OFX do seu banco — confira e importe</p>
      </header>

      <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex-1 min-w-[260px]">
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:bg-muted/30 transition">
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">{file ? file.name : "Selecione um arquivo .csv ou .ofx"}</p>
              <p className="text-xs text-muted-foreground mt-1">CSV deve ter colunas Data e Valor</p>
              <input type="file" accept=".csv,.ofx,.qfx,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          </label>

          <div className="space-y-2 min-w-[220px]">
            <Label>Conta de destino</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Sem conta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem conta</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {parsing && <p className="text-muted-foreground text-center py-8">Lendo arquivo...</p>}

      {!parsing && rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="text-sm">
              <span className="font-medium">{selectedCount}</span> de {rows.length} selecionadas •{" "}
              <span className={total >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}>
                Líquido {formatBRL(total)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: true })))}>
                <Check className="h-4 w-4 mr-1" /> Todas
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: false })))}>
                <X className="h-4 w-4 mr-1" /> Nenhuma
              </Button>
              <Button onClick={submit} disabled={importing || selectedCount === 0}
                className="bg-gradient-primary text-primary-foreground shadow-glow">
                {importing ? "Importando..." : `Importar ${selectedCount}`}
              </Button>
            </div>
          </div>

          <div className="bg-gradient-card border border-border rounded-2xl shadow-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="p-3 w-10"></th>
                  <th className="p-3">Data</th>
                  <th className="p-3">Descrição</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cats = r.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-3">
                        <Checkbox checked={r.selected} onCheckedChange={(v) => updateRow(i, { selected: !!v })} />
                      </td>
                      <td className="p-3 tabular-nums whitespace-nowrap">
                        {new Date(r.date).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="p-3 max-w-[280px]">
                        <input value={r.description}
                          onChange={(e) => updateRow(i, { description: e.target.value })}
                          className="w-full bg-transparent outline-none border-b border-transparent focus:border-border" />
                      </td>
                      <td className="p-3">
                        <Select value={r.type} onValueChange={(v: "income" | "expense") => updateRow(i, { type: v, category: "outros" })}>
                          <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="expense">Gasto</SelectItem>
                            <SelectItem value="income">Ganho</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <Select value={r.category} onValueChange={(v) => updateRow(i, { category: v })}>
                          <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className={`p-3 text-right tabular-nums font-medium ${r.type === "income" ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}>
                        {r.type === "income" ? "+" : "−"}{formatBRL(r.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!parsing && rows.length === 0 && !file && (
        <div className="bg-gradient-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2" />
          Nenhum arquivo carregado.
        </div>
      )}
    </div>
  );
}
