import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getFamily, getLatestGrant, getVault } from "@/db/repo";
import { removalDate } from "@/flows/start";
import { ledgerView, weekKey } from "@/ledger/ledger";
import { pendingApprovals, type PendingApproval } from "@/flows/approvals";
import type { Level } from "@/engine/ladder";

export type NeedsYou =
  | { kind: "rules"; nudged?: true } // no grant in force: Zoe can't spend until Amara signs (nudged: she asked for it)
  | { kind: "message"; note: string } // this week Zoe asked about something her rules can't pay for
  | { kind: "paypal"; removedByRevoke?: true } // no saved PayPal (on the demo family: it was deleted at PayPal)
  | { kind: "approval"; id: string; subject: PendingApproval["subject"]; amountCents?: number; shop?: string; symbol?: string; note: string | null };

export interface GuardianHome {
  guardianName: string; teenName: string; teenToken: string;
  level: Level | null; grantVersion: number | null; weeklyCents: number; expiresAt: Date | null; grantEnded: boolean;
  spentThisWeekCents: number; savingsCents: number; goal: { title: string; targetCents: number } | null;
  paypalSaved: boolean; needsYou: NeedsYou[]; now: Date;
  /** The shared demo family (it carries a seed snapshot): the demo box offers Reset. */
  isDemo: boolean;
  /** Self-started families (decision 026): the first-run checklist, shown instead of "Needs you" while a step is open. */
  firstRun: FirstRunStep[] | null;
  /** Self-started families are retired 7 days (real time) after they were made. */
  removesAt: Date | null;
}

export type FirstRunStep = { key: "paypal" | "rules" | "link"; done: boolean };

/** Save your PayPal, sign the first rules, send the teen the link: in that order. */
export function firstRunSteps(s: { paypalSaved: boolean; rulesSigned: boolean; linkSent: boolean }): FirstRunStep[] {
  return [{ key: "paypal", done: s.paypalSaved }, { key: "rules", done: s.rulesSigned }, { key: "link", done: s.linkSent }];
}

/** Read model for Amara's home: signals, not a feed. `now` is the family's demo-clock time. */
export async function guardianHome(db: Db, familyId: string, now: Date): Promise<GuardianHome> {
  const fam = await getFamily(db, familyId);
  if (!fam) throw new Error(`unknown family ${familyId}`);
  const [grant, vault, ledger, [goal], pending, latest] = await Promise.all([
    getActiveGrant(db, familyId), getVault(db, familyId), ledgerView(db, familyId, now),
    db.select().from(t.goals).where(eq(t.goals.familyId, familyId)), pendingApprovals(db, familyId, now),
    getLatestGrant(db, familyId),
  ]);
  const selfStarted = fam.paypalSub !== null;
  const grantEnded = !grant || grant.expiresAt <= now;
  const approvals = await Promise.all(pending.map((a) => describe(db, a)));
  return {
    guardianName: fam.guardianName, teenName: fam.teenName, teenToken: fam.teenToken,
    level: grant ? (grant.level as Level) : null, grantVersion: grant?.version ?? null,
    weeklyCents: grant?.body.weeklyCents ?? 0, expiresAt: grant?.expiresAt ?? null, grantEnded,
    spentThisWeekCents: ledger.spentThisWeekCents, savingsCents: ledger.savingsCents,
    goal: goal ? { title: goal.title, targetCents: goal.targetCents } : null,
    paypalSaved: vault !== null,
    needsYou: [
      ...(grantEnded ? [nudgedToRenew(fam, grant?.expiresAt ?? null) ? { kind: "rules", nudged: true } as const : { kind: "rules" } as const] : []),
      ...(fam.teenNudgeAt && fam.teenNudgeNote && weekKey(fam.teenNudgeAt) === weekKey(now)
        ? [{ kind: "message", note: fam.teenNudgeNote } as const] : []),
      ...(vault ? [] : [fam.demo ? { kind: "paypal", removedByRevoke: true } as const : { kind: "paypal" } as const]),
      ...approvals,
    ],
    now, isDemo: fam.demo !== null,
    firstRun: selfStarted ? firstRunSteps({ paypalSaved: vault !== null, rulesSigned: latest !== null, linkSent: fam.teenLinkSentAt !== null }) : null,
    removesAt: selfStarted ? removalDate(fam.createdAt) : null,
  };
}

/** Zoe's "Nudge Amara" counts only if she sent it after these rules ended. */
const nudgedToRenew = (fam: { teenNudgeAt: Date | null; teenNudgeNote: string | null }, endedAt: Date | null) =>
  fam.teenNudgeAt !== null && fam.teenNudgeNote === null && (endedAt === null || fam.teenNudgeAt >= endedAt);

async function describe(db: Db, a: PendingApproval): Promise<NeedsYou> {
  const base = { kind: "approval" as const, id: a.id, subject: a.subject, note: a.note };
  if (a.subject === "purchase" && a.cart) {
    const [m] = await db.select({ name: t.merchants.name }).from(t.merchants).where(eq(t.merchants.id, a.cart.merchantId));
    return { ...base, amountCents: a.cart.totalCents, shop: m?.name ?? "a shop" };
  }
  if (a.subject === "shop") return { ...base, shop: a.shopDomain };
  if (a.subject === "investment") {
    const [inv] = await db.select().from(t.investments).where(eq(t.investments.id, a.subjectId));
    return { ...base, symbol: inv?.symbol, amountCents: inv?.amountCents };
  }
  const [prop] = await db.select().from(t.fundProposals).where(eq(t.fundProposals.id, a.subjectId));
  return { ...base, symbol: prop?.symbol };
}
