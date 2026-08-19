/**
 * Analytical lenses.
 *
 * The brief is explicit that the same framework must NOT be applied to every
 * transcript. This is where that happens: the lens changes what the model is
 * told to look for, and what it is told NOT to conclude.
 */

import type { AnalysisLens } from "@/domain/taxonomy";

export const LENS_INSTRUCTIONS: Record<AnalysisLens, string> = {
  interview: `## Lens: user interview

You are analysing an interview. Your job is to understand this person's world: what they are trying to get done, how they currently do it, and where that breaks down.

Look for: behaviours and current workflows; needs; motivations; goals; pain points; workarounds they have already invented; expectations; decision factors; unmet needs; attitudes; the context they operate in; the mental model they appear to be using; problems that exist today.

Critical constraint: an interview produces REPORTED experience. When a participant says something is confusing, that is a perception they are reporting, not an observed usability failure. Do NOT label participant statements as usability issues, do not assign severity, and do not describe interface behaviour you did not observe. If a reported problem deserves usability testing, record it as a question the interview raises.`,

  usability: `## Lens: usability test

You are analysing a usability session. The primary evidence is what the participant DID.

For each task, reconstruct: the task as set; the participant's goal; what they expected; what they actually did; where they hesitated; where they were confused; what errors they made; how they navigated; whether they could discover what they needed; whether they understood what they saw; whether they completed the task; whether they needed help; what they worked around; whether they abandoned it.

Critical constraint: keep what the participant SAID and what the participant DID in separate fields, always. A participant who says "that was easy" after two failed attempts and a moderator hint has produced two pieces of evidence that disagree — record both, and do not let the verbal report overwrite the behavioural one. Post-task self-report is systematically more positive than observed performance; treat it as its own kind of evidence rather than as a verdict.

Do not diagnose a cause as fact. A cause is a hypothesis with evidence and a confidence level.`,

  product_evaluation: `## Lens: product / prototype evaluation

You are analysing an evaluation of a product or prototype.

Look for: what the participant expected before they engaged; whether they comprehended what they were looking at; perceived value; usability; desirability; how well it fits the mental model they already have; friction; trust and whether anything undermined it; perceived usefulness; gaps between what they wanted and what was there; their reactions; unmet needs.

Keep expectation, comprehension, and reaction distinct — a participant who understands a feature perfectly and still does not want it has told you something quite different from one who wants it but cannot work out what it does.

Where behaviour was observed, keep it separate from commentary. Where the material is only commentary, say so rather than implying observation.`,

  concept: `## Lens: concept test

You are analysing reactions to a concept, not to a working product.

Look for: the initial unprompted reaction; whether the concept was comprehended and what it was understood to be; perceived value and to whom; relevance to this person's situation; desirability; concerns and objections; expectations the concept sets; points of confusion; alternatives they already use or would consider; barriers to adoption.

Critical constraint: stated intent is weak evidence of future behaviour. A participant saying they would use something is a reaction to a description, not a behaviour. Record enthusiasm as a reaction, never as adoption evidence, and flag it as such. Comprehension failures are the highest-value finding in a concept test — surface them even when the participant was positive.`,

  post_launch: `## Lens: post-launch evaluation

You are analysing accounts of a product people have actually been living with.

Look for: what they actually do now (not what they intended to do); their actual experience; problems they hit; workarounds that have become habit; satisfaction and what drives it; unmet needs; friction that recurs rather than friction that happened once; what changed for them relative to earlier versions.

This material can carry real behavioural evidence because the behaviour already happened — but only when the participant is recounting specific episodes. "I always end up exporting it to a spreadsheet" recounted with detail is behavioural evidence; "I'd probably use it weekly" is not. Distinguish recalled specifics from general impressions, and be alert to recall being reconstructed rather than accurate.

Where the account bears on a finding from an earlier round of research, say so explicitly and say whether it supports, complicates, or contradicts it.`,

  generic: `## Lens: general qualitative material

The research type for this material is custom or unspecified, so apply general qualitative analysis: what this person is trying to do, what is getting in the way, what they need, and what they believe about how things work.

Because the study type is not one of the standard ones, be conservative: do not assume the material contains observed behaviour, do not assign usability severity, and state clearly in your notes what kind of evidence you think this material actually is.`,
};

/** What NOT to produce, per lens. Prevents the classic category errors. */
export const LENS_PROHIBITIONS: Record<AnalysisLens, string> = {
  interview:
    "Do not produce task outcomes, usability issues, or severity ratings from this material. It contains self-report, not observation.",
  usability:
    "Do not treat a participant's verbal summary of their own performance as the outcome of the task. The outcome is what they did.",
  product_evaluation:
    "Do not convert a preference or a reaction into an observed usability failure unless behaviour was actually recorded.",
  concept:
    "Do not treat expressed interest as evidence of adoption, and do not produce usability issues about an interface that was not used.",
  post_launch:
    "Do not treat a general impression as a behavioural observation, and do not declare an earlier issue resolved because this participant did not raise it.",
  generic:
    "Do not assign usability severity or task outcomes unless the material plainly records observed behaviour.",
};
