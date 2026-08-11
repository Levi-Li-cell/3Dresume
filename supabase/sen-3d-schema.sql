create table if not exists public.sen_projects (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  director jsonb not null default '{}'::jsonb,
  stickers jsonb not null default '{}'::jsonb,
  model jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sen_orders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  product_code text not null,
  amount_fen integer not null check (amount_fen > 0),
  currency text not null default 'CNY',
  status text not null check (status in ('pending', 'paid', 'failed', 'closed')),
  code_url text,
  transaction_id text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sen_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_code text not null,
  status text not null check (status in ('active', 'revoked')),
  order_id text references public.sen_orders(id),
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_code)
);

create index if not exists sen_orders_user_id_idx on public.sen_orders(user_id);
create index if not exists sen_orders_status_idx on public.sen_orders(status);

alter table public.sen_projects enable row level security;
alter table public.sen_orders enable row level security;
alter table public.sen_licenses enable row level security;

create policy "Users manage own project" on public.sen_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users read own orders" on public.sen_orders
  for select using (auth.uid() = user_id);
create policy "Users read own licenses" on public.sen_licenses
  for select using (auth.uid() = user_id);
