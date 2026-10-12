# Client records: app as the single source of truth

## Decision
The existing LA DANCE STONE app and its current Supabase project are the canonical store for client records. Excel/Google Sheets must not be required to create, update, or remove app clients.

## Scope
- Admins create and edit clients from the app's existing Students screen.
- Website registrations should be validated and written into the existing Supabase tables/server-side import flow, then appear in the app without a spreadsheet intermediary.
- Group membership is managed in the app and is distinct from the client record.
- Leaving a group or season should deactivate the relevant membership. It must not delete the client, attendance history, payment history, monthly charges, invoices, or rental/drop-in records.
- Clients with historical records should be archived/deactivated, not hard-deleted. Hard deletion is reserved for duplicate/test records only after checking all references and obtaining explicit confirmation.
- The app must continue to support one-off lesson and rental flows; do not change the previously agreed scope of the old Google Sheets sync unless its remaining uses are removed deliberately and verified.

## Release safety
- Keep the existing production Supabase project and data. No new project, paid staging branch, or production migration without approval.
- Do not turn off the existing spreadsheet sync until each of its uses is replaced and verified. The prior agreed sync scope was one-off lessons and rentals only; schedules were excluded.
- Before removing any sync, inventory the website forms, Edge Functions, Stripe callbacks, and import tokens. Verify one test registration and one test rental end-to-end without real payments.
- Compare record counts and reconcile duplicate handling before/after the switch.
- Keep billing test mode enabled during verification.

## Acceptance criteria
1. An admin can add/edit/archive a client in the app.
2. Archived clients no longer appear in active roster/group selectors, but remain available in historical attendance/payment/invoice views.
3. A website registration reaches the app database without Excel/Google Sheets as an intermediary and does not create duplicate clients/orders on retry.
4. Existing one-off lesson and rental registration/payment links continue to work.
5. Teacher access remains limited to assigned groups; only admins manage the complete client directory.
6. Production data and real payment flows remain untouched until these checks pass.
