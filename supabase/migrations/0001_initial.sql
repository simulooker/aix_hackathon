create extension if not exists pgcrypto;

create table if not exists public.hazard_reports (
  id uuid primary key default gen_random_uuid(),
  status varchar(20) not null default 'verified'
    check (status in ('pending', 'verified', 'rejected', 'resolved')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  hazard_type varchar(80),
  confidence double precision check (confidence between 0 and 1),
  severity double precision not null default 0 check (severity between 0 and 1),
  overall_risk varchar(10) not null default 'none'
    check (overall_risk in ('none', 'low', 'medium', 'high')),
  detected_labels text,
  photo_path text,
  created_at timestamptz not null default now()
);

create index if not exists hazard_reports_coordinates_idx
  on public.hazard_reports (latitude, longitude);
create index if not exists hazard_reports_active_idx
  on public.hazard_reports (status, severity);

create table if not exists public.email_verifications (
  email text primary key,
  code_hash varchar(64) not null,
  expires_at timestamptz not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.hazard_reports enable row level security;

drop policy if exists "Anyone can read verified reports" on public.hazard_reports;
create policy "Anyone can read verified reports"
  on public.hazard_reports for select
  using (status = 'verified');
