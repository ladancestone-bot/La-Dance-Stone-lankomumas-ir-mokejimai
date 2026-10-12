# La Dance Stone — Public Booking Application Plan

## Goal
Build the public-facing reservation experience first, then integrate it into the existing La Dance Stone administration app. Keep the current app, database, customers, payments, rental history, and working Google Sheets synchronization intact.

## Non-negotiable constraints
- Hostinger is the target hosting platform. Do not introduce a new Netlify deployment.
- Reuse the existing production Supabase project `tqzabmlrtbrylibafjfh` in EU Central after schema and access review. Do not create a disconnected production database.
- Do not delete or overwrite historical data. Preserve source identifiers and make imports idempotent.
- Keep the current admin app available while the booking experience is built and tested.
- Do not run live Stripe transactions or send real customer emails during development. Billing remains in test mode until explicitly approved.
- Keep Google Sheets sync for “Viena pamoka” and “Nuoma” enabled until the replacement has been tested end-to-end and reconciliation is verified.
- Never expose Supabase service-role keys, Stripe secrets, or import tokens in browser code.
- The UI must be simple, clear, mobile-friendly, and support Lithuanian, English, and Spanish.

## Product scope — public booking experience
1. **Group classes and monthly subscriptions**
   - Explain age groups, schedule, prices, trial lesson, and subscription terms.
   - Collect only necessary customer/parent details and consent.
   - Prevent overbooking and duplicate registrations.
2. **One-off / trial lessons**
   - Show available sessions, remaining capacity, price, reservation status, and payment status.
   - Avoid duplicate bookings if a customer refreshes or submits twice.
3. **Studio rental**
   - Show available time slots and prevent overlapping active rentals.
   - Clearly show date, local start/end time, price, and payment state.
4. **Checkout and status**
   - Stripe Checkout is initiated only by a trusted server-side function.
   - A verified Stripe webhook updates the existing reservation/payment record idempotently.
   - UI states: awaiting payment, paid, payment failed/expired, cancelled, refunded, and manual/invoice payment where supported.
   - A return-to-site URL alone must never mark a booking as paid.
5. **Customer confirmation**
   - Confirmation email only after a durable booking record exists; payment wording must match verified status.
   - Email failure must not lose the reservation.
6. **AI-ready API**
   - Add a narrow, authenticated server-side read interface for approved operational summaries (upcoming bookings, payment reconciliation, availability, and mismatches).
   - Return only necessary fields; do not expose all customer records or secrets.
   - This API is a later integration milestone and does not imply ChatGPT has automatic access until an authorized connector/tool is configured.

## Integration approach
- First deliver the public booking experience as a distinct route/module, developed on this feature branch.
- Reuse the current Supabase project and existing tables where the schema supports the required semantics; create reviewed migrations only where needed.
- Keep one canonical record per booking and payment. Do not copy the same reservation into a separate independent database.
- Later expose the booking experience through the existing Hostinger app/site and connect it to the administration views for reservations, attendance, monthly charges, payments, and rentals.
- Do not merge to main, apply production migrations, switch the public booking URL, or disable existing sync until the migration and reconciliation checklist passes.

## Existing data / compatibility checks before implementation
- Map `website_orders`, `drop_in_bookings`, `drop_in_lessons`, `studio_rentals`, students, groups, monthly charges, payments, Stripe ledger/webhook data, and Google Sheets source identifiers.
- Confirm the authoritative timezone is Europe/Vilnius and store timestamps consistently; display local times in Europe/Vilnius.
- Verify database RLS and RPC grants, including server-only processing functions.
- Reconcile active reservations against payments and existing Sheets before cutover.
- Preserve history; archive/deactivate rather than hard-delete.

## Acceptance checklist
- [ ] Public booking works on mobile and desktop in LT/EN/ES.
- [ ] Class capacity and rental conflicts are enforced server-side.
- [ ] Double submissions and webhook retries do not create duplicates.
- [ ] A Stripe payment becomes paid only after verified webhook processing.
- [ ] Booking remains visible if email delivery fails.
- [ ] Admin app displays the same canonical booking/payment data.
- [ ] Existing client, attendance, charge, payment, and rental history remains intact.
- [ ] Google Sheets sync has a verified replacement before it is disabled.
- [ ] AI-ready API has explicit authentication, minimal data exposure, and audit logging.
- [ ] Production deployment and live payment activation are separately approved.
