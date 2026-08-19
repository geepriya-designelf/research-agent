import { Badge } from "@/components/ui/badge";
import { frequencyPhrase } from "@/domain/frequency";
import { SEVERITY_LABELS, type Confidence, type EpistemicStatus, type PatternStrength, type Severity } from "@/domain/model";

const EPISTEMIC_LABEL: Record<EpistemicStatus, string> = {
  participant_stated: "participant said",
  observed: "observed behaviour",
  researcher_observation: "researcher note",
  inferred: "inferred",
  interpretation: "interpretation",
};

const EPISTEMIC_TONE: Record<EpistemicStatus, "evidence" | "accent" | "caution" | "neutral"> = {
  participant_stated: "evidence",
  observed: "evidence",
  researcher_observation: "neutral",
  inferred: "caution",
  interpretation: "accent",
};

/**
 * The badge that keeps evidence and interpretation apart at a glance. It is
 * deliberately present on every claim in the UI, not just the uncertain ones.
 */
export function EpistemicBadge({ status }: { status: EpistemicStatus }) {
  return <Badge tone={EPISTEMIC_TONE[status]}>{EPISTEMIC_LABEL[status]}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <Badge tone={confidence === "high" ? "neutral" : confidence === "moderate" ? "neutral" : "caution"}>
      {confidence} confidence
    </Badge>
  );
}

export function PatternStrengthBadge({ strength }: { strength: PatternStrength }) {
  const tone = strength === "strong" ? "accent" : strength === "weak" ? "caution" : "neutral";
  return <Badge tone={tone}>{strength} pattern</Badge>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const tone = severity >= 3 ? "alarm" : severity === 2 ? "caution" : "neutral";
  return (
    <Badge tone={tone}>
      Severity {severity} · {SEVERITY_LABELS[severity]}
    </Badge>
  );
}

/**
 * The only place counts are turned into words. Never "most", never a percentage.
 */
export function FrequencyLabel({ count, total }: { count: number; total: number }) {
  return <Badge tone="neutral">{frequencyPhrase(count, total)}</Badge>;
}
