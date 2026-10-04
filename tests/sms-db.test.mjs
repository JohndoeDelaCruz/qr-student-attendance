import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('SMS migration preserves attendance, queues once, and enforces privileged dispatch in isolated PostgreSQL', async () => {
  const db = new PGlite();
  const admin = '00000000-0000-4000-8000-000000000001';
  const operator = '00000000-0000-4000-8000-000000000002';
  const stranger = '00000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth, storage to anon, authenticated, service_role;
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant select, insert, update, delete on storage.objects to authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `);
    for (const file of ['202610010001_initial_schema.sql', '202610010002_record_attendance.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    await db.exec(`insert into auth.users values ('${admin}'), ('${operator}'), ('${stranger}');
      insert into public.staff_users(user_id, display_name, role) values ('${admin}', 'Admin', 'admin'), ('${operator}', 'Operator', 'operator');`);
    const student = (await db.query("insert into public.students(student_number, first_name, last_name, section, guardian_phone) values ('ISOLATED-SMS-001', 'Test', 'Student', 'A', '09123456789') returning *")).rows[0];
    // A historical scan must never become an SMS backlog when the feature is installed.
    await db.query("insert into public.attendance_logs(student_id,event_type,scanned_at) values ($1,'TIME_IN',now()-interval '1 day')", [student.id]);
    const migration = await readFile(new URL('../supabase/migrations/202610020001_guardian_sms.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    assert.equal((await db.query('select count(*)::int as n from public.sms_notifications')).rows[0].n, 0);
    async function asUser(id, role = id ? 'authenticated' : 'anon') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
      await db.exec(`set role ${role}`);
    }
    async function scan(event = 'TIME_IN') { return (await db.query('select public.record_student_scan($1::uuid,$2) as result', [student.qr_token, event])).rows[0].result; }
    async function blocked(sql, params = []) { await assert.rejects(db.query(sql, params), (error) => error.code === '42501'); }
    async function ageScan() {
      await db.exec('reset role');
      await db.exec("update public.attendance_logs set scanned_at = scanned_at - interval '11 seconds' where scanned_at > now()-interval '1 hour'");
    }
    await asUser(null);
    await blocked('select status from public.sms_notifications');
    await blocked('select * from public.claim_guardian_sms(null)');
    await asUser(stranger);
    assert.equal((await db.query('select status from public.sms_notifications')).rows.length, 0);
    assert.equal((await db.query('select enabled from public.sms_settings')).rows.length, 0);
    await asUser(operator);
    assert.equal((await scan()).status, 'recorded');
    assert.equal((await scan()).status, 'duplicate');
    assert.equal((await db.query('select status from public.sms_notifications')).rows[0].status, 'disabled');
    assert.equal((await db.query('update public.sms_settings set enabled = true returning enabled')).rows.length, 0);
    await blocked('select recipient_phone from public.sms_notifications');
    await blocked("update public.sms_notifications set status = 'delivered'");
    await blocked('select * from public.claim_guardian_sms(null)');
    await asUser(admin);
    await db.exec('update public.sms_settings set enabled = true');
    await ageScan();
    await asUser(operator);
    assert.equal((await scan('TIME_OUT')).status, 'recorded');
    assert.equal((await scan('TIME_OUT')).status, 'duplicate');
    assert.equal((await db.query('select status from public.sms_notifications')).rows.length, 2);
    await asUser(null, 'service_role');
    const jobs = (await db.query('select * from public.claim_guardian_sms(null)')).rows;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].status, 'processing');
    assert.equal(jobs[0].recipient_phone, '09123456789');
    assert.equal(jobs[0].event_type, 'TIME_OUT');
    assert.equal(jobs[0].attempts, 1);
    // A second worker sees no available job, including previously disabled scans.
    assert.equal((await db.query('select * from public.claim_guardian_sms(null)')).rows.length, 0);
    await db.exec('reset role');
    await db.exec(migration);
    assert.equal((await db.query('select enabled from public.sms_settings')).rows[0].enabled, true);
    assert.equal((await db.query('select count(*)::int as n from public.sms_notifications')).rows[0].n, 2);
    await db.query('update public.students set guardian_phone = null where id = $1', [student.id]);
    await ageScan();
    await asUser(operator);
    assert.equal((await scan()).status, 'recorded');
    assert.equal((await db.query("select status from public.sms_notifications where status = 'skipped'")).rows.length, 1);
    await db.exec('reset role');
    await db.query("update public.students set guardian_phone = '09123456789' where id = $1", [student.id]);
    await ageScan();
    await asUser(operator);
    assert.equal((await scan('TIME_OUT')).status, 'recorded');
    await db.exec('reset role');
    await db.exec("update public.sms_notifications set scanned_at = now()-interval '2 hours' where status = 'pending'");
    await asUser(null, 'service_role');
    assert.equal((await db.query('select * from public.claim_guardian_sms(null)')).rows.length, 0);
    assert.equal((await db.query("select count(*)::int as n from public.sms_notifications where status = 'expired'")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int as n from public.sms_notifications where status = 'disabled'")).rows[0].n, 1);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from public.attendance_logs')).rows[0].n, 5);
    // Batch size is bounded, and disabled settings pause all unclaimed work.
    await db.query("insert into public.attendance_logs(student_id,event_type) select $1,'TIME_IN' from generate_series(1,5)", [student.id]);
    await asUser(admin);
    await db.exec('update public.sms_settings set enabled = false');
    await asUser(null, 'service_role');
    assert.equal((await db.query('select * from public.claim_guardian_sms(null)')).rows.length, 0);
    await asUser(admin);
    await db.exec('update public.sms_settings set enabled = true');
    await asUser(null, 'service_role');
    const batch = (await db.query('select * from public.claim_guardian_sms(null)')).rows;
    assert.equal(batch.length, 3);
    assert.equal(new Set(batch.map((row) => row.id)).size, 3);
    assert.equal((await db.query('select * from public.claim_guardian_sms(null)')).rows.length, 2);
    assert.equal((await db.query('select * from public.claim_guardian_sms(null)')).rows.length, 0);
  } finally { await db.close(); }
});
