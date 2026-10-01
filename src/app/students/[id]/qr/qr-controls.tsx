"use client";

import { useState } from "react";

export function QrControls({ image, token, studentNumber }: { image: string; token: string; studentNumber: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(token); setCopied(true); setError(false); }
    catch { setError(true); }
  }
  return <div className="no-print"><div className="flex flex-wrap justify-center gap-3"><button type="button" onClick={() => window.print()} className="primary-button">Print QR card</button><a href={image} download={`student-qr-${studentNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`} className="secondary-button">Download QR</a><button type="button" onClick={() => void copy()} className="secondary-button">{copied ? "QR value copied" : "Copy QR value"}</button></div>{error && <p role="alert" className="mt-3 text-center text-sm text-amber-800">Copy this value manually: <code className="break-all">{token}</code></p>}</div>;
}
