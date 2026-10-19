# Session Ingest from the App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App 0.10.0: an `/ingest` page where an AI agent discusses a session recap with the DM, stages every wiki change, and writes nothing until the DM reviews and applies it.

**Architecture:** Pure modules first — session list and order, ingest state with a staging store, the agent's tools with write checks — then the agent loop (Messages API, app-defined tools, a fake model in tests), review/apply, API routes, and the page. The real `wiki/` is written in exactly one place: apply.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` for routes), React 19, TypeScript, `@anthropic-ai/sdk`, `gray-matter` (frontmatter checks), `diff` (new, line diffs in the review), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-app-ingest-design.md`

## Global Constraints

- Model `INGEST_MODEL` (default `claude-sonnet-5-5`); every call: `client.beta.messages.stream`, `betas: ["server-side-fallback-2026-07-01", "context-management-2025-06-27"]`, `fallbacks: "default"`, `thinking: { type: "adaptive" }`, `context_management: { edits: [{ type: "clear_tool_uses_20250919" }] }`, `max_tokens: 64000`. Credentials as the Studio (`ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `ant auth login`).
- State: `.dm-second-brain/ingest/session-NN/state.json` and `staged/` (mirror of `wiki/`, only touched files).
- Wiki paths the tools accept: `^[a-z0-9-]+(/[a-z0-9-]+)*\.md$` relative to `wiki/` (so `index.md`, `log.md` pass), no `..`.
- `read_source` files: `session` → this recap; `world-bible` → `raw/world-bible.md`; `house-rules` → `raw/house-rules.md`; `srd/<path>` → `raw/srd/<path>` with the same path rule.
- Phases: `discuss` → `working` → `review` → `applied` | `discarded`; write tools exist only in `working`.
- Round cap per exchange: 40 model calls.
- A session is ingested when `wiki/log.md` contains `| session-NN]` or `raw/sessions/session-NN.md`.
- One open ingest at a time; a session starts only when all earlier sessions are ingested.
- The real wiki is written only by `applyIngest`. Version 0.10.0.

## Review Focus

- The agent writes `index.md`/`log.md` that the DM also edits by hand meanwhile: apply must report the conflict, not overwrite. Test in Task 5.
- A move whose destination already exists in the real wiki (e.g. a quest moved to `quests/completed/` over a same-named page) must be refused at staging. Test in Task 3.
- `write_page` with frontmatter that YAML can't parse, or a `## Secrets (solo DM)`-style heading, is an error tool_result, not staged. Test in Task 3.
- The recap edited after the ingest started: the API reports it (`sourceChanged: true`). Test in Task 6.
- Approving a page that links to a rejected new page: warning before apply. Test in Task 5.

---

### Task 1: Sessions, status and order

**Files:** Create `src/app/utils/ingest-sessions.ts`; Test `tests/ingest-sessions.test.ts`

**Produces:**
- `interface SessionInfo { id: string /* "session-03" */; n: number; file: string /* raw/sessions/session-03.md */; status: 'not-ingested' | 'in-progress' | 'ingested' }`
- `listSessions(): SessionInfo[]` (numeric order; `in-progress` when `.dm-second-brain/ingest/<id>/state.json` has phase discuss/working/review)
- `isSessionIngested(id: string): boolean`
- `openIngest(): string | null` (the id of the ingest in progress)
- `canStart(id: string): { ok: true } | { ok: false; reason: string }` — reasons: unknown session, already ingested, another ingest open (`session-02 is in progress`), an earlier session not ingested (`ingest session-02 first`)

- [ ] Steps: failing tests (fixtures: sessions 01–04 files, log naming 01 by `| session-01]` and 02 by path, a state.json for 03 in `working`) → implement → pass → commit `feat: session list and ingest order`.

### Task 2: Ingest state and staging store

**Files:** Create `src/app/utils/ingest-state.ts`; Modify `src/app/utils/studio-steps.ts` (`resolveInCampaign` allow-list: `^\.dm-second-brain/ingest/session-\d+/(state\.json|staged/.+\.md)$` and `^wiki/[a-z0-9/-]+\.md$`); Test `tests/ingest-state.test.ts`

**Produces:**
- `type IngestPhase = 'discuss' | 'working' | 'review' | 'applied' | 'discarded'`
- `interface Change { path: string; kind: 'new' | 'changed' | 'moved'; from?: string; review: 'pending' | 'approved' | 'rejected'; note?: string }`
- `interface IngestState { id: string; phase: IngestPhase; messages: BetaMessageParam[]; changes: Change[]; summary: string | null; usage: { input: number; output: number; cacheRead: number }; sourceMtime: number; reads: Record<string, number>; rounds: number }`
- `isWikiPath(p: string): boolean`
- `newIngest(id: string): IngestState` (phase discuss, sourceMtime from the recap), `loadIngest(id): IngestState | null`, `saveIngest(s)`
- `readWikiPage(s, path): string | null` — staged first, then real; records `reads[path]` = real mtime on the first real read
- `stagePage(s, path, content): Change` — writes `staged/<path>`; kind `new` if no real file and not a move target, else `changed`; a rewrite resets `review` to `pending`
- `stageMove(s, from, to): Change` — copies current content (staged or real) to `staged/<to>`, records `{ kind: 'moved', from }`; refuses when `to` exists in the real wiki or is staged
- `stagedPaths(s): string[]`, `discardIngest(s)` (phase discarded, staged deleted)

- [ ] Steps: failing tests (path rule cases incl. `../x.md`, `Wiki/A.md`, `a/b.md`; staged-over-real read; reads recorded once; new vs changed; move and its refusal; rewrite resets review; discard) → implement → pass → commit `feat: ingest state and staging store`.

### Task 3: Tools and write checks

**Files:** Create `src/app/utils/ingest-tools.ts`; Test `tests/ingest-tools.test.ts`

**Consumes:** Task 2; `searchEntities` (DM mode) for `search_wiki`; `gray-matter`.
**Produces:**
- `INGEST_TOOLS: { read: BetaTool[]; write: BetaTool[] }` — read: `read_source`, `list_pages`, `search_wiki`, `read_page`; write: `write_page`, `move_page`, `append_log`, `finish`; all `strict: true`
- `toolsFor(phase: IngestPhase): BetaTool[]` (discuss → read; working → read + write; others → [])
- `runTool(s: IngestState, name: string, input: Record<string, string>): { content: string; isError?: boolean; staged?: Change; finished?: string }`
  - `list_pages(folder)` — real + staged paths under `folder` (`''` = all), one per line
  - `search_wiki(query)` — top 10 DM-mode hits + staged files containing the query (case-insensitive), as `path — title` lines
  - `write_page` checks: `isWikiPath`; for pages other than `index.md`/`log.md`, frontmatter parses (gray-matter) and has `type`; any `## ` heading containing "DM only" (case-insensitive) must be exactly `## Secrets (DM only)`
  - `append_log(line)` — line starts with `## [`; appended to staged `log.md` (starting from the real one)
  - `finish(summary)` — returns `finished`

- [ ] Steps: failing tests (each tool's output; write checks: bad path, unparseable YAML, missing type, `## Segreti (solo DM)`, valid page staged; append_log twice keeps both lines and the real log's content; move onto existing real page → error; `toolsFor('discuss')` has no write tools) → implement → pass → commit `feat: ingest tools with write checks`.

### Task 4: The agent loop

**Files:** Create `src/app/utils/ingest-agent.ts`, `src/app/utils/ingest-prompts.ts`; Modify `src/app/utils/studio-ai.ts` (mode `'ingest'` in `createAnthropicModel` → `INGEST_MODEL ?? 'claude-sonnet-5-5'`; `TurnParams` gains optional `contextEditing?: boolean` which adds the context-management beta + edits); Test `tests/ingest-agent.test.ts`

**Consumes:** Tasks 1–3; `StudioModel` from studio-ai.
**Produces:**
- `ingestSystem(): BetaTextBlockParam[]` — preamble (ingest-prompts) + campaign `CLAUDE.md` + `TEMPLATES.md` (missing → `fetchTemplatesMd()` from `https://raw.githubusercontent.com/<TEMPLATE_REPO>/<TEMPLATE_RELEASE>/TEMPLATES.md`, cached at `.dm-second-brain/TEMPLATES.md`); last block cached
- `type IngestEvent = { type: 'text'; text: string } | { type: 'staged'; change: Change } | { type: 'phase'; phase: IngestPhase } | { type: 'done'; usage: IngestState['usage'] } | { type: 'error'; message: string }`
- `startIngest(id, model, emit)` — `canStart` → `newIngest` → first discuss turn with the message "Ingest raw/sessions/<id>.md. Start with the discussion." 
- `runIngestTurn(id, input: { message?: string; proceed?: boolean; continue?: boolean }, model, emit)` — `proceed` sets phase working and sends "Proceed: make all the changes now, then call finish."; the loop runs while `stop_reason === 'tool_use'`, up to 40 rounds total per exchange; `finish` → phase review; cut-off/refusal/throw → error event, state as before the exchange (re-read-and-merge as the Studio)
- `requestChanges(id, model, emit)` — collects changes with `note`, sets phase working, sends the notes and paths, loops until `finish`

- [ ] Steps: failing tests with the Studio's `FakeModel` pattern (discuss turn exposes no write tools; proceed → write → finish → review; staged events; 40-round cap → error event and phase stays working; refusal leaves state; requestChanges sends the notes and only those paths; system includes CLAUDE.md text and fetched TEMPLATES.md via an injected fetcher) → implement → pass → commit `feat: ingest agent loop`.

### Task 5: Review and apply

**Files:** Create `src/app/utils/ingest-apply.ts`; Test `tests/ingest-apply.test.ts`

**Produces:**
- `setReview(s, path, review: 'approved' | 'rejected', note?: string)`, `approveAll(s)` (pending → approved), `askChanges(s, path, note)` (review stays pending, note set)
- `linkWarnings(s): { from: string; to: string }[]` — approved pages linking (frontmatter link fields or `[[slug…]]` in text) to a `new` change that is rejected
- `conflicts(s): string[]` — approved `changed`/`moved` paths (and `index.md`/`log.md`) whose real file mtime differs from `s.reads[path]`, or that were never read and exist
- `applyIngest(s, keepTheirs: string[] = []): { written: string[]; moved: { from: string; to: string }[] }` — refuses (409) if `conflicts` minus `keepTheirs` is non-empty; writes approved pages atomically to `wiki/`, performs approved moves, ensures the log names the session (fallback line from the spec), phase applied, deletes `staged/`

- [ ] Steps: failing tests (approve all; link warning; conflict after a hand edit; keepTheirs drops that change; apply writes, moves, keeps rejected out; fallback log line when log rejected; session becomes ingested; staged deleted; nothing outside `wiki/` written) → implement → pass → commit `feat: ingest review and apply`.

### Task 6: API routes

**Files:** Create `src/app/api/ingest/route.ts` (GET), `src/app/api/ingest/[id]/route.ts` (GET, PUT), `src/app/api/ingest/[id]/start/route.ts`, `.../chat/route.ts`, `.../apply/route.ts`, `.../discard/route.ts`, `.../changes/route.ts` (POST request changes), `.../page/route.ts` (GET `?path=` → `{ before, after }`); Test `tests/api-ingest.test.ts`

**HTTP:**
- `GET /api/ingest` → `{ aiAvailable, model, sessions: SessionInfo[], open: string | null, terminalCommand }`
- `GET /api/ingest/:id` → `IngestState` + `sourceChanged` + `linkWarnings` + `conflicts` (404 if none)
- `PUT /api/ingest/:id` `{ path, review?, note? }` or `{ approveAll: true }` → state
- `POST .../start`, `.../chat` `{ message? | proceed? | continue? }`, `.../changes` → NDJSON `IngestEvent` stream (503 without credentials; 409 from `canStart`)
- `POST .../apply` `{ keepTheirs?: string[] }` → `{ written, moved }` (409 with conflicts)
- `POST .../discard` → `{ ok: true }`
- `GET .../page?path=` → `{ before: string | null, after: string | null }` (real vs staged; path checked)
- `:id` must match `^session-\d+$`; 409 without a campaign.

- [ ] Steps: failing tests (handlers with the fake model) → implement → pass; `curl` checks on the dev server against a scratch campaign → commit `feat: ingest API`.

### Task 7: The ingest page and entry points

**Files:** Create `src/app/ingest/page.tsx`, `src/app/components/ingest/SessionList.tsx`, `IngestChat.tsx`, `ReviewPanel.tsx`, `DiffView.tsx`, `api.ts`; Modify `src/app/page.tsx` (after a successful save: "Ingest it now" link to `/ingest`), `src/app/components/CampaignMenu.tsx` ("Ingest sessions"; header link in `VAULT_PATH` mode), `src/app/globals.css`, `package.json` (`pnpm add diff`)

- [ ] Steps: three-column layout and narrow tabs as the Studio; chat with Proceed / Continue / Discard; live "✎ path" lines from `staged` events; ReviewPanel with grouped changes, Approve / Reject / Ask for changes (note), Approve all, link warnings, conflicts with keep-mine / take-theirs, Apply approved; DiffView with `diffLines` (added green, removed red, unchanged collapsed beyond 3 lines of context); no-credentials notice with the terminal command. Verify in headless Chromium without credentials (lists, notices) → commit `feat: ingest page`.

### Task 8: Real run, docs, release

**Files:** Modify `README.md`, `CHANGELOG.md`, `.env.example` (`# INGEST_MODEL=claude-sonnet-5-5`), `package.json` (0.10.0)

- [ ] **Step 1:** Scratch copy of Silverbrook with a written `raw/sessions/session-03.md` (the party returns to the crypt, meets a cultist of the Order, Hilda's tavern is vandalised). Real run in the browser: discussion with at least one question answered, Proceed, review (one Ask for changes, one rejection), Apply; check the wiki files, the log line, and the dashboard listing the new pages. Record tokens.
- [ ] **Step 2:** Docs; `pnpm test && pnpm lint && pnpm build`; commit `feat: session ingest from the app, version 0.10.0`; independent final review; PR.
