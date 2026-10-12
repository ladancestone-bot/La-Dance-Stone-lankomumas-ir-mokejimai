-- Public rental booking creation: server-only, transactional conflict check and pricing.
-- This migration is for review in the feature branch only. Do not apply to production yet.

create or replace function public.create_public_rental_booking(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_starts_at timestamptz,
  p_duration_hours integer
)
returns table (rental_id uuid, amount_eur numeric, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz := p_starts_at;
  v_end timestamptz;
  v_price numeric(10,2);
  v_rental_id uuid;
  v_local_date date;
  v_local_hour integer;
begin
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'A valid customer name is required' using errcode = '22023';
  end if;
  if p_customer_email is null or trim(p_customer_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid customer email is required' using errcode = '22023';
  end if;
  if p_duration_hours is null or p_duration_hours < 1 or p_duration_hours > 6 then
    raise exception 'Online rental duration must be from 1 to 6 whole hours' using errcode = '22023';
  end if;
  if v_start is null or v_start <= now() then
    raise exception 'Rental must start in the future' using errcode = '22023';
  end if;

  v_local_date := (v_start at time zone 'Europe/Vilnius')::date;
  v_local_hour := extract(hour from v_start at time zone 'Europe/Vilnius')::integer;
  if extract(minute from v_start at time zone 'Europe/Vilnius') <> 0
     or extract(second from v_start at time zone 'Europe/Vilnius') <> 0 then
    raise exception 'Rental start must be on a whole hour' using errcode = '22023';
  end if;
  v_end := v_start + make_interval(hours => p_duration_hours);
  if (v_end at time zone 'Europe/Vilnius')::date <> v_local_date
     or extract(hour from v_end at time zone 'Europe/Vilnius') > 22
     or (extract(hour from v_end at time zone 'Europe/Vilnius') = 22
         and (extract(minute from v_end at time zone 'Europe/Vilnius') > 0
           or extract(second from v_end at time zone 'Europe/Vilnius') > 0)) then
    raise exception 'Rental must end by 22:00 local time and cannot cross midnight' using errcode = '22023';
  end if;
  if v_local_hour < 9 then
    raise exception 'Online rentals begin no earlier than 09:00 local time' using errcode = '22023';
  end if;

  v_price := least(p_duration_hours, 3) * 20
    + greatest(p_duration_hours - 3, 0) * 15;

  -- Serialize reservation attempts for this local date, preventing race-condition overlaps.
  perform pg_advisory_xact_lock(hashtext('public-rental:' || v_local_date::text));

  if exists (
    select 1
    from public.studio_rentals r
    where coalesce(r.is_active, true) = true
      and coalesce(r.payment_status, 'pending') <> 'cancelled'
      and r.starts_at < v_end
      and r.ends_at > v_start
  ) then
    raise exception 'Selected time overlaps an existing studio rental' using errcode = '23P01';
  end if;

  insert into public.studio_rentals (
    customer_name, customer_email, customer_phone, rental_type,
    starts_at, ends_at, price, payment_status, payment_method,
    is_active, source, notes, reserved_at
  ) values (
    trim(p_customer_name), lower(trim(p_customer_email)), nullif(trim(coalesce(p_customer_phone, '')), ''),
    'short_term', v_start, v_end, v_price, 'pending', null,
    true, 'public_booking', 'Online rental booking; payment confirmation pending.', now()
  )
  returning id into v_rental_id;

  return query select v_rental_id, v_price, v_start, v_end;
end;
$$;

revoke all on function public.create_public_rental_booking(text, text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.create_public_rental_booking(text, text, text, timestamptz, integer) to service_role;
