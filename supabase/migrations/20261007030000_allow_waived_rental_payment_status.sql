alter table public.studio_rentals
drop constraint if exists studio_rentals_payment_status_check;

alter table public.studio_rentals
add constraint studio_rentals_payment_status_check
check (payment_status = any (array['pending'::text,'paid'::text,'cancelled'::text,'waived'::text]));
