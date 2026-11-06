import { vi } from "vitest";
import type { Deps } from "@/flows/purchase";
import { pushRequest, type Notify } from "@/flows/notify";

process.env.TETHER_SIGNING_KEY ??= "test-key"; // the push alias is keyed by it

/** A notify dep that records what each ask scheduled, instead of running it after the response. */
export function recordNotify() {
  const calls: { familyId: string; approvalId: string }[] = [];
  const notify: Notify = (familyId, approvalId) => { calls.push({ familyId, approvalId }); };
  return { notify, calls };
}

/** Runs the scheduled push against a fake OneSignal and returns the JSON body it would have POSTed (null: nothing sent). */
export async function pushedBody(deps: Pick<Deps, "db" | "now">, familyId: string, approvalId: string): Promise<Record<string, unknown> | null> {
  const f = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response(JSON.stringify({ id: "n1" }), { status: 200 }));
  await pushRequest(deps, familyId, approvalId, { cfg: { appId: "app", restKey: "k" }, baseUrl: "https://tether.example", fetchImpl: f as unknown as typeof fetch });
  return f.mock.calls.length ? JSON.parse(String(f.mock.calls[0][1]?.body)) : null;
}
