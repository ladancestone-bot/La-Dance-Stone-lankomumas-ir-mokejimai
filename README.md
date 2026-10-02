# La Dance Stone — Lankomumas ir mokėjimai

Atskira La Dance Stone šokių studijos administravimo aplikacija.

## Stack
- React + TypeScript + Vite
- Supabase Auth + PostgreSQL + RLS
- Netlify

## Modules
- Dashboard
- Students
- Groups
- Attendance: Present / Absent / Sick
- Payments
- Teachers
- Settings / prices

## Security
Only the Supabase publishable/anon key belongs in the browser.
Never put the Supabase service-role key in `.env` or frontend code.

## Netlify
Build command: `npm run build`
Publish directory: `dist`
Node: 20
