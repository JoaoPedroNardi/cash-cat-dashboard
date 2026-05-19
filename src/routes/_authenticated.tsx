import { createFileRoute, Outlet, Link, Navigate, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard, PlusCircle, ListOrdered, LogOut, Wallet, Target, CreditCard, Repeat,
  GitCompare, Upload, PiggyBank, CalendarDays, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { materializeRecurring } from "@/lib/recurring";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const navItems = [
  { to: "/dashboard",        label: "Geral",           icon: LayoutDashboard },
  { to: "/add",              label: "Adicionar",        icon: PlusCircle },
  { to: "/transactions",     label: "Histórico",        icon: ListOrdered },
  { to: "/monthly-summary",  label: "Resumo mensal",    icon: BarChart3 },
  { to: "/compare",          label: "Comparar",         icon: GitCompare },
  { to: "/import",           label: "Importar",         icon: Upload },
  { to: "/budgets",          label: "Orçamentos",       icon: PiggyBank },
  { to: "/goals",            label: "Metas",            icon: Target },
  { to: "/accounts",         label: "Contas",           icon: CreditCard },
  { to: "/billing-settings", label: "Datas de fatura",  icon: CalendarDays },
  { to: "/recurring",        label: "Recorrentes",      icon: Repeat },
] as const;

function AuthLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (user) {
      materializeRecurring().then((n) => {
        if (n > 0) toast.success(`${n} transação(ões) recorrente(s) lançadas`);
      });
    }
  }, [user]);

  const logout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-60 flex-col border-r border-sidebar-border bg-sidebar p-5">
        <Link to="/dashboard" className="flex items-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
            <Wallet className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight text-sidebar-foreground">Finança</span>
        </Link>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.to;
            return (
              <Link key={item.to} to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Button variant="ghost" onClick={logout} className="justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground">
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </Button>
      </aside>

      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-sidebar-border flex justify-around p-2 overflow-x-auto">
        {navItems.map((item) => {
          const active = pathname === item.to;
          return (
            <Link key={item.to} to={item.to}
              className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-md text-[10px] shrink-0 ${
                active ? "text-primary" : "text-sidebar-foreground/60"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <main className="flex-1 pb-24 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
