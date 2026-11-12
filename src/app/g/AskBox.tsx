"use client";

import { useState } from "react";
import { useFamilyId } from "@/ui/FamilyField";
import type { AnswerCard } from "@/ai/answerCards";
import { AnswerCards } from "./AnswerCards";

/** The example questions, in this family's teen's name (a new family's teen is not Zoe). */
export function askExamples(teen: string): string[] {
  return [
    `What did ${teen} buy this month?`,
    "Which purchases did I approve myself?",
    "Do Tether's receipts match PayPal?",
    `Is ${teen} on track for the next level?`,
    `How are ${teen}'s investments doing?`,
  ];
}
const CANT_SEE_NOW = "I can't see that right now.";

/** D20: Amara's read-only month assistant. One box, not a chat: the answer first, then cards built from the real data (decision 019). */
export function AskBox({ teen }: { teen: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [cards, setCards] = useState<AnswerCard[]>([]);
  const [pending, setPending] = useState(false);
  const familyId = useFamilyId(); // the teen this page was drawn for: the server refuses a question for another

  async function ask(q: string) {
    const text = q.trim();
    if (!text || pending) return;
    setQuestion(text);
    setPending(true);
    setAnswer(null);
    setCards([]);
    try {
      const res = await fetch("/api/g/ask", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text, familyId }),
      });
      const body = (await res.json().catch(() => null)) as { answer?: unknown; cards?: unknown } | null;
      const ok = (res.ok || res.status === 409) && typeof body?.answer === "string"; // 409: switched teens, said plainly
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
        {askExamples(teen).map((q) => <button key={q} type="button" onClick={() => void ask(q)} disabled={pending}>{q}</button>)}
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
      <p className="g-note">Read-only: it can look at receipts, her check-in, PayPal&apos;s list, her investments and the news, and can&apos;t move money.</p>
    </form>
  );
}
