import {
  UtensilsCrossed, Car, Home, Gamepad2, HeartPulse, GraduationCap, ShoppingBag, Package,
  Briefcase, Laptop, TrendingUp, Gift, Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TxType = "expense" | "income";

export interface Category {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string; // hsl/oklch token reference
}

export const EXPENSE_CATEGORIES: Category[] = [
  { id: "alimentacao", label: "Alimentação", icon: UtensilsCrossed, color: "var(--chart-4)" },
  { id: "transporte", label: "Transporte", icon: Car, color: "var(--chart-5)" },
  { id: "moradia", label: "Moradia", icon: Home, color: "var(--chart-2)" },
  { id: "lazer", label: "Lazer", icon: Gamepad2, color: "var(--chart-3)" },
  { id: "saude", label: "Saúde", icon: HeartPulse, color: "var(--destructive)" },
  { id: "educacao", label: "Educação", icon: GraduationCap, color: "var(--chart-2)" },
  { id: "compras", label: "Compras", icon: ShoppingBag, color: "var(--accent)" },
  { id: "outros", label: "Outros", icon: Package, color: "var(--muted-foreground)" },
];

export const INCOME_CATEGORIES: Category[] = [
  { id: "salario", label: "Salário", icon: Briefcase, color: "var(--primary)" },
  { id: "freelance", label: "Freelance", icon: Laptop, color: "var(--chart-2)" },
  { id: "investimentos", label: "Investimentos", icon: TrendingUp, color: "var(--chart-3)" },
  { id: "presente", label: "Presente", icon: Gift, color: "var(--accent)" },
  { id: "outros", label: "Outros", icon: Wallet, color: "var(--muted-foreground)" },
];

export function getCategory(type: TxType, id: string): Category {
  const list = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  return list.find((c) => c.id === id) ?? list[list.length - 1];
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
