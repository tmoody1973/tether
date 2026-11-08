import Link from "next/link";
import { retirementWords } from "@/ui/grantWords";

/**
 * Self-started families are retired 7 days after they were made (decision 026). Shown wherever Amara might want her
 * record first; renders nothing for other families (`removesAt` null). `statementLink` adds a link to the statement.
 */
export function RetirementNotice({ removesAt, statementLink = false }: { removesAt: Date | null; statementLink?: boolean }) {
  if (!removesAt) return null;
  return (
    <p className="g-flash g-flash--warn" role="note">
      {retirementWords(removesAt)}
      {statementLink && <> <Link className="g-textlink" href="/g/statement">Open the statement</Link></>}
    </p>
  );
}
