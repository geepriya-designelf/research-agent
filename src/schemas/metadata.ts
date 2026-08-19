/**
 * Transcript metadata extraction.
 *
 * Runs before synthesis. Its whole job is to record what the source actually
 * states about who this is — and, critically, to leave everything else null.
 * Demographic invention is the failure mode this pass exists to prevent.
 */

import { z } from "zod";
import { zEvidenceList } from "./common";

export const zDemographicFact = z.object({
  field: z
    .string()
    .describe(
      "Demographic attribute explicitly stated in the transcript, e.g. 'role', 'years of experience', 'location'. Only include a field if the participant or moderator states it.",
    ),
  value: z.string().describe("The value exactly as stated or directly quoted."),
  evidence: zEvidenceList,
});

export const zTranscriptMetadata = z.object({
  participantLabel: z
    .string()
    .nullable()
    .describe(
      "The participant's name or code as it appears in the transcript (e.g. 'P3', 'Dana'). Null if the transcript does not identify them.",
    ),
  interviewerLabel: z
    .string()
    .nullable()
    .describe("The moderator/interviewer label as it appears, or null."),
  sessionDate: z
    .string()
    .nullable()
    .describe("Session date if stated in the transcript, otherwise null. Do not infer."),
  productOrVersionMentioned: z
    .string()
    .nullable()
    .describe("Product, prototype, or version named in the transcript, or null."),
  demographics: z
    .array(zDemographicFact)
    .describe(
      "ONLY demographics explicitly stated. Never infer age, gender, income, education, occupation, location, or family status from names, speech style, or topic. If nothing is stated, return an empty array.",
    ),
  backgroundContext: z
    .string()
    .nullable()
    .describe(
      "One or two sentences of context the participant gave about their own situation, grounded in what they said. Null if they gave none.",
    ),
  tasksMentioned: z
    .array(z.string())
    .describe("Task labels or scenario names the moderator gave, if any. Empty array otherwise."),
  containsObservedBehavior: z
    .boolean()
    .describe(
      "True only if the transcript records what the participant did (clicks, pauses, navigation, errors) as opposed to only what they said.",
    ),
  missingInformation: z
    .array(z.string())
    .describe(
      "Things a researcher would normally want that this source does not contain, e.g. 'no participant demographics stated', 'no timestamps'.",
    ),
});

export type ZTranscriptMetadata = z.infer<typeof zTranscriptMetadata>;
