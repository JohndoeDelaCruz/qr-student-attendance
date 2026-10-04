                                                                                                                              -- Apply after both attendance migrations. No historical SMS are created.
                                                                                                                              begin;

                                                                                                                              create table if not exists public.sms_settings (
                                                                                                                                id boolean primary key default true check (id),
                                                                                                                                enabled boolean not null default false
                                                                                                                              );
                                                                                                                              insert into public.sms_settings(id) values (true) on conflict do nothing;
                                                                                                                              alter table public.sms_settings enable row level security;
                                                                                                                              revoke all on public.sms_settings from anon, authenticated;
                                                                                                                              grant select, update(enabled) on public.sms_settings to authenticated;
                                                                                                                              grant all on public.sms_settings to service_role;
                                                                                                                              drop policy if exists staff_read_sms_settings on public.sms_settings;
                                                                                                                              create policy staff_read_sms_settings on public.sms_settings for select to authenticated
                                                                                                                                using (exists (select 1 from public.staff_users where user_id = (select auth.uid())));
                                                                                                                              drop policy if exists admin_update_sms_settings on public.sms_settings;
                                                                                                                              create policy admin_update_sms_settings on public.sms_settings for update to authenticated
                                                                                                                                using (exists (select 1 from public.staff_users where user_id = (select auth.uid()) and role = 'admin'))
                                                                                                                                with check (exists (select 1 from public.staff_users where user_id = (select auth.uid()) and role = 'admin'));

                                                                                                                              create table if not exists public.sms_notifications (
                                                                                                                                id uuid primary key default gen_random_uuid(),
                                                                                                                                attendance_id uuid not null unique references public.attendance_logs(id) on delete restrict,
                                                                                                                                recipient_phone text,
                                                                                                                                student_name text,
                                                                                                                                event_type text not null check (event_type in ('TIME_IN', 'TIME_OUT')),
                                                                                                                                scanned_at timestamptz not null,
                                                                                                                                status text not null check (status in ('disabled','pending','processing','queued','sent','delivered','failed','uncertain','skipped','expired')),
                                                                                                                                detail text,
                                                                                                                                attempts integer not null default 0,
                                                                                                                                next_attempt_at timestamptz not null default now(),
                                                                                                                                updated_at timestamptz not null default now()
                                                                                                                              );
                                                                                                                              create index if not exists sms_notifications_pending_idx on public.sms_notifications(status, next_attempt_at);
                                                                                                                              alter table public.sms_notifications enable row level security;
                                                                                                                              revoke all on public.sms_notifications from anon, authenticated;
                                                                                                                              -- Browser clients can see outcomes, never snapshot numbers or message contents.
                                                                                                                              grant select(id,attendance_id,status,detail,updated_at) on public.sms_notifications to authenticated;
                                                                                                                              grant all on public.sms_notifications to service_role;
                                                                                                                              grant select on public.attendance_logs to service_role;
                                                                                                                              drop policy if exists staff_read_sms_outcomes on public.sms_notifications;
                                                                                                                              create policy staff_read_sms_outcomes on public.sms_notifications for select to authenticated
                                                                                                                                using (exists (select 1 from public.staff_users where user_id = (select auth.uid())));

                                                                                                                              create or replace function public.queue_guardian_sms() returns trigger
                                                                                                                              language plpgsql security definer set search_path = '' as $$
                                                                                                                              declare
                                                                                                                                v_enabled boolean;
                                                                                                                                v_student public.students%rowtype;
                                                                                                                              begin
                                                                                                                                select enabled into v_enabled from public.sms_settings where id = true;
                                                                                                                                select * into v_student from public.students where id = new.student_id;
                                                                                                                                insert into public.sms_notifications(attendance_id, recipient_phone, student_name, event_type, scanned_at, status, detail)
                                                                                                                                values (new.id,
                                                                                                                                  case when v_enabled then nullif(btrim(v_student.guardian_phone), '') end,
                                                                                                                                  case when v_enabled then v_student.first_name || ' ' || v_student.last_name end,
                                                                                                                                  new.event_type, new.scanned_at,
                                                                                                                                  case when not coalesce(v_enabled,false) then 'disabled'
                                                                                                                                    when nullif(btrim(v_student.guardian_phone), '') is null then 'skipped' else 'pending' end,
                                                                                                                                  case when not coalesce(v_enabled,false) then 'SMS was disabled for this scan.'
                                                                                                                                    when nullif(btrim(v_student.guardian_phone), '') is null then 'No guardian phone number.' end);
                                                                                                                                return new;
                                                                                                                              end;
                                                                                                                              $$;
                                                                                                                              revoke all on function public.queue_guardian_sms() from public, anon, authenticated;
                                                                                                                              drop trigger if exists attendance_queue_sms on public.attendance_logs;
                                                                                                                              create trigger attendance_queue_sms after insert on public.attendance_logs
                                                                                                                                for each row execute function public.queue_guardian_sms();

                                                                                                                              -- Only the server's secret Supabase client can claim messages. Row locks prevent
                                                                                                                              -- overlapping scan callbacks/admin processing requests from sending twice.
                                                                                                                              create or replace function public.claim_guardian_sms(p_attendance_id uuid default null)
                                                                                                                              returns setof public.sms_notifications language plpgsql security definer set search_path = '' as $$
                                                                                                                              begin
                                                                                                                                if not exists (select 1 from public.sms_settings where enabled and id = true) then return; end if;
                                                                                                                                update public.sms_notifications set status = 'expired', detail = 'Not sent within one hour.', updated_at = now()
                                                                                                                                  where status = 'pending' and scanned_at < now() - interval '1 hour';
                                                                                                                                return query
                                                                                                                                  with candidates as (
                                                                                                                                    select id from public.sms_notifications
                                                                                                                                    where status = 'pending' and attempts < 3 and next_attempt_at <= now()
                                                                                                                                      and (p_attendance_id is null or attendance_id = p_attendance_id)
                                                                                                                                    order by scanned_at limit 3 for update skip locked
                                                                                                                                  )
                                                                                                                                  update public.sms_notifications n set status = 'processing', attempts = attempts + 1, updated_at = now()
                                                                                                                                  from candidates c where n.id = c.id returning n.*;
                                                                                                                              end;
                                                                                                                              $$;
                                                                                                                              revoke all on function public.claim_guardian_sms(uuid) from public, anon, authenticated;
                                                                                                                              grant execute on function public.claim_guardian_sms(uuid) to service_role;

                                                                                                                              commit;
