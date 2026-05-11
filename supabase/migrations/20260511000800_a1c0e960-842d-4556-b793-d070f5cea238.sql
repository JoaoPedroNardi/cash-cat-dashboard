CREATE TABLE public.budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own budgets" ON public.budgets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own budgets" ON public.budgets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own budgets" ON public.budgets FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own budgets" ON public.budgets FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER budgets_set_updated_at BEFORE UPDATE ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();