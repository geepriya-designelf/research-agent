import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceList } from "@/components/research/Evidence";
import { ConfidenceBadge, FrequencyLabel, SeverityBadge } from "@/components/research/labels";
import { mustNotClaimResolved } from "@/domain/comparison";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function EvaluationPage({
  params,
}: {
  params: Promise<{ projectId: string; evaluationId: string }>;
}) {
  const { projectId, evaluationId } = await params;
  const store = getStore();
  const bundle = await store.getEvaluation(evaluationId);
  if (!bundle) notFound();

  const { evaluation, issues, userNeeds, recommendations } = bundle;
  const [participants, themes, comparisons] = await Promise.all([
    store.listParticipants(evaluation.studyId),
    store.listThemes(projectId, evaluation.studyId),
    store.listComparisons(evaluation.id),
  ]);

  const codeById = new Map(participants.map((p) => [p.id, p.code]));
  const themeById = new Map(themes.map((t) => [t.id, t]));
  const needById = new Map(userNeeds.map((n) => [n.id, n]));
  const issueById = new Map(issues.map((i) => [i.id, i]));
  const sorted = [...issues].sort((a, b) => b.severity - a.severity);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Link
          href={`/projects/${projectId}/studies/${evaluation.studyId}`}
          className="text-xs text-muted-ink underline underline-offset-2"
        >
          ← back to study
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          Round {evaluation.round} · {evaluation.label}
        </h1>
        <p className="text-sm text-muted-ink">
          {evaluation.productVersion ?? "no product version recorded"} · goal:{" "}
          {evaluation.researchGoal}
        </p>
      </header>

      {bundle.tasksNotExercised.length > 0 ? (
        <Callout tone="caution" title="Tasks this round did not exercise">
          <ul className="list-disc space-y-1 pl-4">
            {bundle.tasksNotExercised.map((task, i) => (
              <li key={i}>{task}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            An issue on an unexercised task cannot be assessed as resolved in a later round.
          </p>
        </Callout>
      ) : null}

      {bundle.limitations.length > 0 ? (
        <Callout tone="info" title="Limitations of this evaluation">
          <ul className="list-disc space-y-1 pl-4">
            {bundle.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {comparisons.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Compared with the previous round</h2>
          <div className="flex flex-col gap-2">
            {comparisons.map((change) => {
              const current = change.currentIssueId ? issueById.get(change.currentIssueId) : null;
              return (
                <Card key={change.id}>
                  <CardContent className="flex flex-col gap-2 pt-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={changeTone(change.status)}>
                        {change.status.replace(/_/g, " ")}
                      </Badge>
                      <ConfidenceBadge confidence={change.confidence} />
                      {mustNotClaimResolved(change.status) ? (
                        <Badge tone="caution">not observed ≠ resolved</Badge>
                      ) : null}
                      {change.taskWasRetested ? null : (
                        <Badge tone="alarm">task not retested this round</Badge>
                      )}
                    </div>
                    {current ? <p className="text-sm font-medium">{current.name}</p> : null}
                    <p className="text-sm text-muted-ink">{change.rationale}</p>
                    {change.evidence.length > 0 ? <EvidenceList evidence={change.evidence} /> : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">UX issues</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-ink">No issues recorded for this round.</p>
        ) : (
          sorted.map((issue) => (
            <Card key={issue.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={issue.severity} />
                  <FrequencyLabel
                    count={issue.affectedParticipantCount}
                    total={issue.totalParticipantsConsidered}
                  />
                  <ConfidenceBadge confidence={issue.confidence} />
                  {issue.affectedParticipantIds.length > 0 ? (
                    <Badge>
                      {issue.affectedParticipantIds.map((id) => codeById.get(id) ?? id).join(", ")}
                    </Badge>
                  ) : null}
                </div>
                <CardTitle>{issue.name}</CardTitle>
                <CardDescription>{issue.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* The pipeline, kept visibly separate rather than collapsed. */}
                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  <Field label="Task" value={issue.affectedTask} />
                  <Field label="Flow" value={issue.affectedFlow} />
                  <Field label="What the user expected" value={issue.userExpectation} />
                  <Field label="What they actually did" value={issue.observedBehavior} />
                  <Field label="What actually happened" value={issue.actualExperience} />
                  <Field label="Design implication" value={issue.designImplication} />
                </dl>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
                    Why this severity
                  </p>
                  <p className="text-sm text-muted-ink">{issue.severityRationale}</p>
                </div>

                {issue.likelyCauseHypotheses.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
                      Likely cause — hypotheses, not conclusions
                    </p>
                    {issue.likelyCauseHypotheses.map((cause) => (
                      <div key={cause.id} className="rounded-md border border-line px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <ConfidenceBadge confidence={cause.confidence} />
                        </div>
                        <p className="mt-1 text-sm">{cause.hypothesis}</p>
                        {cause.wouldBeTestedBy ? (
                          <p className="mt-1 text-xs text-muted-ink">
                            <span className="font-medium">Would be tested by: </span>
                            {cause.wouldBeTestedBy}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {issue.relatedUserNeedIds.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
                      Underlying user need
                    </p>
                    <ul className="list-disc space-y-0.5 pl-4 text-sm">
                      {issue.relatedUserNeedIds.map((id) => (
                        <li key={id}>{needById.get(id)?.statement ?? id}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {issue.relatedThemeIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {issue.relatedThemeIds.map((id) => {
                      const theme = themeById.get(id);
                      if (!theme) return null;
                      return (
                        <Link
                          key={id}
                          href={`/projects/${projectId}/studies/${evaluation.studyId}/themes/${id}`}
                        >
                          <Badge tone="accent">theme: {theme.name}</Badge>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}

                <EvidenceList evidence={issue.evidence} />
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {userNeeds.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">User needs</h2>
          {userNeeds.map((need) => (
            <Card key={need.id}>
              <CardHeader className="pb-3">
                <div className="flex gap-2">
                  <ConfidenceBadge confidence={need.confidence} />
                </div>
                <CardTitle className="text-sm font-medium">{need.statement}</CardTitle>
              </CardHeader>
              <CardContent>
                <EvidenceList evidence={need.evidence} />
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {recommendations.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Recommendations and hypotheses</h2>
          <p className="text-sm text-muted-ink">
            Qualitative research shows what is wrong and what people need. It does not prove that a
            particular design will work — anything not firmly supported is stated as a hypothesis to
            test.
          </p>
          {recommendations.map((rec) => (
            <Card key={rec.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap gap-2">
                  <Badge tone={rec.kind === "recommendation" ? "accent" : "caution"}>
                    {rec.kind === "recommendation" ? "recommendation" : "hypothesis to test"}
                  </Badge>
                  <ConfidenceBadge confidence={rec.evidenceStrength} />
                </div>
                <CardTitle className="text-sm font-medium">{rec.statement}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {rec.designPrinciple ? (
                  <p>
                    <span className="font-medium">Design principle: </span>
                    <span className="text-muted-ink">{rec.designPrinciple}</span>
                  </p>
                ) : null}
                <p className="text-muted-ink">{rec.rationale}</p>
                {rec.howToValidate ? (
                  <p>
                    <span className="font-medium">How to validate: </span>
                    <span className="text-muted-ink">{rec.howToValidate}</span>
                  </p>
                ) : null}
                {rec.addressesIssueIds.length > 0 ? (
                  <p className="text-xs text-muted-ink">
                    Addresses:{" "}
                    {rec.addressesIssueIds.map((id) => issueById.get(id)?.name ?? id).join("; ")}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-ink">{label}</dt>
      <dd className={value ? "" : "italic text-muted-ink"}>{value ?? "not recorded"}</dd>
    </div>
  );
}

function changeTone(status: string): "evidence" | "caution" | "alarm" | "neutral" {
  if (status === "improved") return "evidence";
  if (status === "regressed" || status === "new_issue") return "alarm";
  if (status === "not_observed" || status === "partially_improved") return "caution";
  return "neutral";
}
