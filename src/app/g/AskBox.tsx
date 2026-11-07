"use client";

import { useState } from "react";
import type { AnswerCard } from "@/ai/answerCards";
import { AnswerCards } from "./AnswerCards";

const EXAMPLES = [
  "What did Zoe buy this month?",
  "Which purchases did I approve myself?",
  "Do Tether's receipts match PayPal?",
  "Is Zoe on track for her next level?",
];
const CANT_SEE_NOW = "I can't see that right now.";

/** D20: Amara's read-only month assistant. One box, not a chat: the answer first, then cards built from the real data (decision 019). */
export function AskBox() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [cards, setCards] = useState<AnswerCard[]>([]);
  const [pending, setPending] = useState(false);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || pending) return;
    setQuestion(text);
    setPending(true);
    setAnswer(null);
    setCards([]);
    try {
      const res = await fetch("/api/g/ask", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text }),
      });
      const body = (await res.json().catch(() => null)) as { answer?: unknown; cards?: unknown } | null;
      const ok = res.ok && typeof body?.answer === "string";
      setAnswer(ok ? (body.answer as string) : CANT_SEE_NOW);
      setCards(ok && Array.isArray(body.cards) ? (body.cards as AnswerCard[]) : []); // AnswerCards ignores unknown kinds
    } catch {
      setAnswer(CANT_SEE_NOW);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="g-ask" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
      <div className="g-ask__examples" role="group" aria-label="Example questions">
        {EXAMPLES.map((q) => <button key={q} type="button" onClick={() => void ask(q)} disabled={pending}>{q}</button>)}
      </div>
      <label className="g-def__k" htmlFor="ask-q">Your question</label>
      <div className="g-ask__row">
        <input id="ask-q" className="g-input" value={question} maxLength={500}
          onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about this month" />
        <button type="submit" className="g-btn" disabled={pending || !question.trim()}>{pending ? "Looking…" : "Ask"}</button>
      </div>
      <div aria-live="polite">
        {pending && <p className="g-note">Looking at this month&apos;s receipts and PayPal…</p>}
        {answer && <p className="g-ask__answer">{answer}</p>}
        {answer && <AnswerCards cards={cards} />}
      </div>
      <p className="g-note">Read-only: it can look at receipts, her check-in and PayPal&apos;s list, and can&apos;t move money.</p>
    </form>
  );
}
