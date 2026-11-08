"use client";

import { useEffect, useRef, useState } from "react";
import { listWords } from "@/ui/grantWords";

const MAX_TEENS = 5; // TEENS_PER_FORM on the server, which checks again
// Review LOW-6: what she typed, kept in this tab only, so a server-side problem (the page comes back with ?e=) doesn't
// make her type every teen again. Names and ages only; cleared when the page loads without a problem.
const KEPT = "tether-teen-rows";
type Row = { key: number; name: string; age: string };

/**
 * "Now, your teen": one or more rows of first name and age (decision 028: up to 5 at once), and the parent checkbox once.
 * A plain form post to the create route, which checks everything again; the browser checks first so a slip doesn't
 * cost a round trip. The checkbox names the teens as typed.
 */
export function StartForm({ add = false }: { add?: boolean }) {
  const next = useRef(1);
  const [rows, setRows] = useState<Row[]>([{ key: 0, name: "", age: "" }]);
  useEffect(() => {
    // Once, after hydration: what she typed before the page was interactive (a slow connection), or, when the page came
    // back with a problem (?e=), what she sent (review LOW-6). Either way the boxes and the words around them agree.
    const fromPage = { name: (document.getElementById("teenName-0") as HTMLInputElement | null)?.value ?? "",
      age: (document.getElementById("age-0") as HTMLInputElement | null)?.value ?? "" };
    let restored: Row[] = [{ key: 0, ...fromPage }];
    if (new URLSearchParams(location.search).has("e")) {
      try {
        const kept = JSON.parse(sessionStorage.getItem(KEPT) ?? "null") as { name: string; age: string }[] | null;
        if (Array.isArray(kept) && kept.length > 0) {
          restored = kept.slice(0, MAX_TEENS).map((r, key) => ({ key, name: String(r.name ?? ""), age: String(r.age ?? "") }));
        }
      } catch { /* nothing kept */ }
    } else {
      sessionStorage.removeItem(KEPT);
    }
    next.current = restored.length;
    setRows(restored); // eslint-disable-line react-hooks/set-state-in-effect -- read once from the page and this tab's storage after hydration
  }, []);
  const typed = rows.map((r) => r.name.trim()).filter(Boolean);
  const setField = (key: number, f: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...f } : r)));
  const addRow = () => {
    const key = next.current++;
    setRows((rs) => [...rs, { key, name: "", age: "" }]);
    requestAnimationFrame(() => document.getElementById(`teenName-${key}`)?.focus());
  };
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const dupes = new Set(typed.map((n) => n.toLowerCase())).size !== typed.length;
  return (
    <form method="post" action="/g/start/teen/create" className="s-form"
      onSubmit={() => sessionStorage.setItem(KEPT, JSON.stringify(rows.map(({ name, age }) => ({ name, age }))))}>
      {rows.map((r, i) => {
        const name = r.name.trim();
        return (
          <fieldset key={r.key} className="s-teenrow">
            {rows.length > 1 && <legend className="g-sr">Teen {i + 1}</legend>}
            <label className="g-label" htmlFor={`teenName-${r.key}`}>{i === 0 ? "Your teen's first name" : `Teen ${i + 1}'s first name`}</label>
            <input id={`teenName-${r.key}`} name="teenName" className="g-input" required maxLength={30} autoComplete="off"
              pattern="\p{L}[\p{L}\p{M}' \-]*" title="Letters only, please"
              value={r.name} onChange={(e) => setField(r.key, { name: e.target.value })} />
            <label className="g-label" htmlFor={`age-${r.key}`}>{name ? `${name}'s age` : i === 0 ? "Your teen's age" : `Teen ${i + 1}'s age`}</label>
            <input id={`age-${r.key}`} name="age" className="g-input" type="number" inputMode="numeric" min={13} max={17} step={1} required style={{ maxWidth: 120 }}
              value={r.age} onChange={(e) => setField(r.key, { age: e.target.value })} />
            {i > 0 && (
              <button type="button" className="g-btn g-btn--ghost g-btn--small s-remove" onClick={() => removeRow(r.key)}>
                Remove {name || `teen ${i + 1}`}
              </button>
            )}
          </fieldset>
        );
      })}
      <p className="g-note">13 to 17. Tether is built for teens.</p>
      {rows.length < MAX_TEENS && (
        <button type="button" className="g-btn g-btn--ghost g-btn--small s-addrow" onClick={addRow}>+ Add another teen</button>
      )}
      {dupes && <p className="g-flash g-flash--warn" role="status">Two teens have the same name. Give each teen a different name.</p>}
      <label className="s-check">
        <input type="checkbox" name="guardian" required />
        <span>I&apos;m {typed.length ? `${listWords(typed)}'s` : rows.length > 1 ? "these teens'" : "this teen's"} parent or guardian</span>
      </label>
      <button type="submit" className="g-btn g-btn--block" disabled={dupes}>{add ? "Add to our family" : "Create our family"}</button>
    </form>
  );
}
