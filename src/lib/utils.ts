import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Data de hoje no fuso LOCAL, no formato "YYYY-MM-DD" (para inputs type=date).
 * Evita o uso de toISOString(), que converte para UTC e pode adiantar/atrasar o dia.
 */
export function todayYMD(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Formata uma string "YYYY-MM-DD" como data local pt-BR, SEM deslocamento de fuso.
 * `new Date("2026-06-23")` é interpretado como meia-noite UTC e, em UTC-3, exibe o
 * dia anterior. Forçar "T00:00:00" faz o parse acontecer no horário local.
 */
export function formatDateBR(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString("pt-BR");
}
