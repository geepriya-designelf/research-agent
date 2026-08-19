import { Inngest } from "inngest";
import { comparisonTask, synthesisTask, themingTask, uxEvaluationTask } from "./tasks";

export const inngest = new Inngest({ id: "research-insights" });

/**
 * Analysis is slow (a synthesis pass on a long transcript is minutes, not
 * seconds) and must survive a request timeout, so every stage is a durable
 * function. Concurrency is capped so a twelve-transcript upload does not open
 * twelve simultaneous high-effort requests.
 */

export const synthesisFunction = inngest.createFunction(
  {
    id: "research-synthesis",
    triggers: [{ event: "research/synthesis.requested" }],
    concurrency: { limit: 3 },
    retries: 2,
  },
  async ({ event, step }) => {
    await step.run("synthesise-transcript", () =>
      synthesisTask({ jobId: event.data.jobId, transcriptId: event.data.transcriptId }),
    );
  },
);

export const themingFunction = inngest.createFunction(
  {
    id: "research-theming",
    triggers: [{ event: "research/theming.requested" }],
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ event, step }) => {
    await step.run("theme-study", () =>
      themingTask({ jobId: event.data.jobId, studyId: event.data.studyId }),
    );
  },
);

export const uxEvaluationFunction = inngest.createFunction(
  {
    id: "research-ux-evaluation",
    triggers: [{ event: "research/ux-evaluation.requested" }],
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ event, step }) => {
    await step.run("evaluate-ux", () =>
      uxEvaluationTask({
        jobId: event.data.jobId,
        studyId: event.data.studyId,
        label: event.data.label,
      }),
    );
  },
);

export const comparisonFunction = inngest.createFunction(
  {
    id: "research-comparison",
    triggers: [{ event: "research/comparison.requested" }],
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ event, step }) => {
    await step.run("compare-rounds", () =>
      comparisonTask({
        jobId: event.data.jobId,
        previousEvaluationId: event.data.previousEvaluationId,
        currentEvaluationId: event.data.currentEvaluationId,
      }),
    );
  },
);

export const inngestFunctions = [
  synthesisFunction,
  themingFunction,
  uxEvaluationFunction,
  comparisonFunction,
];
