import { FamilyField } from "@/ui/FamilyField";
import { connectPaypalHref } from "@/ui/connectPaypalHref";
import { Suspense } from "react";
import Link from "next/link";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { getLatestGrant, recentReceipts } from "@/db/repo";
import { LEVELS } from "@/engine/ladder";
import { shopsForLevel } from "@/flows/grant";
import { commitmentFloorCents } from "@/engine/ladder";
import { guardianHome, needsCount, type NeedsYou } from "@/flows/home";
import { guardianShops } from "@/flows/shops";
import { weekEnd } from "@/ui/activityWords";
import { teenMessage } from "@/flows/approvals";
import { APPROVE_CODES, approvedPurchase, type ApproveCode } from "@/flows/approve";
import { approveWords } from "@/ui/approveWords";
import { approvalShort, formatCents, formatDay, listWords } from "@/ui/grantWords";
import { Bar, GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { PendingButton } from "@/ui/PendingButton";
import { Seam } from "@/ui/Seam";
import { advanceClockAction } from "./actions";
import { AskBox } from "./AskBox";
import { PaymentRow } from "./PaymentRow";
import { PromisedCard } from "./PromisedCard";
import { RetirementNotice } from "@/ui/RetirementNotice";
import { PushAliasRefresh } from "./NotifyCard";
import { pushAliasFor } from "@/flows/notify";
import { FirstRun, WayBackIn } from "./FirstRun";

export default function GuardianHomePage({ searchParams }: PageProps<"/g">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Home searchParams={searchParams} />
    </Suspense>
  );
}

type Search = Record<string, string | string[] | undefined>;

type Flash = { text: string; warn?: boolean; connectPaypal?: boolean };

const paypalRemoved = (guardian: string) =>
  `${guardian}'s saved PayPal was removed at PayPal. Save it again with the sandbox login in the README — it takes a minute.`;

function flash(sp: Search, names: { teen: string; guardian: string }, paid: Parameters<typeof approveWords>[2]): Flash | null {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  // Review HIGH-1: a form or Save-your-PayPal link drawn for another teen, from before she switched in another tab.
  if (one("stale") === "1") return { text: `That page was for a teen you've since switched away from, so nothing changed. You're on ${names.teen} now.`, warn: true };
  const signed = one("signed");
  if (signed && /^\d+$/.test(signed)) return { text: `Signed. Rules v${signed} are in force now.` };
  const paypal = one("paypal");
  if (paypal === "connected") return { text: "Your PayPal is saved. Tether charges it only for purchases that pass the rules." };
  if (paypal === "failed") return { text: "PayPal didn't finish saving, so nothing was saved. Try again.", warn: true };
  if (paypal === "cancelled") return { text: "You left PayPal before saving. Nothing changed.", warn: true };
  if (paypal === "different") return { text: "That PayPal is a different account from the one you logged in with, so nothing was saved.", warn: true, connectPaypal: true };
  const teens = Number(one("teens") ?? 1);
  const others = teens > 1 && teens <= 5 ? ` Your other teens are a tap away in the teen switcher at the top.` : "";
  if (one("started") === "1") return { text: `Your family is set up. Three steps and ${names.teen} can start.${others}` };
  if (one("switched") === "1") return { text: `Now showing ${names.teen}.` };
  if (one("started") === "added") {
    return { text: `${teens > 1 && teens <= 5 ? `${teens} teens are added, starting with ${names.teen}.` : `${names.teen} is added.`} Three steps and ${names.teen} can start. Switch teens at the top.` };
  }
  const demo = one("demo");
  if (demo === "reset" || demo === "reset-paypal") {
    const kept = "Demo reset to how it was set up. Every PayPal charge stays on the record; ones made since setup no longer count.";
    return demo === "reset" ? { text: kept } : { text: `${kept} ${paypalRemoved(names.guardian)}`, warn: true, connectPaypal: true };
  }
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
  const sp = await searchParams;
  if (!familyId) return <SignedOut login={typeof sp.login === "string" ? sp.login : undefined} />;
  const db = await getDb();
  const now = await clockNow(db, familyId);
  const [h, latest, shops, recent] = await Promise.all([
    guardianHome(db, familyId, now), getLatestGrant(db, familyId), guardianShops(db, familyId, now), recentReceipts(db, familyId, 3),
  ]);
  const paid = sp.decided === "paid" && typeof sp.req === "string" ? await approvedPurchase(db, familyId, sp.req) : null;
  const note = flash(sp, { teen: h.teenName, guardian: h.guardianName }, paid);
  const zoe = h.teenName;
  const leftCents = Math.max(0, h.weeklyCents - h.spentThisWeekCents);
  // Decision 026: a family started with PayPal sees its first-run checklist instead of "Needs you" until all three are done.
  const firstRun = h.firstRun?.some((s) => !s.done) ? h.firstRun : null;
  const needs = needsCount(h);
  const rulesLine = firstRun ? await firstRulesLine(db, familyId, now) : "";
  // Review L9: a family started with PayPal could be anyone's teen, so its Home says the teen's name, never "her".
  // The shared demo family (and seeded ones) keep today's wording.
  const w = teenWords(zoe, h.firstRun !== null);

  return (
    <GuardianShell active="home" teenName={zoe} needs={needs} familyId={familyId}>
      <div className="g-head g-head--base">
        <h1 className="g-title">{zoe}</h1>
        {h.level && <span className="g-chip g-chip--accent">Level {h.level}</span>}
        <span className="g-sub">{!h.expiresAt ? "No rules in force" : h.grantEnded ? `${w.Her} rules ended ${formatDay(h.expiresAt)}` : `Rules in force until ${formatDay(h.expiresAt)}`}</span>
      </div>
      {note && (
        <p className={note.warn ? "g-flash g-flash--warn" : "g-flash"} role="status">
          {note.text}{note.connectPaypal && <> <a className="g-textlink" href={connectPaypalHref(familyId)}>Save your PayPal</a></>}
        </p>
      )}

      <RetirementNotice removesAt={h.removesAt} statementLink />
      {process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID && <PushAliasRefresh appId={process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID} alias={await pushAliasFor(db, familyId)} />}
      <div className="g-two g-home">
        <div className="g-stack">
          {firstRun ? (
            <>
              <FirstRun steps={firstRun} teen={zoe} rulesLine={rulesLine} familyId={familyId} />
              <WayBackIn />
            </>
          ) : h.needsYou.length === 0 ? (
            <div className="g-quiet g-home__needs" role="status">
              <div className="g-quiet__big">Nothing needs you today.</div>
              <p>You&apos;ll hear from Tether when something needs a decision — not every time {zoe} buys something.</p>
            </div>
          ) : (
            <section className="g-card g-home__needs" aria-labelledby="needs-h">
              <h2 className="g-label" id="needs-h">Needs you</h2>
              <ul className="g-needs">
                {h.needsYou.map((n) => <NeedsYouRow key={n.kind === "approval" ? n.id : n.kind} familyId={familyId} item={n} zoe={zoe} guardian={h.guardianName} hadRules={h.grantVersion !== null} w={w} />)}
              </ul>
            </section>
          )}

          <section className="g-card" aria-labelledby="recent-h">
            <h2 className="g-label" id="recent-h">Recent</h2>
            {recent.length === 0 ? <p className="g-muted">No payments yet.</p>
              : <ul className="g-rows">{recent.map((p) => <PaymentRow key={p.captureId} p={p} />)}</ul>}
            <p className="g-more"><Link className="g-textlink" href="/g/activity">See all activity</Link></p>
          </section>

          <section className="g-card" aria-labelledby="ask-h">
            <h2 className="g-label" id="ask-h">Ask about {zoe}&apos;s month</h2>
            <AskBox />
          </section>
        </div>

        <div className="g-stack">
          <section className="g-card g-home__week" aria-labelledby="week-h">
            <h2 className="g-label" id="week-h">This week</h2>
            <div className="g-figure"><Money cents={leftCents} /> left <small>of <Money cents={h.weeklyCents} /></small></div>
            <Bar value={h.spentThisWeekCents} max={h.weeklyCents}
              label={`${formatCents(h.spentThisWeekCents)} spent of ${formatCents(h.weeklyCents)}`} />
            <div className="g-muted"><Money cents={h.spentThisWeekCents} /> spent · week ends {formatDay(weekEnd(now))}</div>
          </section>

          <PromisedCard teen={zoe} cents={h.savingsCents} goal={h.goal}>
            <p className="g-more"><Link className="g-textlink" href="/g/savings">See {zoe}&apos;s savings</Link></p>
          </PromisedCard>

          <section className="g-card" aria-labelledby="glance-h">
            <h2 className="g-label" id="glance-h">{w.Her} rules at a glance</h2>
            {latest && h.level ? (
              <>
                <Def k="Each week" v={formatCents(h.weeklyCents)} />
                <Def k="Shops" v={shops.shops.length ? listWords(shops.shops.map((s) => s.name)) : "no shops yet"} />
                <Def k="Asks you first" v={approvalShort(h.level)} />
                <Def k="Saves at least" v={`${formatCents(commitmentFloorCents(h.weeklyCents, latest.body.commitmentFloorPct))} a week`} />
              </>
            ) : <p className="g-muted">No rules in force. {zoe} can&apos;t spend until you sign them.</p>}
            <p className="g-more"><Link className="g-textlink" href="/g/rules">{h.level && !h.grantEnded ? `Change ${w.her} rules` : `Sign ${w.her} rules`}</Link></p>
          </section>

          <details className="g-card g-demo" open={firstRun !== null}>
            <summary>Demo controls</summary>
            <div style={{ margin: "4px 0 10px" }}>
              <Seam kinds={["clock"]}>Demo date: <b>{formatDay(h.now)}</b>.</Seam>
            </div>
            <form action={advanceClockAction} className="g-btnrow">
              <FamilyField />
              {([["day", "Advance 1 day"], ["week", "Advance 1 week"], ["endOfWeek", "Advance to end of week"], ["endOfMonth", "Advance to end of month"]] as const)
                .map(([to, label]) => <PendingButton key={to} name="to" value={to} label={label} pendingLabel="Moving the clock…" className="g-btn g-btn--ghost" />)}
            </form>
            <p className="g-note" style={{ marginTop: 8 }}>
              Ended weeks close as the clock passes them (what {w.she} didn&apos;t spend counts as saved). A month end also runs the monthly check-in.
            </p>
            {h.removesAt && (
              <p className="g-note" style={{ marginTop: 8 }}>
                Your family&apos;s own clock: moving it changes nothing for anyone else. This family is removed on <b>{formatDay(h.removesAt)}</b>, 7 days after you made it.
              </p>
            )}
            {h.isDemo && <p className="g-note" style={{ marginTop: 8 }}>Reset demo is in <Link className="g-textlink" href="/g/settings">Settings</Link>.</p>}
          </details>
        </div>
      </div>
    </GuardianShell>
  );
}

/** "Level 1: $20 a week at Best Buy and Target. Over $10 asks you first." From the ladder and the shops Level 1 opens. */
async function firstRulesLine(db: Awaited<ReturnType<typeof getDb>>, familyId: string, now: Date): Promise<string> {
  const l1 = LEVELS[1];
  const shops = await shopsForLevel(db, familyId, 1, now);
  const where = shops.length ? ` at ${listWords(shops)}` : "";
  const asks = l1.approvalOverCents !== null ? ` Over ${formatCents(l1.approvalOverCents).replace(/\.00$/, "")} asks you first.` : "";
  return `Level 1: ${formatCents(l1.weeklyCents).replace(/\.00$/, "")} a week${where}.${asks}`;
}

function Def({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="g-def"><span className="g-def__k">{k}</span><span className="g-def__lead" /><span className="g-def__v">{v}</span></div>;
}

/** Slot for the "get a buzz when Zoe asks" notification card (mockup). Empty for now; a later task fills it. */
/** "her"/"she" for the demo family; the teen's name for a family started with PayPal (review L9). */
function teenWords(teen: string, named: boolean) {
  return named ? { her: `${teen}'s`, Her: `${teen}'s`, she: teen } : { her: "her", Her: "Her", she: "she" };
}

function NeedsYouRow({ item, zoe, guardian, hadRules, w, familyId }: {
  familyId: string; item: NeedsYou; zoe: string; guardian: string; hadRules: boolean; w: ReturnType<typeof teenWords>;
}) {
  if (item.kind === "rules") {
    return (
      <li><Link href="/g/rules">
        <span>{hadRules ? `${zoe}'s week has ended` : `${zoe} has no rules yet`}
          <small>{item.nudged ? `${zoe} nudged you to renew them. ` : ""}Sign {w.her} rules so {w.she} can spend.</small></span>
      </Link></li>
    );
  }
  if (item.kind === "message") {
    // No button: her rules can't pay for it, and an approval never lifts a refusal. It's for a conversation.
    return <li><span className="g-needs__note">{zoe} asked you about {item.note}<small>{w.Her} rules can&apos;t pay for this one this week, so nothing will be charged.</small></span></li>;
  }
  if (item.kind === "paypal") {
    return (
      // A plain <a>: this starts a PayPal redirect and must never be prefetched.
      <li><a href={connectPaypalHref(familyId)}>
        <span>Save your PayPal<small>{item.removedByRevoke ? paypalRemoved(guardian)
          : <>Tether charges it only for purchases that pass {zoe}&apos;s rules. Sandbox: no real money.</>}</small></span>
      </a></li>
    );
  }
  const amount = item.amountCents !== undefined ? formatCents(item.amountCents) : "";
  const title = {
    purchase: `${zoe} is asking for ${amount} at ${item.shop}`,
    shop: `${zoe} suggests a new shop: ${item.shop}`,
    investment: `${zoe} proposes investing ${amount} in ${item.symbol ?? "a fund or stock"}`,
    fund: `${zoe} proposes adding ${item.symbol ?? "a fund or stock"} to your investing list`,
  }[item.subject];
  return (
    <li><Link href={`/g/requests/${item.id}`}>
      <span>{title}{item.note && <small>&ldquo;{item.note}&rdquo;</small>}</span>
    </Link></li>
  );
}
