/**
 * Research Frame construction.
 *
 * The frame is the shared context every analysis stage receives. It is built
 * from recorded facts only: demographic fields come from what participants
 * actually stated, and anything absent is named in `missingInformation` rather
 * than filled in.
 */

import type { Participant, Project, ResearchFrame, ResearchQuestion, Study, Transcript } from "./model";
import { RESEARCH_STAGE_LABELS, RESEARCH_TYPE_LABELS, expectsObservedBehaviour } from "./taxonomy";

export interface FrameInput {
  project: Project;
  study: Study;
  researchQuestions: ResearchQuestion[];
  participants: Participant[];
  transcripts: Transcript[];
}

export function buildResearchFrame(input: FrameInput): ResearchFrame {
  const { project, study, researchQuestions, participants, transcripts } = input;

  const observedDemographicFields = Array.from(
    new Set(participants.flatMap((p) => p.demographics.map((d) => d.field))),
  ).sort();

  const missingInformation: string[] = [];
  const limitations: string[] = [];

  if (participants.length === 0) {
    missingInformation.push("No participants have been identified yet.");
  }
  if (observedDemographicFields.length === 0 && participants.length > 0) {
    missingInformation.push(
      "No participant demographics are stated anywhere in the material. Findings cannot be segmented by population.",
    );
  }
  const participantsWithoutDemographics = participants.filter((p) => p.demographics.length === 0);
  if (participantsWithoutDemographics.length > 0 && observedDemographicFields.length > 0) {
    missingInformation.push(
      `${participantsWithoutDemographics.length} of ${participants.length} participants have no stated demographics (${participantsWithoutDemographics
        .map((p) => p.code)
        .join(", ")}).`,
    );
  }
  if (!project.participantCriteria) {
    missingInformation.push("No participant recruitment criteria recorded for this project.");
  }
  if (!project.targetPopulation) {
    missingInformation.push("No target population recorded for this project.");
  }
  if (researchQuestions.length === 0) {
    missingInformation.push("No research questions recorded; relevance judgements will be broad.");
  }
  if (expectsObservedBehaviour(study.researchType, study.researchStage) && !study.productVersion) {
    missingInformation.push(
      "No product or prototype version recorded, so findings cannot be tied to a specific build.",
    );
  }
  if (
    expectsObservedBehaviour(study.researchType, study.researchStage) &&
    study.plannedTasks.length === 0
  ) {
    missingInformation.push(
      "No planned tasks recorded, so 'task not exercised' cannot be distinguished from 'task passed' in later rounds.",
    );
  }
  const transcriptsWithWarnings = transcripts.filter((t) => t.extractionWarnings.length > 0);
  if (transcriptsWithWarnings.length > 0) {
    missingInformation.push(
      `${transcriptsWithWarnings.length} transcript(s) had extraction warnings; some source text may be incomplete.`,
    );
  }

  if (participants.length > 0 && participants.length < 5) {
    limitations.push(
      `Small sample (${participants.length} participants). Patterns are indicative, not representative; report counts, never proportions of a population.`,
    );
  }
  limitations.push(
    "Qualitative evidence. Nothing here establishes prevalence, and nothing here proves that a specific design change will work.",
  );
  if (!expectsObservedBehaviour(study.researchType, study.researchStage)) {
    limitations.push(
      "This material is self-report. Stated preferences and recalled behaviour are weaker evidence than observed behaviour.",
    );
  }

  return {
    projectId: project.id,
    studyId: study.id,
    projectName: project.name,
    problemStatement: project.problemStatement,
    researchGoal: study.studyGoal ?? project.researchGoal,
    researchQuestions: researchQuestions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((q) => ({ id: q.id, text: q.text })),
    hypotheses: project.hypotheses,
    researchType: study.researchType,
    researchTypeLabel:
      study.researchType === "other" && study.researchTypeCustom
        ? `Other — ${study.researchTypeCustom}`
        : RESEARCH_TYPE_LABELS[study.researchType],
    researchStage: study.researchStage,
    researchStageLabel:
      study.researchStage === "other" && study.researchStageCustom
        ? `Other — ${study.researchStageCustom}`
        : RESEARCH_STAGE_LABELS[study.researchStage],
    participantCount: participants.length,
    transcriptCount: transcripts.length,
    targetPopulation: project.targetPopulation,
    participantCriteria: project.participantCriteria,
    productOrExperience: project.productOrExperience,
    productVersion: study.productVersion,
    plannedTasks: study.plannedTasks,
    dataSources: transcripts.map((t) => ({
      transcriptId: t.id,
      name: t.name,
      sourceKind: t.sourceKind,
    })),
    observedDemographicFields,
    missingInformation,
    limitations,
    generatedAt: new Date().toISOString(),
  };
}
