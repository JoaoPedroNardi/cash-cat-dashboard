import { addMonths, startOfMonth, format } from "date-fns";

export interface InstallmentInput {
  description: string;
  totalAmount: number;
  count: number;
  startDate: Date;
  category: string;
  accountId: string;
  type: "expense";
}

export interface InstallmentOutput {
  description: string;
  amount: number;
  dueDate: Date;
  installmentNumber: number;
  installmentTotal: number;
  category: string;
  accountId: string;
  type: "expense";
}

export function generateInstallments(
  input: InstallmentInput
): InstallmentOutput[] {
  const { description, totalAmount, count, startDate, category, accountId } =
    input;

  const baseAmount = Math.floor((totalAmount * 100) / count) / 100;
  const remainder = Math.round((totalAmount - baseAmount * count) * 100) / 100;

  const installments: InstallmentOutput[] = [];

  for (let i = 0; i < count; i++) {
    const amount = i === 0 ? baseAmount + remainder : baseAmount;
    const dueDate = addMonths(startOfMonth(startDate), i);

    installments.push({
      description: `${description} (${i + 1}/${count})`,
      amount: Math.round(amount * 100) / 100,
      dueDate,
      installmentNumber: i + 1,
      installmentTotal: count,
      category,
      accountId,
      type: "expense",
    });
  }

  return installments;
}

export function calculateInstallmentPreview(
  totalAmount: number,
  count: number
): { baseAmount: number; remainder: number; total: number } {
  const base = Math.floor((totalAmount * 100) / count) / 100;
  const rem = Math.round((totalAmount - base * count) * 100) / 100;
  return { baseAmount: base, remainder: rem, total: totalAmount };
}