/**
 * Evidence verification.
 *
 * The single hardest failure mode in an LLM research tool is a fluent,
 * plausible quote that nobody said. Every quote the model returns is checked
 * against the actual transcript text before it is allowed to become evidence.
 *
 * Verification is deliberately conservative:
 *  - exact substring match on normalized text wins;
 *  - a whitespace/punctuation-tolerant match wins;
 *  - anything else is marked `unverified` and quarantined, never dropped.
 *
 * We quarantine rather than drop because a fabricated quote is a signal the
 * researcher should see, not something to hide.
 */

import { newId } from "./ids";
import type { EvidenceRef, TranscriptSegment } from "./model";

/** Collapse whitespace and normalize the punctuation LLMs love to "improve". */
export function canonicalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’ʼ‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Strip everything but letters, digits and single spaces. Last-resort match. */
function alphanumeric(text: string): string {
  return canonicalize(text)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface QuoteMatch {
  segmentIds: string[];
  startLine: number | null;
  endLine: number | null;
  timestamp: string | null;
}

/**
 * Locate a quote within a transcript's segments. Handles quotes that span
 * consecutive segments (the model often merges a participant's two turns).
 */
export function locateQuote(
  quote: string,
  segments: TranscriptSegment[],
): QuoteMatch | null {
  const needle = canonicalize(quote);
  if (needle.length === 0) return null;

  // 1. Single-segment exact (canonicalized) containment.
  for (const segment of segments) {
    if (canonicalize(segment.text).includes(needle)) {
      return {
        segmentIds: [segment.id],
        startLine: segment.startLine,
        endLine: segment.endLine,
        timestamp: segment.timestamp,
      };
    }
  }

  // 2. Spans across consecutive segments.
  const ordered = [...segments].sort((a, b) => a.index - b.index);
  for (let start = 0; start < ordered.length; start += 1) {
    let joined = "";
    for (let end = start; end < ordered.length; end += 1) {
      joined = joined ? `${joined} ${ordered[end].text}` : ordered[end].text;
      const canonicalJoined = canonicalize(joined);
      if (canonicalJoined.length > needle.length * 4 && end > start) break;
      if (canonicalJoined.includes(needle)) {
        const span = ordered.slice(start, end + 1);
        return {
          segmentIds: span.map((s) => s.id),
          startLine: span[0].startLine,
          endLine: span[span.length - 1].endLine,
          timestamp: span[0].timestamp,
        };
      }
    }
  }

  // 3. Alphanumeric-only fallback: tolerates the model dropping a comma or
  //    an em dash. Still requires every word, in order, from one segment.
  const loose = alphanumeric(quote);
  if (loose.length >= 12) {
    for (const segment of segments) {
      if (alphanumeric(segment.text).includes(loose)) {
        return {
          segmentIds: [segment.id],
          startLine: segment.startLine,
          endLine: segment.endLine,
          timestamp: segment.timestamp,
        };
      }
    }
  }

  return null;
}

export interface RawQuote {
  quote: string;
  /** Optional hint from the model. Never trusted without a text match. */
  approximateLine?: number | null;
}

/**
 * Turn a model-supplied quote into an EvidenceRef, verified against source.
 * Never throws: unverifiable quotes come back with status "unverified".
 */
export function buildEvidence(
  raw: RawQuote,
  transcriptId: string,
  segments: TranscriptSegment[],
): EvidenceRef {
  const match = locateQuote(raw.quote, segments);
  if (!match) {
    return {
      id: newId("evd"),
      transcriptId,
      segmentIds: [],
      quote: raw.quote,
      startLine: null,
      endLine: null,
      timestamp: null,
      verification: {
        status: "unverified",
        reason:
          "Quote could not be located verbatim in the source transcript. Treat as unsupported.",
      },
    };
  }

  return {
    id: newId("evd"),
    transcriptId,
    segmentIds: match.segmentIds,
    quote: raw.quote,
    startLine: match.startLine,
    endLine: match.endLine,
    timestamp: match.timestamp,
    verification: { status: "verified", matchedSegmentIds: match.segmentIds },
  };
}

export function isVerified(evidence: EvidenceRef): boolean {
  return evidence.verification.status === "verified";
}

export function verifiedOnly(evidence: EvidenceRef[]): EvidenceRef[] {
  return evidence.filter(isVerified);
}

export function unverifiedOnly(evidence: EvidenceRef[]): EvidenceRef[] {
  return evidence.filter((e) => !isVerified(e));
}

/**
 * A claim is groundable when at least one piece of its evidence verified.
 * Used to gate insights/themes/issues: interpretation is welcome, ungrounded
 * assertion is not.
 */
export function hasGrounding(evidence: EvidenceRef[]): boolean {
  return evidence.some(isVerified);
}

/**
 * Demographic claims are held to a stricter bar than anything else: a stated
 * demographic must be backed by a quote that verified against the source.
 * Inventing "35, marketing manager, Chicago" from a first name and a turn of
 * phrase is the failure mode this guard exists to prevent.
 */
export function partitionGrounded<T extends { evidence: EvidenceRef[] }>(
  facts: T[],
): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const fact of facts) {
    (hasGrounding(fact.evidence) ? kept : dropped).push(fact);
  }
  return { kept, dropped };
}
