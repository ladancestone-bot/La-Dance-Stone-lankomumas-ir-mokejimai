-- Restrict privileged RPC entry points to authenticated studio users.
-- The website-order processor is invoked by the trusted service-role importer.
-- Prepared in the feature branch; not applied to the live project automatically.

revoke execute on function public.add_manual_dropin_participant(
  uuid, text, text, text, text
) from public, anon;
grant execute on function public.add_manual_dropin_participant(
  uuid, text, text, text, text
) to authenticated, service_role;

revoke execute on function public.add_quick_dropin_participant(
  uuid, date, time without time zone, time without time zone, uuid, text, text, text, text
) from public, anon;
grant execute on function public.add_quick_dropin_participant(
  uuid, date, time without time zone, time without time zone, uuid, text, text, text, text
) to authenticated, service_role;

revoke execute on function public.clear_group_attendance(uuid)
  from public, anon;
grant execute on function public.clear_group_attendance(uuid)
  to authenticated, service_role;

revoke execute on function public.process_dropin_website_order(uuid)
  from public, anon, authenticated;
grant execute on function public.process_dropin_website_order(uuid)
  to service_role;
