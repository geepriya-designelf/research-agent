import Anthropic from "@anthropic-ai/sdk";

/**
 * Model + effort configuration for the research pipeline.
 *
 * Synthesis and theming are the two passes where reasoning quality directly
 * determines whether the output is trustworthy, so they run at high effort.
 * Metadata extraction is a bounded copying task and runs low.
 */
export const RESEARCH_MODEL = "claude-opus-5";

export type PipelineStage = "metadata" | "synthesis" | "theming" | "ux_evaluation" | "comparison";

export const STAGE_EFFORT: Record<PipelineStage, "low" | "medium" | "high" | "xhigh"> = {
  metadata: "low",
  synthesis: "high",
  theming: "high",
  ux_evaluation: "high",
  comparison: "medium",
};

export const STAGE_MAX_TOKENS: Record<PipelineStage, number> = {
  metadata: 8_000,
  synthesis: 32_000,
  theming: 32_000,
  ux_evaluation: 32_000,
  comparison: 16_000,
};

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  // The SDK resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth
  // login` profile on its own; do not hardcode or pre-check a key here.
  cached = new Anthropic({ maxRetries: 3 });
  return cached;
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN);
}
