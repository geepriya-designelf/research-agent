/**
 * Segmentation.
 *
 * Produces addressable TranscriptSegments carrying speaker, role, timestamp
 * and exact line/char spans. These are the anchors every quote resolves to.
 *
 * Nothing here guesses: if a transcript has no speaker labels we produce
 * paragraph segments with speaker `null` and role "unknown" rather than
 * inventing an attribution.
 */

import { newId } from "@/domain/ids";
import type { SpeakerRole, TranscriptSegment } from "@/domain/model";

/** "Moderator: ..." / "[00:12:03] P1: ..." / "P1 (00:12): ..." */
const SPEAKER_LINE =
  /^\s*(?:\[?(?<ts1>\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\]?\s*)?(?<speaker>[A-Za-z][\w .'-]{0,40}?)\s*(?:\((?<ts2>\d{1,2}:\d{2}(?::\d{2})?)\))?\s*:\s(?<rest>.*)$/;

/** A standalone timestamp line, e.g. "00:12:03" or "[00:12:03]". */
const TIMESTAMP_ONLY = /^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\]?\s*$/;

const INTERVIEWER_HINTS = [
  "moderator",
  "interviewer",
  "researcher",
  "facilitator",
  "r:",
  "int",
  "host",
];
const PARTICIPANT_HINTS = ["participant", "user", "respondent", "customer", "subject"];
const OBSERVER_HINTS = ["observer", "note", "notes", "researcher note", "obs"];

export function classifySpeaker(speaker: string | null): SpeakerRole {
  if (!speaker) return "unknown";
  const s = speaker.trim().toLowerCase();

  if (OBSERVER_HINTS.some((h) => s === h || s.startsWith(`${h} `))) return "observer";
  if (INTERVIEWER_HINTS.some((h) => s === h || s.startsWith(h))) return "interviewer";
  if (PARTICIPANT_HINTS.some((h) => s.startsWith(h))) return "participant";

  // P1 / P01 / P-1 are near-universal participant codes.
  if (/^p[-_ ]?\d{1,3}$/.test(s)) return "participant";
  // A single "R" is conventionally the researcher.
  if (s === "r") return "interviewer";

  return "unknown";
}

export interface SegmentationResult {
  segments: TranscriptSegment[];
  /** Distinct speaker labels found, in first-appearance order. */
  speakers: string[];
  hasSpeakerLabels: boolean;
  hasTimestamps: boolean;
}

export function segmentTranscript(
  transcriptId: string,
  normalizedText: string,
): SegmentationResult {
  const lines = normalizedText.split("\n");

  // Char offset of the start of each line, for exact-span highlighting.
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  interface Draft {
    speaker: string | null;
    timestamp: string | null;
    startLine: number;
    endLine: number;
    textLines: string[];
  }

  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let pendingTimestamp: string | null = null;

  const flush = () => {
    if (current && current.textLines.join("\n").trim().length > 0) drafts.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;

    const tsOnly = line.match(TIMESTAMP_ONLY);
    if (tsOnly) {
      pendingTimestamp = tsOnly[1];
      continue;
    }

    if (line.trim() === "") {
      // Blank line ends an unlabelled paragraph but not a speaker turn — a
      // speaker's turn often contains blank lines in exported transcripts.
      if (current && current.speaker === null) flush();
      continue;
    }

    const match = line.match(SPEAKER_LINE);
    if (match?.groups && looksLikeSpeakerLabel(match.groups.speaker)) {
      flush();
      current = {
        speaker: match.groups.speaker.trim(),
        timestamp: match.groups.ts1 ?? match.groups.ts2 ?? pendingTimestamp,
        startLine: lineNumber,
        endLine: lineNumber,
        textLines: [match.groups.rest],
      };
      pendingTimestamp = null;
      continue;
    }

    if (!current) {
      current = {
        speaker: null,
        timestamp: pendingTimestamp,
        startLine: lineNumber,
        endLine: lineNumber,
        textLines: [line],
      };
      pendingTimestamp = null;
    } else {
      current.textLines.push(line);
      current.endLine = lineNumber;
    }
  }
  flush();

  const speakers: string[] = [];
  const segments: TranscriptSegment[] = drafts.map((draft, index) => {
    if (draft.speaker && !speakers.includes(draft.speaker)) speakers.push(draft.speaker);
    const startChar = lineOffsets[draft.startLine - 1] ?? 0;
    const endLineIndex = draft.endLine - 1;
    const endChar = (lineOffsets[endLineIndex] ?? 0) + (lines[endLineIndex]?.length ?? 0);

    return {
      id: newId("seg"),
      transcriptId,
      index,
      startLine: draft.startLine,
      endLine: draft.endLine,
      startChar,
      endChar,
      speaker: draft.speaker,
      speakerRole: classifySpeaker(draft.speaker),
      timestamp: draft.timestamp,
      text: draft.textLines.join("\n").trim(),
    };
  });

  return {
    segments,
    speakers,
    hasSpeakerLabels: speakers.length > 0,
    hasTimestamps: segments.some((s) => s.timestamp !== null),
  };
}

/**
 * Guards against treating prose containing a colon ("One thing I noticed: the
 * button...") as a speaker turn. Speaker labels are short and word-shaped.
 */
function looksLikeSpeakerLabel(candidate: string | undefined): boolean {
  if (!candidate) return false;
  const trimmed = candidate.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 4) return false;
  // A label that is a full sentence fragment ending in a lowercase verb is
  // more likely prose; require it to look like a name/role/code.
  return /^[A-Za-z][\w .'-]*$/.test(trimmed);
}

/** Render segments for the LLM with stable, citable line anchors. */
export function renderSegmentsForPrompt(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const ts = s.timestamp ? ` @${s.timestamp}` : "";
      const speaker = s.speaker ? `${s.speaker} [${s.speakerRole}]` : "(unlabelled)";
      return `[L${s.startLine}-${s.endLine}${ts}] ${speaker}: ${s.text}`;
    })
    .join("\n");
}
