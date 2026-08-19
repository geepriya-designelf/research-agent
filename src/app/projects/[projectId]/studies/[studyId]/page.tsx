import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, Textarea } from "@/components/ui/field";
import { ClassificationFields } from "@/components/research/ClassificationFields";
import { FrequencyLabel, PatternStrengthBadge } from "@/components/research/labels";
import { buildResearchFrame } from "@/domain/frame";
import { supportsUxEvaluation } from "@/domain/taxonomy";
import { detectMixedMethod } from "@/transcript/detectMixedMethod";
import {
  addPastedMaterialAction,
  addUploadedMaterialAction,
  runAllSynthesesAction,
  runSynthesisAction,
  runThemingAction,
  runUxEvaluationAction,
} from "@/server/actions/material";
import { confirmClassificationAction, reopenClassificationAction } from "@/server/actions/studies";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function StudyPage({
  params,
}: {
  params: Promise<{ projectId: string; studyId: string }>;
}) {
  const { projectId, studyId } = await params;
  const store = getStore();

  const [project, study] = await Promise.all([store.getProject(projectId), store.getStudy(studyId)]);
  if (!project || !study) notFound();

  const [researchQuestions, transcripts, participants, syntheses, themes, rejected, jobs, evaluations] =
    await Promise.all([
      store.listResearchQuestions(projectId),
      store.listTranscripts(studyId),
      store.listParticipants(studyId),
      store.listSyntheses(studyId),
      store.listThemes(projectId, studyId),
      store.listRejectedPatterns(projectId, studyId),
      store.listJobs(projectId),
      store.listEvaluations(projectId),
    ]);

  const frame = buildResearchFrame({ project, study, researchQuestions, participants, transcripts });
  const confirmed = Boolean(study.classificationConfirmedAt);
  const uxApplies = supportsUxEvaluation(study.researchType, study.researchStage);

  // Advisory classification check across all the study's material. It never
  // changes the researcher's selection.
  const notices: string[] = [];
  for (const transcript of transcripts) {
    const segments = await store.listSegments(transcript.id);
    const signal = detectMixedMethod(segments, study.researchType);
    if (signal.message) notices.push(`${transcript.name}: ${signal.message}`);
  }

  const synthesisByTranscript = new Map(syntheses.map((s) => [s.transcriptId, s]));
  const studyJobs = jobs.filter((j) => j.studyId === studyId);
  const activeJobs = studyJobs.filter((j) => j.status === "queued" || j.status === "running");
  const failedJobs = studyJobs.filter((j) => j.status === "failed");
  const jobWarnings = studyJobs.flatMap((j) => j.warnings);

  const confirmAction = confirmClassificationAction.bind(null, projectId, studyId);
  const reopenAction = reopenClassificationAction.bind(null, projectId, studyId);
  const pasteAction = addPastedMaterialAction.bind(null, projectId, studyId);
  const uploadAction = addUploadedMaterialAction.bind(null, projectId, studyId);
  const synthesiseAllAction = runAllSynthesesAction.bind(null, projectId, studyId);
  const themingAction = runThemingAction.bind(null, projectId, studyId);
  const evaluateAction = runUxEvaluationAction.bind(null, projectId, studyId);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/projects/${projectId}`}
            className="text-xs text-muted-ink underline underline-offset-2"
          >
            ← {project.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{study.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="accent">{frame.researchTypeLabel}</Badge>
            <Badge>{frame.researchStageLabel}</Badge>
            {confirmed ? (
              <Badge tone="evidence">classification confirmed</Badge>
            ) : (
              <Badge tone="caution">classification not confirmed</Badge>
            )}
          </div>
        </div>
      </header>

      {activeJobs.length > 0 ? (
        <Callout tone="info" title={`${activeJobs.length} job(s) running`}>
          {activeJobs.map((job) => (
            <p key={job.id}>
              {job.kind.replace(/_/g, " ")} — {job.subjectLabel} ({job.status})
            </p>
          ))}
        </Callout>
      ) : null}
      {failedJobs.length > 0 ? (
        <Callout tone="alarm" title="Failed jobs">
          {failedJobs.slice(0, 5).map((job) => (
            <p key={job.id}>
              {job.kind.replace(/_/g, " ")} — {job.subjectLabel}: {job.error}
            </p>
          ))}
        </Callout>
      ) : null}
      {jobWarnings.length > 0 ? (
        <Callout tone="caution" title="Analysis warnings">
          <ul className="list-disc space-y-1 pl-4">
            {jobWarnings.slice(0, 10).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {/* ------------------------------------- 1. Confirm classification */}
      <section id="classification">
        <Card>
          <CardHeader>
            <CardTitle>1 · Study classification</CardTitle>
            <CardDescription>
              Analysis is blocked until you confirm this. Research type and stage decide which
              analytical lens is applied — an interview produces needs and mental models, a usability
              test produces observed behaviour and usability issues.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {notices.length > 0 ? (
              <Callout tone="caution" title="The material may not match the classification">
                <ul className="list-disc space-y-1 pl-4">
                  {notices.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">
                  This is advisory. Your classification is used exactly as you set it.
                </p>
              </Callout>
            ) : null}

            {confirmed ? (
              <div className="flex flex-col gap-3">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <Row label="Research type" value={frame.researchTypeLabel} />
                  <Row label="Research stage" value={frame.researchStageLabel} />
                  <Row label="Research goal" value={frame.researchGoal} />
                  <Row
                    label="Research questions"
                    value={
                      frame.researchQuestions.length > 0
                        ? frame.researchQuestions.map((q) => q.text).join(" · ")
                        : "none recorded"
                    }
                  />
                  {study.productVersion ? (
                    <Row label="Product version" value={study.productVersion} />
                  ) : null}
                  {study.plannedTasks.length > 0 ? (
                    <Row label="Planned tasks" value={study.plannedTasks.join(" · ")} />
                  ) : null}
                </dl>
                <form action={reopenAction}>
                  <Button type="submit" variant="outline" size="sm">
                    Change classification
                  </Button>
                </form>
              </div>
            ) : (
              <form action={confirmAction} className="flex flex-col gap-4">
                <ClassificationFields
                  defaults={{
                    researchType: study.researchType,
                    researchTypeCustom: study.researchTypeCustom,
                    researchStage: study.researchStage,
                    researchStageCustom: study.researchStageCustom,
                    studyGoal: study.studyGoal,
                    productVersion: study.productVersion,
                    plannedTasks: study.plannedTasks,
                  }}
                />
                <div>
                  <Button type="submit">Confirm &amp; enable analysis</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ------------------------------------------- 2. Research material */}
      <section id="material" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">2 · Research material</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upload files</CardTitle>
              <CardDescription>.txt, .md, .docx, .pdf. The original file is kept as-is.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={uploadAction} className="flex flex-col gap-3">
                <input
                  type="file"
                  name="files"
                  multiple
                  accept=".txt,.md,.markdown,.docx,.pdf,text/plain,application/pdf"
                  className="text-sm"
                />
                <Button type="submit" variant="outline">
                  Add files
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Paste a transcript</CardTitle>
              <CardDescription>
                Speaker labels and timestamps are detected when present, and preserved as evidence
                anchors. Nothing is invented when they are absent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={pasteAction} className="flex flex-col gap-3">
                <FormField label="Name">
                  <Input name="name" placeholder="P04 — 12 March" />
                </FormField>
                <FormField label="Transcript text">
                  <Textarea name="text" rows={6} placeholder={"Moderator: Tell me about...\nP04: Well, I usually..."} />
                </FormField>
                <Button type="submit" variant="outline">
                  Add transcript
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {transcripts.length > 0 ? (
          <div className="flex flex-col gap-2">
            {transcripts.map((transcript) => {
              const synthesis = synthesisByTranscript.get(transcript.id);
              const runOne = runSynthesisAction.bind(null, projectId, studyId, transcript.id);
              return (
                <Card key={transcript.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{transcript.name}</p>
                      <p className="text-xs text-muted-ink">
                        {transcript.sourceKind === "upload" ? "uploaded" : "pasted"}
                        {transcript.originalFilename ? ` · ${transcript.originalFilename}` : ""}
                        {transcript.extractionWarnings.length > 0
                          ? ` · ${transcript.extractionWarnings.length} extraction warning(s)`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/projects/${projectId}/transcripts/${transcript.id}`}>
                          View source
                        </Link>
                      </Button>
                      {synthesis ? (
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`/projects/${projectId}/studies/${studyId}/syntheses/${synthesis.id}`}
                          >
                            Open synthesis
                          </Link>
                        </Button>
                      ) : (
                        <form action={runOne}>
                          <Button type="submit" size="sm" disabled={!confirmed}>
                            Run synthesis
                          </Button>
                        </form>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-ink">No material added yet.</p>
        )}
      </section>

      {/* ---------------------------------------------- 3. Research frame */}
      <section id="frame">
        <Card>
          <CardHeader>
            <CardTitle>3 · Research frame</CardTitle>
            <CardDescription>
              The context handed to every analysis stage. Demographics are drawn only from what
              participants actually stated.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 text-sm">
              <Row label="Problem" value={frame.problemStatement} />
              <Row label="Goal" value={frame.researchGoal} />
              <Row label="Participants" value={String(frame.participantCount)} />
              <Row label="Transcripts" value={String(frame.transcriptCount)} />
              <Row
                label="Demographics present"
                value={
                  frame.observedDemographicFields.length > 0
                    ? frame.observedDemographicFields.join(", ")
                    : "none stated in the material"
                }
              />
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
                  Missing information
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted-ink">
                  {frame.missingInformation.length > 0 ? (
                    frame.missingInformation.map((m, i) => <li key={i}>{m}</li>)
                  ) : (
                    <li>Nothing flagged.</li>
                  )}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
                  Limitations
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted-ink">
                  {frame.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ------------------------------------------- 4. Research synthesis */}
      <section id="synthesis" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">4 · Participant syntheses</h2>
            <p className="text-sm text-muted-ink">
              Each participant understood on their own terms, before any comparison.
            </p>
          </div>
          <form action={synthesiseAllAction}>
            <Button type="submit" disabled={!confirmed || transcripts.length === 0}>
              Synthesise all unanalysed
            </Button>
          </form>
        </div>
        {syntheses.length === 0 ? (
          <p className="text-sm text-muted-ink">No syntheses yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {syntheses.map((synthesis) => {
              const participant = participants.find((p) => p.id === synthesis.participantId);
              return (
                <Link
                  key={synthesis.id}
                  href={`/projects/${projectId}/studies/${studyId}/syntheses/${synthesis.id}`}
                >
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader>
                      <div className="flex gap-2">
                        <Badge tone="accent">{participant?.code ?? "P??"}</Badge>
                        <Badge>{synthesis.insights.length} insight(s)</Badge>
                        {synthesis.contradictions.length > 0 ? (
                          <Badge tone="caution">
                            {synthesis.contradictions.length} contradiction(s)
                          </Badge>
                        ) : null}
                      </div>
                      <CardDescription className="line-clamp-3">
                        {synthesis.overallSummary}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* --------------------------------------------- 5. Research theming */}
      <section id="theming" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">5 · Cross-participant themes</h2>
            <p className="text-sm text-muted-ink">
              Patterns that genuinely span participants — with counter-evidence and outliers kept.
            </p>
          </div>
          <form action={themingAction}>
            <Button type="submit" disabled={!confirmed || syntheses.length < 2}>
              {themes.length > 0 ? "Re-run theming" : "Run theming"}
            </Button>
          </form>
        </div>
        {syntheses.length < 2 ? (
          <p className="text-sm text-muted-ink">
            Theming compares participants, so it needs at least two completed syntheses.
          </p>
        ) : null}
        {themes.length > 0 ? (
          <div className="flex flex-col gap-3">
            {themes.map((theme) => (
              <Link
                key={theme.id}
                href={`/projects/${projectId}/studies/${studyId}/themes/${theme.id}`}
              >
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="flex flex-wrap gap-2">
                      <PatternStrengthBadge strength={theme.patternStrength} />
                      <FrequencyLabel
                        count={theme.participantCount}
                        total={theme.totalParticipantsConsidered}
                      />
                      {theme.counterEvidence.length > 0 ? (
                        <Badge tone="caution">counter-evidence</Badge>
                      ) : null}
                      {theme.outlierParticipantIds.length > 0 ? (
                        <Badge tone="caution">
                          {theme.outlierParticipantIds.length} outlier(s)
                        </Badge>
                      ) : null}
                    </div>
                    <CardTitle>{theme.name}</CardTitle>
                    <CardDescription>{theme.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : null}

        {rejected.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Patterns deliberately not promoted</CardTitle>
              <CardDescription>
                Shared vocabulary is not shared experience. These were considered and rejected.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {rejected.map((pattern) => (
                  <li key={pattern.id}>
                    <span className="font-medium">{pattern.label}</span>
                    <span className="text-muted-ink"> — {pattern.reason}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* ------------------------------------------------ 6. UX evaluation */}
      <section id="evaluation" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">6 · UX evaluation</h2>
        {!uxApplies ? (
          <Callout tone="info" title="UX evaluation does not apply to this study">
            {frame.researchTypeLabel} at the {frame.researchStageLabel} stage produces reported needs,
            motivations and mental models — not observed usability behaviour. Running a UX evaluation
            here would manufacture usability issues out of opinions. Change the classification if this
            material is in fact evaluative.
          </Callout>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Run an evaluation round</CardTitle>
              <CardDescription>
                Each round is recorded separately with its product version and the tasks it actually
                exercised, so later rounds can be compared honestly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={evaluateAction} className="flex flex-wrap items-end gap-3">
                <FormField label="Round label" className="min-w-60 flex-1">
                  <Input
                    name="label"
                    defaultValue={`Round ${evaluations.length + 1}`}
                    placeholder="Round 1 — prototype v3"
                  />
                </FormField>
                <Button type="submit" disabled={!confirmed || syntheses.length === 0}>
                  Run UX evaluation
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {evaluations.length > 0 ? (
          <div className="flex flex-col gap-2">
            {evaluations.map((evaluation) => (
              <Link key={evaluation.id} href={`/projects/${projectId}/evaluations/${evaluation.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-3 pt-5">
                    <div>
                      <p className="text-sm font-medium">
                        Round {evaluation.round} · {evaluation.label}
                      </p>
                      <p className="text-xs text-muted-ink">
                        {evaluation.productVersion ?? "no version recorded"} ·{" "}
                        {evaluation.tasksEvaluated.length} task(s) evaluated
                      </p>
                    </div>
                    <Badge tone="accent">open</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-ink">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
