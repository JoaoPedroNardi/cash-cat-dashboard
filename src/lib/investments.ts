export interface Investment {
  id: string;
  bank_connection_id: string | null;
  name: string;
  code: string | null;
  type: string;
  subtype: string | null;
  balance: number;
  quantity: number | null;
  unit_value: number | null;
  invested_amount: number | null;
  rate: number | null;
  rate_type: string | null;
  due_date: string | null;
  issuer: string | null;
  status: string;
  as_of: string | null;
}

export interface InvestmentClass {
  id: string;
  label: string;
  color: string;
}

export const INVESTMENT_CLASSES: InvestmentClass[] = [
  { id: "renda_fixa", label: "Renda fixa", color: "var(--chart-1)" },
  { id: "acoes", label: "Ações", color: "var(--chart-2)" },
  { id: "fii", label: "Fundos imobiliários", color: "var(--chart-3)" },
  { id: "etf", label: "ETFs", color: "var(--chart-5)" },
  { id: "fundos", label: "Fundos de investimento", color: "var(--chart-6)" },
  { id: "outros", label: "Outros", color: "var(--muted-foreground)" },
];

/** Classe do ativo a partir do tipo/subtipo que a Pluggy informa. */
export function investmentClass(type: string, subtype: string | null): InvestmentClass {
  let id = "outros";
  if (type === "FIXED_INCOME") id = "renda_fixa";
  else if (type === "ETF") id = "etf";
  else if (type === "MUTUAL_FUND") id = "fundos";
  else if (type === "EQUITY") id = subtype === "REAL_ESTATE_FUND" ? "fii" : "acoes";
  return INVESTMENT_CLASSES.find((c) => c.id === id)!;
}

/** Encerrado = posição zerada (resgatada/vendida por completo). */
export function isActiveInvestment(status: string): boolean {
  return status !== "TOTAL_WITHDRAWAL";
}

const SUBTYPE_LABEL: Record<string, string> = {
  STOCK: "Ação",
  REAL_ESTATE_FUND: "Fundo imobiliário",
  ETF: "ETF",
  TREASURY: "Tesouro Direto",
  CDB: "CDB",
  LCI: "LCI",
  LCA: "LCA",
  LC: "LC",
  DEBENTURES: "Debênture",
  CRI: "CRI",
  CRA: "CRA",
};

export function investmentSubtypeLabel(subtype: string | null): string | null {
  return subtype ? (SUBTYPE_LABEL[subtype] ?? subtype) : null;
}

export function formatRate(rate: number | null, rateType: string | null): string | null {
  if (rate == null) return null;
  const pct = `${rate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  return rateType ? `${rateType} + ${pct}` : pct;
}
