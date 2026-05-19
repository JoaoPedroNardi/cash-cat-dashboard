import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface BillingDateRecord {
  id: string; 
  account_id: string;
  closing_day: number;
  due_day: number;
}

export function useBillingDates() {
  const { user } = useAuth();
  const [records, setRecords] = useState<BillingDateRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("billing_dates")
      .select("*")
      .eq("user_id", user.id);
    if (data) setRecords(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const upsert = async (
    accountId: string,
    closingDay: number,
    dueDay: number
  ) => {
    if (!user) return { success: false, error: "Usuário não autenticado" };

    const existing = records.find((r) => r.account_id === accountId);

    if (existing) {
      const { error } = await supabase
        .from("billing_dates")
        .update({ closing_day: closingDay, due_day: dueDay })
        .eq("id", existing.id);

      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase.from("billing_dates").insert({
        account_id: accountId,
        user_id: user.id,
        closing_day: closingDay,
        due_day: dueDay,
      });

      if (error) return { success: false, error: error.message };
    }

    await fetch();
    return { success: true };
  };

  const remove = async (recordId: string) => {
    const { error } = await supabase
      .from("billing_dates")
      .delete()
      .eq("id", recordId);

    if (error) return { success: false, error: error.message };

    await fetch();
    return { success: true };
  };

  return { records, loading, upsert, remove, refetch: fetch };
}