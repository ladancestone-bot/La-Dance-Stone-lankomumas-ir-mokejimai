create or replace function public.add_manual_dropin_participant(
  p_lesson_id uuid,
  p_first_name text,
  p_last_name text,
  p_parent_email text default null,
  p_parent_phone text default null
)
returns public.drop_in_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.drop_in_lessons;
  v_student public.students;
  v_booking public.drop_in_bookings;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into v_lesson
  from public.drop_in_lessons
  where id = p_lesson_id and is_active = true;

  if not found then
    raise exception 'One-off lesson not found';
  end if;

  if not public.is_admin()
     and not public.is_teacher_for_group(v_lesson.group_id)
     and not exists (
       select 1
       from public.teacher_substitutions ts
       join public.teachers t on t.id = ts.substitute_teacher_id
       where ts.group_id = v_lesson.group_id
         and t.profile_id = (select auth.uid())
         and ts.starts_on <= v_lesson.lesson_date
         and ts.ends_on >= v_lesson.lesson_date
     )
  then
    raise exception 'Not authorized';
  end if;

  select * into v_student
  from public.students
  where is_active = true
    and (
      (nullif(trim(p_parent_email), '') is not null and lower(parent_email) = lower(trim(p_parent_email)))
      or (
        lower(first_name) = lower(trim(p_first_name))
        and lower(last_name) = lower(trim(p_last_name))
        and nullif(trim(p_parent_email), '') is null
      )
    )
  order by created_at desc
  limit 1;

  if not found then
    insert into public.students (
      first_name,last_name,parent_email,parent_phone,registration_date,is_active,notes
    )
    values (
      trim(p_first_name),trim(p_last_name),
      nullif(trim(p_parent_email),''),
      nullif(trim(p_parent_phone),''),
      v_lesson.lesson_date,true,
      'Bandomoji / vienkartinė pamoka'
    )
    returning * into v_student;
  else
    update public.students
    set parent_email = coalesce(nullif(trim(p_parent_email),''), parent_email),
        parent_phone = coalesce(nullif(trim(p_parent_phone),''), parent_phone),
        updated_at = now(),
        is_active = true
    where id = v_student.id
    returning * into v_student;
  end if;

  insert into public.drop_in_bookings (
    lesson_id,student_id,first_name,last_name,email,phone,status,source,notes
  )
  values (
    p_lesson_id,v_student.id,v_student.first_name,v_student.last_name,
    v_student.parent_email,v_student.parent_phone,
    'pending','manual','Bandomoji pamoka'
  )
  on conflict (lesson_id,student_id) where student_id is not null
  do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone = excluded.phone,
    updated_at = now()
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.add_manual_dropin_participant(uuid,text,text,text,text) from public;
grant execute on function public.add_manual_dropin_participant(uuid,text,text,text,text) to authenticated;
