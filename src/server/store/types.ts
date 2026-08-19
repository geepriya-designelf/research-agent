/**
 * Persistence boundary.
 *
 * Domain and pipeline code depends on this interface, never on Supabase. That
 * keeps the research logic testable without a database and lets the file-backed
 * store serve local development, while production runs on Postgres/Supabase.
 */

import type {
  Finding,
  IssueComparison,
  KnowledgeUpdate,
  Participant,
  ParticipantSynthesis,
  Project,
  Recommendation,
  RejectedPattern,
  ResearchQuestion,
  Study,
  Theme,
  Transcript,
  TranscriptSegment,
  UserNeed,
  UXEvaluation,
  UXIssue,
} from "@/domain/model";

export type NewProject = Omit<Project, "id" | "createdAt" | "updatedAt">;
export type NewStudy = Omit<Study, "id" | "createdAt" | "updatedAt">;
export type NewTranscript = Omit<Transcript, "id" | "createdAt">;
export type NewParticipant = Omit<Participant, "id" | "createdAt">;

export interface ThemingRun {
  projectId: string;
  studyId: string;
  themes: Theme[];
  rejectedPatterns: RejectedPattern[];
  crossCuttingObservations: string[];
  divergences: string[];
  openQuestions: string[];
  createdAt: string;
}

export interface EvaluationBundle {
  evaluation: UXEvaluation;
  issues: UXIssue[];
  userNeeds: UserNeed[];
  recommendations: Recommendation[];
  tasksNotExercised: string[];
  limitations: string[];
}

export type JobKind = "synthesis" | "theming" | "ux_evaluation" | "comparison";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface JobRecord {
  id: string;
  projectId: string;
  studyId: string | null;
  kind: JobKind;
  status: JobStatus;
  /** e.g. the transcript being synthesised. */
  subjectId: string | null;
  subjectLabel: string | null;
  error: string | null;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchStore {
  // Projects -------------------------------------------------------------
  createProject(input: NewProject): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  updateProject(id: string, patch: Partial<NewProject>): Promise<Project>;

  setResearchQuestions(projectId: string, texts: string[]): Promise<ResearchQuestion[]>;
  listResearchQuestions(projectId: string): Promise<ResearchQuestion[]>;

  // Studies --------------------------------------------------------------
  createStudy(input: NewStudy): Promise<Study>;
  getStudy(id: string): Promise<Study | null>;
  listStudies(projectId: string): Promise<Study[]>;
  updateStudy(id: string, patch: Partial<NewStudy>): Promise<Study>;

  // Material -------------------------------------------------------------
  createTranscript(input: NewTranscript, segments: TranscriptSegment[]): Promise<Transcript>;
  getTranscript(id: string): Promise<Transcript | null>;
  listTranscripts(studyId: string): Promise<Transcript[]>;
  listSegments(transcriptId: string): Promise<TranscriptSegment[]>;
  attachParticipantToTranscript(transcriptId: string, participantId: string): Promise<void>;

  createParticipant(input: NewParticipant): Promise<Participant>;
  updateParticipant(id: string, patch: Partial<NewParticipant>): Promise<Participant>;
  getParticipant(id: string): Promise<Participant | null>;
  listParticipants(studyId: string): Promise<Participant[]>;

  // Analysis -------------------------------------------------------------
  saveSynthesis(synthesis: ParticipantSynthesis): Promise<ParticipantSynthesis>;
  getSynthesis(id: string): Promise<ParticipantSynthesis | null>;
  getSynthesisByTranscript(transcriptId: string): Promise<ParticipantSynthesis | null>;
  listSyntheses(studyId: string): Promise<ParticipantSynthesis[]>;
  listSynthesesForProject(projectId: string): Promise<ParticipantSynthesis[]>;

  saveThemingRun(run: ThemingRun): Promise<void>;
  listThemes(projectId: string, studyId?: string): Promise<Theme[]>;
  getTheme(id: string): Promise<Theme | null>;
  listRejectedPatterns(projectId: string, studyId?: string): Promise<RejectedPattern[]>;
  getLatestThemingRun(studyId: string): Promise<ThemingRun | null>;

  saveEvaluation(bundle: EvaluationBundle): Promise<void>;
  getEvaluation(id: string): Promise<EvaluationBundle | null>;
  listEvaluations(projectId: string): Promise<UXEvaluation[]>;
  listIssues(evaluationId: string): Promise<UXIssue[]>;
  listIssuesForProject(projectId: string): Promise<UXIssue[]>;

  saveComparisons(comparisons: IssueComparison[]): Promise<void>;
  listComparisons(currentEvaluationId: string): Promise<IssueComparison[]>;

  saveKnowledgeUpdate(update: KnowledgeUpdate): Promise<void>;
  listKnowledgeUpdates(projectId: string): Promise<KnowledgeUpdate[]>;

  saveFinding(finding: Finding): Promise<void>;
  listFindings(projectId: string): Promise<Finding[]>;

  // Jobs -----------------------------------------------------------------
  createJob(input: Omit<JobRecord, "id" | "createdAt" | "updatedAt">): Promise<JobRecord>;
  updateJob(id: string, patch: Partial<Omit<JobRecord, "id" | "createdAt">>): Promise<JobRecord>;
  listJobs(projectId: string): Promise<JobRecord[]>;
}
