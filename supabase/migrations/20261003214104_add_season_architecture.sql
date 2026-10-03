-- Additive, repeatable period foundation. No seed or backfill is performed:
-- initial dates and legacy mappings require a separately reviewed report.
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  period_type text not null default 'regular' check (length(btrim(period_type)) > 0),
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_dates_order check (starts_on is null or ends_on is null or starts_on <= ends_on)
);
create unique index if not exists seasons_single_active_regular_idx
  on public.seasons ((lower(period_type))) where lower(period_type)='regular' and is_active;

create table if not exists public.season_groups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  category text,
  age_min integer,
  age_max integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_groups_age_order check (age_min is null or age_max is null or age_min <= age_max),
  constraint season_groups_season_group_key unique (season_id, group_id),
  constraint season_groups_season_id_key unique (season_id, id)
);

create table if not exists public.season_group_schedules (
  id uuid primary key default gen_random_uuid(),
  season_group_id uuid not null references public.season_groups(id) on delete restrict,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  valid_from date,
  valid_to date,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_group_schedules_time_order check (starts_at < ends_at),
  constraint season_group_schedules_date_order check (valid_from is null or valid_to is null or valid_from <= valid_to)
);

create table if not exists public.season_group_teachers (
  id uuid primary key default gen_random_uuid(),
  season_group_id uuid not null references public.season_groups(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  is_primary boolean not null default false,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_group_teachers_date_order check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint season_group_teachers_group_teacher_key unique (season_group_id, teacher_id)
);

create table if not exists public.season_enrollments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  season_group_id uuid not null,
  student_id uuid not null references public.students(id) on delete restrict,
  enrolled_on date,
  ended_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_enrollments_dates_order check (enrolled_on is null or ended_on is null or enrolled_on <= ended_on),
  constraint season_enrollments_group_fk foreign key (season_id, season_group_id)
    references public.season_groups(season_id, id) on delete restrict,
  constraint season_enrollments_season_group_student_key unique (season_id, season_group_id, student_id)
);

create table if not exists public.season_prices (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  source_price_id uuid references public.prices(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'EUR',
  billing_period text not null default 'monthly',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint season_prices_season_id_key unique (season_id, id)
);

create table if not exists public.season_price_assignments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  season_group_id uuid not null,
  season_price_id uuid not null,
  student_id uuid references public.students(id) on delete restrict,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_price_assignments_dates_order check (valid_to is null or valid_from <= valid_to),
  constraint season_price_assignments_group_fk foreign key (season_id, season_group_id)
    references public.season_groups(season_id, id) on delete restrict,
  constraint season_price_assignments_price_fk foreign key (season_id, season_price_id)
    references public.season_prices(season_id, id) on delete restrict
);

create table if not exists public.attendance_revisions (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id) on delete restrict,
  status text not null check (status in ('present', 'absent', 'sick')),
  reason text not null check (length(btrim(reason)) > 0),
  changed_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.attendance_revisions is 'Append-only attendance corrections. Original attendance rows remain the source record.';
comment on table public.seasons is 'Configurable organizational or activity periods; dates do not gate application operation.';

-- Nullable lineage leaves all existing attendance and charge rows untouched.
alter table public.attendance add column if not exists season_id uuid;
alter table public.monthly_charges add column if not exists season_id uuid;
alter table public.monthly_charges add column if not exists season_group_id uuid;
alter table public.monthly_charges add column if not exists season_price_id uuid;
alter table public.monthly_charges add column if not exists applied_price_amount numeric(12,2);
alter table public.monthly_charges add column if not exists applied_currency text;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.attendance'::regclass and conname='attendance_season_id_fkey') then
    alter table public.attendance add constraint attendance_season_id_fkey foreign key (season_id) references public.seasons(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.attendance'::regclass and conname='attendance_season_group_fkey') then
    alter table public.attendance add constraint attendance_season_group_fkey foreign key (season_id, group_id) references public.season_groups(season_id, group_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.attendance'::regclass and conname='attendance_season_requires_group') then
    alter table public.attendance add constraint attendance_season_requires_group check (season_id is null or group_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.monthly_charges'::regclass and conname='monthly_charges_season_id_fkey') then
    alter table public.monthly_charges add constraint monthly_charges_season_id_fkey foreign key (season_id) references public.seasons(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.monthly_charges'::regclass and conname='monthly_charges_season_group_fkey') then
    alter table public.monthly_charges add constraint monthly_charges_season_group_fkey foreign key (season_id, season_group_id) references public.season_groups(season_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.monthly_charges'::regclass and conname='monthly_charges_season_price_fkey') then
    alter table public.monthly_charges add constraint monthly_charges_season_price_fkey foreign key (season_id, season_price_id) references public.season_prices(season_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.monthly_charges'::regclass and conname='monthly_charges_lineage_requires_season') then
    alter table public.monthly_charges add constraint monthly_charges_lineage_requires_season check (
      season_id is not null or (season_group_id is null and season_price_id is null and applied_price_amount is null and applied_currency is null));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.monthly_charges'::regclass and conname='monthly_charges_season_price_snapshot_complete') then
    alter table public.monthly_charges add constraint monthly_charges_season_price_snapshot_complete check (
      season_group_id is null or (season_id is not null and season_price_id is not null and applied_price_amount is not null and applied_currency is not null));
  end if;
end $$;

create index if not exists season_groups_season_active_idx on public.season_groups(season_id, is_active, group_id);
create index if not exists season_groups_group_season_idx on public.season_groups(group_id, season_id);
create index if not exists season_group_schedules_group_weekday_idx on public.season_group_schedules(season_group_id, weekday, starts_at);
create unique index if not exists season_group_schedules_slot_key on public.season_group_schedules(season_group_id, weekday, starts_at, valid_from) nulls not distinct;
create index if not exists season_group_teachers_teacher_idx on public.season_group_teachers(teacher_id, season_group_id);
create unique index if not exists season_group_teachers_single_primary_idx on public.season_group_teachers(season_group_id) where is_primary;
create index if not exists season_enrollments_student_idx on public.season_enrollments(student_id, season_id, is_active);
create index if not exists season_enrollments_group_idx on public.season_enrollments(season_id, season_group_id, is_active);
create index if not exists season_prices_active_idx on public.season_prices(season_id, is_active);
create index if not exists season_price_assignments_effective_idx on public.season_price_assignments(season_id, season_group_id, valid_from, valid_to);
create index if not exists season_price_assignments_student_idx on public.season_price_assignments(student_id, season_id) where student_id is not null;
create index if not exists season_price_assignments_price_idx on public.season_price_assignments(season_price_id);
create index if not exists attendance_season_group_date_idx on public.attendance(season_id, group_id, attendance_date);
create index if not exists attendance_revisions_attendance_created_idx on public.attendance_revisions(attendance_id, created_at, id);
create index if not exists monthly_charges_season_month_idx on public.monthly_charges(season_id, month);
create index if not exists monthly_charges_season_group_month_idx on public.monthly_charges(season_group_id, month);
create unique index if not exists monthly_charges_season_student_month_key on public.monthly_charges(season_group_id, student_id, month) where season_group_id is not null;

alter table public.seasons enable row level security;
alter table public.season_groups enable row level security;
alter table public.season_group_schedules enable row level security;
alter table public.season_group_teachers enable row level security;
alter table public.season_enrollments enable row level security;
alter table public.season_prices enable row level security;
alter table public.season_price_assignments enable row level security;
alter table public.attendance_revisions enable row level security;

-- Add policies only if absent. Existing policies/functions/grants remain intact.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='seasons' and policyname='seasons_admin_all') then
    create policy seasons_admin_all on public.seasons for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='seasons' and policyname='seasons_teacher_read') then
    create policy seasons_teacher_read on public.seasons for select to authenticated using (exists (
      select 1 from public.season_groups sg join public.season_group_teachers sgt on sgt.season_group_id=sg.id
      join public.teachers t on t.id=sgt.teacher_id where sg.season_id=seasons.id and t.profile_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_groups' and policyname='season_groups_admin_all') then
    create policy season_groups_admin_all on public.season_groups for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_groups' and policyname='season_groups_teacher_read') then
    create policy season_groups_teacher_read on public.season_groups for select to authenticated using (exists (
      select 1 from public.season_group_teachers sgt join public.teachers t on t.id=sgt.teacher_id
      where sgt.season_group_id=season_groups.id and t.profile_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_group_schedules' and policyname='season_schedules_admin_all') then
    create policy season_schedules_admin_all on public.season_group_schedules for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_group_schedules' and policyname='season_schedules_teacher_read') then
    create policy season_schedules_teacher_read on public.season_group_schedules for select to authenticated using (exists (
      select 1 from public.season_groups sg where sg.id=season_group_schedules.season_group_id and exists (
        select 1 from public.season_group_teachers sgt join public.teachers t on t.id=sgt.teacher_id where sgt.season_group_id=sg.id and t.profile_id=auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_group_teachers' and policyname='season_teachers_admin_all') then
    create policy season_teachers_admin_all on public.season_group_teachers for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_group_teachers' and policyname='season_teachers_teacher_read') then
    create policy season_teachers_teacher_read on public.season_group_teachers for select to authenticated using (exists (
      select 1 from public.teachers t where t.id=season_group_teachers.teacher_id and t.profile_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_enrollments' and policyname='season_enrollments_admin_all') then
    create policy season_enrollments_admin_all on public.season_enrollments for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_enrollments' and policyname='season_enrollments_teacher_read') then
    create policy season_enrollments_teacher_read on public.season_enrollments for select to authenticated using (
      exists (select 1 from public.season_group_teachers sgt join public.teachers t on t.id=sgt.teacher_id
        where sgt.season_group_id=season_enrollments.season_group_id and t.profile_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_prices' and policyname='season_prices_admin_all') then
    create policy season_prices_admin_all on public.season_prices for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_price_assignments' and policyname='season_price_assignments_admin_all') then
    create policy season_price_assignments_admin_all on public.season_price_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='attendance_revisions' and policyname='attendance_revisions_admin_all') then
    create policy attendance_revisions_admin_all on public.attendance_revisions for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='attendance_revisions' and policyname='attendance_revisions_teacher_read') then
    create policy attendance_revisions_teacher_read on public.attendance_revisions for select to authenticated using (exists (
      select 1 from public.attendance a where a.id=attendance_revisions.attendance_id and (
        (a.season_id is null and public.teacher_can_access_group(a.group_id) and public.teacher_can_access_student(a.student_id)) or
        exists (select 1 from public.season_groups sg join public.season_group_teachers sgt on sgt.season_group_id=sg.id
          join public.teachers t on t.id=sgt.teacher_id join public.season_enrollments se on se.season_group_id=sg.id and se.student_id=a.student_id
          where sg.season_id=a.season_id and sg.group_id=a.group_id and t.profile_id=auth.uid()))));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='attendance_revisions' and policyname='attendance_revisions_teacher_insert') then
    create policy attendance_revisions_teacher_insert on public.attendance_revisions for insert to authenticated with check (exists (
      select 1 from public.attendance a where a.id=attendance_revisions.attendance_id and (
        (a.season_id is null and public.teacher_can_access_group(a.group_id) and public.teacher_can_access_student(a.student_id)) or
        exists (select 1 from public.season_groups sg join public.season_group_teachers sgt on sgt.season_group_id=sg.id
          join public.teachers t on t.id=sgt.teacher_id join public.season_enrollments se on se.season_group_id=sg.id and se.student_id=a.student_id
          where sg.season_id=a.season_id and sg.group_id=a.group_id and t.profile_id=auth.uid())) and changed_by=auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='attendance' and policyname='attendance_season_teacher_read') then
    create policy attendance_season_teacher_read on public.attendance for select to authenticated using (season_id is not null and exists (
      select 1 from public.season_groups sg join public.season_group_teachers sgt on sgt.season_group_id=sg.id
      join public.teachers t on t.id=sgt.teacher_id join public.season_enrollments se on se.season_group_id=sg.id and se.student_id=attendance.student_id
      where sg.season_id=attendance.season_id and sg.group_id=attendance.group_id and t.profile_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='attendance' and policyname='attendance_season_teacher_insert') then
    create policy attendance_season_teacher_insert on public.attendance for insert to authenticated with check (season_id is not null and exists (
      select 1 from public.season_groups sg join public.season_group_teachers sgt on sgt.season_group_id=sg.id
      join public.teachers t on t.id=sgt.teacher_id join public.season_enrollments se on se.season_group_id=sg.id and se.student_id=attendance.student_id
      where sg.season_id=attendance.season_id and sg.group_id=attendance.group_id and t.profile_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='monthly_charges' and policyname='monthly_charges_season_teacher_read') then
    create policy monthly_charges_season_teacher_read on public.monthly_charges for select to authenticated using (
      season_id is not null and exists (select 1 from public.season_groups sg
        join public.season_group_teachers sgt on sgt.season_group_id=sg.id join public.teachers t on t.id=sgt.teacher_id
        join public.season_enrollments se on se.season_group_id=sg.id and se.student_id=monthly_charges.student_id
        where sg.season_id=monthly_charges.season_id and sg.id=monthly_charges.season_group_id
          and sg.group_id=monthly_charges.group_id and t.profile_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payments' and policyname='payments_season_teacher_read') then
    create policy payments_season_teacher_read on public.payments for select to authenticated using (exists (
      select 1 from public.monthly_charges mc where mc.id=payments.monthly_charge_id and mc.season_id is not null));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='groups' and policyname='groups_season_teacher_read') then
    create policy groups_season_teacher_read on public.groups for select to authenticated using (exists (
      select 1 from public.season_groups sg join public.season_group_teachers sgt on sgt.season_group_id=sg.id
      join public.teachers t on t.id=sgt.teacher_id where sg.group_id=groups.id and t.profile_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='students' and policyname='students_season_teacher_read') then
    create policy students_season_teacher_read on public.students for select to authenticated using (exists (
      select 1 from public.season_enrollments se join public.season_group_teachers sgt on sgt.season_group_id=se.season_group_id
      join public.teachers t on t.id=sgt.teacher_id where se.student_id=students.id and t.profile_id=auth.uid()));
  end if;
end $$;

-- Keep attendance's original facts immutable. Corrections are appended to
-- attendance_revisions by the application. Empty search_path is fixed here too.
create or replace function public.reject_attendance_history_update()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.student_id is distinct from old.student_id
    or new.group_id is distinct from old.group_id
    or new.attendance_date is distinct from old.attendance_date
    or new.status is distinct from old.status
    or new.season_id is distinct from old.season_id then
    raise exception 'Attendance history is immutable; append a correction to attendance_revisions.';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_attendance_history_update() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid='public.attendance'::regclass and tgname='attendance_history_immutable') then
    create trigger attendance_history_immutable before update on public.attendance
      for each row execute function public.reject_attendance_history_update();
  end if;
end $$;

grant select, insert, update, delete on public.seasons, public.season_groups, public.season_group_schedules,
  public.season_group_teachers, public.season_enrollments, public.season_prices, public.season_price_assignments to authenticated;
grant select, insert on public.attendance_revisions to authenticated;
