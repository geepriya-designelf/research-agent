/**
 * Round-over-round comparison.
 *
 * The model's job here is MATCHING (which issue in round N corresponds to which
 * issue in round N-1) and reporting whether the task was actually retested.
 * The verdict itself — improved / regressed / not observed — is computed by
 * `src/domain/comparison.ts`, so "wasn't mentioned" can never quietly become
 * "was fixed".
 */

import { z } from "zod";
import { zConfidence, zEvidenceList } from "./common";

export const zIssueMatch = z.object({
  previousIssueName: z
    .string()
    .nullable()
    .describe("Issue name from the previous round, or null if this is new this round."),
  currentIssueName: z
    .string()
    .nullable()
    .describe("Issue name from the current round, or null if the previous issue has no counterpart."),
  sameUnderlyingProblem: z
    .boolean()
    .describe(
      "True only if these are the same underlying problem, not merely the same screen or similar wording.",
    ),
  taskWasRetested: z
    .boolean()
    .describe(
      "Did the current round actually exercise the task this issue lived on? If the task was not run, this is false and no conclusion about resolution can be drawn.",
    ),
  whatChanged: z
    .string()
    .describe("What is different between the rounds, grounded in the evidence from both."),
  confidence: zConfidence,
  evidence: zEvidenceList,
});

export const zComparisonResult = z.object({
  matches: z.array(zIssueMatch),
  notComparable: z
    .array(z.string())
    .describe(
      "Reasons the two rounds are not directly comparable, if any — different tasks, different participant profile, different prototype scope.",
    ),
  overallAssessment: z
    .string()
    .describe(
      "What changed between the rounds overall. Do not claim improvement that the evidence does not show.",
    ),
});

export type ZComparisonResult = z.infer<typeof zComparisonResult>;
