-- Keep one booking per student and lesson and prevent concurrent duplicate inserts.
with ranked as (
  select id,
    first_value(id) over (
      partition by lesson_id, student_id
      order by case when status::text = 'paid' then 0 else 1 end,
               case when attendance_status is not null then 0 else 1 end,
               created_at asc, id asc
    ) as keep_id
  from public.drop_in_bookings
  where student_id is not null
),
duplicates as (select id from ranked where id <> keep_id)
delete from public.drop_in_bookings b
where b.id in (select id from duplicates);

create unique index if not exists drop_in_bookings_lesson_student_unique
on public.drop_in_bookings (lesson_id, student_id)
where student_id is not null;

-- The website-order processor uses the unique key so repeated syncs cannot create
-- another booking for the same student in the same one-off lesson.
create or replace function public.process_dropin_website_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  o public.website_orders;
  student_uuid uuid;
  group_uuid uuid;
  teacher_uuid uuid;
  lesson_uuid uuid;
  first_name text;
  last_name text;
  full_name text;
begin
  select * into o from public.website_orders where id=p_order_id for update;
  if not found then raise exception 'Website order not found'; end if;
  if o.order_type <> 'drop_in' then return jsonb_build_object('ok',true,'status','ignored'); end if;

  full_name:=nullif(trim(coalesce(o.child_name,o.customer_name)),'');
  first_name:=split_part(coalesce(full_name,''),' ',1);
  last_name:=nullif(trim(substr(coalesce(full_name,''),length(first_name)+1)),'');
  if last_name is null then last_name:=''; end if;

  select s.id into student_uuid from public.students s
  where (o.customer_email is not null and lower(trim(s.email))=lower(trim(o.customer_email)))
     or (o.parent_email is not null and lower(trim(s.parent_email))=lower(trim(o.parent_email)) and lower(trim(s.first_name||' '||s.last_name))=lower(trim(coalesce(full_name,''))))
  order by s.is_active desc,s.created_at asc limit 1;

  if student_uuid is null then
    insert into public.students(first_name,last_name,email,phone,date_of_birth,parent_name,parent_email,parent_phone,registration_date,notes,is_active)
    values(first_name,last_name,nullif(trim(o.customer_email),''),nullif(trim(o.customer_phone),''),o.child_birth_date,nullif(trim(o.parent_name),''),nullif(trim(o.parent_email),''),nullif(trim(o.parent_phone),''),coalesce(o.created_at::date,current_date),'Automatiškai importuota iš svetainės vienkartinės pamokos.',true)
    returning id into student_uuid;
  else
    update public.students set first_name=coalesce(nullif(first_name,''),students.first_name),last_name=coalesce(nullif(last_name,''),students.last_name),email=coalesce(nullif(trim(o.customer_email),''),students.email),phone=coalesce(nullif(trim(o.customer_phone),''),students.phone),updated_at=now() where id=student_uuid;
  end if;

  select g.id into group_uuid from public.groups g
  where g.is_active and (
    (lower(coalesce(o.group_text,'')) like '%suaugus%' and lower(coalesce(o.group_text,'')) like '%19:00%' and g.name ilike '%Suaugusieji%' and g.name ilike '%19:00%')
    or (lower(coalesce(o.group_text,'')) like '%suaugus%' and lower(coalesce(o.lesson_text,'')) like '%19:00%' and g.name ilike '%Suaugusieji%' and g.name ilike '%19:00%')
    or (lower(coalesce(o.group_text,'')) like '%13-18%' and lower(coalesce(o.group_text,'')) like '%antradien%' and g.name ilike '%13-18m%' and g.name ilike '%Antradienis%')
    or (lower(coalesce(o.group_text,'')) like '%13-18%' and (lower(coalesce(o.group_text,'')) like '%pirmadien%' or lower(coalesce(o.group_text,'')) like '%trečiadien%') and g.name ilike '%13-18m%' and g.name ilike '%Pirmadienis%')
    or (lower(coalesce(o.group_text,'')) like '%7-12%' and lower(coalesce(o.group_text,'')) like '%antradien%' and g.name ilike '%7-12m%' and g.name ilike '%Antradienis%')
    or (lower(coalesce(o.group_text,'')) like '%7-12%' and (lower(coalesce(o.group_text,'')) like '%pirmadien%' or lower(coalesce(o.group_text,'')) like '%pirmadienis%' or lower(coalesce(o.group_text,'')) like '%trečiadien%') and g.name ilike '%7-12m%' and g.name ilike '%Pirmadienis%')
  ) order by g.name limit 1;

  if group_uuid is null or o.reservation_date is null or o.start_time is null then
    update public.website_orders set status='needs_review',error_message='Vienkartinės pamokos grupės, datos arba laiko nepavyko susieti.',updated_at=now() where id=p_order_id;
    return jsonb_build_object('ok',true,'status','needs_review','student_id',student_uuid);
  end if;

  select t.id into teacher_uuid from public.group_teachers gt join public.teachers t on t.id=gt.teacher_id
  where gt.group_id=group_uuid and gt.is_primary=true and t.is_active=true limit 1;

  select id into lesson_uuid from public.drop_in_lessons
  where group_id=group_uuid and lesson_date=o.reservation_date and start_time=o.start_time and coalesce(end_time,o.start_time)=coalesce(o.end_time,o.start_time)
  limit 1;

  if lesson_uuid is null then
    insert into public.drop_in_lessons(group_id,teacher_id,lesson_date,start_time,end_time,price,notes,is_active)
    values(group_uuid,teacher_uuid,o.reservation_date,o.start_time,o.end_time,coalesce(o.amount,0),coalesce(o.purpose,'Vienkartinė pamoka'),true)
    returning id into lesson_uuid;
  end if;

  insert into public.drop_in_bookings(lesson_id,student_id,first_name,last_name,email,phone,status,payment_method,source,notes,website_order_id)
  values(lesson_uuid,student_uuid,first_name,last_name,o.customer_email,o.customer_phone,'registered',null,'website',coalesce(o.purpose,'Vienkartinė pamoka'),o.id)
  on conflict (lesson_id,student_id) where student_id is not null do nothing;

  update public.website_orders set status='processed',processed_at=now(),error_message=null,updated_at=now() where id=p_order_id;
  return jsonb_build_object('ok',true,'status','processed','student_id',student_uuid,'group_id',group_uuid,'lesson_id',lesson_uuid);
exception when others then
  update public.website_orders set status='error',error_message=sqlerrm,updated_at=now() where id=p_order_id;
  raise;
end;
$function$;