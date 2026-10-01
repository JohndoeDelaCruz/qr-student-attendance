-- Run after 202610010001_initial_schema.sql in the Supabase SQL Editor.
begin;

-- All scans must pass the atomic workflow below, including direct API requests.
revoke insert on public.attendance_logs from authenticated;
revoke insert (student_id, event_type) on public.attendance_logs from authenticated;
drop policy if exists staff_record_attendance on public.attendance_logs;

create or replace function public.record_student_scan(p_qr_token uuid, p_event_type text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_student public.students%rowtype;
  v_last public.attendance_logs%rowtype;
  v_now timestamptz;
  v_profile jsonb;
begin
  if v_user is null or not exists (
    select 1 from public.staff_users where user_id = v_user and role in ('admin', 'operator')
  ) then
    return jsonb_build_object('status', 'denied', 'message', 'Staff access is required.');
  end if;
  if p_event_type is null or p_event_type not in ('TIME_IN', 'TIME_OUT') or p_qr_token is null then
    return jsonb_build_object('status', 'invalid', 'message', 'Choose a scan mode and use a valid student QR.');
  end if;

  -- Serializes simultaneous scans for this student and concurrent status changes.
  select * into v_student from public.students where qr_token = p_qr_token for update;
  if not found then
    return jsonb_build_object('status', 'unknown', 'message', 'This QR is not registered to a student.');
  end if;
  v_profile := jsonb_build_object(
    'id', v_student.id, 'student_number', v_student.student_number,
    'first_name', v_student.first_name, 'last_name', v_student.last_name,
    'section', v_student.section, 'status', v_student.status, 'photo_path', v_student.photo_path
  );
  if v_student.status <> 'active' then
    return jsonb_build_object('status', 'inactive', 'message', 'This student is inactive. No entry was recorded.', 'student', v_profile);
  end if;

  v_now := clock_timestamp();
  select * into v_last from public.attendance_logs
    where student_id = v_student.id order by scanned_at desc, id desc limit 1;
  if found then
    if v_now - v_last.scanned_at < interval '10 seconds' then
      return jsonb_build_object('status', 'duplicate', 'message', 'A scan was just recorded. Wait 10 seconds before scanning again.', 'student', v_profile);
    end if;
    if (v_last.scanned_at at time zone 'Asia/Manila')::date = (v_now at time zone 'Asia/Manila')::date then
      if v_last.event_type = p_event_type then
        return jsonb_build_object('status', 'duplicate', 'message', 'This student already has this scan type. Choose the other mode for their next entry or exit.', 'student', v_profile);
      end if;
    elsif p_event_type = 'TIME_OUT' then
      return jsonb_build_object('status', 'needs_time_in', 'message', 'Record a Time In today before a Time Out.', 'student', v_profile);
    end if;
  elsif p_event_type = 'TIME_OUT' then
    return jsonb_build_object('status', 'needs_time_in', 'message', 'Record a Time In today before a Time Out.', 'student', v_profile);
  end if;

  insert into public.attendance_logs(student_id, event_type, scanned_at, scanned_by)
    values (v_student.id, p_event_type, v_now, v_user);
  return jsonb_build_object('status', 'recorded', 'message', 'Scan recorded.',
    'student', v_profile, 'event_type', p_event_type, 'scanned_at', v_now);
end;
$$;

revoke all on function public.record_student_scan(uuid, text) from public, anon;
grant execute on function public.record_student_scan(uuid, text) to authenticated;

commit;
