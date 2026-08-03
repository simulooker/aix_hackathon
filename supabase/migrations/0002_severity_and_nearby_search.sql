alter table public.hazard_reports
  add column if not exists severity real check (severity between 0 and 1);

-- Returns hazard reports within radius_m meters of (search_lat, search_lon),
-- with the PostGIS point unpacked into plain lat/lon for the API layer.
create or replace function public.nearby_hazards(
  search_lat double precision,
  search_lon double precision,
  radius_m double precision default 500
)
returns table (
  id uuid,
  image_path text,
  latitude double precision,
  longitude double precision,
  hazard_type text,
  confidence real,
  severity real,
  status text,
  created_at timestamptz
)
language sql
stable
as $$
  select
    hr.id,
    hr.image_path,
    st_y(hr.location::geometry) as latitude,
    st_x(hr.location::geometry) as longitude,
    hr.hazard_type,
    hr.confidence,
    hr.severity,
    hr.status,
    hr.created_at
  from public.hazard_reports hr
  where hr.status in ('verified', 'pending')
    and st_dwithin(
      hr.location,
      st_setsrid(st_makepoint(search_lon, search_lat), 4326)::geography,
      radius_m
    )
  order by hr.created_at desc;
$$;
