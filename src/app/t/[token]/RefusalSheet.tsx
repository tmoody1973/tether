import Link from "next/link";
import { explainRefusal } from "@/ai/explain";
import { getDb } from "@/db/client";
import { teenPurchase, type TeenWeek } from "@/flows/teen";
import { formatCents } from "@/ui/grantWords";
import { Chip } from "@/ui/teen";
import { daysToReset, levelProgress, sheetNumbers, waitWords } from "@/ui/teenWords";
import { explainLlm } from "../teenDeps";

/**
 * Mock 2, the screen the idea rests on: amber, the plain sentence (model, or explain.ts's template), the arithmetic,
 * then exactly two ways forward. Sequential, not a grid. Only for a refused cart of this family.
 */
export async function RefusalSheet({ token, familyId, purchaseId, w }: { token: string; familyId: string; purchaseId: string; w: TeenWeek }) {
  const p = await teenPurchase(await getDb(), familyId, purchaseId);
  if (!p || p.decision.outcome !== "REFUSE") return null;
  const g = w.guardianName;
  const budget = p.decision.reasons.some((r) => r.constraint === "payment.budget");
  const { sentence, routes } = await explainRefusal(explainLlm(), p.decision, { teenName: w.teenName, guardianName: g, goalTitle: w.goal?.title });
  const wait = budget ? waitWords(daysToReset(w.now, w.endsAt)) : routes[1];
  return (
    <div className="t-scrim">
      <section className="t-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
        <div className="t-grabber" aria-hidden />
        <Chip kind={budget ? "over" : "refused"} label="Not this time" />
        <div>
          <h2 className="t-h2" id="sheet-h" style={{ fontSize: 21 }}>{budget ? "That one doesn't fit this week." : "That one doesn't fit your rules."}</h2>
          <p className="t-muted" style={{ marginTop: 5 }}><span className="money">{formatCents(p.amountCents)}</span> · {p.shop}</p>
        </div>
        <div className="t-card t-card--quiet">
          <p className="t-small">{sentence}</p>
          {/* The budget sentence already says what's left; say the rest of the arithmetic once. */}
          <p className="t-small" style={{ marginTop: 6 }}>{sheetNumbers(w.spentCents, w.weeklyCents, !budget)}</p>
        </div>
        <div className="t-routes">
          {/* autoFocus: the sheet takes focus when it opens */}
          <Link className="t-btn t-btn--primary" href={`/t/${token}/ask/${p.id}`} autoFocus>Ask {g}</Link>
          <Link className="t-btn t-btn--ghost" href={`/t/${token}`}>{wait}</Link>
        </div>
        {w.level && <div className="t-hint">{levelProgress(w.streak, w.level)}</div>}
      </section>
    </div>
  );
}
