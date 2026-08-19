/**
 * Pipeline behaviour with a stubbed model.
 *
 * These tests do not check that Claude reasons well — they check that when the
 * model returns something the researcher must not be shown as fact (a
 * fabricated quote, an invented demographic, a topic dressed up as a theme, a
 * blocker rated as minor friction), the system catches it. That is the
 * property the product depends on and the one that must never silently break.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const llmStub = vi.hoisted(() => vi.fn());
vi.mock("@/llm/structured", () => ({
  generateStructured: llmStub,
  LlmRefusalError: class extends Error {},
  LlmValidationError: class extends Error {},
}));

const { runSynthesis } = await import("@/llm/pipeline/runSynthesis");
const { runTheming } = await import("@/llm/pipeline/runTheming");
const { runUxEvaluation } = await import("@/llm/pipeline/runUxEvaluation");
const { buildResearchFrame } = await import("@/domain/frame");
const { normalizeTranscript } = await import("@/transcript/normalize");
const { segmentTranscript } = await import("@/transcript/segment");
const { partitionGrounded, buildEvidence } = await import("@/domain/evidence");

import type {
  DemographicFact,
  Participant,
  Project,
  ResearchFrame,
  Study,
  Transcript,
  TranscriptSegment,
} from "@/domain/model";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function fixtureSegments(name: string, transcriptId: string): TranscriptSegment[] {
  const raw = readFileSync(path.join(process.cwd(), "tests", "fixtures", name), "utf8");
  const { normalizedText } = normalizeTranscript(raw);
  return segmentTranscript(transcriptId, normalizedText).segments;
}

const project: Project = {
  id: "prj_1",
  name: "Improve expense reporting",
  problemStatement: "People delay and abandon expense submissions.",
  researchGoal: "Understand what makes people avoid the tool.",
  hypotheses: ["People avoid it because it takes too long."],
  targetPopulation: null,
  participantCriteria: null,
  productOrExperience: "Expense web app",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeStudy(over: Partial<Study> = {}): Study {
  return {
    id: "std_1",
    projectId: "prj_1",
    name: "Discovery interviews",
    researchType: "user_interview",
    researchTypeCustom: null,
    researchStage: "exploratory_discovery",
    researchStageCustom: null,
    studyGoal: null,
    productVersion: null,
    plannedTasks: [],
    classificationConfirmedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function makeTranscript(id: string, name: string): Transcript {
  return {
    id,
    studyId: "std_1",
    projectId: "prj_1",
    name,
    originalFilename: null,
    mimeType: "text/plain",
    sourceKind: "paste",
    storagePath: null,
    normalizedText: "",
    rawText: "",
    extractionWarnings: [],
    participantId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeParticipant(id: string, code: string): Participant {
  return {
    id,
    studyId: "std_1",
    projectId: "prj_1",
    code,
    displayName: null,
    demographics: [],
    backgroundContext: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function frameFor(study: Study, participants: Participant[], transcripts: Transcript[]): ResearchFrame {
  return buildResearchFrame({
    project,
    study,
    researchQuestions: [{ id: "rq_1", projectId: "prj_1", text: "Why do people delay?", order: 0 }],
    participants,
    transcripts,
  });
}

const EMPTY_METADATA = {
  participantLabel: null,
  interviewerLabel: "Moderator",
  sessionDate: null,
  productOrVersionMentioned: null,
  demographics: [],
  backgroundContext: null,
  tasksMentioned: [],
  containsObservedBehavior: false,
  missingInformation: [],
};

const EMPTY_SYNTHESIS = {
  overallSummary: "",
  participantReported: [],
  observedBehaviorSummary: null,
  insights: [],
  taskOutcomes: [],
  notableQuotes: [],
  contradictions: [],
  openQuestions: [],
  notSupportedByEvidence: [],
  modelNotes: null,
};

/** Route stubbed responses by pipeline stage. */
function stubStages(responses: Record<string, unknown>) {
  llmStub.mockImplementation(async (req: { stage: string }) => {
    if (!(req.stage in responses)) throw new Error(`No stub for stage "${req.stage}"`);
    return { data: responses[req.stage], usage: {}, model: "stub" };
  });
}

beforeEach(() => {
  llmStub.mockReset();
});

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

describe("research synthesis", () => {
  const segments = fixtureSegments("interview.txt", "trs_1");
  const transcript = makeTranscript("trs_1", "P03 interview");
  const frame = frameFor(makeStudy(), [makeParticipant("par_1", "P03")], [transcript]);

  const run = () =>
    runSynthesis({
      frame,
      transcript,
      segments,
      participantId: "par_1",
      participantCode: "P03",
    });

  it("keeps ambiguous, hedged language as ambiguity rather than flattening it", async () => {
    stubStages({
      metadata: EMPTY_METADATA,
      synthesis: {
        ...EMPTY_SYNTHESIS,
        overallSummary:
          "P03 describes the tool as fine while also describing avoidance and a lost batch.",
        insights: [
          {
            category: "attitude",
            statement:
              "P03 says the tool is fine, but describes deferring use until forced — reluctant acceptance rather than satisfaction.",
            interpretation: "The 'it's fine' reads as resignation given the avoidance behaviour around it.",
            epistemicStatus: "inferred",
            confidence: "moderate",
            evidence: [
              {
                quote: "I guess it's fine, but honestly I usually just don't bother with it",
                transcriptRef: null,
                approximateStartLine: null,
              },
            ],
            relatedResearchQuestions: ["rq_1"],
          },
        ],
      },
    });

    const { synthesis } = await run();
    const insight = synthesis.insights[0];
    expect(insight.epistemicStatus).toBe("inferred");
    expect(insight.evidence[0].verification.status).toBe("verified");
    expect(insight.interpretation).toBeTruthy();
  });

  it("quarantines a fabricated quote instead of persisting it as evidence", async () => {
    stubStages({
      metadata: EMPTY_METADATA,
      synthesis: {
        ...EMPTY_SYNTHESIS,
        overallSummary: "Summary.",
        insights: [
          {
            category: "pain_point",
            statement: "P03 finds the tool unusable.",
            interpretation: null,
            epistemicStatus: "participant_stated",
            confidence: "high",
            evidence: [
              {
                quote: "This tool is completely unusable and I hate every part of it.",
                transcriptRef: null,
                approximateStartLine: 12,
              },
            ],
            relatedResearchQuestions: [],
          },
        ],
      },
    });

    const { synthesis, fabricationWarnings } = await run();
    expect(synthesis.insights[0].evidence[0].verification.status).toBe("unverified");
    expect(fabricationWarnings).toHaveLength(1);
    expect(fabricationWarnings[0].where).toMatch(/insight/);
  });

  it("preserves both sides of a contradiction without resolving it", async () => {
    stubStages({
      metadata: EMPTY_METADATA,
      synthesis: {
        ...EMPTY_SYNTHESIS,
        overallSummary: "Summary.",
        contradictions: [
          {
            description: "P03 calls the tool fine, then says it does not work well.",
            sideAStatement: "The tool is fine and works.",
            sideAEvidence: [
              { quote: "Yeah, it's fine. It works.", transcriptRef: null, approximateStartLine: null },
            ],
            sideBStatement: "The tool does not work well; they have stopped expecting it to.",
            sideBEvidence: [
              {
                quote: "I suppose it doesn't work well. I've just stopped expecting it to.",
                transcriptRef: null,
                approximateStartLine: null,
              },
            ],
            possibleReading:
              "Possibly a revision prompted by being reminded of the lost batch, rather than two simultaneous beliefs.",
          },
        ],
      },
    });

    const { synthesis } = await run();
    const contradiction = synthesis.contradictions[0];
    expect(contradiction.sideA.evidence[0].verification.status).toBe("verified");
    expect(contradiction.sideB.evidence[0].verification.status).toBe("verified");
    expect(contradiction.possibleReading).toMatch(/possibly/i);
  });

  it("records what the source does not support", async () => {
    stubStages({
      metadata: EMPTY_METADATA,
      synthesis: {
        ...EMPTY_SYNTHESIS,
        overallSummary: "Summary.",
        notSupportedByEvidence: [
          "Whether the save actually fails or only appears to — the participant cannot tell, and neither can this transcript.",
        ],
      },
    });
    const { synthesis } = await run();
    expect(synthesis.notSupportedByEvidence[0]).toMatch(/cannot tell/);
  });

  it("carries evidence anchors so a claim can be traced back to its lines", async () => {
    stubStages({
      metadata: EMPTY_METADATA,
      synthesis: {
        ...EMPTY_SYNTHESIS,
        overallSummary: "Summary.",
        notableQuotes: [
          { quote: "Once I lost a whole batch. Twelve receipts.", transcriptRef: null, approximateStartLine: null },
        ],
      },
    });
    const { synthesis } = await run();
    const quote = synthesis.notableQuotes[0];
    expect(quote.transcriptId).toBe("trs_1");
    expect(quote.segmentIds.length).toBeGreaterThan(0);
    expect(quote.startLine).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Demographics
// ---------------------------------------------------------------------------

describe("demographics", () => {
  const segments = fixtureSegments("interview.txt", "trs_1");

  const claim = (field: string, value: string, quote: string): DemographicFact => ({
    field,
    value,
    evidence: [buildEvidence({ quote }, "trs_1", segments)],
  });

  it("keeps a demographic the participant actually stated", () => {
    const { kept, dropped } = partitionGrounded([
      claim("tenure", "about eight years", "I've been at the company about eight years now"),
    ]);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("drops demographics that were inferred rather than stated", () => {
    const { kept, dropped } = partitionGrounded([
      claim("age", "35-44", "I am thirty-eight years old"),
      claim("location", "Chicago", "I live in Chicago"),
      claim("gender", "female", "I am a woman"),
    ]);
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(3);
  });

  it("reports missing demographics in the frame instead of filling them in", () => {
    const frame = frameFor(makeStudy(), [makeParticipant("par_1", "P03")], [makeTranscript("trs_1", "t")]);
    expect(frame.observedDemographicFields).toEqual([]);
    expect(frame.missingInformation.join(" ")).toMatch(/No participant demographics are stated/);
    expect(frame.limitations.join(" ")).toMatch(/self-report/);
  });
});

// ---------------------------------------------------------------------------
// Theming
// ---------------------------------------------------------------------------

describe("research theming", () => {
  const segments = fixtureSegments("interview.txt", "trs_1");
  const transcripts = [{ transcriptId: "trs_1", name: "P03 interview", segments }];
  const participants = [
    { id: "par_1", code: "P01" },
    { id: "par_2", code: "P02" },
    { id: "par_3", code: "P03" },
    { id: "par_4", code: "P04" },
    { id: "par_5", code: "P05" },
  ];

  const synthesis = {
    id: "syn_1",
    projectId: "prj_1",
    studyId: "std_1",
    transcriptId: "trs_1",
    participantId: "par_1",
    frameSnapshot: {} as ResearchFrame,
    overallSummary: "Summary.",
    participantReported: [],
    observedBehaviorSummary: null,
    insights: [],
    taskOutcomes: [],
    notableQuotes: [],
    contradictions: [],
    openQuestions: [],
    notSupportedByEvidence: [],
    modelNotes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const themeEvidence = (code: string, quote: string) => ({
    participantCode: code,
    insightStatement: "Uncertainty about save status drives repeated checking.",
    rationale: "The participant re-checks because the interface never confirms the save.",
    evidence: [{ quote, transcriptRef: "trs_1", approximateStartLine: null }],
  });

  const runWith = (themingResult: Record<string, unknown>) => {
    stubStages({ theming: themingResult });
    return runTheming({
      frame: frameFor(
        makeStudy(),
        participants.map((p) => makeParticipant(p.id, p.code)),
        [makeTranscript("trs_1", "P03 interview")],
      ),
      syntheses: [synthesis],
      participants,
      transcripts,
    });
  };

  const baseTheme = {
    name: "Invisible save status makes people re-check their work",
    description: "Participants cannot tell whether a submission saved, so they verify manually.",
    underlyingInsight: "The system gives no durable confirmation at the moment of commitment.",
    whyMeaningful: "The checking behaviour is a workaround for missing system status, not a preference.",
    supportingParticipants: ["P01", "P02", "P03"],
    evidence: [
      themeEvidence("P01", "I'm never really sure if it saved"),
      themeEvidence("P02", "I click back to the list to see if they're there"),
      themeEvidence("P03", "Once I lost a whole batch. Twelve receipts."),
    ],
    counterEvidence: [],
    outlierParticipants: [],
    outlierNotes: null,
    confidence: "moderate" as const,
    patternStrength: "strong" as const,
    relationToResearchProblem: "Directly explains delayed submission.",
    potentialImplication: "Making save state durable may reduce avoidance.",
    challengesHypotheses: ["People avoid it because it takes too long."],
  };

  it("keeps a well-supported theme and preserves its counter-evidence", async () => {
    const result = await runWith({
      themes: [
        {
          ...baseTheme,
          counterEvidence: [themeEvidence("P05", "Yeah, it's fine. It works.")],
        },
      ],
      rejectedPatterns: [],
      crossCuttingObservations: [],
      divergences: [],
      openQuestions: [],
    });

    expect(result.themes).toHaveLength(1);
    const theme = result.themes[0];
    expect(theme.counterEvidence).toHaveLength(1);
    expect(theme.counterEvidence[0].evidence.verification.status).toBe("verified");
    expect(theme.totalParticipantsConsidered).toBe(5);
    expect(theme.challengesHypotheses).toHaveLength(1);
  });

  it("demotes a single-participant 'theme' to a rejected pattern", async () => {
    const result = await runWith({
      themes: [
        {
          ...baseTheme,
          name: "One person dislikes the wording",
          supportingParticipants: ["P01"],
          evidence: [themeEvidence("P01", "I'm never really sure if it saved")],
        },
      ],
      rejectedPatterns: [],
      crossCuttingObservations: [],
      divergences: [],
      openQuestions: [],
    });

    expect(result.themes).toHaveLength(0);
    expect(result.demotions[0].reason).toMatch(/single participant is an outlier/i);
    expect(result.rejectedPatterns.some((p) => p.label === "One person dislikes the wording")).toBe(true);
  });

  it("demotes a pattern whose evidence cannot be verified against the source", async () => {
    const result = await runWith({
      themes: [
        {
          ...baseTheme,
          name: "Participants describe the tool as hostile",
          evidence: [
            themeEvidence("P01", "The tool is actively hostile to me."),
            themeEvidence("P02", "It fights me every single day."),
            themeEvidence("P03", "I dread opening it."),
          ],
        },
      ],
      rejectedPatterns: [],
      crossCuttingObservations: [],
      divergences: [],
      openQuestions: [],
    });

    expect(result.themes).toHaveLength(0);
    expect(result.demotions[0].reason).toMatch(/could be verified/i);
    expect(result.fabricationWarnings.length).toBeGreaterThan(0);
  });

  it("refuses to let a thinly-evidenced pattern be rated strong", async () => {
    const result = await runWith({
      themes: [
        {
          ...baseTheme,
          supportingParticipants: ["P01", "P02"],
          evidence: [
            themeEvidence("P01", "I'm never really sure if it saved"),
            themeEvidence("P02", "I click back to the list to see if they're there"),
          ],
          patternStrength: "strong" as const,
        },
      ],
      rejectedPatterns: [],
      crossCuttingObservations: [],
      divergences: [],
      openQuestions: [],
    });

    expect(result.themes[0].patternStrength).toBe("weak");
  });

  it("flags majority language in a theme rather than passing it through silently", async () => {
    const result = await runWith({
      themes: [
        {
          ...baseTheme,
          description: "Most users struggled to tell whether their work had saved.",
        },
      ],
      rejectedPatterns: [],
      crossCuttingObservations: [],
      divergences: [],
      openQuestions: [],
    });

    expect(result.overgeneralizations[0].phrases).toContain("most users");
  });

  it("carries through patterns the model deliberately did not promote", async () => {
    const result = await runWith({
      themes: [],
      rejectedPatterns: [
        {
          label: "Participants said 'slow'",
          participants: ["P01", "P02", "P04"],
          reason:
            "Three participants used the word 'slow' about the search, the approval queue, and their own laptop. Same word, three unrelated experiences.",
        },
      ],
      crossCuttingObservations: [],
      divergences: [],
      openQuestions: [],
    });

    expect(result.rejectedPatterns[0].reason).toMatch(/three unrelated experiences/);
    expect(result.rejectedPatterns[0].participantIds).toContain("par_1");
  });
});

// ---------------------------------------------------------------------------
// UX evaluation
// ---------------------------------------------------------------------------

describe("ux evaluation", () => {
  const segments = fixtureSegments("usability.txt", "trs_u");
  const participants = [
    { id: "par_1", code: "P07" },
    { id: "par_2", code: "P08" },
    { id: "par_3", code: "P09" },
  ];

  const synthesis = {
    id: "syn_u",
    projectId: "prj_1",
    studyId: "std_1",
    transcriptId: "trs_u",
    participantId: "par_1",
    frameSnapshot: {} as ResearchFrame,
    overallSummary: "P07 could not find the default-card control unaided.",
    participantReported: [],
    observedBehaviorSummary: "Searched three menus, asked for help after 90 seconds.",
    insights: [],
    taskOutcomes: [],
    notableQuotes: [],
    contradictions: [],
    openQuestions: [],
    notSupportedByEvidence: [],
    modelNotes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const study = makeStudy({
    researchType: "usability_test",
    researchStage: "prototype_evaluation",
    productVersion: "Prototype v3",
    plannedTasks: ["Add a second payment card", "Set the default card", "Remove a card"],
  });

  const runWith = (result: Record<string, unknown>) => {
    stubStages({ ux_evaluation: result });
    return runUxEvaluation({
      frame: frameFor(
        study,
        participants.map((p) => makeParticipant(p.id, p.code)),
        [makeTranscript("trs_u", "P07 usability")],
      ),
      syntheses: [synthesis],
      themes: [],
      participants,
      transcripts: [{ transcriptId: "trs_u", name: "P07 usability", segments }],
      round: 1,
      label: "Round 1",
      previousEvaluationId: null,
    });
  };

  const baseIssue = {
    name: "No way to set a default card",
    description: "The control to make a card the default is not discoverable.",
    affectedTask: "Set the default card",
    affectedFlow: "Wallet",
    affectedParticipants: ["P07"],
    occurrenceCount: 1,
    userExpectation: "A control on the card list or in payment settings.",
    observedBehavior: "Searched three menus, then asked the moderator for help.",
    actualExperience: "The control exists on the card detail view, which was never opened.",
    severityRationale: "The participant could not complete the task without help.",
    likelyCauseHypotheses: [
      {
        hypothesis: "The control is on a detail view that gives no affordance from the list.",
        confidence: "moderate" as const,
        wouldBeTestedBy: "A first-click test on the card list.",
        evidence: [
          {
            quote: "I don't see how to make it the main one. Is that a thing?",
            transcriptRef: "trs_u",
            approximateStartLine: null,
          },
        ],
      },
    ],
    confidence: "moderate" as const,
    evidence: [
      {
        quote: "I don't see how to make it the main one. Is that a thing?",
        transcriptRef: "trs_u",
        approximateStartLine: null,
      },
    ],
    relatedThemeNames: [],
    underlyingUserNeed: "To know which card will be charged without checking each one.",
    designImplication: "Default state needs to be visible and settable where cards are listed.",
  };

  it("raises a severity that understates what was observed", async () => {
    const result = await runWith({
      issues: [
        {
          ...baseIssue,
          proposedSeverity: 1,
          severityFactors: {
            blocksTaskCompletion: true,
            causedAbandonment: false,
            requiredAssistance: true,
            causedError: false,
            requiredWorkaround: false,
            causedPersistentConfusion: true,
            minorFrictionOnly: false,
            affectsPrimaryUserGoal: true,
          },
        },
      ],
      userNeeds: [],
      recommendations: [],
      tasksEvaluated: ["Add a second payment card", "Set the default card"],
      tasksNotExercised: ["Remove a card"],
      evaluationLimitations: [],
    });

    expect(result.issues[0].severity).toBe(4);
    expect(result.severityAdjustments[0].note).toMatch(/Prevented task completion/);
    expect(result.issues[0].severityRationale).toMatch(/Adjusted by impact check/);
  });

  it("keeps a one-participant blocker at full severity", async () => {
    const result = await runWith({
      issues: [
        {
          ...baseIssue,
          proposedSeverity: 4,
          severityFactors: {
            blocksTaskCompletion: true,
            causedAbandonment: false,
            requiredAssistance: true,
            causedError: false,
            requiredWorkaround: false,
            causedPersistentConfusion: true,
            minorFrictionOnly: false,
            affectsPrimaryUserGoal: true,
          },
        },
      ],
      userNeeds: [],
      recommendations: [],
      tasksEvaluated: [],
      tasksNotExercised: [],
      evaluationLimitations: [],
    });

    expect(result.issues[0].severity).toBe(4);
    expect(result.issues[0].affectedParticipantCount).toBe(1);
    expect(result.issues[0].totalParticipantsConsidered).toBe(3);
  });

  it("keeps root cause as a hypothesis with a way to test it", async () => {
    const result = await runWith({
      issues: [
        {
          ...baseIssue,
          proposedSeverity: 3,
          severityFactors: {
            blocksTaskCompletion: false,
            causedAbandonment: false,
            requiredAssistance: true,
            causedError: false,
            requiredWorkaround: false,
            causedPersistentConfusion: true,
            minorFrictionOnly: false,
            affectsPrimaryUserGoal: true,
          },
        },
      ],
      userNeeds: [],
      recommendations: [],
      tasksEvaluated: [],
      tasksNotExercised: [],
      evaluationLimitations: [],
    });

    const cause = result.issues[0].likelyCauseHypotheses[0];
    expect(cause.confidence).toBe("moderate");
    expect(cause.wouldBeTestedBy).toMatch(/first-click test/i);
    expect(cause.evidence[0].verification.status).toBe("verified");
  });

  it("records tasks the round did not exercise, so a later round cannot claim a fix", async () => {
    const result = await runWith({
      issues: [],
      userNeeds: [],
      recommendations: [],
      tasksEvaluated: ["Add a second payment card"],
      tasksNotExercised: ["Remove a card"],
      evaluationLimitations: ["Only one participant reached the default-card step."],
    });

    expect(result.tasksNotExercised).toContain("Remove a card");
    expect(result.limitations[0]).toMatch(/one participant/);
  });

  it("downgrades a weakly-evidenced recommendation to a hypothesis to test", async () => {
    const result = await runWith({
      issues: [],
      userNeeds: [],
      recommendations: [
        {
          kind: "recommendation",
          statement: "Move the default toggle onto the card list.",
          designPrinciple: "Put the control where the decision is made.",
          addressesIssueNames: [],
          addressesUserNeeds: [],
          relatedThemeNames: [],
          howToValidate: null,
          evidenceStrength: "low",
          rationale: "One participant looked for it there.",
        },
      ],
      tasksEvaluated: [],
      tasksNotExercised: [],
      evaluationLimitations: [],
    });

    expect(result.recommendations[0].kind).toBe("hypothesis_to_test");
  });

  it("links user needs and issues in both directions", async () => {
    const result = await runWith({
      issues: [
        {
          ...baseIssue,
          proposedSeverity: 3,
          severityFactors: {
            blocksTaskCompletion: false,
            causedAbandonment: false,
            requiredAssistance: true,
            causedError: false,
            requiredWorkaround: false,
            causedPersistentConfusion: false,
            minorFrictionOnly: false,
            affectsPrimaryUserGoal: true,
          },
        },
      ],
      userNeeds: [
        {
          statement: "To know which card will be charged without checking each one.",
          fromIssueNames: ["No way to set a default card"],
          confidence: "moderate",
          evidence: [],
        },
      ],
      recommendations: [],
      tasksEvaluated: [],
      tasksNotExercised: [],
      evaluationLimitations: [],
    });

    const need = result.userNeeds[0];
    const issue = result.issues[0];
    expect(need.derivedFromIssueIds).toContain(issue.id);
    expect(issue.relatedUserNeedIds).toContain(need.id);
  });
});

// ---------------------------------------------------------------------------
// Comparative evaluation
// ---------------------------------------------------------------------------

const { runComparison } = await import("@/llm/pipeline/runComparison");

describe("comparative evaluation", () => {
  const segments = fixtureSegments("usability.txt", "trs_u");

  const issue = (id: string, name: string, severity: number, affected: number) => ({
    id,
    evaluationId: id.startsWith("a") ? "uxe_1" : "uxe_2",
    projectId: "prj_1",
    studyId: "std_1",
    name,
    description: "",
    affectedTask: "Set the default card",
    affectedFlow: null,
    affectedParticipantIds: [],
    affectedParticipantCount: affected,
    totalParticipantsConsidered: 5,
    occurrenceCount: null,
    severity,
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
    createdAt: "2026-01-01T00:00:00.000Z",
  }) as never;

  const evaluation = (id: string, round: number) =>
    ({
      id,
      projectId: "prj_1",
      studyId: "std_1",
      round,
      label: `Round ${round}`,
      productVersion: `v${round}`,
      researchGoal: "Goal",
      tasksEvaluated: ["Set the default card"],
      participantIds: [],
      previousEvaluationId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    }) as never;

  const call = (comparisonResult: Record<string, unknown>, previousIssues: never[], currentIssues: never[]) => {
    stubStages({ comparison: comparisonResult });
    return runComparison({
      projectId: "prj_1",
      previous: { evaluation: evaluation("uxe_1", 1), issues: previousIssues },
      current: { evaluation: evaluation("uxe_2", 2), issues: currentIssues },
      transcripts: [{ transcriptId: "trs_u", name: "P07 usability", segments }],
    });
  };

  it("does not accept the model's word that an unmentioned issue is gone", async () => {
    const result = await call(
      {
        // The model says nothing at all about the previous issue.
        matches: [],
        notComparable: [],
        overallAssessment: "Looks better.",
      },
      [issue("a1", "No way to set a default card", 4, 3)],
      [],
    );

    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0].status).toBe("not_observed");
    expect(result.comparisons[0].taskWasRetested).toBe(false);
    expect(result.comparisons[0].rationale).toMatch(/no evidence either way/i);
  });

  it("refuses to call a retested-but-absent issue resolved", async () => {
    const result = await call(
      {
        matches: [
          {
            previousIssueName: "No way to set a default card",
            currentIssueName: null,
            sameUnderlyingProblem: false,
            taskWasRetested: true,
            whatChanged: "Nobody hit it this time, so it is fixed.",
            confidence: "high",
            evidence: [],
          },
        ],
        notComparable: [],
        overallAssessment: "Fixed.",
      },
      [issue("a1", "No way to set a default card", 4, 3)],
      [],
    );

    const verdict = result.comparisons[0];
    expect(verdict.status).toBe("not_observed");
    expect(verdict.rationale).toMatch(/not resolved/i);
  });

  it("computes the verdict itself rather than trusting the model's narrative", async () => {
    const result = await call(
      {
        matches: [
          {
            previousIssueName: "No way to set a default card",
            currentIssueName: "Default card control still hidden",
            sameUnderlyingProblem: true,
            taskWasRetested: true,
            whatChanged: "Much improved.",
            confidence: "moderate",
            evidence: [],
          },
        ],
        notComparable: [],
        overallAssessment: "Improved.",
      },
      [issue("a1", "No way to set a default card", 2, 2)],
      [issue("b1", "Default card control still hidden", 4, 4)],
    );

    // Severity went up and incidence went up: "much improved" is a regression.
    expect(result.comparisons[0].status).toBe("regressed");
  });

  it("accounts for a current-round issue the model did not match", async () => {
    const result = await call(
      { matches: [], notComparable: [], overallAssessment: "" },
      [],
      [issue("b1", "Card list does not show which card is default", 2, 2)],
    );

    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0].status).toBe("new_issue");
  });
});
