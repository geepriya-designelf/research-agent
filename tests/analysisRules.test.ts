import { describe, expect, it } from "vitest";
import {
  derivePatternStrength,
  detectOvergeneralization,
  frequencyPhrase,
  qualifiesAsTheme,
} from "@/domain/frequency";
import { assessSeverity, reconcileSeverity } from "@/domain/severity";
import { classifyChange, mustNotClaimResolved } from "@/domain/comparison";
import {
  expectsObservedBehaviour,
  resolveAnalysisLens,
  supportsUxEvaluation,
} from "@/domain/taxonomy";
import type { UXIssue } from "@/domain/model";

describe("frequency language", () => {
  it("reports counts, never proportions of a population", () => {
    expect(frequencyPhrase(3, 5)).toBe("3 of 5 participants");
    expect(frequencyPhrase(1, 1)).toBe("1 of 1 participant");
  });

  it("flags majority and statistical language", () => {
    expect(detectOvergeneralization("Most users struggled with this")).toContain("most users");
    expect(detectOvergeneralization("This is statistically significant")).toContain(
      "statistically significant",
    );
    expect(detectOvergeneralization("3 of 5 participants mentioned this")).toEqual([]);
  });
});

describe("theme thresholds", () => {
  it("refuses to call a single participant a theme", () => {
    expect(qualifiesAsTheme({ supportingParticipants: 1, verifiedEvidenceCount: 6 })).toBe(false);
  });

  it("refuses a pattern with no verifiable evidence", () => {
    expect(qualifiesAsTheme({ supportingParticipants: 4, verifiedEvidenceCount: 1 })).toBe(false);
  });

  it("accepts a genuinely supported pattern", () => {
    expect(qualifiesAsTheme({ supportingParticipants: 3, verifiedEvidenceCount: 5 })).toBe(true);
  });

  it("does not call a thin two-participant signal strong", () => {
    expect(
      derivePatternStrength({
        supportingParticipants: 2,
        totalParticipants: 8,
        verifiedEvidenceCount: 2,
        counterEvidenceCount: 0,
      }),
    ).toBe("weak");
  });

  it("rewards coverage plus evidence density, not repetition alone", () => {
    expect(
      derivePatternStrength({
        supportingParticipants: 5,
        totalParticipants: 6,
        verifiedEvidenceCount: 11,
        counterEvidenceCount: 0,
      }),
    ).toBe("strong");
  });

  it("does not treat a heavily contested pattern as strong", () => {
    expect(
      derivePatternStrength({
        supportingParticipants: 4,
        totalParticipants: 6,
        verifiedEvidenceCount: 8,
        counterEvidenceCount: 5,
      }),
    ).toBe("moderate");
  });
});

describe("severity", () => {
  it("rates a blocker as critical even when only one participant hit it", () => {
    const assessment = assessSeverity({
      blocksTaskCompletion: true,
      causedAbandonment: false,
      requiredAssistance: true,
      causedError: false,
      requiredWorkaround: false,
      causedPersistentConfusion: true,
      minorFrictionOnly: false,
      affectsPrimaryUserGoal: true,
    });
    expect(assessment.severity).toBe(4);
    expect(assessment.rationale).toMatch(/Frequency was not used/);
  });

  it("rates recovered momentary friction as minor", () => {
    expect(
      assessSeverity({
        blocksTaskCompletion: false,
        causedAbandonment: false,
        requiredAssistance: false,
        causedError: false,
        requiredWorkaround: false,
        causedPersistentConfusion: false,
        minorFrictionOnly: true,
        affectsPrimaryUserGoal: false,
      }).severity,
    ).toBe(1);
  });

  it("raises a proposed severity that understates observed impact", () => {
    const result = reconcileSeverity(1, {
      blocksTaskCompletion: false,
      causedAbandonment: false,
      requiredAssistance: true,
      causedError: false,
      requiredWorkaround: true,
      causedPersistentConfusion: true,
      minorFrictionOnly: false,
      affectsPrimaryUserGoal: true,
    });
    expect(result.adjusted).toBe(true);
    expect(result.severity).toBe(3);
    expect(result.note).toMatch(/Required moderator assistance/);
  });

  it("leaves a higher analyst rating alone", () => {
    const result = reconcileSeverity(4, {
      blocksTaskCompletion: false,
      causedAbandonment: false,
      requiredAssistance: false,
      causedError: false,
      requiredWorkaround: false,
      causedPersistentConfusion: true,
      minorFrictionOnly: false,
      affectsPrimaryUserGoal: true,
    });
    expect(result.adjusted).toBe(false);
    expect(result.severity).toBe(4);
  });
});

describe("round comparison", () => {
  const issue = (over: Partial<UXIssue>): UXIssue =>
    ({
      id: "iss_1",
      evaluationId: "uxe_1",
      projectId: "prj_1",
      studyId: "std_1",
      name: "Save status is invisible",
      description: "",
      affectedTask: "Add a payment card",
      affectedFlow: null,
      affectedParticipantIds: ["p1", "p2", "p3"],
      affectedParticipantCount: 3,
      totalParticipantsConsidered: 5,
      occurrenceCount: null,
      severity: 3,
      severityRationale: "",
      userExpectation: null,
      observedBehavior: null,
      actualExperience: null,
      likelyCauseHypotheses: [],
      confidence: "moderate",
      evidence: [],
      supportingQuoteIds: [],
      relatedThemeIds: [],
      relatedUserNeedIds: [],
      designImplication: null,
      createdAt: new Date().toISOString(),
      ...over,
    }) as UXIssue;

  it("never reports an absent issue as resolved", () => {
    const verdict = classifyChange({
      previousIssue: issue({}),
      currentIssue: null,
      taskWasRetested: true,
    });
    expect(verdict.status).toBe("not_observed");
    expect(verdict.rationale).toMatch(/not resolved/i);
    expect(mustNotClaimResolved(verdict.status)).toBe(true);
  });

  it("says plainly when the task was never retested", () => {
    const verdict = classifyChange({
      previousIssue: issue({}),
      currentIssue: null,
      taskWasRetested: false,
    });
    expect(verdict.status).toBe("not_observed");
    expect(verdict.rationale).toMatch(/no evidence either way/i);
    expect(verdict.requiresCaveat).toBe(true);
  });

  it("detects a regression in severity", () => {
    const verdict = classifyChange({
      previousIssue: issue({ severity: 2 }),
      currentIssue: issue({ id: "iss_2", severity: 4 }),
      taskWasRetested: true,
    });
    expect(verdict.status).toBe("regressed");
  });

  it("detects improvement without claiming the issue is gone", () => {
    const verdict = classifyChange({
      previousIssue: issue({ severity: 4, affectedParticipantCount: 5 }),
      currentIssue: issue({ id: "iss_2", severity: 1, affectedParticipantCount: 1 }),
      taskWasRetested: true,
    });
    expect(verdict.status).toBe("improved");
    expect(verdict.rationale).toMatch(/still occurs/i);
  });

  it("reports no material change as unchanged", () => {
    const verdict = classifyChange({
      previousIssue: issue({}),
      currentIssue: issue({ id: "iss_2" }),
      taskWasRetested: true,
    });
    expect(verdict.status).toBe("unchanged");
  });

  it("marks an issue with no previous counterpart as new", () => {
    const verdict = classifyChange({
      previousIssue: null,
      currentIssue: issue({}),
      taskWasRetested: true,
    });
    expect(verdict.status).toBe("new_issue");
  });
});

describe("research type and stage routing", () => {
  it("analyses an interview and a usability test through different lenses", () => {
    expect(resolveAnalysisLens("user_interview", "exploratory_discovery")).toBe("interview");
    expect(resolveAnalysisLens("usability_test", "prototype_evaluation")).toBe("usability");
  });

  it("lets the post-launch stage override the material's type", () => {
    expect(resolveAnalysisLens("user_interview", "post_launch_evaluation")).toBe("post_launch");
  });

  it("routes a custom type by its stage rather than defaulting to interview", () => {
    expect(resolveAnalysisLens("other", "usability_testing")).toBe("usability");
    expect(resolveAnalysisLens("other", "concept_evaluation")).toBe("concept");
    expect(resolveAnalysisLens("other", "other")).toBe("generic");
  });

  it("does not offer UX evaluation for discovery interviews", () => {
    expect(supportsUxEvaluation("user_interview", "exploratory_discovery")).toBe(false);
    expect(supportsUxEvaluation("usability_test", "usability_testing")).toBe(true);
    expect(supportsUxEvaluation("concept_test", "concept_evaluation")).toBe(true);
  });

  it("does not expect observed behaviour from self-report material", () => {
    expect(expectsObservedBehaviour("user_interview", "exploratory_discovery")).toBe(false);
    expect(expectsObservedBehaviour("usability_test", "usability_testing")).toBe(true);
  });
});
