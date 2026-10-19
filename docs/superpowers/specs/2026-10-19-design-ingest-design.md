# Design ingest from the app — design

Date: 2026-10-19 · Target: app 0.11.0 · Template unchanged (vault format 1) ·
Status: approved in chat, awaiting spec review

## Goal

Extend the app's ingest (0.10, sessions only) to the template's DESIGN INGEST: turn the
design material in `raw/worldbuilding/` into `prepared` wiki pages, with the same
discuss → work → review → apply flow and the same guarantee that nothing reaches the
wiki before the DM approves it.

Decisions taken while designing:

- **both design ingests**: the initial one (all undated files of `raw/worldbuilding/`,
  before or around the start of play) and each dated file `YYYY-MM-DD-<slug>.md` written
  after play started (the Studio's **+ Prepare**);
- **separate queues**: sessions in order among themselves, design in order among
  themselves; neither blocks the other; still **one open ingest** in all;
- **short discussion** first: the agent lists the pages it will create or touch, flags
  contradictions with `established` pages, asks only real questions, waits for Proceed;
- **approach**: the session-only code becomes *sources* with a kind; state, staging,
  tools, review and apply stay as they are.

Out of scope: interlude and inherited-history ingests (later, on the same sources);
re-ingesting an applied design; re-ingesting undated files edited after the initial design
ingest; lint.

## 1. Sources

`ingest-sessions.ts` becomes `ingest-sources.ts`. A source has a kind, a safe id and the
files it reads:

| Kind | Id | Files | Ingested when `wiki/log.md`… |
|---|---|---|---|
| `session` | `session-03` | `raw/sessions/session-03.md` | contains `\| session-03]` or the file path (unchanged) |
| `design-initial` | `design-initial` | every `.md` under `raw/worldbuilding/` (subfolders included) except `README.md` and the files directly in it whose name starts with `YYYY-MM-DD` | has a line `## [<anything>] design — …` that names no dated `raw/worldbuilding/` file |
| `design` | `design-2026-10-20-the-frozen-north` | `raw/worldbuilding/2026-10-20-the-frozen-north.md` | contains `raw/worldbuilding/2026-10-20-the-frozen-north.md` |

- A dated file is a file directly in `raw/worldbuilding/` named `^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$`.
  A file directly in `raw/worldbuilding/` whose name starts with `YYYY-MM-DD` but doesn't
  match (e.g. `2026-10-20-Frozen North.md`) is listed
  with status `invalid-name` and can't be started: the DM renames it.
- `design-initial` exists only when there is at least one undated file.
- Ids crossing the API match `^(session-\d+|design-initial|design-\d{4}-\d{2}-\d{2}-[a-z0-9-]+)$`.
- `SourceInfo { id, kind, title, files: string[], status: 'not-ingested' | 'in-progress' | 'ingested' | 'invalid-name' }`;
  `title` is "Session 3", "Initial design", or the dated file's date and slug.
- **Order**: sessions in numeric order (unchanged); design: `design-initial` first when it
  exists and isn't ingested, then dated files by name (date order). `canStart(id)` refuses
  an unknown id, an ingested source, an invalid name, a source when another ingest is open
  (`<id> is in progress`), and a source whose earlier source *of the same queue* isn't
  ingested (`ingest <id> first`). The other queue never blocks.
- State keeps its folder: `.dm-second-brain/ingest/<id>/` (`state.json`, `staged/`);
  the ingest allow-list widens to the new ids.
- `sourceMtime` becomes `sourceStamp`: for one file its mtime; for `design-initial` a
  string of every file's path and mtime, so an edited, added or removed file changes it.
  States saved by 0.10 (with `sourceMtime`) still load and compare correctly.
- The Studio's item status (`isIngested(file)`) is unchanged: a Prepare becomes
  "ingested", hence read-only, once the log names its file.

## 2. The agent

- Same model, options, tools and phases as session ingest.
- The first message depends on the kind. It goes in the conversation, not the system
  prompt, so the cached system prompt is the same for every ingest:
  - session: unchanged;
  - design: "Design ingest of <files>. Start with the discussion.", followed by the
    DESIGN INGEST rules the app enforces or relies on:
    - new pages are born `canon_status: prepared` and `first_seen: design`;
    - events are not dated as having happened;
    - any part that contradicts an `established` page is not written, but listed in
      the discussion and again in the `finish` summary;
    - the log entry is exactly
      `## [design] design — <title> (raw/worldbuilding/<file>)`, or
      `(raw/worldbuilding/)` for the initial design.
- In the discussion the agent lists the pages it will create or touch, the
  contradictions it found, and only real questions, then waits for Proceed (as for
  sessions).
- `read_source(file)` accepts `source` (the material of this ingest): for a single file
  it returns the file; for `design-initial` it returns the list of files, read one by one
  with `source/<path>` (a path from that list only). `session` stays as an alias of
  `source`, so session ingests opened with 0.10 keep working. `world-bible`,
  `house-rules` and `srd/…` are unchanged.
- Extra write check for design kinds: a `write_page` that creates a page (no real file,
  not staged before) must have `canon_status: prepared` and `first_seen: design`;
  otherwise an error tool_result tells the agent what to fix. Existing pages may be
  updated (back-links, index); their content is the DM's call in the diff.
- Fallback log line on apply when the agent's log entry wasn't approved:
  `## [design] design — applied from the app (raw/worldbuilding/<file>)`, or
  `(raw/worldbuilding/)` for the initial design.

## 3. Interface and API

- `/ingest`:
  - the left column has two groups, **Sessions** and **Design**, each with its status
    marks (○ not ingested, ◐ in progress, ✓ ingested; invalid names greyed with a hint);
  - the URL is `?source=<id>`, and `?session=` still works;
  - the right column shows the material: the recap for a session, the file for a dated
    design, every file under a `### <path>` heading for the initial design;
  - chat, Proceed, review, diff and apply are unchanged.
- API:
  - `/api/ingest/:id` accepts the new ids, checked against the pattern above;
  - `GET /api/ingest` returns `sources: SourceInfo[]` instead of `sessions`, plus `open`
    and `terminalCommand` (for the first source not ingested);
  - `GET /api/ingest/:id/recap` becomes `GET /api/ingest/:id/source` → `{ text }`.
- Entry points:
  - the Studio's step 9 (Summary) adds "Ingest in the app" next to the terminal command,
    linking to `/ingest?source=design-initial`;
  - every written **+ Prepare** item adds "Ingest it now", linking to its source id.
- Without credentials the chat column shows the terminal command for the kind:
  - `claude "design ingest of raw/worldbuilding"` for the initial design;
  - `claude "design ingest of raw/worldbuilding/<file>"` for a dated file;
  - `claude "ingest raw/sessions/<file>"` for a session, as before.

## 4. Verification and release

- Vitest, with the fake model:
  - source listing and status: undated vs dated files, subfolders, `README.md` left
    out, invalid names;
  - initial-design detection from a terminal-style log line, and from the app's line;
  - queue order, independent queues, a single open ingest;
  - `read_source` of `source` and `source/<path>` (paths outside the list refused), and
    the `session` alias;
  - the `prepared`/`design` check on new pages, and existing pages left free;
  - the fallback log lines;
  - `sourceStamp` changing when a file is edited, added or removed, and 0.10 states
    still loading;
  - the API with the new ids and the `/source` route.
- Real runs in headless Chromium, about $1–2 of API in all:
  - an initial design ingest on a scratch campaign with a few worldbuilding files;
  - a dated file (the old mill) on the scratch Silverbrook after session 3.

  Each covers discussion, Proceed, review, apply, and the dashboard showing the
  `prepared` pages.
- An independent final review.
- Release: app 0.11.0, README (design ingest), CHANGELOG.
