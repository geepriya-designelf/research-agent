/**
 * UX severity.
 *
 * Nielsen-style 0-4 scale. The key rule from the brief: severity is NOT a
 * function of frequency. A blocker that hit one participant is still a
 * blocker. Frequency is reported separately and never folded into the rating.
 */

import type { Severity } from "./model";
import { SEVERITY_LABELS } from "./model";

export interface SeverityFactors {
  /** Did this stop the participant completing the task? */
  blocksTaskCompletion: boolean;
  /** Did anyone abandon the flow because of it? */
  causedAbandonment: boolean;
  /** Did it require moderator assistance to get past? */
  requiredAssistance: boolean;
  /** Did it produce a wrong action / data error? */
  causedError: boolean;
  /** Did participants have to invent a workaround? */
  requiredWorkaround: boolean;
  /** Sustained confusion vs. momentary hesitation. */
  causedPersistentConfusion: boolean;
  /** Momentary friction only, recovered unaided. */
  minorFrictionOnly: boolean;
  /** Whether it touches a goal central to the research problem. */
  affectsPrimaryUserGoal: boolean;
}

export interface SeverityAssessment {
  severity: Severity;
  label: string;
  rationale: string;
  /** The factors that actually drove the rating, for display. */
  drivers: string[];
}

/**
 * Derives a severity floor from observed impact. The LLM proposes a severity
 * with its own rationale; this function is the check that keeps the rating
 * anchored to what was actually observed rather than to how often it appeared.
 */
export function assessSeverity(factors: SeverityFactors): SeverityAssessment {
  const drivers: string[] = [];
  let severity: Severity = 0;

  if (factors.minorFrictionOnly) {
    severity = 1;
    drivers.push("Momentary friction, recovered without help");
  }

  if (factors.requiredWorkaround) {
    severity = maxSeverity(severity, 2);
    drivers.push("Participant had to work around the interface");
  }
  if (factors.causedPersistentConfusion) {
    severity = maxSeverity(severity, 2);
    drivers.push("Sustained confusion, not momentary hesitation");
  }
  if (factors.causedError) {
    severity = maxSeverity(severity, 3);
    drivers.push("Led to an incorrect action or data error");
  }
  if (factors.requiredAssistance) {
    severity = maxSeverity(severity, 3);
    drivers.push("Required moderator assistance to proceed");
  }
  if (factors.affectsPrimaryUserGoal && severity >= 2) {
    severity = maxSeverity(severity, 3);
    drivers.push("Affects a goal central to the research problem");
  }
  if (factors.blocksTaskCompletion) {
    severity = maxSeverity(severity, 4);
    drivers.push("Prevented task completion");
  }
  if (factors.causedAbandonment) {
    severity = maxSeverity(severity, 4);
    drivers.push("Participant abandoned the flow");
  }

  const rationale =
    drivers.length > 0
      ? `Rated ${severity} (${SEVERITY_LABELS[severity]}) on impact: ${drivers
          .map((d) => d.toLowerCase())
          .join("; ")}. Frequency was not used to set this rating.`
      : "No usability problem observed for this task.";

  return { severity, label: SEVERITY_LABELS[severity], rationale, drivers };
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return (a > b ? a : b) as Severity;
}

/**
 * Reconciles the model's proposed severity with the impact-derived floor.
 * The model may rate higher (it can weigh research importance we don't model),
 * but it may not rate an observed blocker as minor friction.
 */
export function reconcileSeverity(
  proposed: Severity,
  factors: SeverityFactors,
): { severity: Severity; adjusted: boolean; note: string | null } {
  const derived = assessSeverity(factors);
  if (proposed >= derived.severity) {
    return { severity: proposed, adjusted: false, note: null };
  }
  return {
    severity: derived.severity,
    adjusted: true,
    note: `Raised from ${proposed} to ${derived.severity}: ${derived.drivers.join("; ")}.`,
  };
}
