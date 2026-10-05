import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// All records below exist only in this in-memory database. No hosted client or SMS gateway is used.
test('archive migration preserves student data and history, enforces admin access, and blocks attendance/SMS until restored', async () => {
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
    for (const file of ['202610010001_initial_schema.sql', '202610010002_record_attendance.sql', '202610020001_guardian_sms.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    await db.exec(`insert into auth.users values ('${admin}'), ('${operator}'), ('${stranger}');
      insert into public.staff_users(user_id, display_name, role) values ('${admin}', 'Admin', 'admin'), ('${operator}', 'Operator', 'operator');
      update public.sms_settings set enabled = true;`);
    const original = (await db.query("insert into public.students(student_number, first_name, last_name, section, guardian_phone, photo_path) values ('ISOLATED-ARCHIVE-001', 'Fixture', 'Student', 'A', '09123456789', 'students/fixture.png') returning *")).rows[0];
    const inactive = (await db.query("insert into public.students(student_number, first_name, last_name, section, status) values ('ISOLATED-ARCHIVE-002', 'Fixture', 'Inactive', 'B', 'inactive') returning *")).rows[0];
    await db.query("insert into public.attendance_logs(student_id, event_type, scanned_at, scanned_by) values ($1, 'TIME_IN', now()-interval '1 day', $2)", [original.id, admin]);
    await db.query("insert into storage.objects(bucket_id, name) values ('student-photos', $1)", [original.photo_path]);
    const history = (await db.query('select * from public.attendance_logs')).rows;
    const notifications = (await db.query('select * from public.sms_notifications')).rows;
    const photos = (await db.query('select * from storage.objects')).rows;
    const migration = await readFile(new URL('../supabase/migrations/202610050001_student_archive.sql', import.meta.url), 'utf8');
    await db.exec(migration);

    async function asUser(id, role = id ? 'authenticated' : 'anon') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
      await db.exec(`set role ${role}`);
    }
    async function archive(archived, id = original.id) {
      return (await db.query('select public.set_student_archived($1::uuid,$2::boolean) as result', [id, archived])).rows[0].result;
    }
    async function scan(token = original.qr_token, event = 'TIME_IN') {
      return (await db.query('select public.record_student_scan($1::uuid,$2) as result', [token, event])).rows[0].result;
    }
    async function blocked(sql, params = []) { await assert.rejects(db.query(sql, params), error => error.code === '42501'); }
    async function preserved() {
      await db.exec('reset role');
      const { archived_at, ...fields } = (await db.query('select * from public.students where id = $1', [original.id])).rows[0];
      assert.deepEqual(fields, original);
      assert.deepEqual((await db.query('select * from public.attendance_logs')).rows, history);
      assert.deepEqual((await db.query('select * from public.sms_notifications')).rows, notifications);
      assert.deepEqual((await db.query('select * from storage.objects')).rows, photos);
      return archived_at;
    }

    assert.equal(await preserved(), null);
    await asUser(null);
    await blocked('select public.set_student_archived($1,true)', [original.id]);
    for (const user of [stranger, operator]) {
      await asUser(user);
      assert.equal((await archive(true)).status, 'denied');
      assert.equal((await archive(false)).status, 'denied');
      await blocked('update public.students set archived_at = now() where id = $1', [original.id]);
    }
    await asUser(admin);
    await blocked('update public.students set archived_at = now() where id = $1', [original.id]);
    await blocked("insert into public.students(student_number,first_name,last_name,section,archived_at) values ('FORGED','X','Y','Z',now())");
    assert.equal((await archive(true, null)).status, 'invalid');
    assert.equal((await archive(null)).status, 'invalid');
    assert.equal((await archive(true, '00000000-0000-4000-8000-000000000099')).status, 'unknown');
    assert.equal((await archive(true)).status, 'archived');
    const archivedAt = await preserved();
    assert.ok(archivedAt);
    await asUser(admin);
    assert.equal((await archive(true)).status, 'archived');
    assert.deepEqual(await preserved(), archivedAt);
    // Rerunning the migration must preserve existing archives and notifications.
    await db.exec(migration);
    assert.deepEqual(await preserved(), archivedAt);
    await asUser(operator);
    assert.equal((await db.query('select id from public.students where archived_at is null')).rows.length, 1);
    assert.deepEqual((await db.query('select id from public.students where archived_at is not null')).rows, [{ id: original.id }]);
    assert.equal((await db.query('select id from public.students')).rows.length, 2);
    assert.equal((await db.query('select id from public.attendance_logs where student_id = $1', [original.id])).rows.length, 1);
    for (const event of ['TIME_IN', 'TIME_OUT']) {
      const result = await scan(original.qr_token, event);
      assert.equal(result.status, 'archived');
      assert.equal(result.student.photo_path, original.photo_path);
      assert.ok(result.student.archived_at);
    }
    await blocked("insert into public.attendance_logs(student_id, event_type) values ($1, 'TIME_IN')", [original.id]);
    assert.deepEqual(await preserved(), archivedAt);
    await asUser(admin);
    assert.equal((await archive(false)).status, 'restored');
    assert.equal((await archive(false)).status, 'restored');
    assert.equal(await preserved(), null);
    await asUser(operator);
    assert.equal((await scan()).status, 'recorded');
    assert.equal((await scan()).status, 'duplicate');
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from public.attendance_logs')).rows[0].n, 2);
    assert.equal((await db.query('select count(*)::int as n from public.sms_notifications')).rows[0].n, notifications.length + 1);
    await asUser(admin);
    assert.equal((await archive(true, inactive.id)).status, 'archived');
    await asUser(operator);
    assert.equal((await scan(inactive.qr_token)).status, 'archived');
    await asUser(admin);
    assert.equal((await archive(false, inactive.id)).status, 'restored');
    assert.equal((await db.query('select status from public.students where id = $1', [inactive.id])).rows[0].status, 'inactive');
    await asUser(operator);
    assert.equal((await scan(inactive.qr_token)).status, 'inactive');
  } finally { await db.close(); }
});
