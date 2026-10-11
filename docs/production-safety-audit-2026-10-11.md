# Production safety audit — 2026-10-11

This document records verified risks and the required safe order of work. It is not a migration and changes no production data.

## Verified observations

- Production data is in Supabase project `tqzabmlrtbrylibafjfh` (EU Central). Keep changes isolated from the empty secondary project.
- `payments` contains the actual payment rows and `monthly_charges.amount_paid/status` are recalculated by database functions.
- `admin_delete_payment` and `teacher_delete_payment` both remove the payment row after subtracting its amount from the monthly charge. There is no payment-revision/audit trigger on `payments` in the inspected trigger list.
- `admin_update_payment` and `teacher_update_payment` modify amount, method, paid-at time and notes in place. There is no payment-revision/audit trigger on `payments` in the inspected trigger list.
- `stripe_payments` has a SELECT policy for all authenticated users (`qual = true`). The table stores payer name/email, amount, status, metadata and Stripe identifiers. Catalog privileges also grant broad table rights to `anon` and `authenticated`; RLS and grants must be considered together.
- A fresh catalog check confirms `student_consents`, `website_import_tokens`, `website_import_sync_runs` and `website_orders` all have RLS enabled but no policies. `anon` and `authenticated` still have broad table-level grants on three of these tables (`website_import_sync_runs` is service-role-only). With RLS enabled and no policies, ordinary API row access is denied today, but the unnecessary grants should still be removed; `website_orders` needs a deliberate authenticated policy first because the app currently reads it.
- Stripe webhook and sync Edge Functions use the server-side service-role client to write Stripe ledger rows. The website-order import Edge Function calls `process_dropin_website_order` with a service-role bearer token.
- A fresh live privilege query confirms seven `SECURITY DEFINER` RPCs are executable by `anon`: `add_manual_dropin_participant`, `add_quick_dropin_participant`, `clear_group_attendance`, `process_dropin_website_order`, `teacher_can_access_group`, `teacher_delete_payment` and `teacher_update_payment`. The prepared RPC migration now revokes anonymous execution from all seven, while retaining authenticated execution for staff-facing functions and service-role execution for trusted server workflows. `process_dropin_website_order` is restricted to `service_role` for the website importer.
- The payment-history query has been corrected in the feature branch to filter `payments.paid_at` by a half-open month interval, with both boundaries calculated for `Europe/Vilnius`. A local runtime check verified expected UTC offsets on months spanning the 2026 daylight-saving transitions; full CI validation is still required.
- `clear_group_attendance` deletes attendance and its revision records, so changing this safely requires a coordinated database and UI change.
- `BILLING_TEST_MODE = true` in the current app; preserve it until reconciliation has been verified.
- The payment-history UI currently filters rows by the linked charge's month (`monthly_charges.month`) instead of the actual payment timestamp (`payments.paid_at`). This can make a payment recorded in October appear under September if it was applied to a September charge. The payment-history filter should use a half-open date range on `paid_at`; the charge list itself should continue to use the selected charge month. `payments.paid_at` is `timestamptz`, and the app formats attendance timestamps in `Europe/Vilnius`; when implementing the filter, calculate the selected month's start and next month's start in `Europe/Vilnius` and convert both boundaries to ISO timestamps. Do not use naive UTC-midnight boundaries, which would shift the local month edge.

## Required implementation order

1. Add a payment audit/reversal model that preserves original payment rows and records who/when/why a correction was made. Define how reversals affect `monthly_charges.amount_paid/status` and how partial refunds work.
2. Update admin/teacher RPCs and the UI together; retain existing RPC compatibility until all callers have been identified. Do not ship a UI-only change that claims to reverse a payment while the database still deletes it.
3. Restrict `stripe_payments` to authorized administrative reads and service-side writes only after checking every app and Edge Function caller. Revoke direct anonymous/authenticated writes only after verifying no public checkout path depends on them.
4. Lock down SECURITY DEFINER RPC execution grants individually. In particular, preserve legitimate website order import/webhook flows while preventing untrusted direct invocation.
5. Review and correct attendance correction/deletion so audit revisions are retained.
6. Apply changes first in a disposable/staging project with a schema/data snapshot; test admin, teacher, anonymous website checkout, Stripe webhook/sync, invoice sync and historical payment totals.
7. Only then prepare a reviewed production migration. Never use destructive bulk deletes or expose service-role keys in browser code.

## Verification checklist

- [ ] Existing student, group, attendance, charge and payment counts unchanged by migrations.
- [ ] Re-running charge generation does not create duplicates.
- [ ] Teacher cannot read or modify students/payments outside assigned groups.
- [ ] Non-admin authenticated user cannot read the full Stripe ledger.
- [ ] Stripe webhook and scheduled sync remain idempotent.
- [ ] Payment corrections preserve an immutable original record and audit trail.
- [ ] Attendance corrections retain prior revision history.
- [x] GitHub Actions `Build check` passes for the current PR head commit `82af092b33fd03958fadddda7e06dd8b34342369` (run 178).
- [ ] End-to-end authentication, payment-history, and role-scope tests pass in a staging database before merging.
- [ ] Restrict `stripe_payments` browser grants and replace its all-authenticated SELECT policy after validating every caller; this remains an open production security issue.


## Security remediation and test plan — 2026-10-11

### Guardrails
- Work only on `design/espresso-burgundy-dashboard` and review through draft PR #1.
- Do not merge, deploy, or apply migrations to production until the checks below pass.
- Keep `BILLING_TEST_MODE = true`; do not send customer emails or real payment requests during tests.
- Do not use the empty secondary Supabase project or create a paid staging branch without explicit cost approval.
- Capture a schema snapshot and baseline row counts before any database test. Never delete production records as a test.

### Phase 1 — review prepared migrations
- [ ] Review `20261011160000_payment_change_audit.sql`: trigger behavior for payment UPDATE/DELETE, audit table RLS, and service-role-only access.
- [ ] Review `20261011161000_restrict_privileged_rpc_access.sql`: confirm exact function signatures and verify all legitimate callers use authenticated or service-role contexts.
- [ ] Review `20261011162000_lock_server_only_tables.sql`: confirm the website importer still works with service-role access and does not require browser access to token tables.
- [ ] Correct stale statements in this audit: payment history is already fixed in the feature branch to use `payments.paid_at` with `Europe/Vilnius` month boundaries; update the CI reference to the latest passing PR head before final review.

### Phase 2 — caller and permission checks
- [ ] Inventory every app, SQL function, trigger and Edge Function that reads/writes `stripe_payments`, `student_consents`, `website_import_tokens`, `website_import_sync_runs` and `website_orders`.
- [ ] Replace the all-authenticated `stripe_payments` SELECT policy with least-privilege admin access; revoke unnecessary `anon`/`authenticated` table grants. Keep trusted Edge Function writes through service role.
- [ ] Give `website_orders` a deliberate admin-authorized access path before removing browser access; the current app reads this table.
- [ ] Verify each SECURITY DEFINER function checks authorization internally, not just through UI visibility. Keep public execution revoked for privileged RPCs; allow `process_dropin_website_order` only to the trusted server workflow.
- [ ] Verify teachers can only access groups assigned to their authenticated profile. Do not broaden policies to make tests pass.

### Phase 3 — functional tests in a non-production database
- [ ] Password login and existing OTP login both work in LT/EN/ES; invalid password, missing fields, busy state and Enter-key submit behave correctly.
- [ ] Admin can read and manage all authorized studio records; teacher can only read/manage assigned groups.
- [ ] Anonymous users cannot read consent records, import-token hashes, sync logs, full Stripe ledger, or private website orders.
- [ ] Website order import still validates the token hash and processes a valid order; invalid/reused tokens fail safely.
- [ ] Stripe checkout, signed webhook and payment sync work end-to-end in test mode and remain idempotent.
- [ ] Payment history includes payments by actual `paid_at` local month (Europe/Vilnius), including month/year boundaries and DST transitions.
- [ ] Payment update/delete creates an audit record with actor, timestamp, old values, new values/reason where available; totals and charge status remain correct.
- [ ] Attendance correction preserves revision history. Do not use `clear_group_attendance` until its destructive history behavior has been addressed.
- [ ] Monthly charge generation can be run twice for the same month without duplicate charges or changed totals.
- [ ] Existing student, group, attendance, charge and payment counts and financial totals reconcile against the baseline.

### Phase 4 — release gate
- [ ] Build and tests pass on the exact reviewed PR head.
- [ ] Review SQL diff and rollback/recovery approach with a schema/data snapshot available.
- [ ] Confirm every migration is safe to run once and that repeated execution behavior is understood.
- [ ] Only after all checks pass: remove draft status, obtain review, merge, then apply reviewed migrations in a controlled release window.
- [ ] After release, re-run permission checks, payment reconciliation, checkout/import smoke tests, and security advisor checks.

### Current blockers — do not release while open
1. Production has an overly broad `stripe_payments` policy and unnecessary direct table grants.
2. Production grants anonymous execution to privileged SECURITY DEFINER RPCs.
3. No disposable staging database has been approved/created; no production migration has been applied.
4. Payment correction and attendance revision behavior need end-to-end verification before release.
