/**
 * Stage 2 — Research Theming (cross-participant).
 *
 * Themes are computed from completed syntheses, not from raw transcripts: the
 * per-participant understanding has to exist before comparison is meaningful,
 * and it keeps the context per call bounded.
 *
 * The model proposes pattern strength; `applyThemingGuardrails` reconciles that
 * against actual coverage and verified evidence, and demotes anything that does
 * not qualify as a theme into the rejected-pattern list.
 */

import { newId } from "@/domain/ids";
import { hasGrounding, verifiedOnly } from "@/domain/evidence";
import { derivePatternStrength, detectOvergeneralization, qualifiesAsTheme } from "@/domain/frequency";
import type {
  ParticipantSynthesis,
  RejectedPattern,
  ResearchFrame,
  Theme,
  ThemeEvidence,
  TranscriptSegment,
} from "@/domain/model";
import { zThemingResult } from "@/schemas/theming";
import { generateStructured } from "../structured";
import { THEMING_SYSTEM } from "../prompts/theming";
import { renderFrame } from "../prompts/shared";
import { buildSegmentIndex, mapEvidence } from "./mapEvidence";

export interface ThemingJobInput {
  frame: ResearchFrame;
  syntheses: ParticipantSynthesis[];
  participants: { id: string; code: string }[];
  transcripts: { transcriptId: string; name: string; segments: TranscriptSegment[] }[];
}

export interface ThemingJobOutput {
  themes: Theme[];
  rejectedPatterns: RejectedPattern[];
  crossCuttingObservations: string[];
  divergences: string[];
  openQuestions: string[];
  /** Themes the guardrails demoted, with the reason. */
  demotions: { name: string; reason: string }[];
  overgeneralizations: { themeName: string; phrases: string[] }[];
  fabricationWarnings: { where: string; quote: string; reason: string }[];
}

export async function runTheming(input: ThemingJobInput): Promise<ThemingJobOutput> {
  const { frame, syntheses, participants, transcripts } = input;

  const codeById = new Map(participants.map((p) => [p.id, p.code]));
  const idByCode = new Map(participants.map((p) => [p.code, p.id]));

  const userContent = [
    renderFrame(frame),
    "",
    "## Participant syntheses",
    "",
    syntheses.map((s) => renderSynthesisForTheming(s, codeById.get(s.participantId) ?? "P??")).join("\n\n"),
    "",
    `There are ${participants.length} participants in scope. When you state frequency, the denominator is ${participants.length}.`,
  ].join("\n");

  const { data } = await generateStructured({
    stage: "theming",
    schema: zThemingResult,
    system: THEMING_SYSTEM,
    userContent,
  });

  const index = buildSegmentIndex(transcripts);
  const fabricationWarnings: ThemingJobOutput["fabricationWarnings"] = [];
  const demotions: ThemingJobOutput["demotions"] = [];
  const overgeneralizations: ThemingJobOutput["overgeneralizations"] = [];

  const themes: Theme[] = [];
  const rejectedPatterns: RejectedPattern[] = data.rejectedPatterns.map((raw) => ({
    id: newId("thm"),
    projectId: frame.projectId,
    studyIds: [frame.studyId],
    label: raw.label,
    reason: raw.reason,
    participantIds: raw.participants.map((code) => idByCode.get(code) ?? code),
    createdAt: new Date().toISOString(),
  }));

  const now = new Date().toISOString();
  const insightIdByStatement = buildInsightLookup(syntheses);

  for (const raw of data.themes) {
    const themeId = newId("thm");

    const evidence = raw.evidence.map((e) =>
      toThemeEvidence(e, themeId, idByCode, syntheses, insightIdByStatement, index, fabricationWarnings),
    );
    const counterEvidence = raw.counterEvidence.map((e) =>
      toThemeEvidence(e, themeId, idByCode, syntheses, insightIdByStatement, index, fabricationWarnings),
    );

    const supportingParticipantIds = raw.supportingParticipants
      .map((code) => idByCode.get(code))
      .filter((id): id is string => Boolean(id));

    const verifiedCount = evidence.filter((e) => hasGrounding([e.evidence])).length;

    // Guardrail 1: does this actually clear the bar for being a theme?
    if (
      !qualifiesAsTheme({
        supportingParticipants: supportingParticipantIds.length,
        verifiedEvidenceCount: verifiedCount,
      })
    ) {
      const reason =
        supportingParticipantIds.length < 2
          ? `Only ${supportingParticipantIds.length} participant(s) support this. A single participant is an outlier worth preserving, not a theme.`
          : `Only ${verifiedCount} piece(s) of evidence could be verified against the source transcripts, which is not enough to call this a pattern.`;
      demotions.push({ name: raw.name, reason });
      rejectedPatterns.push({
        id: newId("thm"),
        projectId: frame.projectId,
        studyIds: [frame.studyId],
        label: raw.name,
        reason: `Demoted by evidence guardrail: ${reason}`,
        participantIds: supportingParticipantIds,
        createdAt: now,
      });
      continue;
    }

    // Guardrail 2: pattern strength is recomputed from coverage and evidence.
    // The model may not rate a thinly-supported pattern as strong.
    const derivedStrength = derivePatternStrength({
      supportingParticipants: supportingParticipantIds.length,
      totalParticipants: participants.length,
      verifiedEvidenceCount: verifiedCount,
      counterEvidenceCount: counterEvidence.length,
    });
    const strengthOrder = ["weak", "emerging", "moderate", "strong"] as const;
    const patternStrength =
      strengthOrder.indexOf(raw.patternStrength) > strengthOrder.indexOf(derivedStrength)
        ? derivedStrength
        : raw.patternStrength;

    // Guardrail 3: flag majority/statistical language for the researcher.
    const phrases = Array.from(
      new Set([
        ...detectOvergeneralization(raw.name),
        ...detectOvergeneralization(raw.description),
        ...detectOvergeneralization(raw.underlyingInsight),
        ...detectOvergeneralization(raw.whyMeaningful),
      ]),
    );
    if (phrases.length > 0) overgeneralizations.push({ themeName: raw.name, phrases });

    themes.push({
      id: themeId,
      projectId: frame.projectId,
      studyIds: [frame.studyId],
      name: raw.name,
      description: raw.description,
      underlyingInsight: raw.underlyingInsight,
      whyMeaningful: raw.whyMeaningful,
      supportingParticipantIds,
      participantCount: supportingParticipantIds.length,
      totalParticipantsConsidered: participants.length,
      supportingInsightIds: evidence
        .map((e) => e.insightId)
        .filter((id): id is string => Boolean(id)),
      evidence,
      counterEvidence,
      outlierParticipantIds: raw.outlierParticipants
        .map((code) => idByCode.get(code))
        .filter((id): id is string => Boolean(id)),
      outlierNotes: raw.outlierNotes,
      confidence: raw.confidence,
      patternStrength,
      relationToResearchProblem: raw.relationToResearchProblem,
      potentialImplication: raw.potentialImplication,
      challengesHypotheses: raw.challengesHypotheses,
      createdAt: now,
      supersedesThemeId: null,
    });
  }

  return {
    themes,
    rejectedPatterns,
    crossCuttingObservations: data.crossCuttingObservations,
    divergences: data.divergences,
    openQuestions: data.openQuestions,
    demotions,
    overgeneralizations,
    fabricationWarnings,
  };
}

function toThemeEvidence(
  raw: { participantCode: string; insightStatement: string; rationale: string; evidence: unknown },
  themeId: string,
  idByCode: Map<string, string>,
  syntheses: ParticipantSynthesis[],
  insightIdByStatement: Map<string, { insightId: string; synthesisId: string }>,
  index: ReturnType<typeof buildSegmentIndex>,
  warnings: ThemingJobOutput["fabricationWarnings"],
): ThemeEvidence {
  const participantId = idByCode.get(raw.participantCode) ?? raw.participantCode;
  const synthesis = syntheses.find((s) => s.participantId === participantId) ?? null;
  const link = insightIdByStatement.get(normalizeStatement(raw.insightStatement)) ?? null;

  const mapped = mapEvidence(raw.evidence as never, index);
  for (const item of mapped) {
    if (item.verification.status !== "verified") {
      warnings.push({
        where: `theme evidence (${raw.participantCode})`,
        quote: item.quote,
        reason: item.verification.reason,
      });
    }
  }
  const chosen = verifiedOnly(mapped)[0] ?? mapped[0];

  return {
    id: newId("tev"),
    themeId,
    participantId,
    synthesisId: link?.synthesisId ?? synthesis?.id ?? null,
    insightId: link?.insightId ?? null,
    transcriptId: chosen?.transcriptId ?? synthesis?.transcriptId ?? "",
    evidence: chosen ?? {
      id: newId("evd"),
      transcriptId: synthesis?.transcriptId ?? "",
      segmentIds: [],
      quote: "",
      startLine: null,
      endLine: null,
      timestamp: null,
      verification: { status: "unverified", reason: "No quote supplied for this theme evidence." },
    },
    rationale: raw.rationale,
  };
}

function buildInsightLookup(
  syntheses: ParticipantSynthesis[],
): Map<string, { insightId: string; synthesisId: string }> {
  const map = new Map<string, { insightId: string; synthesisId: string }>();
  for (const synthesis of syntheses) {
    for (const insight of synthesis.insights) {
      map.set(normalizeStatement(insight.statement), {
        insightId: insight.id,
        synthesisId: synthesis.id,
      });
    }
  }
  return map;
}

function normalizeStatement(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function renderSynthesisForTheming(synthesis: ParticipantSynthesis, code: string): string {
  const lines: string[] = [];
  lines.push(`### ${code} (synthesis ${synthesis.id}, transcript ${synthesis.transcriptId})`);
  lines.push(`Summary: ${synthesis.overallSummary}`);
  if (synthesis.observedBehaviorSummary) {
    lines.push(`Observed behaviour: ${synthesis.observedBehaviorSummary}`);
  }
  lines.push("");
  lines.push("Insights:");
  for (const insight of synthesis.insights) {
    lines.push(
      `- [${insight.category} | ${insight.epistemicStatus} | confidence ${insight.confidence}] ${insight.statement}`,
    );
    if (insight.interpretation) lines.push(`    interpretation: ${insight.interpretation}`);
    for (const evidence of verifiedOnly(insight.evidence)) {
      const anchor = evidence.startLine ? `L${evidence.startLine}-${evidence.endLine}` : "unanchored";
      lines.push(`    evidence [${anchor}]: "${evidence.quote}"`);
    }
  }
  if (synthesis.taskOutcomes.length > 0) {
    lines.push("");
    lines.push("Task outcomes:");
    for (const task of synthesis.taskOutcomes) {
      lines.push(`- ${task.taskLabel}: ${task.outcome}`);
      if (task.participantExpectation) lines.push(`    expected: ${task.participantExpectation}`);
      if (task.observedBehavior) lines.push(`    observed: ${task.observedBehavior}`);
    }
  }
  if (synthesis.contradictions.length > 0) {
    lines.push("");
    lines.push("Contradictions (preserve these; do not resolve them):");
    for (const contradiction of synthesis.contradictions) {
      lines.push(`- ${contradiction.description}`);
      lines.push(`    A: ${contradiction.sideA.statement}`);
      lines.push(`    B: ${contradiction.sideB.statement}`);
    }
  }
  if (synthesis.notSupportedByEvidence.length > 0) {
    lines.push("");
    lines.push("Explicitly NOT supported by this participant's material:");
    for (const item of synthesis.notSupportedByEvidence) lines.push(`- ${item}`);
  }
  return lines.join("\n");
}
