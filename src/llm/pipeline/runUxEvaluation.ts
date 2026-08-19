/**
 * Stage 3 — UX Evaluation.
 *
 * Only runs for study types where observed or evaluative material exists
 * (see `supportsUxEvaluation`). The severity the model proposes is reconciled
 * against the impact factors it reported, so frequency cannot smuggle itself
 * into a severity rating.
 */

import { newId } from "@/domain/ids";
import { verifiedOnly } from "@/domain/evidence";
import { reconcileSeverity } from "@/domain/severity";
import type {
  CauseHypothesis,
  ParticipantSynthesis,
  Recommendation,
  ResearchFrame,
  Severity,
  Theme,
  TranscriptSegment,
  UserNeed,
  UXEvaluation,
  UXIssue,
} from "@/domain/model";
import { zUxEvaluationResult } from "@/schemas/uxEvaluation";
import { generateStructured } from "../structured";
import { UX_EVALUATION_SYSTEM } from "../prompts/uxEvaluation";
import { renderFrame } from "../prompts/shared";
import { buildSegmentIndex, mapEvidence } from "./mapEvidence";

export interface UxEvaluationJobInput {
  frame: ResearchFrame;
  syntheses: ParticipantSynthesis[];
  themes: Theme[];
  participants: { id: string; code: string }[];
  transcripts: { transcriptId: string; name: string; segments: TranscriptSegment[] }[];
  round: number;
  label: string;
  previousEvaluationId: string | null;
}

export interface UxEvaluationJobOutput {
  evaluation: UXEvaluation;
  issues: UXIssue[];
  userNeeds: UserNeed[];
  recommendations: Recommendation[];
  tasksNotExercised: string[];
  limitations: string[];
  severityAdjustments: { issueName: string; note: string }[];
  fabricationWarnings: { where: string; quote: string; reason: string }[];
}

export async function runUxEvaluation(
  input: UxEvaluationJobInput,
): Promise<UxEvaluationJobOutput> {
  const { frame, syntheses, themes, participants, transcripts, round, label } = input;

  const codeById = new Map(participants.map((p) => [p.id, p.code]));
  const idByCode = new Map(participants.map((p) => [p.code, p.id]));

  const userContent = [
    renderFrame(frame),
    "",
    "## Participant material",
    "",
    syntheses
      .map((s) => renderSynthesisForUx(s, codeById.get(s.participantId) ?? "P??"))
      .join("\n\n"),
    "",
    themes.length > 0 ? renderThemes(themes) : "## Themes\n\n(no cross-participant themes recorded yet)",
    "",
    frame.plannedTasks.length > 0
      ? `## Planned tasks for this study\n${frame.plannedTasks.map((t) => `- ${t}`).join("\n")}\n\nFor each planned task, decide from the material whether it was actually exercised. List those that were not in tasksNotExercised.`
      : "## Planned tasks\n\nNo planned tasks were recorded for this study. Derive the tasks from the material and say so in evaluationLimitations.",
    "",
    `There are ${participants.length} participants in scope; that is the denominator for any count you report.`,
  ].join("\n");

  const { data } = await generateStructured({
    stage: "ux_evaluation",
    schema: zUxEvaluationResult,
    system: UX_EVALUATION_SYSTEM,
    userContent,
  });

  const index = buildSegmentIndex(transcripts);
  const now = new Date().toISOString();
  const fabricationWarnings: UxEvaluationJobOutput["fabricationWarnings"] = [];
  const severityAdjustments: UxEvaluationJobOutput["severityAdjustments"] = [];

  const evaluationId = newId("uxe");
  const themeIdByName = new Map(themes.map((t) => [t.name.trim().toLowerCase(), t.id]));

  const issues: UXIssue[] = data.issues.map((raw) => {
    const evidence = mapEvidence(raw.evidence, index);
    for (const item of evidence) {
      if (item.verification.status !== "verified") {
        fabricationWarnings.push({
          where: `ux issue: ${raw.name}`,
          quote: item.quote,
          reason: item.verification.reason,
        });
      }
    }

    const reconciled = reconcileSeverity(raw.proposedSeverity as Severity, raw.severityFactors);
    if (reconciled.adjusted && reconciled.note) {
      severityAdjustments.push({ issueName: raw.name, note: reconciled.note });
    }

    const affectedParticipantIds = raw.affectedParticipants
      .map((code) => idByCode.get(code))
      .filter((id): id is string => Boolean(id));

    const causes: CauseHypothesis[] = raw.likelyCauseHypotheses.map((cause) => {
      const causeEvidence = mapEvidence(cause.evidence, index);
      for (const item of causeEvidence) {
        if (item.verification.status !== "verified") {
          fabricationWarnings.push({
            where: `cause hypothesis: ${cause.hypothesis}`,
            quote: item.quote,
            reason: item.verification.reason,
          });
        }
      }
      return {
        id: newId("cmp"),
        hypothesis: cause.hypothesis,
        confidence: cause.confidence,
        wouldBeTestedBy: cause.wouldBeTestedBy,
        evidence: causeEvidence,
      };
    });

    return {
      id: newId("iss"),
      evaluationId,
      projectId: frame.projectId,
      studyId: frame.studyId,
      name: raw.name,
      description: raw.description,
      affectedTask: raw.affectedTask,
      affectedFlow: raw.affectedFlow,
      affectedParticipantIds,
      affectedParticipantCount: affectedParticipantIds.length,
      totalParticipantsConsidered: participants.length,
      occurrenceCount: raw.occurrenceCount,
      severity: reconciled.severity,
      severityRationale: reconciled.adjusted
        ? `${raw.severityRationale} [Adjusted by impact check: ${reconciled.note}]`
        : raw.severityRationale,
      userExpectation: raw.userExpectation,
      observedBehavior: raw.observedBehavior,
      actualExperience: raw.actualExperience,
      likelyCauseHypotheses: causes,
      confidence: raw.confidence,
      evidence,
      supportingQuoteIds: verifiedOnly(evidence).map((e) => e.id),
      relatedThemeIds: raw.relatedThemeNames
        .map((name) => themeIdByName.get(name.trim().toLowerCase()))
        .filter((id): id is string => Boolean(id)),
      relatedUserNeedIds: [],
      designImplication: raw.designImplication,
      createdAt: now,
    } satisfies UXIssue;
  });

  const issueIdByName = new Map(issues.map((i) => [i.name.trim().toLowerCase(), i.id]));

  const userNeeds: UserNeed[] = data.userNeeds.map((raw) => {
    const needEvidence = mapEvidence(raw.evidence, index);
    const derivedFromIssueIds = raw.fromIssueNames
      .map((name) => issueIdByName.get(name.trim().toLowerCase()))
      .filter((id): id is string => Boolean(id));
    return {
      id: newId("ned"),
      projectId: frame.projectId,
      statement: raw.statement,
      derivedFromIssueIds,
      derivedFromThemeIds: [],
      evidence: needEvidence,
      confidence: raw.confidence,
      createdAt: now,
    } satisfies UserNeed;
  });

  // Wire needs back onto their issues so the graph is navigable both ways.
  for (const need of userNeeds) {
    for (const issueId of need.derivedFromIssueIds) {
      const issue = issues.find((i) => i.id === issueId);
      if (issue) issue.relatedUserNeedIds.push(need.id);
    }
  }

  const needIdByStatement = new Map(userNeeds.map((n) => [n.statement.trim().toLowerCase(), n.id]));

  const recommendations: Recommendation[] = data.recommendations.map((raw) => ({
    id: newId("rec"),
    projectId: frame.projectId,
    evaluationId,
    // A "recommendation" with no validation path and weak evidence is a
    // hypothesis whether or not the model labelled it one.
    kind:
      raw.kind === "recommendation" && raw.evidenceStrength === "low"
        ? "hypothesis_to_test"
        : raw.kind,
    statement: raw.statement,
    designPrinciple: raw.designPrinciple,
    addressesIssueIds: raw.addressesIssueNames
      .map((name) => issueIdByName.get(name.trim().toLowerCase()))
      .filter((id): id is string => Boolean(id)),
    addressesUserNeedIds: raw.addressesUserNeeds
      .map((statement) => needIdByStatement.get(statement.trim().toLowerCase()))
      .filter((id): id is string => Boolean(id)),
    relatedThemeIds: raw.relatedThemeNames
      .map((name) => themeIdByName.get(name.trim().toLowerCase()))
      .filter((id): id is string => Boolean(id)),
    howToValidate: raw.howToValidate,
    evidenceStrength: raw.evidenceStrength,
    rationale: raw.rationale,
    createdAt: now,
  }));

  const evaluation: UXEvaluation = {
    id: evaluationId,
    projectId: frame.projectId,
    studyId: frame.studyId,
    round,
    label,
    productVersion: frame.productVersion,
    researchGoal: frame.researchGoal,
    tasksEvaluated: data.tasksEvaluated,
    participantIds: participants.map((p) => p.id),
    previousEvaluationId: input.previousEvaluationId,
    createdAt: now,
  };

  return {
    evaluation,
    issues,
    userNeeds,
    recommendations,
    tasksNotExercised: data.tasksNotExercised,
    limitations: data.evaluationLimitations,
    severityAdjustments,
    fabricationWarnings,
  };
}

function renderSynthesisForUx(synthesis: ParticipantSynthesis, code: string): string {
  const lines: string[] = [`### ${code}`, `Summary: ${synthesis.overallSummary}`];
  if (synthesis.observedBehaviorSummary) {
    lines.push(`Observed: ${synthesis.observedBehaviorSummary}`);
  }
  if (synthesis.taskOutcomes.length > 0) {
    lines.push("Tasks:");
    for (const task of synthesis.taskOutcomes) {
      lines.push(`- ${task.taskLabel} -> ${task.outcome}`);
      if (task.taskGoal) lines.push(`    goal: ${task.taskGoal}`);
      if (task.participantExpectation) lines.push(`    expectation: ${task.participantExpectation}`);
      if (task.observedBehavior) lines.push(`    observed behaviour: ${task.observedBehavior}`);
      if (task.assistanceRequired !== null) {
        lines.push(`    assistance required: ${task.assistanceRequired}`);
      }
      for (const key of ["errors", "hesitations", "confusions", "workarounds"] as const) {
        if (task[key].length > 0) lines.push(`    ${key}: ${task[key].join("; ")}`);
      }
      for (const evidence of verifiedOnly(task.evidence)) {
        lines.push(`    evidence [L${evidence.startLine}-${evidence.endLine}]: "${evidence.quote}"`);
      }
    }
  }
  lines.push("Insights:");
  for (const insight of synthesis.insights) {
    lines.push(`- [${insight.category} | ${insight.epistemicStatus}] ${insight.statement}`);
    for (const evidence of verifiedOnly(insight.evidence)) {
      lines.push(`    evidence [L${evidence.startLine}-${evidence.endLine}]: "${evidence.quote}"`);
    }
  }
  return lines.join("\n");
}

function renderThemes(themes: Theme[]): string {
  const lines = ["## Cross-participant themes", ""];
  for (const theme of themes) {
    lines.push(
      `- "${theme.name}" (${theme.participantCount} of ${theme.totalParticipantsConsidered} participants, strength ${theme.patternStrength})`,
    );
    lines.push(`    ${theme.underlyingInsight}`);
    if (theme.counterEvidence.length > 0) {
      lines.push(`    counter-evidence exists from ${theme.counterEvidence.length} participant moment(s)`);
    }
  }
  return lines.join("\n");
}
