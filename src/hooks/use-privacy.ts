import { useCallback, useSyncExternalStore } from "react";
import { formatBRL } from "@/lib/categories";

const STORAGE_KEY = "hide-balances";
const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function getServerSnapshot(): boolean {
  return false;
}
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function setHideBalances(hidden: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
  } catch {
    // Armazenamento indisponível: a escolha vale só até recarregar.
  }
  listeners.forEach((listener) => listener());
}

/** Modo privacidade: esconde valores em dinheiro nas telas de saldo. Compartilhado entre telas. */
export function usePrivacy() {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { hidden, toggle: () => setHideBalances(!hidden) };
}

/** Formatador de moeda que respeita o modo privacidade (estável enquanto o modo não muda). */
export function useMoney() {
  const { hidden } = usePrivacy();
  return useCallback((value: number) => (hidden ? "R$ ••••" : formatBRL(value)), [hidden]);
}
