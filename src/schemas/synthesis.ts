/**
 * Participant-level synthesis output schema.
 *
 * One participant, understood on their own terms, before any cross-participant
 * comparison. The schema enforces the separation the brief demands:
 * what was said / what was done / what the analyst thinks it means are three
 * different fields with three different epistemic statuses.
 */

import { z } from "zod";
import { zConfidence, zEpistemicStatus, zEvidenceList, zInsightCategory } from "./common";

export const zInsight = z.object({
  category: zInsightCategory,
  statement: z
    .string()
    .describe(
      "One sentence stating the insight in the participant's frame of reference. Not a keyword, not a topic label.",
    ),
  interpretation: z
    .string()
    .nullable()
    .describe(
      "Analyst reading of what this means for the research problem. This is YOUR claim, not the participant's. Null if you have nothing to add beyond the statement.",
    ),
  epistemicStatus: zEpistemicStatus.describe(
    "participant_stated = they said it; observed = recorded behaviour; researcher_observation = a moderator note; inferred = a reasonable reading they did not state; interpretation = your meaning-making.",
  ),
  confidence: zConfidence,
  evidence: zEvidenceList,
  relatedResearchQuestions: z
    .array(z.string())
    .describe("IDs of research questions this speaks to, from the list given. Empty if none."),
});

export const zTaskOutcome = z.object({
  taskLabel: z.string().describe("The task as the moderator framed it."),
  taskGoal: z.string().nullable().describe("What the participant was trying to accomplish."),
  participantExpectation: z
    .string()
    .nullable()
    .describe("What they said or showed they expected to happen. Null if not evidenced."),
  observedBehavior: z
    .string()
    .nullable()
    .describe("What they actually did, as recorded. Null if the source records no behaviour."),
  outcome: z.enum([
    "success",
    "success_with_difficulty",
    "partial",
    "failure",
    "abandoned",
    "not_attempted",
    "unknown",
  ]),
  assistanceRequired: z
    .boolean()
    .nullable()
    .describe("True/false only if the source shows it. Null if the source does not say."),
  errors: z.array(z.string()).describe("Incorrect actions observed. Empty if none recorded."),
  hesitations: z.array(z.string()).describe("Pauses or visible uncertainty recorded."),
  confusions: z.array(z.string()).describe("Points of stated or observed confusion."),
  workarounds: z.array(z.string()).describe("Ways they worked around the interface."),
  evidence: zEvidenceList,
});

export const zContradiction = z.object({
  description: z.string().describe("What is in tension, stated neutrally."),
  sideAStatement: z.string(),
  sideAEvidence: zEvidenceList,
  sideBStatement: z.string(),
  sideBEvidence: zEvidenceList,
  possibleReading: z
    .string()
    .nullable()
    .describe(
      "A possible explanation (changed mind, different context, social desirability). Offer at most one, clearly as a possibility. Null if you cannot say.",
    ),
});

export const zParticipantSynthesis = z.object({
  overallSummary: z
    .string()
    .describe(
      "3-6 sentences on this participant specifically: their situation, what they are trying to do, and where the friction is. Read tone and context — do not flatten hedged, reluctant, or sarcastic statements into neutral summaries.",
    ),
  participantReported: z
    .array(z.string())
    .describe("What the participant said about their own experience, in their framing."),
  observedBehaviorSummary: z
    .string()
    .nullable()
    .describe(
      "What the participant was observed doing, if the source records behaviour. Null for pure self-report material. Never merge this with what they said.",
    ),
  insights: z.array(zInsight).describe("The substantive insights from this participant."),
  taskOutcomes: z
    .array(zTaskOutcome)
    .describe("Task-level outcomes. Empty array when the material is not task-based."),
  notableQuotes: zEvidenceList.describe(
    "Quotes worth surfacing verbatim because of what they reveal, not because they sound good.",
  ),
  contradictions: z
    .array(zContradiction)
    .describe(
      "Places the participant contradicted themselves or shifted position. Preserve both sides; do not resolve them.",
    ),
  openQuestions: z
    .array(z.string())
    .describe("Questions this session raises that the material cannot answer."),
  notSupportedByEvidence: z
    .array(z.string())
    .describe(
      "Things a reader might expect you to conclude but which this source does not support. Naming these is as valuable as the insights.",
    ),
  modelNotes: z
    .string()
    .nullable()
    .describe("Anything about the material itself worth flagging (quality, gaps, ambiguity)."),
});

export type ZParticipantSynthesis = z.infer<typeof zParticipantSynthesis>;
export type ZInsight = z.infer<typeof zInsight>;
export type ZTaskOutcome = z.infer<typeof zTaskOutcome>;
export type ZContradiction = z.infer<typeof zContradiction>;
