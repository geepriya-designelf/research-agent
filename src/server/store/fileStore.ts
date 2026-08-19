/**
 * File-backed store for local development and tests.
 *
 * A single JSON document under `.data/`, written atomically. This exists so the
 * research pipeline can be developed, demoed and tested without provisioning
 * Postgres — not as a production store. `getStore()` selects Supabase whenever
 * its environment variables are present.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { newId, participantCode } from "@/domain/ids";
import type {
  Finding,
  IssueComparison,
  KnowledgeUpdate,
  Participant,
  ParticipantSynthesis,
  Project,
  RejectedPattern,
  ResearchQuestion,
  Study,
  Theme,
  Transcript,
  TranscriptSegment,
  UXEvaluation,
  UXIssue,
} from "@/domain/model";
import type {
  EvaluationBundle,
  JobRecord,
  NewParticipant,
  NewProject,
  NewStudy,
  NewTranscript,
  ResearchStore,
  ThemingRun,
} from "./types";

interface Db {
  projects: Project[];
  researchQuestions: ResearchQuestion[];
  studies: Study[];
  transcripts: Transcript[];
  segments: TranscriptSegment[];
  participants: Participant[];
  syntheses: ParticipantSynthesis[];
  themingRuns: ThemingRun[];
  themes: Theme[];
  rejectedPatterns: RejectedPattern[];
  evaluations: EvaluationBundle[];
  comparisons: IssueComparison[];
  knowledgeUpdates: KnowledgeUpdate[];
  findings: Finding[];
  jobs: JobRecord[];
}

const EMPTY: Db = {
  projects: [],
  researchQuestions: [],
  studies: [],
  transcripts: [],
  segments: [],
  participants: [],
  syntheses: [],
  themingRuns: [],
  themes: [],
  rejectedPatterns: [],
  evaluations: [],
  comparisons: [],
  knowledgeUpdates: [],
  findings: [],
  jobs: [],
};

export class FileStore implements ResearchStore {
  private db: Db | null = null;
  private loadedMtimeMs = -1;
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  /**
   * Re-reads whenever the file has changed since the last load. Next.js serves
   * requests from several worker processes, so an in-memory cache that never
   * revalidates would make one worker's writes invisible to the others.
   */
  private async load(): Promise<Db> {
    let mtimeMs = -1;
    try {
      mtimeMs = (await fs.stat(this.filePath)).mtimeMs;
    } catch {
      // No file yet.
    }

    if (this.db && mtimeMs === this.loadedMtimeMs) return this.db;

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.db = { ...structuredClone(EMPTY), ...(JSON.parse(raw) as Partial<Db>) };
    } catch {
      this.db = structuredClone(EMPTY);
    }
    this.loadedMtimeMs = mtimeMs;
    return this.db;
  }

  /** Serializes writes so concurrent job completions cannot interleave. */
  private async mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
    const run = this.writeChain.then(async () => {
      const db = await this.load();
      const result = await fn(db);
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
      await fs.rename(tmp, this.filePath);
      try {
        this.loadedMtimeMs = (await fs.stat(this.filePath)).mtimeMs;
      } catch {
        this.loadedMtimeMs = -1;
      }
      return result;
    });
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  // Projects ---------------------------------------------------------------

  async createProject(input: NewProject): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = { ...input, id: newId("prj"), createdAt: now, updatedAt: now };
    return this.mutate((db) => {
      db.projects.push(project);
      return project;
    });
  }

  async getProject(id: string): Promise<Project | null> {
    const db = await this.load();
    return db.projects.find((p) => p.id === id) ?? null;
  }

  async listProjects(): Promise<Project[]> {
    const db = await this.load();
    return [...db.projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateProject(id: string, patch: Partial<NewProject>): Promise<Project> {
    return this.mutate((db) => {
      const project = db.projects.find((p) => p.id === id);
      if (!project) throw new Error(`Project ${id} not found`);
      Object.assign(project, patch, { updatedAt: new Date().toISOString() });
      return project;
    });
  }

  async setResearchQuestions(projectId: string, texts: string[]): Promise<ResearchQuestion[]> {
    return this.mutate((db) => {
      db.researchQuestions = db.researchQuestions.filter((q) => q.projectId !== projectId);
      const created = texts
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text, order) => ({ id: newId("rq"), projectId, text, order }));
      db.researchQuestions.push(...created);
      return created;
    });
  }

  async listResearchQuestions(projectId: string): Promise<ResearchQuestion[]> {
    const db = await this.load();
    return db.researchQuestions.filter((q) => q.projectId === projectId).sort((a, b) => a.order - b.order);
  }

  // Studies ----------------------------------------------------------------

  async createStudy(input: NewStudy): Promise<Study> {
    const now = new Date().toISOString();
    const study: Study = { ...input, id: newId("std"), createdAt: now, updatedAt: now };
    return this.mutate((db) => {
      db.studies.push(study);
      return study;
    });
  }

  async getStudy(id: string): Promise<Study | null> {
    const db = await this.load();
    return db.studies.find((s) => s.id === id) ?? null;
  }

  async listStudies(projectId: string): Promise<Study[]> {
    const db = await this.load();
    return db.studies
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async updateStudy(id: string, patch: Partial<NewStudy>): Promise<Study> {
    return this.mutate((db) => {
      const study = db.studies.find((s) => s.id === id);
      if (!study) throw new Error(`Study ${id} not found`);
      Object.assign(study, patch, { updatedAt: new Date().toISOString() });
      return study;
    });
  }

  // Material ---------------------------------------------------------------

  async createTranscript(input: NewTranscript, segments: TranscriptSegment[]): Promise<Transcript> {
    const transcript: Transcript = { ...input, id: newId("trs"), createdAt: new Date().toISOString() };
    const rebound = segments.map((s) => ({ ...s, transcriptId: transcript.id }));
    return this.mutate((db) => {
      db.transcripts.push(transcript);
      db.segments.push(...rebound);
      return transcript;
    });
  }

  async getTranscript(id: string): Promise<Transcript | null> {
    const db = await this.load();
    return db.transcripts.find((t) => t.id === id) ?? null;
  }

  async listTranscripts(studyId: string): Promise<Transcript[]> {
    const db = await this.load();
    return db.transcripts
      .filter((t) => t.studyId === studyId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listSegments(transcriptId: string): Promise<TranscriptSegment[]> {
    const db = await this.load();
    return db.segments.filter((s) => s.transcriptId === transcriptId).sort((a, b) => a.index - b.index);
  }

  async attachParticipantToTranscript(transcriptId: string, participantId: string): Promise<void> {
    await this.mutate((db) => {
      const transcript = db.transcripts.find((t) => t.id === transcriptId);
      if (transcript) transcript.participantId = participantId;
    });
  }

  async createParticipant(input: NewParticipant): Promise<Participant> {
    return this.mutate((db) => {
      const existing = db.participants.filter((p) => p.studyId === input.studyId);
      const participant: Participant = {
        ...input,
        code: input.code || participantCode(existing.length),
        id: newId("par"),
        createdAt: new Date().toISOString(),
      };
      db.participants.push(participant);
      return participant;
    });
  }

  async updateParticipant(id: string, patch: Partial<NewParticipant>): Promise<Participant> {
    return this.mutate((db) => {
      const participant = db.participants.find((p) => p.id === id);
      if (!participant) throw new Error(`Participant ${id} not found`);
      Object.assign(participant, patch);
      return participant;
    });
  }

  async getParticipant(id: string): Promise<Participant | null> {
    const db = await this.load();
    return db.participants.find((p) => p.id === id) ?? null;
  }

  async listParticipants(studyId: string): Promise<Participant[]> {
    const db = await this.load();
    return db.participants.filter((p) => p.studyId === studyId).sort((a, b) => a.code.localeCompare(b.code));
  }

  // Analysis ---------------------------------------------------------------

  async saveSynthesis(synthesis: ParticipantSynthesis): Promise<ParticipantSynthesis> {
    return this.mutate((db) => {
      // Re-running synthesis replaces the previous result for that transcript.
      db.syntheses = db.syntheses.filter((s) => s.transcriptId !== synthesis.transcriptId);
      db.syntheses.push(synthesis);
      return synthesis;
    });
  }

  async getSynthesis(id: string): Promise<ParticipantSynthesis | null> {
    const db = await this.load();
    return db.syntheses.find((s) => s.id === id) ?? null;
  }

  async getSynthesisByTranscript(transcriptId: string): Promise<ParticipantSynthesis | null> {
    const db = await this.load();
    return db.syntheses.find((s) => s.transcriptId === transcriptId) ?? null;
  }

  async listSyntheses(studyId: string): Promise<ParticipantSynthesis[]> {
    const db = await this.load();
    return db.syntheses.filter((s) => s.studyId === studyId);
  }

  async listSynthesesForProject(projectId: string): Promise<ParticipantSynthesis[]> {
    const db = await this.load();
    return db.syntheses.filter((s) => s.projectId === projectId);
  }

  async saveThemingRun(run: ThemingRun): Promise<void> {
    await this.mutate((db) => {
      // Previous themes for the study are superseded, not deleted: the run
      // history is what makes knowledge evolution visible.
      db.themingRuns.push(run);
      db.themes = db.themes.filter((t) => !t.studyIds.includes(run.studyId));
      db.themes.push(...run.themes);
      db.rejectedPatterns = db.rejectedPatterns.filter((r) => !r.studyIds.includes(run.studyId));
      db.rejectedPatterns.push(...run.rejectedPatterns);
    });
  }

  async listThemes(projectId: string, studyId?: string): Promise<Theme[]> {
    const db = await this.load();
    return db.themes.filter(
      (t) => t.projectId === projectId && (!studyId || t.studyIds.includes(studyId)),
    );
  }

  async getTheme(id: string): Promise<Theme | null> {
    const db = await this.load();
    return db.themes.find((t) => t.id === id) ?? null;
  }

  async listRejectedPatterns(projectId: string, studyId?: string): Promise<RejectedPattern[]> {
    const db = await this.load();
    return db.rejectedPatterns.filter(
      (r) => r.projectId === projectId && (!studyId || r.studyIds.includes(studyId)),
    );
  }

  async getLatestThemingRun(studyId: string): Promise<ThemingRun | null> {
    const db = await this.load();
    const runs = db.themingRuns.filter((r) => r.studyId === studyId);
    return runs.length > 0 ? runs[runs.length - 1] : null;
  }

  async saveEvaluation(bundle: EvaluationBundle): Promise<void> {
    await this.mutate((db) => {
      db.evaluations.push(bundle);
    });
  }

  async getEvaluation(id: string): Promise<EvaluationBundle | null> {
    const db = await this.load();
    return db.evaluations.find((e) => e.evaluation.id === id) ?? null;
  }

  async listEvaluations(projectId: string): Promise<UXEvaluation[]> {
    const db = await this.load();
    return db.evaluations
      .filter((e) => e.evaluation.projectId === projectId)
      .map((e) => e.evaluation)
      .sort((a, b) => a.round - b.round);
  }

  async listIssues(evaluationId: string): Promise<UXIssue[]> {
    const db = await this.load();
    return db.evaluations.find((e) => e.evaluation.id === evaluationId)?.issues ?? [];
  }

  async listIssuesForProject(projectId: string): Promise<UXIssue[]> {
    const db = await this.load();
    return db.evaluations.filter((e) => e.evaluation.projectId === projectId).flatMap((e) => e.issues);
  }

  async saveComparisons(comparisons: IssueComparison[]): Promise<void> {
    await this.mutate((db) => {
      const currentIds = new Set(comparisons.map((c) => c.currentEvaluationId));
      db.comparisons = db.comparisons.filter((c) => !currentIds.has(c.currentEvaluationId));
      db.comparisons.push(...comparisons);
    });
  }

  async listComparisons(currentEvaluationId: string): Promise<IssueComparison[]> {
    const db = await this.load();
    return db.comparisons.filter((c) => c.currentEvaluationId === currentEvaluationId);
  }

  async saveKnowledgeUpdate(update: KnowledgeUpdate): Promise<void> {
    await this.mutate((db) => {
      db.knowledgeUpdates.push(update);
    });
  }

  async listKnowledgeUpdates(projectId: string): Promise<KnowledgeUpdate[]> {
    const db = await this.load();
    return db.knowledgeUpdates.filter((k) => k.projectId === projectId);
  }

  async saveFinding(finding: Finding): Promise<void> {
    await this.mutate((db) => {
      db.findings.push(finding);
    });
  }

  async listFindings(projectId: string): Promise<Finding[]> {
    const db = await this.load();
    return db.findings.filter((f) => f.projectId === projectId);
  }

  async createJob(input: Omit<JobRecord, "id" | "createdAt" | "updatedAt">): Promise<JobRecord> {
    const now = new Date().toISOString();
    const job: JobRecord = { ...input, id: newId("job"), createdAt: now, updatedAt: now };
    return this.mutate((db) => {
      db.jobs.push(job);
      return job;
    });
  }

  async updateJob(id: string, patch: Partial<Omit<JobRecord, "id" | "createdAt">>): Promise<JobRecord> {
    return this.mutate((db) => {
      const job = db.jobs.find((j) => j.id === id);
      if (!job) throw new Error(`Job ${id} not found`);
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      return job;
    });
  }

  async listJobs(projectId: string): Promise<JobRecord[]> {
    const db = await this.load();
    return db.jobs
      .filter((j) => j.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
