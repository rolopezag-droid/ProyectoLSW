-- Propuesta de migración para el diario de análisis de opciones.
-- No se ejecuta automáticamente; aplicar en Supabase después de revisar el esquema.
create table if not exists public.research_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  underlying_ticker text not null check (underlying_ticker ~ '^[A-Z0-9.-]{1,12}$'),
  expiration_date date not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists research_journal_owner_created_idx
  on public.research_journal (user_id, created_at desc);

alter table public.research_journal enable row level security;
grant select, insert on public.research_journal to authenticated;

create policy "Users read their own research journal"
  on public.research_journal for select to authenticated
  using (auth.uid() = user_id);
create policy "Users create their own research journal"
  on public.research_journal for insert to authenticated
  with check (auth.uid() = user_id);
