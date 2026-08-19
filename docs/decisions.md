# Engineering decisions

Decisions made without asking, as instructed, with the reasoning behind each.

## 1. Guardrails live in code, not only in prompts

Prompts asking a model not to overstate evidence work most of the time. "Most of
the time" is not a foundation for a system whose entire value is trustworthiness.

So the rules that matter are functions:

- a quote is evidence only if it is found in the source (`domain/evidence.ts`)
- a demographic is recorded only if a verified quote supports it
- a single participant cannot be a theme (`domain/frequency.ts`)
- pattern strength is recomputed from coverage and verified evidence; the model
  may rate a pattern *lower* than the computed value but not higher
- severity is reconciled against the impact factors the model itself reported,
  so an observed blocker cannot be filed as minor friction (`domain/severity.ts`)
- "not observed" is computed, never asserted (`domain/comparison.ts`)

The prompts still carry all of this, because a model that understands the rule
produces better output than one that gets corrected afterwards. The code is what
makes it true.

## 2. Unverified quotes are quarantined, not dropped

The obvious implementation filters out quotes that fail verification. That hides
the most important signal in the system: the model asserted something ungrounded.
Unverified evidence is stored with its failure reason and rendered in red, and
the containing job records a warning.

## 3. Analysis is gated on human confirmation of the classification

`loadFrame` throws `StudyNotConfirmedError` if `classificationConfirmedAt` is
null, so every stage is gated at the same point rather than each UI entry point
remembering to check. Editing the classification clears the flag.

Mixed-method detection (`transcript/detectMixedMethod.ts`) is lexical, runs
without an LLM call, and only ever produces advisory text. It cannot change a
study's type.

## 4. Research type and stage select an analytical lens

`resolveAnalysisLens(type, stage)` maps to one of six lenses, each with its own
instructions *and its own prohibitions*. An interview lens is told not to produce
usability issues or severities; a usability lens is told not to let a
participant's verbal summary overwrite their observed performance; a concept lens
is told that stated intent is not adoption evidence.

Stage can override type: an interview run post-launch is read through the
post-launch lens, because what someone actually did with a shipped product is a
different kind of evidence from what they predicted they would do.

`supportsUxEvaluation` prevents running a UX evaluation on discovery interviews
at all, rather than letting it manufacture usability issues out of opinions.

## 5. The comparison verdict is computed, not generated

The model is good at matching "the same underlying problem" across two rounds and
at reporting whether a task was exercised. It is unreliable at resisting the pull
toward "and therefore it's fixed". So `runComparison` asks the model only for the
match and the retest coverage, and `classifyChange` computes the verdict.

Issues the model fails to mention at all are still accounted for: silence about a
previous issue produces an explicit `not_observed` with `taskWasRetested: false`.

## 6. A store interface with two implementations

`ResearchStore` is the persistence boundary. `SupabaseStore` is the production
path; `FileStore` is a single JSON document with atomic writes and a serialized
write chain, selected automatically when Supabase environment variables are
absent.

This exists so the research pipeline is developable, demonstrable and testable
without provisioning Postgres — and, more importantly, so domain code never
imports a database client. `getStore()` is the only place the choice is made.

## 7. Evidence as JSONB on its owning row

Full normalization would give an `evidence` table joined to insights, themes and
issues. Nothing in the product ever queries evidence independently of its owner —
it is read with the claim it supports, and it is immutable. JSONB on the owner
keeps reads to a single row, and evidence still carries its own stable id and the
segment ids it resolved to, so provenance is unaffected.

The spine (project → study → transcript → segment → participant) is fully
relational, because that *is* queried and filtered constantly.

## 8. Streaming structured output with server-side fallbacks

Synthesis and theming responses run long enough to hit non-streaming HTTP
timeouts, so `generateStructured` streams and takes `finalMessage()`.

Refusal fallbacks (`fallbacks: "default"`) are enabled: research transcripts
routinely contain frustration, medical detail, financial detail or workplace
conflict, and a classifier refusal on one transcript should degrade to a fallback
model rather than fail a researcher's whole batch. `stop_reason: "refusal"` is
still handled explicitly and surfaced as a job error.

## 9. Two background-job backends

Inngest when configured, in-process detached execution otherwise. Both call the
same task functions in `server/jobs/tasks.ts`, and the UI polls job records from
the store either way, so the two paths cannot drift in behaviour. The inline
runner is a development convenience and is documented as not durable.

## 10. Tests stub the model rather than calling it

The suite has 71 tests and makes no API calls. Deterministic logic — verification,
frequency, severity, comparison, segmentation, lens routing — is tested directly.
The pipeline is tested with a stubbed model that returns exactly the outputs a
model *does* produce when it goes wrong: a fabricated quote, an invented
demographic, a topic dressed up as a theme, a blocker rated as minor friction, a
"much improved" narrative over numbers that got worse.

Those tests assert that the system catches each one. That is the property this
product depends on, and the one that must never silently regress.

## 11. Native selects rather than Radix Select

Forms here are server actions with no client-side state. A styled native
`<select>` submits correctly with no JavaScript, which keeps the classification
gate working even if hydration fails. The rest of the primitives follow shadcn/ui
conventions (`cn`, CVA variants, `components.json`, Radix Slot for `asChild`).

## 12. Evidence is visually distinct everywhere

Verbatim source text renders in a serif italic face inside a bordered block with
a verification badge and a line anchor; analysis renders in the body face. A
reader can tell what someone said from what the system concluded without reading
a word of either.
