import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceList } from "@/components/research/Evidence";
import { ConfidenceBadge, EpistemicBadge } from "@/components/research/labels";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function SynthesisPage({
  params,
}: {
  params: Promise<{ projectId: string; studyId: string; synthesisId: string }>;
}) {
  const { projectId, studyId, synthesisId } = await params;
  const store = getStore();
  const synthesis = await store.getSynthesis(synthesisId);
  if (!synthesis) notFound();

  const [participant, transcript] = await Promise.all([
    store.getParticipant(synthesis.participantId),
    store.getTranscript(synthesis.transcriptId),
  ]);

  const transcriptHref = `/projects/${projectId}/transcripts/${synthesis.transcriptId}`;
  const insightsByCategory = groupBy(synthesis.insights, (i) => i.category);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Link
          href={`/projects/${projectId}/studies/${studyId}`}
          className="text-xs text-muted-ink underline underline-offset-2"
        >
          ← back to study
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          {participant?.code ?? "Participant"} — synthesis
        </h1>
        <p className="text-sm text-muted-ink">
          {transcript?.name ?? "transcript"} ·{" "}
          <Link href={transcriptHref} className="underline underline-offset-2">
            view source
          </Link>
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed">{synthesis.overallSummary}</p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
                What the participant said
              </h3>
              {synthesis.participantReported.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                  {synthesis.participantReported.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm italic text-muted-ink">Nothing recorded.</p>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
                What was observed
              </h3>
              <p className="mt-2 text-sm">
                {synthesis.observedBehaviorSummary ?? (
                  <span className="italic text-muted-ink">
                    This material records no observed behaviour — it is self-report only.
                  </span>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {participant ? (
        <Card>
          <CardHeader>
            <CardTitle>Participant</CardTitle>
            <CardDescription>
              Recorded only from what the source states. Nothing is inferred.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{participant.code}</Badge>
              {participant.displayName ? <Badge>{participant.displayName}</Badge> : null}
            </div>
            {participant.demographics.length === 0 ? (
              <p className="text-sm italic text-muted-ink">
                No demographics are stated anywhere in this transcript.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {participant.demographics.map((fact, i) => (
                  <div key={i}>
                    <p className="text-sm">
                      <span className="font-medium">{fact.field}:</span> {fact.value}
                    </p>
                    <EvidenceList evidence={fact.evidence} transcriptHref={() => transcriptHref} />
                  </div>
                ))}
              </div>
            )}
            {participant.backgroundContext ? (
              <p className="text-sm text-muted-ink">{participant.backgroundContext}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {synthesis.taskOutcomes.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Tasks</h2>
          {synthesis.taskOutcomes.map((task) => (
            <Card key={task.id}>
              <CardHeader>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={outcomeTone(task.outcome)}>{task.outcome.replace(/_/g, " ")}</Badge>
                  {task.assistanceRequired ? <Badge tone="caution">assistance required</Badge> : null}
                </div>
                <CardTitle>{task.taskLabel}</CardTitle>
                {task.taskGoal ? <CardDescription>{task.taskGoal}</CardDescription> : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <Pair label="Expected" value={task.participantExpectation} />
                <Pair label="Observed behaviour" value={task.observedBehavior} />
                <ListPair label="Hesitations" items={task.hesitations} />
                <ListPair label="Confusions" items={task.confusions} />
                <ListPair label="Errors" items={task.errors} />
                <ListPair label="Workarounds" items={task.workarounds} />
                <EvidenceList evidence={task.evidence} transcriptHref={() => transcriptHref} />
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Insights</h2>
        {synthesis.insights.length === 0 ? (
          <p className="text-sm text-muted-ink">No insights recorded.</p>
        ) : (
          Object.entries(insightsByCategory).map(([category, insights]) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
                {category.replace(/_/g, " ")}
              </h3>
              {insights.map((insight) => (
                <Card key={insight.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap gap-2">
                      <EpistemicBadge status={insight.epistemicStatus} />
                      <ConfidenceBadge confidence={insight.confidence} />
                    </div>
                    <CardTitle className="text-sm font-medium">{insight.statement}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {insight.interpretation ? (
                      <p className="text-sm text-muted-ink">
                        <span className="font-medium text-ink">Interpretation (analyst): </span>
                        {insight.interpretation}
                      </p>
                    ) : null}
                    <EvidenceList
                      evidence={insight.evidence}
                      transcriptHref={() => transcriptHref}
                      emptyLabel="No verbatim evidence was attached to this insight."
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ))
        )}
      </section>

      {synthesis.contradictions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Contradictions</h2>
          <p className="text-sm text-muted-ink">
            Preserved unresolved. Both sides are kept with their own evidence.
          </p>
          {synthesis.contradictions.map((contradiction) => (
            <Card key={contradiction.id}>
              <CardHeader>
                <CardTitle className="text-sm">{contradiction.description}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{contradiction.sideA.statement}</p>
                  <EvidenceList
                    evidence={contradiction.sideA.evidence}
                    transcriptHref={() => transcriptHref}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{contradiction.sideB.statement}</p>
                  <EvidenceList
                    evidence={contradiction.sideB.evidence}
                    transcriptHref={() => transcriptHref}
                  />
                </div>
                {contradiction.possibleReading ? (
                  <p className="md:col-span-2 text-sm text-muted-ink">
                    <span className="font-medium text-ink">One possible reading: </span>
                    {contradiction.possibleReading}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {synthesis.notableQuotes.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Notable quotes</h2>
          <EvidenceList evidence={synthesis.notableQuotes} transcriptHref={() => transcriptHref} />
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {synthesis.notSupportedByEvidence.length > 0 ? (
          <Callout tone="caution" title="Not supported by this material">
            <ul className="list-disc space-y-1 pl-4">
              {synthesis.notSupportedByEvidence.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Callout>
        ) : null}
        {synthesis.openQuestions.length > 0 ? (
          <Callout tone="info" title="Questions this session raises">
            <ul className="list-disc space-y-1 pl-4">
              {synthesis.openQuestions.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Callout>
        ) : null}
      </div>

      {synthesis.modelNotes ? (
        <p className="text-xs text-muted-ink">
          <span className="font-medium">Notes on the material: </span>
          {synthesis.modelNotes}
        </p>
      ) : null}
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p>
      <span className="font-medium">{label}: </span>
      <span className="text-muted-ink">{value}</span>
    </p>
  );
}

function ListPair({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-medium">{label}</p>
      <ul className="list-disc space-y-0.5 pl-4 text-muted-ink">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function outcomeTone(outcome: string): "evidence" | "caution" | "alarm" | "neutral" {
  if (outcome === "success") return "evidence";
  if (outcome === "failure" || outcome === "abandoned") return "alarm";
  if (outcome === "unknown" || outcome === "not_attempted") return "neutral";
  return "caution";
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {});
}
