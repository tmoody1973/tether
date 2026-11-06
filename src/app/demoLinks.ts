/** The shared demo family's two ways in, or null when the demo keys aren't configured (the landing then shows no buttons). */
export function demoLinks(env: NodeJS.ProcessEnv = process.env): { amara: string; zoe: string } | null {
  const key = env.DEMO_GUARDIAN_KEY?.trim();
  const token = env.DEMO_TEEN_TOKEN?.trim();
  if (!key || !token) return null;
  // Zoe's door is /t/enter: it freshens a stale demo first (R44), then sends her to her week.
  return { amara: `/g/enter/${encodeURIComponent(key)}`, zoe: "/t/enter" };
}
