import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('attendance migrations enforce permissions and scan sequence in isolated PostgreSQL', async () => {
  const db = new PGlite();
  const admin = '00000000-0000-4000-8000-000000000001';
  const operator = '00000000-0000-4000-8000-000000000002';
  const stranger = '00000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth, storage to anon, authenticated;
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant select, insert, update, delete on storage.objects to authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `);
    for (const file of ['202610010001_initial_schema.sql', '202610010002_record_attendance.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    await db.exec(`insert into auth.users values ('${admin}'), ('${operator}'), ('${stranger}');
      insert into public.staff_users(user_id, display_name, role) values ('${admin}', 'Admin', 'admin'), ('${operator}', 'Operator', 'operator');`);
    const student = (await db.query("insert into public.students(student_number, first_name, last_name, section) values ('TEST-001', 'Test', 'Student', 'A') returning *")).rows[0];
    async function asUser(id) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
      await db.exec(id ? 'set role authenticated' : 'set role anon');
    }
    async function scan(event, qr = student.qr_token) {
      return (await db.query('select public.record_student_scan($1::uuid, $2::text) as result', [qr, event])).rows[0].result;
    }
    async function blocked(sql, params = []) { await assert.rejects(db.query(sql, params), (error) => error.code === '42501'); }
    async function ageLastScan() {
      await db.exec('reset role');
      await db.query("update public.attendance_logs set scanned_at = clock_timestamp() - interval '11 seconds' where id = (select id from public.attendance_logs order by scanned_at desc limit 1)");
      await asUser(operator);
    }
    await asUser(null);
    await blocked('select * from public.students');
    await blocked('select public.record_student_scan($1::uuid, $2)', [student.qr_token, 'TIME_IN']);
    await asUser(stranger);
    const denied = await scan('TIME_IN');
    assert.equal(denied.status, 'denied');
    assert.equal(denied.student, undefined);
    assert.equal((await db.query('select * from public.attendance_logs')).rows.length, 0);
    await asUser(operator);
    await blocked("insert into public.attendance_logs(student_id, event_type) values ($1, 'TIME_IN')", [student.id]);
    await blocked('update public.attendance_logs set scanned_at = now()');
    await blocked('delete from public.attendance_logs');
    assert.equal((await scan('INVALID')).status, 'invalid');
    assert.equal((await scan('TIME_IN', null)).status, 'invalid');
    assert.equal((await scan('TIME_IN', 'ffffffff-ffff-4fff-8fff-ffffffffffff')).status, 'unknown');
    assert.equal((await scan('TIME_OUT')).status, 'needs_time_in');
    const recorded = await scan('TIME_IN');
    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.student.id, student.id);
    assert.equal(recorded.student.guardian_phone, undefined);
    assert.equal(recorded.student.qr_token, undefined);
    const firstLog = (await db.query('select * from public.attendance_logs')).rows[0];
    assert.equal(firstLog.scanned_by, operator);
    assert.ok(Math.abs(Date.parse(firstLog.scanned_at) - Date.now()) < 5000);
    assert.equal((await scan('TIME_IN')).status, 'duplicate');
    assert.equal((await scan('TIME_OUT')).status, 'duplicate');
    await ageLastScan();
    assert.equal((await scan('TIME_IN')).status, 'duplicate');
    assert.equal((await scan('TIME_OUT')).status, 'recorded');
    await ageLastScan();
    assert.equal((await scan('TIME_OUT')).status, 'duplicate');
    assert.equal((await scan('TIME_IN')).status, 'recorded');
    assert.equal((await db.query('select * from public.attendance_logs')).rows.length, 3);
    await db.exec('reset role');
    await db.query("update public.students set status = 'inactive' where id = $1", [student.id]);
    await asUser(operator);
    assert.equal((await scan('TIME_IN')).status, 'inactive');
    assert.equal((await db.query('select * from public.attendance_logs')).rows.length, 3);
    await db.exec('reset role');
    await db.query("update public.students set status = 'active' where id = $1", [student.id]);
    await db.exec("update public.attendance_logs set scanned_at = scanned_at - interval '1 day'");
    await asUser(operator);
    assert.equal((await scan('TIME_OUT')).status, 'needs_time_in');
    assert.equal((await scan('TIME_IN')).status, 'recorded');
    await asUser(admin);
    const ownScan = await scan('TIME_IN');
    assert.equal(ownScan.status, 'duplicate');
    // Applying the incremental migration again is safe and retains records.
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../supabase/migrations/202610010002_record_attendance.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query('select count(*)::int as total from public.attendance_logs')).rows[0].total, 4);
  } finally { await db.close(); }
});
