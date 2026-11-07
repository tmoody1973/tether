"use client";

import { useState } from "react";
import { SANDBOX_LOGIN } from "@/ui/sandboxAccount";
import "./start.css";

/** The shared sandbox test login under the Log in with PayPal button, each value with Copy (mockup 02a). */
export function SandboxLogin() {
  const [copied, setCopied] = useState<"email" | "password" | null>(null);
  const copy = async (key: "email" | "password") => {
    try {
      await navigator.clipboard.writeText(SANDBOX_LOGIN[key]);
      setCopied(key);
    } catch {
      setCopied(null); // clipboard blocked: the value is on screen to select by hand
    }
  };
  return (
    <div className="sb-login" role="group" aria-label="Sandbox PayPal login">
      <div className="sb-login__h">Sandbox PayPal login (fake money)</div>
      {(["email", "password"] as const).map((key) => (
        <div key={key} className="sb-login__row">
          <span className="sb-login__k">{key === "email" ? "Email" : "Password"}</span>
          <code className="sb-login__v">{SANDBOX_LOGIN[key]}</code>
          <button type="button" className="sb-login__copy" onClick={() => copy(key)} aria-label={`Copy the sandbox ${key}`}>
            {copied === key ? "Copied" : "Copy"}
          </button>
        </div>
      ))}
      <p className="sb-login__note" aria-live="polite">A PayPal sandbox test account, not a real one. Nothing real is charged.</p>
    </div>
  );
}
