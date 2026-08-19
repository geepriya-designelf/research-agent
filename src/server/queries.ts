/**
 * Read models for the UI.
 *
 * Kept out of the components so the dashboard's four questions — what do we
 * know, what supports it, what are we unsure about, what changed — are computed
 * in one place with the same honesty rules as the pipeline.
 */

import { mustNotClaimResolved } from "@/domain/comparison";
import { verifiedOnly } from "@/domain/evidence";
import type {
  IssueComparison,
  Participant,
  ParticipantSynthesis,
  Project,
  Study,
  Theme,
  Transcript,
  UXEvaluation,
  UXIssue,
} from "@/domain/model";
import { getStore } from "@/server/store";
import type { JobRecord } from "@/server/store/types";

export interface StudyOverview {
  study: Study;
  transcripts: Transcript[];
  participants: Participant[];
  syntheses: ParticipantSynthesis[];
  themeCount: number;
}

export interface ProjectOverview {
  project: Project;
  researchQuestions: { id: string; text: string }[];
  studies: StudyOverview[];
  participantCount: number;
  transcriptCount: number;
  synthesisCount: number;
  themes: Theme[];
  issues: UXIssue[];
  evaluations: UXEvaluation[];
  latestEvaluation: UXEvaluation | null;
  changesSincePrevious: IssueComparison[];
  openQuestions: string[];
  /** Anything a reader should not take as settled. */
  uncertainties: string[];
  jobs: JobRecord[];
}

export async function loadProjectOverview(projectId: string): Promise<ProjectOverview | null> {
  const store = getStore();
  const project = await store.getProject(projectId);
  if (!project) return null;

  const [researchQuestions, studies, themes, evaluations, jobs] = await Promise.all([
    store.listResearchQuestions(projectId),
    store.listStudies(projectId),
    store.listThemes(projectId),
    store.listEvaluations(projectId),
    store.listJobs(projectId),
  ]);

  const studyOverviews: StudyOverview[] = await Promise.all(
    studies.map(async (study) => {
      const [transcripts, participants, syntheses, studyThemes] = await Promise.all([
        store.listTranscripts(study.id),
        store.listParticipants(study.id),
        store.listSyntheses(study.id),
        store.listThemes(projectId, study.id),
      ]);
      return { study, transcripts, participants, syntheses, themeCount: studyThemes.length };
    }),
  );

  const latestEvaluation = evaluations.length > 0 ? evaluations[evaluations.length - 1] : null;
  const issues = latestEvaluation ? await store.listIssues(latestEvaluation.id) : [];
  const changesSincePrevious = latestEvaluation
    ? await store.listComparisons(latestEvaluation.id)
    : [];

  const syntheses = studyOverviews.flatMap((s) => s.syntheses);

  const openQuestions = Array.from(
    new Set([
      ...syntheses.flatMap((s) => s.openQuestions),
      ...themes
        .filter((t) => t.patternStrength === "weak" || t.patternStrength === "emerging")
        .map((t) => `Is "${t.name}" a real pattern? It is currently ${t.patternStrength}.`),
    ]),
  );

  const uncertainties: string[] = [];
  const unverifiedThemeEvidence = themes.filter((t) =>
    t.evidence.some((e) => e.evidence.verification.status !== "verified"),
  );
  if (unverifiedThemeEvidence.length > 0) {
    uncertainties.push(
      `${unverifiedThemeEvidence.length} theme(s) cite at least one quote that could not be verified against the source transcripts.`,
    );
  }
  const contestedThemes = themes.filter((t) => t.counterEvidence.length > 0);
  if (contestedThemes.length > 0) {
    uncertainties.push(
      `${contestedThemes.length} theme(s) have counter-evidence: ${contestedThemes.map((t) => t.name).join("; ")}.`,
    );
  }
  const notObserved = changesSincePrevious.filter((c) => mustNotClaimResolved(c.status));
  if (notObserved.length > 0) {
    uncertainties.push(
      `${notObserved.length} previous issue(s) were not observed in the latest round. Not observed is not the same as resolved.`,
    );
  }
  const contradictionCount = syntheses.reduce((n, s) => n + s.contradictions.length, 0);
  if (contradictionCount > 0) {
    uncertainties.push(
      `${contradictionCount} participant-level contradiction(s) are preserved unresolved across the syntheses.`,
    );
  }
  for (const synthesis of syntheses) {
    for (const item of synthesis.notSupportedByEvidence) uncertainties.push(item);
  }

  return {
    project,
    researchQuestions,
    studies: studyOverviews,
    participantCount: studyOverviews.reduce((n, s) => n + s.participants.length, 0),
    transcriptCount: studyOverviews.reduce((n, s) => n + s.transcripts.length, 0),
    synthesisCount: syntheses.length,
    themes,
    issues,
    evaluations,
    latestEvaluation,
    changesSincePrevious,
    openQuestions,
    uncertainties: Array.from(new Set(uncertainties)).slice(0, 12),
    jobs,
  };
}

/**
 * Strongest findings for the dashboard. Ranked by pattern strength and verified
 * evidence — never by how many participants said it, which would reward
 * repetition over substance.
 */
export function rankThemes(themes: Theme[]): Theme[] {
  const strengthRank = { strong: 3, moderate: 2, emerging: 1, weak: 0 } as const;
  return [...themes].sort((a, b) => {
    const byStrength = strengthRank[b.patternStrength] - strengthRank[a.patternStrength];
    if (byStrength !== 0) return byStrength;
    const aVerified = a.evidence.filter((e) => verifiedOnly([e.evidence]).length > 0).length;
    const bVerified = b.evidence.filter((e) => verifiedOnly([e.evidence]).length > 0).length;
    return bVerified - aVerified;
  });
}

export function rankIssues(issues: UXIssue[]): UXIssue[] {
  return [...issues].sort((a, b) => b.severity - a.severity);
}
