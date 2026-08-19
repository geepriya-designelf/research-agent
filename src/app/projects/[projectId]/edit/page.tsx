import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, Textarea } from "@/components/ui/field";
import { updateProjectAction } from "@/server/actions/projects";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const store = getStore();
  const project = await store.getProject(projectId);
  if (!project) notFound();
  const questions = await store.listResearchQuestions(projectId);

  const action = updateProjectAction.bind(null, projectId);

  return (
    <form action={action} className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit project</h1>
      <Card>
        <CardHeader>
          <CardTitle>Research problem</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="Project name">
            <Input name="name" defaultValue={project.name} required />
          </FormField>
          <FormField label="Problem being solved">
            <Textarea name="problemStatement" defaultValue={project.problemStatement} required />
          </FormField>
          <FormField label="Research goal">
            <Textarea name="researchGoal" defaultValue={project.researchGoal} required />
          </FormField>
          <FormField label="Research questions" hint="One per line.">
            <Textarea
              name="researchQuestions"
              rows={4}
              defaultValue={questions.map((q) => q.text).join("\n")}
            />
          </FormField>
          <FormField label="Hypotheses" hint="One per line.">
            <Textarea name="hypotheses" rows={3} defaultValue={project.hypotheses.join("\n")} />
          </FormField>
          <FormField label="Target population">
            <Input name="targetPopulation" defaultValue={project.targetPopulation ?? ""} />
          </FormField>
          <FormField label="Participant criteria">
            <Textarea name="participantCriteria" rows={2} defaultValue={project.participantCriteria ?? ""} />
          </FormField>
          <FormField label="Product or experience being evaluated">
            <Input name="productOrExperience" defaultValue={project.productOrExperience ?? ""} />
          </FormField>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit">Save project</Button>
      </div>
    </form>
  );
}
