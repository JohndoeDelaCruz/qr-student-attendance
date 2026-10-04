"use client";

import { useActionState } from "react";
import { manageSms } from "./sms-actions";

export function SmsControls({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  const [state, action, pending] = useActionState(manageSms, { message: "" });
  return <form action={action} className="mt-4">
    <div className="flex flex-wrap gap-3">
      <button name="sms_action" value={enabled ? "disable" : "enable"} disabled={pending || (!enabled && !configured)} className="secondary-button">{enabled ? "Disable guardian SMS" : "Enable guardian SMS"}</button>
      <button name="sms_action" value="process" disabled={pending || !configured} className="secondary-button">{pending ? "Working…" : "Process pending / refresh SMS"}</button>
    </div>
    <p role="status" className="mt-3 text-xs leading-6 text-slate-600">{state.message || "Enabling SMS applies to future scans. Processing handles up to 3 pending messages and checks up to 3 statuses per click."}</p>
  </form>;
}
