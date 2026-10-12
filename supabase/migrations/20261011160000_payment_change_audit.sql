-- Preserve a before-image whenever a payment record is edited or removed.
-- This migration is intentionally prepared in the feature branch only; it is not
-- applied to the live Supabase project automatically.
create table if not exists public.payment_change_audit (
  id bigint generated always as identity primary key,
  payment_id uuid not null,
  operation text not null check (operation in ('UPDATE', 'DELETE')),
  old_record jsonb not null,
  new_record jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

alter table public.payment_change_audit enable row level security;

-- The audit table is not directly readable/writable from browser roles.
revoke all on table public.payment_change_audit from anon, authenticated;
grant all on table public.payment_change_audit to service_role;

create or replace function public.capture_payment_change_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.payment_change_audit (
    payment_id,
    operation,
    old_record,
    new_record,
    changed_by
  )
  values (
    old.id,
    tg_op,
    to_jsonb(old),
    case when tg_op = 'UPDATE' then to_jsonb(new) else null end,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.capture_payment_change_audit() from public, anon, authenticated;
grant execute on function public.capture_payment_change_audit() to service_role;

drop trigger if exists payments_capture_change_audit on public.payments;
create trigger payments_capture_change_audit
before update or delete on public.payments
for each row execute function public.capture_payment_change_audit();
