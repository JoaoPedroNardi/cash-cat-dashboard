import { useState } from "react";
import { DateRange, PeriodType } from "./use-monthly-filter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { generateInstallments } from "@/lib/installments";
import { z } from "zod";

const installmentSchema = z.object({
  description: z.string().min(1, "Descrição obrigatória"),
  totalAmount: z.number().positive("Valor precisa ser positivo"),
  installmentCount: z.number().int().min(2, "Mínimo 2 parcelas").max(48, "Máximo 48 parcelas"),
  startDate: z.string().min(1, "Data obrigatória"),
  category: z.string().min(1, "Categoria obrigatória"),
  accountId: z.string().min(1, "Conta obrigatória"),
});

export type InstallmentFormData = z.infer<typeof installmentSchema>;

export function useInstallments() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addInstallments = async (data: InstallmentFormData) => {
    if (!user) return { success: false, error: "Não autenticado" };

    setLoading(true);
    setError(null);

    try {
      const parsed = installmentSchema.parse(data);
      const groupId = crypto.randomUUID();

      const installments = generateInstallments({
        description: parsed.description,
        totalAmount: parsed.totalAmount,
        count: parsed.installmentCount,
        startDate: new Date(parsed.startDate),
        category: parsed.category,
        accountId: parsed.accountId,
        type: "expense",
      });

      // Insere diretamente nas transactions com installment_group
      const rows = installments.map((inst) => ({
        user_id: user.id,
        type: "expense" as const,
        description: inst.description,
        amount: inst.amount,
        occurred_at: inst.dueDate.toISOString().split("T")[0],
        category: inst.category,
        account_id: inst.accountId,
        installment_group: groupId,
        installment_index: inst.installmentNumber,
        installment_total: inst.installmentTotal,
      }));

      const { error: txErr } = await supabase.from("transactions").insert(rows);
      if (txErr) throw new Error(txErr.message);

      return { success: true };
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
