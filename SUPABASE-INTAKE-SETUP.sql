-- ============================================================
-- YERRAMAZING — intake submissions + selfie storage
-- Run ONCE in the Supabase SQL editor.
-- Project: lpzijtmbdowcshomyenk  (dashboard → SQL Editor → paste → Run)
-- Owner = fatfatproductions@gmail.com (only you can read submissions)
-- ============================================================

-- 1) Table
create table if not exists public.yerr_intakes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text,
  email       text,
  goal        text,
  answers     jsonb not null default '{}'::jsonb,
  selfie_path text,
  seen        boolean not null default false,
  status      text not null default 'new'
);

create index if not exists yerr_intakes_created_idx on public.yerr_intakes (created_at desc);
create index if not exists yerr_intakes_seen_idx    on public.yerr_intakes (seen);

alter table public.yerr_intakes enable row level security;

-- 2) Anyone can SUBMIT (insert only)
drop policy if exists "intakes_anon_insert" on public.yerr_intakes;
create policy "intakes_anon_insert" on public.yerr_intakes
  for insert to anon, authenticated
  with check (true);

-- 3) Only the owner can READ
drop policy if exists "intakes_owner_select" on public.yerr_intakes;
create policy "intakes_owner_select" on public.yerr_intakes
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'fatfatproductions@gmail.com');

-- 4) Only the owner can UPDATE (mark seen / change status)
drop policy if exists "intakes_owner_update" on public.yerr_intakes;
create policy "intakes_owner_update" on public.yerr_intakes
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'fatfatproductions@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'fatfatproductions@gmail.com');

-- 5) Private storage bucket for selfies
insert into storage.buckets (id, name, public)
values ('intake-selfies', 'intake-selfies', false)
on conflict (id) do nothing;

-- 6) Anyone can UPLOAD a selfie (insert only)
drop policy if exists "selfies_anon_insert" on storage.objects;
create policy "selfies_anon_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'intake-selfies');

-- 7) Only the owner can READ selfies (admin uses signed URLs)
drop policy if exists "selfies_owner_select" on storage.objects;
create policy "selfies_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'intake-selfies' and (auth.jwt() ->> 'email') = 'fatfatproductions@gmail.com');
