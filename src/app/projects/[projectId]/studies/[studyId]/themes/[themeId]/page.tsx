import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceBlock } from "@/components/research/Evidence";
import { ConfidenceBadge, FrequencyLabel, PatternStrengthBadge } from "@/components/research/labels";
import { frequencyPhrase } from "@/domain/frequency";
import type { ThemeEvidence } from "@/domain/model";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Theme → Participant → Insight → Original Evidence. This page is the
 * traceability chain made walkable.
 */
export default async function ThemePage({
  params,
}: {
  params: Promise<{ projectId: string; studyId: string; themeId: string }>;
}) {
  const { projectId, studyId, themeId } = await params;
  const store = getStore();
  const theme = await store.getTheme(themeId);
  if (!theme) notFound();

  const participants = await store.listParticipants(studyId);
  const syntheses = await store.listSyntheses(studyId);
  const codeById = new Map(participants.map((p) => [p.id, p.code]));

  const insightById = new Map(
    syntheses.flatMap((s) => s.insights.map((i) => [i.id, { insight: i, synthesis: s }] as const)),
  );

  const renderEvidence = (item: ThemeEvidence, tone: "support" | "counter") => {
    const link = item.insightId ? insightById.get(item.insightId) : undefined;
    const code = codeById.get(item.participantId) ?? item.participantId;
    const synthesisId = link?.synthesis.id ?? item.synthesisId;
    return (
      <Card key={item.id} className={tone === "counter" ? "border-caution/40" : undefined}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{code}</Badge>
            {tone === "counter" ? <Badge tone="caution">counter-evidence</Badge> : null}
            {synthesisId ? (
              <Link
                href={`/projects/${projectId}/studies/${studyId}/syntheses/${synthesisId}`}
                className="text-xs underline underline-offset-2 hover:text-accent"
              >
                open participant synthesis
              </Link>
            ) : null}
          </div>
          {link ? (
            <CardTitle className="text-sm font-medium">{link.insight.statement}</CardTitle>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-ink">
            <span className="font-medium text-ink">Why this belongs here: </span>
            {item.rationale}
          </p>
          <EvidenceBlock
            evidence={item.evidence}
            transcriptHref={
              item.transcriptId ? `/projects/${projectId}/transcripts/${item.transcriptId}` : undefined
            }
          />
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Link
          href={`/projects/${projectId}/studies/${studyId}`}
          className="text-xs text-muted-ink underline underline-offset-2"
        >
          ← back to study
        </Link>
        <div className="mt-2 flex flex-wrap gap-2">
          <PatternStrengthBadge strength={theme.patternStrength} />
          <ConfidenceBadge confidence={theme.confidence} />
          <FrequencyLabel
            count={theme.participantCount}
            total={theme.totalParticipantsConsidered}
          />
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{theme.name}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-ink">{theme.description}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Why this is a pattern</CardTitle>
          <CardDescription>
            {frequencyPhrase(theme.participantCount, theme.totalParticipantsConsidered)} support this.
            That is a count, not a proportion of any population.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
              Underlying insight
            </p>
            <p>{theme.underlyingInsight}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
              Why these observations belong together
            </p>
            <p>{theme.whyMeaningful}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
              Relation to the research problem
            </p>
            <p>{theme.relationToResearchProblem}</p>
          </div>
          {theme.potentialImplication ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
                Potential implication (a possibility, not a proven solution)
              </p>
              <p>{theme.potentialImplication}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {theme.challengesHypotheses.length > 0 ? (
        <Callout tone="caution" title="This pattern cuts against a stated hypothesis">
          <ul className="list-disc space-y-1 pl-4">
            {theme.challengesHypotheses.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Supporting evidence</h2>
        {theme.evidence.length === 0 ? (
          <p className="text-sm text-muted-ink">No evidence attached.</p>
        ) : (
          theme.evidence.map((item) => renderEvidence(item, "support"))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Counter-evidence</h2>
        {theme.counterEvidence.length === 0 ? (
          <p className="text-sm text-muted-ink">
            None was recorded. That is not the same as none existing.
          </p>
        ) : (
          theme.counterEvidence.map((item) => renderEvidence(item, "counter"))
        )}
      </section>

      {theme.outlierParticipantIds.length > 0 ? (
        <Callout tone="info" title="Outliers">
          <p>
            {theme.outlierParticipantIds.map((id) => codeById.get(id) ?? id).join(", ")} sit outside
            this pattern.
          </p>
          {theme.outlierNotes ? <p className="mt-1">{theme.outlierNotes}</p> : null}
        </Callout>
      ) : null}
    </div>
  );
}
