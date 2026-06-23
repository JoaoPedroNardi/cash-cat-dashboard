/**
 * Ciclo de fatura global.
 *
 * Regra: compras a partir do dia `closingDay` (inclusive) entram na fatura do
 * mês SEGUINTE. Ex.: com fechamento no dia 19, tudo de 19/mai a 18/jun é a
 * "fatura de junho".
 */

export const DEFAULT_CLOSING_DAY = 19;

/** Mês-fatura ("YYYY-MM") ao qual uma data "YYYY-MM-DD" pertence. */
export function billingMonthKey(ymd: string, closingDay: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  let year = y;
  let month = m; // 1-based
  if (d >= closingDay) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Intervalo de datas (início/fim inclusivos) coberto por um mês-fatura.
 * `month1` é 1-based. A fatura vai do dia de fechamento do mês anterior até
 * o dia anterior ao fechamento deste mês.
 */
export function billingCycleRange(
  year: number,
  month1: number,
  closingDay: number
): { start: Date; end: Date } {
  const start = new Date(year, month1 - 2, closingDay);
  const end = new Date(year, month1 - 1, closingDay - 1);
  return { start, end };
}
