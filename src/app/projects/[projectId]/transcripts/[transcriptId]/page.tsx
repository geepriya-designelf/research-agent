import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * The source of record. Every evidence anchor in the system points at the line
 * numbers shown here, so this page is the end of every traceability chain.
 */
export default async function TranscriptPage({
  params,
}: {
  params: Promise<{ projectId: string; transcriptId: string }>;
}) {
  const { projectId, transcriptId } = await params;
  const store = getStore();
  const transcript = await store.getTranscript(transcriptId);
  if (!transcript) notFound();

  const segments = await store.listSegments(transcriptId);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href={`/projects/${projectId}/studies/${transcript.studyId}`}
          className="text-xs text-muted-ink underline underline-offset-2"
        >
          ← back to study
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{transcript.name}</h1>
        <p className="text-sm text-muted-ink">
          {transcript.sourceKind === "upload" ? "Uploaded" : "Pasted"}
          {transcript.originalFilename ? ` · ${transcript.originalFilename}` : ""} · {segments.length}{" "}
          segment(s)
          {transcript.storagePath ? " · original file retained" : ""}
        </p>
      </header>

      {transcript.extractionWarnings.length > 0 ? (
        <Callout tone="caution" title="Extraction warnings">
          <ul className="list-disc space-y-1 pl-4">
            {transcript.extractionWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Normalized source</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {segments.map((segment) => (
            <div
              key={segment.id}
              id={`L${segment.startLine}`}
              className="flex gap-3 rounded px-2 py-1.5 text-sm hover:bg-accent-soft/50"
            >
              <span className="shrink-0 select-none pt-0.5 font-mono text-xs tabular-nums text-muted-ink">
                {segment.startLine}
                {segment.endLine !== segment.startLine ? `–${segment.endLine}` : ""}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {segment.speaker ? (
                    <Badge tone={segment.speakerRole === "participant" ? "accent" : "neutral"}>
                      {segment.speaker}
                      {segment.speakerRole !== "unknown" ? ` · ${segment.speakerRole}` : ""}
                    </Badge>
                  ) : null}
                  {segment.timestamp ? (
                    <span className="font-mono text-xs text-muted-ink">{segment.timestamp}</span>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{segment.text}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
