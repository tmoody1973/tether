"use client";

import { createContext, useContext, type ReactNode } from "react";

// Decision 028 (review HIGH-1): which teen this page was drawn for, so every form can say so and the server can refuse
// a form left open on a teen she has since switched away from in another tab (refuseStaleForm).
const Family = createContext<string | null>(null);

export function FamilyProvider({ id, children }: { id: string; children: ReactNode }) {
  return <Family.Provider value={id}>{children}</Family.Provider>;
}

export const useFamilyId = () => useContext(Family);

/** Goes inside every guardian form. */
export function FamilyField() {
  const id = useFamilyId();
  return id ? <input type="hidden" name="familyId" value={id} /> : null;
}
