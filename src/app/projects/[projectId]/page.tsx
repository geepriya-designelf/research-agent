import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceBlock } from "@/components/research/Evidence";
import {
  FrequencyLabel,
  PatternStrengthBadge,
  SeverityBadge,
} from "@/components/research/labels";
import { mustNotClaimResolved } from "@/domain/comparison";
import { RESEARCH_STAGE_LABELS, RESEARCH_TYPE_LABELS } from "@/domain/taxonomy";
import { loadProjectOverview, rankIssues, rankThemes } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function ProjectDashboard({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const overview = await loadProjectOverview(projectId);
  if (!overview) notFound();

  const { project } = overview;
  const topThemes = rankThemes(overview.themes).slice(0, 5);
  const topIssues = rankIssues(overview.issues);
  const runningJobs = overview.jobs.filter((j) => j.status === "queued" || j.status === "running");
  const failedJobs = overview.jobs.filter((j) => j.status === "failed");
  const jobWarnings = overview.jobs.flatMap((j) => j.warnings);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-2 text-sm text-muted-ink">
            <span className="font-medium text-ink">Problem:</span> {project.problemStatement}
          </p>
          <p className="mt-1 text-sm text-muted-ink">
            <span className="font-medium text-ink">Goal:</span> {project.researchGoal}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}/edit`}>Edit project</Link>
          </Button>
          <Button asChild>
            <Link href={`/projects/${projectId}/studies/new`}>New study</Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Studies" value={overview.studies.length} />
        <Stat label="Participants" value={overview.participantCount} />
        <Stat label="Transcripts" value={overview.transcriptCount} />
        <Stat label="Syntheses" value={overview.synthesisCount} />
        <Stat label="Themes" value={overview.themes.length} />
      </div>

      {runningJobs.length > 0 ? (
        <Callout tone="info" title={`${runningJobs.length} analysis job(s) in progress`}>
          {runningJobs.map((job) => (
            <p key={job.id}>
              {job.kind.replace("_", " ")} — {job.subjectLabel ?? job.subjectId} ({job.status})
            </p>
          ))}
          <p className="mt-1 text-xs">Refresh to see results as they land.</p>
        </Callout>
      ) : null}

      {failedJobs.length > 0 ? (
        <Callout tone="alarm" title={`${failedJobs.length} analysis job(s) failed`}>
          {failedJobs.slice(0, 4).map((job) => (
            <p key={job.id}>
              {job.kind.replace("_", " ")} — {job.subjectLabel}: {job.error}
            </p>
          ))}
        </Callout>
      ) : null}

      {jobWarnings.length > 0 ? (
        <Callout tone="caution" title="Analysis warnings">
          <ul className="list-disc space-y-1 pl-4">
            {jobWarnings.slice(0, 8).map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {/* ------------------------------------------------ What do we know? */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">What do we currently know?</h2>
          <p className="text-sm text-muted-ink">
            Ranked by pattern strength and verified evidence, not by how often something was said.
          </p>
        </div>
        {topThemes.length === 0 ? (
          <Card>
            <CardContent className="pt-5 text-sm text-muted-ink">
              No themes yet. Run Research Synthesis on your transcripts, then Research Theming.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {topThemes.map((theme) => {
              const firstEvidence = theme.evidence[0];
              return (
                <Card key={theme.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <PatternStrengthBadge strength={theme.patternStrength} />
                      <FrequencyLabel
                        count={theme.participantCount}
                        total={theme.totalParticipantsConsidered}
                      />
                      {theme.counterEvidence.length > 0 ? (
                        <Badge tone="caution">
                          {theme.counterEvidence.length} counter-evidence
                        </Badge>
                      ) : null}
                      {theme.challengesHypotheses.length > 0 ? (
                        <Badge tone="alarm">challenges a hypothesis</Badge>
                      ) : null}
                    </div>
                    <CardTitle>{theme.name}</CardTitle>
                    <CardDescription>{theme.underlyingInsight}</CardDescription>
                  </CardHeader>
                  {firstEvidence ? (
                    <CardContent>
                      <EvidenceBlock evidence={firstEvidence.evidence} />
                    </CardContent>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- UX findings */}
      {topIssues.length > 0 && overview.latestEvaluation ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-lg font-semibold">UX issues</h2>
              <p className="text-sm text-muted-ink">
                From {overview.latestEvaluation.label} (round {overview.latestEvaluation.round}
                {overview.latestEvaluation.productVersion
                  ? `, ${overview.latestEvaluation.productVersion}`
                  : ""}
                ).
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${projectId}/evaluations/${overview.latestEvaluation.id}`}>
                Open evaluation
              </Link>
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {topIssues.slice(0, 5).map((issue) => (
              <Card key={issue.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={issue.severity} />
                    <FrequencyLabel
                      count={issue.affectedParticipantCount}
                      total={issue.totalParticipantsConsidered}
                    />
                  </div>
                  <CardTitle>{issue.name}</CardTitle>
                  <CardDescription>{issue.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------- What changed? */}
      {overview.changesSincePrevious.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">What changed since the previous evaluation</h2>
          <div className="flex flex-col gap-2">
            {overview.changesSincePrevious.map((change) => (
              <Card key={change.id}>
                <CardContent className="flex flex-col gap-2 pt-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={changeTone(change.status)}>{change.status.replace(/_/g, " ")}</Badge>
                    {mustNotClaimResolved(change.status) ? (
                      <Badge tone="caution">not the same as resolved</Badge>
                    ) : null}
                    {!change.taskWasRetested ? (
                      <Badge tone="alarm">task not retested</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-ink">{change.rationale}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* -------------------------------------- What are we uncertain about? */}
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What are we uncertain about?</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.uncertainties.length === 0 ? (
              <p className="text-sm text-muted-ink">Nothing flagged yet.</p>
            ) : (
              <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-ink">
                {overview.uncertainties.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open questions</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.openQuestions.length === 0 ? (
              <p className="text-sm text-muted-ink">None recorded yet.</p>
            ) : (
              <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-ink">
                {overview.openQuestions.slice(0, 10).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ------------------------------------------------------- Studies */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Studies</h2>
        {overview.studies.length === 0 ? (
          <Card>
            <CardContent className="pt-5 text-sm text-muted-ink">
              No studies yet. A study records what kind of research this is and at what stage —
              which determines how the material is analysed.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {overview.studies.map(({ study, transcripts, participants, syntheses, themeCount }) => (
              <Link key={study.id} href={`/projects/${projectId}/studies/${study.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="accent">
                        {study.researchType === "other" && study.researchTypeCustom
                          ? study.researchTypeCustom
                          : RESEARCH_TYPE_LABELS[study.researchType]}
                      </Badge>
                      <Badge>
                        {study.researchStage === "other" && study.researchStageCustom
                          ? study.researchStageCustom
                          : RESEARCH_STAGE_LABELS[study.researchStage]}
                      </Badge>
                      {study.classificationConfirmedAt ? null : (
                        <Badge tone="caution">classification unconfirmed</Badge>
                      )}
                    </div>
                    <CardTitle>{study.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-ink">
                      {transcripts.length} transcript(s) · {participants.length} participant(s) ·{" "}
                      {syntheses.length} synthesis(es) · {themeCount} theme(s)
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {overview.researchQuestions.length > 0 ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Research questions</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-ink">
            {overview.researchQuestions.map((q) => (
              <li key={q.id}>{q.text}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-ink">{label}</p>
    </div>
  );
}

function changeTone(status: string): "evidence" | "caution" | "alarm" | "neutral" {
  if (status === "improved") return "evidence";
  if (status === "regressed" || status === "new_issue") return "alarm";
  if (status === "not_observed" || status === "partially_improved") return "caution";
  return "neutral";
}
