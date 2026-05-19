import {
  startOfMonth,
  endOfMonth,
  setDate,
  subMonths,
  isWithinInterval,
  parse,
} from "date-fns";

export interface BillingConfig {
  closingDay: number;
  dueDay: number;
}

export interface BillingPeriod {
  label: string;
  start: Date;
  end: Date;
  dueDate: Date;
  month: number;
  year: number;
}

export function getBillingPeriodDates(
  referenceMonth: Date,
  config: BillingConfig
): BillingPeriod {
  const monthStart = startOfMonth(referenceMonth);
  const monthEnd = endOfMonth(referenceMonth);

  const closing = Math.min(config.closingDay, daysInMonth(referenceMonth));

  let periodStart: Date;
  let periodEnd: Date;
  let dueDate: Date;

  if (referenceMonth.getDate() <= closing) {
    // Estamos no período da fatura que fecha este mês
    const prevMonth = subMonths(referenceMonth, 1);
    const prevClosing = Math.min(config.closingDay, daysInMonth(prevMonth));
    periodStart = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), prevClosing + 1);
    periodEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), closing);
    dueDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(config.dueDay, daysInMonth(monthStart)));
  } else {
    // Já passou do fechamento — fatura do próximo mês
    const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    periodStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), closing + 1);
    periodEnd = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(config.closingDay, daysInMonth(subMonths(nextMonth, 1))));
    dueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(config.dueDay, daysInMonth(nextMonth)));
  }

  return {
    label: `${periodStart.getMonth() + 1}/${periodStart.getFullYear()}`,,
    start: periodStart,
    end: periodEnd,
    dueDate,
    month: monthStart.getMonth(),
    year: monthStart.getFullYear(),
  };
}

export function isTransactionInBillingPeriod(
  transactionDate: Date,
  period: BillingPeriod
): boolean {
  return isWithinInterval(transactionDate, {
    start: period.start,
    end: period.end,
  });
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function generateBillingPeriods(
  baseDate: Date,
  monthsBack: number,
  monthsAhead: number,
  config: BillingConfig
): BillingPeriod[] {
  const periods: BillingPeriod[] = [];
  for (let i = -monthsBack; i <= monthsAhead; i++) {
    const refDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
    periods.push(getBillingPeriodDates(refDate, config));
  }
  return periods;
}