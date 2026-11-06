import { Suspense } from "react";
import Link from "next/link";
import { teenSession } from "@/auth/teen";
import type { Db } from "@/db/client";
import { now as clockNow } from "@/clock/clock";
import { teenPurchase, teenWeek, type TeenWeek } from "@/flows/teen";
import { formatCents } from "@/ui/grantWords";
import { PendingButton } from "@/ui/PendingButton";
import { Bar, LinkGone, Money, TeenLoading, TeenShell } from "@/ui/teen";
import { buyFlash, daysToReset, levelLine, reflection, resetsWords, setsBack, whatChanged, type BuyFlash } from "@/ui/teenWords";
import { levelSeenAction, nudgeAction } from "./actions";
import { RefusalSheet } from "./RefusalSheet";
import { NotShopping } from "./NotShopping";
import { Seam } from "@/ui/Seam";

// Mock 1 — Your week: one number, one bar. Also hosts mock 5 (level up), mock 6 (week ended) and mock 2 (?sheet=).
export default function TeenWeekPage({ params, searchParams }: PageProps<"/t/[token]">) {
  return (
    <Suspense fallback={<TeenLoading />}>
      <Week params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Search = Record<string, string | string[] | undefined>;
const one = (sp: Search, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

async function Week({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Search> }) {
  const { token } = await params;
  const session = await teenSession(token);
  if (!session) return <LinkGone />;
  const { db, fam } = session;
  const w = await teenWeek(db, fam.id, await clockNow(db, fam.id));
  const sp = await searchParams;

  if (w.state === "active" && w.levelUp) return <LevelUp token={token} w={w} />;
  if (w.state === "ended") return <WeekEnded token={token} w={w} />;
  if (w.state !== "active") return <TeenShell token={token} active="week" level={w.level} center><NotShopping w={w} /></TeenShell>;

  const flash = await flashFor(sp, w, db, fam.id);
  const sheet = one(sp, "sheet");
  const g = w.guardianName;
  return (
    <TeenShell token={token} active="week" level={w.level}>
      <div>
        <div className="t-eyebrow">Your week</div>
        <div className="t-hero money">{formatCents(w.leftCents)}</div>
        <div className="t-hero-sub">left this week</div>
      </div>
      <div>
        <Bar value={w.spentCents} max={w.weeklyCents} label={`${formatCents(w.spentCents)} spent of ${formatCents(w.weeklyCents)}`} />
        <div className="t-barlabels"><span>spent <Money cents={w.spentCents} /> of <Money cents={w.weeklyCents} /></span><span>{resetsWords(daysToReset(w.now, w.endsAt))}</span></div>
      </div>
      {w.level && <div className="t-pill">{levelLine(w.level, g)}</div>}

      {flash && (
        <p className={flash.warn ? "t-flash t-flash--warn" : "t-flash"} role="status">
          {flash.text}{flash.sub && <small>{flash.sub}</small>}
          {flash.ask && flash.purchaseId && <small><Link href={`/t/${token}/ask/${flash.purchaseId}`} style={{ textDecoration: "underline" }}>Ask {g}</Link></small>}
        </p>
      )}
      {w.release && (
        <div className="t-hint" role="status">
          {w.release.confirmed
            ? <><b>{g} sent you <Money cents={w.release.cents} />.</b> She sent it outside Tether, so Tether knows because she said so.</>
            : <><b>{g} is sending you <Money cents={w.release.cents} /></b> — your savings plus her match.</>}
        </div>
      )}

      <section aria-labelledby="this-week">
        <h2 className="t-eyebrow" id="this-week" style={{ marginBottom: 4 }}>This week</h2>
        {w.purchases.length === 0 ? (
          <div className="t-card"><p className="t-small">Nothing bought yet this week.</p></div>
        ) : (
          <ul className="t-card t-card--tight" style={{ listStyle: "none" }}>
            {w.purchases.map((p) => {
              const back = p.status === "paid" ? setsBack(w.goal, p.amountCents, w.commitmentCents) : null;
              return (
                <li key={p.id} className="t-row">
                  <span className="t-row__who">{p.shop}<small>{p.title}{p.status === "paying" ? " · PayPal is confirming" : ""}{p.approved ? ` · ${g} approved this one` : ""}{back ? ` · ${back}` : ""}</small></span>
                  <span className="t-row__amt">{formatCents(p.amountCents)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {w.asks.length > 0 && (
        <section aria-labelledby="asks">
          <h2 className="t-eyebrow" id="asks" style={{ marginBottom: 4 }}>Your asks</h2>
          <ul className="t-card t-card--tight" style={{ listStyle: "none" }}>
            {w.asks.map((a) => (
              <li key={a.id} className="t-row">
                <span className="t-row__who">{a.shop}<small>{a.title} · {a.status === "declined" ? `${g} said not this time.` : `Waiting for ${g}`}</small></span>
                <span className="t-row__amt">{formatCents(a.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link className="t-btn t-btn--primary" href={`/t/${token}/shop`}>Find something</Link>
      <Seam center kinds={["sandbox", "merchant"]}>Purchases are charged to {g}&apos;s PayPal only when they pass your rules.</Seam>
      {sheet && <RefusalSheet token={token} familyId={fam.id} purchaseId={sheet.slice(0, 100)} w={w} />}
    </TeenShell>
  );
}

type Flash = BuyFlash & { purchaseId?: string };

async function flashFor(sp: Search, w: TeenWeek, db: Db, familyId: string): Promise<Flash | null> {
  const g = w.guardianName;
  const asked = one(sp, "asked");
  if (asked === "request") return { text: `Sent. ${g} will see it, with what you have left this week.` };
  if (asked === "message") return { text: `Sent. ${g} will see you asked.`, sub: "Your rules can't pay for this one, so nothing will be charged." };
  if (asked === "closed") return { text: "That one can't be asked about any more. Have another look in Shop.", warn: true };
  const code = one(sp, "buy");
  if (!code) return null;
  // The purchase's own status decides what Zoe is told; the code only explains a "nothing was spent".
  const p = await teenPurchase(db, familyId, one(sp, "p") ?? "");
  const f = buyFlash(code, p, g, p ? setsBack(w.goal, p.amountCents, w.commitmentCents) : null);
  return f && p ? { ...f, purchaseId: p.id } : f;
}

/** Mock 5: a real screen, with the evidence on it. */
function LevelUp({ token, w }: { token: string; w: TeenWeek }) {
  const u = w.levelUp!;
  return (
    <TeenShell token={token} active="week" level={w.level} center>
      <div style={{ textAlign: "center" }}>
        <div className="t-badge" aria-hidden>{u.toLevel}</div>
        <h1 className="t-h2">Level {u.toLevel} unlocked.</h1>
      </div>
      <div className="t-card">
        <div className="t-card__k" style={{ marginBottom: 8 }}>Why</div>
        <div className="t-evidence">
          {u.weeks > 0 && <span className="t-chip t-chip--fits">Kept your savings promise {u.kept} of {u.weeks} weeks</span>}
          {u.savedPct > 0 && <span className="t-chip t-chip--fits">Saved {u.savedPct}% of your allowance</span>}
        </div>
      </div>
      <div className="t-card">
        <div className="t-card__k" style={{ marginBottom: 8 }}>What changed</div>
        <p className="t-small">{whatChanged(u.fromLevel, u.toLevel, w.guardianName)}</p>
      </div>
      <form action={levelSeenAction}>
        <input type="hidden" name="token" value={token} />
        <PendingButton label="Nice" pendingLabel="…" className="t-btn t-btn--ghost" />
      </form>
    </TeenShell>
  );
}

/** Mock 6: grants expire by design. Reflection compares her only with herself (D12). */
function WeekEnded({ token, w }: { token: string; w: TeenWeek }) {
  const g = w.guardianName;
  const last = w.weeks.at(-1) ?? { spentCents: w.spentCents, allowanceCents: w.weeklyCents };
  return (
    <TeenShell token={token} active="week" level={w.level} center>
      <span className="t-chip t-chip--needs">Week ended</span>
      <h1 className="t-h2">Your week&apos;s finished.</h1>
      <p className="t-small">Your next <Money cents={w.weeklyCents} /> starts when {g} renews your rules.</p>
      <div className="t-card">
        <div className="t-card__k">Last week</div>
        <div className="money" style={{ fontSize: 27, fontWeight: 800, marginTop: 6 }}>{formatCents(last.spentCents)}</div>
        <div className="t-small">spent of <Money cents={last.allowanceCents} /></div>
        <Bar value={last.spentCents} max={last.allowanceCents} label={`${formatCents(last.spentCents)} spent of ${formatCents(last.allowanceCents)}`} />
      </div>
      <p className="t-small">{reflection(w.weeks, w.goal, w.savingsCents, w.commitmentCents)}</p>
      {w.nudged ? (
        <p className="t-flash" role="status">{g} has your nudge.</p>
      ) : (
        <form action={nudgeAction}>
          <input type="hidden" name="token" value={token} />
          <PendingButton label={`Nudge ${g}`} pendingLabel="Sending…" className="t-btn t-btn--primary" />
        </form>
      )}
      <p className="t-muted" style={{ textAlign: "center" }}>Your rules end on purpose, so you both get a fresh say.</p>
    </TeenShell>
  );
}
