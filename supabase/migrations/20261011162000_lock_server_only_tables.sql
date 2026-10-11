-- Restrict browser access to server-only consent and import bookkeeping tables.
-- The application does not query these tables directly; trusted Edge Functions use service_role.
revoke all privileges on table public.website_import_tokens from public, anon, authenticated;
revoke all privileges on table public.website_import_sync_runs from public, anon, authenticated;
revoke all privileges on table public.student_consents from public, anon, authenticated;

grant all privileges on table public.website_import_tokens to service_role;
grant all privileges on table public.website_import_sync_runs to service_role;
grant all privileges on table public.student_consents to service_role;

alter table public.website_import_tokens enable row level security;
alter table public.website_import_sync_runs enable row level security;
alter table public.student_consents enable row level security;
