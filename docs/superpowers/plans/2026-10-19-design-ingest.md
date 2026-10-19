# Design Ingest from the App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App 0.11.0: the `/ingest` page also runs the template's DESIGN INGEST, for the initial design (undated `raw/worldbuilding/` files) and for each dated design file.

**Architecture:** The session-only module becomes *sources* with a kind (`session`, `design-initial`, `design`). State, staging, tools, review and apply keep working by source id. Kind-specific behaviour lives in the following places:
- the source module: files, done-detection, order, fallback log line and terminal command;
- the start message;
- one extra write check.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routes), React 19, TypeScript, `@anthropic-ai/sdk`, `gray-matter`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-design-ingest-design.md`

## Global Constraints

- Source ids match `^(session-\d+|design-initial|design-\d{4}-\d{2}-\d{2}-[a-z0-9-]+)$`. Only ids cross the API, never paths.
- File naming in `raw/worldbuilding/`:
  - a dated file sits directly in it and is named `^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$`;
  - a file there whose name starts with `\d{4}-\d{2}-\d{2}` but doesn't match is `invalid-name`;
  - initial-design files are every other `.md` under `raw/worldbuilding/`, subfolders included, except `README.md`.
- Done detection in `wiki/log.md`:
  - session: unchanged (`| session-NN]` or the file path);
  - dated design: the line names `raw/worldbuilding/<file>`;
  - initial design: a line matching `^## \[[^\]]*\] design —` that names no dated `raw/worldbuilding/YYYY-MM-DD-` file.
- Log lines:
  - agent's line: `## [design] design — <title> (raw/worldbuilding/<file>)`, or `(raw/worldbuilding/)` for the initial design;
  - fallback: `## [design] design — applied from the app (raw/worldbuilding/<file>)`, or `(raw/worldbuilding/)`.
- Order:
  - sessions in numeric order;
  - design: `design-initial` first (when it exists and isn't ingested), then dated files by name;
  - the two queues never block each other, and there is one open ingest in all.
- New pages in design ingests: `canon_status: prepared` and `first_seen: design`.
- Terminal commands:
  - `claude "design ingest of raw/worldbuilding"`;
  - `claude "design ingest of raw/worldbuilding/<file>"`;
  - `claude "ingest raw/sessions/<file>"`.
- States saved by 0.10 (`sourceMtime`, `read_source("session")`) keep working.
- Version 0.11.0.

## Review Focus

1. Initial-design files may have DM-chosen names (uppercase, spaces, subfolders): `read_source("source/<path>")` must read any listed file and refuse anything else (`source/../world-bible.md`, unlisted files). Test in Task 3.
2. A campaign with dated design files but no undated ones has no `design-initial`, and its dated files are not blocked. Test in Task 1.
3. A terminal-written initial line such as `## [design] design — World of Eldoria` marks the initial design done. A dated design line alone does not. Test in Task 1.
4. A session ingest left open by 0.10 (`sourceMtime`, no `sourceStamp`) must not report `sourceChanged` when nothing changed. Test in Task 2.
5. The design write check must refuse a new page with `canon_status: established` and still allow rewriting an existing `established` page. Test in Task 3.

---

### Task 1: Sources

**Files:**
- Create `src/app/utils/ingest-sources.ts`, replacing `src/app/utils/ingest-sessions.ts` (delete it and update its importers).
- Move `tests/ingest-sessions.test.ts` to `tests/ingest-sources.test.ts`.

**Produces:**
- `type SourceKind = 'session' | 'design-initial' | 'design'`
- `interface SourceInfo { id: string; kind: SourceKind; title: string; files: string[] /* campaign-relative */; status: 'not-ingested' | 'in-progress' | 'ingested' | 'invalid-name' }`
- `isSourceId(id: string): boolean` (the Global pattern)
- `kindOf(id: string): SourceKind`
- `listSources(): SourceInfo[]`: sessions first (numeric), then design (initial, then dated by name, then invalid names).
- `getSource(id: string): SourceInfo | null`
- `isSourceIngested(id: string): boolean`, `openIngest(): string | null`
- `canStart(id: string): { ok: true } | { ok: false; reason: string }`. The reasons are kept from 0.10, plus `<file> has an invalid name: rename it YYYY-MM-DD-<slug>.md`. "ingest <id> first" looks only at the same queue.
- `fallbackLogLine(id: string): string`, `terminalCommand(id: string): string` (without the `cd`)
- `INGEST_DIR` is re-exported unchanged.
- Titles: `Session 3`, `Initial design`, `2026-10-20 · the-frozen-north`.

- [ ] **Step 1: Write the failing tests.** Move the session tests over unchanged, then add:
  - `lists undated files (subfolders too, README out) as the initial design and dated files in date order`:
    - fixtures: `raw/worldbuilding/regions.md`, `lore/Old Gods.md`, `README.md`, `2026-10-20-the-frozen-north.md`, `2026-10-05-the-old-mill.md`, `2026-10-21-Bad Name.md`;
    - expect design ids `['design-initial', 'design-2026-10-05-the-old-mill', 'design-2026-10-20-the-frozen-north', 'design-invalid-0']`;
    - the last one has status `invalid-name`, `files: ['raw/worldbuilding/2026-10-21-Bad Name.md']`, and `canStart` refuses it;
    - initial `files` equals `['raw/worldbuilding/lore/Old Gods.md', 'raw/worldbuilding/regions.md']`.
  - `detects the initial design from a terminal log line, not from a dated one`:
    - a log with `## [design] design — Frozen (raw/worldbuilding/2026-10-20-the-frozen-north.md)` leaves `design-initial` not ingested and marks that dated file ingested;
    - adding `## [design] design — World of Eldoria` marks the initial design ingested.
  - `keeps queues separate`:
    - with session-01 not ingested and design-initial not ingested, `canStart('design-initial')` is ok;
    - `canStart('design-2026-10-05-the-old-mill')` is `{ ok: false, reason: 'ingest design-initial first' }`;
    - with an open `design-initial` state (phase working), `canStart('session-01')` is `{ ok: false, reason: 'design-initial is in progress' }`.
  - `has no initial design without undated files`: only dated files, so the first dated file can start.
  - `fallback lines and terminal commands`: exact strings from the Global Constraints, for one id of each kind.
- [ ] **Step 2:** Run `npx vitest run tests/ingest-sources.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the module. Then switch the importers (`ingest-state`, `ingest-tools`, `ingest-agent`, `ingest-apply`, the `api/ingest` routes, `components/ingest/api.ts`) from `isSessionIngested`/`sessionFile` to `isSourceIngested`/`getSource(id).files`, with no behaviour change for sessions.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: ingest sources with kinds`.

> Invalid names: give each one the id `design-invalid-<index>`. It is listed for display only, and `isSourceId` rejects it, so it can never be started or reach the API as an ingest id.

### Task 2: State by source

**Files:** Modify `src/app/utils/ingest-state.ts`; Test `tests/ingest-state.test.ts`

**Consumes:** Task 1 `getSource`, `INGEST_DIR`.

**Produces:**
- `IngestState.sourceStamp: string`. `sourceMtime?: number` stays optional, for states saved by 0.10.
- `sourceStampOf(id: string): string`:
  - one file: its mtime as a string;
  - the initial design: `path:mtime` lines over the sorted files.
- `sourceChanged(s: IngestState): boolean`: compares `sourceStamp`, or, for a 0.10 state, `sourceMtime` with the recap's mtime.
- The ingest allow-list accepts `.dm-second-brain/ingest/<any valid source id>/…`.

- [ ] **Step 1:** Write the failing tests:
  - `stamps the initial design so an edit, an addition or a removal changes it`;
  - `a 0.10 state with sourceMtime only is unchanged when the recap is` (Review Focus 4);
  - `stores design ingests under their id` (`newIngest('design-initial')` writes `.dm-second-brain/ingest/design-initial/state.json`).
- [ ] **Step 2:** Run `npx vitest run tests/ingest-state.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. `newIngest(id)` sets `sourceStamp`. The GET route switches to `sourceChanged(s)` in Task 5.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: ingest state for every source kind`.

### Task 3: Tools for design

**Files:** Modify `src/app/utils/ingest-tools.ts`; Test `tests/ingest-tools.test.ts`

**Consumes:** Task 1 `getSource`, `kindOf`.

**Behaviour:**
- `read_source`:
  - `source` returns the file for a single-file source, and for `design-initial` a list (`raw/worldbuilding/<path>` per line, with a note to read each with `source/<path>`);
  - `source/<path>` reads a file only if `raw/worldbuilding/<path>` is in the source's `files`;
  - `session` is an alias of `source`;
  - the tool description names `source`.
- `write_page`: in design kinds, a page with no real file and no change yet must have `canon_status: prepared` and `first_seen: design`. The error says exactly which field to set.

- [ ] **Step 1:** Write the failing tests:
  - `reads the initial design file by file, and nothing outside the list` (Review Focus 1):
    - `source` lists `raw/worldbuilding/lore/Old Gods.md`;
    - `source/lore/Old Gods.md` returns its text;
    - `source/../world-bible.md`, `source/2026-10-05-the-old-mill.md` and `source/missing.md` are errors.
  - `keeps "session" as an alias`.
  - `requires new design pages to be prepared and from design` (Review Focus 5):
    - in a `design-initial` ingest, a new page with `canon_status: established` is an error naming `canon_status: prepared`;
    - a new page missing `first_seen` is an error naming `first_seen: design`;
    - a valid one is staged;
    - rewriting an existing `established` page after `read_page` is staged;
    - in a session ingest, a new `established` page is still accepted.
- [ ] **Step 2:** Run `npx vitest run tests/ingest-tools.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: ingest tools for design sources`.

### Task 4: Agent start message and apply fallback

**Files:**
- Modify `src/app/utils/ingest-prompts.ts`, `src/app/utils/ingest-agent.ts`, `src/app/utils/ingest-apply.ts`.
- Tests: `tests/ingest-agent.test.ts`, `tests/ingest-apply.test.ts`.

**Consumes:** Task 1 `getSource`, `fallbackLogLine`, `isSourceIngested`.

**Produces:**
- `startMessage(source: SourceInfo): string`:
  - sessions: unchanged;
  - design: `Design ingest of <files joined by ", ">. Start with the discussion.`, then a "Rules for this design ingest:" list with the four rules of spec §2, the log line format, and "In the discussion: the pages you will create or touch, the contradictions with established pages, then only real questions."
- The preamble drops "session"-only wording where it would be wrong for design (e.g. "the session calls for" becomes "the material calls for"). The system prompt stays the same for every kind.
- `applyIngest` uses `isSourceIngested` and `fallbackLogLine`.

- [ ] **Step 1:** Write the failing tests:
  - `starts a design ingest with the design rules`: the first user message contains `Design ingest of raw/worldbuilding/regions.md`, `canon_status: prepared`, `first_seen: design` and `## [design] design —`; the system prompt equals the one of a session ingest.
  - `adds the design fallback line when the log was rejected`: `design-2026-10-05-the-old-mill` applied with the log rejected leaves the exact fallback line, and `isSourceIngested` is true.
- [ ] **Step 2:** Run `npx vitest run tests/ingest-agent.test.ts tests/ingest-apply.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: design ingest prompts and log fallback`.

### Task 5: API

**Files:**
- Modify:
  - `src/app/api/ingest/common.ts` (`parseId` uses `isSourceId`);
  - `src/app/api/ingest/route.ts` (`sources`, `terminalCommand`);
  - `src/app/api/ingest/[id]/route.ts` (`sourceChanged(s)`).
- Move `src/app/api/ingest/[id]/recap/route.ts` to `src/app/api/ingest/[id]/source/route.ts`:
  - it returns `{ text }`;
  - for the initial design it returns each file under `### <path>`, separated by a blank line.
- Test: `tests/api-ingest.test.ts`.

**HTTP:** `GET /api/ingest` returns `{ aiAvailable, model, sources: SourceInfo[], open, terminalCommand }`. `terminalCommand` is `cd '<root>' && ` + `terminalCommand(id)` of the first source not ingested.

- [ ] **Step 1:** Update the existing tests to `sources` and `/source`, then add:
  - `runs a design ingest through the API`: start `design-initial`, proceed, finish, apply; afterwards the source is `ingested`;
  - `rejects ids outside the pattern`: `design-../x`, `design-invalid-0`, `design-2026-1-1-x` are 400;
  - `shows the initial design material`: the `/source` text contains `### raw/worldbuilding/regions.md`.
- [ ] **Step 2:** Run `npx vitest run tests/api-ingest.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Run the `curl` checks of `GET /api/ingest` and `/source` on a scratch copy of the repo (the user's dev server holds this repo's `.next`).
- [ ] **Step 6:** Commit: `feat: ingest API for design sources`.

### Task 6: Page and Studio entry points

**Files:**
- Rename `src/app/components/ingest/SessionList.tsx` to `SourceList.tsx`.
- Modify:
  - `src/app/components/ingest/api.ts`, `IngestChat.tsx` (title per kind, "Start ingest");
  - `src/app/ingest/page.tsx` (`?source=`, `?session=` alias, the material panel);
  - `src/app/components/studio/SummaryStep.tsx` ("Ingest in the app" link to `/ingest?source=design-initial`);
  - `src/app/components/studio/DraftPanel.tsx` ("Ingest it now" link for written Prepare items, to `/ingest?source=design-<file name without .md>`);
  - `src/app/globals.css` (group headings, invalid name).

- [ ] **Step 1:** Implement:
  - SourceList with two groups, Sessions and Design, with marks ○ ◐ ✓;
  - invalid names greyed, with the hint `Rename to YYYY-MM-DD-<slug>.md`;
  - the material panel titled "Recap" or "Design material";
  - the Studio links.
- [ ] **Step 2:** Export `idForItemFile(file: string): string | null` from `api.ts` (for `raw/worldbuilding/2026-10-05-the-old-mill.md` it returns `design-2026-10-05-the-old-mill`; for an interlude, null), with a test in `tests/ingest-chat.test.ts`. Run it: FAIL, then PASS.
- [ ] **Step 3:** Run `npx vitest run && npx tsc --noEmit -p . && pnpm lint`. Expected: all pass, no lint errors.
- [ ] **Step 4:** In headless Chromium, without credentials, on a scratch campaign with sessions and worldbuilding files, at 1400px and 390px, check:
  - both groups and their marks;
  - the material panel of the initial design;
  - the terminal command for the kind;
  - the Studio Summary link.
- [ ] **Step 5:** Commit: `feat: design sources on the ingest page and Studio links`.

### Task 7: Real runs, docs, release

**Files:** Modify `README.md` (Session ingest section becomes "Ingest: sessions and design"), `CHANGELOG.md` (0.11.0), `package.json` (0.11.0).

- [ ] **Step 1:** Initial design ingest in headless Chromium, on a scratch campaign with `raw/world-bible.md`, `regions.md`, `factions.md`, `npcs.md` and `starting-point.md` (a small homebrew world). Cover the discussion, Proceed and the review. Check that:
  - every new page is `prepared` with `first_seen: design`;
  - the log line is `(raw/worldbuilding/)`;
  - the source shows as ingested and the dashboard lists the pages.

  Record the tokens.
- [ ] **Step 2:** Dated design on the scratch Silverbrook after session 3: `raw/worldbuilding/2026-10-19-the-old-mill.md` (the mill where the grey hood ran, an Order hideout). Cover discussion, review and apply. Check that:
  - the established pages are touched only for links;
  - the Studio would show the item as ingested;
  - the log names the file.
- [ ] **Step 3:** Docs. Then run `pnpm test && pnpm lint && pnpm build`. Commit: `feat: design ingest from the app, version 0.11.0`. Then the independent final review and the PR.
