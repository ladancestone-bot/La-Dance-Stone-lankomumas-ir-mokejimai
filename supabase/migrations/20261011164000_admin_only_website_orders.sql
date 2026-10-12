-- Website orders contain customer and parent contact details.
-- The browser app only reads these records in the administrator reservation view.
-- Public website imports continue through the server-side Edge Function/service_role.
-- Prepared on the feature branch only; do not apply to production until release checks pass.

alter table public.website_orders enable row level security;

revoke all privileges on table public.website_orders from public, anon, authenticated;
grant select on table public.website_orders to authenticated;
grant all privileges on table public.website_orders to service_role;

drop policy if exists "Studio admins can read website orders"
  on public.website_orders;

create policy "Studio admins can read website orders"
  on public.website_orders
  for select
  to authenticated
  using ((select public.is_admin()));
