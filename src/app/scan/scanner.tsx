"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { StudentPhoto } from "@/components/student-photo";
import type { EventType, ScanResult } from "@/lib/attendance/scan";
import { schoolTime } from "@/lib/attendance/dates";
import { cameraErrorMessage, createCameraScanGate, startCameraPreview } from "@/lib/attendance/camera";
import { scanStudent } from "./actions";

export function Scanner() {
  const [mode, setMode] = useState<EventType>("TIME_IN");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [camera, setCamera] = useState<"idle" | "starting" | "active">("starting");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("environment");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cameraSession = useRef<ReturnType<typeof startCameraPreview> | null>(null);
  const scanGate = useRef<ReturnType<typeof createCameraScanGate> | null>(null);
  const currentMode = useRef<EventType>("TIME_IN");
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => { if (!pending && result) input.current?.focus(); }, [pending, result]);

  function stopCamera() {
    cameraSession.current?.stop();
    setCameraEnabled(false);
    setCamera("idle");
  }

  const submit = useCallback(async (value: string) => {
    if (busy.current) return;
    scanGate.current?.accept(value, false);
    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const response = await scanStudent(value, currentMode.current);
      if (mounted.current) { setResult(response); setToken(""); }
    } catch {
      if (mounted.current) setResult({ status: "unavailable", message: "We couldn’t confirm this scan. Check the logbook and sign in again if your session expired." });
    } finally {
      busy.current = false;
      if (mounted.current) { setPending(false); input.current?.focus(); }
    }
  }, []);

  useEffect(() => {
    if (!cameraEnabled || !video.current) return;
    const gate = createCameraScanGate();
    scanGate.current = gate;
    const session = startCameraPreview({
      video: video.current,
      async loadReader() {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        return { decodeFromVideoElement: (preview, callback) => reader.decodeFromVideoElement(preview, (decoded) => callback(decoded?.getText() ?? null)) };
      },
      async acquireStream() {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          const error = new Error("Camera unavailable");
          error.name = "CameraUnavailableError";
          throw error;
        }
        return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: cameraFacing } } });
      },
      onStarting() { setCamera("starting"); setCameraError(""); },
      onReady() { setCamera("active"); },
      onCode(value) { if (gate.accept(value, busy.current) && value !== null) void submit(value); },
      onError(error) { setCamera("idle"); setCameraError(cameraErrorMessage(error)); },
    });
    cameraSession.current = session;
    return () => { session.stop(); if (cameraSession.current === session) cameraSession.current = null; };
  }, [cameraEnabled, cameraAttempt, cameraFacing, submit]);

  function startCamera() {
    setCameraError("");
    setCamera("starting");
    setCameraEnabled(true);
    setCameraAttempt((attempt) => attempt + 1);
  }

  function changeCamera(facing: "user" | "environment") {
    if (busy.current || camera === "starting" || (facing === cameraFacing && camera === "active")) return;
    cameraSession.current?.stop();
    setCameraFacing(facing);
    setCameraError("");
    setCamera("starting");
    setCameraEnabled(true);
    setCameraAttempt((attempt) => attempt + 1);
  }

  function changeMode(value: EventType) {
    currentMode.current = value;
    scanGate.current?.reset();
    setMode(value);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void submit(token); }
  const student = result?.student;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
      <section aria-labelledby="scan-controls" className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 id="scan-controls" className="text-lg font-semibold">Record a scan</h2>
        <fieldset disabled={pending} className="mt-5">
          <legend className="mb-3 text-sm font-medium text-slate-600">Scan mode</legend>
          <div className="grid grid-cols-2 gap-3">{([['TIME_IN', 'Time In'], ['TIME_OUT', 'Time Out']] as const).map(([value, label]) => <label key={value} className={`cursor-pointer rounded-xl border p-4 text-center font-semibold has-disabled:cursor-default ${mode === value ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 text-slate-500"}`}><input type="radio" name="mode" value={value} checked={mode === value} onChange={() => changeMode(value)} className="mr-2 accent-teal-700" />{label}</label>)}</div>
        </fieldset>
        <p className="mt-4 text-sm text-slate-500">The next scan will record <strong className="text-slate-800">{mode === "TIME_IN" ? "Time In" : "Time Out"}</strong>.</p>
        <div className="relative mt-6 aspect-[4/3] overflow-hidden rounded-xl bg-slate-900">
          <video ref={video} autoPlay muted playsInline aria-label="QR camera preview" className="absolute inset-0 h-full w-full object-cover" />
          {camera !== "active" && <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-slate-300"><p>{camera === "starting" ? "Opening camera… Allow camera access if your browser asks." : cameraError || "Camera is off. Click Start camera to show the live preview."}</p></div>}
          <button
            type="button"
            aria-label={`Switch to ${cameraFacing === "environment" ? "front" : "back"} camera`}
            title={`Switch to ${cameraFacing === "environment" ? "front" : "back"} camera`}
            disabled={pending || camera === "starting"}
            onClick={() => changeCamera(cameraFacing === "environment" ? "user" : "environment")}
            className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full border border-white/30 bg-slate-950/70 text-white shadow-sm transition hover:bg-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
              <path d="M14 4h-4L8 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
              <path d="M8 13a4 4 0 0 1 7-2l1 1m0-3v3h-3M16 15a4 4 0 0 1-7 2l-1-1m0 3v-3h3" />
            </svg>
          </button>
        </div>
        <div className="mt-4 flex items-center gap-3">{camera === "idle" ? <button type="button" onClick={startCamera} disabled={pending} className="secondary-button">Start camera</button> : <button type="button" onClick={stopCamera} className="secondary-button">Stop camera</button>}<span role="status" className="text-xs text-slate-500">{camera === "starting" ? "Waiting for camera…" : camera === "active" ? pending ? "Recording scan…" : "Camera is live · Ready to scan" : "Camera is off"}</span></div>
        {cameraError && <p role="alert" className="mt-3 text-sm text-amber-800">{cameraError}</p>}
        <form onSubmit={onSubmit} className="mt-7 border-t border-slate-100 pt-6">
          <label htmlFor="qr-value" className="text-sm font-medium">QR value / USB scanner</label>
          <p id="qr-help" className="mt-2 text-xs leading-5 text-slate-500">Paste the QR value, or focus this field and scan with a USB scanner that types text. Press Enter to record.</p>
          <input ref={input} id="qr-value" aria-describedby="qr-help" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} required maxLength={100} disabled={pending} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="field mt-3 font-mono text-sm" />
          <button type="submit" disabled={pending} className="primary-button mt-4">{pending ? "Recording…" : `Record ${mode === "TIME_IN" ? "Time In" : "Time Out"}`}</button>
        </form>
      </section>
      <section aria-labelledby="scan-result" className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 id="scan-result" className="text-lg font-semibold">Latest scan</h2>
        <div aria-live="polite" aria-atomic="true">
          {pending ? <p className="mt-6 text-sm text-slate-500">Checking the student and recording the scan…</p> : !result ? <p className="mt-6 text-sm leading-7 text-slate-500">The student’s photo, name, section, and enrollment status will appear here after a scan.</p> : <>
            <div className={`mt-6 rounded-xl border p-4 text-sm ${result.status === "recorded" ? "border-teal-200 bg-teal-50 text-teal-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}><p className="font-semibold">{result.status === "recorded" ? `${result.event_type === "TIME_IN" ? "Time In" : "Time Out"} recorded` : result.status === "unavailable" ? "Scan not confirmed" : "No new entry recorded"}</p><p className="mt-2 leading-6">{result.message}</p>{result.scanned_at && <p className="mt-2 font-medium">{schoolTime(result.scanned_at)} · Philippine time</p>}</div>
            {student && <div className="mt-7"><StudentPhoto large name={`${student.first_name} ${student.last_name}`} url={result.photoUrl} /><h3 className="mt-5 text-2xl font-semibold">{student.first_name} {student.last_name}</h3><p className="mt-2 text-sm text-slate-500">{student.student_number} · {student.section}</p><span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-medium ${student.status === "active" ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{student.status === "active" ? "Active" : "Inactive"}</span>{result.photoUnavailable && <p className="mt-3 text-xs text-amber-800">The student photo is temporarily unavailable.</p>}<Link href={`/students/${student.id}`} className="mt-6 block text-sm font-medium text-teal-700">View student profile →</Link></div>}
          </>}
        </div>
        <p className="mt-8 border-t border-slate-100 pt-5 text-xs leading-6 text-slate-500">The camera stays live between scans. Remove the QR from view for a moment before scanning it again. Repeat entries are also checked by the database.</p>
      </section>
    </div>
  );
}
