import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { DateRange } from './use-monthly-filter';
import { startOfMonth, endOfMonth } from 'date-fns';

export interface DashboardData {
  transactions: any[];
  totalExpenses: number;
  totalIncome: number;
  balance: number;
  categoriesBreakdown: Record<string, number>;
}

export function useDashboard(dateRange?: DateRange) {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !dateRange) return;

    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: transactions, error: txError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .gte('occurred_at', dateRange.startDate.toISOString().split('T')[0])
          .lte('occurred_at', dateRange.endDate.toISOString().split('T')[0])
          .order('occurred_at', { ascending: false });

        if (txError) throw txError;

        // Calcular totais
        const expenses = transactions
          ?.filter((t) => t.type === 'expense')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        const income = transactions
          ?.filter((t) => t.type === 'income')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        // Breakdown por categoria
        const breakdown: Record<string, number> = {};
        transactions?.forEach((t) => {
          if (t.type === 'expense') {
            breakdown[t.category] = (breakdown[t.category] || 0) + t.amount;
          }
        });

        setData({
          transactions: transactions || [],
          totalExpenses: expenses,
          totalIncome: income,
          balance: income - expenses,
          categoriesBreakdown: breakdown,
        });
      } catch (err) {
        console.error('Erro ao buscar dados do dashboard:', err);
        setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, dateRange]);

  return { data, loading, error };
}