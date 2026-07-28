create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists public.hazard_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  image_path text not null,
  location geography(point, 4326) not null,
  hazard_type text,
  confidence real check (confidence between 0 and 1),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists hazard_reports_location_idx
  on public.hazard_reports using gist (location);

alter table public.hazard_reports enable row level security;

create policy "Anyone can read verified reports"
  on public.hazard_reports for select
  using (status = 'verified');

create policy "Authenticated users can create reports"
  on public.hazard_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());
