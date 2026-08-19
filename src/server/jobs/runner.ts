/**
 * Job dispatch.
 *
 * Inngest when configured; otherwise the task runs in-process, detached from
 * the request. The inline path exists so the app is runnable locally without
 * an Inngest dev server — it is not a durable queue, and `getStore()` job
 * records are what the UI polls in both cases.
 */

import { getStore } from "@/server/store";
import type { JobKind, JobRecord } from "@/server/store/types";
import { comparisonTask, synthesisTask, themingTask, uxEvaluationTask } from "./tasks";

export function jobsBackend(): "inngest" | "inline" {
  return process.env.INNGEST_EVENT_KEY || process.env.INNGEST_SIGNING_KEY ? "inngest" : "inline";
}

interface EnqueueBase {
  projectId: string;
  studyId: string | null;
  kind: JobKind;
  subjectId: string | null;
  subjectLabel: string | null;
}

async function createJobRecord(input: EnqueueBase): Promise<JobRecord> {
  return getStore().createJob({ ...input, status: "queued", error: null, warnings: [] });
}

/** Runs a task detached, marking the job failed if it throws. */
function runDetached(jobId: string, work: () => Promise<void>): void {
  void work().catch(async (error) => {
    try {
      await getStore().updateJob(jobId, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // The job record itself is unreachable; nothing further we can do here.
    }
  });
}

export async function enqueueSynthesis(input: {
  projectId: string;
  studyId: string;
  transcriptId: string;
  transcriptName: string;
}): Promise<JobRecord> {
  const job = await createJobRecord({
    projectId: input.projectId,
    studyId: input.studyId,
    kind: "synthesis",
    subjectId: input.transcriptId,
    subjectLabel: input.transcriptName,
  });

  if (jobsBackend() === "inngest") {
    const { inngest } = await import("./inngest");
    await inngest.send({
      name: "research/synthesis.requested",
      data: { jobId: job.id, transcriptId: input.transcriptId },
    });
  } else {
    runDetached(job.id, () => synthesisTask({ jobId: job.id, transcriptId: input.transcriptId }));
  }
  return job;
}

export async function enqueueTheming(input: {
  projectId: string;
  studyId: string;
  studyName: string;
}): Promise<JobRecord> {
  const job = await createJobRecord({
    projectId: input.projectId,
    studyId: input.studyId,
    kind: "theming",
    subjectId: input.studyId,
    subjectLabel: input.studyName,
  });

  if (jobsBackend() === "inngest") {
    const { inngest } = await import("./inngest");
    await inngest.send({
      name: "research/theming.requested",
      data: { jobId: job.id, studyId: input.studyId },
    });
  } else {
    runDetached(job.id, () => themingTask({ jobId: job.id, studyId: input.studyId }));
  }
  return job;
}

export async function enqueueUxEvaluation(input: {
  projectId: string;
  studyId: string;
  label: string;
}): Promise<JobRecord> {
  const job = await createJobRecord({
    projectId: input.projectId,
    studyId: input.studyId,
    kind: "ux_evaluation",
    subjectId: input.studyId,
    subjectLabel: input.label,
  });

  if (jobsBackend() === "inngest") {
    const { inngest } = await import("./inngest");
    await inngest.send({
      name: "research/ux-evaluation.requested",
      data: { jobId: job.id, studyId: input.studyId, label: input.label },
    });
  } else {
    runDetached(job.id, () =>
      uxEvaluationTask({ jobId: job.id, studyId: input.studyId, label: input.label }),
    );
  }
  return job;
}

export async function enqueueComparison(input: {
  projectId: string;
  previousEvaluationId: string;
  currentEvaluationId: string;
  label: string;
}): Promise<JobRecord> {
  const job = await createJobRecord({
    projectId: input.projectId,
    studyId: null,
    kind: "comparison",
    subjectId: input.currentEvaluationId,
    subjectLabel: input.label,
  });

  if (jobsBackend() === "inngest") {
    const { inngest } = await import("./inngest");
    await inngest.send({
      name: "research/comparison.requested",
      data: {
        jobId: job.id,
        previousEvaluationId: input.previousEvaluationId,
        currentEvaluationId: input.currentEvaluationId,
      },
    });
  } else {
    runDetached(job.id, () =>
      comparisonTask({
        jobId: job.id,
        previousEvaluationId: input.previousEvaluationId,
        currentEvaluationId: input.currentEvaluationId,
      }),
    );
  }
  return job;
}
