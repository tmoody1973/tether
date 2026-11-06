"use client";

import { useFormStatus } from "react-dom";

/** A submit button that disables itself while its form's server action runs. */
export function PendingButton({ label, pendingLabel, className, name, value }: {
  label: string; pendingLabel: string; className: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} name={name} value={value} disabled={pending}>{pending ? pendingLabel : label}</button>;
}
