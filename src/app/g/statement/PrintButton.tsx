"use client";

/** The browser's own print dialog (Save as PDF lives there too). */
export function PrintButton() {
  return <button type="button" className="g-btn g-noprint" onClick={() => window.print()}>Print or save as PDF</button>;
}
