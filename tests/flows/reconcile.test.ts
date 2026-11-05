import { beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { paypalHttp } from "@/adapters/paypal/http";
import { signGrant } from "@/flows/grant";
import { reconcileMonth } from "@/flows/reconcile";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const at = new Date("2026-11-04T12:00:00Z");
const realNow = new Date("2026-11-05T12:00:00Z");
let n = 0;

/** One family with a grant; `buy` records a purchase the way settlePurchase does (spend journal + consumed token [+ receipt]). */
async function family() {
  n++;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `rc-${n}`, guardianName: "Amara", teenName: "Zoe" });
  await db.insert(t.merchants).values({ id: `rc-m${n}`, name: "Target", domain: `rc${n}.example`, class: "general", opensAtLevel: 1 })
    .onConflictDoNothing();
  const grant = await signGrant({ db, now: async () => at }, fam.id, { level: 1 });
  const buy = async (tokenId: string, cents: number, captureId: string | null) => {
    const cart = { merchantId: `rc-m${n}`, items: [{ sku: "s", title: "Thing", qty: 1, unitCents: cents }], totalCents: cents };
    const p = await repo.insertPurchase(db, {
      familyId: fam.id, cart, cartHash: `h-${tokenId}`, status: captureId ? "paid" : "paying",
      decision: { outcome: "ALLOW", reasons: [], semanticRules: [] },
    });
    await repo.appendJournal(db, { familyId: fam.id, kind: "spend", amountCents: cents, at, ref: p.id, note: null });
    await repo.consumeToken(db, tokenId, p.id);
    if (captureId) {
      await repo.insertReceipt(db, {
        purchaseId: p.id, captureId, grantId: grant.id, grantVersion: grant.version, cartHash: `h-${tokenId}`,
        decision: { outcome: "ALLOW", reasons: [], semanticRules: [] }, approvalId: null,
      });
    }
  };
  return { familyId: fam.id, buy };
}

type Row = { transaction_id: string; transaction_amount: { value: string }; transaction_status: string; custom_field?: string; paypal_reference_id?: string };
function fakePaypal(rows: Row[]) {
  const f = vi.fn(async (url: string | URL | Request) => {
    const body = String(url).endsWith("/v1/oauth2/token")
      ? { access_token: "AT", expires_in: 3600 }
      : { transaction_details: rows.map((r) => ({ transaction_info: r })), total_pages: 1 };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  return { paypal: paypalHttp({ baseUrl: "https://paypal.test", clientId: "c", secret: "s" }, f as unknown as typeof fetch), f };
}
const tx = (id: string, value: string, custom?: string, extra: Partial<Row> = {}): Row =>
  ({ transaction_id: id, transaction_amount: { value }, transaction_status: "S", ...(custom ? { custom_field: custom } : {}), ...extra });

describe("reconcileMonth (R35)", () => {
  it("matched receipts raise no flags", async () => {
    const { familyId, buy } = await family();
    await buy(`tok-a${n}`, 600, `CAP-A${n}`);
    const { paypal } = fakePaypal([tx(`CAP-A${n}`, "6.00", `tok-a${n}`)]);
    expect(await reconcileMonth({ db, paypal }, familyId, "2026-11", realNow)).toEqual({ receiptsChecked: 1, flags: [] });
  });

  it("reconciliation flags a PayPal transaction missing from Tether, and ignores rows with no family link", async () => {
    const other = await family();
    await other.buy(`tok-other${n}`, 999, null); // another family's charge with no receipt: not ours to show
    const otherToken = `tok-other${n}`;
    const { familyId, buy } = await family();
    await buy(`tok-b${n}`, 600, `CAP-B${n}`);
    await buy(`tok-c${n}`, 450, null); // charged, then Tether crashed before writing the receipt
    const { paypal } = fakePaypal([
      tx(`CAP-B${n}`, "6.00", `tok-b${n}`),
      tx(`CAP-C${n}`, "4.50", `tok-c${n}`),
      tx("CAP-OTHER", "9.99", otherToken), // another family's token
      tx("CAP-NOLINK", "50.00"), // merchant-account row with no custom_field
    ]);
    const r = await reconcileMonth({ db, paypal }, familyId, "2026-11", realNow);
    expect(r.flags).toEqual([{ kind: "paypal_only", captureId: `CAP-C${n}`, amountCents: 450 }]);
    expect(JSON.stringify(r)).not.toMatch(/CAP-OTHER|CAP-NOLINK/);
  });

  it("flags receipts PayPal doesn't show, and refunded ones", async () => {
    const { familyId, buy } = await family();
    await buy(`tok-d${n}`, 600, `CAP-D${n}`);
    await buy(`tok-e${n}`, 700, `CAP-E${n}`);
    await buy(`tok-f${n}`, 800, `CAP-F${n}`);
    const { paypal } = fakePaypal([
      tx(`CAP-E${n}`, "7.00", `tok-e${n}`),
      tx(`REF-E${n}`, "-7.00", `tok-e${n}`, { paypal_reference_id: `CAP-E${n}` }),
      tx(`CAP-F${n}`, "8.00", `tok-f${n}`, { transaction_status: "V" }),
    ]);
    const r = await reconcileMonth({ db, paypal }, familyId, "2026-11", realNow);
    expect([...r.flags].sort((a, b) => a.captureId.localeCompare(b.captureId))).toEqual([
      { kind: "unconfirmed", captureId: `CAP-D${n}`, amountCents: 600, shop: "Target" },
      { kind: "refunded", captureId: `CAP-E${n}`, amountCents: 700, shop: "Target" },
      { kind: "refunded", captureId: `CAP-F${n}`, amountCents: 800, shop: "Target" },
    ]);
  });

  it("searches PayPal from just before the first slip was used, and skips PayPal for an empty month", async () => {
    const { familyId, buy } = await family();
    await buy(`tok-g${n}`, 600, `CAP-G${n}`);
    const { paypal, f } = fakePaypal([tx(`CAP-G${n}`, "6.00", `tok-g${n}`)]);
    await reconcileMonth({ db, paypal }, familyId, "2026-11", new Date(Date.now() + 3_600_000));
    const q = new URL(String(f.mock.calls.find(([u]) => String(u).includes("/reporting/"))![0])).searchParams;
    const start = Date.parse(q.get("start_date")!), end = Date.parse(q.get("end_date")!);
    expect(Date.now() - start).toBeGreaterThan(86_000_000);
    expect(Date.now() - start).toBeLessThan(2 * 86_400_000);
    expect(end - start).toBeLessThanOrEqual(31 * 86_400_000);

    const empty = fakePaypal([]);
    expect(await reconcileMonth({ db, paypal: empty.paypal }, familyId, "2026-10", realNow)).toEqual({ receiptsChecked: 0, flags: [] });
    expect(empty.f).not.toHaveBeenCalled();
    await expect(reconcileMonth({ db, paypal: empty.paypal }, familyId, "nope", realNow)).rejects.toThrow();
  });
});
