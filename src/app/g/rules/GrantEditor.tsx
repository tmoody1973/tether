"use client";

import { useActionState, useState } from "react";
import { LEVELS, commitmentFloorCents, type Level } from "@/engine/ladder";
import { approvalShort, formatCents, formatDay, grantClause, listWords, matchWords } from "@/ui/grantWords";
import { signGrantAction, type SignState } from "../actions";

const FLOORS = [10, 15, 20, 25, 50];
const MATCHES = [0, 50, 100];

export interface GrantEditorProps {
  teenName: string; currentLevel: Level | null; floorPct: number; matchPct: number;
  shops: Record<Level, string[]>; expiresAt: string; paypalSaved: boolean;
}

/** Author left, live preview right (UX plan §5). The preview is the same plain code that the clause is signed from. */
export function GrantEditor(p: GrantEditorProps) {
  const [level, setLevel] = useState<Level>(p.currentLevel ?? 1);
  const [floorPct, setFloor] = useState(FLOORS.includes(p.floorPct) ? p.floorPct : 10);
  const [matchPct, setMatch] = useState(MATCHES.includes(p.matchPct) ? p.matchPct : 100);
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<SignState, FormData>(signGrantAction, {});
  const def = LEVELS[level];
  const expires = new Date(p.expiresAt);
  const changesLevel = p.currentLevel !== null && p.currentLevel !== level;
  const zoe = p.teenName;
  const clause = grantClause({ teenName: zoe, level, shops: p.shops[level], floorPct, matchPct, expiresAt: expires });

  return (
    <form action={formAction} className="g-two" onChange={() => setConfirming(false)}>
      <section className="g-card g-panel" aria-labelledby="rules-h">
        <h2 id="rules-h">The rules</h2>
        <fieldset className="g-fieldset">
          <legend className="g-def__k" style={{ marginBottom: 8 }}>Level</legend>
          <div className="g-choice">
            {([1, 2, 3] as Level[]).map((l) => (
              <label key={l}>
                <input type="radio" name="level" value={l} checked={level === l} onChange={() => setLevel(l)} />
                <span><b>Level {l}</b> · <span className="money">{formatCents(LEVELS[l].weeklyCents)}</span> a week
                  {p.currentLevel === l && <span className="g-muted"> · now</span>}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {changesLevel && (
          <div style={{ marginTop: 12 }}>
            <label className="g-def__k" htmlFor="reason">Why are you changing {zoe}&apos;s level? It goes on the record.</label>
            <textarea id="reason" name="reason" className="g-textarea" required maxLength={500} style={{ marginTop: 6 }} />
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <Def k="Weekly amount" v={<span className="money">{formatCents(def.weeklyCents)}</span>} sub="set by the level" />
          <Def k="Where" v={p.shops[level].length ? listWords(p.shops[level]) : "no shops yet"} sub="the level's shops, with your changes below" />
          <Def k="Needs your OK" v={approvalShort(level)} />
          <Def k="Investing" v={def.investing ? "she proposes, you approve each one" : "opens at Level 3"} />
          <div className="g-def">
            <label className="g-def__k" htmlFor="floorPct">{zoe} saves at least</label><span className="g-def__lead" />
            <select id="floorPct" name="floorPct" className="g-select" value={floorPct} onChange={(e) => setFloor(Number(e.target.value))}>
              {FLOORS.map((f) => <option key={f} value={f}>{formatCents(commitmentFloorCents(def.weeklyCents, f))} / week ({f}%)</option>)}
            </select>
          </div>
          <div className="g-def">
            <label className="g-def__k" htmlFor="matchPct">You match</label><span className="g-def__lead" />
            <select id="matchPct" name="matchPct" className="g-select" value={matchPct} onChange={(e) => setMatch(Number(e.target.value))}>
              {MATCHES.map((m) => <option key={m} value={m}>{m === 0 ? "no match" : matchWords(m)}</option>)}
            </select>
          </div>
          <Def k="Paid from" v={p.paypalSaved ? "your saved PayPal" : <a className="g-textlink" href="/g/connect-paypal">save your PayPal</a>} sub="sandbox: no real money" />
          <Def k="Ends" v={formatDay(expires)} sub="rules end weekly on purpose" />
        </div>
      </section>

      <section className="g-card g-panel" aria-labelledby="read-h">
        <h2 id="read-h">What {zoe} will read</h2>
        <div className="g-clause" aria-live="polite">
          <span className="g-clause__lbl">In plain words</span>
          {clause.map((s, i) => (typeof s === "string" ? s : <b key={i}>{s.b}</b>))}
        </div>
        <p className="g-note" style={{ marginTop: 10 }}>
          You&apos;ll be asked to confirm before anything changes. Nothing here is decided by a model.
        </p>
        {state.error && <p className="g-error" role="alert" style={{ marginTop: 10 }}>{state.error}</p>}
        {!confirming ? (
          <button type="button" className="g-btn g-btn--block" style={{ marginTop: 14 }} onClick={() => setConfirming(true)}>
            Sign and send
          </button>
        ) : (
          <div style={{ marginTop: 14 }} role="group" aria-label="Confirm">
            <p style={{ marginBottom: 10, fontWeight: 600 }}>Sign these rules for {zoe}? They start now and end {formatDay(expires)}.</p>
            <div className="g-btnrow">
              <button type="submit" className="g-btn" disabled={pending} autoFocus>{pending ? "Signing…" : "Yes, sign"}</button>
              <button type="button" className="g-btn g-btn--ghost" onClick={() => setConfirming(false)}>Go back</button>
            </div>
          </div>
        )}
      </section>
    </form>
  );
}

function Def({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div className="g-def">
      <span className="g-def__k">{k}</span><span className="g-def__lead" />
      <span className="g-def__v">{v}{sub && <small>{sub}</small>}</span>
    </div>
  );
}
