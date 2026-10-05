import test from 'node:test';
import assert from 'node:assert/strict';
import { setStudentArchived } from '../src/lib/students/management.ts';

const admin = { role: 'admin' };
const id = '00000000-0000-4000-8000-000000000010';

test('archive requests reject operators and invalid inputs before contacting the database', async () => {
  const client = { rpc() { assert.fail('No database request allowed'); } };
  for (const [staff, studentId, archived] of [[{ role: 'operator' }, id, true], [admin, 'invalid', true], [admin, id, 'true'], [admin, id, null]]) {
    assert.equal((await setStudentArchived(client, staff, studentId, archived)).success, false);
  }
});

test('archive and restore use only the authorized RPC with the selected ID and explicit action', async () => {
  for (const archived of [true, false]) {
    const client = { async rpc(name, args) {
      assert.equal(name, 'set_student_archived');
      assert.deepEqual(args, { p_student_id: id, p_archived: archived });
      return { data: { status: archived ? 'archived' : 'restored' }, error: null };
    } };
    assert.deepEqual(await setStudentArchived(client, admin, id, archived), { success: true });
  }
});

test('archive failures explain missing migration, permissions, missing records, and unconfirmed changes', async () => {
  for (const [response, message] of [
    [{ error: { code: 'PGRST202' } }, /migration/],
    [{ data: { status: 'denied' } }, /administrators/],
    [{ data: { status: 'unknown' } }, /not be found/],
    [{ error: { code: '42501' } }, /Reload/],
    [{ data: { status: 'restored' } }, /Reload/],
    [{ data: { status: 'anything' } }, /Reload/],
    [{ data: null }, /Reload/],
  ]) {
    const result = await setStudentArchived({ async rpc() { return response; } }, admin, id, true);
    assert.equal(result.success, false);
    assert.match(result.state.error, message);
  }
  const timeout = await setStudentArchived({ async rpc() { throw new Error('Connection interrupted'); } }, admin, id, true);
  assert.equal(timeout.success, false);
  assert.match(timeout.state.error, /Reload/);
});
