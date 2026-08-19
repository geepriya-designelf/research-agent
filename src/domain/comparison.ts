/**
 * Comparative evaluation across rounds.
 *
 * The rule that matters: absence of evidence is not evidence of resolution.
 * An issue that nobody hit in round 2 is "not observed" — and it is only
 * meaningful at all if round 2 actually retested the same task.
 */

import type { IssueChangeStatus, UXIssue } from "./model";

export interface ComparisonInput {
  previousIssue: UXIssue | null;
  currentIssue: UXIssue | null;
  /** Was the task the previous issue lived on exercised again this round? */
  taskWasRetested: boolean;
}

export interface ComparisonVerdict {
  status: IssueChangeStatus;
  rationale: string;
  /** True when the status must not be read as "fixed". */
  requiresCaveat: boolean;
}

export function classifyChange(input: ComparisonInput): ComparisonVerdict {
  const { previousIssue, currentIssue, taskWasRetested } = input;

  if (!previousIssue && currentIssue) {
    return {
      status: "new_issue",
      rationale: "This issue does not correspond to any issue from the previous round.",
      requiresCaveat: false,
    };
  }

  if (previousIssue && !currentIssue) {
    if (!taskWasRetested) {
      return {
        status: "not_observed",
        rationale:
          "The task this issue occurred on was not exercised in this round, so this round provides no evidence either way. This is NOT evidence the issue was resolved.",
        requiresCaveat: true,
      };
    }
    return {
      status: "not_observed",
      rationale:
        "The task was retested and no instance of this issue was observed. Absence of observation is weaker than positive evidence of a fix; treat as not observed, not resolved, until confirmed.",
      requiresCaveat: true,
    };
  }

  if (!previousIssue || !currentIssue) {
    return {
      status: "unchanged",
      rationale: "Insufficient information to compare.",
      requiresCaveat: true,
    };
  }

  const severityDelta = currentIssue.severity - previousIssue.severity;
  const prevRate = rate(previousIssue);
  const currRate = rate(currentIssue);
  const rateDelta = currRate - prevRate;

  if (severityDelta > 0 || rateDelta > 0.25) {
    return {
      status: "regressed",
      rationale: `Severity moved ${previousIssue.severity} -> ${currentIssue.severity} and ${describeRate(prevRate, currRate)}.`,
      requiresCaveat: false,
    };
  }

  if (severityDelta <= -2 || (severityDelta <= -1 && rateDelta <= -0.25)) {
    return {
      status: "improved",
      rationale: `Severity moved ${previousIssue.severity} -> ${currentIssue.severity} and ${describeRate(prevRate, currRate)}. The issue still occurs, so it is improved rather than resolved.`,
      requiresCaveat: false,
    };
  }

  if (severityDelta < 0 || rateDelta < -0.1) {
    return {
      status: "partially_improved",
      rationale: `Some reduction in impact (severity ${previousIssue.severity} -> ${currentIssue.severity}, ${describeRate(prevRate, currRate)}), but the underlying problem is still present.`,
      requiresCaveat: false,
    };
  }

  return {
    status: "unchanged",
    rationale: `Severity and incidence are materially the same (severity ${previousIssue.severity} -> ${currentIssue.severity}, ${describeRate(prevRate, currRate)}).`,
    requiresCaveat: false,
  };
}

function rate(issue: UXIssue): number {
  if (issue.totalParticipantsConsidered <= 0) return 0;
  return issue.affectedParticipantCount / issue.totalParticipantsConsidered;
}

function describeRate(prev: number, curr: number): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `incidence ${pct(prev)} -> ${pct(curr)} of participants`;
}

/**
 * Guard for UI copy. Any status in this set must be shown with the "not the
 * same as resolved" caveat.
 */
export function mustNotClaimResolved(status: IssueChangeStatus): boolean {
  return status === "not_observed";
}
