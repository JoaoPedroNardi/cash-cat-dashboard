-- =====================================================================
-- Finança — schema completo (idempotente). Fonte única da verdade.
-- Seguro rodar quantas vezes quiser: tabelas existentes são puladas.
-- =====================================================================

-- 1) Enums --------------------------------------------------------------
do $$ begin create type public.transaction_type as enum ('income','expense');
exception when duplicate_object then null; end $$;

do $$ begin create type public.account_type as enum ('wallet','checking','savings','credit','debit','other');
exception when duplicate_object then null; end $$;

do $$ begin create type public.recurrence_freq as enum ('weekly','monthly','yearly');
exception when duplicate_object then null; end $$;

-- 2) Contas -------------------------------------------------------------
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  type            public.account_type not null default 'checking',
  color           text not null default 'var(--primary)',
  icon            text not null default 'wallet',
  initial_balance numeric not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 3) Transações ---------------------------------------------------------
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        public.transaction_type not null,
  amount      numeric(12,2) not null check (amount > 0),
  category    text not null,
  description text,
  occurred_at date not null default current_date,
  account_id  uuid references public.accounts(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 4) Metas --------------------------------------------------------------
create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  target_amount  numeric not null check (target_amount > 0),
  current_amount numeric not null default 0 check (current_amount >= 0),
  target_date    date,
  color          text not null default 'var(--primary)',
  icon           text not null default 'target',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 5) Orçamentos (global por categoria) ----------------------------------
create table if not exists public.budgets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  category   text not null,
  amount     numeric not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);

-- 6) Recorrentes --------------------------------------------------------
create table if not exists public.recurring_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        public.transaction_type not null,
  amount      numeric not null check (amount > 0),
  category    text not null,
  description text,
  account_id  uuid references public.accounts(id) on delete set null,
  frequency   public.recurrence_freq not null default 'monthly',
  start_date  date not null default current_date,
  next_run    date not null default current_date,
  end_date    date,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 7) Índices ------------------------------------------------------------
create index if not exists idx_transactions_user_date on public.transactions(user_id, occurred_at desc);
create index if not exists idx_transactions_account   on public.transactions(account_id);
create index if not exists idx_accounts_user          on public.accounts(user_id);
create index if not exists idx_goals_user             on public.goals(user_id);
create index if not exists idx_budgets_user_category  on public.budgets(user_id, category);
create index if not exists idx_recurring_user_active  on public.recurring_transactions(user_id, active, next_run);

-- 8) Atualização automática de updated_at -------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_accounts_updated  on public.accounts;
drop trigger if exists trg_goals_updated     on public.goals;
drop trigger if exists trg_budgets_updated   on public.budgets;
drop trigger if exists trg_recurring_updated on public.recurring_transactions;

create trigger trg_accounts_updated  before update on public.accounts                for each row execute function public.set_updated_at();
create trigger trg_goals_updated     before update on public.goals                   for each row execute function public.set_updated_at();
create trigger trg_budgets_updated   before update on public.budgets                 for each row execute function public.set_updated_at();
create trigger trg_recurring_updated before update on public.recurring_transactions  for each row execute function public.set_updated_at();

-- 9) Segurança (RLS): cada usuário só enxerga os próprios dados ----------
alter table public.accounts               enable row level security;
alter table public.transactions           enable row level security;
alter table public.goals                  enable row level security;
alter table public.budgets                enable row level security;
alter table public.recurring_transactions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts','transactions','goals','budgets','recurring_transactions']
  loop
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;
