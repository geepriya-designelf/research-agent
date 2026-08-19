/**
 * Research taxonomy: the classification a researcher must confirm before any
 * analysis runs. The selected type + stage change which analytical lens the
 * LLM pipeline applies (see `src/llm/prompts/synthesis.ts`), so this is not
 * cosmetic metadata.
 */

export const RESEARCH_TYPES = [
  "user_interview",
  "usability_test",
  "product_prototype_evaluation",
  "concept_test",
  "customer_support_conversation",
  "other",
] as const;

export type ResearchType = (typeof RESEARCH_TYPES)[number];

export const RESEARCH_TYPE_LABELS: Record<ResearchType, string> = {
  user_interview: "User Interview",
  usability_test: "Usability Test",
  product_prototype_evaluation: "Product / Prototype Evaluation",
  concept_test: "Concept Test",
  customer_support_conversation: "Customer / Support Conversation",
  other: "Other",
};

export const RESEARCH_STAGES = [
  "exploratory_discovery",
  "problem_validation",
  "concept_evaluation",
  "prototype_evaluation",
  "usability_testing",
  "pre_launch_evaluation",
  "post_launch_evaluation",
  "iterative_follow_up",
  "other",
] as const;

export type ResearchStage = (typeof RESEARCH_STAGES)[number];

export const RESEARCH_STAGE_LABELS: Record<ResearchStage, string> = {
  exploratory_discovery: "Exploratory / Discovery",
  problem_validation: "Problem Validation",
  concept_evaluation: "Concept Evaluation",
  prototype_evaluation: "Prototype Evaluation",
  usability_testing: "Usability Testing",
  pre_launch_evaluation: "Pre-Launch Evaluation",
  post_launch_evaluation: "Post-Launch Evaluation",
  iterative_follow_up: "Iterative Follow-Up",
  other: "Other",
};

/**
 * The analytical lens applied during synthesis. Distinct from ResearchType so
 * that "other" / custom types can still be routed to a sensible lens, and so
 * stage can override type (e.g. a "user interview" run at post-launch is read
 * through the post-launch lens).
 */
export type AnalysisLens =
  | "interview"
  | "usability"
  | "product_evaluation"
  | "concept"
  | "post_launch"
  | "generic";

export function resolveAnalysisLens(
  type: ResearchType,
  stage: ResearchStage,
): AnalysisLens {
  // Stage wins for post-launch work: what people actually did in the live
  // product is a different kind of evidence from what they predicted they'd do.
  if (stage === "post_launch_evaluation") return "post_launch";

  switch (type) {
    case "user_interview":
      return "interview";
    case "usability_test":
      return "usability";
    case "product_prototype_evaluation":
      return "product_evaluation";
    case "concept_test":
      return "concept";
    case "customer_support_conversation":
      return "interview";
    case "other":
    default:
      // Fall back to the stage when the type is unknown/custom.
      if (stage === "usability_testing" || stage === "prototype_evaluation") {
        return "usability";
      }
      if (stage === "concept_evaluation") return "concept";
      if (stage === "exploratory_discovery" || stage === "problem_validation") {
        return "interview";
      }
      return "generic";
  }
}

/**
 * Whether a UX Evaluation is applicable to this study. Interviews at discovery
 * stage produce needs and mental models, not usability issues — offering a UX
 * evaluation there invites the model to manufacture usability findings out of
 * reported opinions.
 */
export function supportsUxEvaluation(
  type: ResearchType,
  stage: ResearchStage,
): boolean {
  const lens = resolveAnalysisLens(type, stage);
  return (
    lens === "usability" || lens === "product_evaluation" || lens === "concept" || lens === "post_launch"
  );
}

/**
 * Whether observed behaviour (as opposed to participant self-report) is
 * expected to exist in this material. Drives whether the synthesis schema's
 * task/observation sections are requested and how emptiness is interpreted.
 */
export function expectsObservedBehaviour(
  type: ResearchType,
  stage: ResearchStage,
): boolean {
  const lens = resolveAnalysisLens(type, stage);
  return lens === "usability" || lens === "product_evaluation" || lens === "concept";
}
