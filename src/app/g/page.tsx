import { Suspense } from "react";
import Link from "next/link";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { guardianHome, type NeedsYou } from "@/flows/home";
import { teenMessage } from "@/flows/approvals";
import { APPROVE_CODES, approvedPurchase, type ApproveCode } from "@/flows/approve";
import { approveWords } from "@/ui/approveWords";
import { formatCents, formatDay } from "@/ui/grantWords";
import { Bar, GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { PendingButton } from "@/ui/PendingButton";
import { advanceClockAction } from "./actions";
import { appBaseUrl } from "./connect-paypal/setup";
import { ResetLink } from "./ResetLink";
import { TeenLink } from "./TeenLink";

export default function GuardianHomePage({ searchParams }: PageProps<"/g">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Home searchParams={searchParams} />
    </Suspense>
  );
}

type Search = Record<string, string | string[] | undefined>;

type Flash = { text: string; warn?: boolean; connectPaypal?: boolean };

function flash(sp: Search, names: { teen: string; guardian: string }, paid: Parameters<typeof approveWords>[2]): Flash | null {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const signed = one("signed");
  if (signed && /^\d+$/.test(signed)) return { text: `Signed. Rules v${signed} are in force now.` };
  const paypal = one("paypal");
  if (paypal === "connected") return { text: "Your PayPal is saved. Tether charges it only for purchases that pass the rules." };
  if (paypal === "failed") return { text: "PayPal didn't finish saving, so nothing was saved. Try again.", warn: true };
  if (paypal === "cancelled") return { text: "You left PayPal before saving. Nothing changed.", warn: true };
  if (one("link") === "reset") return { text: "The old link has stopped working. Send the new one." };
  const adv = one("advanced");
  const moved: Record<string, string> = { day: "1 day", week: "1 week", endOfWeek: "to the end of the week", endOfMonth: "to the end of the month" };
  if (adv && moved[adv]) return { text: `Demo clock moved forward ${moved[adv]}.` };
  const decided = one("decided");
  if (decided === "declined") return { text: `Done. ${names.teen} will see “${teenMessage(names.guardian)}”` };
  if (decided && (APPROVE_CODES as readonly string[]).includes(decided)) return approveWords(decided as ApproveCode, names.teen, paid);
  return null;
}

async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const h = await guardianHome(db, familyId, await clockNow(db, familyId));
  const sp = await searchParams;
  const paid = sp.decided === "paid" && typeof sp.req === "string" ? await approvedPurchase(db, familyId, sp.req) : null;
  const note = flash(sp, { teen: h.teenName, guardian: h.guardianName }, paid);
  const zoe = h.teenName;

  return (
    <GuardianShell active="home" teenName={zoe} side={
      <>
        <div className="g-side__head">This week</div>
        <div className="g-side__note">
          Spent <b><Money cents={h.spentThisWeekCents} /></b> of <Money cents={h.weeklyCents} /><br />
          {h.level ? `Level ${h.level}` : "No rules in force"}
        </div>
      </>
    }>
      <div className="g-head">
        <h1 className="g-title">{zoe}</h1>
        {h.level && <span className="g-chip g-chip--accent">Level {h.level}</span>}
      </div>
      {note && (
        <p className={note.warn ? "g-flash g-flash--warn" : "g-flash"} role="status">
          {note.text}{note.connectPaypal && <> <a className="g-textlink" href="/g/connect-paypal">Save your PayPal</a></>}
        </p>
      )}

      <div className="g-two">
        <div className="g-stack">
          <section className="g-card" aria-labelledby="week-h">
            <h2 className="g-label" id="week-h">This week</h2>
            <div className="g-card__figure"><Money cents={h.spentThisWeekCents} /> of <Money cents={h.weeklyCents} /></div>
            <Bar value={h.spentThisWeekCents} max={h.weeklyCents}
              label={`${formatCents(h.spentThisWeekCents)} spent of ${formatCents(h.weeklyCents)}`} />
            {h.expiresAt && (
              <div className="g-muted">{h.grantEnded ? "Her rules ended" : "Her rules end"} {formatDay(h.expiresAt)}</div>
            )}
          </section>

          <section className="g-card" aria-labelledby="saved-h">
            <h2 className="g-label" id="saved-h">{h.goal ? h.goal.title : "Saved so far"}</h2>
            <div className="g-card__figure">
              <Money cents={h.savingsCents} />{h.goal && <> of <Money cents={h.goal.targetCents} /></>}
            </div>
            {h.goal && <Bar goal value={h.savingsCents} max={h.goal.targetCents}
              label={`${formatCents(h.savingsCents)} saved of ${formatCents(h.goal.targetCents)}`} />}
            <div className="g-card__sub">What {zoe} didn&apos;t spend. It stays in your PayPal — your promise, kept track of here.</div>
          </section>

          {h.needsYou.length === 0 ? (
            <div className="g-quiet" role="status">
              <div className="g-quiet__big">Nothing needs you today.</div>
              <p>You&apos;ll hear from Tether when something needs a decision — not every time {zoe} buys something.</p>
            </div>
          ) : (
            <section className="g-card" aria-labelledby="needs-h">
              <h2 className="g-label" id="needs-h">Needs you</h2>
              <ul className="g-needs">
                {h.needsYou.map((n) => <NeedsYouRow key={n.kind === "approval" ? n.id : n.kind} item={n} zoe={zoe} hadRules={h.grantVersion !== null} />)}
              </ul>
            </section>
          )}
        </div>

        <div className="g-stack">
          <section className="g-card" aria-labelledby="link-h">
            <h2 className="g-label" id="link-h">{zoe}&apos;s way in</h2>
            <TeenLink url={`${appBaseUrl()}/t/${h.teenToken}`} teenName={zoe} />
            <ResetLink teenName={zoe} />
          </section>

          <section className="g-card g-demo" aria-labelledby="demo-h">
            <h2 className="g-label" id="demo-h">Demo controls</h2>
            <p className="g-note" style={{ margin: "4px 0 10px" }}>
              Demo only: time is fast-forwarded for the demo. Demo date: <b>{formatDay(h.now)}</b>.
            </p>
            <form action={advanceClockAction} className="g-btnrow">
              {([["day", "Advance 1 day"], ["week", "Advance 1 week"], ["endOfWeek", "Advance to end of week"], ["endOfMonth", "Advance to end of month"]] as const)
                .map(([to, label]) => <PendingButton key={to} name="to" value={to} label={label} pendingLabel="Moving the clock…" className="g-btn g-btn--ghost" />)}
            </form>
            <p className="g-note" style={{ marginTop: 8 }}>
              Ended weeks close as the clock passes them (what she didn&apos;t spend counts as saved). A month end also runs the monthly review.
            </p>
          </section>
        </div>
      </div>
    </GuardianShell>
  );
}

function NeedsYouRow({ item, zoe, hadRules }: { item: NeedsYou; zoe: string; hadRules: boolean }) {
  if (item.kind === "rules") {
    return (
      <li><Link href="/g/grant">
        <span>{hadRules ? `${zoe}'s week has ended` : `${zoe} has no rules yet`}<small>Sign her rules so she can spend.</small></span>
      </Link></li>
    );
  }
  if (item.kind === "paypal") {
    return (
      // A plain <a>: this starts a PayPal redirect and must never be prefetched.
      <li><a href="/g/connect-paypal">
        <span>Save your PayPal<small>Tether charges it only for purchases that pass {zoe}&apos;s rules. Sandbox: no real money.</small></span>
      </a></li>
    );
  }
  const amount = item.amountCents !== undefined ? formatCents(item.amountCents) : "";
  const title = {
    purchase: `${zoe} is asking for ${amount} at ${item.shop}`,
    shop: `${zoe} suggests a new shop: ${item.shop}`,
    investment: `${zoe} proposes investing ${amount} in ${item.symbol ?? "a fund"}`,
    fund: `${zoe} proposes adding ${item.symbol ?? "a fund"} to your fund list`,
  }[item.subject];
  return (
    <li><Link href={`/g/requests/${item.id}`}>
      <span>{title}{item.note && <small>&ldquo;{item.note}&rdquo;</small>}</span>
    </Link></li>
  );
}
