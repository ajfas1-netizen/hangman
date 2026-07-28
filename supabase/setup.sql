-- Hangdle leaderboard — run this once in the Supabase SQL editor, then put your
-- project URL and anon key into src/config.js.
--
-- The anon key is public by design: it ships inside a static page anyone can
-- view. Everything that matters is decided here instead. The policies below let
-- the anon role insert a score and read scores, and nothing else — no updates,
-- no deletes, no reading anything else in the project.

create table if not exists public.hangdle_scores (
  id          bigint generated always as identity primary key,
  puzzle      integer     not null check (puzzle > 0 and puzzle < 100000),
  name        text        not null check (name ~ '^[A-Za-z0-9_-]{1,12}$'),
  won         boolean     not null,
  body        smallint    not null check (body between 0 and 99),
  rope        smallint    not null check (rope between 0 and 99),
  guesses     smallint    not null check (guesses between 0 and 999),
  created_at  timestamptz not null default now()
);

-- One result per player per puzzle. Your first result stands, so replaying a
-- puzzle can't be used to improve your score. A second submit returns 409,
-- which the client reads as "already recorded" rather than an error.
create unique index if not exists hangdle_scores_puzzle_name_idx
  on public.hangdle_scores (puzzle, lower(name));

-- Keep the board readable without scanning the whole table as it grows.
create index if not exists hangdle_scores_puzzle_idx on public.hangdle_scores (puzzle desc);

alter table public.hangdle_scores enable row level security;

drop policy if exists "anyone can read hangdle scores" on public.hangdle_scores;
create policy "anyone can read hangdle scores"
  on public.hangdle_scores for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can add a hangdle score" on public.hangdle_scores;
create policy "anyone can add a hangdle score"
  on public.hangdle_scores for insert
  to anon, authenticated
  with check (true);

-- PostgREST serves the REST API from a cached copy of the schema. A table it
-- has not reloaded since is a 404 — indistinguishable, from the client, from a
-- table that was never created. Supabase usually reloads on its own; this makes
-- it certain.
notify pgrst, 'reload schema';

-- Proof it worked: this should list hangdle_scores.
select tablename from pg_tables where schemaname = 'public' order by tablename;

-- No update or delete policy exists, so with RLS on, neither is possible for
-- the anon role. Removing a bogus entry is a job for the SQL editor:
--
--   delete from public.hangdle_scores where name = 'whoever' and puzzle = 209;
