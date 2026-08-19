/**
 * Job bodies.
 *
 * Each function is a complete unit of analysis: load from the store, run one
 * pipeline stage, write the result back, record warnings. They are pure with
 * respect to the transport — Inngest and the inline runner both call these.
 */

import { buildResearchFrame } from "@/domain/frame";
import { newId, participantCode } from "@/domain/ids";
import { supportsUxEvaluation } from "@/domain/taxonomy";
import type { DemographicFact, ResearchFrame, TranscriptSegment } from "@/domain/model";
import { runComparison } from "@/llm/pipeline/runComparison";
import { runSynthesis } from "@/llm/pipeline/runSynthesis";
import { runTheming } from "@/llm/pipeline/runTheming";
import { runUxEvaluation } from "@/llm/pipeline/runUxEvaluation";
import { buildEvidence, partitionGrounded } from "@/domain/evidence";
import { getStore } from "@/server/store";
import type { ResearchStore } from "@/server/store/types";

export class StudyNotConfirmedError extends Error {
  constructor() {
    super(
      "This study's classification has not been confirmed. Research type and stage must be reviewed and confirmed before any analysis runs.",
    );
    this.name = "StudyNotConfirmedError";
  }
}

async function loadFrame(store: ResearchStore, studyId: string): Promise<ResearchFrame> {
  const study = await store.getStudy(studyId);
  if (!study) throw new Error(`Study ${studyId} not found`);
  if (!study.classificationConfirmedAt) throw new StudyNotConfirmedError();

  const project = await store.getProject(study.projectId);
  if (!project) throw new Error(`Project ${study.projectId} not found`);

  const [researchQuestions, participants, transcripts] = await Promise.all([
    store.listResearchQuestions(project.id),
    store.listParticipants(studyId),
    store.listTranscripts(studyId),
  ]);

  return buildResearchFrame({ project, study, researchQuestions, participants, transcripts });
}

async function loadTranscriptContext(
  store: ResearchStore,
  studyId: string,
): Promise<{ transcriptId: string; name: string; segments: TranscriptSegment[] }[]> {
  const transcripts = await store.listTranscripts(studyId);
  return Promise.all(
    transcripts.map(async (t) => ({
      transcriptId: t.id,
      name: t.name,
      segments: await store.listSegments(t.id),
    })),
  );
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

export async function synthesisTask(args: { jobId: string; transcriptId: string }): Promise<void> {
  const store = getStore();
  await store.updateJob(args.jobId, { status: "running" });

  try {
    const transcript = await store.getTranscript(args.transcriptId);
    if (!transcript) throw new Error(`Transcript ${args.transcriptId} not found`);

    const frame = await loadFrame(store, transcript.studyId);
    const segments = await store.listSegments(transcript.id);

    // A participant record is created here rather than at upload, because the
    // participant's stated identity comes out of the metadata pass.
    let participantId = transcript.participantId;
    if (!participantId) {
      const existing = await store.listParticipants(transcript.studyId);
      const participant = await store.createParticipant({
        studyId: transcript.studyId,
        projectId: transcript.projectId,
        code: participantCode(existing.length),
        displayName: null,
        demographics: [],
        backgroundContext: null,
      });
      participantId = participant.id;
      await store.attachParticipantToTranscript(transcript.id, participantId);
    }

    const participant = await store.getParticipant(participantId);
    const code = participant?.code ?? "P01";

    const { synthesis, metadata, fabricationWarnings } = await runSynthesis({
      frame,
      transcript,
      segments,
      participantId,
      participantCode: code,
    });

    // Record only demographics whose supporting quote verified against source.
    const claimed: DemographicFact[] = metadata.demographics.map((fact) => ({
      field: fact.field,
      value: fact.value,
      evidence: fact.evidence.map((q) =>
        buildEvidence({ quote: q.quote, approximateLine: q.approximateStartLine }, transcript.id, segments),
      ),
    }));
    const { kept: demographics, dropped } = partitionGrounded(claimed);
    const droppedDemographics = dropped.length;

    await store.updateParticipant(participantId, {
      displayName: metadata.participantLabel,
      demographics,
      backgroundContext: metadata.backgroundContext,
    });

    await store.saveSynthesis(synthesis);

    const warnings = [
      ...fabricationWarnings.map(
        (w) => `Unverifiable quote in ${w.where}: "${truncate(w.quote)}" — ${w.reason}`,
      ),
      ...(droppedDemographics > 0
        ? [
            `${droppedDemographics} demographic claim(s) were discarded because no verbatim statement in the transcript supported them.`,
          ]
        : []),
    ];

    await store.updateJob(args.jobId, { status: "succeeded", warnings });
  } catch (error) {
    await store.updateJob(args.jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Theming
// ---------------------------------------------------------------------------

export async function themingTask(args: { jobId: string; studyId: string }): Promise<void> {
  const store = getStore();
  await store.updateJob(args.jobId, { status: "running" });

  try {
    const frame = await loadFrame(store, args.studyId);
    const syntheses = await store.listSyntheses(args.studyId);
    if (syntheses.length < 2) {
      throw new Error(
        `Theming compares participants, so it needs at least two completed syntheses. This study has ${syntheses.length}.`,
      );
    }

    const participants = (await store.listParticipants(args.studyId)).map((p) => ({
      id: p.id,
      code: p.code,
    }));
    const transcripts = await loadTranscriptContext(store, args.studyId);

    const result = await runTheming({ frame, syntheses, participants, transcripts });

    await store.saveThemingRun({
      projectId: frame.projectId,
      studyId: args.studyId,
      themes: result.themes,
      rejectedPatterns: result.rejectedPatterns,
      crossCuttingObservations: result.crossCuttingObservations,
      divergences: result.divergences,
      openQuestions: result.openQuestions,
      createdAt: new Date().toISOString(),
    });

    const warnings = [
      ...result.demotions.map((d) => `Demoted "${d.name}" to a rejected pattern: ${d.reason}`),
      ...result.overgeneralizations.map(
        (o) => `Theme "${o.themeName}" used generalising language: ${o.phrases.join(", ")}.`,
      ),
      ...result.fabricationWarnings.map(
        (w) => `Unverifiable quote in ${w.where}: "${truncate(w.quote)}" — ${w.reason}`,
      ),
    ];

    await store.updateJob(args.jobId, { status: "succeeded", warnings });
  } catch (error) {
    await store.updateJob(args.jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// UX evaluation
// ---------------------------------------------------------------------------

export async function uxEvaluationTask(args: {
  jobId: string;
  studyId: string;
  label: string;
}): Promise<void> {
  const store = getStore();
  await store.updateJob(args.jobId, { status: "running" });

  try {
    const study = await store.getStudy(args.studyId);
    if (!study) throw new Error(`Study ${args.studyId} not found`);
    if (!supportsUxEvaluation(study.researchType, study.researchStage)) {
      throw new Error(
        "UX evaluation does not apply to this study type. Discovery interviews produce needs and mental models, not usability findings — running a UX evaluation here would manufacture issues out of reported opinions.",
      );
    }

    const frame = await loadFrame(store, args.studyId);
    const syntheses = await store.listSyntheses(args.studyId);
    if (syntheses.length === 0) {
      throw new Error("Run Research Synthesis before UX Evaluation: there is nothing to evaluate yet.");
    }

    const participants = (await store.listParticipants(args.studyId)).map((p) => ({
      id: p.id,
      code: p.code,
    }));
    const transcripts = await loadTranscriptContext(store, args.studyId);
    const themes = await store.listThemes(frame.projectId, args.studyId);

    const existing = await store.listEvaluations(frame.projectId);
    const previous = existing.length > 0 ? existing[existing.length - 1] : null;

    const result = await runUxEvaluation({
      frame,
      syntheses,
      themes,
      participants,
      transcripts,
      round: existing.length + 1,
      label: args.label,
      previousEvaluationId: previous?.id ?? null,
    });

    await store.saveEvaluation({
      evaluation: result.evaluation,
      issues: result.issues,
      userNeeds: result.userNeeds,
      recommendations: result.recommendations,
      tasksNotExercised: result.tasksNotExercised,
      limitations: result.limitations,
    });

    const warnings = [
      ...result.severityAdjustments.map((a) => `Severity adjusted for "${a.issueName}": ${a.note}`),
      ...result.fabricationWarnings.map(
        (w) => `Unverifiable quote in ${w.where}: "${truncate(w.quote)}" — ${w.reason}`,
      ),
      ...(result.tasksNotExercised.length > 0
        ? [
            `Tasks not exercised this round: ${result.tasksNotExercised.join("; ")}. Issues on these tasks cannot be assessed as resolved in a later round.`,
          ]
        : []),
    ];

    await store.updateJob(args.jobId, { status: "succeeded", warnings });

    // Round 2+ automatically compares against the previous round.
    if (previous) {
      const previousBundle = await store.getEvaluation(previous.id);
      if (previousBundle) {
        const comparison = await runComparison({
          projectId: frame.projectId,
          previous: { evaluation: previousBundle.evaluation, issues: previousBundle.issues },
          current: { evaluation: result.evaluation, issues: result.issues },
          transcripts,
        });
        await store.saveComparisons(comparison.comparisons);
      }
    }
  } catch (error) {
    await store.updateJob(args.jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Standalone comparison (re-run against an arbitrary earlier round)
// ---------------------------------------------------------------------------

export async function comparisonTask(args: {
  jobId: string;
  previousEvaluationId: string;
  currentEvaluationId: string;
}): Promise<void> {
  const store = getStore();
  await store.updateJob(args.jobId, { status: "running" });

  try {
    const [previous, current] = await Promise.all([
      store.getEvaluation(args.previousEvaluationId),
      store.getEvaluation(args.currentEvaluationId),
    ]);
    if (!previous || !current) throw new Error("Both evaluation rounds must exist to compare them.");

    const transcripts = await loadTranscriptContext(store, current.evaluation.studyId);
    const result = await runComparison({
      projectId: current.evaluation.projectId,
      previous: { evaluation: previous.evaluation, issues: previous.issues },
      current: { evaluation: current.evaluation, issues: current.issues },
      transcripts,
    });

    await store.saveComparisons(result.comparisons);
    await store.updateJob(args.jobId, {
      status: "succeeded",
      warnings: result.notComparable.map((n) => `Rounds may not be directly comparable: ${n}`),
    });
  } catch (error) {
    await store.updateJob(args.jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function newJobId(): string {
  return newId("job");
}

function truncate(text: string, length = 90): string {
  return text.length <= length ? text : `${text.slice(0, length)}...`;
}
