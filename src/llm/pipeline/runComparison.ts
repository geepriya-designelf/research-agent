/**
 * Stage 4 — Comparative evaluation across rounds.
 *
 * Split of responsibility: the model matches issues and reports retest
 * coverage; `classifyChange` decides the verdict. That keeps the "not observed
 * is not resolved" rule in code, where it cannot be talked out of.
 */

import { newId } from "@/domain/ids";
import { classifyChange } from "@/domain/comparison";
import type { IssueComparison, TranscriptSegment, UXEvaluation, UXIssue } from "@/domain/model";
import { zComparisonResult } from "@/schemas/comparison";
import { generateStructured } from "../structured";
import { COMPARISON_SYSTEM } from "../prompts/uxEvaluation";
import { buildSegmentIndex, mapEvidence } from "./mapEvidence";

export interface ComparisonJobInput {
  projectId: string;
  previous: { evaluation: UXEvaluation; issues: UXIssue[] };
  current: { evaluation: UXEvaluation; issues: UXIssue[] };
  transcripts: { transcriptId: string; name: string; segments: TranscriptSegment[] }[];
}

export interface ComparisonJobOutput {
  comparisons: IssueComparison[];
  notComparable: string[];
  overallAssessment: string;
}

export async function runComparison(input: ComparisonJobInput): Promise<ComparisonJobOutput> {
  const { projectId, previous, current } = input;

  const userContent = [
    `## Previous round: ${previous.evaluation.label} (round ${previous.evaluation.round}${previous.evaluation.productVersion ? `, version ${previous.evaluation.productVersion}` : ""})`,
    `Tasks evaluated: ${previous.evaluation.tasksEvaluated.join("; ") || "(none recorded)"}`,
    "",
    renderIssues(previous.issues),
    "",
    `## Current round: ${current.evaluation.label} (round ${current.evaluation.round}${current.evaluation.productVersion ? `, version ${current.evaluation.productVersion}` : ""})`,
    `Tasks evaluated: ${current.evaluation.tasksEvaluated.join("; ") || "(none recorded)"}`,
    "",
    renderIssues(current.issues),
    "",
    "Match issues across the two rounds by underlying problem, not by wording or screen. For each previous issue with no counterpart, state whether the task it lived on was actually exercised this round.",
  ].join("\n");

  const { data } = await generateStructured({
    stage: "comparison",
    schema: zComparisonResult,
    system: COMPARISON_SYSTEM,
    userContent,
  });

  const index = buildSegmentIndex(input.transcripts);
  const now = new Date().toISOString();

  const prevByName = new Map(previous.issues.map((i) => [i.name.trim().toLowerCase(), i]));
  const currByName = new Map(current.issues.map((i) => [i.name.trim().toLowerCase(), i]));
  const matchedPrevious = new Set<string>();
  const matchedCurrent = new Set<string>();

  const comparisons: IssueComparison[] = [];

  for (const match of data.matches) {
    const previousIssue = match.previousIssueName
      ? (prevByName.get(match.previousIssueName.trim().toLowerCase()) ?? null)
      : null;
    const currentIssue = match.currentIssueName
      ? (currByName.get(match.currentIssueName.trim().toLowerCase()) ?? null)
      : null;

    if (!previousIssue && !currentIssue) continue;
    // A "match" the model itself says is not the same problem is not a match.
    const pairedCurrent = match.sameUnderlyingProblem ? currentIssue : null;

    if (previousIssue) matchedPrevious.add(previousIssue.id);
    if (currentIssue && match.sameUnderlyingProblem) matchedCurrent.add(currentIssue.id);
    else if (currentIssue && !previousIssue) matchedCurrent.add(currentIssue.id);

    const verdict = classifyChange({
      previousIssue,
      currentIssue: pairedCurrent,
      taskWasRetested: match.taskWasRetested,
    });

    comparisons.push({
      id: newId("cmp"),
      projectId,
      previousEvaluationId: previous.evaluation.id,
      currentEvaluationId: current.evaluation.id,
      previousIssueId: previousIssue?.id ?? null,
      currentIssueId: pairedCurrent?.id ?? currentIssue?.id ?? null,
      status: verdict.status,
      rationale: `${verdict.rationale} Model's account of what changed: ${match.whatChanged}`,
      evidence: mapEvidence(match.evidence, index),
      taskWasRetested: match.taskWasRetested,
      confidence: match.confidence,
      createdAt: now,
    });
  }

  // Anything the model failed to mention is still accounted for. Silence about
  // a previous issue must not read as its disappearance.
  for (const issue of previous.issues) {
    if (matchedPrevious.has(issue.id)) continue;
    const verdict = classifyChange({
      previousIssue: issue,
      currentIssue: null,
      taskWasRetested: false,
    });
    comparisons.push({
      id: newId("cmp"),
      projectId,
      previousEvaluationId: previous.evaluation.id,
      currentEvaluationId: current.evaluation.id,
      previousIssueId: issue.id,
      currentIssueId: null,
      status: verdict.status,
      rationale: `No counterpart was identified for this issue in the current round. ${verdict.rationale}`,
      evidence: [],
      taskWasRetested: false,
      confidence: "low",
      createdAt: now,
    });
  }

  for (const issue of current.issues) {
    if (matchedCurrent.has(issue.id)) continue;
    comparisons.push({
      id: newId("cmp"),
      projectId,
      previousEvaluationId: previous.evaluation.id,
      currentEvaluationId: current.evaluation.id,
      previousIssueId: null,
      currentIssueId: issue.id,
      status: "new_issue",
      rationale: "This issue has no counterpart in the previous round.",
      evidence: [],
      taskWasRetested: true,
      confidence: "moderate",
      createdAt: now,
    });
  }

  return {
    comparisons,
    notComparable: data.notComparable,
    overallAssessment: data.overallAssessment,
  };
}

function renderIssues(issues: UXIssue[]): string {
  if (issues.length === 0) return "(no issues recorded)";
  return issues
    .map((issue) => {
      const lines = [
        `- "${issue.name}" (severity ${issue.severity}, ${issue.affectedParticipantCount} of ${issue.totalParticipantsConsidered} participants)`,
        `    task: ${issue.affectedTask ?? "unspecified"}`,
        `    description: ${issue.description}`,
      ];
      if (issue.observedBehavior) lines.push(`    observed: ${issue.observedBehavior}`);
      for (const evidence of issue.evidence.filter((e) => e.verification.status === "verified")) {
        lines.push(`    evidence: "${evidence.quote}"`);
      }
      return lines.join("\n");
    })
    .join("\n");
}
