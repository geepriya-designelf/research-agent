/**
 * Supabase / Postgres implementation of the store.
 *
 * Uses the service role key from the Next.js server only. Row mapping is
 * explicit (snake_case <-> camelCase) rather than generated, so a schema change
 * shows up as a compile error rather than a silently missing field.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { newId, participantCode } from "@/domain/ids";
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

type Row = Record<string, unknown>;

export class SupabaseStore implements ResearchStore {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private async one<T>(table: string, row: Row, map: (r: Row) => T): Promise<T> {
    const { data, error } = await this.db.from(table).insert(row).select().single();
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
    return map(data as Row);
  }

  private async many<T>(
    table: string,
    build: (q: ReturnType<SupabaseClient["from"]>) => PromiseLike<{ data: unknown; error: unknown }>,
    map: (r: Row) => T,
  ): Promise<T[]> {
    const { data, error } = await build(this.db.from(table));
    if (error) throw new Error(`${table} query failed: ${(error as { message: string }).message}`);
    return ((data as Row[]) ?? []).map(map);
  }

  // Projects ---------------------------------------------------------------

  async createProject(input: NewProject): Promise<Project> {
    return this.one("projects", { id: newId("prj"), ...toProjectRow(input) }, toProject);
  }

  async getProject(id: string): Promise<Project | null> {
    const { data, error } = await this.db.from("projects").select().eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProject(data as Row) : null;
  }

  async listProjects(): Promise<Project[]> {
    return this.many("projects", (q) => q.select().order("created_at", { ascending: false }), toProject);
  }

  async updateProject(id: string, patch: Partial<NewProject>): Promise<Project> {
    const { data, error } = await this.db
      .from("projects")
      .update({ ...toProjectRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toProject(data as Row);
  }

  async setResearchQuestions(projectId: string, texts: string[]): Promise<ResearchQuestion[]> {
    await this.db.from("research_questions").delete().eq("project_id", projectId);
    const rows = texts
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, order) => ({ id: newId("rq"), project_id: projectId, text, order }));
    if (rows.length === 0) return [];
    const { data, error } = await this.db.from("research_questions").insert(rows).select();
    if (error) throw new Error(error.message);
    return (data as Row[]).map(toResearchQuestion);
  }

  async listResearchQuestions(projectId: string): Promise<ResearchQuestion[]> {
    return this.many(
      "research_questions",
      (q) => q.select().eq("project_id", projectId).order("order"),
      toResearchQuestion,
    );
  }

  // Studies ----------------------------------------------------------------

  async createStudy(input: NewStudy): Promise<Study> {
    return this.one("studies", { id: newId("std"), ...toStudyRow(input) }, toStudy);
  }

  async getStudy(id: string): Promise<Study | null> {
    const { data, error } = await this.db.from("studies").select().eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toStudy(data as Row) : null;
  }

  async listStudies(projectId: string): Promise<Study[]> {
    return this.many("studies", (q) => q.select().eq("project_id", projectId).order("created_at"), toStudy);
  }

  async updateStudy(id: string, patch: Partial<NewStudy>): Promise<Study> {
    const { data, error } = await this.db
      .from("studies")
      .update({ ...toStudyRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toStudy(data as Row);
  }

  // Material ---------------------------------------------------------------

  async createTranscript(input: NewTranscript, segments: TranscriptSegment[]): Promise<Transcript> {
    const id = newId("trs");
    const transcript = await this.one("transcripts", { id, ...toTranscriptRow(input) }, toTranscript);
    if (segments.length > 0) {
      const { error } = await this.db
        .from("transcript_segments")
        .insert(segments.map((s) => toSegmentRow({ ...s, transcriptId: id })));
      if (error) throw new Error(`transcript_segments insert failed: ${error.message}`);
    }
    return transcript;
  }

  async getTranscript(id: string): Promise<Transcript | null> {
    const { data, error } = await this.db.from("transcripts").select().eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toTranscript(data as Row) : null;
  }

  async listTranscripts(studyId: string): Promise<Transcript[]> {
    return this.many(
      "transcripts",
      (q) => q.select().eq("study_id", studyId).order("created_at"),
      toTranscript,
    );
  }

  async listSegments(transcriptId: string): Promise<TranscriptSegment[]> {
    return this.many(
      "transcript_segments",
      (q) => q.select().eq("transcript_id", transcriptId).order("index"),
      toSegment,
    );
  }

  async attachParticipantToTranscript(transcriptId: string, participantId: string): Promise<void> {
    const { error } = await this.db
      .from("transcripts")
      .update({ participant_id: participantId })
      .eq("id", transcriptId);
    if (error) throw new Error(error.message);
  }

  async createParticipant(input: NewParticipant): Promise<Participant> {
    const { count } = await this.db
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("study_id", input.studyId);
    const code = input.code || participantCode(count ?? 0);
    return this.one("participants", { id: newId("par"), ...toParticipantRow({ ...input, code }) }, toParticipant);
  }

  async updateParticipant(id: string, patch: Partial<NewParticipant>): Promise<Participant> {
    const { data, error } = await this.db
      .from("participants")
      .update(toParticipantRow(patch))
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toParticipant(data as Row);
  }

  async getParticipant(id: string): Promise<Participant | null> {
    const { data, error } = await this.db.from("participants").select().eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toParticipant(data as Row) : null;
  }

  async listParticipants(studyId: string): Promise<Participant[]> {
    return this.many("participants", (q) => q.select().eq("study_id", studyId).order("code"), toParticipant);
  }

  // Analysis ---------------------------------------------------------------

  async saveSynthesis(synthesis: ParticipantSynthesis): Promise<ParticipantSynthesis> {
    // Re-analysis replaces the previous synthesis for that transcript; insights
    // cascade from the synthesis row.
    await this.db.from("participant_syntheses").delete().eq("transcript_id", synthesis.transcriptId);
    const { error } = await this.db.from("participant_syntheses").insert(toSynthesisRow(synthesis));
    if (error) throw new Error(`participant_syntheses insert failed: ${error.message}`);
    if (synthesis.insights.length > 0) {
      const { error: insightError } = await this.db
        .from("insights")
        .insert(synthesis.insights.map(toInsightRow));
      if (insightError) throw new Error(`insights insert failed: ${insightError.message}`);
    }
    return synthesis;
  }

  private async hydrateSynthesis(row: Row): Promise<ParticipantSynthesis> {
    const insights = await this.many(
      "insights",
      (q) => q.select().eq("synthesis_id", row.id as string),
      toInsight,
    );
    return toSynthesis(row, insights);
  }

  async getSynthesis(id: string): Promise<ParticipantSynthesis | null> {
    const { data, error } = await this.db
      .from("participant_syntheses")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.hydrateSynthesis(data as Row) : null;
  }

  async getSynthesisByTranscript(transcriptId: string): Promise<ParticipantSynthesis | null> {
    const { data, error } = await this.db
      .from("participant_syntheses")
      .select()
      .eq("transcript_id", transcriptId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.hydrateSynthesis(data as Row) : null;
  }

  async listSyntheses(studyId: string): Promise<ParticipantSynthesis[]> {
    const { data, error } = await this.db.from("participant_syntheses").select().eq("study_id", studyId);
    if (error) throw new Error(error.message);
    return Promise.all(((data as Row[]) ?? []).map((row) => this.hydrateSynthesis(row)));
  }

  async listSynthesesForProject(projectId: string): Promise<ParticipantSynthesis[]> {
    const { data, error } = await this.db
      .from("participant_syntheses")
      .select()
      .eq("project_id", projectId);
    if (error) throw new Error(error.message);
    return Promise.all(((data as Row[]) ?? []).map((row) => this.hydrateSynthesis(row)));
  }

  async saveThemingRun(run: ThemingRun): Promise<void> {
    const runId = newId("thm");
    const { error } = await this.db.from("theming_runs").insert({
      id: runId,
      project_id: run.projectId,
      study_id: run.studyId,
      cross_cutting_observations: run.crossCuttingObservations,
      divergences: run.divergences,
      open_questions: run.openQuestions,
      created_at: run.createdAt,
    });
    if (error) throw new Error(`theming_runs insert failed: ${error.message}`);

    // Previous themes are marked superseded, never deleted: the point of the
    // product is that you can see what changed and why.
    await this.db
      .from("themes")
      .update({ superseded_at: run.createdAt })
      .contains("study_ids", [run.studyId])
      .is("superseded_at", null);

    if (run.themes.length > 0) {
      const { error: themeError } = await this.db
        .from("themes")
        .insert(run.themes.map((t) => ({ ...toThemeRow(t), run_id: runId })));
      if (themeError) throw new Error(`themes insert failed: ${themeError.message}`);
    }
    if (run.rejectedPatterns.length > 0) {
      const { error: rejectedError } = await this.db.from("rejected_patterns").insert(
        run.rejectedPatterns.map((r) => ({
          id: r.id,
          run_id: runId,
          project_id: r.projectId,
          study_ids: r.studyIds,
          label: r.label,
          reason: r.reason,
          participant_ids: r.participantIds,
          created_at: r.createdAt,
        })),
      );
      if (rejectedError) throw new Error(`rejected_patterns insert failed: ${rejectedError.message}`);
    }
  }

  async listThemes(projectId: string, studyId?: string): Promise<Theme[]> {
    return this.many(
      "themes",
      (q) => {
        let query = q.select().eq("project_id", projectId).is("superseded_at", null);
        if (studyId) query = query.contains("study_ids", [studyId]);
        return query.order("created_at");
      },
      toTheme,
    );
  }

  async getTheme(id: string): Promise<Theme | null> {
    const { data, error } = await this.db.from("themes").select().eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toTheme(data as Row) : null;
  }

  async listRejectedPatterns(projectId: string, studyId?: string): Promise<RejectedPattern[]> {
    return this.many(
      "rejected_patterns",
      (q) => {
        let query = q.select().eq("project_id", projectId);
        if (studyId) query = query.contains("study_ids", [studyId]);
        return query.order("created_at");
      },
      (r) => ({
        id: r.id as string,
        projectId: r.project_id as string,
        studyIds: (r.study_ids as string[]) ?? [],
        label: r.label as string,
        reason: r.reason as string,
        participantIds: (r.participant_ids as string[]) ?? [],
        createdAt: r.created_at as string,
      }),
    );
  }

  async getLatestThemingRun(studyId: string): Promise<ThemingRun | null> {
    const { data, error } = await this.db
      .from("theming_runs")
      .select()
      .eq("study_id", studyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as Row;
    const themes = await this.many("themes", (q) => q.select().eq("run_id", row.id as string), toTheme);
    const rejected = await this.listRejectedPatterns(row.project_id as string, studyId);
    return {
      projectId: row.project_id as string,
      studyId: row.study_id as string,
      themes,
      rejectedPatterns: rejected,
      crossCuttingObservations: (row.cross_cutting_observations as string[]) ?? [],
      divergences: (row.divergences as string[]) ?? [],
      openQuestions: (row.open_questions as string[]) ?? [],
      createdAt: row.created_at as string,
    };
  }

  async saveEvaluation(bundle: EvaluationBundle): Promise<void> {
    const { evaluation } = bundle;
    const { error } = await this.db.from("ux_evaluations").insert({
      id: evaluation.id,
      project_id: evaluation.projectId,
      study_id: evaluation.studyId,
      round: evaluation.round,
      label: evaluation.label,
      product_version: evaluation.productVersion,
      research_goal: evaluation.researchGoal,
      tasks_evaluated: evaluation.tasksEvaluated,
      tasks_not_exercised: bundle.tasksNotExercised,
      limitations: bundle.limitations,
      participant_ids: evaluation.participantIds,
      previous_evaluation_id: evaluation.previousEvaluationId,
      created_at: evaluation.createdAt,
    });
    if (error) throw new Error(`ux_evaluations insert failed: ${error.message}`);

    if (bundle.issues.length > 0) {
      const { error: issueError } = await this.db.from("ux_issues").insert(bundle.issues.map(toIssueRow));
      if (issueError) throw new Error(`ux_issues insert failed: ${issueError.message}`);
    }
    if (bundle.userNeeds.length > 0) {
      const { error: needError } = await this.db.from("user_needs").insert(
        bundle.userNeeds.map((n) => ({
          id: n.id,
          project_id: n.projectId,
          statement: n.statement,
          derived_from_issue_ids: n.derivedFromIssueIds,
          derived_from_theme_ids: n.derivedFromThemeIds,
          evidence: n.evidence,
          confidence: n.confidence,
          created_at: n.createdAt,
        })),
      );
      if (needError) throw new Error(`user_needs insert failed: ${needError.message}`);
    }
    if (bundle.recommendations.length > 0) {
      const { error: recError } = await this.db.from("recommendations").insert(
        bundle.recommendations.map((r) => ({
          id: r.id,
          project_id: r.projectId,
          evaluation_id: r.evaluationId,
          kind: r.kind,
          statement: r.statement,
          design_principle: r.designPrinciple,
          addresses_issue_ids: r.addressesIssueIds,
          addresses_user_need_ids: r.addressesUserNeedIds,
          related_theme_ids: r.relatedThemeIds,
          how_to_validate: r.howToValidate,
          evidence_strength: r.evidenceStrength,
          rationale: r.rationale,
          created_at: r.createdAt,
        })),
      );
      if (recError) throw new Error(`recommendations insert failed: ${recError.message}`);
    }
  }

  async getEvaluation(id: string): Promise<EvaluationBundle | null> {
    const { data, error } = await this.db.from("ux_evaluations").select().eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as Row;
    const issues = await this.listIssues(id);
    const userNeeds = await this.many(
      "user_needs",
      (q) => q.select().eq("project_id", row.project_id as string),
      toUserNeed,
    );
    const recommendations = await this.many(
      "recommendations",
      (q) => q.select().eq("evaluation_id", id),
      toRecommendation,
    );
    return {
      evaluation: toEvaluation(row),
      issues,
      userNeeds,
      recommendations,
      tasksNotExercised: (row.tasks_not_exercised as string[]) ?? [],
      limitations: (row.limitations as string[]) ?? [],
    };
  }

  async listEvaluations(projectId: string): Promise<UXEvaluation[]> {
    return this.many(
      "ux_evaluations",
      (q) => q.select().eq("project_id", projectId).order("round"),
      toEvaluation,
    );
  }

  async listIssues(evaluationId: string): Promise<UXIssue[]> {
    return this.many(
      "ux_issues",
      (q) => q.select().eq("evaluation_id", evaluationId).order("severity", { ascending: false }),
      toIssue,
    );
  }

  async listIssuesForProject(projectId: string): Promise<UXIssue[]> {
    return this.many("ux_issues", (q) => q.select().eq("project_id", projectId), toIssue);
  }

  async saveComparisons(comparisons: IssueComparison[]): Promise<void> {
    if (comparisons.length === 0) return;
    const currentIds = Array.from(new Set(comparisons.map((c) => c.currentEvaluationId)));
    await this.db.from("issue_comparisons").delete().in("current_evaluation_id", currentIds);
    const { error } = await this.db.from("issue_comparisons").insert(
      comparisons.map((c) => ({
        id: c.id,
        project_id: c.projectId,
        previous_evaluation_id: c.previousEvaluationId,
        current_evaluation_id: c.currentEvaluationId,
        previous_issue_id: c.previousIssueId,
        current_issue_id: c.currentIssueId,
        status: c.status,
        rationale: c.rationale,
        evidence: c.evidence,
        task_was_retested: c.taskWasRetested,
        confidence: c.confidence,
        created_at: c.createdAt,
      })),
    );
    if (error) throw new Error(`issue_comparisons insert failed: ${error.message}`);
  }

  async listComparisons(currentEvaluationId: string): Promise<IssueComparison[]> {
    return this.many(
      "issue_comparisons",
      (q) => q.select().eq("current_evaluation_id", currentEvaluationId),
      (r) => ({
        id: r.id as string,
        projectId: r.project_id as string,
        previousEvaluationId: r.previous_evaluation_id as string,
        currentEvaluationId: r.current_evaluation_id as string,
        previousIssueId: (r.previous_issue_id as string) ?? null,
        currentIssueId: (r.current_issue_id as string) ?? null,
        status: r.status as IssueComparison["status"],
        rationale: r.rationale as string,
        evidence: (r.evidence as IssueComparison["evidence"]) ?? [],
        taskWasRetested: Boolean(r.task_was_retested),
        confidence: r.confidence as IssueComparison["confidence"],
        createdAt: r.created_at as string,
      }),
    );
  }

  async saveKnowledgeUpdate(update: KnowledgeUpdate): Promise<void> {
    const { error } = await this.db.from("knowledge_updates").insert({
      id: update.id,
      project_id: update.projectId,
      subject_kind: update.subjectKind,
      subject_id: update.subjectId,
      previous_understanding: update.previousUnderstanding,
      new_evidence_summary: update.newEvidenceSummary,
      what_changed: update.whatChanged,
      reason_for_change: update.reasonForChange,
      updated_understanding: update.updatedUnderstanding,
      review_status: update.reviewStatus,
      evidence: update.evidence,
      created_at: update.createdAt,
    });
    if (error) throw new Error(`knowledge_updates insert failed: ${error.message}`);
  }

  async listKnowledgeUpdates(projectId: string): Promise<KnowledgeUpdate[]> {
    return this.many(
      "knowledge_updates",
      (q) => q.select().eq("project_id", projectId).order("created_at", { ascending: false }),
      (r) => ({
        id: r.id as string,
        projectId: r.project_id as string,
        subjectKind: r.subject_kind as KnowledgeUpdate["subjectKind"],
        subjectId: r.subject_id as string,
        previousUnderstanding: r.previous_understanding as string,
        newEvidenceSummary: r.new_evidence_summary as string,
        whatChanged: r.what_changed as string,
        reasonForChange: r.reason_for_change as string,
        updatedUnderstanding: r.updated_understanding as string,
        reviewStatus: r.review_status as KnowledgeUpdate["reviewStatus"],
        evidence: (r.evidence as KnowledgeUpdate["evidence"]) ?? [],
        createdAt: r.created_at as string,
      }),
    );
  }

  async saveFinding(finding: Finding): Promise<void> {
    const { error } = await this.db.from("findings").insert({
      id: finding.id,
      project_id: finding.projectId,
      study_ids: finding.studyIds,
      statement: finding.statement,
      supporting_theme_ids: finding.supportingThemeIds,
      supporting_issue_ids: finding.supportingIssueIds,
      confidence: finding.confidence,
      evidence: finding.evidence,
      open_questions: finding.openQuestions,
      created_at: finding.createdAt,
    });
    if (error) throw new Error(`findings insert failed: ${error.message}`);
  }

  async listFindings(projectId: string): Promise<Finding[]> {
    return this.many(
      "findings",
      (q) => q.select().eq("project_id", projectId),
      (r) => ({
        id: r.id as string,
        projectId: r.project_id as string,
        studyIds: (r.study_ids as string[]) ?? [],
        statement: r.statement as string,
        supportingThemeIds: (r.supporting_theme_ids as string[]) ?? [],
        supportingIssueIds: (r.supporting_issue_ids as string[]) ?? [],
        confidence: r.confidence as Finding["confidence"],
        evidence: (r.evidence as Finding["evidence"]) ?? [],
        openQuestions: (r.open_questions as string[]) ?? [],
        createdAt: r.created_at as string,
      }),
    );
  }

  async createJob(input: Omit<JobRecord, "id" | "createdAt" | "updatedAt">): Promise<JobRecord> {
    return this.one(
      "analysis_jobs",
      {
        id: newId("job"),
        project_id: input.projectId,
        study_id: input.studyId,
        kind: input.kind,
        status: input.status,
        subject_id: input.subjectId,
        subject_label: input.subjectLabel,
        error: input.error,
        warnings: input.warnings,
      },
      toJob,
    );
  }

  async updateJob(id: string, patch: Partial<Omit<JobRecord, "id" | "createdAt">>): Promise<JobRecord> {
    const row: Row = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.error !== undefined) row.error = patch.error;
    if (patch.warnings !== undefined) row.warnings = patch.warnings;
    if (patch.subjectLabel !== undefined) row.subject_label = patch.subjectLabel;
    const { data, error } = await this.db
      .from("analysis_jobs")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toJob(data as Row);
  }

  async listJobs(projectId: string): Promise<JobRecord[]> {
    return this.many(
      "analysis_jobs",
      (q) => q.select().eq("project_id", projectId).order("created_at", { ascending: false }),
      toJob,
    );
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function toProjectRow(p: Partial<NewProject>): Row {
  const row: Row = {};
  if (p.name !== undefined) row.name = p.name;
  if (p.problemStatement !== undefined) row.problem_statement = p.problemStatement;
  if (p.researchGoal !== undefined) row.research_goal = p.researchGoal;
  if (p.hypotheses !== undefined) row.hypotheses = p.hypotheses;
  if (p.targetPopulation !== undefined) row.target_population = p.targetPopulation;
  if (p.participantCriteria !== undefined) row.participant_criteria = p.participantCriteria;
  if (p.productOrExperience !== undefined) row.product_or_experience = p.productOrExperience;
  return row;
}

function toProject(r: Row): Project {
  return {
    id: r.id as string,
    name: r.name as string,
    problemStatement: r.problem_statement as string,
    researchGoal: r.research_goal as string,
    hypotheses: (r.hypotheses as string[]) ?? [],
    targetPopulation: (r.target_population as string) ?? null,
    participantCriteria: (r.participant_criteria as string) ?? null,
    productOrExperience: (r.product_or_experience as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toResearchQuestion(r: Row): ResearchQuestion {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    text: r.text as string,
    order: r.order as number,
  };
}

function toStudyRow(s: Partial<NewStudy>): Row {
  const row: Row = {};
  if (s.projectId !== undefined) row.project_id = s.projectId;
  if (s.name !== undefined) row.name = s.name;
  if (s.researchType !== undefined) row.research_type = s.researchType;
  if (s.researchTypeCustom !== undefined) row.research_type_custom = s.researchTypeCustom;
  if (s.researchStage !== undefined) row.research_stage = s.researchStage;
  if (s.researchStageCustom !== undefined) row.research_stage_custom = s.researchStageCustom;
  if (s.studyGoal !== undefined) row.study_goal = s.studyGoal;
  if (s.productVersion !== undefined) row.product_version = s.productVersion;
  if (s.plannedTasks !== undefined) row.planned_tasks = s.plannedTasks;
  if (s.classificationConfirmedAt !== undefined) {
    row.classification_confirmed_at = s.classificationConfirmedAt;
  }
  return row;
}

function toStudy(r: Row): Study {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    name: r.name as string,
    researchType: r.research_type as Study["researchType"],
    researchTypeCustom: (r.research_type_custom as string) ?? null,
    researchStage: r.research_stage as Study["researchStage"],
    researchStageCustom: (r.research_stage_custom as string) ?? null,
    studyGoal: (r.study_goal as string) ?? null,
    productVersion: (r.product_version as string) ?? null,
    plannedTasks: (r.planned_tasks as string[]) ?? [],
    classificationConfirmedAt: (r.classification_confirmed_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toTranscriptRow(t: NewTranscript): Row {
  return {
    study_id: t.studyId,
    project_id: t.projectId,
    name: t.name,
    original_filename: t.originalFilename,
    mime_type: t.mimeType,
    source_kind: t.sourceKind,
    storage_path: t.storagePath,
    raw_text: t.rawText,
    normalized_text: t.normalizedText,
    extraction_warnings: t.extractionWarnings,
    participant_id: t.participantId,
  };
}

function toTranscript(r: Row): Transcript {
  return {
    id: r.id as string,
    studyId: r.study_id as string,
    projectId: r.project_id as string,
    name: r.name as string,
    originalFilename: (r.original_filename as string) ?? null,
    mimeType: (r.mime_type as string) ?? null,
    sourceKind: r.source_kind as Transcript["sourceKind"],
    storagePath: (r.storage_path as string) ?? null,
    rawText: r.raw_text as string,
    normalizedText: r.normalized_text as string,
    extractionWarnings: (r.extraction_warnings as string[]) ?? [],
    participantId: (r.participant_id as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function toSegmentRow(s: TranscriptSegment): Row {
  return {
    id: s.id,
    transcript_id: s.transcriptId,
    index: s.index,
    start_line: s.startLine,
    end_line: s.endLine,
    start_char: s.startChar,
    end_char: s.endChar,
    speaker: s.speaker,
    speaker_role: s.speakerRole,
    timestamp: s.timestamp,
    text: s.text,
  };
}

function toSegment(r: Row): TranscriptSegment {
  return {
    id: r.id as string,
    transcriptId: r.transcript_id as string,
    index: r.index as number,
    startLine: r.start_line as number,
    endLine: r.end_line as number,
    startChar: r.start_char as number,
    endChar: r.end_char as number,
    speaker: (r.speaker as string) ?? null,
    speakerRole: r.speaker_role as TranscriptSegment["speakerRole"],
    timestamp: (r.timestamp as string) ?? null,
    text: r.text as string,
  };
}

function toParticipantRow(p: Partial<NewParticipant>): Row {
  const row: Row = {};
  if (p.studyId !== undefined) row.study_id = p.studyId;
  if (p.projectId !== undefined) row.project_id = p.projectId;
  if (p.code !== undefined) row.code = p.code;
  if (p.displayName !== undefined) row.display_name = p.displayName;
  if (p.demographics !== undefined) row.demographics = p.demographics;
  if (p.backgroundContext !== undefined) row.background_context = p.backgroundContext;
  return row;
}

function toParticipant(r: Row): Participant {
  return {
    id: r.id as string,
    studyId: r.study_id as string,
    projectId: r.project_id as string,
    code: r.code as string,
    displayName: (r.display_name as string) ?? null,
    demographics: (r.demographics as Participant["demographics"]) ?? [],
    backgroundContext: (r.background_context as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function toSynthesisRow(s: ParticipantSynthesis): Row {
  return {
    id: s.id,
    project_id: s.projectId,
    study_id: s.studyId,
    transcript_id: s.transcriptId,
    participant_id: s.participantId,
    frame_snapshot: s.frameSnapshot,
    overall_summary: s.overallSummary,
    participant_reported: s.participantReported,
    observed_behavior_summary: s.observedBehaviorSummary,
    task_outcomes: s.taskOutcomes,
    notable_quotes: s.notableQuotes,
    contradictions: s.contradictions,
    open_questions: s.openQuestions,
    not_supported_by_evidence: s.notSupportedByEvidence,
    model_notes: s.modelNotes,
    created_at: s.createdAt,
  };
}

function toSynthesis(r: Row, insights: ParticipantSynthesis["insights"]): ParticipantSynthesis {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    studyId: r.study_id as string,
    transcriptId: r.transcript_id as string,
    participantId: r.participant_id as string,
    frameSnapshot: r.frame_snapshot as ParticipantSynthesis["frameSnapshot"],
    overallSummary: r.overall_summary as string,
    participantReported: (r.participant_reported as string[]) ?? [],
    observedBehaviorSummary: (r.observed_behavior_summary as string) ?? null,
    insights,
    taskOutcomes: (r.task_outcomes as ParticipantSynthesis["taskOutcomes"]) ?? [],
    notableQuotes: (r.notable_quotes as ParticipantSynthesis["notableQuotes"]) ?? [],
    contradictions: (r.contradictions as ParticipantSynthesis["contradictions"]) ?? [],
    openQuestions: (r.open_questions as string[]) ?? [],
    notSupportedByEvidence: (r.not_supported_by_evidence as string[]) ?? [],
    modelNotes: (r.model_notes as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function toInsightRow(i: ParticipantSynthesis["insights"][number]): Row {
  return {
    id: i.id,
    synthesis_id: i.synthesisId,
    participant_id: i.participantId,
    study_id: i.studyId,
    project_id: i.projectId,
    category: i.category,
    statement: i.statement,
    interpretation: i.interpretation,
    epistemic_status: i.epistemicStatus,
    confidence: i.confidence,
    evidence: i.evidence,
    related_question_ids: i.relatedResearchQuestionIds,
  };
}

function toInsight(r: Row): ParticipantSynthesis["insights"][number] {
  return {
    id: r.id as string,
    synthesisId: r.synthesis_id as string,
    participantId: r.participant_id as string,
    studyId: r.study_id as string,
    projectId: r.project_id as string,
    category: r.category as ParticipantSynthesis["insights"][number]["category"],
    statement: r.statement as string,
    interpretation: (r.interpretation as string) ?? null,
    epistemicStatus: r.epistemic_status as ParticipantSynthesis["insights"][number]["epistemicStatus"],
    confidence: r.confidence as ParticipantSynthesis["insights"][number]["confidence"],
    evidence: (r.evidence as ParticipantSynthesis["insights"][number]["evidence"]) ?? [],
    relatedResearchQuestionIds: (r.related_question_ids as string[]) ?? [],
  };
}

function toThemeRow(t: Theme): Row {
  return {
    id: t.id,
    project_id: t.projectId,
    study_ids: t.studyIds,
    name: t.name,
    description: t.description,
    underlying_insight: t.underlyingInsight,
    why_meaningful: t.whyMeaningful,
    supporting_participant_ids: t.supportingParticipantIds,
    participant_count: t.participantCount,
    total_participants_considered: t.totalParticipantsConsidered,
    supporting_insight_ids: t.supportingInsightIds,
    evidence: t.evidence,
    counter_evidence: t.counterEvidence,
    outlier_participant_ids: t.outlierParticipantIds,
    outlier_notes: t.outlierNotes,
    confidence: t.confidence,
    pattern_strength: t.patternStrength,
    relation_to_research_problem: t.relationToResearchProblem,
    potential_implication: t.potentialImplication,
    challenges_hypotheses: t.challengesHypotheses,
    supersedes_theme_id: t.supersedesThemeId,
    created_at: t.createdAt,
  };
}

function toTheme(r: Row): Theme {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    studyIds: (r.study_ids as string[]) ?? [],
    name: r.name as string,
    description: r.description as string,
    underlyingInsight: r.underlying_insight as string,
    whyMeaningful: r.why_meaningful as string,
    supportingParticipantIds: (r.supporting_participant_ids as string[]) ?? [],
    participantCount: (r.participant_count as number) ?? 0,
    totalParticipantsConsidered: (r.total_participants_considered as number) ?? 0,
    supportingInsightIds: (r.supporting_insight_ids as string[]) ?? [],
    evidence: (r.evidence as Theme["evidence"]) ?? [],
    counterEvidence: (r.counter_evidence as Theme["counterEvidence"]) ?? [],
    outlierParticipantIds: (r.outlier_participant_ids as string[]) ?? [],
    outlierNotes: (r.outlier_notes as string) ?? null,
    confidence: r.confidence as Theme["confidence"],
    patternStrength: r.pattern_strength as Theme["patternStrength"],
    relationToResearchProblem: r.relation_to_research_problem as string,
    potentialImplication: (r.potential_implication as string) ?? null,
    challengesHypotheses: (r.challenges_hypotheses as string[]) ?? [],
    createdAt: r.created_at as string,
    supersedesThemeId: (r.supersedes_theme_id as string) ?? null,
  };
}

function toEvaluation(r: Row): UXEvaluation {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    studyId: r.study_id as string,
    round: r.round as number,
    label: r.label as string,
    productVersion: (r.product_version as string) ?? null,
    researchGoal: r.research_goal as string,
    tasksEvaluated: (r.tasks_evaluated as string[]) ?? [],
    participantIds: (r.participant_ids as string[]) ?? [],
    previousEvaluationId: (r.previous_evaluation_id as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function toIssueRow(i: UXIssue): Row {
  return {
    id: i.id,
    evaluation_id: i.evaluationId,
    project_id: i.projectId,
    study_id: i.studyId,
    name: i.name,
    description: i.description,
    affected_task: i.affectedTask,
    affected_flow: i.affectedFlow,
    affected_participant_ids: i.affectedParticipantIds,
    affected_participant_count: i.affectedParticipantCount,
    total_participants_considered: i.totalParticipantsConsidered,
    occurrence_count: i.occurrenceCount,
    severity: i.severity,
    severity_rationale: i.severityRationale,
    user_expectation: i.userExpectation,
    observed_behavior: i.observedBehavior,
    actual_experience: i.actualExperience,
    likely_cause_hypotheses: i.likelyCauseHypotheses,
    confidence: i.confidence,
    evidence: i.evidence,
    related_theme_ids: i.relatedThemeIds,
    related_user_need_ids: i.relatedUserNeedIds,
    design_implication: i.designImplication,
    created_at: i.createdAt,
  };
}

function toIssue(r: Row): UXIssue {
  return {
    id: r.id as string,
    evaluationId: r.evaluation_id as string,
    projectId: r.project_id as string,
    studyId: r.study_id as string,
    name: r.name as string,
    description: r.description as string,
    affectedTask: (r.affected_task as string) ?? null,
    affectedFlow: (r.affected_flow as string) ?? null,
    affectedParticipantIds: (r.affected_participant_ids as string[]) ?? [],
    affectedParticipantCount: (r.affected_participant_count as number) ?? 0,
    totalParticipantsConsidered: (r.total_participants_considered as number) ?? 0,
    occurrenceCount: (r.occurrence_count as number) ?? null,
    severity: r.severity as UXIssue["severity"],
    severityRationale: r.severity_rationale as string,
    userExpectation: (r.user_expectation as string) ?? null,
    observedBehavior: (r.observed_behavior as string) ?? null,
    actualExperience: (r.actual_experience as string) ?? null,
    likelyCauseHypotheses: (r.likely_cause_hypotheses as UXIssue["likelyCauseHypotheses"]) ?? [],
    confidence: r.confidence as UXIssue["confidence"],
    evidence: (r.evidence as UXIssue["evidence"]) ?? [],
    supportingQuoteIds: [],
    relatedThemeIds: (r.related_theme_ids as string[]) ?? [],
    relatedUserNeedIds: (r.related_user_need_ids as string[]) ?? [],
    designImplication: (r.design_implication as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function toUserNeed(r: Row): UserNeed {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    statement: r.statement as string,
    derivedFromIssueIds: (r.derived_from_issue_ids as string[]) ?? [],
    derivedFromThemeIds: (r.derived_from_theme_ids as string[]) ?? [],
    evidence: (r.evidence as UserNeed["evidence"]) ?? [],
    confidence: r.confidence as UserNeed["confidence"],
    createdAt: r.created_at as string,
  };
}

function toRecommendation(r: Row): Recommendation {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    evaluationId: (r.evaluation_id as string) ?? null,
    kind: r.kind as Recommendation["kind"],
    statement: r.statement as string,
    designPrinciple: (r.design_principle as string) ?? null,
    addressesIssueIds: (r.addresses_issue_ids as string[]) ?? [],
    addressesUserNeedIds: (r.addresses_user_need_ids as string[]) ?? [],
    relatedThemeIds: (r.related_theme_ids as string[]) ?? [],
    howToValidate: (r.how_to_validate as string) ?? null,
    evidenceStrength: r.evidence_strength as Recommendation["evidenceStrength"],
    rationale: r.rationale as string,
    createdAt: r.created_at as string,
  };
}

function toJob(r: Row): JobRecord {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    studyId: (r.study_id as string) ?? null,
    kind: r.kind as JobRecord["kind"],
    status: r.status as JobRecord["status"],
    subjectId: (r.subject_id as string) ?? null,
    subjectLabel: (r.subject_label as string) ?? null,
    error: (r.error as string) ?? null,
    warnings: (r.warnings as string[]) ?? [],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
