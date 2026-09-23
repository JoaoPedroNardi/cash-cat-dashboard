import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const listeners = new Set<() => void>();

/**
 * Script executado no <head> antes da primeira pintura: aplica o tema salvo sem "piscar".
 * O servidor sempre renderiza escuro (padrão do app); só o tema claro precisa ser aplicado aqui.
 */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem("${STORAGE_KEY}")==="light"){document.documentElement.classList.remove("dark")}}catch(e){}})();`;

// A classe do <html> é a fonte da verdade (já aplicada pelo script acima).
function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
function getServerSnapshot(): Theme {
  return "dark";
}
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Armazenamento indisponível (modo privado, etc.): o tema vale só até recarregar.
  }
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
