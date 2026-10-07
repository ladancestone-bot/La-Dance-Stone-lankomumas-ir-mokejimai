-- A student may legitimately be enrolled in more than one group in the same month
-- (for example, Gabija Tamošiūnaitė appears in both adult groups).
-- The group-aware unique key already protects duplicates; the student+month-only
-- index incorrectly blocks valid multi-group charges.
drop index if exists public.monthly_charges_student_month_2026_unique;
