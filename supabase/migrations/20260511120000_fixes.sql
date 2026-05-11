-- =============================================================
-- MIGRATION: fixes
-- =============================================================

-- ── 1. goals & accounts: FK ausente para auth.users ──────────
-- As tabelas goals, accounts, recurring_transactions e budgets
-- declaram user_id mas sem REFERENCES auth.users(id).
-- Isso permite inserções órfãs e impede o cascade correto.

ALTER TABLE public.goals
  ADD CONSTRAINT goals_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.recurring_transactions
  ADD CONSTRAINT recurring_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 2. recurring_transactions.type: TEXT em vez de ENUM ──────
-- A tabela usa TEXT para "type", mas transactions usa o ENUM
-- transaction_type. Isso quebra consistência e deixa passar
-- valores inválidos como "foo".

ALTER TABLE public.recurring_transactions
  ALTER COLUMN type TYPE public.transaction_type
  USING type::public.transaction_type;

-- ── 3. goals.current_amount: aceita valores negativos ────────
-- Não há CHECK constraint impedindo current_amount < 0.
-- Um aporte negativo passaria silenciosamente.

ALTER TABLE public.goals
  ADD CONSTRAINT goals_current_amount_non_negative
  CHECK (current_amount >= 0);

-- ── 4. Índices faltando para queries comuns ───────────────────
-- O dashboard faz queries por user_id em todas as tabelas.
-- Sem índice, cada query vira seq-scan.

CREATE INDEX IF NOT EXISTS idx_goals_user
  ON public.goals(user_id);

CREATE INDEX IF NOT EXISTS idx_accounts_user
  ON public.accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_recurring_user_active
  ON public.recurring_transactions(user_id, active, next_run);

CREATE INDEX IF NOT EXISTS idx_budgets_user
  ON public.budgets(user_id);

-- ── 5. budgets: UPSERT sem índice único funcional ────────────
-- A constraint UNIQUE(user_id, category) existe, mas o código
-- faz um SELECT + INSERT/UPDATE manual. Com a constraint certa
-- é possível usar INSERT ... ON CONFLICT DO UPDATE (upsert),
-- eliminando a race condition entre o SELECT e o INSERT.
-- A constraint já existe; documentamos aqui para referência
-- e adicionamos o índice explícito para garantir performance.

CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_user_category
  ON public.budgets(user_id, category);

-- ── 6. recurring_transactions: índice para materialize ───────
-- materializeRecurring() filtra active=true e ordena next_run.
-- O índice composto já criado acima cobre isso.

-- ── 7. goals.icon / accounts.icon: colunas não usadas no app ─
-- O código nunca lê nem escreve "icon" em goals ou accounts —
-- apenas "color" é utilizado. As colunas existem mas não têm
-- DEFAULT documentado consistente. Mantemos sem alteração para
-- não quebrar o schema gerado, mas alertamos via comentário.

COMMENT ON COLUMN public.goals.icon IS
  'Coluna não utilizada pelo frontend atual. Candidata a remoção futura.';

COMMENT ON COLUMN public.accounts.icon IS
  'Coluna não utilizada pelo frontend atual. Candidata a remoção futura.';
