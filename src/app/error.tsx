"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "@/ui/tokens.css";
import "@/ui/guardian.css";

/** Final review I5: a calm page instead of Next's default when a page throws. Nothing here moves money. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error("page error", error); }, [error]);
  const path = usePathname() ?? "";
  const teen = path.match(/^\/t\/([^/]+)/);
  const record = teen ? `/t/${teen[1]}` : "/g/activity"; // Zoe's home lists her purchases; Amara's are in Activity
  return (
    <div className="g-app">
      <main className="g-gate">
        <div className="g-card" role="alert" style={{ display: "grid", gap: 14, maxWidth: 420 }}>
          <p>Something went wrong on our side. Nothing was charged by this page. Try again, or open the record.</p>
          <div className="g-btnrow">
            <button type="button" className="g-btn" onClick={() => retry()}>Try again</button>
            <Link className="g-btn g-btn--ghost" href={record}>Open the record</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
