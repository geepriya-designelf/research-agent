import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, Textarea } from "@/components/ui/field";
import { createProjectAction } from "@/server/actions/projects";

export default function NewProjectPage() {
  return (
    <form action={createProjectAction} className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">New project</h1>
        <p className="mt-1 text-sm text-muted-ink">
          The problem and the goal are not paperwork — every analysis stage uses them to decide what
          matters in a transcript. Unexpected findings are kept regardless.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Research problem</CardTitle>
          <CardDescription>What are you trying to solve, and what do you need to learn?</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="Project name">
            <Input name="name" required placeholder="Improve Checkout" />
          </FormField>
          <FormField label="Problem being solved">
            <Textarea
              name="problemStatement"
              required
              placeholder="Customers abandon checkout at a high rate and we do not know where or why."
            />
          </FormField>
          <FormField label="Research goal">
            <Textarea
              name="researchGoal"
              required
              placeholder="Understand what causes people to abandon checkout, and what would give them enough confidence to complete it."
            />
          </FormField>
          <FormField label="Research questions" hint="One per line.">
            <Textarea
              name="researchQuestions"
              rows={4}
              placeholder={"Where in checkout do people lose confidence?\nWhat information do people look for before paying?"}
            />
          </FormField>
          <FormField
            label="Hypotheses (optional)"
            hint="One per line. Analysis actively looks for evidence against these, not just for them."
          >
            <Textarea name="hypotheses" rows={3} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Context (optional)</CardTitle>
          <CardDescription>
            Recorded as stated. Nothing here is used to infer participant demographics.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="Target population">
            <Input name="targetPopulation" placeholder="First-time buyers on mobile" />
          </FormField>
          <FormField label="Participant criteria">
            <Textarea name="participantCriteria" rows={2} />
          </FormField>
          <FormField label="Product or experience being evaluated">
            <Input name="productOrExperience" placeholder="Checkout flow, web" />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit">Create project</Button>
      </div>
    </form>
  );
}
