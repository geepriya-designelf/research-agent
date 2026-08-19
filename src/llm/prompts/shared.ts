/**
 * Shared prompt building blocks.
 *
 * IMPORTANT: everything exported as a *system* fragment must be byte-stable
 * per stage, because it forms the cached prefix. Study-specific content (the
 * research frame, the transcript) belongs in the user message.
 */

import type { ResearchFrame } from "@/domain/model";
import { renderSegmentsForPrompt } from "@/transcript/segment";
import type { TranscriptSegment } from "@/domain/model";

/**
 * The non-negotiables. Every stage carries these verbatim.
 */
export const EVIDENCE_DISCIPLINE = `## Evidence discipline (non-negotiable)

1. NEVER invent a quote. Every quote you return is checked character-by-character against the source transcript. A quote that cannot be located is flagged as fabricated and shown to the researcher as a defect in your output. Copy exactly, including disfluencies and grammar; do not tidy anything up.
2. NEVER invent demographics. Age, gender, income, occupation, location, education, family status, seniority and tenure may only be recorded if the source explicitly states them. Do not infer them from a name, from speech patterns, from what someone talks about, or from what is statistically likely. Absent means absent.
3. NEVER invent participant experiences, product behaviours, or events that the material does not record.
4. Distinguish three different things, always, and never let one masquerade as another:
   - what the participant SAID (their report, in their framing)
   - what the participant DID or what was OBSERVED (behaviour recorded in the material)
   - what YOU conclude (inference and interpretation, which are your claims)
   Every claim you make carries an epistemic status that says which of these it is.
5. If the material does not support a conclusion, say so. Naming what you cannot conclude is part of the job, not a failure to do it.
6. Preserve contradictions and outliers. Do not resolve a contradiction on your own authority and do not smooth an inconvenient participant out of the picture.
7. Do not manufacture consensus. Report counts as "N of M participants". Never write "most users", "users generally", "everyone", or any statistical language. Qualitative frequency is not statistical significance.
8. Where the source has line anchors ([L12-18]) or timestamps, use them.`;

export const NUANCE_GUIDANCE = `## Reading human language

You are reading people, not extracting keywords. Attend to:

- Hedging and reluctant acceptance. "I guess it's fine, but honestly I usually just don't bother with it" is not satisfaction. It is more likely avoidance, low perceived value, or resignation — read the surrounding context to decide which, and say which reading you are taking and why.
- Sarcasm, understatement, and politeness. Participants soften criticism, especially toward a moderator they perceive as invested in the product. "It's not the most obvious thing in the world" may be a strong complaint.
- Changes of mind mid-session. When someone revises a position, that revision is data. Record both positions and when the shift happened.
- The difference between a stated preference and an observed behaviour. People routinely predict they would use something they then do not use.
- Vocabulary that is shared without meaning being shared. Two participants saying "confusing" may be describing two unrelated problems.
- Silence and what is conspicuously not said, when the material makes that visible.
- Emotional register: frustration, resignation, anxiety, delight. Name it when the evidence supports it; do not decorate neutral statements with feelings.

Do not flatten any of this into neutral summary. A summary that loses the hedge has lost the finding.`;

export const RELEVANCE_GUIDANCE = `## Relevance

You are given a research problem, a research goal, and research questions. Weight your attention toward material that bears on them — do not summarise everything at equal depth.

But do not discard the unexpected. Findings that nobody was looking for are frequently the most valuable output of qualitative research. When something important sits outside the research questions, keep it and mark it as unexpected rather than dropping it for being off-topic.`;

/** Renders the research frame as the stable context block for any stage. */
export function renderFrame(frame: ResearchFrame): string {
  const lines: string[] = [];
  lines.push("## Research frame");
  lines.push("");
  lines.push(`Project: ${frame.projectName}`);
  lines.push(`Problem being solved: ${frame.problemStatement}`);
  lines.push(`Research goal: ${frame.researchGoal}`);
  lines.push("");
  lines.push("Research questions:");
  if (frame.researchQuestions.length === 0) {
    lines.push("  (none recorded)");
  } else {
    for (const q of frame.researchQuestions) lines.push(`  ${q.id}: ${q.text}`);
  }
  lines.push("");
  if (frame.hypotheses.length > 0) {
    lines.push("Hypotheses under test (these may be wrong; look for evidence against them):");
    for (const h of frame.hypotheses) lines.push(`  - ${h}`);
    lines.push("");
  }
  lines.push(`Research type: ${frame.researchTypeLabel}`);
  lines.push(`Research stage: ${frame.researchStageLabel}`);
  lines.push(`Participants in this study: ${frame.participantCount}`);
  lines.push(`Transcripts in this study: ${frame.transcriptCount}`);
  if (frame.targetPopulation) lines.push(`Target population: ${frame.targetPopulation}`);
  if (frame.participantCriteria) lines.push(`Participant criteria: ${frame.participantCriteria}`);
  if (frame.productOrExperience) lines.push(`Product / experience: ${frame.productOrExperience}`);
  if (frame.productVersion) lines.push(`Product / prototype version: ${frame.productVersion}`);
  if (frame.plannedTasks.length > 0) {
    lines.push("Planned tasks:");
    for (const t of frame.plannedTasks) lines.push(`  - ${t}`);
  }
  if (frame.missingInformation.length > 0) {
    lines.push("");
    lines.push("Known gaps in this dataset:");
    for (const m of frame.missingInformation) lines.push(`  - ${m}`);
  }
  if (frame.limitations.length > 0) {
    lines.push("");
    lines.push("Limitations to respect in your conclusions:");
    for (const l of frame.limitations) lines.push(`  - ${l}`);
  }
  return lines.join("\n");
}

export function renderTranscript(
  transcriptName: string,
  transcriptId: string,
  segments: TranscriptSegment[],
): string {
  return [
    `## Transcript: ${transcriptName} (id: ${transcriptId})`,
    "",
    "Each line is anchored as [L<start>-<end> @timestamp] Speaker [role]: text.",
    "Use these anchors when citing. Quote only text that appears below.",
    "",
    renderSegmentsForPrompt(segments),
  ].join("\n");
}
