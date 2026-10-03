-- Tighten teacher access to payment rows without changing payment data or
-- replacing the existing admin/record_payment RPC workflows.
-- Season-scoped rows require a season assignment and enrollment; legacy rows
-- continue to use the established teacher_can_access_group authorization.

drop policy if exists payments_season_teacher_read on public.payments;
create policy payments_season_teacher_read
  on public.payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.monthly_charges mc
      where mc.id = payments.monthly_charge_id
        and mc.student_id = payments.student_id
        and (
          (
            mc.season_id is null
            and public.teacher_can_access_group(mc.group_id)
            and public.teacher_can_access_student(mc.student_id)
          )
          or
          (
            mc.season_id is not null
            and mc.season_group_id is not null
            and exists (
              select 1
              from public.season_group_teachers sgt
              join public.teachers t on t.id = sgt.teacher_id
              where sgt.season_group_id = mc.season_group_id
                and t.profile_id = auth.uid()
            )
            and exists (
              select 1
              from public.season_enrollments se
              where se.season_id = mc.season_id
                and se.season_group_id = mc.season_group_id
                and se.student_id = mc.student_id
                and se.is_active
            )
          )
        )
    )
  );

-- A restrictive guard also narrows any other permissive direct-table policy.
-- Admins retain their full access; teacher rows must match their actual scope.
drop policy if exists payments_teacher_scope_guard on public.payments;
create policy payments_teacher_scope_guard
  on public.payments
  as restrictive
  for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.monthly_charges mc
      where mc.id = payments.monthly_charge_id
        and mc.student_id = payments.student_id
        and (
          (
            mc.season_id is null
            and public.teacher_can_access_group(mc.group_id)
            and public.teacher_can_access_student(mc.student_id)
          )
          or
          (
            mc.season_id is not null
            and mc.season_group_id is not null
            and exists (
              select 1
              from public.season_group_teachers sgt
              join public.teachers t on t.id = sgt.teacher_id
              where sgt.season_group_id = mc.season_group_id
                and t.profile_id = auth.uid()
            )
            and exists (
              select 1
              from public.season_enrollments se
              where se.season_id = mc.season_id
                and se.season_group_id = mc.season_group_id
                and se.student_id = mc.student_id
                and se.is_active
            )
          )
        )
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.monthly_charges mc
      where mc.id = payments.monthly_charge_id
        and mc.student_id = payments.student_id
        and (
          (
            mc.season_id is null
            and public.teacher_can_access_group(mc.group_id)
            and public.teacher_can_access_student(mc.student_id)
          )
          or
          (
            mc.season_id is not null
            and mc.season_group_id is not null
            and exists (
              select 1
              from public.season_group_teachers sgt
              join public.teachers t on t.id = sgt.teacher_id
              where sgt.season_group_id = mc.season_group_id
                and t.profile_id = auth.uid()
            )
            and exists (
              select 1
              from public.season_enrollments se
              where se.season_id = mc.season_id
                and se.season_group_id = mc.season_group_id
                and se.student_id = mc.student_id
                and se.is_active
            )
          )
        )
    )
  );
