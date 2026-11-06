"use server";

import { redirect } from "next/navigation";
import { runAgent } from "@/ai/agent";
import { teenFromForm } from "@/auth/teen";
import { getActiveGrant } from "@/db/repo";
import { ledgerView } from "@/ledger/ledger";
import { allowedShops, askAmara, buy, cartFor, markLevelSeen, nudge, proposeCarts, shopThrottle, teenWeek, TeenError, type Proposed } from "@/flows/teen";
import { ApprovalError } from "@/flows/approvals";
import { cardOutcome, type CardKind } from "@/ui/teenWords";
import { agentModel, teenDeps } from "../teenDeps";

export interface ShopCard { purchaseId: string; title: string; shop: string; priceCents: number; kind: CardKind; label: string; reason?: string }
export type ShopState = { cards: ShopCard[]; error?: string; note?: string };

const MAX_REQUEST = 200;
const SHOP_DOWN = "Can't reach the shops right now. Nothing was bought. Try again in a minute.";
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** R39: the family comes only from the link's token, re-checked on every action; a stale link gets nothing. */
const family = teenFromForm;

/** Agent box, pasted link, or search inside her shops: all three end as engine-labelled cards. */
export async function shopAction(_prev: ShopState, form: FormData): Promise<ShopState> {
  const f = await family(form);
  if (!f) return { cards: [], error: "This link doesn't work any more. Ask whoever sent it to you for a new one." };
  const { db, fam } = f;
  const deps = teenDeps(db);
  const now = await deps.now(fam.id);
  const shops = await allowedShops(db, fam.id);
  const week = await teenWeek(db, fam.id, now);
  if (!shops || week.state !== "active") return { cards: [], error: "Your rules aren't in force right now, so nothing can be bought." };

  const mode = form.get("mode");
  if (mode !== "agent" && mode !== "link" && mode !== "search") return { cards: [] };
  const throttled = await shopThrottle(db, fam.id, mode);
  if (throttled) return { cards: [], error: throttled };
  try {
    let items: { cart: NonNullable<ReturnType<typeof cartFor>>; reason?: string }[];
    if (mode === "agent") {
      const request = text(form.get("request"), MAX_REQUEST + 1);
      if (!request || request.length > MAX_REQUEST) return { cards: [], error: `Say what you're after in up to ${MAX_REQUEST} characters.` };
      const model = await agentModel(request);
      if (!model) return { cards: [], error: "The shopping helper isn't switched on here. Search or paste a link instead." };
      const grant = (await getActiveGrant(db, fam.id))!.body;
      const { proposals } = await runAgent({ model, channel3: deps.channel3 }, {
        request, allowedDomains: shops.domains, merchantIdByDomain: shops.merchantIdByDomain, grant, ledger: await ledgerView(db, fam.id, now), now,
      });
      items = proposals.map((p) => ({ cart: p.cart, reason: p.reason }));
    } else if (mode === "link") {
      const url = text(form.get("url"), 500);
      if (!/^https?:\/\/\S+$/i.test(url)) return { cards: [], error: "Paste a whole product link, starting with https://" };
      const r = await deps.channel3.lookup(url, shops.domains);
      if (r.kind === "shop_not_allowed") return { cards: [], error: "That shop isn't on your list." };
      if (r.kind === "not_a_product") return { cards: [], error: "That link doesn't look like a product page." };
      if (r.kind === "unavailable") return { cards: [], error: "That shop doesn't have it in stock right now." };
      const cart = cartFor(r.product, shops.merchantIdByDomain);
      items = cart ? [{ cart }] : [];
    } else {
      const query = text(form.get("query"), 100);
      if (!query) return { cards: [], error: "Type what you're looking for." };
      const found = await deps.channel3.search(query, shops.domains, 6);
      items = found.flatMap((p) => { const cart = cartFor(p, shops.merchantIdByDomain); return cart ? [{ cart }] : []; });
    }
    const cards = (await proposeCarts(deps, fam.id, items)).map((p) => toCard(p, fam.guardianName));
    return cards.length ? { cards } : { cards, note: "Nothing from your shops matched that. Try saying it another way." };
  } catch (err) {
    console.error("shopAction failed", mode, err instanceof Error ? err.message : err);
    return { cards: [], error: SHOP_DOWN };
  }
}

function toCard(p: Proposed, guardian: string): ShopCard {
  const { kind, label } = cardOutcome(p.decision, guardian);
  return { purchaseId: p.purchaseId, title: p.title, shop: p.shop, priceCents: p.priceCents, kind, label, ...(p.reason ? { reason: p.reason } : {}) };
}

const id = (form: FormData) => text(form.get("purchaseId"), 100);

/** Buy a card the engine allowed: re-check, permission slip, PayPal. The week page says honestly what happened. */
export async function buyAction(form: FormData): Promise<void> {
  const f = await family(form);
  if (!f) redirect("/t/gone");
  const purchaseId = id(form);
  let code: string;
  try {
    const r = await buy(teenDeps(f.db), f.fam.id, purchaseId);
    code = r.status === "paid" ? "paid" : r.status === "paying" ? "paying" : r.status === "failed" ? "declined"
      : r.reason === "CART_MISMATCH" || r.reason === "UNAVAILABLE" ? "changed"
      : r.reason === "NO_PAYMENT_METHOD" ? "nopaypal" : r.reason === "PAYPAL_UNAVAILABLE" ? "paypal-off" : "rules";
  } catch (err) {
    if (!(err instanceof TeenError)) {
      console.error("buyAction failed", err instanceof Error ? err.message : err);
      code = "notstarted";
    } else code = "rules";
  }
  redirect(`/t/${f.token}?buy=${code}&p=${encodeURIComponent(purchaseId)}`);
}

/** Ask Amara (mock 4): a request she can approve, or — for a refused cart — a note she'll see. */
export async function askAction(form: FormData): Promise<void> {
  const f = await family(form);
  if (!f) redirect("/t/gone");
  const reason = text(form.get("reason"), 200) || null;
  let sent: string;
  try {
    sent = await askAmara(teenDeps(f.db), f.fam.id, id(form), reason);
  } catch (err) {
    if (!(err instanceof TeenError || err instanceof ApprovalError)) throw err;
    redirect(`/t/${f.token}?asked=closed`);
  }
  redirect(`/t/${f.token}?asked=${sent}`);
}

/** Week ended: "Nudge Amara" (only when her rules have actually ended). */
export async function nudgeAction(form: FormData): Promise<void> {
  const f = await family(form);
  if (!f) redirect("/t/gone");
  const deps = teenDeps(f.db);
  const w = await teenWeek(f.db, f.fam.id, await deps.now(f.fam.id));
  if (w.state === "ended") await nudge(deps, f.fam.id, null);
  redirect(`/t/${f.token}`);
}

/** "Nice" on the level-up moment. */
export async function levelSeenAction(form: FormData): Promise<void> {
  const f = await family(form);
  if (!f) redirect("/t/gone");
  await markLevelSeen({ db: f.db }, f.fam.id);
  redirect(`/t/${f.token}`);
}
