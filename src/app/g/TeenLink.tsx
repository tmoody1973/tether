"use client";

import { useState } from "react";

/** "Send Zoe her link": shows the link as text to copy into a message. Opening it is how Zoe signs in. */
export function TeenLink({ url, teenName, startOpen = false }: { url: string; teenName: string; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the text box is still there to select by hand
    }
  };
  if (!open) {
    return <button type="button" className="g-btn g-btn--block" onClick={() => setOpen(true)}>Send {teenName} her link</button>;
  }
  return (
    <div>
      <label className="g-label" htmlFor="teen-link">{teenName}&apos;s link</label>
      <div className="g-linkbox">
        <input id="teen-link" className="g-input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="g-btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="g-note" style={{ marginTop: 8 }} aria-live="polite">
        Paste it into a message to {teenName}. Opening it is how {teenName} gets in — no app, no password.
      </p>
    </div>
  );
}
