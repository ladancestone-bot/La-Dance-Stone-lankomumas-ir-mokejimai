# Booking, Email, Payment and Private Rental Access Workflow

## Decisions
- Build the public booking experience first; integrate into the existing admin app later.
- Reuse the current Supabase project only after checking schema, RLS, and existing source-of-truth records.
- Keep current Hostinger site and its design/content. Add a clear booking flow instead of rebuilding the entire website.
- Public booking and private admin are separate experiences that use the same canonical records.
- Billing remains test-only during development. No real Stripe charges or real customer emails in tests.

## Subscription products
- Children: 2 sessions per week, €50/month.
- Adults: 1 session per week €40/month; 2 sessions per week €50/month; 3 sessions per week €60/month.
- One-off / trial lesson: €10, subject to the specific session and capacity.
- These prices must be configurable in admin, not duplicated as hard-coded UI text.

## Booking types
1. Group class / one-off lesson.
2. Monthly subscription.
3. Studio rental, with a volume discount for bookings longer than 3 hours.

## Rental price calculation — confirmed studio policy
- First 3 hours: €20 per hour.
- Every additional hour after the first 3 hours: €15 per hour.
- Total = `min(hours, 3) × €20 + max(hours − 3, 0) × €15`.
- Examples: 1 hour = €20; 2 hours = €40; 3 hours = €60; 4 hours = €75; 5 hours = €90; 6 hours = €105.
- The booking UI must let customers choose duration and show the full total before they confirm.
- Calculate the amount server-side as well; never trust a client-submitted total. Reject invalid durations and use the same calculation for checkout, emails, and admin records.
- Make the discounted additional-hour rate configurable in admin in a later pricing-settings step, but keep the current confirmed rate at €15/hour.

## Public booking UX
- Mobile-first and Lithuanian-first, with English and Spanish ready.
- Match the existing La Dance Stone website identity; do not redesign unrelated website pages.
- Customer can choose an available date, session, age group/service, and then choose:
  - one-off lesson; or
  - an applicable monthly subscription.
- For rental, customer chooses date, start time, and duration; show total price including the >3-hour discount before confirmation.
- Show clear total price, local date/time (Europe/Vilnius), remaining capacity where relevant, terms, and payment state.
- Avoid duplicate bookings and overbooking using server-side checks.

## Email workflow
- Send professional, branded HTML emails from the studio's configured sender.
- Booking email templates are separate for one-off lesson, subscription, rental awaiting payment, payment confirmation, and rental access instructions.
- Record email delivery attempts/status against the canonical booking; retries must be idempotent.
- A reservation record must persist even if email delivery fails.
- Don't send any real emails in development/testing without explicit approval.

### One-off lesson
- Persist booking, then email customer booking details and payment link/instructions.
- Customer can pay during checkout or use a link sent by email, if enabled.
- Mark paid only after verified Stripe webhook or explicit authorized manual confirmation.

### Monthly subscription
- Persist subscription/registration and selected group/schedule, then email summary, amount, and payment instructions/link.
- Avoid implying payment is complete until verified.
- Adult plans: €40 (1x/week), €50 (2x/week), €60 (3x/week).
- Children plan: €50 (2x/week).
- Preserve subscription renewal/billing behavior only after current payment model is reviewed and confirmed.

### Studio rental
- Price: first 3 hours €20/hour; each additional hour €15/hour (e.g. 3h €60, 4h €75, 5h €90).
- Payment methods: Stripe card or cash/manual payment.
- Deadline: rental must be paid within 24 hours of reservation.
- For cash: customer must phone the studio to inform the studio; booking stays awaiting manual confirmation and is not treated as paid.
- Send booking confirmation immediately, clearly stating the payment deadline and that the access guide is withheld until payment is confirmed.
- Send reminder before deadline where feasible; alert admin about pending cash requests/overdue bookings.
- If the 24-hour deadline passes unpaid, follow an explicit configurable policy (admin review/cancel and release slot). Do not silently cancel until the policy is approved.

## Private rental guide PDF
- The supplied studio usage PDF contains sensitive access details, including the keybox code, entry instructions, equipment instructions, and rules.
- Do not expose it in public website HTML, public object storage, public OneDrive links, or pre-payment emails.
- Store in a private Supabase Storage bucket (or another access-controlled store).
- Generate a short-lived signed download link only after the server confirms verified Stripe payment or an authorized admin marks manual cash payment received.
- Send the access-guide email only once the booking is paid, with retry support that doesn't duplicate or accidentally send before payment.
- Keep an audit event for access-guide delivery. Admin can resend it after verifying payment.
- Do not place the keybox code or raw guide content in general logs or public booking API responses.

## Stripe correctness
- Checkout session creation is server-side only and validates booking ownership, price, booking status, amount, and allowed payment method.
- Never trust a success/return URL to mark a booking paid.
- Only verified Stripe webhook events update payment status; processing is idempotent.
- Keep BILLING_TEST_MODE enabled until reconciliation, tests, and explicit launch approval.
- Never put Stripe secrets or Supabase service-role key in browser code.

## Later admin-app integration
- Admin app and public booking use the same canonical Supabase records; don't copy bookings into an independent database.
- Integrate views for reservations, attendance, subscriptions/monthly charges, payments, rentals, email status, and guide delivery.
- Keep current Google Sheets sync enabled until a tested replacement is verified end-to-end.
- Preserve existing history and identifiers; no destructive migrations without reviewed backup and reconciliation.

## Acceptance criteria
- [ ] Correct child/adult subscription options and prices.
- [ ] One-off lesson and monthly subscription are clear alternatives.
- [ ] Rental duration selector calculates first 3 hours at €20/hour and additional hours at €15/hour.
- [ ] Rental date/time availability prevents overlaps.
- [ ] Rental confirmation states the 24-hour payment deadline.
- [ ] Cash option instructs customer to call; no automatic paid state.
- [ ] Studio PDF never becomes accessible before confirmed payment.
- [ ] Access PDF email triggers automatically after verified payment/manual cash confirmation.
- [ ] Emails are professional, mobile-friendly, branded, and status-tracked.
- [ ] Retry and webhook replays don't create duplicate bookings or emails.
- [ ] Existing app and booking records remain intact.
- [ ] Production deployment and real payment activation require separate approval.
