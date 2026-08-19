/**
 * The single place the application talks to the model.
 *
 * Everything is a validated structured object — no free-form markdown is ever
 * parsed into domain state. Streaming is used throughout because synthesis and
 * theming responses are long enough to hit non-streaming HTTP timeouts.
 *
 * Server-side refusal fallbacks are enabled (`fallbacks: "default"`) so a
 * classifier refusal on one transcript degrades to a fallback model rather than
 * failing a researcher's whole batch.
 */

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import {
  getAnthropicClient,
  RESEARCH_MODEL,
  STAGE_EFFORT,
  STAGE_MAX_TOKENS,
  type PipelineStage,
} from "./client";

export class LlmRefusalError extends Error {
  constructor(
    public readonly category: string | null,
    public readonly explanation: string | null,
  ) {
    super(
      `The model declined this request${category ? ` (${category})` : ""}. ${explanation ?? ""}`.trim(),
    );
    this.name = "LlmRefusalError";
  }
}

export class LlmValidationError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
    public readonly issues: unknown,
  ) {
    super(message);
    this.name = "LlmValidationError";
  }
}

export interface StructuredRequest<S extends z.ZodType> {
  stage: PipelineStage;
  schema: S;
  /**
   * Stable system prompt. Kept first and byte-identical across calls in a stage
   * so the prompt cache actually hits (see docs/llm-pipeline.md).
   */
  system: string;
  /** Volatile content: the frame and the material. Always last. */
  userContent: string;
  /** Optional per-call override. */
  maxTokens?: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  model: string;
}

export async function generateStructured<S extends z.ZodType>(
  request: StructuredRequest<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const client = getAnthropicClient();

  const stream = client.beta.messages.stream({
    model: RESEARCH_MODEL,
    max_tokens: request.maxTokens ?? STAGE_MAX_TOKENS[request.stage],
    // Stable prefix first, cached; the volatile transcript goes in `messages`.
    system: [
      {
        type: "text",
        text: request.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: request.userContent }],
    thinking: { type: "adaptive" },
    output_config: {
      effort: STAGE_EFFORT[request.stage],
      format: zodOutputFormat(request.schema),
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new LlmRefusalError(
      message.stop_details?.category ?? null,
      message.stop_details?.explanation ?? null,
    );
  }

  const text = message.content
    .filter((block): block is { type: "text"; text: string } & typeof block => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (message.stop_reason === "max_tokens") {
    throw new LlmValidationError(
      "The model hit the output limit before completing the structured response. Reduce the amount of material analysed in one pass.",
      text,
      null,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (error) {
    throw new LlmValidationError(
      `Model response was not valid JSON: ${(error as Error).message}`,
      text,
      null,
    );
  }

  const result = request.schema.safeParse(parsedJson);
  if (!result.success) {
    throw new LlmValidationError(
      "Model response did not match the required schema.",
      text,
      result.error.issues,
    );
  }

  return {
    data: result.data as z.infer<S>,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
    },
    model: message.model,
  };
}
