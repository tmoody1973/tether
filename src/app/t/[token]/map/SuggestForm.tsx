"use client";

import { useActionState } from "react";
import { PendingButton } from "@/ui/PendingButton";
import { suggestAction, type SuggestState } from "./actions";

export function SuggestForm({ token, guardian }: { token: string; guardian: string }) {
  const [state, action] = useActionState<SuggestState, FormData>(suggestAction, {});
  return (
    <form action={action} className="t-form t-card" aria-labelledby="suggest-h">
      <h2 className="t-label" id="suggest-h" style={{ fontSize: 16 }}>Suggest a shop</h2>
      <p className="t-small">{guardian} says yes or no. If she says yes, it goes into your rules.</p>
      <input type="hidden" name="token" value={token} />
      <label className="t-label" htmlFor="shop-domain">The shop&apos;s web address</label>
      <input id="shop-domain" name="domain" className="t-input" placeholder="etsy.com" autoCapitalize="none" autoComplete="off" maxLength={200} required />
      <label className="t-label" htmlFor="shop-why">Why this shop?</label>
      <textarea id="shop-why" name="why" className="t-input t-textarea" maxLength={200} required />
      {state.error && <p className="t-flash t-flash--warn" role="alert">{state.error}</p>}
      <PendingButton label={`Suggest to ${guardian}`} pendingLabel="Sending…" className="t-btn t-btn--primary" />
    </form>
  );
}
