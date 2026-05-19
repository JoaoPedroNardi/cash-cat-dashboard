import { useState, useCallback } from 'react';
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfYear,
} from 'date-fns';

export type PeriodType = 'all' | '12months' | 'year' | 'specific';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface MonthlyFilterState {
  period: PeriodType;
  selectedMonth: Date | null;
  dateRange: DateRange;
}

export const useMonthlyFilter = () => {
  const [filter, setFilter] = useState<MonthlyFilterState>({
    period: 'all',
    selectedMonth: null,
    dateRange: {
      startDate: new Date(2000, 0, 1),
      endDate: new Date(),
    },
  });

  const calculateDateRange = useCallback(
    (period: PeriodType, month?: Date): DateRange => {
      const today = new Date();

      switch (period) {
        case 'specific':
          if (!month) return filter.dateRange;
          return {
            startDate: startOfMonth(month),
            endDate: endOfMonth(month),
          };
        case 'year':
          return {
            startDate: startOfYear(today),
            endDate: endOfYear(today),
          };
        case '12months':
          return {
            startDate: subMonths(today, 12),
            endDate: today,
          };
        case 'all':
        default:
          return {
            startDate: new Date(2000, 0, 1),
            endDate: today,
          };
      }
    },
    [filter.dateRange]
  );

  const setPeriod = useCallback(
    (newPeriod: PeriodType) => {
      const dateRange = calculateDateRange(newPeriod);
      setFilter((prev) => ({
        ...prev,
        period: newPeriod,
        selectedMonth: newPeriod === 'specific' ? prev.selectedMonth || new Date() : null,
        dateRange,
      }));
    },
    [calculateDateRange]
  );

  const setMonth = useCallback(
    (month: Date) => {
      const dateRange = calculateDateRange('specific', month);
      setFilter((prev) => ({
        ...prev,
        selectedMonth: month,
        period: 'specific',
        dateRange,
      }));
    },
    [calculateDateRange]
  );

  return {
    filter,
    setPeriod,
    setMonth,
  };
};