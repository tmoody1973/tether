"use client";

import { useState } from "react";

/**
 * "Now, your teen": first name, age and the parent checkbox. A plain form post to the create route, which checks
 * everything again; the browser checks first so a slip doesn't cost a round trip. The checkbox names the teen as typed.
 */
export function StartForm() {
  const [name, setName] = useState("");
  const typed = name.trim();
  return (
    <form method="post" action="/g/start/teen/create" className="s-form">
      <label className="g-label" htmlFor="teenName">Your teen&apos;s first name</label>
      <input id="teenName" name="teenName" className="g-input" required maxLength={30} autoComplete="off"
        pattern="\p{L}[\p{L}\p{M}' \-]*" title="Letters only, please"
        value={name} onChange={(e) => setName(e.target.value)} />
      <label className="g-label" htmlFor="age">{typed ? `${typed}'s age` : "Your teen's age"}</label>
      <input id="age" name="age" className="g-input" type="number" inputMode="numeric" min={13} max={17} step={1} required style={{ maxWidth: 120 }} />
      <p className="g-note">13 to 17. Tether is built for teens.</p>
      <label className="s-check">
        <input type="checkbox" name="guardian" required />
        <span>I&apos;m {typed ? `${typed}'s` : "this teen's"} parent or guardian</span>
      </label>
      <button type="submit" className="g-btn g-btn--block">Create our family</button>
    </form>
  );
}
