# Public booking integration — implementation notes

## Current state
- The Resend sending domain `ladancestone.lt` is verified in the account.
- A separate Resend API key was created and saved as the Supabase Edge Function secret `RESEND_API_KEY` in the existing project.
- A first email-function scaffold exists in `supabase/functions/send-booking-email/index.ts` on `feature/public-booking-app`. It is not deployed.
- Existing production schema was inspected read-only. Relevant tables include `drop_in_lessons`, `drop_in_bookings`, `studio_rentals`, `website_orders`, `students`, `groups`, `monthly_charges`, and `payments`.

## Security correction required before deployment
The scaffold currently accepts email content, recipient, amount, payment status, and optional payment URL from the request body. Do NOT deploy or expose it in this form. A client must never be allowed to choose the recipient, amount, payment state, or arbitrary payment URL that a trusted branded email reports.

Before deployment, refactor to accept only a booking/order identifier plus a narrow email-event type. On the server:
1. Authenticate/authorize the caller, or use a private server-to-server invocation.
2. Fetch the canonical booking/order from the database.
3. Derive recipient, amount, dates, service type, payment state, and payment URL from trusted server-side records.
4. Enforce idempotency so retries do not create duplicate emails.
5. Never include private studio entry details in a normal booking email.
6. Deliver the private studio guide only after a verified Stripe webhook or an admin-confirmed cash payment; use a private storage object and short-lived signed URL, and audit delivery.
7. Keep sending errors recorded for retry without deleting or losing the booking.

## Data and rollout safeguards
- Keep the existing admin app, current email sender, Google Sheets synchronization, production tables, and Stripe flows unchanged during development.
- Do not run production migrations, deploy functions, send real email, or change live payment flows without explicit approval after review/testing.
- First build and test the new public booking UI and a staging-safe server flow. Then map each booking type to the existing canonical tables and ensure conflict/availability checks are atomic.
- Subscription enrollment is not a single dated lesson: its group/schedule selection and monthly billing need their own flow.
- Rental reservations need selectable duration, €20/hour calculation, a 24-hour payment deadline, and a configurable cash-confirmation process.
