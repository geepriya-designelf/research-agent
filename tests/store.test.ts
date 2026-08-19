/**
 * Store round-trip. Exercises the interface every pipeline stage depends on,
 * including the rules the store itself enforces: re-synthesis replaces the
 * previous result for a transcript, and re-theming supersedes rather than
 * merges.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileStore } from "@/server/store/fileStore";
import { newId } from "@/domain/ids";
import type { ParticipantSynthesis, ResearchFrame, Theme } from "@/domain/model";

let dir: string;
let store: FileStore;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ri-store-"));
  store = new FileStore(path.join(dir, "db.json"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("research store", () => {
  it("round-trips the project → study → transcript → participant spine", async () => {
    const project = await store.createProject({
      name: "Improve Checkout",
      problemStatement: "People abandon checkout.",
      researchGoal: "Understand why.",
      hypotheses: [],
      targetPopulation: null,
      participantCriteria: null,
      productOrExperience: "Checkout",
    });

    const questions = await store.setResearchQuestions(project.id, ["Where do people stall?", ""]);
    expect(questions).toHaveLength(1);

    const study = await store.createStudy({
      projectId: project.id,
      name: "Usability round 1",
      researchType: "usability_test",
      researchTypeCustom: null,
      researchStage: "prototype_evaluation",
      researchStageCustom: null,
      studyGoal: null,
      productVersion: "v3",
      plannedTasks: ["Add a card"],
      classificationConfirmedAt: null,
    });

    // New studies start unconfirmed: analysis must be gated on a human review.
    expect(study.classificationConfirmedAt).toBeNull();

    const transcript = await store.createTranscript(
      {
        studyId: study.id,
        projectId: project.id,
        name: "P01",
        originalFilename: null,
        mimeType: "text/plain",
        sourceKind: "paste",
        storagePath: null,
        rawText: "Moderator: Hi\nP01: Hello",
        normalizedText: "Moderator: Hi\nP01: Hello",
        extractionWarnings: [],
        participantId: null,
      },
      [
        {
          id: newId("seg"),
          transcriptId: "pending",
          index: 0,
          startLine: 1,
          endLine: 1,
          startChar: 0,
          endChar: 13,
          speaker: "Moderator",
          speakerRole: "interviewer",
          timestamp: null,
          text: "Hi",
        },
      ],
    );

    const segments = await store.listSegments(transcript.id);
    expect(segments).toHaveLength(1);
    // Segments are rebound to the real transcript id on insert.
    expect(segments[0].transcriptId).toBe(transcript.id);

    const participant = await store.createParticipant({
      studyId: study.id,
      projectId: project.id,
      code: "",
      displayName: null,
      demographics: [],
      backgroundContext: null,
    });
    expect(participant.code).toBe("P01");

    await store.attachParticipantToTranscript(transcript.id, participant.id);
    expect((await store.getTranscript(transcript.id))?.participantId).toBe(participant.id);

    const second = await store.createParticipant({
      studyId: study.id,
      projectId: project.id,
      code: "",
      displayName: null,
      demographics: [],
      backgroundContext: null,
    });
    expect(second.code).toBe("P02");
  });

  it("replaces a transcript's synthesis on re-analysis rather than duplicating it", async () => {
    const [project] = await store.listProjects();
    const [study] = await store.listStudies(project.id);
    const [transcript] = await store.listTranscripts(study.id);
    const [participant] = await store.listParticipants(study.id);

    const base = (summary: string): ParticipantSynthesis => ({
      id: newId("syn"),
      projectId: project.id,
      studyId: study.id,
      transcriptId: transcript.id,
      participantId: participant.id,
      frameSnapshot: {} as ResearchFrame,
      overallSummary: summary,
      participantReported: [],
      observedBehaviorSummary: null,
      insights: [],
      taskOutcomes: [],
      notableQuotes: [],
      contradictions: [],
      openQuestions: [],
      notSupportedByEvidence: [],
      modelNotes: null,
      createdAt: new Date().toISOString(),
    });

    await store.saveSynthesis(base("first pass"));
    await store.saveSynthesis(base("second pass"));

    const all = await store.listSyntheses(study.id);
    expect(all).toHaveLength(1);
    expect(all[0].overallSummary).toBe("second pass");
    expect((await store.getSynthesisByTranscript(transcript.id))?.overallSummary).toBe("second pass");
  });

  it("supersedes a study's themes on a new theming run and keeps the run history", async () => {
    const [project] = await store.listProjects();
    const [study] = await store.listStudies(project.id);

    const theme = (name: string): Theme => ({
      id: newId("thm"),
      projectId: project.id,
      studyIds: [study.id],
      name,
      description: "",
      underlyingInsight: "",
      whyMeaningful: "",
      supportingParticipantIds: [],
      participantCount: 2,
      totalParticipantsConsidered: 5,
      supportingInsightIds: [],
      evidence: [],
      counterEvidence: [],
      outlierParticipantIds: [],
      outlierNotes: null,
      confidence: "moderate",
      patternStrength: "moderate",
      relationToResearchProblem: "",
      potentialImplication: null,
      challengesHypotheses: [],
      createdAt: new Date().toISOString(),
      supersedesThemeId: null,
    });

    await store.saveThemingRun({
      projectId: project.id,
      studyId: study.id,
      themes: [theme("Run one theme")],
      rejectedPatterns: [],
      crossCuttingObservations: [],
      divergences: [],
      openQuestions: [],
      createdAt: new Date().toISOString(),
    });
    await store.saveThemingRun({
      projectId: project.id,
      studyId: study.id,
      themes: [theme("Run two theme")],
      rejectedPatterns: [],
      crossCuttingObservations: [],
      divergences: [],
      openQuestions: ["Still unclear whether this holds for returning customers."],
      createdAt: new Date().toISOString(),
    });

    const current = await store.listThemes(project.id, study.id);
    expect(current.map((t) => t.name)).toEqual(["Run two theme"]);

    const latest = await store.getLatestThemingRun(study.id);
    expect(latest?.openQuestions[0]).toMatch(/returning customers/);
  });

  it("tracks job lifecycle and warnings", async () => {
    const [project] = await store.listProjects();
    const [study] = await store.listStudies(project.id);

    const job = await store.createJob({
      projectId: project.id,
      studyId: study.id,
      kind: "synthesis",
      status: "queued",
      subjectId: "trs_x",
      subjectLabel: "P01",
      error: null,
      warnings: [],
    });

    await store.updateJob(job.id, { status: "running" });
    const done = await store.updateJob(job.id, {
      status: "succeeded",
      warnings: ["1 demographic claim was discarded for lack of a supporting quote."],
    });

    expect(done.status).toBe("succeeded");
    expect(done.warnings).toHaveLength(1);
    expect((await store.listJobs(project.id))[0].id).toBe(job.id);
  });
});
