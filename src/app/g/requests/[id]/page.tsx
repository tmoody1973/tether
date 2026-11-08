import { FamilyField } from "@/ui/FamilyField";
import { Suspense } from "react";
import Link from "next/link";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { guardianHome, needsCount, requestElsewhere } from "@/flows/home";
import { switchableFamilies } from "@/flows/start";
import { BROWSER_FAMILY_COOKIE, PAYPAL_WHO_COOKIE, openBrowserFamilies, openPaypalWho } from "@/auth/start";
import { cookies } from "next/headers";
import { closedRequestView, requestView, type ClosedRequest, type RequestView } from "@/flows/request";
import { marketFromEnv } from "@/adapters/alpaca/data";
import { companyFacts, fundInside } from "@/adapters/financialdatasets/client";
import { isLeveragedProduct, LEVERAGED_TEXT } from "@/engine/invest";
import { CompanyLine, InsideLineCard } from "@/ui/InvestCards";
import { pennyLine, requestShareWords } from "@/ui/investWords";
import { formatCents, formatDay } from "@/ui/grantWords";
import { closedWords, requestTitle as title } from "@/ui/approveWords";
import { Bar, GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { FundFactsLine } from "../../invest/FundFacts";
import { decideRequestAction } from "../../actions";
import { DecideButtons } from "./DecideButtons";
import { Seam } from "@/ui/Seam";

// Mock 10: one tap, with the budget consequence shown first. Requests arrive as a deep link, not a place.
export default function RequestPage({ params }: PageProps<"/g/requests/[id]">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Request params={params} />
    </Suspense>
  );
}

async function Request({ params }: { params: Promise<{ id: string }> }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const { id } = await params;
  const db = await getDb();
  const now = await clockNow(db, familyId);
  // In order, not in parallel: guardianHome expires stale asks first (as on Home), then this request is read.
  const h = await guardianHome(db, familyId, now);
  const v = await requestView(db, familyId, id, now);
  const closed = v ? null : await closedRequestView(db, familyId, id, now);
  const other = v || closed ? null : await otherTeensRequest(db, familyId, id);
  const zoe = h.teenName;
  return (
    <GuardianShell active="home" teenName={zoe} needs={needsCount(h)} familyId={familyId}>
      <Link className="g-back" href="/g">‹ Home</Link>
      {v ? <Open v={v} /> : closed ? <Settled c={closed} /> : other ? <OtherTeen teen={other} requestId={id} /> : <Closed />}
    </GuardianShell>
  );
}

/**
 * Review HIGH-2: one push alias covers all her teens, so a tap can open another teen's request. If it belongs to a teen
 * this session may switch to (the same check as the switcher), say whose it is and offer the switch. Anyone else's
 * stays the calm "closed" page.
 */
async function otherTeensRequest(db: Awaited<ReturnType<typeof getDb>>, familyId: string, requestId: string) {
  const jar = await cookies();
  const now = new Date();
  const who = openPaypalWho(jar.get(PAYPAL_WHO_COOKIE)?.value, now);
  if (!who) return null;
  const mine = await switchableFamilies(db, who, openBrowserFamilies(jar.get(BROWSER_FAMILY_COOKIE)?.value, now));
  if (!mine.some((f) => f.id === familyId)) return null; // signed in another way: no switching
  return requestElsewhere(db, requestId, mine.filter((f) => f.id !== familyId));
}

function OtherTeen({ teen, requestId }: { teen: { id: string; teenName: string }; requestId: string }) {
  return (
    <div className="g-request">
      <div className="g-quiet" role="status">
        <div className="g-quiet__big">This is {teen.teenName}&apos;s request.</div>
        <p>You&apos;re looking at another teen right now. Switch to {teen.teenName} to see it and decide.</p>
      </div>
      <form method="post" action="/g/settings/switch">
        <input type="hidden" name="familyId" value={teen.id} />
        <input type="hidden" name="to" value="request" />
        <input type="hidden" name="request" value={requestId} />
        <button type="submit" className="g-btn g-btn--block">Switch to {teen.teenName}</button>
      </form>
    </div>
  );
}

/** Unknown and other families' requests (and any closed one with nothing to show): one calm page that never says which. */
function Closed() {
  return (
    <div className="g-request">
      <div className="g-quiet" role="status">
        <div className="g-quiet__big">This request has closed.</div>
        <p>It was already answered, or it ran out of time. Nothing more is needed from you.</p>
      </div>
      <Link className="g-btn g-btn--ghost" href="/g">Back to home</Link>
    </div>
  );
}

/** A request of her own family's that is already decided or expired: what happened, and where to see it. */
function Settled({ c }: { c: ClosedRequest }) {
  const w = closedWords(c);
  return (
    <div className="g-request">
      <div className="g-quiet" role="status">
        <div className="g-quiet__big">{w.heading}</div>
        <p>{w.line}</p>
        {w.status && <p>{w.status}</p>}
        {w.note && <p className="g-note">{w.note}</p>}
      </div>
      <Link className="g-btn g-btn--ghost" href={w.href}>{w.button}</Link>
    </div>
  );
}

function approveLabel(v: RequestView): string {
  if (v.purchase) return `Approve ${formatCents(v.purchase.amountCents)}`;
  if (v.investment) return `Approve ${formatCents(v.investment.amountCents)}`;
  return v.fund ? `Add ${v.fund.symbol}` : "Add this shop";
}

function Consequence({ v }: { v: RequestView }) {
  if (v.purchase) {
    const { leftCents, overCents, amountCents } = v.purchase;
    const after = leftCents - amountCents;
    return (
      <section className="g-card" aria-label="What this does to her week">
        <p style={{ color: "var(--ink-2)" }}>
          She has <b><Money cents={leftCents} /></b> left this week.{" "}
          {overCents > 0
            ? <>This would use the rest and <b><Money cents={overCents} /></b> more.</>
            : <>This would leave <b><Money cents={after} /></b>.</>}
        </p>
        <Bar value={Math.min(amountCents, leftCents)} max={Math.max(leftCents, amountCents)}
          label={`${formatCents(amountCents)} against ${formatCents(leftCents)} left this week`} />
        <div className="g-barlabels">
          <span>{formatCents(leftCents)} available</span>
          {overCents > 0 && <span className="g-over">{formatCents(overCents)} over</span>}
        </div>
        {v.purchase.liftsBudget && overCents > 0 && (
          <p style={{ color: "var(--ink-2)", marginTop: 6 }}>A one-off: this week won&apos;t count toward her next level.</p>
        )}
        <p className="g-note" style={{ marginTop: 6 }}>
          {v.purchase.items.map((i) => `${i.qty > 1 ? `${i.qty} × ` : ""}${i.title}`).join(", ")}
        </p>
      </section>
    );
  }
  if (v.investment) {
    return (
      <>
      <section className="g-card" aria-label="What this does to her savings">
        <p style={{ color: "var(--ink-2)" }}>
          She has <b><Money cents={v.investment.savingsCents} /></b> available to invest. This moves <b><Money cents={v.investment.amountCents} /></b> into
          her investing account. Once it&apos;s there it belongs to her and can&apos;t be taken back.
        </p>
        <FundFactsLine symbol={v.investment.symbol} />
        <Suspense fallback={null}><StockLines symbol={v.investment.symbol} /></Suspense>
      </section>
      <Suspense fallback={null}><WhatsInside symbol={v.investment.symbol} /></Suspense>
      </>
    );
  }
  if (v.fund) {
    return (
      <>
      <section className="g-card" aria-label="What adding this means">
        <p style={{ color: "var(--ink-2)" }}>
          Adding <b>{v.fund.symbol}</b> to your investing list lets {v.teenName} propose investing in it. Nothing is bought now, and each investment still comes to you.
        </p>
        <FundFactsLine symbol={v.fund.symbol} />
        <Suspense fallback={null}><StockLines symbol={v.fund.symbol} /></Suspense>
      </section>
      <Suspense fallback={null}><WhatsInside symbol={v.fund.symbol} /></Suspense>
      </>
    );
  }
  return (
    <section className="g-card" aria-label="What adding this shop means">
      <p style={{ color: "var(--ink-2)" }}>
        Adding <b>{v.shop?.domain}</b> lets {v.teenName} buy there inside her rules. Your rules get a new version; nothing else changes.
      </p>
    </section>
  );
}

function Open({ v }: { v: RequestView }) {
  const w = v.lastWeeks;
  return (
    <div className="g-request">
      <div>
        <div className="g-eyebrow">Request</div>
        <h1 className="g-request__title">{title(v)}</h1>
        {v.investment && <Suspense fallback={null}><ShareLine symbol={v.investment.symbol} amountCents={v.investment.amountCents} /></Suspense>}
      </div>

      <Consequence v={v} />

      {(v.reason || v.answers.length > 0) && (
        <section className="g-card">
          <h2 className="g-label">{v.answers.length ? "Her answers" : "Her reason"}</h2>
          {v.reason && <p className="g-reason">&ldquo;{v.reason}&rdquo;</p>}
          {v.answers.map(([q, a]) => (
            <p key={q} style={{ marginTop: 6 }}><span className="g-muted">{q}</span><br /><span className="g-reason">&ldquo;{a}&rdquo;</span></p>
          ))}
        </section>
      )}

      <section className="g-card" style={{ background: "#FBFBF9" }}>
        <p style={{ color: "var(--ink-2)" }}>
          {w.count === 0
            ? `This is ${v.teenName}'s first week with Tether.`
            : <>Her last {w.count === 1 ? "week" : `${w.count} weeks`}: <b>inside budget {w.insideBudget} of {w.count}</b>, savings kept {w.kept} of {w.count}.</>}
        </p>
      </section>

      <form action={decideRequestAction} style={{ display: "grid", gap: 9 }}>
        <FamilyField />
        <input type="hidden" name="approvalId" value={v.id} />
        <DecideButtons approveLabel={approveLabel(v)} />
        {v.purchase && <Seam center kinds={["sandbox"]} />}
        <p className="g-note" style={{ textAlign: "center" }}>
          Open until {formatDay(v.expiresAt)}.{" "}
          {v.purchase && <Link className="g-textlink" href="/g/rules">or change her rules instead</Link>}
        </p>
      </form>
    </div>
  );
}

/** Under an investment's title: about how much of a share, at the latest close. Nothing without a price. */
async function ShareLine({ symbol, amountCents }: { symbol: string; amountCents: number }) {
  const q = await (async () => marketFromEnv().quote(symbol))().catch(() => null);
  return q ? <p className="g-muted" style={{ marginTop: 4 }}>{requestShareWords(amountCents, q, symbol)}</p> : null;
}

/** Alpaca's listing for a symbol (its asset list is cached per process); undefined when unknown or unavailable. */
async function assetHit(symbol: string) {
  try {
    return (await marketFromEnv().searchAssets(symbol)).find((a) => a.symbol === symbol);
  } catch {
    return undefined;
  }
}

/**
 * The same "what's inside" Zoe saw, compact. Streams in; hidden for companies, leveraged products (no credit is spent
 * on a product Tether doesn't offer) or when unavailable. Only with Alpaca's name for it.
 */
async function WhatsInside({ symbol }: { symbol: string }) {
  const familyId = await guardianFamilyId(); // read here, so the open/closed switch above stays as it is
  const hit = familyId ? await assetHit(symbol) : undefined;
  return familyId && hit ? <InsideLineCard symbol={symbol} inside={await fundInside(symbol, familyId, hit.name)} /> : null;
}

/**
 * Under the facts line: a leveraged product says Tether doesn't offer it (her yes is refused too), a close under $1
 * gets the plain penny line, and a stock says what the company is. Streams in; each part hides when unavailable.
 * One paid call at most: companyFacts never asks for a fund, and WhatsInside never asks for a stock.
 */
async function StockLines({ symbol }: { symbol: string }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return null;
  const market = (() => { try { return marketFromEnv(); } catch { return null; } })();
  const [hit, close] = await Promise.all([assetHit(symbol), market ? market.latestClose(symbol) : null]);
  // Only with Alpaca's name for it: a fund or a leveraged product never spends a paid company lookup.
  const facts = hit ? await companyFacts(symbol, familyId, hit.name) : null;
  const penny = pennyLine(close?.cents ?? null);
  return (
    <>
      {hit && isLeveragedProduct(hit.name) && <p className="g-note" style={{ marginTop: 6 }}>{LEVERAGED_TEXT}</p>}
      <CompanyLine facts={facts} />
      {penny && <p className="g-note" style={{ marginTop: 6 }}>{penny}</p>}
    </>
  );
}
