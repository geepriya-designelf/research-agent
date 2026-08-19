import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EvidenceRef } from "@/domain/model";

/**
 * Evidence is rendered the same way everywhere: verbatim, visually distinct
 * from analysis, with its source anchor. Unverified quotes are shown, loudly —
 * hiding a fabricated quote would hide the defect it represents.
 */
export function EvidenceBlock({
  evidence,
  transcriptHref,
  className,
}: {
  evidence: EvidenceRef;
  transcriptHref?: string;
  className?: string;
}) {
  const verified = evidence.verification.status === "verified";
  const anchor =
    evidence.startLine !== null
      ? `lines ${evidence.startLine}–${evidence.endLine}`
      : "location unknown";

  return (
    <figure
      className={cn(
        "rounded-md border-l-2 py-2 pl-3 pr-2",
        verified ? "border-l-evidence bg-evidence-soft/40" : "border-l-alarm bg-alarm-soft/50",
        className,
      )}
    >
      <blockquote className="quote text-sm leading-relaxed text-ink">
        “{evidence.quote}”
      </blockquote>
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-ink">
        {verified ? (
          <Badge tone="evidence">verified in source</Badge>
        ) : (
          <Badge tone="alarm">not found in source</Badge>
        )}
        <span>{anchor}</span>
        {evidence.timestamp ? <span>@ {evidence.timestamp}</span> : null}
        {transcriptHref ? (
          <a className="underline underline-offset-2 hover:text-accent" href={transcriptHref}>
            open transcript
          </a>
        ) : null}
      </figcaption>
      {evidence.verification.status === "unverified" ? (
        <p className="mt-1.5 text-xs text-alarm">{evidence.verification.reason}</p>
      ) : null}
    </figure>
  );
}

export function EvidenceList({
  evidence,
  transcriptHref,
  emptyLabel = "No supporting evidence was recorded.",
}: {
  evidence: EvidenceRef[];
  transcriptHref?: (e: EvidenceRef) => string;
  emptyLabel?: string;
}) {
  if (evidence.length === 0) {
    return <p className="text-xs italic text-muted-ink">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {evidence.map((item) => (
        <EvidenceBlock key={item.id} evidence={item} transcriptHref={transcriptHref?.(item)} />
      ))}
    </div>
  );
}
