import { generateObject, jsonSchema } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

export interface Llm {
  /** Model id, when known (used for audit fields). */
  readonly model?: string;
  json<T>(args: { system: string; user: string; schema: object; maxTokens: number }): Promise<T>;
}

export function anthropicLlm(apiKey: string, model = "claude-haiku-5-5"): Llm {
  const provider = createAnthropic({ apiKey });
  return {
    model,
    async json<T>({ system, user, schema, maxTokens }: Parameters<Llm["json"]>[0]) {
      const { object } = await generateObject({
        model: provider(model),
        system,
        prompt: user,
        schema: jsonSchema<T>(schema as Parameters<typeof jsonSchema>[0]),
        maxOutputTokens: maxTokens,
      });
      return object as T;
    },
  };
}
