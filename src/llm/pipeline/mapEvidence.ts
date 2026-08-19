/**
 * Bridges model output to verified domain evidence.
 *
 * Everything the model calls a quote passes through here. Nothing reaches the
 * store unverified-and-unlabelled: quotes that cannot be located are kept with
 * status "unverified" so the researcher sees the fabrication rather than a
 * silently shorter list.
 */

import { buildEvidence } from "@/domain/evidence";
import type { EvidenceRef, TranscriptSegment } from "@/domain/model";
import type { ZEvidenceList } from "@/schemas/common";

export interface SegmentIndex {
  /** transcriptId -> segments */
  byTranscript: Map<string, TranscriptSegment[]>;
  /** Used when the model gives a name instead of an id. */
  nameToId: Map<string, string>;
  defaultTranscriptId: string | null;
}

export function buildSegmentIndex(
  entries: { transcriptId: string; name: string; segments: TranscriptSegment[] }[],
): SegmentIndex {
  const byTranscript = new Map<string, TranscriptSegment[]>();
  const nameToId = new Map<string, string>();
  for (const entry of entries) {
    byTranscript.set(entry.transcriptId, entry.segments);
    nameToId.set(entry.name.trim().toLowerCase(), entry.transcriptId);
    nameToId.set(entry.transcriptId, entry.transcriptId);
  }
  return {
    byTranscript,
    nameToId,
    defaultTranscriptId: entries.length === 1 ? entries[0].transcriptId : null,
  };
}

export function mapEvidence(raw: ZEvidenceList, index: SegmentIndex): EvidenceRef[] {
  return raw.map((item) => {
    const transcriptId = resolveTranscriptId(item.transcriptRef, index);

    if (!transcriptId) {
      // Unknown source: search every transcript before giving up, because the
      // model naming the wrong file is a lesser error than us discarding a
      // real quote.
      for (const [candidateId, segments] of index.byTranscript) {
        const evidence = buildEvidence(
          { quote: item.quote, approximateLine: item.approximateStartLine },
          candidateId,
          segments,
        );
        if (evidence.verification.status === "verified") return evidence;
      }
      return {
        id: `evd_unresolved_${hash(item.quote)}`,
        transcriptId: index.defaultTranscriptId ?? "",
        segmentIds: [],
        quote: item.quote,
        startLine: null,
        endLine: null,
        timestamp: null,
        verification: {
          status: "unverified" as const,
          reason: `Quote references an unknown source ("${item.transcriptRef ?? "unspecified"}") and does not appear in any transcript in scope.`,
        },
      } satisfies EvidenceRef;
    }

    const segments = index.byTranscript.get(transcriptId) ?? [];
    return buildEvidence(
      { quote: item.quote, approximateLine: item.approximateStartLine },
      transcriptId,
      segments,
    );
  });
}

function resolveTranscriptId(ref: string | null, index: SegmentIndex): string | null {
  if (!ref) return index.defaultTranscriptId;
  const direct = index.nameToId.get(ref.trim().toLowerCase());
  return direct ?? index.defaultTranscriptId;
}

function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
