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
    totalAmount: number;
    paidCount: number;
    remainingCount: number;
    remainingAmount: number;
    nextDueDate: string;
  }[];
}

export async function fetchMonthlySummary(
  userId: string,
  month: number,
  year: number,
  accountId?: string
): Promise<MonthlySummaryData> {
  const startDate = new Date(year, month, 1).toISOString().split("T")[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

  // Buscar transações do mês
  let query = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .gte("occurred_at", startDate)
    .lte("occurred_at", endDate);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data: transactions } = await query;

  // Buscar orçamentos
  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", userId)
    .eq("month", month + 1)
    .eq("year", year);

  // Buscar parcelamentos ativos
  const { data: installments } = await supabase
    .from("installment_groups")
    .select("*")
    .eq("user_id", userId);

  const totalIncome = transactions
    ?.filter((t) => t.type === "income")
    .reduce((acc, t) => acc + Number(t.amount), 0) ?? 0;

  const totalExpenses = transactions
    ?.filter((t) => t.type === "expense")
    .reduce((acc, t) => acc + Number(t.amount), 0) ?? 0;

  // Agrupar por categoria
  const categoryMap = new Map<string, number>();
  transactions
    ?.filter((t) => t.type === "expense")
    .forEach((t) => {
      const current = categoryMap.get(t.category) ?? 0;
      categoryMap.set(t.category, current + Number(t.amount));
    });

  const breakdown: MonthlyBreakdownItem[] = [];
  categoryMap.forEach((totalExpensesPerCat, category) => {
    const budget = budgets?.find((b) => b.category === category);
    const percentage = budget && budget.amount > 0
      ? Math.round((totalExpensesPerCat / Number(budget.amount)) * 100)
      : 0;

    breakdown.push({
      category,
      totalExpenses: totalExpensesPerCat,
      budgetAmount: budget ? Number(budget.amount) : null,
      percentage: Math.min(percentage, 100),
      transactionCount: transactions?.filter(
        (t) => t.category === category && t.type === "expense"
      ).length ?? 0,
    });
  });

  // Parcelamentos ativos (com parcelas restantes)
  const activeInstallments = (installments ?? [])
    .filter((inst) => {
      const start = new Date(inst.start_date);
      const totalMonths = (month - start.getMonth()) + (year - start.getFullYear()) * 12;
      return totalMonths < inst.installment_count;
    })
    .map((inst) => {
      const start = new Date(inst.start_date);
      const totalMonths = (month - start.getMonth()) + (year - start.getFullYear()) * 12;
      const paidCount = Math.max(0, totalMonths);
      const remainingCount = inst.installment_count - paidCount;
      const installmentAmount = Math.round((Number(inst.total_amount) / inst.installment_count) * 100) / 100;
      const remainingAmount = Math.round(installmentAmount * remainingCount * 100) / 100;
      const nextDueDate = new Date(year, month, 1);
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);

      return {
        description: inst.description,
        totalAmount: Number(inst.total_amount),
        paidCount,
        remainingCount,
        remainingAmount,
        nextDueDate: nextDueDate.toISOString().split("T")[0],
      };
    });

  return {
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    breakdown,
    activeInstallments,
  };
}