import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Data de hoje no fuso LOCAL, no formato "YYYY-MM-DD" (para inputs type=date).
 * Evita o uso de toISOString(), que converte para UTC e pode adiantar/atrasar o dia.
 */
export function dateToYMD(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayYMD(): string {
  return dateToYMD(new Date());
}

/**
 * Formata uma string "YYYY-MM-DD" como data local pt-BR, SEM deslocamento de fuso.
 * `new Date("2026-06-23")` é interpretado como meia-noite UTC e, em UTC-3, exibe o
 * dia anterior. Forçar "T00:00:00" faz o parse acontecer no horário local.
 */
export function formatDateBR(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString("pt-BR");
}

/**
 * Soma `n` meses a uma data "YYYY-MM-DD", preservando o dia mas SEM estourar
 * para o mês seguinte. Ex.: 31/jan + 1 mês = 28/fev (não 03/mar). Tudo em
 * string, sem objeto Date intermediário, então não há deslocamento de fuso.
 */
export function addMonthsYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const idx = (m - 1) + n;
  const year = y + Math.floor(idx / 12);
  const month = ((idx % 12) + 12) % 12; // 0-based, tolera negativos
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
