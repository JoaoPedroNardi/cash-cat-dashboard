import { useState } from "react";
import { DateRange } from './use-monthly-filter';
import { isBetween } from 'date-fns';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { generateInstallments, type InstallmentInput } from "@/lib/installments";
import { z } from "zod";

const installmentSchema = z.object({
  description: z.string().min(3, "Descrição precisa ter ao menos 3 caracteres"),
  totalAmount: z.number().positive("Valor precisa ser positivo"),
  installmentCount: z.number().int().min(2, "Mínimo de 2 parcelas").max(48, "Máximo de 48 parcelas"),
  startDate: z.string().min(1, "Data é obrigatória"),
  category: z.string().min(1, "Categoria é obrigatória"),
  accountId: z.string().min(1, "Conta é obrigatória"),
});

export type InstallmentFormData = z.infer<typeof installmentSchema>;

export function useInstallments() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addInstallments = async (data: InstallmentFormData) => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const parsed = installmentSchema.parse(data);

      const installments = generateInstallments({
        description: parsed.description,
        totalAmount: parsed.totalAmount,
        count: parsed.installmentCount,
        startDate: new Date(parsed.startDate),
        category: parsed.category,
        accountId: parsed.accountId,
        type: "expense",
      });

      // Criar o grupo de parcelamento
      const { data: group, error: groupError } = await supabase
        .from("installment_groups")
        .insert({
          user_id: user.id,
          description: parsed.description,
          total_amount: parsed.totalAmount,
          installment_count: parsed.installmentCount,
          start_date: parsed.startDate,
          account_id: parsed.accountId,
        })
        .select()
        .single();

      if (groupError || !group) {
        throw new Error(groupError?.message ?? "Erro ao criar grupo de parcelamento");
      }

      // Criar as transações (uma por parcela)
      const transactions = installments.map((inst) => ({
        user_id: user.id,
        description: inst.description,
        amount: inst.amount,
        date: inst.dueDate.toISOString().split("T")[0],
        category: inst.category,
        account_id: inst.accountId,
        type: "expense" as const,
        installment_group_id: group.id,
        installment_number: inst.installmentNumber,
        installment_total: inst.installmentTotal,
      }));

      const { error: txnError } = await supabase
        .from("transactions")
        .insert(transactions);

      if (txnError) {
        throw new Error(txnError.message);
      }

      return { success: true, groupId: group.id };
    } catch (err: any) {
      const msg = err?.message ?? "Erro desconhecido";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  return { addInstallments, loading, error };
}

export const getInstallmentsByPeriod = (
  installments: any[],
  dateRange: DateRange,
  period: PeriodType,
) => {
  if (period === 'specific') {
    // Mostrar apenas parcelas com vencimento no mês específico
    return installments
      .map((inst) => ({
        ...inst,
        parcels: inst.parcels?.filter(
          (parcel: any) =>
            isBetween(new Date(parcel.due_date), dateRange.startDate, dateRange.endDate)
        ),
      }))
      .filter((inst) => inst.parcels && inst.parcels.length > 0);
  } else {
    // Mostrar resumo geral de parcelas ativas
    return installments.map((inst) => {
      const paidAmount = inst.parcels
        ?.filter((p: any) => p.status === 'paid')
        .reduce((sum: number, p: any) => sum + p.amount, 0) || 0;

      const remainingMonths = Math.ceil(
        (new Date(inst.end_date).getTime() - new Date().getTime()) / (30 * 24 * 60 * 60 * 1000)
      );

      return {
        ...inst,
        totalValue: inst.total_amount,
        paidValue: paidAmount,
        remainingValue: inst.total_amount - paidAmount,
        remainingMonths,
      };
    });
  }
};