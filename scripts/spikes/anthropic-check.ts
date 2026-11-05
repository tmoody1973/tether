import { anthropicLlm } from "../../src/ai/llm";
async function main() {
try {
  const out = await anthropicLlm(process.env.ANTHROPIC_API_KEY!, "claude-haiku-5-5").json({
    system: "Reply with JSON only.", user: 'Return {"ok": true}',
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, maxTokens: 50,
  });
  console.log("OK", JSON.stringify(out));
} catch (e) { console.log("ERROR", (e as Error).message.slice(0, 300)); }
}
main();
