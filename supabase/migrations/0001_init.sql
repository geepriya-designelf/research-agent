-- Research Insights — initial schema.
--
-- Design notes
-- ------------
-- * The research "spine" (project -> study -> transcript -> segment ->
--   participant) is fully relational, because it is queried, filtered and
--   joined constantly.
-- * Analysis artefacts (syntheses, themes, UX issues) are relational rows with
--   their nested evidence stored as JSONB on the owning row. Evidence is
--   immutable, always read with its owner, and carries its own stable id plus
--   the segment ids it resolved to — so provenance is intact without a join
--   table that nothing would ever query independently. `segment_ids` is
--   indexed via GIN where reverse lookup matters.
-- * Nothing is deleted on re-analysis. Re-running theming inserts a new run;
--   previous themes remain addressable so knowledge evolution is inspectable.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Project & study
-- ---------------------------------------------------------------------------

create table if not exists projects (
  id                    text primary key,
  name                  text        not null,
  problem_statement     text        not null,
  research_goal         text        not null,
  hypotheses            jsonb       not null default '[]'::jsonb,
  target_population     text,
  participant_criteria  text,
  product_or_experience text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists research_questions (
  id          text primary key,
  project_id  text not null references projects(id) on delete cascade,
  text        text not null,
  "order"     integer not null default 0
);
create index if not exists research_questions_project_idx on research_questions(project_id);

create table if not exists studies (
  id                        text primary key,
  project_id                text not null references projects(id) on delete cascade,
  name                      text not null,
  research_type             text not null,
  research_type_custom      text,
  research_stage            text not null,
  research_stage_custom     text,
  study_goal                text,
  product_version           text,
  planned_tasks             jsonb not null default '[]'::jsonb,
  -- Analysis is blocked until the researcher confirms the classification.
  classification_confirmed_at timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists studies_project_idx on studies(project_id);

-- ---------------------------------------------------------------------------
-- Research material
-- ---------------------------------------------------------------------------

create table if not exists participants (
  id                 text primary key,
  study_id           text not null references studies(id) on delete cascade,
  project_id         text not null references projects(id) on delete cascade,
  code               text not null,
  display_name       text,
  -- Only demographics literally stated in the source, each with its evidence.
  demographics       jsonb not null default '[]'::jsonb,
  background_context text,
  created_at         timestamptz not null default now(),
  unique (study_id, code)
);
create index if not exists participants_study_idx on participants(study_id);

create table if not exists transcripts (
  id                  text primary key,
  study_id            text not null references studies(id) on delete cascade,
  project_id          text not null references projects(id) on delete cascade,
  name                text not null,
  original_filename   text,
  mime_type           text,
  source_kind         text not null check (source_kind in ('upload','paste')),
  -- Path to the untouched original in Supabase Storage.
  storage_path        text,
  raw_text            text not null,
  normalized_text     text not null,
  extraction_warnings jsonb not null default '[]'::jsonb,
  participant_id      text references participants(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists transcripts_study_idx on transcripts(study_id);

create table if not exists transcript_segments (
  id            text primary key,
  transcript_id text not null references transcripts(id) on delete cascade,
  index         integer not null,
  start_line    integer not null,
  end_line      integer not null,
  start_char    integer not null,
  end_char      integer not null,
  speaker       text,
  speaker_role  text not null check (speaker_role in ('participant','interviewer','observer','unknown')),
  timestamp     text,
  text          text not null,
  unique (transcript_id, index)
);
create index if not exists transcript_segments_transcript_idx on transcript_segments(transcript_id, index);

-- ---------------------------------------------------------------------------
-- Participant-level synthesis
-- ---------------------------------------------------------------------------

create table if not exists participant_syntheses (
  id                        text primary key,
  project_id                text not null references projects(id) on delete cascade,
  study_id                  text not null references studies(id) on delete cascade,
  transcript_id             text not null references transcripts(id) on delete cascade,
  participant_id            text not null references participants(id) on delete cascade,
  -- Frame as it stood when this ran, so the synthesis stays readable later.
  frame_snapshot            jsonb not null,
  overall_summary           text  not null,
  participant_reported      jsonb not null default '[]'::jsonb,
  observed_behavior_summary text,
  task_outcomes             jsonb not null default '[]'::jsonb,
  notable_quotes            jsonb not null default '[]'::jsonb,
  contradictions            jsonb not null default '[]'::jsonb,
  open_questions            jsonb not null default '[]'::jsonb,
  not_supported_by_evidence jsonb not null default '[]'::jsonb,
  model_notes               text,
  created_at                timestamptz not null default now()
);
create index if not exists syntheses_study_idx on participant_syntheses(study_id);
create unique index if not exists syntheses_transcript_idx on participant_syntheses(transcript_id);

create table if not exists insights (
  id                     text primary key,
  synthesis_id           text not null references participant_syntheses(id) on delete cascade,
  participant_id         text not null references participants(id) on delete cascade,
  study_id               text not null references studies(id) on delete cascade,
  project_id             text not null references projects(id) on delete cascade,
  category               text not null,
  statement              text not null,
  interpretation         text,
  -- participant_stated | observed | researcher_observation | inferred | interpretation
  epistemic_status       text not null,
  confidence             text not null check (confidence in ('low','moderate','high')),
  evidence               jsonb not null default '[]'::jsonb,
  related_question_ids   jsonb not null default '[]'::jsonb
);
create index if not exists insights_synthesis_idx on insights(synthesis_id);
create index if not exists insights_study_idx on insights(study_id);
create index if not exists insights_evidence_gin on insights using gin (evidence jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Themes
-- ---------------------------------------------------------------------------

create table if not exists theming_runs (
  id                         text primary key,
  project_id                 text not null references projects(id) on delete cascade,
  study_id                   text not null references studies(id) on delete cascade,
  cross_cutting_observations jsonb not null default '[]'::jsonb,
  divergences                jsonb not null default '[]'::jsonb,
  open_questions             jsonb not null default '[]'::jsonb,
  created_at                 timestamptz not null default now()
);

create table if not exists themes (
  id                            text primary key,
  run_id                        text references theming_runs(id) on delete cascade,
  project_id                    text not null references projects(id) on delete cascade,
  study_ids                     jsonb not null default '[]'::jsonb,
  name                          text not null,
  description                   text not null,
  underlying_insight            text not null,
  why_meaningful                text not null,
  supporting_participant_ids    jsonb not null default '[]'::jsonb,
  participant_count             integer not null default 0,
  total_participants_considered integer not null default 0,
  supporting_insight_ids        jsonb not null default '[]'::jsonb,
  evidence                      jsonb not null default '[]'::jsonb,
  counter_evidence              jsonb not null default '[]'::jsonb,
  outlier_participant_ids       jsonb not null default '[]'::jsonb,
  outlier_notes                 text,
  confidence                    text not null,
  pattern_strength              text not null check (pattern_strength in ('weak','emerging','moderate','strong')),
  relation_to_research_problem  text not null,
  potential_implication         text,
  challenges_hypotheses         jsonb not null default '[]'::jsonb,
  -- Set when a later run revises this theme rather than replacing it silently.
  supersedes_theme_id           text references themes(id) on delete set null,
  superseded_at                 timestamptz,
  created_at                    timestamptz not null default now()
);
create index if not exists themes_project_idx on themes(project_id);

-- Patterns the theming pass considered and deliberately did NOT promote.
create table if not exists rejected_patterns (
  id              text primary key,
  run_id          text references theming_runs(id) on delete cascade,
  project_id      text not null references projects(id) on delete cascade,
  study_ids       jsonb not null default '[]'::jsonb,
  label           text not null,
  reason          text not null,
  participant_ids jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- UX evaluation
-- ---------------------------------------------------------------------------

create table if not exists ux_evaluations (
  id                     text primary key,
  project_id             text not null references projects(id) on delete cascade,
  study_id               text not null references studies(id) on delete cascade,
  round                  integer not null,
  label                  text not null,
  product_version        text,
  research_goal          text not null,
  tasks_evaluated        jsonb not null default '[]'::jsonb,
  tasks_not_exercised    jsonb not null default '[]'::jsonb,
  limitations            jsonb not null default '[]'::jsonb,
  participant_ids        jsonb not null default '[]'::jsonb,
  previous_evaluation_id text references ux_evaluations(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index if not exists ux_evaluations_project_idx on ux_evaluations(project_id, round);

create table if not exists ux_issues (
  id                            text primary key,
  evaluation_id                 text not null references ux_evaluations(id) on delete cascade,
  project_id                    text not null references projects(id) on delete cascade,
  study_id                      text not null references studies(id) on delete cascade,
  name                          text not null,
  description                   text not null,
  affected_task                 text,
  affected_flow                 text,
  affected_participant_ids      jsonb not null default '[]'::jsonb,
  affected_participant_count    integer not null default 0,
  total_participants_considered integer not null default 0,
  occurrence_count              integer,
  severity                      integer not null check (severity between 0 and 4),
  severity_rationale            text not null,
  user_expectation              text,
  observed_behavior             text,
  actual_experience             text,
  likely_cause_hypotheses       jsonb not null default '[]'::jsonb,
  confidence                    text not null,
  evidence                      jsonb not null default '[]'::jsonb,
  related_theme_ids             jsonb not null default '[]'::jsonb,
  related_user_need_ids         jsonb not null default '[]'::jsonb,
  design_implication            text,
  created_at                    timestamptz not null default now()
);
create index if not exists ux_issues_evaluation_idx on ux_issues(evaluation_id);
create index if not exists ux_issues_project_idx on ux_issues(project_id);

create table if not exists user_needs (
  id                      text primary key,
  project_id              text not null references projects(id) on delete cascade,
  statement               text not null,
  derived_from_issue_ids  jsonb not null default '[]'::jsonb,
  derived_from_theme_ids  jsonb not null default '[]'::jsonb,
  evidence                jsonb not null default '[]'::jsonb,
  confidence              text not null,
  created_at              timestamptz not null default now()
);

create table if not exists recommendations (
  id                       text primary key,
  project_id               text not null references projects(id) on delete cascade,
  evaluation_id            text references ux_evaluations(id) on delete cascade,
  -- 'hypothesis_to_test' is the honest default when evidence is thin.
  kind                     text not null check (kind in ('recommendation','hypothesis_to_test')),
  statement                text not null,
  design_principle         text,
  addresses_issue_ids      jsonb not null default '[]'::jsonb,
  addresses_user_need_ids  jsonb not null default '[]'::jsonb,
  related_theme_ids        jsonb not null default '[]'::jsonb,
  how_to_validate          text,
  evidence_strength        text not null,
  rationale                text not null,
  created_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Comparative evaluation & knowledge evolution
-- ---------------------------------------------------------------------------

create table if not exists issue_comparisons (
  id                     text primary key,
  project_id             text not null references projects(id) on delete cascade,
  previous_evaluation_id text not null references ux_evaluations(id) on delete cascade,
  current_evaluation_id  text not null references ux_evaluations(id) on delete cascade,
  previous_issue_id      text references ux_issues(id) on delete set null,
  current_issue_id       text references ux_issues(id) on delete set null,
  status                 text not null check (status in
                           ('improved','partially_improved','unchanged','regressed','not_observed','new_issue')),
  rationale              text not null,
  evidence               jsonb not null default '[]'::jsonb,
  -- Distinguishes "we retested and did not see it" from "we never looked".
  task_was_retested      boolean not null default false,
  confidence             text not null,
  created_at             timestamptz not null default now()
);
create index if not exists issue_comparisons_current_idx on issue_comparisons(current_evaluation_id);

create table if not exists knowledge_updates (
  id                     text primary key,
  project_id             text not null references projects(id) on delete cascade,
  subject_kind           text not null check (subject_kind in ('theme','ux_issue','finding')),
  subject_id             text not null,
  previous_understanding text not null,
  new_evidence_summary   text not null,
  what_changed           text not null,
  reason_for_change      text not null,
  updated_understanding  text not null,
  -- Nothing overwrites an existing finding until a human accepts it.
  review_status          text not null default 'pending_review'
                           check (review_status in ('pending_review','accepted','rejected')),
  evidence               jsonb not null default '[]'::jsonb,
  created_at             timestamptz not null default now()
);

create table if not exists findings (
  id                    text primary key,
  project_id            text not null references projects(id) on delete cascade,
  study_ids             jsonb not null default '[]'::jsonb,
  statement             text not null,
  supporting_theme_ids  jsonb not null default '[]'::jsonb,
  supporting_issue_ids  jsonb not null default '[]'::jsonb,
  confidence            text not null,
  evidence              jsonb not null default '[]'::jsonb,
  open_questions        jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Background jobs
-- ---------------------------------------------------------------------------

create table if not exists analysis_jobs (
  id            text primary key,
  project_id    text not null references projects(id) on delete cascade,
  study_id      text references studies(id) on delete cascade,
  kind          text not null check (kind in ('synthesis','theming','ux_evaluation','comparison')),
  status        text not null check (status in ('queued','running','succeeded','failed')),
  subject_id    text,
  subject_label text,
  error         text,
  warnings      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists analysis_jobs_project_idx on analysis_jobs(project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- The MVP is single-tenant and reached only through the Next.js server using
-- the service role key, which bypasses RLS. RLS is enabled with no permissive
-- policy so that an anon key cannot read research data if one is ever issued.

do $$
declare t text;
begin
  foreach t in array array[
    'projects','research_questions','studies','participants','transcripts',
    'transcript_segments','participant_syntheses','insights','theming_runs',
    'themes','rejected_patterns','ux_evaluations','ux_issues','user_needs',
    'recommendations','issue_comparisons','knowledge_updates','findings',
    'analysis_jobs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
