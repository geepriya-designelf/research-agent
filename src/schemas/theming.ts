/**
 * Cross-participant theming output schema.
 *
 * `whyMeaningful` and `rejectedPatterns` are the two fields that keep this from
 * degenerating into topic clustering. A theme that cannot explain why its
 * observations belong together is not a theme; a pass that rejects nothing is
 * usually forcing participants into buckets.
 */

import { z } from "zod";
import { zConfidence, zEvidenceList } from "./common";
import { PATTERN_STRENGTHS } from "@/domain/model";

export const zThemeEvidence = z.object({
  participantCode: z.string().describe("Participant code, e.g. P01, exactly as given."),
  insightStatement: z
    .string()
    .describe("The participant-level insight this draws on, restated in one line."),
  rationale: z
    .string()
    .describe("Why this specific evidence belongs to this theme — the underlying experience, not the shared vocabulary."),
  evidence: zEvidenceList,
});

export const zTheme = z.object({
  name: z
    .string()
    .describe(
      "A sentence-shaped theme name describing an experience, e.g. 'Unclear save status makes people re-check their work'. NOT a topic label like 'Onboarding'.",
    ),
  description: z.string().describe("2-4 sentences describing the pattern."),
  underlyingInsight: z
    .string()
    .describe("The underlying experience or mechanism that unifies these participants."),
  whyMeaningful: z
    .string()
    .describe(
      "Why these observations belong together and why this matters for the research problem. If you cannot answer this without repeating the description, this is not a theme.",
    ),
  supportingParticipants: z
    .array(z.string())
    .describe("Participant codes that genuinely support this. Do not pad this list."),
  evidence: z.array(zThemeEvidence),
  counterEvidence: z
    .array(zThemeEvidence)
    .describe(
      "Participants or moments that cut against this theme. Include them. Hiding them is a failure.",
    ),
  outlierParticipants: z
    .array(z.string())
    .describe("Participants whose experience is related but genuinely different."),
  outlierNotes: z.string().nullable(),
  confidence: zConfidence,
  patternStrength: z.enum(PATTERN_STRENGTHS),
  relationToResearchProblem: z.string(),
  potentialImplication: z
    .string()
    .nullable()
    .describe("A possible implication, framed as a possibility, not a solution."),
  challengesHypotheses: z
    .array(z.string())
    .describe("Stated hypotheses this pattern cuts against, quoted from the list given."),
});

export const zRejectedPattern = z.object({
  label: z.string().describe("The candidate pattern you considered."),
  participants: z.array(z.string()),
  reason: z
    .string()
    .describe(
      "Why this did not become a theme, e.g. 'three participants used the word \"slow\" about three unrelated things'.",
    ),
});

export const zThemingResult = z.object({
  themes: z.array(zTheme),
  rejectedPatterns: z
    .array(zRejectedPattern)
    .describe(
      "Candidate patterns you deliberately did not promote. Shared vocabulary without shared underlying experience belongs here.",
    ),
  crossCuttingObservations: z
    .array(z.string())
    .describe("Observations that span themes or describe the dataset as a whole."),
  divergences: z
    .array(z.string())
    .describe("Places participants meaningfully disagree with each other."),
  openQuestions: z.array(z.string()),
});

export type ZTheme = z.infer<typeof zTheme>;
export type ZThemingResult = z.infer<typeof zThemingResult>;
