import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraErrorMessage, createCameraScanGate, startCameraPreview } from '../src/lib/attendance/camera.ts';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function cameraFixture(overrides = {}) {
  const calls = { tracksStopped: 0, decoderStopped: 0, starting: 0, active: 0, codes: [], errors: [] };
  const stream = { getTracks: () => [{ stop() { calls.tracksStopped++; } }] };
  const video = { srcObject: null, async play() {} };
  let frame;
  const controls = { stop() { calls.decoderStopped++; } };
  const options = {
    video,
    async loadReader() { return { async decodeFromVideoElement(preview, callback) { assert.equal(preview, video); frame = callback; return controls; } }; },
    async acquireStream() { return stream; },
    onStarting() { calls.starting++; },
    onReady() { calls.active++; },
    onCode(value) { calls.codes.push(value); },
    onError(error) { calls.errors.push(error); },
    ...overrides,
  };
  return { calls, stream, video, controls, options, frame: (value) => frame(value) };
}

test('preview starts without a click, stays live after a decode, and releases on stop', async () => {
  const fixture = cameraFixture();
  const session = startCameraPreview(fixture.options);
  await session.ready;
  assert.equal(fixture.calls.starting, 1);
  assert.equal(fixture.calls.active, 1);
  assert.equal(fixture.video.srcObject, fixture.stream);
  fixture.frame('qr-reference');
  assert.deepEqual(fixture.calls.codes, ['qr-reference']);
  assert.equal(fixture.calls.tracksStopped, 0);
  assert.equal(fixture.video.srcObject, fixture.stream);
  session.stop();
  fixture.frame('late-frame');
  assert.deepEqual(fixture.calls.codes, ['qr-reference']);
  assert.equal(fixture.calls.tracksStopped, 1);
  assert.equal(fixture.calls.decoderStopped, 1);
  assert.equal(fixture.video.srcObject, null);
  session.stop();
  assert.equal(fixture.calls.tracksStopped, 1);
});

test('Strict Mode cleanup before startup avoids acquiring a camera', async () => {
  const fixture = cameraFixture({ async acquireStream() { assert.fail('Camera must not be acquired'); } });
  const session = startCameraPreview(fixture.options);
  session.stop();
  await session.ready;
  assert.equal(fixture.calls.starting, 0);
  assert.equal(fixture.calls.active, 0);
});

test('camera granted after cancellation is immediately released', async () => {
  const acquire = deferred();
  const requested = deferred();
  const fixture = cameraFixture({ acquireStream() { requested.resolve(); return acquire.promise; } });
  const session = startCameraPreview(fixture.options);
  await requested.promise;
  session.stop();
  acquire.resolve(fixture.stream);
  await session.ready;
  assert.equal(fixture.calls.tracksStopped, 1);
  assert.equal(fixture.calls.active, 0);
  assert.equal(fixture.video.srcObject, null);
});

test('a decoder finishing after stop cannot clear a newer preview', async () => {
  const decoder = deferred();
  const decoding = deferred();
  const fixture = cameraFixture({ async loadReader() { return { decodeFromVideoElement() { decoding.resolve(); return decoder.promise; } }; } });
  const session = startCameraPreview(fixture.options);
  await decoding.promise;
  session.stop();
  const newerStream = {};
  fixture.video.srcObject = newerStream;
  decoder.resolve(fixture.controls);
  await session.ready;
  assert.equal(fixture.calls.decoderStopped, 1);
  assert.equal(fixture.calls.active, 0);
  assert.equal(fixture.video.srcObject, newerStream);
});

test('permission denial and playback failure report errors and release resources', async () => {
  const denied = new Error('denied'); denied.name = 'NotAllowedError';
  const noAccess = cameraFixture({ async acquireStream() { throw denied; } });
  await startCameraPreview(noAccess.options).ready;
  assert.deepEqual(noAccess.calls.errors, [denied]);
  assert.match(cameraErrorMessage(denied), /Allow camera access/);
  const broken = cameraFixture();
  broken.video.play = async () => { throw new Error('playback failed'); };
  await startCameraPreview(broken.options).ready;
  assert.equal(broken.calls.tracksStopped, 1);
  assert.equal(broken.calls.errors.length, 1);
  assert.equal(broken.video.srcObject, null);
});

test('continuous frames are suppressed until the QR leaves view, with no time-based repeat', () => {
  const gate = createCameraScanGate();
  assert.equal(gate.accept('QR-A', false, 100), true);
  assert.equal(gate.accept('qr-a', false, 12000), false);
  assert.equal(gate.accept(null, false, 12500), false);
  assert.equal(gate.accept('qr-a', false, 12600), false);
  gate.accept(null, false, 14000);
  assert.equal(gate.accept('qr-a', false, 14100), true);
  assert.equal(gate.accept('qr-b', false, 14200), true);
  gate.reset();
  assert.equal(gate.accept('qr-b', false, 14300), true);
});

test('a new QR observed during recording is accepted after recording finishes', () => {
  const gate = createCameraScanGate();
  assert.equal(gate.accept('qr-a', false, 100), true);
  assert.equal(gate.accept('qr-b', true, 200), false);
  assert.equal(gate.accept('qr-b', false, 300), true);
  assert.equal(gate.accept('qr-b', false, 400), false);
});
