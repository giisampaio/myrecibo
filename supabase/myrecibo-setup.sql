-- ============================================================================
-- MyRecibo — setup completo no Supabase COMPARTILHADO com o myhangar
-- ============================================================================
-- Seguro por construção:
--   • Tudo vive no schema dedicado "myrecibo" (o myhangar segue em "public").
--   • NENHUM trigger em auth.users (não interfere no cadastro do myhangar).
--   • Idempotente: pode rodar mais de uma vez sem quebrar nada.
-- Depois de rodar, NÃO ESQUEÇA: Settings → API → "Exposed schemas" → adicionar
-- "myrecibo" (senão o app recebe 406 em toda chamada).
-- ============================================================================

-- 1) Schema dedicado -----------------------------------------------------------
create schema if not exists myrecibo;

grant usage on schema myrecibo to authenticated;
grant usage on schema myrecibo to anon; -- só usage; RLS bloqueia tudo p/ anon
grant usage on schema myrecibo to service_role;

-- 2) Empresas (vínculo por código de convite) ---------------------------------
create table if not exists myrecibo.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

-- 3) Perfis (existir aqui = ser usuário do MyRecibo) --------------------------
create table if not exists myrecibo.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  colaborador text not null default '',
  empresa text not null default '',
  filial text not null default '',
  centro_custo text not null default '',
  objetivo text not null default '',
  company_id uuid references myrecibo.companies (id),
  updated_at timestamptz not null default now()
);

-- 4) Despesas (espelho do banco local do app) ---------------------------------
create table if not exists myrecibo.expenses (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null,
  payment_type text not null check (payment_type in ('corporativo', 'pessoal')),
  category text not null check (category in
    ('alimentacao', 'hospedagem', 'comissaria', 'peca', 'impressao', 'transporte', 'outros')),
  vendor text not null default '',
  description text not null default '',
  invoice_number text,
  source text not null default 'manual' check (source in ('ocr', 'manual', 'recibo')),
  reimbursement text not null default 'na' check (reimbursement in
    ('na', 'pendente', 'solicitado', 'pago')),
  photo_path text,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_date_idx on myrecibo.expenses (user_id, date);
create index if not exists expenses_user_updated_idx on myrecibo.expenses (user_id, updated_at);

-- 5) Grants de tabela (PostgREST exige; RLS restringe as linhas) --------------
grant select, insert, update on myrecibo.profiles to authenticated;
grant select on myrecibo.companies to authenticated;
grant select, insert, update on myrecibo.expenses to authenticated;
-- Sem GRANT DELETE em lugar nenhum: exclusão é sempre soft-delete (deleted=true).

-- 6) RLS ------------------------------------------------------------------------
alter table myrecibo.profiles enable row level security;
alter table myrecibo.companies enable row level security;
alter table myrecibo.expenses enable row level security;

-- Perfil: cada um só enxerga/edita o próprio
drop policy if exists profiles_select on myrecibo.profiles;
create policy profiles_select on myrecibo.profiles
  for select to authenticated using (auth.uid() = id);
drop policy if exists profiles_insert on myrecibo.profiles;
create policy profiles_insert on myrecibo.profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists profiles_update on myrecibo.profiles;
create policy profiles_update on myrecibo.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Empresas: usuário só enxerga a empresa à qual está vinculado
-- (ninguém lista códigos de convite; o vínculo é pela função abaixo)
drop policy if exists companies_select on myrecibo.companies;
create policy companies_select on myrecibo.companies
  for select to authenticated
  using (id = (select company_id from myrecibo.profiles where id = auth.uid()));

-- Despesas: cada um só nas próprias linhas
drop policy if exists expenses_select on myrecibo.expenses;
create policy expenses_select on myrecibo.expenses
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists expenses_insert on myrecibo.expenses;
create policy expenses_insert on myrecibo.expenses
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists expenses_update on myrecibo.expenses;
create policy expenses_update on myrecibo.expenses
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 7) Vincular empresa por código (security definer: valida sem expor códigos) --
create or replace function myrecibo.join_company(code text)
returns text
language plpgsql
security definer
set search_path = myrecibo
as $$
declare
  v_company myrecibo.companies%rowtype;
begin
  select * into v_company from myrecibo.companies where join_code = upper(trim(code));
  if not found then
    raise exception 'Código de convite inválido';
  end if;
  update myrecibo.profiles set company_id = v_company.id, updated_at = now()
    where id = auth.uid();
  if not found then
    raise exception 'Perfil não encontrado';
  end if;
  return v_company.name;
end;
$$;

revoke all on function myrecibo.join_company(text) from public;
grant execute on function myrecibo.join_company(text) to authenticated;

-- 8) Storage: bucket privado com pasta por usuário ------------------------------
insert into storage.buckets (id, name, public)
  values ('myrecibo', 'myrecibo', false)
  on conflict (id) do nothing;

drop policy if exists myrecibo_storage_select on storage.objects;
create policy myrecibo_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'myrecibo' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists myrecibo_storage_insert on storage.objects;
create policy myrecibo_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'myrecibo' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists myrecibo_storage_update on storage.objects;
create policy myrecibo_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'myrecibo' and (storage.foldername(name))[1] = auth.uid()::text);

-- 9) Semente: sua empresa (ajuste o código se quiser) ---------------------------
insert into myrecibo.companies (name, join_code)
  values ('Scheffer & Cia Ltda', 'SCHEFFER2026')
  on conflict (join_code) do nothing;

-- Pronto. Confira depois em Table Editor → schema "myrecibo".
