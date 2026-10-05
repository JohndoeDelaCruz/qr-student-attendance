import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScanInput, recordScan } from '../src/lib/attendance/scan.ts';
import { schoolDate, schoolDayBounds } from '../src/lib/attendance/dates.ts';
import { studentQrImage } from '../src/lib/students/qr.ts';
import pngjs from 'pngjs';
import zxing from '@zxing/library';

const token = '11111111-1111-4111-8111-111111111111';

test('scan inputs accept only UUID references and explicit modes', () => {
  assert.deepEqual(parseScanInput(` ${token.toUpperCase()} `, 'TIME_IN'), { token, event: 'TIME_IN' });
  for (const value of ['', null, 42, 'https://example.com/student', `${token},something`, { token }]) assert.equal(parseScanInput(value, 'TIME_IN'), null);
  for (const event of ['', 'in', null, 'DELETE']) assert.equal(parseScanInput(token, event), null);
});

test('Philippine date bounds honor local midnight, leap days, and exclusive end', () => {
  assert.equal(schoolDate(new Date('2026-09-30T16:00:00Z')), '2026-10-01');
  assert.equal(schoolDate(new Date('2026-09-30T15:59:59Z')), '2026-09-30');
  assert.deepEqual(schoolDayBounds('2026-10-01'), { date: '2026-10-01', start: '2026-09-30T16:00:00.000Z', end: '2026-10-01T16:00:00.000Z' });
  assert.ok(schoolDayBounds('2028-02-29'));
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-1', '1999-12-31', null]) assert.equal(schoolDayBounds(value), null);
});

test('generated PNG decodes to the reference alone', async () => {
  const uri = await studentQrImage(token);
  assert.ok(uri.startsWith('data:image/png;base64,'));
  const png = pngjs.PNG.sync.read(Buffer.from(uri.split(',')[1], 'base64'));
  const pixels = new Int32Array(png.width * png.height);
  for (let index = 0; index < pixels.length; index++) pixels[index] = (png.data[index * 4] << 16) | (png.data[index * 4 + 1] << 8) | png.data[index * 4 + 2];
  const source = new zxing.RGBLuminanceSource(pixels, png.width, png.height);
  const result = new zxing.QRCodeReader().decode(new zxing.BinaryBitmap(new zxing.HybridBinarizer(source)));
  assert.equal(result.getText(), token);
  await assert.rejects(studentQrImage('student name / private data'), /Invalid/);
});

test('invalid input never calls the database', async () => {
  const result = await recordScan({ rpc() { assert.fail('RPC must not run'); } }, 'invalid', 'TIME_IN');
  assert.equal(result.status, 'invalid');
});

test('archived scan responses remain visible as rejected scans with the current student photo', async () => {
  const result = await recordScan({
    async rpc() { return { data: { status: 'archived', message: 'Restore the student before recording new scans.', student: { archived_at: '2026-10-05T00:00:00Z', photo_path: 'students/fixture.png' } } }; },
    storage: { from() { return { async createSignedUrl() { return { data: { signedUrl: 'https://example.test/photo' } }; } }; } },
  }, token, 'TIME_IN');
  assert.equal(result.status, 'archived');
  assert.equal(result.photoUrl, 'https://example.test/photo');
  assert.ok(result.student.archived_at);
  assert.equal(result.scanned_at, undefined);
});

test('scan RPC receives only reference and mode; a photo failure preserves a successful record', async () => {
  let called = false;
  const result = await recordScan({
    async rpc(name, params) {
      called = true;
      assert.equal(name, 'record_student_scan');
      assert.deepEqual(params, { p_qr_token: token, p_event_type: 'TIME_OUT' });
      return { data: { status: 'recorded', message: 'Scan recorded.', event_type: 'TIME_OUT', scanned_at: '2026-10-01T02:00:00Z', student: { photo_path: 'students/test.png' } }, error: null };
    },
    storage: { from(bucket) { assert.equal(bucket, 'student-photos'); return { async createSignedUrl(path, ttl) { assert.equal(path, 'students/test.png'); assert.equal(ttl, 300); throw new Error('storage offline'); } }; } },
  }, token, 'TIME_OUT');
  assert.ok(called);
  assert.equal(result.status, 'recorded');
  assert.equal(result.photoUnavailable, true);
});

test('missing RPC prompts migration; network and malformed responses remain unconfirmed', async () => {
  const result = await recordScan({ async rpc() { return { error: { code: 'PGRST202' }, data: null }; } }, token, 'TIME_IN');
  assert.match(result.message, /migration/);
  for (const client of [{ async rpc() { throw new Error('network'); } }, { async rpc() { return { data: { status: 'anything' }, error: null }; } }]) {
    assert.equal((await recordScan(client, token, 'TIME_IN')).status, 'unavailable');
  }
});
