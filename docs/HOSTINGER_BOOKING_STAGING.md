# Hostinger booking prototype staging

## Purpose
Prepare a separate staging deployment of the existing La Dance Stone booking prototype without changing production, the primary domain, or live Supabase/Stripe configuration.

## Source of truth
- UI and current working integration baseline: `preview/index.html` on `main`.
- Newer visual reference: branch `booking-compact-elegant-timetable`. Do not copy its HTML wholesale: it is a reduced prototype and does not contain all live integration calls.
- Existing backend: Supabase project `tqzabmlrtbrylibafjfh`.
- Existing booking function: `public-rental-booking`.
- Existing availability function: `public-rental-availability`.
- Existing class registration function: `public-class-registration`.

## Production safety rules
1. Do not change the `main` branch as part of staging.
2. Do not change DNS or connect `ladancestone.lt` during staging.
3. Do not create a new Supabase project or duplicate production tables.
4. Never put `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, or `RESEND_API_KEY` in frontend files or Git.
5. Do not run live paid Stripe tests without explicit approval. Use Stripe test mode when available.
6. Keep using the existing Supabase project and functions unless a verified issue requires a separate, reviewed change.

## Verified integration gaps to resolve before Hostinger launch
- `public-rental-booking` currently sets success/cancel URLs to the GitHub Pages preview URL.
- `public-class-registration` currently sets success/cancel URLs to the GitHub Pages preview URL.
- The booking and availability functions currently allow the production domain and GitHub Pages origin, but the final Hostinger staging origin has not yet been confirmed.
- The class-registration frontend calls the active `public-class-registration` function, which saves the registration and creates a Stripe Checkout session for the registration fee or single lesson. The frontend displays a confirmation; the recurring monthly subscription is not automatically charged by this checkout flow and is described as being billed separately after the first class. Verify this distinction during staging tests.
- The compact design branch is not a safe replacement for the integration-enabled `main` preview file.

## Deployment sequence
1. Confirm the exact Hostinger staging origin (do not use the teacher-schedule site's domain unless intentionally chosen).
2. Build a staging-specific frontend from the integration-enabled baseline, keeping secrets server-side.
3. Update Supabase Edge Function origin allowlists and Stripe success/cancel URLs only after the staging origin is confirmed; deploy these changes as a reviewed, separate step.
4. Verify the availability check, rental creation, Stripe Checkout URL creation, cancellation return, successful return, class registration persistence, email delivery, and duplicate booking prevention.
5. Only after staging passes, plan the production-domain switch separately.

## Manual acceptance checklist
- [ ] Hostinger staging opens over HTTPS.
- [ ] Rental availability loads from the existing Supabase project.
- [ ] A test rental creates exactly one reservation record.
- [ ] Stripe Checkout opens in test mode and returns to staging.
- [ ] Cancelled/failed payment is not marked as paid.
- [ ] Class registration is saved once and reports backend errors honestly.
- [ ] Emails use existing configured sender and recipient rules.
- [ ] No service-role or Stripe secret is present in browser source.
- [ ] Existing production reservations, payments, and primary domain remain unchanged.
