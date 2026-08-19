# Architecture

## A. Starting point

The repository was empty — a bare git repo with no commits, no framework, no
database. Nothing existed to preserve or work around, so this is a greenfield
build on the requested stack.

## B. Application architecture

Layers, with a hard rule: **domain logic never imports UI, and never imports the
database.** The research rules are plain functions over plain data, which is why
they are testable without an API key or a Postgres instance.

```
src/
  domain/      pure research logic — no IO, no React, no SDK
    taxonomy       research types/stages → analytical lens; UX applicability
    model          entity types; the epistemic-status vocabulary
    evidence       quote verification, grounding, demographic guard
    frequency      honest counts, pattern strength, theme thresholds
    severity       0–4 severity from impact factors, reconciliation
    comparison     round-over-round classification
    frame          Research Frame construction
    ids            stable prefixed IDs

  transcript/  material processing — file → text → segments
    extract        .txt/.md/.docx/.pdf → raw text (registry, extensible)
    normalize      line-stable normalization
    segment        speaker/role/timestamp/line-span detection
    detectMixedMethod   advisory classification signal (never authoritative)

  schemas/     Zod schemas for every LLM response

  llm/         orchestration
    client         model + per-stage effort/token config
    structured     the ONLY place the app talks to the model
    prompts/       stable system prompts, per stage and per lens
    pipeline/      stage runners; map model output → verified domain objects

  server/
    store/       ResearchStore interface + Supabase and file implementations
    jobs/        job bodies, Inngest functions, dispatch
    actions/     Next.js server actions
    storage.ts   original-file retention
    queries.ts   read models for the UI

  app/         Next.js App Router pages
  components/  shadcn-style primitives + research-specific display components
```

### Why the pipeline is split into stages

The brief is explicit that this must not be one giant prompt, and the reason is
practical rather than stylistic: each stage has a different job, a different
correct output shape, and a different failure mode.

- **Metadata extraction** is a copying task. It runs at low effort and its only
  job is to record what the source states — especially to leave demographics
  empty when nothing was said.
- **Synthesis** looks at one participant. It cannot generalise because it cannot
  see anyone else, which removes the temptation entirely.
- **Theming** sees only completed syntheses, not raw transcripts. Comparison is
  meaningful only once each person has been understood, and it keeps the context
  per call bounded.
- **UX evaluation** runs only where the study type supports it, and receives
  syntheses plus themes.
- **Comparison** matches issues across rounds; the *verdict* is computed in code.

## C. Database schema

See `supabase/migrations/0001_init.sql`, which is commented in full.

The research spine — project → study → transcript → segment → participant — is
fully relational. Analysis artefacts (syntheses, insights, themes, UX issues,
recommendations) are relational rows whose nested **evidence is JSONB on the
owning row**. Evidence is immutable, is always read with its owner, and carries
its own stable id plus the segment ids it resolved to, so provenance is intact
without a join table nothing would query independently.

Nothing is destroyed on re-analysis. A new theming run supersedes the previous
themes with a timestamp rather than deleting them, which is what makes the
knowledge-evolution view possible.

## D. Research domain model

The most important field in the model is `epistemicStatus`, carried by every
claim:

| Status | Meaning |
|---|---|
| `participant_stated` | They said it, in substance, in the source |
| `observed` | A behaviour recorded in the material |
| `researcher_observation` | A moderator or observer note |
| `inferred` | A reasonable reading they did not state |
| `interpretation` | Analyst meaning-making — the analyst's claim |

Entities: `Project`, `ResearchQuestion`, `Study`, `Participant`, `Transcript`,
`TranscriptSegment`, `ParticipantSynthesis`, `Insight`, `EvidenceRef`,
`TaskOutcome`, `SynthesisContradiction`, `Theme`, `ThemeEvidence`,
`RejectedPattern`, `UXEvaluation`, `UXIssue`, `CauseHypothesis`, `UserNeed`,
`Recommendation`, `IssueComparison`, `KnowledgeUpdate`, `Finding`.

## E. LLM pipeline

```
Research material
  → parse / normalize / segment
  → Research Frame (problem, goal, questions, type, stage, gaps, limitations)
  → metadata extraction        → validated TranscriptMetadata
  → Research Synthesis         → validated ParticipantSynthesis  → store
  → Research Theming           → validated Theme[]               → store
  → UX Evaluation (when applicable) → validated UXIssue[]        → store
  → Comparison (round 2+)      → matches; verdict computed in code → store
```

Every call goes through `generateStructured`, which uses `client.beta.messages
.stream` with `output_config.format = zodOutputFormat(schema)` on
`claude-opus-5`, adaptive thinking, per-stage effort, and server-side refusal
fallbacks. Responses are `JSON.parse`d and then Zod-validated; a schema failure
is an error, never a partial write.

**Prompt caching.** System prompts are stable per stage and lens, and are
memoised so they are byte-identical across every transcript in a study. The
research frame and the transcript — the volatile parts — go in the user message,
after the cached prefix.

**Schema conventions.** No `.optional()`; strict structured outputs require every
key. `.nullable()` means "the source does not say", and empty arrays mean "there
is genuinely nothing".

## F. Evidence and provenance

1. Segmentation assigns every transcript slice a stable id, line span, character
   span, speaker, role, and timestamp where present.
2. The model is told, in every stage prompt, that its quotes will be checked.
3. `buildEvidence` locates each quote in the source: exact canonicalized match,
   then spanning consecutive segments, then an alphanumeric-only fallback that
   tolerates a dropped comma but not a changed word.
4. A quote that cannot be located becomes `{status: "unverified", reason}` and is
   **kept**. Deleting it would hide the fabrication; the UI shows it in red.
5. Claims whose evidence entirely fails verification are surfaced as ungrounded.
   Demographic claims are dropped outright and the count is reported as a job
   warning.

Traceability in the UI runs both directions:
`Theme → Participant → Insight → Synthesis → Transcript line`, and
`Evaluation → Task → UX Issue → Evidence → Theme → User Need → Recommendation`.

## G. UX flow

```
Projects  →  Project dashboard  →  Study workspace  →  Detail views
                                     1 Confirm classification   (gate)
                                     2 Add research material
                                     3 Review the research frame
                                     4 Participant syntheses  → synthesis page
                                     5 Cross-participant themes → theme page
                                     6 UX evaluation            → evaluation page
```

The project dashboard answers four questions directly: what do we currently
know, what evidence supports it, what are we uncertain about, and what changed.
"Uncertain" is computed from real signals — unverified quotes, contested themes,
preserved contradictions, and previous issues that were not observed.

## H. MVP scope

Built: project creation with problem/goal/questions/hypotheses; study creation
with required type and stage classification and an explicit confirmation gate;
upload and paste ingestion for txt/md/docx/pdf with original retention;
normalization, segmentation and provenance; the research frame; Research
Synthesis; Research Theming with guardrails; UX Evaluation with severity
reconciliation, cause hypotheses, user needs and recommendations; evaluation
rounds with automatic round-over-round comparison; full evidence traceability in
the UI; background jobs; 71 tests.

Deliberately deferred, with the architecture in place for them: embeddings and
retrieval (the store interface is the seam); multi-study and project-wide
theming (`Theme.studyIds` is already an array); the `KnowledgeUpdate` review
queue (the entity, table and store methods exist; the review UI does not);
`.csv`/`.vtt`/`.srt` ingestion (add an entry to the extractor registry);
authentication and multi-tenancy (RLS is enabled with no permissive policy so an
anon key cannot read research data).

## I. Risks and assumptions

- **Quote verification is text matching.** It catches fabricated and merged
  quotes reliably. It cannot catch a real quote attached to a claim it does not
  support — the epistemic-status field and visible evidence are the mitigation,
  and a human reading the page is the backstop.
- **Context limits.** Theming sends every synthesis in one call. That is fine for
  a normal study and will need chunking or retrieval for a large repository.
  The stage boundary is where that goes.
- **Speaker-role detection is heuristic.** Conventional labels are recognised;
  unusual ones fall back to `unknown` rather than being guessed at.
- **Scanned PDFs are not OCR'd.** Extraction warns and the transcript is rejected
  if it yields no text.
- **The inline job runner is not durable.** It exists so the app runs with no
  infrastructure. Configure Inngest for anything real.
- **Single-tenant.** There is no auth. Do not expose an instance holding real
  participant data without adding it.
- **Participant privacy.** Transcripts frequently contain personal information.
  The system stores originals and never redacts; that is a deployment
  responsibility, not something this application currently handles.
