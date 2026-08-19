/**
 * UX evaluation output schema.
 *
 * Enforces the pipeline as separate fields so the model cannot collapse
 * observation into diagnosis:
 *   task -> expectation -> observed -> actual experience -> issue ->
 *   cause hypotheses -> user need -> design implication -> recommendation.
 *
 * `severityFactors` is requested separately from `severity` so the domain layer
 * can reconcile a proposed rating against observed impact (see
 * `src/domain/severity.ts`) rather than accepting the model's number on trust.
 */

import { z } from "zod";
import { zConfidence, zEvidenceList } from "./common";

export const zSeverityFactors = z.object({
  blocksTaskCompletion: z.boolean(),
  causedAbandonment: z.boolean(),
  requiredAssistance: z.boolean(),
  causedError: z.boolean(),
  requiredWorkaround: z.boolean(),
  causedPersistentConfusion: z.boolean(),
  minorFrictionOnly: z.boolean(),
  affectsPrimaryUserGoal: z.boolean(),
});

export const zCauseHypothesis = z.object({
  hypothesis: z.string().describe("A possible cause, stated as a hypothesis, not a fact."),
  confidence: zConfidence,
  wouldBeTestedBy: z
    .string()
    .nullable()
    .describe("What would confirm or falsify this cause. Null if you cannot say."),
  evidence: zEvidenceList,
});

export const zUXIssue = z.object({
  name: z.string().describe("Short name for the issue, describing the problem not the screen."),
  description: z.string(),
  affectedTask: z.string().nullable(),
  affectedFlow: z.string().nullable(),
  affectedParticipants: z.array(z.string()).describe("Participant codes that hit this issue."),
  occurrenceCount: z
    .number()
    .int()
    .nullable()
    .describe("Number of distinct occurrences if countable from the material, else null."),
  userExpectation: z.string().nullable().describe("What the participant expected to happen."),
  observedBehavior: z.string().nullable().describe("What they actually did."),
  actualExperience: z.string().nullable().describe("What the product actually did in response."),
  proposedSeverity: z
    .number()
    .int()
    .min(0)
    .max(4)
    .describe("0 none, 1 minor friction, 2 moderate, 3 major, 4 critical blocker."),
  severityRationale: z
    .string()
    .describe(
      "Why this severity, in terms of impact on task completion and user goals. Do NOT justify severity by how many participants hit it.",
    ),
  severityFactors: zSeverityFactors,
  likelyCauseHypotheses: z
    .array(zCauseHypothesis)
    .describe("One or more candidate causes. Do not assert a single root cause as fact."),
  confidence: zConfidence,
  evidence: zEvidenceList,
  relatedThemeNames: z.array(z.string()).describe("Theme names from the list given, if related."),
  underlyingUserNeed: z
    .string()
    .nullable()
    .describe("The user need this issue reveals, stated as a need, not a feature."),
  designImplication: z
    .string()
    .nullable()
    .describe("What this implies for design, without prescribing a specific solution."),
});

export const zRecommendation = z.object({
  kind: z
    .enum(["recommendation", "hypothesis_to_test"])
    .describe(
      "Use 'recommendation' only when the evidence supports a direction. Use 'hypothesis_to_test' when it does not — which is the common case in qualitative work.",
    ),
  statement: z.string(),
  designPrinciple: z
    .string()
    .nullable()
    .describe("The principle this follows from, e.g. 'system status should be visible'."),
  addressesIssueNames: z.array(z.string()),
  addressesUserNeeds: z.array(z.string()),
  relatedThemeNames: z.array(z.string()),
  howToValidate: z
    .string()
    .nullable()
    .describe("Required when kind is hypothesis_to_test: how you would test it."),
  evidenceStrength: zConfidence,
  rationale: z.string().describe("The chain from evidence to this recommendation."),
});

export const zUxEvaluationResult = z.object({
  issues: z.array(zUXIssue),
  userNeeds: z
    .array(
      z.object({
        statement: z.string(),
        fromIssueNames: z.array(z.string()),
        confidence: zConfidence,
        evidence: zEvidenceList,
      }),
    )
    .describe("Needs distilled across issues. A need is what the user must be able to do or trust."),
  recommendations: z.array(zRecommendation),
  tasksEvaluated: z.array(z.string()),
  tasksNotExercised: z
    .array(z.string())
    .describe(
      "Planned tasks this round did not actually exercise. Critical for later round comparison: an issue on an unexercised task cannot be called resolved.",
    ),
  evaluationLimitations: z.array(z.string()),
});

export type ZUXIssue = z.infer<typeof zUXIssue>;
export type ZUxEvaluationResult = z.infer<typeof zUxEvaluationResult>;
export type ZSeverityFactors = z.infer<typeof zSeverityFactors>;
