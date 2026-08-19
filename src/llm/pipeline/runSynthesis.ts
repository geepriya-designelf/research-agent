/**
 * Stage 1 — Research Synthesis (one participant at a time).
 */

import { newId } from "@/domain/ids";
import type {
  Insight,
  ParticipantSynthesis,
  ResearchFrame,
  SynthesisContradiction,
  TaskOutcome,
  Transcript,
  TranscriptSegment,
} from "@/domain/model";
import { hasGrounding } from "@/domain/evidence";
import { resolveAnalysisLens } from "@/domain/taxonomy";
import { zParticipantSynthesis } from "@/schemas/synthesis";
import { zTranscriptMetadata, type ZTranscriptMetadata } from "@/schemas/metadata";
import { generateStructured } from "../structured";
import { METADATA_SYSTEM } from "../prompts/metadata";
import { synthesisSystemPrompt } from "../prompts/synthesis";
import { renderFrame, renderTranscript } from "../prompts/shared";
import { buildSegmentIndex, mapEvidence } from "./mapEvidence";

export interface SynthesisJobInput {
  frame: ResearchFrame;
  transcript: Transcript;
  segments: TranscriptSegment[];
  participantId: string;
  participantCode: string;
}

export interface SynthesisJobOutput {
  synthesis: ParticipantSynthesis;
  metadata: ZTranscriptMetadata;
  /** Quotes the model produced that could not be found in the source. */
  fabricationWarnings: { where: string; quote: string; reason: string }[];
}

export async function extractTranscriptMetadata(
  input: Pick<SynthesisJobInput, "transcript" | "segments">,
): Promise<ZTranscriptMetadata> {
  const { data } = await generateStructured({
    stage: "metadata",
    schema: zTranscriptMetadata,
    system: METADATA_SYSTEM,
    userContent: renderTranscript(
      input.transcript.name,
      input.transcript.id,
      input.segments,
    ),
  });
  return data;
}

export async function runSynthesis(input: SynthesisJobInput): Promise<SynthesisJobOutput> {
  const { frame, transcript, segments, participantId, participantCode } = input;
  const lens = resolveAnalysisLens(frame.researchType, frame.researchStage);

  const metadata = await extractTranscriptMetadata({ transcript, segments });

  const userContent = [
    renderFrame(frame),
    "",
    `## Participant under analysis: ${participantCode}`,
    metadata.participantLabel
      ? `The transcript identifies this participant as "${metadata.participantLabel}".`
      : "The transcript does not identify this participant by name or code.",
    metadata.demographics.length > 0
      ? `Stated demographics: ${metadata.demographics.map((d) => `${d.field} = ${d.value}`).join("; ")}. Use only these; do not add any.`
      : "No demographics are stated in this transcript. Do not infer any.",
    metadata.containsObservedBehavior
      ? "This transcript records observed behaviour as well as speech. Keep the two separate."
      : "This transcript appears to contain speech only, with no recorded behavioural observation. Do not describe behaviour you cannot see.",
    "",
    renderTranscript(transcript.name, transcript.id, segments),
  ].join("\n");

  const { data } = await generateStructured({
    stage: "synthesis",
    schema: zParticipantSynthesis,
    system: synthesisSystemPrompt(lens),
    userContent,
  });

  const index = buildSegmentIndex([
    { transcriptId: transcript.id, name: transcript.name, segments },
  ]);

  const synthesisId = newId("syn");
  const fabricationWarnings: SynthesisJobOutput["fabricationWarnings"] = [];

  const insights: Insight[] = data.insights.map((raw) => {
    const evidence = mapEvidence(raw.evidence, index);
    collectWarnings(fabricationWarnings, `insight: ${raw.statement}`, evidence);
    return {
      id: newId("ins"),
      synthesisId,
      participantId,
      studyId: frame.studyId,
      projectId: frame.projectId,
      category: raw.category,
      statement: raw.statement,
      interpretation: raw.interpretation,
      epistemicStatus: raw.epistemicStatus,
      confidence: raw.confidence,
      evidence,
      relatedResearchQuestionIds: raw.relatedResearchQuestions.filter((id) =>
        frame.researchQuestions.some((q) => q.id === id),
      ),
    } satisfies Insight;
  });

  const taskOutcomes: TaskOutcome[] = data.taskOutcomes.map((raw) => {
    const evidence = mapEvidence(raw.evidence, index);
    collectWarnings(fabricationWarnings, `task: ${raw.taskLabel}`, evidence);
    return {
      id: newId("tsk"),
      synthesisId,
      taskLabel: raw.taskLabel,
      taskGoal: raw.taskGoal,
      participantExpectation: raw.participantExpectation,
      observedBehavior: raw.observedBehavior,
      outcome: raw.outcome,
      assistanceRequired: raw.assistanceRequired,
      errors: raw.errors,
      hesitations: raw.hesitations,
      confusions: raw.confusions,
      workarounds: raw.workarounds,
      evidence,
    } satisfies TaskOutcome;
  });

  const contradictions: SynthesisContradiction[] = data.contradictions.map((raw) => {
    const sideAEvidence = mapEvidence(raw.sideAEvidence, index);
    const sideBEvidence = mapEvidence(raw.sideBEvidence, index);
    collectWarnings(fabricationWarnings, `contradiction: ${raw.description}`, [
      ...sideAEvidence,
      ...sideBEvidence,
    ]);
    return {
      id: newId("cmp"),
      description: raw.description,
      sideA: { statement: raw.sideAStatement, evidence: sideAEvidence },
      sideB: { statement: raw.sideBStatement, evidence: sideBEvidence },
      possibleReading: raw.possibleReading,
    } satisfies SynthesisContradiction;
  });

  const notableQuotes = mapEvidence(data.notableQuotes, index);
  collectWarnings(fabricationWarnings, "notable quote", notableQuotes);

  const synthesis: ParticipantSynthesis = {
    id: synthesisId,
    projectId: frame.projectId,
    studyId: frame.studyId,
    transcriptId: transcript.id,
    participantId,
    frameSnapshot: frame,
    overallSummary: data.overallSummary,
    participantReported: data.participantReported,
    observedBehaviorSummary: data.observedBehaviorSummary,
    insights,
    taskOutcomes,
    notableQuotes,
    contradictions,
    openQuestions: data.openQuestions,
    notSupportedByEvidence: data.notSupportedByEvidence,
    modelNotes: data.modelNotes,
    createdAt: new Date().toISOString(),
  };

  return { synthesis, metadata, fabricationWarnings };
}

function collectWarnings(
  sink: SynthesisJobOutput["fabricationWarnings"],
  where: string,
  evidence: { quote: string; verification: { status: string; reason?: string } }[],
): void {
  for (const item of evidence) {
    if (item.verification.status !== "verified") {
      sink.push({
        where,
        quote: item.quote,
        reason: item.verification.reason ?? "Quote not found in source.",
      });
    }
  }
}

/**
 * Insights whose evidence entirely failed verification. Surfaced in the UI as
 * ungrounded rather than deleted, so a fabricating run is visible.
 */
export function ungroundedInsights(synthesis: ParticipantSynthesis): Insight[] {
  return synthesis.insights.filter(
    (insight) => insight.evidence.length > 0 && !hasGrounding(insight.evidence),
  );
}
