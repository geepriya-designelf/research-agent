/**
 * The research domain model.
 *
 * These are storage/domain entities — plain data, no IO, no React. LLM output
 * shapes live in `src/schemas` and are mapped into these types by the pipeline
 * so that a change in prompt/response shape never silently changes what we
 * persist.
 *
 * The chain the whole product exists to preserve:
 *   Source -> Evidence -> Synthesis -> Theme -> UX Finding -> Interpretation
 *   -> Hypothesis/Recommendation -> Evaluation -> Updated Knowledge
 */

import type { ResearchStage, ResearchType } from "./taxonomy";

// ---------------------------------------------------------------------------
// Epistemic status — the single most important field in this model.
// ---------------------------------------------------------------------------

/**
 * How a claim relates to the source material.
 * - `participant_stated`: the participant said it, in substance, in the source.
 * - `observed`: a behaviour recorded in the material (usability observation).
 * - `researcher_observation`: a note made by the researcher/moderator.
 * - `inferred`: a reasonable reading of what was said/done, not stated.
 * - `interpretation`: analyst-level meaning-making. Always the analyst's claim.
 */
export const EPISTEMIC_STATUSES = [
  "participant_stated",
  "observed",
  "researcher_observation",
  "inferred",
  "interpretation",
] as const;
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];

export const CONFIDENCE_LEVELS = ["low", "moderate", "high"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const PATTERN_STRENGTHS = ["weak", "emerging", "moderate", "strong"] as const;
export type PatternStrength = (typeof PATTERN_STRENGTHS)[number];

// ---------------------------------------------------------------------------
// Project / Study
// ---------------------------------------------------------------------------

export interface ResearchQuestion {
  id: string;
  projectId: string;
  text: string;
  order: number;
}

export interface Project {
  id: string;
  name: string;
  /** The problem being solved. Steers relevance during every analysis. */
  problemStatement: string;
  researchGoal: string;
  hypotheses: string[];
  targetPopulation: string | null;
  participantCriteria: string | null;
  productOrExperience: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Study {
  id: string;
  projectId: string;
  name: string;
  researchType: ResearchType;
  /** Free text when researchType === "other". */
  researchTypeCustom: string | null;
  researchStage: ResearchStage;
  researchStageCustom: string | null;
  /** Study-specific goal; falls back to the project goal when absent. */
  studyGoal: string | null;
  productVersion: string | null;
  /** Tasks participants were asked to perform (usability / evaluation studies). */
  plannedTasks: string[];
  /**
   * The researcher must confirm the classification before analysis. Nothing in
   * the pipeline runs while this is false.
   */
  classificationConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Research material
// ---------------------------------------------------------------------------

export type SourceKind = "upload" | "paste";

export interface Transcript {
  id: string;
  studyId: string;
  projectId: string;
  /** Researcher-facing name. Defaults to the original filename. */
  name: string;
  originalFilename: string | null;
  mimeType: string | null;
  sourceKind: SourceKind;
  /** Path in Supabase Storage for the untouched original, when uploaded. */
  storagePath: string | null;
  /** Normalized plain text. The `rawText` is preserved separately. */
  normalizedText: string;
  /** Text exactly as extracted, before normalization. Never overwritten. */
  rawText: string;
  extractionWarnings: string[];
  participantId: string | null;
  createdAt: string;
}

/**
 * An addressable slice of a transcript. Every quote and every insight resolves
 * to one or more of these, which is what makes "Theme -> Participant ->
 * Insight -> Original Evidence" navigable.
 */
export interface TranscriptSegment {
  id: string;
  transcriptId: string;
  /** 0-based index in reading order. */
  index: number;
  /** 1-based inclusive line numbers within `normalizedText`. */
  startLine: number;
  endLine: number;
  /** Character offsets into `normalizedText`, for exact-span highlighting. */
  startChar: number;
  endChar: number;
  speaker: string | null;
  speakerRole: SpeakerRole;
  /** e.g. "00:14:32" when present in the source. Null when the source has none. */
  timestamp: string | null;
  text: string;
}

export type SpeakerRole = "participant" | "interviewer" | "observer" | "unknown";

export interface Participant {
  id: string;
  studyId: string;
  projectId: string;
  /** P01, P02, ... */
  code: string;
  /** Name if the source carried one. Never invented. */
  displayName: string | null;
  /**
   * Only demographics literally supported by the material. Each entry carries
   * its own evidence. An empty map means "not stated", never "unknown person".
   */
  demographics: DemographicFact[];
  backgroundContext: string | null;
  createdAt: string;
}

export interface DemographicFact {
  field: string;
  value: string;
  evidence: EvidenceRef[];
}

// ---------------------------------------------------------------------------
// Evidence & provenance
// ---------------------------------------------------------------------------

/**
 * A pointer back into source material. `quote` must appear in the referenced
 * segment(s) — verified by `verifyEvidence` before anything is persisted.
 */
export interface EvidenceRef {
  id: string;
  transcriptId: string;
  segmentIds: string[];
  /** Verbatim text from the transcript. Never paraphrased, never invented. */
  quote: string;
  startLine: number | null;
  endLine: number | null;
  timestamp: string | null;
  /**
   * Set when the model produced a quote that could not be located verbatim in
   * the source. Such evidence is quarantined, not silently dropped, so the
   * researcher can see that the model tried to assert something ungrounded.
   */
  verification: EvidenceVerification;
}

export type EvidenceVerification =
  | { status: "verified"; matchedSegmentIds: string[] }
  | { status: "unverified"; reason: string };

// ---------------------------------------------------------------------------
// Participant-level synthesis
// ---------------------------------------------------------------------------

export const INSIGHT_CATEGORIES = [
  "pain_point",
  "need",
  "motivation",
  "behavior",
  "goal",
  "barrier",
  "workaround",
  "frustration",
  "decision_factor",
  "expectation",
  "unmet_need",
  "mental_model",
  "attitude",
  "context",
  "contradiction",
  "surprise",
  "question_raised",
] as const;
export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

export interface Insight {
  id: string;
  synthesisId: string;
  participantId: string;
  studyId: string;
  projectId: string;
  category: InsightCategory;
  /** One sentence, in the participant's frame of reference. */
  statement: string;
  /** Why this matters given the research problem. Analyst voice. */
  interpretation: string | null;
  epistemicStatus: EpistemicStatus;
  confidence: Confidence;
  evidence: EvidenceRef[];
  /** Which research question(s) this speaks to, if any. */
  relatedResearchQuestionIds: string[];
}

export interface TaskOutcome {
  id: string;
  synthesisId: string;
  taskLabel: string;
  taskGoal: string | null;
  participantExpectation: string | null;
  observedBehavior: string | null;
  outcome: "success" | "success_with_difficulty" | "partial" | "failure" | "abandoned" | "not_attempted" | "unknown";
  assistanceRequired: boolean | null;
  errors: string[];
  hesitations: string[];
  confusions: string[];
  workarounds: string[];
  evidence: EvidenceRef[];
}

export interface ParticipantSynthesis {
  id: string;
  projectId: string;
  studyId: string;
  transcriptId: string;
  participantId: string;
  /** Snapshot of the frame used, so a synthesis stays readable after edits. */
  frameSnapshot: ResearchFrame;
  overallSummary: string;
  /** What the participant reported about themselves — their own framing. */
  participantReported: string[];
  /** What was observed, when the material contains observation. */
  observedBehaviorSummary: string | null;
  insights: Insight[];
  taskOutcomes: TaskOutcome[];
  notableQuotes: EvidenceRef[];
  contradictions: SynthesisContradiction[];
  openQuestions: string[];
  /** Things the model considered and explicitly could not support. */
  notSupportedByEvidence: string[];
  modelNotes: string | null;
  createdAt: string;
}

export interface SynthesisContradiction {
  id: string;
  description: string;
  /** Both sides preserved. We never resolve a contradiction on the model's say-so. */
  sideA: { statement: string; evidence: EvidenceRef[] };
  sideB: { statement: string; evidence: EvidenceRef[] };
  possibleReading: string | null;
}

// ---------------------------------------------------------------------------
// Research frame
// ---------------------------------------------------------------------------

export interface ResearchFrame {
  projectId: string;
  studyId: string;
  projectName: string;
  problemStatement: string;
  researchGoal: string;
  researchQuestions: { id: string; text: string }[];
  hypotheses: string[];
  researchType: ResearchType;
  researchTypeLabel: string;
  researchStage: ResearchStage;
  researchStageLabel: string;
  participantCount: number;
  transcriptCount: number;
  targetPopulation: string | null;
  participantCriteria: string | null;
  productOrExperience: string | null;
  productVersion: string | null;
  plannedTasks: string[];
  dataSources: { transcriptId: string; name: string; sourceKind: SourceKind }[];
  /** Demographics actually present across participants — never inferred. */
  observedDemographicFields: string[];
  missingInformation: string[];
  limitations: string[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export interface Theme {
  id: string;
  projectId: string;
  /** Themes may span studies; scope records what they were derived from. */
  studyIds: string[];
  name: string;
  description: string;
  /** The underlying experience, not the topic. See docs/theming-quality. */
  underlyingInsight: string;
  /** Why these observations belong together — required, not decorative. */
  whyMeaningful: string;
  supportingParticipantIds: string[];
  participantCount: number;
  /** Denominator for honest frequency language. */
  totalParticipantsConsidered: number;
  supportingInsightIds: string[];
  evidence: ThemeEvidence[];
  counterEvidence: ThemeEvidence[];
  outlierParticipantIds: string[];
  outlierNotes: string | null;
  confidence: Confidence;
  patternStrength: PatternStrength;
  relationToResearchProblem: string;
  potentialImplication: string | null;
  /** Set when the pattern cuts against a stated hypothesis. */
  challengesHypotheses: string[];
  createdAt: string;
  supersedesThemeId: string | null;
}

export interface ThemeEvidence {
  id: string;
  themeId: string;
  participantId: string;
  synthesisId: string | null;
  insightId: string | null;
  transcriptId: string;
  evidence: EvidenceRef;
  /** Why this specific evidence supports (or cuts against) the theme. */
  rationale: string;
}

/** Patterns the theming pass considered and deliberately did not promote. */
export interface RejectedPattern {
  id: string;
  projectId: string;
  studyIds: string[];
  label: string;
  reason: string;
  participantIds: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// UX evaluation
// ---------------------------------------------------------------------------

export interface UXEvaluation {
  id: string;
  projectId: string;
  studyId: string;
  /** 1-based round number within the project. */
  round: number;
  label: string;
  productVersion: string | null;
  researchGoal: string;
  tasksEvaluated: string[];
  participantIds: string[];
  previousEvaluationId: string | null;
  createdAt: string;
}

export const SEVERITY_LEVELS = [0, 1, 2, 3, 4] as const;
export type Severity = (typeof SEVERITY_LEVELS)[number];

export const SEVERITY_LABELS: Record<Severity, string> = {
  0: "No usability problem",
  1: "Minor friction",
  2: "Moderate usability problem",
  3: "Major usability problem",
  4: "Critical blocker",
};

export interface UXIssue {
  id: string;
  evaluationId: string;
  projectId: string;
  studyId: string;
  name: string;
  description: string;
  affectedTask: string | null;
  affectedFlow: string | null;
  affectedParticipantIds: string[];
  affectedParticipantCount: number;
  totalParticipantsConsidered: number;
  /** Occurrences observed, when countable. Null when the material can't say. */
  occurrenceCount: number | null;
  severity: Severity;
  severityRationale: string;
  /** The pipeline: expectation -> observed -> actual experience -> cause. */
  userExpectation: string | null;
  observedBehavior: string | null;
  actualExperience: string | null;
  likelyCauseHypotheses: CauseHypothesis[];
  confidence: Confidence;
  evidence: EvidenceRef[];
  supportingQuoteIds: string[];
  relatedThemeIds: string[];
  relatedUserNeedIds: string[];
  designImplication: string | null;
  createdAt: string;
}

export interface CauseHypothesis {
  id: string;
  hypothesis: string;
  confidence: Confidence;
  /** What would confirm or falsify this. Keeps root cause honest. */
  wouldBeTestedBy: string | null;
  evidence: EvidenceRef[];
}

export interface UserNeed {
  id: string;
  projectId: string;
  statement: string;
  derivedFromIssueIds: string[];
  derivedFromThemeIds: string[];
  evidence: EvidenceRef[];
  confidence: Confidence;
  createdAt: string;
}

export const RECOMMENDATION_KINDS = ["recommendation", "hypothesis_to_test"] as const;
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

export interface Recommendation {
  id: string;
  projectId: string;
  evaluationId: string | null;
  kind: RecommendationKind;
  statement: string;
  /** The reasoning chain, kept explicit rather than collapsed into prose. */
  designPrinciple: string | null;
  addressesIssueIds: string[];
  addressesUserNeedIds: string[];
  relatedThemeIds: string[];
  /** Required when kind === "hypothesis_to_test". */
  howToValidate: string | null;
  evidenceStrength: Confidence;
  rationale: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Comparative evaluation & knowledge evolution
// ---------------------------------------------------------------------------

export const ISSUE_CHANGE_STATUSES = [
  "improved",
  "partially_improved",
  "unchanged",
  "regressed",
  "not_observed",
  "new_issue",
] as const;
export type IssueChangeStatus = (typeof ISSUE_CHANGE_STATUSES)[number];

export interface IssueComparison {
  id: string;
  projectId: string;
  previousEvaluationId: string;
  currentEvaluationId: string;
  previousIssueId: string | null;
  currentIssueId: string | null;
  status: IssueChangeStatus;
  rationale: string;
  evidence: EvidenceRef[];
  /**
   * True only when the current round actually exercised the same task with
   * enough coverage to say something. When false, `not_observed` must not be
   * read as "resolved" — the UI says so explicitly.
   */
  taskWasRetested: boolean;
  confidence: Confidence;
  createdAt: string;
}

export interface KnowledgeUpdate {
  id: string;
  projectId: string;
  subjectKind: "theme" | "ux_issue" | "finding";
  subjectId: string;
  previousUnderstanding: string;
  newEvidenceSummary: string;
  whatChanged: string;
  reasonForChange: string;
  updatedUnderstanding: string;
  /** Nothing is overwritten until a human accepts it. */
  reviewStatus: "pending_review" | "accepted" | "rejected";
  evidence: EvidenceRef[];
  createdAt: string;
}

export interface Finding {
  id: string;
  projectId: string;
  studyIds: string[];
  statement: string;
  supportingThemeIds: string[];
  supportingIssueIds: string[];
  confidence: Confidence;
  evidence: EvidenceRef[];
  openQuestions: string[];
  createdAt: string;
}
