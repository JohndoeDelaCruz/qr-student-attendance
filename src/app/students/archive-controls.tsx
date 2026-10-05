"use client";

import { useActionState, useState } from "react";
import { archiveStudentAction } from "./actions";

export function ArchiveControls({ studentId, archived, name }: { studentId: string; archived: boolean; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(archiveStudentAction.bind(null, studentId, !archived), { error: "" });

  return <div className="w-full sm:w-auto">
    {!archived && !confirming ? <button type="button" className="secondary-button" onClick={() => setConfirming(true)}>Archive student</button> : (
      <form action={action} className="max-w-sm">
        <input type="hidden" name="archive_action" value={archived ? "restore" : "archive"} />
        {!archived && <p className="mb-3 text-sm leading-6 text-slate-600">Archive {name}? Their profile, photo, and attendance history will be kept. New scans will be disabled. You can restore them later.</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className="secondary-button">{pending ? (archived ? "Restoring…" : "Archiving…") : archived ? "Restore student" : "Confirm archive"}</button>
          {!archived && <button type="button" disabled={pending} className="secondary-button" onClick={() => setConfirming(false)}>Cancel</button>}
        </div>
        {state.error && <p role="alert" className="mt-3 text-sm text-red-800">{state.error}</p>}
        {pending && <p role="status" className="sr-only">Saving student status.</p>}
      </form>
    )}
  </div>;
}
