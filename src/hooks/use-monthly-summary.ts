import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchMonthlySummary,
  type MonthlySummaryData,
} from "@/lib/monthly-summary";

export function useMonthlySummary() {
  const { user } = useAuth();
  const [data, setData] = useState<MonthlySummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (month: number, year: number, accountId?: string) => {
      if (!user) return;
      setLoading(true);
      setError(null);

      try {
        const result = await fetchMonthlySummary(user.id, month, year, accountId);
        setData(result);
      } catch (err: any) {
        setError(err?.message ?? "Erro ao carregar resumo");
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  return { data, loading, error, load };
}