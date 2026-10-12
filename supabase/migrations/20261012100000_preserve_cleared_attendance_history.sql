-- Preserve attendance history when a staff member clears a status.
-- The marker is intentionally stored in attendance_revisions (status is text).
-- The attendance row remains as the stable parent for its audit history.
create or replace function public.clear_group_attendance(p_attendance_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_att public.attendance;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_attendance_id is null then
    return;
  end if;

  select * into v_att
  from public.attendance
  where id = p_attendance_id
  for update;

  if not found then
    return;
  end if;

  if not public.is_admin()
     and not public.is_teacher_for_group(v_att.group_id)
     and not exists (
       select 1
       from public.teacher_substitutions ts
       join public.teachers t on t.id = ts.substitute_teacher_id
       where ts.group_id = v_att.group_id
         and t.profile_id = auth.uid()
         and ts.starts_on <= v_att.attendance_date
         and ts.ends_on >= v_att.attendance_date
     )
  then
    raise exception 'Not authorized';
  end if;

  -- App readers interpret this marker as "no effective attendance status".
  -- Do not delete the attendance row or its prior revisions.
  insert into public.attendance_revisions (
    attendance_id, status, reason, changed_by
  )
  values (
    p_attendance_id, '__cleared__', 'Attendance status cleared by staff', auth.uid()
  );
end;
$function$;

revoke execute on function public.clear_group_attendance(uuid) from public, anon;
grant execute on function public.clear_group_attendance(uuid) to authenticated, service_role;
