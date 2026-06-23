import { useState } from "react";
import { DEFAULT_CLOSING_DAY } from "@/lib/billing";

const STORAGE_KEY = "billing_closing_day";

/**
 * Dia de fechamento da fatura, global e persistido no navegador (localStorage).
 * Simples de propósito — é um único número que raramente muda.
 */
export function useBillingClosingDay() {
  const [day, setDayState] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_CLOSING_DAY;
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return v >= 1 && v <= 28 ? v : DEFAULT_CLOSING_DAY;
  });

  const setDay = (d: number) => {
    const clamped = Math.max(1, Math.min(28, d));
    setDayState(clamped);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    }
  };

  return { day, setDay };
}
