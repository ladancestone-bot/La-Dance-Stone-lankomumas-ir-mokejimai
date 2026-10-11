# Production safety audit — 2026-10-11

This document records verified risks and the required safe order of work. It is not a migration and changes no production data.

## Verified observations

- Production data is in Supabase project `tqzabmlrtbrylibafjfh` (EU Central). Keep changes isolated from the empty secondary project.
- `payments` contains the actual payment rows and `monthly_charges.amount_paid/status` are recalculated by database functions.
- `admin_delete_payment` and `teacher_delete_payment` both remove the payment row after subtracting its amount from the monthly charge. There is no payment-revision/audit trigger on `payments` in the inspected trigger list.
- `admin_update_payment` and `teacher_update_payment` modify amount, method, paid-at time and notes in place. There is no payment-revision/audit trigger on `payments` in the inspected trigger list.
- `stripe_payments` has a SELECT policy for all authenticated users (`qual = true`). The table stores payer name/email, amount, status, metadata and Stripe identifiers. Catalog privileges also grant broad table rights to `anon` and `authenticated`; RLS and grants must be considered together.
- Stripe webhook and sync Edge Functions use the server-side service-role client to write Stripe ledger rows. The website-order import Edge Function calls `process_dropin_website_order` with a service-role bearer token.
- `clear_group_attendance` deletes attendance and its revision records, so changing this safely requires a coordinated database and UI change.
- `BILLING_TEST_MODE = true` in the current app; preserve it until reconciliation has been verified.

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
- [ ] Build and automated checks pass before merging.
