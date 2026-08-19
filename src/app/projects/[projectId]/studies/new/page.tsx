import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input } from "@/components/ui/field";
import { ClassificationFields } from "@/components/research/ClassificationFields";
import { createStudyAction } from "@/server/actions/studies";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function NewStudyPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getStore().getProject(projectId);
  if (!project) notFound();

  const action = createStudyAction.bind(null, projectId);

  return (
    <form action={action} className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">New study in {project.name}</h1>
        <p className="mt-1 text-sm text-muted-ink">
          A study is one research effort — a round of interviews, a usability test, a post-launch
          follow-up. Keeping them separate is what lets you compare rounds later.
        </p>
      </div>

      <Callout tone="info" title="Classification is required before analysis">
        You will be asked to review and confirm this classification on the study page before any
        analysis runs. The system may flag an apparent mismatch, but it will never reclassify your
        material for you.
      </Callout>

      <Card>
        <CardHeader>
          <CardTitle>Study setup</CardTitle>
          <CardDescription>
            Example: “Checkout Usability Test — Prototype Evaluation”.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="Study name">
            <Input name="name" required placeholder="Exploratory User Interviews" />
          </FormField>
          <ClassificationFields />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit">Create study</Button>
      </div>
    </form>
  );
}
