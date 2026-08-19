import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { getStore, storeBackend } from "@/server/store";
import { isLlmConfigured } from "@/llm/client";
import { jobsBackend } from "@/server/jobs/runner";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const store = getStore();
  const projects = await store.listProjects();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-ink">
            A project is a product or research problem. Studies inside it are individual research
            efforts — discovery interviews, usability rounds, post-launch follow-ups — analysed
            through the lens their type and stage call for.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">New project</Link>
        </Button>
      </div>

      {!isLlmConfigured() ? (
        <Callout tone="caution" title="Anthropic API key not detected">
          Set <code>ANTHROPIC_API_KEY</code> before running analysis. You can still create projects,
          studies, and upload material.
        </Callout>
      ) : null}

      <p className="text-xs text-muted-ink">
        Storage: <strong>{storeBackend()}</strong> · Background jobs: <strong>{jobsBackend()}</strong>
      </p>

      {projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              Start by naming the problem you are trying to solve and the goal of the research.
              Everything downstream is judged for relevance against those two things.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/projects/new">Create your first project</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle>{project.name}</CardTitle>
                  <CardDescription className="line-clamp-2">{project.problemStatement}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-ink">
                    <span className="font-medium text-ink">Goal:</span> {project.researchGoal}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
