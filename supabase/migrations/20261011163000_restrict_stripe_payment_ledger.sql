-- Keep the Stripe ledger server-write-only and visible only to studio admins.
-- Edge Functions use service_role; the browser app does not query stripe_payments.
-- Prepared for review in the feature branch; do not apply to production until release checks pass.

drop policy if exists "Authenticated users can read Stripe payment ledger"
  on public.stripe_payments;

revoke all privileges on table public.stripe_payments from public, anon, authenticated;
grant select on table public.stripe_payments to authenticated;
grant all privileges on table public.stripe_payments to service_role;

alter table public.stripe_payments enable row level security;

create policy "Studio admins can read Stripe payment ledger"
  on public.stripe_payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role::text = 'admin'
    )
  );
