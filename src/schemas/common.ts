/**
 * Shared Zod fragments for LLM structured output.
 *
 * Rules for every schema in this directory:
 *  1. No `.optional()` — strict structured outputs require every key present.
 *     Use `.nullable()` for "the source does not say".
 *  2. Every claim-bearing object carries `epistemicStatus` and `evidence`.
 *  3. Quotes are verbatim strings; the model is told it will be checked, and
 *     `src/domain/evidence.ts` actually checks.
 */

import { z } from "zod";
import { CONFIDENCE_LEVELS, EPISTEMIC_STATUSES, INSIGHT_CATEGORIES } from "@/domain/model";

export const zConfidence = z.enum(CONFIDENCE_LEVELS);
export const zEpistemicStatus = z.enum(EPISTEMIC_STATUSES);
export const zInsightCategory = z.enum(INSIGHT_CATEGORIES);

/**
 * A quote as the model returns it. `transcriptRef` lets the model name which
 * transcript it came from in multi-transcript passes; single-transcript passes
 * ignore it. `approximateStartLine` is a hint only — verification is by text.
 */
export const zQuote = z.object({
  quote: z
    .string()
    .describe(
      "Verbatim text copied exactly from the transcript. Do not paraphrase, correct grammar, or merge non-adjacent statements. This string is checked against the source; if it does not appear there it will be flagged as unverified.",
    ),
  transcriptRef: z
    .string()
    .nullable()
    .describe("Transcript id or name this quote came from, or null if only one source is in scope."),
  approximateStartLine: z
    .number()
    .int()
    .nullable()
    .describe("Line number shown in the [L..-..] anchor for this quote, or null."),
});
export type ZQuote = z.infer<typeof zQuote>;

export const zEvidenceList = z
  .array(zQuote)
  .describe("Verbatim supporting quotes. Empty array if nothing in the source supports this.");

export type ZEvidenceList = z.infer<typeof zEvidenceList>;
