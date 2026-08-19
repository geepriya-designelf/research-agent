"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

export async function createProjectAction(form: FormData): Promise<void> {
  const store = getStore();
  const name = str(form, "name");
  const problemStatement = str(form, "problemStatement");
  const researchGoal = str(form, "researchGoal");

  if (!name || !problemStatement || !researchGoal) {
    throw new Error("Project name, the problem being solved, and the research goal are all required.");
  }

  const project = await store.createProject({
    name,
    problemStatement,
    researchGoal,
    hypotheses: lines(form, "hypotheses"),
    targetPopulation: optional(form, "targetPopulation"),
    participantCriteria: optional(form, "participantCriteria"),
    productOrExperience: optional(form, "productOrExperience"),
  });

  await store.setResearchQuestions(project.id, lines(form, "researchQuestions"));

  revalidatePath("/");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectAction(projectId: string, form: FormData): Promise<void> {
  const store = getStore();
  await store.updateProject(projectId, {
    name: str(form, "name"),
    problemStatement: str(form, "problemStatement"),
    researchGoal: str(form, "researchGoal"),
    hypotheses: lines(form, "hypotheses"),
    targetPopulation: optional(form, "targetPopulation"),
    participantCriteria: optional(form, "participantCriteria"),
    productOrExperience: optional(form, "productOrExperience"),
  });
  await store.setResearchQuestions(projectId, lines(form, "researchQuestions"));
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
