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
  -- Parcelamento: parcelas compartilham o mesmo installment_group_id
  installment_group_id uuid,
  installment_number   int,
  installment_total    int,
  created_at  timestamptz not null default now()
);

-- Garante as colunas de parcelamento em bancos que já tinham a tabela
alter table public.transactions add column if not exists installment_group_id uuid;
alter table public.transactions add column if not exists installment_number   int;
alter table public.transactions add column if not exists installment_total    int;

-- 4) Recorrentes ----------------------------------------------------------
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

-- Liga cada transação gerada automaticamente à recorrência que a originou
-- (permite excluir os lançamentos já criados quando a recorrência é removida).
alter table public.transactions
  add column if not exists recurring_transaction_id uuid references public.recurring_transactions(id) on delete set null;

-- 5) Integração bancária (Pluggy / Open Finance) -------------------------
create table if not exists public.bank_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  pluggy_item_id   text not null unique,
  institution_name text,
  status           text not null default 'UPDATED',
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Limite de crédito (cartões manuais ou sincronizados via Pluggy)
alter table public.accounts add column if not exists credit_limit numeric;
-- Vincula a conta local à conta correspondente na Pluggy
alter table public.accounts add column if not exists pluggy_account_id text unique;
alter table public.accounts add column if not exists bank_connection_id uuid references public.bank_connections(id) on delete set null;

-- Chave de deduplicação: re-sincronizar nunca insere a mesma transação duas vezes
alter table public.transactions add column if not exists pluggy_transaction_id text unique;

-- 6) Índices ------------------------------------------------------------
create index if not exists idx_transactions_user_date    on public.transactions(user_id, occurred_at desc);
create index if not exists idx_transactions_account      on public.transactions(account_id);
create index if not exists idx_transactions_installment  on public.transactions(installment_group_id) where installment_group_id is not null;
create index if not exists idx_transactions_recurring    on public.transactions(recurring_transaction_id) where recurring_transaction_id is not null;
create index if not exists idx_transactions_pluggy       on public.transactions(pluggy_transaction_id) where pluggy_transaction_id is not null;
create index if not exists idx_accounts_user             on public.accounts(user_id);
create index if not exists idx_accounts_pluggy           on public.accounts(pluggy_account_id) where pluggy_account_id is not null;
create index if not exists idx_recurring_user_active     on public.recurring_transactions(user_id, active, next_run);
create index if not exists idx_bank_connections_user     on public.bank_connections(user_id);

-- 7) Atualização automática de updated_at -------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_accounts_updated         on public.accounts;
drop trigger if exists trg_recurring_updated        on public.recurring_transactions;
drop trigger if exists trg_bank_connections_updated on public.bank_connections;

create trigger trg_accounts_updated         before update on public.accounts                for each row execute function public.set_updated_at();
create trigger trg_recurring_updated        before update on public.recurring_transactions  for each row execute function public.set_updated_at();
create trigger trg_bank_connections_updated before update on public.bank_connections        for each row execute function public.set_updated_at();

-- 8) Segurança (RLS): cada usuário só enxerga os próprios dados ----------
alter table public.accounts               enable row level security;
alter table public.transactions           enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.bank_connections       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts','transactions','recurring_transactions','bank_connections']
  loop
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;
