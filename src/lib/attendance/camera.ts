type CameraControls = { stop(): void };
type CameraReader = { decodeFromVideoElement(video: HTMLVideoElement, callback: (value: string | null) => void): Promise<CameraControls> };

// Own the stream separately from the decoder so stopping a pending startup also
// releases a camera granted after the component has already left the page.
export function startCameraPreview(options: {
  video: HTMLVideoElement;
  loadReader(): Promise<CameraReader>;
  acquireStream(): Promise<MediaStream>;
  onStarting(): void;
  onReady(): void;
  onCode(value: string | null): void;
  onError(error: unknown): void;
}) {
  let stopped = false;
  let stream: MediaStream | null = null;
  let controls: CameraControls | null = null;
  function release() {
    controls?.stop();
    controls = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      if (options.video.srcObject === stream) options.video.srcObject = null;
      stream = null;
    }
  }
  const ready = Promise.resolve().then(async () => {
    try {
      if (stopped) return;
      options.onStarting();
      const reader = await options.loadReader();
      if (stopped) return;
      stream = await options.acquireStream();
      if (stopped) { release(); return; }
      options.video.srcObject = stream;
      await options.video.play();
      if (stopped) { release(); return; }
      const decoder = await reader.decodeFromVideoElement(options.video, (value) => {
        if (!stopped) options.onCode(value);
      });
      if (stopped) decoder.stop();
      else { controls = decoder; options.onReady(); }
    } catch (error) {
      release();
      if (!stopped) { stopped = true; options.onError(error); }
    }
  });
  return { ready, stop() { stopped = true; release(); } };
}

export function createCameraScanGate(clearAfterMs = 1000) {
  let lastValue: string | null = null;
  let lastSeenAt = 0;
  return {
    accept(value: string | null, busy: boolean, now = Date.now()) {
      if (value === null) {
        if (now - lastSeenAt >= clearAfterMs) lastValue = null;
        return false;
      }
      const normalized = value.trim().toLowerCase();
      if (normalized === lastValue) { lastSeenAt = now; return false; }
      if (busy) return false;
      lastValue = normalized;
      lastSeenAt = now;
      return true;
    },
    reset() { lastValue = null; lastSeenAt = 0; },
  };
}

export function cameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access was blocked. Allow camera access for this site in your browser settings, then click Start camera.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No usable camera was found. Connect a camera or use the QR value field.";
  if (name === "NotReadableError") return "Your camera is busy or unavailable. Close other apps using it, then click Start camera.";
  if (name === "CameraUnavailableError") return "Camera preview requires localhost or HTTPS and a browser with camera support.";
  return "We couldn’t start the camera preview. Check camera permissions and click Start camera to try again.";
}
