import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { normalizeGuardianPhone, gatewayConfig, attendanceSms, encryptSmsField, parseGatewayStatus, sendGuardianSms } from '../src/lib/sms/gateway.ts';
import { processSmsQueue, refreshSmsOutcomes, smsRefreshIds } from '../src/lib/sms/queue.ts';

// Synthetic fixtures are local only. Every HTTP call below is mocked.
const config = { username: 'test', password: 'secret', deviceId: 'test-device', passphrase: 'isolated-test-passphrase' };
const notification = { id: '00000000-0000-4000-8000-000000000001', recipient_phone: '09123456789', student_name: 'Test Student', event_type: 'TIME_IN', scanned_at: '2026-10-02T00:15:00Z', attempts: 1 };
function decrypt(value) {
  const [, format, params, saltValue, encrypted] = value.split('$');
  assert.equal(format, 'aes-256-cbc/pbkdf2-sha1');
  const salt = Buffer.from(saltValue, 'base64');
  const key = pbkdf2Sync(config.passphrase, salt, Number(params.slice(2)), 32, 'sha1');
  const decipher = createDecipheriv('aes-256-cbc', key, salt);
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString();
}
function mockClient(rows = [notification], saveError = null) {
  const writes = [];
  return {
    writes,
    async rpc(name, args) { assert.equal(name, 'claim_guardian_sms'); assert.deepEqual(args, { p_attendance_id: null }); return { data: rows, error: null }; },
    from(table) {
      assert.equal(table, 'sms_notifications');
      return { update(values) { writes.push(values); const filters = []; const chain = { eq(key, value) { filters.push([key, value]); return chain; }, then(resolve) { resolve({ error: saveError }); } }; return chain; } };
    },
  };
}

test('guardian phones normalize confirmed formats, never guess lost leading zeros', () => {
  for (const value of ['0912 345 6789', '639123456789', '+63 (912) 345-6789']) assert.equal(normalizeGuardianPhone(value), '+639123456789');
  for (const value of [null, '', 9123456789, '9123456789', '09ABC456789', '+00012345678', '09123456789;09123456780']) assert.equal(normalizeGuardianPhone(value), null);
});

test('gateway starts off and requires complete private configuration plus encryption', () => {
  assert.equal(gatewayConfig({}), null);
  const env = { SMS_ENABLED: 'true', SMSGATE_USERNAME: config.username, SMSGATE_PASSWORD: config.password, SMSGATE_DEVICE_ID: config.deviceId, SMSGATE_ENCRYPTION_PASSPHRASE: config.passphrase };
  assert.deepEqual(gatewayConfig(env), config);
  for (const key of Object.keys(env)) assert.equal(gatewayConfig({ ...env, [key]: '' }), null);
  assert.equal(gatewayConfig({ ...env, SMS_ENABLED: 'false' }), null);
});

test('message uses recorded Philippine time and explicit mode', () => {
  const text = attendanceSms(notification);
  assert.match(text, /Test Student recorded Time In/);
  assert.match(text, /08:15/);
  assert.match(text, /Philippine time/);
  assert.match(attendanceSms({ ...notification, event_type: 'TIME_OUT' }), /Time Out/);
});

test('encrypted fields round-trip in SMSGate format with independent salts', async () => {
  const first = await encryptSmsField('Test contents', config.passphrase);
  const second = await encryptSmsField('Test contents', config.passphrase);
  assert.notEqual(first, second);
  assert.equal(decrypt(first), 'Test contents');
  assert.equal(decrypt(second), 'Test contents');
});

test('gateway accepted/processed/sent remain distinct from delivery', () => {
  for (const state of ['Pending', 'Processed', 'Cancelling']) assert.equal(parseGatewayStatus({ id: notification.id, state }, notification.id).status, 'queued');
  assert.equal(parseGatewayStatus({ id: notification.id, state: 'Sent' }, notification.id).status, 'sent');
  assert.equal(parseGatewayStatus({ id: notification.id, state: 'Delivered' }, notification.id).status, 'delivered');
  assert.equal(parseGatewayStatus({ id: 'wrong-id', state: 'Delivered' }, notification.id), null);
  assert.equal(parseGatewayStatus({ id: notification.id, state: 'unknown' }, notification.id), null);
});

test('sending encrypts name/content/recipient, pins device and uses durable event ID', async () => {
  const result = await sendGuardianSms(notification, config, async (url, options) => {
    assert.equal(url, 'https://api.sms-gate.app/3rdparty/v1/messages');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.equal(body.id, notification.id);
    assert.equal(body.deviceId, config.deviceId);
    assert.equal(body.isEncrypted, true);
    assert.equal(body.withDeliveryReport, true);
    assert.equal(body.validUntil, '2026-10-02T01:15:00.000Z');
    assert.equal(decrypt(body.phoneNumbers[0]), '+639123456789');
    assert.equal(decrypt(body.textMessage.text), attendanceSms(notification));
    assert.ok(!options.body.includes('Test Student'));
    return Response.json({ id: body.id, state: 'Pending' }, { status: 202 });
  });
  assert.equal(result.status, 'queued');
});

test('invalid guardian number never makes a gateway request', async () => {
  const result = await sendGuardianSms({ ...notification, recipient_phone: '9123456789' }, config, () => assert.fail('Must not send'));
  assert.equal(result.status, 'skipped');
});

test('existing message ID is checked instead of submitting a second message', async () => {
  let posts = 0;
  const result = await sendGuardianSms(notification, config, async (url, options) => {
    if (options.method === 'POST') { posts++; return new Response('', { status: 409 }); }
    assert.ok(url.endsWith(notification.id));
    return Response.json({ id: notification.id, state: 'Sent' });
  });
  assert.equal(posts, 1);
  assert.equal(result.status, 'sent');
});

test('timeout/5xx/malformed response stay unconfirmed and never become delivery', async () => {
  for (const fetcher of [async () => { throw new Error('timeout secret body'); }, async () => new Response('private error', { status: 503 }), async () => Response.json({ id: 'wrong-id', state: 'Delivered' })]) {
    const result = await sendGuardianSms(notification, config, fetcher);
    assert.equal(result.status, 'uncertain');
    assert.ok(!result.detail.includes('private error'));
    assert.ok(!result.detail.includes('secret body'));
  }
});

test('connection diagnostics distinguish known causes without leaking raw errors or resending', async () => {
  for (const [error, expected] of [
    [Object.assign(new Error('private credentials'), { name: 'TimeoutError' }), /timed out/],
    [new Error('private credentials', { cause: { code: 'ENOTFOUND' } }), /resolve the gateway address/],
    [new Error('private credentials', { cause: { code: 'ECONNRESET' } }), /refused or interrupted/],
    [new Error('private credentials', { cause: { code: 'CERT_HAS_EXPIRED' } }), /TLS certificate/],
  ]) {
    let calls = 0;
    const result = await sendGuardianSms(notification, config, async () => { calls++; throw error; });
    assert.equal(result.status, 'uncertain');
    assert.match(result.detail, expected);
    assert.ok(!result.detail.includes('private credentials'));
    assert.equal(calls, 1);
  }
});

test('an unreadable successful response stays unconfirmed rather than reporting a connection failure', async () => {
  let calls = 0;
  const result = await sendGuardianSms(notification, config, async () => { calls++; return new Response('', { status: 202 }); });
  assert.equal(result.status, 'uncertain');
  assert.match(result.detail, /successful HTTP response/);
  assert.doesNotMatch(result.detail, /connection failed/);
  assert.equal(calls, 1);
});

test('preparation failure is confirmed unsent and never contacts the gateway', async () => {
  const result = await sendGuardianSms({ ...notification, scanned_at: 'invalid' }, config, async () => assert.fail('Must not send'));
  assert.equal(result.status, 'failed');
  assert.match(result.detail, /No gateway request was made/);
});

test('rejection fails cleanly; rate limits have bounded retry attempts', async () => {
  const rejected = await sendGuardianSms(notification, config, async () => new Response('', { status: 401 }));
  assert.equal(rejected.status, 'failed');
  const limited = async () => new Response('', { status: 429 });
  assert.equal((await sendGuardianSms(notification, config, limited)).status, 'pending');
  assert.equal((await sendGuardianSms({ ...notification, attempts: 3 }, config, limited)).status, 'failed');
});

test('queue invokes only claimed jobs and saves submission outcomes', async () => {
  const client = mockClient();
  assert.equal(await processSmsQueue(client, async (row) => { assert.equal(row.id, notification.id); return { status: 'queued', detail: 'Accepted' }; }), 1);
  assert.equal(client.writes[0].status, 'queued');
  assert.equal(await processSmsQueue(mockClient([]), () => assert.fail('No claimed jobs')), 0);
});

test('queue isolates failed submissions and reports failed persistence without resending', async () => {
  const client = mockClient();
  await processSmsQueue(client, () => { throw new Error('crash'); });
  assert.equal(client.writes[0].status, 'uncertain');
  await assert.rejects(processSmsQueue(mockClient([notification], { code: 'offline' }), async () => ({ status: 'sent', detail: 'Sent' })), /could not be saved/);
});

test('outcome refresh does not regress sent status or overwrite concurrent delivery', async () => {
  const writes = [];
  const client = { from() { return {
    select() { const chain = { in() { return chain; }, lt() { return chain; }, order() { return chain; }, async limit() { return { data: [{ id: notification.id, status: 'sent', updated_at: '2026-10-02T00:00:00Z' }], error: null }; } }; return chain; },
    update(values) { const conditions = []; writes.push({ values, conditions }); const chain = { eq(key, value) { conditions.push([key, value]); return chain; }, then(resolve) { resolve({ error: null }); } }; return chain; },
  }; } };
  assert.equal(await refreshSmsOutcomes(client, async () => ({ status: 'queued', detail: 'Older snapshot' })), 1);
  assert.equal(writes[0].values.status, undefined);
  assert.deepEqual(writes[0].conditions.slice(1), [['status', 'sent'], ['updated_at', '2026-10-02T00:00:00Z']]);
});

test('abandoned submission is flagged for review while a live submission is left alone', async () => {
  const writes = [];
  let lookups = 0;
  const old = { id: notification.id, status: 'processing', updated_at: new Date(Date.now() - 120_000).toISOString() };
  const recent = { ...old, id: 'recent-job', updated_at: new Date(Date.now() - 40_000).toISOString() };
  const client = { from() { return {
    select() { const chain = { in() { return chain; }, lt() { return chain; }, order() { return chain; }, async limit() { return { data: [recent, old], error: null }; } }; return chain; },
    update(values) { writes.push(values); const chain = { eq() { return chain; }, then(resolve) { resolve({ error: null }); } }; return chain; },
  }; } };
  assert.equal(await refreshSmsOutcomes(client, async () => { lookups++; return null; }), 1);
  assert.equal(lookups, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].status, 'uncertain');
});

test('automatic refresh accepts only a bounded list of attendance references', () => {
  assert.deepEqual(smsRefreshIds([notification.id, notification.id]), [notification.id]);
  assert.deepEqual(smsRefreshIds([]), []);
  for (const value of [null, 'all', [null], ['invalid'], Array(21).fill(notification.id)]) assert.equal(smsRefreshIds(value), null);
});

test('visible attendance status refresh persists delivery without claiming or sending messages', async () => {
  const filters = [];
  const writes = [];
  const row = { id: notification.id, status: 'queued', updated_at: '2026-10-02T00:00:00Z' };
  const client = {
    rpc() { assert.fail('Status checks must not claim messages'); },
    from(table) {
      assert.equal(table, 'sms_notifications');
      return {
        select(fields) {
          assert.equal(fields, 'id,status,updated_at');
          const chain = {
            in(key, values) { filters.push([key, values]); return chain; },
            lt(key, value) { assert.equal(key, 'updated_at'); assert.ok(Date.parse(value) <= Date.now() - 29000); return chain; },
            order(key) { assert.equal(key, 'updated_at'); return chain; },
            async limit(value) { assert.equal(value, 3); return { data: [row], error: null }; },
          };
          return chain;
        },
        update(values) {
          const conditions = [];
          writes.push({ values, conditions });
          const chain = { eq(key, value) { conditions.push([key, value]); return chain; }, then(resolve) { resolve({ error: null }); } };
          return chain;
        },
      };
    },
  };
  const attendanceId = '00000000-0000-4000-8000-000000000002';
  let lookups = 0;
  assert.equal(await refreshSmsOutcomes(client, async (id) => {
    assert.equal(id, row.id);
    lookups++;
    return { status: 'delivered', detail: 'Gateway reports delivery to the recipient device.' };
  }, [attendanceId]), 1);
  assert.equal(lookups, 1);
  assert.deepEqual(filters[1], ['attendance_id', [attendanceId]]);
  assert.ok(!filters[0][1].includes('delivered'));
  assert.ok(!filters[0][1].includes('failed'));
  assert.equal(writes[0].values.status, 'delivered');
  assert.deepEqual(writes[0].conditions, [['id', row.id], ['status', 'queued'], ['updated_at', row.updated_at]]);
});

test('an empty visible page does not touch the database or gateway', async () => {
  assert.equal(await refreshSmsOutcomes({ from() { assert.fail('No rows to refresh'); } }, async () => assert.fail('Must not check'), []), 0);
});
