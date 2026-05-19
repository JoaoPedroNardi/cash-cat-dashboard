-- ── 1. Grupo de parcelamentos ────────────────────────────────
-- Rastreia cada compra parcelada como um grupo
CREATE TABLE IF NOT EXISTS public.installment_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  installment_count INTEGER NOT NULL CHECK (installment_count >= 2),
  start_date  DATE NOT NULL,
  account_id  UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.installment_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own installment_groups"
  ON public.installment_groups FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_installment_groups_user ON public.installment_groups(user_id);
CREATE INDEX idx_installment_groups_account ON public.installment_groups(account_id);

-- ── 2. Colunas de parcelamento em transactions ───────────────
-- Liga cada parcela ao grupo e guarda índice/total
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS installment_group_id UUID REFERENCES public.installment_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installment_number    INTEGER CHECK (installment_number >= 1),
  ADD COLUMN IF NOT EXISTS installment_total     INTEGER CHECK (installment_total >= 1);

CREATE INDEX IF NOT EXISTS idx_transactions_installment_group_id
  ON public.transactions(installment_group_id)
  WHERE installment_group_id IS NOT NULL;

-- ── 3. Datas de fatura por conta (billing_dates) ─────────────
-- Separado da tabela accounts para permitir histórico futuro
CREATE TABLE IF NOT EXISTS public.billing_dates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  closing_day  INTEGER NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day      INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_id)
);

ALTER TABLE public.billing_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own billing_dates"
  ON public.billing_dates FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_billing_dates_user    ON public.billing_dates(user_id);
CREATE INDEX idx_billing_dates_account ON public.billing_dates(account_id);
