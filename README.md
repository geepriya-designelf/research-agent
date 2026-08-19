# Research Insights

Turns qualitative research material — interview transcripts, usability sessions,
product evaluations — into research knowledge that stays attached to its
evidence.

The chain the system exists to preserve:

```
SOURCE → EVIDENCE → SYNTHESIS → THEME → UX FINDING → INTERPRETATION
       → HYPOTHESIS / RECOMMENDATION → EVALUATION → UPDATED KNOWLEDGE
```

Every insight, theme and UX issue can be traced back to a verbatim quote at a
specific line in a specific transcript. Quotes that cannot be found in the source
are flagged, not hidden. Demographics that were not stated are not invented.
Counts are reported as "3 of 5 participants", never as "most users".

## Running it

```bash
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY
npm run dev
```

With no Supabase or Inngest configured the app runs entirely locally: research
data goes to a file-backed store under `.data/`, and analysis jobs run
in-process. Add the Supabase variables to move to Postgres + Storage (apply
`supabase/migrations/0001_init.sql` first), and the Inngest variables to move
analysis onto durable background jobs served from `/api/inngest`.

```bash
npm test          # 71 tests, no API calls
npm run typecheck
npm run build
```

## The workflow

1. **Create a project** — the problem being solved, the research goal, research
   questions, optional hypotheses. Every analysis stage is given these and uses
   them to judge relevance.
2. **Create a study** — one research effort. Interviews at discovery, a usability
   round on prototype v3, post-launch follow-ups.
3. **Confirm the classification** — research type and stage. *Analysis is blocked
   until you do this.* The system may flag that material looks mixed, but it
   never reclassifies your study.
4. **Add material** — upload `.txt`, `.md`, `.docx`, `.pdf`, or paste text. The
   original file is kept; the extracted text is normalized without losing a
   single line, so evidence line numbers stay stable.
5. **Research Synthesis** — one participant at a time, understood on their own
   terms, before any comparison.
6. **Research Theming** — patterns across participants, with counter-evidence,
   outliers, and a list of candidate patterns deliberately *not* promoted.
7. **UX Evaluation** — where the study type supports it. Task → expectation →
   observed behaviour → issue → cause hypothesis → user need → recommendation.
8. **Compare rounds** — round 2 onwards is compared against the previous round.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — layers, LLM pipeline, evidence
  and provenance model, UX flow, MVP scope
- [`docs/decisions.md`](docs/decisions.md) — the engineering decisions made and
  why, plus risks and assumptions
- [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — the
  database schema, commented

## Where the guardrails live

The rules that keep the output honest are in code, not only in prompts, because
a prompt can be talked out of a rule and a function cannot:

| Rule | Enforced in |
|---|---|
| Quotes must exist verbatim in the source | `src/domain/evidence.ts` |
| Demographics need a verified supporting quote | `src/domain/evidence.ts` → `partitionGrounded` |
| One participant is an outlier, not a theme | `src/domain/frequency.ts` → `qualifiesAsTheme` |
| Pattern strength follows coverage and evidence, not repetition | `src/domain/frequency.ts` → `derivePatternStrength` |
| Counts are never rendered as proportions | `src/domain/frequency.ts` → `frequencyPhrase` |
| Severity follows impact, never frequency | `src/domain/severity.ts` → `reconcileSeverity` |
| "Not observed" never becomes "resolved" | `src/domain/comparison.ts` → `classifyChange` |
| Analysis is blocked until classification is confirmed | `src/server/jobs/tasks.ts` → `loadFrame` |
| Research type and stage change the analytical lens | `src/domain/taxonomy.ts`, `src/llm/prompts/lenses.ts` |
