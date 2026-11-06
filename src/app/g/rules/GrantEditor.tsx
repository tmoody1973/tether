"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { LEVELS, commitmentFloorCents, type Level } from "@/engine/ladder";
import { approvalShort, formatCents, formatDay, grantClause, matchWords } from "@/ui/grantWords";
import { setLevelAction, signGrantAction, type LevelState, type SignState } from "../actions";

const FLOORS = [10, 15, 20, 25, 50];
const MATCHES = [0, 50, 100];
const SIGN_FORM = "g-sign";

export interface GrantEditorProps {
  teenName: string; currentLevel: Level | null; floorPct: number; matchPct: number;
  /** Rules active and not yet ended: changes apply to them. Otherwise every control feeds one "Sign and send". */
  inForce: boolean; inForceUntil: string | null;
  shops: Record<Level, string[]>; expiresAt: string; paypalSaved: boolean;
  /** Server-rendered sections placed in the layout: Shops (left, after the level), Stop + Zoe's link (right). */
  shopsSlot: ReactNode; sideSlot: ReactNode;
}

type Confirm = "sign" | "level" | "saving" | null;

/** Zoe's rules, in Amara's order (mockup `rules` view). The clause is the same plain code her rules are signed from. */
export function GrantEditor(p: GrantEditorProps) {
  const [level, setLevelState] = useState<Level>(p.currentLevel ?? 1);
  const [floorPct, setFloorState] = useState(FLOORS.includes(p.floorPct) ? p.floorPct : 10);
  const [matchPct, setMatchState] = useState(MATCHES.includes(p.matchPct) ? p.matchPct : 100);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [signState, signAction, signing] = useActionState<SignState, FormData>(signGrantAction, {});
  const [levelState, levelAction, moving] = useActionState<LevelState, FormData>(setLevelAction, {});
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setConfirm(null); };
  const setLevel = edit(setLevelState), setFloor = edit(setFloorState), setMatch = edit(setMatchState);

  const zoe = p.teenName;
  const cur = p.currentLevel;
  const levelChanged = cur !== null && level !== cur;
  const savingChanged = floorPct !== p.floorPct || matchPct !== p.matchPct;
  const expires = new Date(p.expiresAt);
  // The level whose money the saving amounts are counted from: in force, the saving form re-signs at her current level.
  const savingLevel: Level = p.inForce && cur ? cur : level;
  const unchanged = p.inForce && !levelChanged && !savingChanged;
  const clause = grantClause({
    teenName: zoe, level, shops: p.shops[level], floorPct, matchPct,
    expiresAt: unchanged && p.inForceUntil ? new Date(p.inForceUntil) : expires,
  });
  const signForm = p.inForce ? undefined : SIGN_FORM; // with no rules in force, every control belongs to the one sign form
  const def = LEVELS[level];

  const levelPicker = (
    <fieldset className="g-fieldset">
      <legend className="g-sr">Level</legend>
      <div className="g-choice">
        {([1, 2, 3] as Level[]).map((l) => (
          <label key={l}>
            <input type="radio" name="level" value={l} form={signForm} checked={level === l} onChange={() => setLevel(l)} />
            <span><b>Level {l}</b> · <span className="money">{formatCents(LEVELS[l].weeklyCents)}</span> a week
              {LEVELS[l].investing && ", adds investing"}{cur === l && <span className="g-muted"> · now</span>}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  const savingRows = (
    <>
      <div className="g-def">
        <label className="g-def__k" htmlFor="floorPct">{zoe} saves at least</label><span className="g-def__lead" />
        <select id="floorPct" name="floorPct" form={signForm} className="g-select" value={floorPct} onChange={(e) => setFloor(Number(e.target.value))}>
          {FLOORS.map((f) => <option key={f} value={f}>{formatCents(commitmentFloorCents(LEVELS[savingLevel].weeklyCents, f))} a week ({f}%)</option>)}
        </select>
      </div>
      <div className="g-def">
        <label className="g-def__k" htmlFor="matchPct">You match</label><span className="g-def__lead" />
        <select id="matchPct" name="matchPct" form={signForm} className="g-select" value={matchPct} onChange={(e) => setMatch(Number(e.target.value))}>
          {MATCHES.map((m) => <option key={m} value={m}>{m === 0 ? "no match" : matchWords(m)}</option>)}
        </select>
      </div>
    </>
  );

  return (
    <div className="g-two">
      {!p.inForce && <form id={SIGN_FORM} action={signAction} hidden />}
      <div className="g-stack">
        <section className="g-card g-section" aria-labelledby="level-h">
          <div className="g-section__head">
            <h2 id="level-h">Weekly money and level</h2>
            {cur && <span className="g-chip g-chip--accent">Level {cur}</span>}
          </div>
          <p className="g-muted">
            Each level sets her weekly money and opens more shops. She moves up when she keeps her savings promise four
            weeks running, or you can move her yourself.
          </p>
          {p.inForce && cur ? (
            <form action={levelAction} noValidate style={{ display: "grid", gap: 10 }}>
              {levelPicker}
              {levelChanged && (
                <>
                  <label className="g-def__k" htmlFor="override-reason">Why? It goes on the record.</label>
                  <textarea id="override-reason" name="reason" className="g-textarea" maxLength={500} aria-required="true"
                    aria-invalid={levelState.error ? true : undefined} aria-describedby={levelState.error ? "override-error" : undefined} />
                  {confirm !== "level" ? (
                    <button type="button" className="g-btn g-btn--small" onClick={() => setConfirm("level")}>Move {zoe} to Level {level}</button>
                  ) : (
                    <div role="group" aria-label="Confirm level change" className="g-confirm">
                      <p style={{ marginBottom: 10, fontWeight: 600 }}>
                        Move {zoe} to Level {level}? Her weekly money becomes {formatCents(def.weeklyCents)} and her shops follow the
                        new level, keeping the shops you added or removed. It applies now.
                      </p>
                      <div className="g-btnrow">
                        <button type="submit" className="g-btn" disabled={moving} autoFocus>{moving ? "Changing…" : "Yes, move her"}</button>
                        <button type="button" className="g-btn g-btn--ghost" onClick={() => setConfirm(null)}>Go back</button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {levelState.error && <p id="override-error" className="g-error" role="alert">{levelState.error}</p>}
            </form>
          ) : (
            <>
              {levelPicker}
              {levelChanged && (
                <div>
                  <label className="g-def__k" htmlFor="reason">Why are you changing {zoe}&apos;s level? It goes on the record.</label>
                  <textarea id="reason" name="reason" form={SIGN_FORM} className="g-textarea" required maxLength={500} style={{ marginTop: 6 }} />
                </div>
              )}
            </>
          )}
        </section>

        {p.shopsSlot}

        <section className="g-card g-section" aria-labelledby="saving-h">
          <div className="g-section__head"><h2 id="saving-h">Saving</h2></div>
          {p.inForce && cur ? (
            <form action={signAction}>
              <input type="hidden" name="level" value={cur} />
              {savingRows}
              {savingChanged && (confirm !== "saving" ? (
                <button type="button" className="g-btn g-btn--small" style={{ marginTop: 10 }} onClick={() => setConfirm("saving")}>Apply saving change</button>
              ) : (
                <div role="group" aria-label="Confirm saving change" className="g-confirm" style={{ marginTop: 10 }}>
                  <p style={{ marginBottom: 10, fontWeight: 600 }}>
                    This re-signs her rules for a new week: they start now and end {formatDay(expires)}.
                  </p>
                  <div className="g-btnrow">
                    <button type="submit" className="g-btn" disabled={signing} autoFocus>{signing ? "Signing…" : "Yes, re-sign"}</button>
                    <button type="button" className="g-btn g-btn--ghost" onClick={() => setConfirm(null)}>Go back</button>
                  </div>
                </div>
              ))}
              {signState.error && <p className="g-error" role="alert" style={{ marginTop: 10 }}>{signState.error}</p>}
            </form>
          ) : savingRows}
        </section>

        <section className="g-card g-section" aria-labelledby="bylevel-h">
          <div className="g-section__head"><h2 id="bylevel-h">Set by the level</h2></div>
          <div>
            <Def k="Asks you first" v={approvalShort(level)} />
            <Def k="Investing" v={def.investing ? <Link className="g-textlink" href="/g/invest">open: she proposes, you approve</Link> : "opens at Level 3"}
              sub={def.investing ? "her funds and your list" : "funds she proposes, you approve"} />
            <Def k="Paid from" v={p.paypalSaved ? "your saved PayPal" : <a className="g-textlink" href="/g/connect-paypal">save your PayPal</a>} sub="sandbox: no real money" />
          </div>
        </section>
      </div>

      <div className="g-stack">
        <section className="g-card" aria-labelledby="read-h">
          <h2 className="g-label" id="read-h" style={{ display: "block", marginBottom: 8 }}>{unchanged ? `What ${zoe} reads` : `What ${zoe} will read`}</h2>
          <div className="g-clause" aria-live="polite">
            <span className="g-clause__lbl">In plain words</span>
            {clause.map((s, i) => (typeof s === "string" ? s : <b key={i}>{s.b}</b>))}
          </div>
          {!p.inForce && (
            <>
              <p className="g-note" style={{ marginTop: 10 }}>You&apos;ll be asked to confirm before anything changes. Nothing here is decided by a model.</p>
              {signState.error && <p className="g-error" role="alert" style={{ marginTop: 10 }}>{signState.error}</p>}
              {confirm !== "sign" ? (
                <button type="button" className="g-btn g-btn--block" style={{ marginTop: 14 }} onClick={() => setConfirm("sign")}>Sign and send</button>
              ) : (
                <div style={{ marginTop: 14 }} role="group" aria-label="Confirm">
                  <p style={{ marginBottom: 10, fontWeight: 600 }}>Sign these rules for {zoe}? They start now and end {formatDay(expires)}.</p>
                  <div className="g-btnrow">
                    <button type="submit" form={SIGN_FORM} className="g-btn" disabled={signing} autoFocus>{signing ? "Signing…" : "Yes, sign"}</button>
                    <button type="button" className="g-btn g-btn--ghost" onClick={() => setConfirm(null)}>Go back</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
        {p.sideSlot}
      </div>
    </div>
  );
}

function Def({ k, v, sub }: { k: string; v: ReactNode; sub?: string }) {
  return (
    <div className="g-def">
      <span className="g-def__k">{k}</span><span className="g-def__lead" />
      <span className="g-def__v">{v}{sub && <small>{sub}</small>}</span>
    </div>
  );
}
