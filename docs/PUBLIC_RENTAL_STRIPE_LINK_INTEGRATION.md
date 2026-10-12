# Public rental checkout integration — branch implementation

## Scope
This implementation is in `feature/public-booking-app` only. It has not been deployed, and the SQL migration has not been applied to production. The existing admin app and current production Stripe/Supabase functions are unchanged.

## Existing live Stripe Payment Links mapped by duration
- 1 hour — €20 — `https://buy.stripe.com/5kQfZgcxgbKI9Sk6s22sM04`
- 2 hours — €40 — `https://buy.stripe.com/7sY6oG7cWeWU1lO9Ee2sM05`
- 3 hours — €60 — `https://buy.stripe.com/9B66oGfJs4igaWo17I2sM06`
- 4 hours — €75 — `https://buy.stripe.com/5kQdR8dBkdSQggI9Ee2sM07`
- 5 hours — €90 — `https://buy.stripe.com/3cIaEWgNw7us5C46s22sM09`
- 6 hours — €105 — `https://buy.stripe.com/cNi5kC9l42a8ggI5nY2sM08`

Online bookings over 6 hours are not offered. The UI directs customers to call the studio for individual arrangements.

## Implemented in branch
- `supabase/migrations/20261012130000_public_rental_booking_rpc.sql` adds a server-only RPC that validates customer data, future start, whole-hour duration (1–6), hours 09:00–22:00 Europe/Vilnius, calculates the price server-side, serializes attempts per date with an advisory transaction lock, rejects overlaps, and creates a pending row in `studio_rentals`.
- `supabase/functions/create-public-rental-booking/index.ts` calls the RPC and returns the correct existing Payment Link with Stripe's `client_reference_id` set to the created rental UUID.
- `public-booking/index.html` calls the Edge Function for rental/card payments and redirects to Stripe. Rental start-time options are filtered to fit the chosen duration and end by 22:00.
- `supabase/functions/stripe-dropin-webhook/index.ts` in the feature branch recognizes `client_reference_id` as a rental ID when handling a completed Stripe Checkout session, then verifies the paid amount against the canonical rental amount before marking the rental paid.

## Must be completed and tested before production use
1. Review SQL compatibility against the current production schema and constraints.
2. Run SQL and Deno tests in a non-production Supabase branch.
3. Confirm Stripe Payment Links preserve `client_reference_id` through Checkout and webhook delivery in a test-mode equivalent. The links supplied by the studio are live-mode links, so do not use them for test purchases.
4. Ensure the production Stripe webhook endpoint actually routes `checkout.session.completed` events to the updated handler. The current production function was inspected but not modified.
5. Add email confirmation after a booking is persisted; email failure must not delete a reservation.
6. Add reminder/admin handling for the 24-hour payment deadline and access-guide delivery only after verified payment.
7. Verify the configured public booking domain/origin and add abuse/rate limiting before enabling unauthenticated public use.
8. Test end-to-end in a separate test environment; only then request explicit approval to apply migration/deploy functions or change live checkout behavior.

## Safety
- No production database changes were made.
- No Edge Functions were deployed or modified in production.
- No real payments or emails were initiated.
- Do not deploy `send-booking-email` as-is; it accepts client-controlled recipient, amount, payment status, and URL. Refactor it to read the canonical booking on the server first.
