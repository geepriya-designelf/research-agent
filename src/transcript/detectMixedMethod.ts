/**
 * Mixed-method detection.
 *
 * The system may FLAG that material looks like it contains both interview
 * discussion and usability-test tasks. It must never reclassify the study —
 * the researcher decides. This is a cheap lexical/structural signal computed
 * without an LLM call so it can run at upload time.
 */

import type { TranscriptSegment } from "@/domain/model";
import type { ResearchType } from "@/domain/taxonomy";

const TASK_MARKERS = [
  /\btask\s*\d/i,
  /\byour task\b/i,
  /\bi'?d like you to (?:try|find|complete|go ahead)/i,
  /\bcan you (?:try to |please )?(?:find|complete|add|check ?out|purchase|locate)\b/i,
  /\bthink aloud\b/i,
  /\btalk me through what you'?re (?:doing|thinking|seeing)\b/i,
  /\bwhat would you do next\b/i,
  /\bgo ahead and\b/i,
  /\bstart(?:ing)? (?:the )?(?:task|scenario)\b/i,
  /\bscenario\s*\d/i,
];

const OBSERVATION_MARKERS = [
  /\[(?:clicks?|taps?|scrolls?|hovers?|pauses?|hesitat\w+|sighs?|frowns?|laughs?)\b[^\]]*\]/i,
  /\((?:clicks?|taps?|scrolls?|pauses? for|long pause|silence)[^)]*\)/i,
  /\bpause[sd]? for \d+\s*(?:seconds?|secs?|minutes?)\b/i,
  /\bclick(?:s|ed)? the wrong\b/i,
  /\bnavigates? (?:to|back)\b/i,
  /\bunable to (?:find|locate|complete)\b/i,
];

const INTERVIEW_MARKERS = [
  /\btell me (?:more )?about\b/i,
  /\bwalk me through (?:how|your|a typical)\b/i,
  /\bhow (?:do |did )?you (?:usually|normally|currently|typically)\b/i,
  /\bwhy (?:do|did|is|was) (?:you|that)\b/i,
  /\bwhat makes you\b/i,
  /\bhow (?:did|does) that (?:feel|work|go)\b/i,
  /\bwould you say\b/i,
  /\bwhat (?:does|do) .{0,30}\bmean to you\b/i,
  /\bin the past\b/i,
  /\bcan you describe\b/i,
  /\bhow often do you\b/i,
];

export interface MixedMethodSignal {
  taskHits: number;
  observationHits: number;
  interviewHits: number;
  /** True when both modes are meaningfully present. */
  looksMixed: boolean;
  /** What the material most resembles, purely as a suggestion. */
  suggestedType: ResearchType | null;
  /** Researcher-facing message. Advisory only. */
  message: string | null;
  examples: { kind: "task" | "observation" | "interview"; line: number; text: string }[];
}

export function detectMixedMethod(
  segments: TranscriptSegment[],
  declaredType: ResearchType,
): MixedMethodSignal {
  const examples: MixedMethodSignal["examples"] = [];
  let taskHits = 0;
  let observationHits = 0;
  let interviewHits = 0;

  for (const segment of segments) {
    for (const pattern of TASK_MARKERS) {
      if (pattern.test(segment.text)) {
        taskHits += 1;
        pushExample(examples, "task", segment);
        break;
      }
    }
    for (const pattern of OBSERVATION_MARKERS) {
      if (pattern.test(segment.text)) {
        observationHits += 1;
        pushExample(examples, "observation", segment);
        break;
      }
    }
    for (const pattern of INTERVIEW_MARKERS) {
      if (pattern.test(segment.text)) {
        interviewHits += 1;
        pushExample(examples, "interview", segment);
        break;
      }
    }
  }

  const usabilityEvidence = taskHits + observationHits;
  const looksMixed = usabilityEvidence >= 2 && interviewHits >= 2;

  let suggestedType: ResearchType | null = null;
  if (usabilityEvidence >= 2 && interviewHits < 2) suggestedType = "usability_test";
  else if (interviewHits >= 2 && usabilityEvidence < 2) suggestedType = "user_interview";

  let message: string | null = null;
  if (looksMixed) {
    message =
      "This material appears to contain both interview discussion and usability-test tasks. " +
      "Analysis will follow the classification you confirm. Consider splitting the material, " +
      "or confirm the classification you want applied.";
  } else if (suggestedType && suggestedType !== declaredType && declaredType !== "other") {
    message =
      suggestedType === "usability_test"
        ? "This material contains task instructions and behavioural observations, which is more typical of a usability test than the type selected. Your classification will be used as-is."
        : "This material reads as open discussion rather than task-based evaluation. Your classification will be used as-is.";
  }

  return {
    taskHits,
    observationHits,
    interviewHits,
    looksMixed,
    suggestedType,
    message,
    examples: examples.slice(0, 8),
  };
}

function pushExample(
  examples: MixedMethodSignal["examples"],
  kind: "task" | "observation" | "interview",
  segment: TranscriptSegment,
): void {
  if (examples.filter((e) => e.kind === kind).length >= 3) return;
  examples.push({
    kind,
    line: segment.startLine,
    text: segment.text.slice(0, 180),
  });
}
