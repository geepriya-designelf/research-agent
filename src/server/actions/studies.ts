"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RESEARCH_STAGES, RESEARCH_TYPES, type ResearchStage, type ResearchType } from "@/domain/taxonomy";
import { getStore } from "@/server/store";

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function optional(form: FormData, key: string): string | null {
  const value = str(form, key);
  return value.length > 0 ? value : null;
}

function lines(form: FormData, key: string): string[] {
  return String(form.get(key) ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseType(value: string): ResearchType {
  if ((RESEARCH_TYPES as readonly string[]).includes(value)) return value as ResearchType;
  throw new Error(`Unknown research type "${value}".`);
}

function parseStage(value: string): ResearchStage {
  if ((RESEARCH_STAGES as readonly string[]).includes(value)) return value as ResearchStage;
  throw new Error(`Unknown research stage "${value}".`);
}

export async function createStudyAction(projectId: string, form: FormData): Promise<void> {
  const store = getStore();
  const researchType = parseType(str(form, "researchType"));
  const researchStage = parseStage(str(form, "researchStage"));

  if (researchType === "other" && !str(form, "researchTypeCustom")) {
    throw new Error('Describe the research type when "Other" is selected.');
  }
  if (researchStage === "other" && !str(form, "researchStageCustom")) {
    throw new Error('Describe the research stage when "Other" is selected.');
  }

  const study = await store.createStudy({
    projectId,
    name: str(form, "name") || "Untitled study",
    researchType,
    researchTypeCustom: optional(form, "researchTypeCustom"),
    researchStage,
    researchStageCustom: optional(form, "researchStageCustom"),
    studyGoal: optional(form, "studyGoal"),
    productVersion: optional(form, "productVersion"),
    plannedTasks: lines(form, "plannedTasks"),
    // Deliberately unconfirmed. The researcher must review the classification
    // on the study page before any analysis can run.
    classificationConfirmedAt: null,
  });

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/studies/${study.id}`);
}

/**
 * The confirmation gate. Every pipeline stage refuses to run until this has
 * been set, and re-editing the classification clears it again.
 */
export async function confirmClassificationAction(
  projectId: string,
  studyId: string,
  form: FormData,
): Promise<void> {
  const store = getStore();
  const researchType = parseType(str(form, "researchType"));
  const researchStage = parseStage(str(form, "researchStage"));

  await store.updateStudy(studyId, {
    researchType,
    researchTypeCustom: optional(form, "researchTypeCustom"),
    researchStage,
    researchStageCustom: optional(form, "researchStageCustom"),
    studyGoal: optional(form, "studyGoal"),
    productVersion: optional(form, "productVersion"),
    plannedTasks: lines(form, "plannedTasks"),
    classificationConfirmedAt: new Date().toISOString(),
  });

  revalidatePath(`/projects/${projectId}/studies/${studyId}`);
}

export async function reopenClassificationAction(projectId: string, studyId: string): Promise<void> {
  await getStore().updateStudy(studyId, { classificationConfirmedAt: null });
  revalidatePath(`/projects/${projectId}/studies/${studyId}`);
}
