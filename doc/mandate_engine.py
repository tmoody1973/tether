"""
Tether — AP2-native mandate engine (pressure-test prototype)
============================================================

This proves the load-bearing engineering claims of the "graduated allowance
authority" concept BEFORE committing five hackathon weeks to it.

Claims under test
-----------------
1. A guardian's grant can be expressed as an AP2-shaped OPEN mandate carrying
   `constraints`, exactly as `open_payment_mandate.json` / `open_checkout_mandate.json`
   define it (vct, constraints[], cnf, iat, exp).
2. Each spend is a CLOSED mandate (`payment_mandate.json`: vct, transaction_id,
   payee, payment_amount, payment_instrument, execution_date) evaluated
   deterministically against the open mandate.
3. Unknown constraint types FAIL CLOSED — AP2 verification rule: "Any unknown
   Constraints MUST be treated as failing evaluation."
4. Mandates are consumed one-shot with a signed RECEIPT
   (`payment_receipt.json`: status, iss, iat, reference, payment_id) and the
   agent narrows the open mandate's scope afterwards — AP2 action authorization.

Run:  python3 mandate_engine.py
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

# --------------------------------------------------------------------------
# AP2 value types (see AP2 code/sdk/schemas/ap2/types/*.json)
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Amount:
    """AP2 types/amount.json — currency is ISO 4217, amount is minor units."""

    currency: str
    amount: int  # minor units: 27999 == $279.99

    def __str__(self) -> str:
        return f"{self.currency} {self.amount / 100:.2f}"


@dataclass(frozen=True)
class Merchant:
    """AP2 types/merchant.json (id / name / website per the spec's disclosure example)."""

    id: str
    name: str
    website: str = ""


@dataclass(frozen=True)
class Item:
    """AP2 open_checkout_mandate.json $defs/item."""

    id: str
    title: str


# --------------------------------------------------------------------------
# Constraint evaluation
# --------------------------------------------------------------------------


@dataclass
class Violation:
    constraint: str
    reason: str

    def __str__(self) -> str:
        return f"[{self.constraint}] {self.reason}"


@dataclass
class Ledger:
    """Accumulated state the engine needs to evaluate budget/recurrence constraints.

    This is deliberately separate from the mandate: AP2 mandates are stateless
    signed artefacts; the *ledger* is the agent's own bookkeeping.
    """

    spend_by_period: dict[str, int] = field(default_factory=dict)
    occurrences_by_period: dict[str, int] = field(default_factory=dict)
    consumed_receipts: set[str] = field(default_factory=set)

    @staticmethod
    def period_key(frequency: str, when: datetime) -> str:
        f = (frequency or "WEEKLY").upper()
        if f in ("ON_DEMAND", "DAILY"):
            return when.strftime("%Y-%m-%d")
        if f == "WEEKLY":
            iso = when.isocalendar()
            return f"{iso.year}-W{iso.week:02d}"
        if f == "BIWEEKLY":
            iso = when.isocalendar()
            return f"{iso.year}-BW{iso.week // 2:02d}"
        if f == "MONTHLY":
            return when.strftime("%Y-%m")
        if f == "QUARTERLY":
            return f"{when.year}-Q{(when.month - 1) // 3 + 1}"
        if f == "ANNUALLY":
            return when.strftime("%Y")
        return when.strftime("%Y-%m-%d")


def evaluate(
    constraint: dict[str, Any],
    closed: dict[str, Any],
    ledger: Ledger,
    frequency: str,
) -> Optional[Violation]:
    """Evaluate one AP2 constraint against one closed mandate.

    Returns None when satisfied, or a Violation. Unknown constraint types
    return a Violation by design (AP2: fail closed).
    """
    ctype = constraint.get("type")

    # ---- payment.amount_range -------------------------------------------------
    if ctype == "payment.amount_range":
        amount = closed["payment_amount"]
        if amount.currency != constraint["currency"]:
            return Violation(ctype, f"currency {amount.currency} != {constraint['currency']}")
        if amount.amount > constraint["max"]:
            return Violation(
                ctype,
                f"amount {amount} exceeds max {constraint['currency']} "
                f"{constraint['max'] / 100:.2f}",
            )
        if "min" in constraint and amount.amount < constraint["min"]:
            return Violation(ctype, f"amount {amount} below min")
        return None

    # ---- payment.budget (cumulative, evaluated with agent_recurrence) ---------
    if ctype == "payment.budget":
        amount = closed["payment_amount"]
        if amount.currency != constraint["currency"]:
            return Violation(ctype, f"budget currency {constraint['currency']} mismatch")
        key = Ledger.period_key(frequency, closed["_now"])
        spent = ledger.spend_by_period.get(key, 0)
        if spent + amount.amount > constraint["max"]:
            remaining = max(constraint["max"] - spent, 0)
            return Violation(
                ctype,
                f"budget exhausted for {key}: spent "
                f"{constraint['currency']} {spent / 100:.2f} of "
                f"{constraint['max'] / 100:.2f}, only "
                f"{constraint['currency']} {remaining / 100:.2f} left, "
                f"this spend is {amount}",
            )
        return None

    # ---- payment.allowed_payees ----------------------------------------------
    if ctype == "payment.allowed_payees":
        allowed_ids = {m["id"] for m in constraint.get("allowed", [])}
        if closed["payee"].id not in allowed_ids:
            return Violation(
                ctype,
                f"payee '{closed['payee'].name}' ({closed['payee'].id}) is not on the "
                f"allowed list {sorted(allowed_ids)}",
            )
        return None

    # ---- payment.execution_date ----------------------------------------------
    if ctype == "payment.execution_date":
        now = closed["_now"]
        nb, na = constraint.get("not_before"), constraint.get("not_after")
        if nb and now < datetime.fromisoformat(nb):
            return Violation(ctype, f"too early: {now.isoformat()} < {nb}")
        if na and now > datetime.fromisoformat(na):
            return Violation(ctype, f"expired: {now.isoformat()} > {na}")
        return None

    # ---- payment.agent_recurrence --------------------------------------------
    if ctype == "payment.agent_recurrence":
        freq = constraint["frequency"]
        if freq != frequency:
            return Violation(ctype, f"recurrence mismatch {freq} != {frequency}")
        max_occ = constraint.get("max_occurrences")
        if max_occ is not None:
            key = Ledger.period_key(freq, closed["_now"])
            used = ledger.occurrences_by_period.get(key, 0)
            if used + 1 > max_occ:
                return Violation(
                    ctype, f"recurrence exhausted for {key}: {used}/{max_occ} used"
                )
        return None

    # ---- checkout.allowed_merchants ------------------------------------------
    if ctype == "checkout.allowed_merchants":
        allowed_ids = {m["id"] for m in constraint.get("allowed", [])}
        if closed["payee"].id not in allowed_ids:
            return Violation(ctype, f"merchant '{closed['payee'].id}' not allowed at checkout")
        return None

    # ---- checkout.line_items -------------------------------------------------
    if ctype == "checkout.line_items":
        cart = {i["id"]: i.get("quantity", 1) for i in closed.get("_items", [])}
        for req in constraint.get("items", []):
            acceptable = {i["id"] for i in req.get("acceptable_items", [])}
            need = req.get("quantity", 1)
            got = sum(q for i, q in cart.items() if i in acceptable)
            if got < need:
                return Violation(
                    ctype,
                    f"line item requirement '{req.get('id')}' unsatisfied: "
                    f"need {need} from {sorted(acceptable)}, cart has {got}",
                )
        return None

    # ---- payment.reference (binding to an open checkout mandate) --------------
    if ctype == "payment.reference":
        want = constraint["conditional_transaction_id"]
        if closed.get("_checkout_digest") != want:
            return Violation(ctype, "payment not bound to the referenced checkout mandate")
        return None

    # ---- AP2 rule: fail closed ------------------------------------------------
    return Violation(str(ctype), "UNKNOWN CONSTRAINT TYPE — failing closed (AP2 rule 3)")


# --------------------------------------------------------------------------
# The engine
# --------------------------------------------------------------------------


@dataclass
class Grant:
    """An OPEN mandate: the guardian's grant of authority. AP2-shaped."""

    vct: str
    constraints: list[dict[str, Any]]
    cnf: dict[str, Any]          # agent proof-of-possession key
    iat: int
    exp: int
    tier: str = "L1"
    child: str = ""
    guardian: str = ""

    def digest(self) -> str:
        body = json.dumps(
            {
                "vct": self.vct,
                "constraints": self.constraints,
                "cnf": self.cnf,
                "iat": self.iat,
                "exp": self.exp,
            },
            sort_keys=True,
        ).encode()
        return hashlib.sha256(body).hexdigest()[:32]


@dataclass
class Receipt:
    """AP2 payment_receipt.json (status, iss, iat, reference, payment_id)."""

    status: str
    iss: str
    iat: int
    reference: str
    payment_id: Optional[str] = None
    error: Optional[str] = None
    error_description: Optional[str] = None

    def to_ap2(self) -> dict[str, Any]:
        out = {
            "vct": "mandate.payment.receipt.1",
            "status": self.status,
            "iss": self.iss,
            "iat": self.iat,
            "reference": self.reference,
        }
        if self.payment_id:
            out["payment_id"] = self.payment_id
        if self.error:
            out["error"] = self.error
        if self.error_description:
            out["error_description"] = self.error_description
        return out


class MandateEngine:
    """Evaluates closed spends against an open grant, then moves money."""

    def __init__(self, grant: Grant, ledger: Ledger, payer: Callable[[dict], str]):
        self.grant = grant
        self.ledger = ledger
        self._pay = payer  # the PayPal adapter: vault_id capture, returns payment_id

    # -- helpers ---------------------------------------------------------------

    @property
    def frequency(self) -> str:
        for c in self.grant.constraints:
            if c.get("type") == "payment.agent_recurrence":
                return c["frequency"]
        return "WEEKLY"

    def remaining_budget(self, now: datetime) -> Optional[Amount]:
        for c in self.grant.constraints:
            if c.get("type") == "payment.budget":
                key = Ledger.period_key(self.frequency, now)
                spent = self.ledger.spend_by_period.get(key, 0)
                return Amount(c["currency"], max(c["max"] - spent, 0))
        return None

    # -- the core call ---------------------------------------------------------

    def attempt_spend(
        self,
        *,
        payee: Merchant,
        amount: Amount,
        now: datetime,
        items: Optional[list[dict]] = None,
        instrument: str = "paypal_wallet",
        record_id: str = "rec_1",
        dry_run: bool = False,
    ) -> tuple[bool, Receipt, list[Violation]]:
        """Evaluate a proposed spend. Returns (allowed, receipt, violations)."""
        if now.timestamp() > self.grant.exp:
            v = [Violation("mandate.exp", "open mandate has expired")]
            return False, self._reject("runtime.MANDATE_EXPIRED", v), v

        closed = {
            "vct": "mandate.payment.1",
            "transaction_id": record_id,
            "payee": payee,
            "payment_amount": amount,
            "payment_instrument": instrument,
            "execution_date": now.isoformat(),
            "_now": now,
            "_items": items or [],
            "_checkout_digest": self.grant.digest(),
        }

        violations: list[Violation] = []
        for c in self.grant.constraints:
            v = evaluate(c, closed, self.ledger, self.frequency)
            if v:
                violations.append(v)

        if violations:
            return False, self._reject("mandate.CONSTRAINT_VIOLATION", violations, record_id), violations

        # Replay guard: a consumed receipt cannot authorise a second spend.
        ref = self.grant.digest()
        if ref in self.ledger.consumed_receipts:
            v = [Violation("mandate.one_shot", f"grant {ref} already consumed")]
            return False, self._reject("mandate.ALREADY_CONSUMED", v, record_id), v

        # Two-phase protocol: DECIDE here, and only SETTLE on request.
        # The semantic layer (gate 2) must run between the two phases, so a
        # model can never be handed a request that has already moved money.
        if dry_run:
            return (
                True,
                Receipt(
                    status="pending",
                    iss="tether.agent",
                    iat=int(now.timestamp()),
                    reference=ref,
                ),
                [],
            )

        payment_id = self._pay(
            {
                "intent": "CAPTURE",
                "payment_source": {"paypal": {"vault_id": "VAULT_TOKEN_FROM_GRANT"}},
                "purchase_units": [
                    {
                        "amount": {
                            "currency_code": amount.currency,
                            "value": f"{amount.amount / 100:.2f}",
                        },
                        "payee": {"merchant_id": payee.id},
                    }
                ],
            }
        )

        # Commit ledger state, mirroring AP2's "narrow the open mandate" step.
        key = Ledger.period_key(self.frequency, now)
        self.ledger.spend_by_period[key] = self.ledger.spend_by_period.get(key, 0) + amount.amount
        self.ledger.occurrences_by_period[key] = self.ledger.occurrences_by_period.get(key, 0) + 1
        self.ledger.consumed_receipts.add(ref)

        receipt = Receipt(
            status="success",
            iss="tether.agent",
            iat=int(now.timestamp()),
            reference=ref,
            payment_id=payment_id,
        )
        return True, receipt, []

    def _reject(self, code: str, violations: list[Violation], record_id: str = "") -> Receipt:
        return Receipt(
            status="error",
            iss="tether.agent",
            iat=int(datetime.now(timezone.utc).timestamp()),
            reference=self.grant.digest(),
            error=code,
            error_description="; ".join(str(v) for v in violations),
        )


# --------------------------------------------------------------------------
# Graduated authority — the actual product idea
# --------------------------------------------------------------------------


@dataclass
class Tier:
    name: str
    weekly_budget: int
    requires_approval_online: bool
    allowed_payees: list[str]


TIERS = {
    "L1": Tier("L1", 2000, True, ["m_corner_store", "m_transit"]),
    "L2": Tier("L2", 3000, False, ["m_corner_store", "m_transit", "m_bookshop"]),
    "L3": Tier("L3", 5000, False, ["m_corner_store", "m_transit", "m_bookshop", "m_sneakers"]),
}


def grant_for(tier: str, now: datetime, guardian: str, child: str, days: int = 7) -> Grant:
    t = TIERS[tier]
    return Grant(
        vct="mandate.payment.open.1",
        constraints=[
            {"type": "payment.amount_range", "currency": "USD", "max": t.weekly_budget, "min": 100},
            {"type": "payment.budget", "currency": "USD", "max": t.weekly_budget},
            {"type": "payment.agent_recurrence", "frequency": "WEEKLY", "max_occurrences": 10},
            {"type": "payment.allowed_payees",
             "allowed": [{"id": p, "name": p} for p in t.allowed_payees]},
            {"type": "payment.execution_date",
             "not_before": now.isoformat(),
             "not_after": (now + timedelta(days=days)).isoformat()},
        ],
        cnf={"jwk": {"kty": "EC", "crv": "P-256", "x": "...", "y": "..."}},
        iat=int(now.timestamp()),
        exp=int((now + timedelta(days=days)).timestamp()),
        tier=tier,
        guardian=guardian,
        child=child,
    )


def compliance_history(spent_ratio: float, savings_ratio: float, breaches: int) -> dict:
    """Promotion is earned, not granted. This is the pedagogy, in code."""
    if breaches >= 2:
        return {"action": "DEMOTE", "reason": f"{breaches} breaches in the period"}
    if spent_ratio <= 0.9 and savings_ratio >= 0.3:
        return {"action": "PROMOTE", "reason": "stayed in bounds and saved 30%+ of allowance"}
    return {"action": "HOLD", "reason": "insufficient evidence to change authority"}


# --------------------------------------------------------------------------
# Demo / assertions
# --------------------------------------------------------------------------

if __name__ == "__main__":
    NOW = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)
    captured: list[dict] = []

    def fake_paypal(req: dict) -> str:
        captured.append(req)
        return f"CAP-{len(captured):04d}"

    results: list[tuple[str, bool]] = []

    def check(name: str, got: bool, want: bool) -> None:
        ok = got == want
        results.append((name, ok))
        print(f"{'PASS' if ok else 'FAIL'}  {name}")

    # -- scenario 1: in-bounds spend is authorised and money moves --------------
    g = grant_for("L1", NOW, "guardian:amara", "child:zoe")
    eng = MandateEngine(g, Ledger(), fake_paypal)
    ok, rcpt, vs = eng.attempt_spend(
        payee=Merchant("m_corner_store", "Corner Store"),
        amount=Amount("USD", 1200), now=NOW, record_id="txn_1",
    )
    check("in-bounds spend authorised", ok, True)
    check("receipt is AP2-shaped success with a payment_id",
          rcpt.status == "success" and rcpt.payment_id == "CAP-0001", True)
    check("PayPal call used vault_id capture (agent-side, no payer present)",
          captured[0]["payment_source"]["paypal"]["vault_id"] == "VAULT_TOKEN_FROM_GRANT", True)

    # -- scenario 2: budget ceiling -------------------------------------------
    ok, rcpt, vs = eng.attempt_spend(
        payee=Merchant("m_corner_store", "Corner Store"),
        amount=Amount("USD", 1500), now=NOW, record_id="txn_2",
    )
    check("second spend breaches the weekly budget", ok, False)
    check("violation names the budget constraint",
          "payment.budget" in str(vs[0]), True)
    print(f"        -> {rcpt.error}: {rcpt.error_description}")

    # -- scenario 3: payee the guardian never authorised -----------------------
    ok, rcpt, vs = eng.attempt_spend(
        payee=Merchant("m_sketchy", "Totally Legit Deals"),
        amount=Amount("USD", 200), now=NOW, record_id="txn_3",
    )
    check("unknown payee blocked", ok, False)
    check("violation names the payee constraint", "payment.allowed_payees" in str(vs[0]), True)
    print(f"        -> {rcpt.error_description}")

    # -- scenario 4: fail closed on an unknown constraint ---------------------
    g2 = grant_for("L1", NOW, "guardian:amara", "child:zoe")
    g2.constraints.append({"type": "payment.something_we_do_not_implement", "x": 1})
    eng2 = MandateEngine(g2, Ledger(), fake_paypal)
    ok, rcpt, vs = eng2.attempt_spend(
        payee=Merchant("m_corner_store", "Corner Store"),
        amount=Amount("USD", 100), now=NOW, record_id="txn_4",
    )
    check("unknown constraint fails closed (AP2 rule 3)", ok, False)
    check("failure is attributed to the unknown type",
          "UNKNOWN CONSTRAINT TYPE" in str(vs[-1]), True)

    # -- scenario 5: one-shot consumption ------------------------------------
    g3 = grant_for("L1", NOW, "guardian:amara", "child:zoe")
    eng3 = MandateEngine(g3, Ledger(), fake_paypal)
    ok1, _, _ = eng3.attempt_spend(payee=Merchant("m_transit", "Transit"),
                                   amount=Amount("USD", 300), now=NOW, record_id="t1")
    ok2, rcpt2, vs2 = eng3.attempt_spend(payee=Merchant("m_transit", "Transit"),
                                         amount=Amount("USD", 300), now=NOW, record_id="t2")
    check("a replayed grant cannot authorise a second charge", ok1 and not ok2, True)

    # -- scenario 6: expiry ---------------------------------------------------
    g4 = grant_for("L1", NOW - timedelta(days=30), "guardian:amara", "child:zoe")
    eng4 = MandateEngine(g4, Ledger(), fake_paypal)
    ok, rcpt, vs = eng4.attempt_spend(payee=Merchant("m_transit", "Transit"),
                                      amount=Amount("USD", 300), now=NOW, record_id="t3")
    check("expired grant is refused", ok, False)

    # -- scenario 7: the pedagogy — authority scales -------------------------
    check("saving 40% of allowance earns promotion",
          compliance_history(0.85, 0.40, 0)["action"] == "PROMOTE", True)
    check("two breaches force demotion",
          compliance_history(0.99, 0.0, 2)["action"] == "DEMOTE", True)
    check("L3 unlocks a new merchant class and a bigger budget",
          TIERS["L3"].weekly_budget > TIERS["L1"].weekly_budget
          and "m_sneakers" in TIERS["L3"].allowed_payees, True)

    # -- scenario 8: a promoted grant actually permits the new spend ---------
    g5 = grant_for("L3", NOW, "guardian:amara", "child:zoe")
    eng5 = MandateEngine(g5, Ledger(), fake_paypal)
    ok, rcpt, vs = eng5.attempt_spend(
        payee=Merchant("m_sneakers", "Sneaker Shop"),
        amount=Amount("USD", 4500), now=NOW, record_id="t4",
    )
    check("promoted authority permits a spend the old tier refused", ok, True)

    # -- scenario 9: exact AP2 receipt shape --------------------------------
    print("\nSample AP2 payment receipt as emitted:")
    print(json.dumps(rcpt.to_ap2(), indent=2))

    passed = sum(1 for _, ok in results if ok)
    print(f"\n{passed}/{len(results)} checks passed")
    raise SystemExit(0 if passed == len(results) else 1)
