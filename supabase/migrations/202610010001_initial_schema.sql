-- Run once in the Supabase SQL Editor on the new project.
-- Membership is managed through the dashboard, never by browser users.
begin;

create table public.staff_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  role text not null default 'operator' check (role in ('admin', 'operator')),
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  student_number text not null unique check (length(trim(student_number)) > 0),
  qr_token uuid not null unique default gen_random_uuid(),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  section text not null check (length(trim(section)) > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  photo_path text,
  guardian_phone text,
  created_at timestamptz not null default now()
);

create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  event_type text not null check (event_type in ('TIME_IN', 'TIME_OUT')),
  scanned_at timestamptz not null default now(),
  scanned_by uuid default auth.uid() references auth.users(id) on delete set null
);

create index attendance_logs_student_time_idx
  on public.attendance_logs(student_id, scanned_at desc);
create index attendance_logs_time_idx on public.attendance_logs(scanned_at desc);

alter table public.staff_users enable row level security;
alter table public.students enable row level security;
alter table public.attendance_logs enable row level security;

-- Override Supabase's default table grants explicitly.
revoke all on public.staff_users, public.students, public.attendance_logs
  from anon, authenticated;
grant select on public.staff_users, public.students, public.attendance_logs
  to authenticated;
grant insert (student_number, first_name, last_name, section, status, photo_path, guardian_phone)
  on public.students to authenticated;
grant update (student_number, qr_token, first_name, last_name, section, status, photo_path, guardian_phone)
  on public.students to authenticated;
-- Database defaults supply the timestamp and scanner identity.
grant insert (student_id, event_type) on public.attendance_logs to authenticated;

create policy staff_read_own_membership on public.staff_users
  for select to authenticated using (user_id = (select auth.uid()));

create policy staff_read_students on public.students
  for select to authenticated using (
    exists (select 1 from public.staff_users where user_id = (select auth.uid()))
  );

create policy admins_create_students on public.students
  for insert to authenticated with check (
    exists (select 1 from public.staff_users
      where user_id = (select auth.uid()) and role = 'admin')
  );

create policy admins_update_students on public.students
  for update to authenticated using (
    exists (select 1 from public.staff_users
      where user_id = (select auth.uid()) and role = 'admin')
  ) with check (
    exists (select 1 from public.staff_users
      where user_id = (select auth.uid()) and role = 'admin')
  );

create policy staff_read_attendance on public.attendance_logs
  for select to authenticated using (
    exists (select 1 from public.staff_users where user_id = (select auth.uid()))
  );

create policy staff_record_attendance on public.attendance_logs
  for insert to authenticated with check (
    scanned_by = (select auth.uid())
    and exists (select 1 from public.staff_users where user_id = (select auth.uid()))
    and exists (select 1 from public.students
      where id = student_id and status = 'active')
  );

-- Create the private student-photos bucket separately in Storage first or later.
-- These policies apply only to that bucket.
create policy staff_read_student_photos on storage.objects
  for select to authenticated using (
    bucket_id = 'student-photos'
    and exists (select 1 from public.staff_users where user_id = (select auth.uid()))
  );

create policy admins_upload_student_photos on storage.objects
  for insert to authenticated with check (
    bucket_id = 'student-photos'
    and exists (select 1 from public.staff_users
      where user_id = (select auth.uid()) and role = 'admin')
  );

create policy admins_update_student_photos on storage.objects
  for update to authenticated using (
    bucket_id = 'student-photos'
    and exists (select 1 from public.staff_users
      where user_id = (select auth.uid()) and role = 'admin')
  ) with check (
    bucket_id = 'student-photos'
    and exists (select 1 from public.staff_users
      where user_id = (select auth.uid()) and role = 'admin')
  );

create policy admins_delete_student_photos on storage.objects
  for delete to authenticated using (
    bucket_id = 'student-photos'
    and exists (select 1 from public.staff_users
      where user_id = (select auth.uid()) and role = 'admin')
  );

commit;
