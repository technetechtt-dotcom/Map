"use client";

import { useState } from "react";

export default function ConfirmAction({
  label,
  confirmLabel = "Confirm",
  tone = "danger",
  requireReason = false,
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  tone?: "danger" | "warning" | "primary";
  requireReason?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className={tone === "danger" ? "chip" : "chip chip-active"} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-soft">
            <h2 className="text-lg font-bold">Confirm {label.toLowerCase()}</h2>
            <p className="mt-1 text-sm text-muted">This is a high-risk action. Confirm only if you intend to proceed.</p>
            {requireReason && (
              <textarea className="field mt-3 min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" required />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn"
                disabled={busy || (requireReason && reason.trim().length < 3)}
                onClick={async () => {
                  setBusy(true);
                  await onConfirm(reason);
                  setBusy(false);
                  setOpen(false);
                  setReason("");
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
