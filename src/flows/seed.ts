import { randomBytes } from "node:crypto";
import { eq, or, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { ARCHIVED_PREFIX, getActiveGrant, getFamily, insertFamily, saveVault } from "@/db/repo";
import { setNow } from "@/clock/clock";
import { weekRecords } from "@/ledger/ledger";
import { AlpacaError, type AlpacaBroker } from "@/adapters/alpaca/broker";
import type { Product } from "@/adapters/channel3/client";
import { cartHash } from "@/engine/hash";
import type { Cart } from "@/engine/types";
import { liftableOverage, proposeShop, requestApproval } from "@/flows/approvals";
import { renewGrant, setCommitment, signGrant } from "@/flows/grant";
import { ensureAccount } from "@/flows/invest";
import { proposePurchase, settlePurchase, type Deps } from "@/flows/purchase";
import { GOAL_TITLE_MAX } from "@/flows/teenGoals";
import { closeWeek } from "@/flows/week";

/** The demo shops (docs/spikes/2026-11-05-results.md). Charges go to Tether's own sandbox business (D7), so no payee. */
export const DEMO_MERCHANTS = [
  { id: "m_bestbuy", name: "Best Buy", domain: "bestbuy.com", class: "general", opensAtLevel: 1 },
  { id: "m_target", name: "Target", domain: "target.com", class: "general", opensAtLevel: 1 },
  { id: "m_barnesandnoble", name: "Barnes & Noble", domain: "barnesandnoble.com", class: "books", opensAtLevel: 2 },
  { id: "m_nike", name: "Nike", domain: "nike.com", class: "sneakers", opensAtLevel: 3 },
  { id: "m_uniqlo", name: "Uniqlo", domain: "uniqlo.com", class: "apparel", opensAtLevel: 3 },
].map((m) => ({ ...m, channel3WebsiteId: m.domain }));

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
/** Four history weeks, 2026-W49..W52 (Mon 30 Nov – Sun 27 Dec). */
export const DEMO_FIRST_MONDAY = new Date("2026-11-30T00:00:00Z");
/**
 * Where the seed leaves the demo clock: Monday of 2026-W53, the ISO week that holds the month end (1 Jan is a Friday).
 * "Advance to end of month" then lands mid-week, so the review counts exactly the four seeded weeks, however this
 * week goes (an approved over-budget ask can't spoil the on-camera promotion).
 */
export const DEMO_NOW = new Date("2026-12-28T12:00:00Z");
export const DEMO_COMMITMENT_CENTS = 1000; // Zoe promises $10 of her $30 a week
const LEVEL = 2 as const;
const WEEKLY_CENTS = 3000;
const SPEND_CAP_CENTS = WEEKLY_CENTS - DEMO_COMMITMENT_CENTS; // every seeded week is kept
const SMALL = { min: 300, max: 900 }; // $3–$9 sandbox charges
const SMALL_QUERIES = ["notebook", "gel pens", "sticky notes", "phone charger cable", "hair ties", "highlighters", "earbuds case", "socks"];
const OVER_QUERIES = ["bluetooth speaker", "board game", "water bottle", "wireless earbuds", "desk lamp"];
const GOAL_QUERY = "wireless headphones";
const GOAL_FALLBACK = { title: "Wireless headphones", targetCents: 7999, channel3ProductId: null };
const ASK_NOTE = "It's Mia's birthday present — the party is Saturday.";
const SHOP = { domain: "etsy.com", reason: "Handmade stuff for Mia's birthday, and it's cheaper than the mall." };
const PREFUND_CENTS = 5000;
const GENERAL = ["target.com", "bestbuy.com"];

export type SeedDeps = Deps & { alpaca?: AlpacaBroker; log?: (line: string) => void; wait?: (ms: number) => Promise<void> };
export interface DemoKeys { guardianKey: string; teenToken: string }
export interface SeededWeek { weekKey: string; spentCents: number; savedCents: number; kept: boolean; captureIds: string[] }
export interface SeedResult {
  familyId: string; weeks: SeededWeek[]; thisWeekCaptureIds: string[]; goal: { title: string; targetCents: number };
  askPurchaseId: string | null; investing: { accountId: string; transferId: string | null; status: string } | null;
}

const short = (id: string) => `${id.slice(0, 6)}…`;
const cartOf = (p: Product, merchantId: string): Cart =>
  ({ merchantId, items: [{ sku: p.id, title: p.title, qty: 1, unitCents: p.priceCents }], totalCents: p.priceCents });
const merchantFor = (domain: string) => DEMO_MERCHANTS.find((m) => m.domain === domain)!.id;

/**
 * The shared demo family (D11, R43): Amara and Zoe, Level 2, four kept weeks of history made of REAL sandbox vault
 * charges (every receipt carries PayPal's capture id), an over-budget ask and a shop suggestion waiting for Amara,
 * and a pre-funded investing account. Re-running archives the earlier demo family (its money rows stay, untouched)
 * and builds a fresh one with the same keys, so the published links keep working.
 */
export async function seedDemo(deps: SeedDeps, keys: DemoKeys & { vaultId: string }): Promise<SeedResult> {
  const { db } = deps;
  const log = deps.log ?? (() => undefined);
  const alpacaAccountId = await archiveEarlier(deps, keys);
  await db.insert(t.merchants).values(DEMO_MERCHANTS).onConflictDoNothing();
  const fam = await insertFamily(db, {
    name: "Amara & Zoe", guardianName: "Amara", teenName: "Zoe", teenToken: keys.teenToken, guardianToken: keys.guardianKey,
  });
  if (alpacaAccountId) await db.update(t.families).set({ alpacaAccountId }).where(eq(t.families.id, fam.id));
  await saveVault(db, fam.id, keys.vaultId);
  const at = (d: Date) => setNow(db, fam.id, d);

  await at(new Date(DEMO_FIRST_MONDAY.getTime() + 9 * HOUR_MS));
  await signGrant(deps, fam.id, { level: LEVEL, commitmentFloorPct: 10, matchPct: 100, fundAllowlist: ["VTI"] });
  const goal = await pickGoal(deps);
  await db.insert(t.goals).values({ familyId: fam.id, ...goal });
  await setCommitment(deps, fam.id, DEMO_COMMITMENT_CENTS);

  const pool = await searchPool(deps, SMALL_QUERIES, SMALL.min, SMALL.max);
  if (pool.length === 0) throw new Error("Channel3 returned no $3–$9 products at Target or Best Buy; nothing to seed");
  let next = 0;
  const buy = async (when: Date): Promise<{ captureId: string; cents: number } | null> => {
    const p = pool[next++ % pool.length];
    await at(when);
    const r = await purchase(deps, fam.id, cartOf(p, merchantFor(p.domain)));
    if (!r) log(`  skipped ${p.title.slice(0, 30)} (${p.priceCents}¢): not paid`);
    return r ? { captureId: r, cents: p.priceCents } : null;
  };

  const weeks: SeededWeek[] = [];
  for (let w = 0; w < 4; w++) {
    const monday = new Date(DEMO_FIRST_MONDAY.getTime() + w * WEEK_MS);
    if (w > 0) {
      await at(new Date(monday.getTime() + 9 * HOUR_MS));
      await renewGrant(deps, fam.id); // her rules run a week at a time
    }
    const captures: string[] = [];
    let spent = 0;
    for (const day of [1, 3, 5]) {
      if (spent + pool[next % pool.length].priceCents > SPEND_CAP_CENTS) break;
      const r = await buy(new Date(monday.getTime() + day * DAY_MS + 16 * HOUR_MS));
      if (r) { captures.push(r.captureId); spent += r.cents; }
    }
    await at(new Date(monday.getTime() + WEEK_MS + 9 * HOUR_MS)); // next Monday morning: the week closes
    await closeWeek(deps, fam.id);
    const rec = (await weekRecords(db, fam.id)).at(-1)!;
    const week = {
      weekKey: rec.weekKey, spentCents: rec.spentCents, savedCents: rec.allowanceCents - rec.spentCents,
      kept: rec.allowanceCents - rec.spentCents >= rec.commitmentCents, captureIds: captures,
    };
    weeks.push(week);
    log(`${week.weekKey}: ${captures.length} charges, spent ${week.spentCents}¢, saved ${week.savedCents}¢, ${week.kept ? "kept" : "NOT kept"} [${captures.map(short).join(", ")}]`);
  }
  await renewGrant(deps, fam.id); // this week's rules (Mon 28 Dec, 09:00)

  // This week so far: two small buys, then something over what's left — refused for budget only, so Zoe asks Amara.
  const thisWeek: string[] = [];
  for (const h of [9.5, 10.5]) {
    const r = await buy(new Date(DEMO_NOW.getTime() - 12 * HOUR_MS + h * HOUR_MS));
    if (r) thisWeek.push(r.captureId);
  }
  await at(DEMO_NOW);
  const askPurchaseId = await openOverBudgetAsk(deps, fam.id, log);
  await proposeShop(deps, fam.id, SHOP.domain, SHOP.reason);

  const grant = await getActiveGrant(db, fam.id);
  const [askRow] = askPurchaseId ? await db.select().from(t.purchases).where(eq(t.purchases.id, askPurchaseId)) : [];
  const snapshot: t.DemoSnapshot = {
    now: DEMO_NOW.toISOString(), grant: grant!.body, commitmentCents: DEMO_COMMITMENT_CENTS, goal,
    ask: askRow ? { cart: askRow.cart, note: ASK_NOTE } : null, shop: SHOP,
  };
  // The void window opens here (DB time): anything written after the seed is judges' activity, which a reset voids.
  await db.update(t.families).set({ demo: snapshot, ledgerVoidFrom: sql`now()`, ledgerVoidTo: null }).where(eq(t.families.id, fam.id));
  log(`this week: ${thisWeek.length} charges [${thisWeek.map(short).join(", ")}]; over-budget ask ${askPurchaseId ? "open" : "NOT opened"}; shop suggestion ${SHOP.domain} open`);

  const investing = deps.alpaca ? await prefund(deps, fam.id, log) : null;
  return { familyId: fam.id, weeks, thisWeekCaptureIds: thisWeek, goal, askPurchaseId, investing };
}

/** Moves the demo keys off any earlier demo family, keeping its rows; returns its investing account for reuse. */
async function archiveEarlier(deps: SeedDeps, keys: DemoKeys): Promise<string | null> {
  const rows = await deps.db.select().from(t.families)
    .where(or(eq(t.families.guardianToken, keys.guardianKey), eq(t.families.teenToken, keys.teenToken)));
  for (const f of rows) {
    await deps.db.update(t.families).set({
      name: `${f.name} (archived)`, demo: null,
      guardianToken: `${ARCHIVED_PREFIX}${randomBytes(24).toString("base64url")}`, teenToken: `${ARCHIVED_PREFIX}${randomBytes(24).toString("base64url")}`,
    }).where(eq(t.families.id, f.id));
    deps.log?.(`archived earlier demo family ${short(f.id)} (its records stay)`);
  }
  return rows.find((f) => f.alpacaAccountId)?.alpacaAccountId ?? null;
}

/** propose → settle through the real flows: a REAL sandbox vault charge. Returns the capture id, or null if not paid. */
async function purchase(deps: SeedDeps, familyId: string, cart: Cart): Promise<string | null> {
  const { purchaseId, decision } = await proposePurchase(deps, familyId, cart);
  if (decision.outcome !== "ALLOW") return null;
  const r = await settlePurchase(deps, purchaseId);
  if (r.status !== "paid") return null;
  const [rec] = await deps.db.select({ c: t.receipts.captureId }).from(t.receipts).where(eq(t.receipts.purchaseId, purchaseId));
  return rec?.c || null;
}

async function searchPool(deps: SeedDeps, queries: string[], min: number, max: number): Promise<Product[]> {
  const seen = new Map<string, Product>();
  for (const q of queries) {
    const found = await deps.channel3.search(q, GENERAL, 10).catch((e: unknown) => {
      deps.log?.(`  Channel3 search "${q}" failed: ${e instanceof Error ? e.message : e}`);
      return [];
    });
    for (const p of found) if (p.priceCents >= min && p.priceCents <= max && !seen.has(p.id)) seen.set(p.id, p);
  }
  return [...seen.values()];
}

/** Zoe's goal: a real Channel3 product when Channel3 answers, else a fixed one. */
async function pickGoal(deps: SeedDeps): Promise<t.DemoSnapshot["goal"]> {
  const [p] = await searchPool(deps, [GOAL_QUERY], 4000, 25_000);
  if (!p) return GOAL_FALLBACK;
  return { title: shortTitle(p.title), targetCents: p.priceCents, channel3ProductId: p.id };
}

/** Fits the goal title limit, cut at a word: "Space One Pro Noise Cancelling Headphones" -> "Space One Pro Noise Cancelling…". */
export function shortTitle(title: string): string {
  if (title.length <= GOAL_TITLE_MAX) return title;
  const cut = title.slice(0, GOAL_TITLE_MAX - 1);
  const word = cut.lastIndexOf(" ");
  return `${(word > 0 ? cut.slice(0, word) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
}

/** R40: an over-budget cart, refused for budget only, asked for through requestApproval (lifts_budget). */
async function openOverBudgetAsk(deps: SeedDeps, familyId: string, log: (l: string) => void): Promise<string | null> {
  for (const p of await searchPool(deps, OVER_QUERIES, 1000, WEEKLY_CENTS)) {
    const cart = cartOf(p, merchantFor(p.domain));
    const { purchaseId, decision } = await proposePurchase(deps, familyId, cart);
    if (decision.outcome !== "REFUSE" || liftableOverage(decision) === null) continue; // fits her week: not an ask
    await requestApproval(deps, familyId, "purchase", purchaseId, cartHash(cart), ASK_NOTE);
    return purchaseId;
  }
  log("  no over-budget product found for the ask");
  return null;
}

const DEAD_TRANSFER = new Set(["CANCELED", "REJECTED", "RETURNED"]);

/**
 * Investing needs buying power before the demo: create (or reuse) the family's stand-in account and deposit
 * $50 of sandbox money once. Not journalled: it isn't Zoe's savings; each approved investment still moves its own
 * amount. A new sandbox account takes about a minute to activate, so a 4xx is retried for up to ~2 minutes; the
 * deposit then takes minutes to clear, so this reports its status instead of waiting for it.
 */
async function prefund(deps: SeedDeps, familyId: string, log: (l: string) => void): Promise<SeedResult["investing"]> {
  const alpaca = deps.alpaca!;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const accountId = await ensureAccount({ db: deps.db, alpaca }, familyId);
  const live = (await alpaca.listTransfers(accountId)).find((x) => x.incoming && !DEAD_TRANSFER.has(x.status));
  if (live) {
    log(`investing: account ${short(accountId)} already funded (${live.status})`);
    return { accountId, transferId: live.transferId, status: live.status };
  }
  const ATTEMPTS = 8;
  for (let attempt = 1; ; attempt++) {
    try {
      const { transferId } = await alpaca.deposit(accountId, PREFUND_CENTS);
      const status = (await alpaca.listTransfers(accountId)).find((x) => x.transferId === transferId)?.status ?? "SUBMITTED";
      log(`investing: account ${short(accountId)}, deposit $${PREFUND_CENTS / 100} ${short(transferId)} ${status}`);
      return { accountId, transferId, status };
    } catch (e) {
      if (!(e instanceof AlpacaError) || e.outcomeUnknown || attempt === ATTEMPTS) {
        log(`investing: account ${short(accountId)}, deposit not made: ${e instanceof Error ? e.message : e}`);
        return { accountId, transferId: null, status: "NOT_DEPOSITED" };
      }
      log(`  investing account not ready yet (attempt ${attempt}); retrying in 15s`);
      await wait(15_000);
    }
  }
}

/** True when `familyId` is the shared demo family: it holds the configured demo guardian key and a seed snapshot. */
export async function isDemoFamily(deps: Pick<Deps, "db">, familyId: string, guardianKey: string | undefined): Promise<boolean> {
  if (!guardianKey) return false;
  const f = await getFamily(deps.db, familyId);
  return !!f && f.guardianToken === guardianKey && f.demo !== null;
}
