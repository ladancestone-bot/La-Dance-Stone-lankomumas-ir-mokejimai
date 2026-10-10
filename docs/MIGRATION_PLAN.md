# La Dance Stone — migration plan

## Goal
Move the existing application away from Netlify without losing the current UI, Supabase data, authentication, roles, or features. Then assess a separate Expo/React Native mobile app using the existing Supabase backend.

## Current repository audit
- Frontend: React 19 + TypeScript + Vite.
- Build command: `npm run build`.
- Build output: `dist`.
- Current data/auth provider: Supabase JS client.
- Database migration files exist under `supabase/migrations/`.
- Existing Netlify config sets Node 20, build `npm run build`, publish `dist`, and an SPA fallback redirect.
- GitHub Pages workflow exists. Its build step receives `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from GitHub Actions secrets.
- The frontend is currently a web app, not yet an Expo/React Native native app.

## Non-negotiable safety rules
1. Do not delete, recreate, reset, or migrate the Supabase project until its owner/access and live data are confirmed.
2. Never place a Supabase service-role key in browser code, GitHub Actions frontend builds, or a public repository.
3. Only use the Supabase publishable/anon key in client-side code.
4. Take a database backup before any schema/data migration.
5. Do not remove the Netlify project until the replacement is deployed and tested.
6. Do not commit real credentials or a populated `.env` file.

## Phase 1 — verify Supabase access
- Confirm the project `tqzabmlrtbrylibafjfh` is visible in the correct Supabase account/organization.
- Confirm project status and billing/paused state.
- Confirm the database still contains the expected tables and rows.
- Confirm the owner can access Authentication URL Configuration.
- Export a backup and record current Auth Site URL / Redirect URLs.
- Do not run SQL migrations against production just because files exist in the repository; first compare migration history with the live schema.

## Phase 2 — deploy the existing web app on Hostinger Business
Hostinger documents Node.js web app deployment for Business Web Hosting, including React/Vite and GitHub integration.
- In hPanel, use Websites → Add Website → Deploy Web App / Node.js web app → Import Git Repository.
- Repository: `https://github.com/ladancestone-bot/La-Dance-Stone-lankomumas-ir-mokejimai`
- Framework: Vite (or auto-detected).
- Build command: `npm run build`.
- Output directory: `dist`.
- Node.js: 20 or a supported compatible version.
- Add environment variables in Hostinger's deployment settings:
  - `VITE_SUPABASE_URL` = the existing Supabase project URL.
  - `VITE_SUPABASE_ANON_KEY` = the existing project's publishable/anon key.
- Do not paste secrets into public GitHub files or screenshots.
- Prefer deploying first to a temporary Hostinger URL/subdomain. Do not replace the live studio domain before tests pass.
- If the Hostinger plan does not show Node.js web app deployment, stop and check plan eligibility before purchasing VPS.

## Phase 3 — fix authentication redirects
After the Hostinger preview URL exists:
- In Supabase Authentication URL Configuration, set the Site URL to the final intended app URL only when ready.
- Add the temporary preview URL and final URL to Redirect URLs.
- Update the magic-link request in the app to use the intended current app URL; remove any hard-coded Netlify redirect if present.
- Test receiving a magic link, opening it on desktop and phone, signing in, signing out, and role-based access.
- Never assume the auth flow is fixed just because the login screen loads.

## Phase 4 — verify core functionality
Use a non-production test account if possible.
- Admin, teacher, assistant roles and access restrictions.
- Student and group records.
- Attendance save and refresh.
- Monthly payment records and month selection.
- Rental records, if enabled.
- Realtime attendance updates.
- Refresh/deep links and phone layout.
- Confirm all writes appear in the same existing Supabase project.
- Compare important record counts before and after deployment.

## Phase 5 — plan the real mobile app
Do not assume the Vite app can be opened directly in Expo Go.
- Create a separate Expo + React Native app folder/repository for iOS and Android UI.
- Reuse Supabase Auth and database only after validating the existing schema, policies (RLS), and role model.
- Reimplement screens and navigation in React Native; reuse business rules/types where practical.
- Expo Go is a development preview, not the final App Store/Google Play release.
- Keep the current web app available until the mobile version passes tests.

## Rollback
If the Hostinger deployment or authentication test fails, leave the old deployment/configuration untouched and continue using the last working preview. Do not delete Netlify or alter the production Supabase project until a tested replacement exists.
