import { supabase } from "@/integrations/supabase/client";

export interface MonthlyBreakdownItem {
  category: string;
  totalExpenses: number;
  budgetAmount: number | null;
  percentage: number;
  transactionCount: number;
}

export interface MonthlySummaryData {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  breakdown: MonthlyBreakdownItem[];
  activeInstallments: {
    description: string;
    installmentTotal: number;
    installmentIndex: number;
    amount: number;
    occurred_at: string;
  }[];
}

export async function fetchMonthlySummary(
  _userId: string,
  month: number,
  year: number,
  accountId?: string
): Promise<MonthlySummaryData> {
  // occurred_at é o campo correto na tabela transactions
  const startDate = new Date(year, month, 1).toISOString().split("T")[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

  let query = supabase
    .from("transactions")
    .select("id,type,amount,category,description,occurred_at,installment_group,installment_index,installment_total")
    .gte("occurred_at", startDate)
    .lte("occurred_at", endDate);

  if (accountId) query = query.eq("account_id", accountId);

  const [{ data: transactions }, { data: budgets }] = await Promise.all([
    query,
    // budgets não tem month/year — busca tudo e usa como limites mensais
    supabase.from("budgets").select("category,amount"),
  ]);

  const totalIncome = transactions
    ?.filter((t) => t.type === "income")
    .reduce((acc, t) => acc + Number(t.amount), 0) ?? 0;

  const totalExpenses = transactions
    ?.filter((t) => t.type === "expense")
    .reduce((acc, t) => acc + Number(t.amount), 0) ?? 0;

  // Agrupar por categoria
  const categoryMap = new Map<string, { total: number; count: number }>();
  transactions
    ?.filter((t) => t.type === "expense")
    .forEach((t) => {
      const cur = categoryMap.get(t.category) ?? { total: 0, count: 0 };
      categoryMap.set(t.category, { total: cur.total + Number(t.amount), count: cur.count + 1 });
    });

  const budgetMap = new Map((budgets ?? []).map((b: any) => [b.category, Number(b.amount)]));

  const breakdown: MonthlyBreakdownItem[] = [];
  categoryMap.forEach(({ total, count }, category) => {
    const budgetAmount = budgetMap.get(category) ?? null;
    const percentage = budgetAmount && budgetAmount > 0
      ? Math.min(100, Math.round((total / budgetAmount) * 100))
      : 0;
    breakdown.push({ category, totalExpenses: total, budgetAmount, percentage, transactionCount: count });
  });
  breakdown.sort((a, b) => b.totalExpenses - a.totalExpenses);

  // Parcelas ativas no mês
  const activeInstallments = (transactions ?? [])
    .filter((t) => t.installment_group && t.installment_total && t.installment_total > 1 && t.type === "expense")
    .map((t) => ({
      description: t.description ?? "",
      installmentTotal: t.installment_total!,
      installmentIndex: t.installment_index!,
      amount: Number(t.amount),
      occurred_at: t.occurred_at,
    }));

  return {
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    breakdown,
    activeInstallments,
  };
}
