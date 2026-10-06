alter table public.studio_rentals add column if not exists reserved_at timestamptz;
create index if not exists studio_rentals_reserved_at_idx on public.studio_rentals(reserved_at);
