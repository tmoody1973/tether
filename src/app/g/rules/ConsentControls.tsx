"use client";

// Decision 030: how Zoe spends, investing on/off, and the cost estimates. With rules in force each applies at once
// after a one-sentence before/after confirm; with none in force the fields belong to the one "Sign and send" form.
import { useActionState, useState } from "react";
import { LEVELS, askOverCents, type Level } from "@/engine/ladder";
import { DEFAULT_SHIPPING_CENTS } from "@/engine/pricing";
import type { CostTerms, SpendingMode } from "@/engine/types";
import { FamilyField } from "@/ui/FamilyField";
import {
  ESTIMATES_NOTE, approvalShort, costsChangeWords, formatCents, investingChangeWords, spendingChangeWords, taxPctWords,
} from "@/ui/grantWords";
import { parseCents, parseTaxBps } from "./consentForm";
import { costsAction, investingAction, spendingAction, type ControlState } from "./consentActions";

export interface ConsentProps {
  teenName: string; level: Level; inForce: boolean; signForm: string;
  spending?: SpendingMode; investing: boolean; costs?: CostTerms; demo: boolean;
}

const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

export function ConsentControls(p: ConsentProps) {
  return (
    <>
      <SpendingSection {...p} />
      {LEVELS[p.level].investing && <InvestingSection {...p} />}
      <CostsSection {...p} />
    </>
  );
}

function Result({ s }: { s: ControlState }) {
  if (s.error) return <p className="g-error" role="alert" style={{ marginTop: 8 }}>{s.error}</p>;
  return s.done ? <p className="g-flash" role="status" style={{ marginTop: 8 }}>{s.done}</p> : null;
}

/** The before/after sentence and the two buttons, inside the section's own form. */
function Confirm({ text, label, pending, onBack }: { text: string; label: string; pending: boolean; onBack: () => void }) {
  return (
    <div role="group" aria-label="Confirm" className="g-confirm" style={{ marginTop: 10 }}>
      <p style={{ marginBottom: 10, fontWeight: 600 }}>{text}</p>
      <div className="g-btnrow">
        <button type="submit" className="g-btn" disabled={pending} autoFocus>{pending ? "Saving…" : label}</button>
        <button type="button" className="g-btn g-btn--ghost" onClick={onBack}>Go back</button>
      </div>
    </div>
  );
}

function SpendingSection(p: ConsentProps) {
  const [state, action, pending] = useActionState<ControlState, FormData>(spendingAction, {});
  const signedMode = p.spending?.mode ?? "upTo";
  const signedOver = askOverCents(p.level, p.spending);
  const [mode, setMode] = useState<"every" | "upTo">(signedMode);
  const [upTo, setUpTo] = useState(dollars(signedMode === "every" ? LEVELS[p.level].approvalOverCents : signedOver));
  const [confirm, setConfirm] = useState(false);
  const [touched, setTouched] = useState(false);
  const cents = upTo.trim() === "" ? null : parseCents(upTo);
  const draft: SpendingMode | null = mode === "every" ? { mode } : cents === null && upTo.trim() !== "" ? null : { mode, upToCents: cents };
  const changed = draft !== null && approvalShort(p.level, draft) !== approvalShort(p.level, p.spending);
  // Not in force: sent with "Sign and send" only once she changes it, so a new level otherwise starts from its own rule.
  const form = p.inForce || !touched ? undefined : p.signForm;
  const edit = (f: () => void) => { f(); setConfirm(false); setTouched(true); };
  const fields = (
    <fieldset className="g-fieldset">
      <legend className="g-sr">How {p.teenName} spends</legend>
      <div className="g-choice">
        <label>
          <input type="radio" name="spendingMode" value="every" form={form} checked={mode === "every"} onChange={() => edit(() => setMode("every"))} />
          <span><b>Ask me before every purchase</b></span>
        </label>
        <label>
          <input type="radio" name="spendingMode" value="upTo" form={form} checked={mode === "upTo"} onChange={() => edit(() => setMode("upTo"))} />
          <span><b>Up to</b> <input aria-label="Dollars per purchase without asking" name="upTo" form={form} className="g-input g-input--money"
            inputMode="decimal" value={upTo} placeholder="no limit" disabled={mode !== "upTo"}
            onChange={(e) => edit(() => setUpTo(e.target.value))} /> per purchase at approved shops without asking</span>
        </label>
      </div>
      <p className="g-note" style={{ marginTop: 6 }}>
        Level {p.level} on its own: {approvalShort(p.level)}. Blank means no per-purchase limit; at most {formatCents(LEVELS[p.level].weeklyCents)}.
        Over your amount, it asks you; it isn&apos;t refused.
      </p>
    </fieldset>
  );
  return (
    <section className="g-card g-section" aria-labelledby="spend-h">
      <div className="g-section__head"><h2 id="spend-h">How {p.teenName} spends</h2></div>
      {p.inForce ? (
        <form action={action}>
          <FamilyField />
          {fields}
          {draft === null && <p className="g-error" role="alert">Write the amount in dollars and cents, like 15.00.</p>}
          {changed && (confirm
            ? <Confirm text={spendingChangeWords(p.teenName, p.level, p.spending, draft!)} label="Yes, change it" pending={pending} onBack={() => setConfirm(false)} />
            : <button type="button" className="g-btn g-btn--small" style={{ marginTop: 10 }} onClick={() => setConfirm(true)}>Apply</button>)}
          <Result s={state} />
        </form>
      ) : fields}
    </section>
  );
}

function InvestingSection(p: ConsentProps) {
  const [state, action, pending] = useActionState<ControlState, FormData>(investingAction, {});
  const [on, setOn] = useState(p.investing);
  const [confirm, setConfirm] = useState(false);
  const form = p.inForce || on === p.investing ? undefined : p.signForm; // not in force: sent only when changed
  const fields = (
    <fieldset className="g-fieldset">
      <legend className="g-sr">Investing</legend>
      <div className="g-choice">
        {(["on", "off"] as const).map((v) => (
          <label key={v}>
            <input type="radio" name="investing" value={v} form={form} checked={on === (v === "on")} onChange={() => { setOn(v === "on"); setConfirm(false); }} />
            <span><b>{v === "on" ? "On" : "Off"}</b>{v === "on" ? ": she proposes, you approve each one" : ": no new proposals; what she has stays hers"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <section className="g-card g-section" aria-labelledby="inv-switch-h">
      <div className="g-section__head"><h2 id="inv-switch-h">Investing</h2></div>
      {p.inForce ? (
        <form action={action}>
          <FamilyField />
          {fields}
          {on !== p.investing && (confirm
            ? <Confirm text={investingChangeWords(p.teenName, on)} label={on ? "Yes, turn it on" : "Yes, turn it off"} pending={pending} onBack={() => setConfirm(false)} />
            : <button type="button" className="g-btn g-btn--small" style={{ marginTop: 10 }} onClick={() => setConfirm(true)}>Apply</button>)}
          <Result s={state} />
        </form>
      ) : fields}
    </section>
  );
}

function CostsSection(p: ConsentProps) {
  const [state, action, pending] = useActionState<ControlState, FormData>(costsAction, {});
  const [tax, setTax] = useState(p.costs ? (p.costs.salesTaxBps / 100).toFixed(2) : "");
  const [ship, setShip] = useState(dollars(p.costs?.shippingCents ?? DEFAULT_SHIPPING_CENTS));
  const [confirm, setConfirm] = useState(false);
  const bps = parseTaxBps(tax), shipCents = ship.trim() === "" ? DEFAULT_SHIPPING_CENTS : parseCents(ship);
  const draft: CostTerms | null = bps !== null && shipCents !== null ? { salesTaxBps: bps, shippingCents: shipCents } : null;
  const changed = draft !== null && (draft.salesTaxBps !== p.costs?.salesTaxBps || draft.shippingCents !== p.costs?.shippingCents);
  const form = p.inForce ? undefined : p.signForm;
  const edit = (f: () => void) => { f(); setConfirm(false); };
  const fields = (
    <>
      <div className="g-def">
        <label className="g-def__k" htmlFor="salesTax">Sales tax where you live{p.demo && <span className="g-chip" style={{ marginLeft: 6 }}>Demo value</span>}</label>
        <span className="g-def__lead" />
        <span><input id="salesTax" name="salesTax" form={form} className="g-input g-input--money" inputMode="decimal" required
          value={tax} placeholder="8.25" onChange={(e) => edit(() => setTax(e.target.value))} /> %</span>
      </div>
      <div className="g-def">
        <label className="g-def__k" htmlFor="shipping">Shipping estimate per order</label><span className="g-def__lead" />
        <span>$ <input id="shipping" name="shipping" form={form} className="g-input g-input--money" inputMode="decimal"
          value={ship} onChange={(e) => edit(() => setShip(e.target.value))} /></span>
      </div>
      <p className="g-note" style={{ marginTop: 6 }}>{ESTIMATES_NOTE}</p>
    </>
  );
  return (
    <section className="g-card g-section" aria-labelledby="costs-h">
      <div className="g-section__head">
        <h2 id="costs-h">Estimated costs</h2>
        {p.costs && <span className="g-chip">{taxPctWords(p.costs.salesTaxBps)} tax · {formatCents(p.costs.shippingCents)} shipping</span>}
      </div>
      {p.inForce ? (
        <form action={action}>
          <FamilyField />
          {fields}
          {changed && (confirm
            ? <Confirm text={costsChangeWords(p.costs, draft!)} label="Yes, use these" pending={pending} onBack={() => setConfirm(false)} />
            : <button type="button" className="g-btn g-btn--small" style={{ marginTop: 10 }} onClick={() => setConfirm(true)}>Apply</button>)}
          <Result s={state} />
        </form>
      ) : fields}
    </section>
  );
}
