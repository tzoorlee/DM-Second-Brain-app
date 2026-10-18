# World Studio (Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App 0.7.0: a `/studio` page where the DM builds the campaign's world in 9 steps, each a chat with Claude next to a live draft; approved drafts are written to `raw/`; the SRD is downloaded on request.

**Architecture:** Pure file logic first (world-bible section editor, step definitions and writers, Studio state, SRD download), each unit-tested; then an AI layer behind a small `StudioModel` interface (real implementation with `@anthropic-ai/sdk`, fake in tests); then API routes; then the page. The AI never writes files: it emits proposals and inconsistency reports the DM accepts.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing routes or pages), React 19, TypeScript, `@anthropic-ai/sdk` (new), `zod` (new, for structured outputs), Vitest, existing `tar`.

**Spec:** `docs/superpowers/specs/2026-10-18-world-studio-design.md` (section B)

## Global Constraints

- Model `claude-opus-5`, overridable with `STUDIO_MODEL`. Credentials: `new Anthropic()` default chain only; never read or log keys.
- Every model call: `client.beta.messages.*` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`; `thinking: { type: "adaptive" }`; chat uses streaming (`max_tokens: 64000`); handle `stop_reason: "refusal"` (show "The model declined this request" in the chat).
- The browser sends step numbers and text, never paths. The app writes only: `raw/world-bible.md` (by section), `raw/house-rules.md`, `raw/worldbuilding/<topic>.md`, `raw/worldbuilding/starting-point.md`, `raw/srd/**`, `.dm-second-brain/studio/*.json`, and the two configuration lines of `CLAUDE.md`. Never `wiki/`.
- World-bible contract headings (English, exact): `Campaign`, `Setting`, `Tone and Atmosphere`, `Lore Pillars (immutable truths)`, `Naming Conventions`, `Basic Geography`, `Cosmology`, `Things that do NOT exist in this world`, `Style notes for the agent` — in this order.
- **Ruling (decided at planning):** the bold labels inside `## Campaign` and `## Setting` are also a contract: `Name`, `Output language`, `Starting level`, `Rules edition`, `Start date in the world`, `World`, `Sources`, `Deviations from the published canon`, written `- **<Label>**: <value>`.
- SRD sources, pinned by commit:
  - `5.1` → `oldmanumby/dnd.srd.5.1` tag `v0.5.2`, commit `7c343e598583f92bc74f80b197e40bdb20b165f1`;
  - `5.2.1` → `oldmanumby/dnd.srd.5.2.1` tag `v26.05.12.14`, commit `e1d005dfbb15e3db966037431abdba4ee4c2b692`.
  Keep only `Legal.md` and `.md` files under top-level folders matching `^\d\d_`; download cap 50 MB.
- `TEMPLATE_RELEASE` → `v0.6.0`. Version 0.7.0. UI copy in English.

## Step table (used by Tasks 2, 5, 7)

| # | id | Title | Target | Owns |
|---|---|---|---|---|
| 1 | `basics` | Basics | world-bible | `Campaign`, `Setting` (+ CLAUDE.md config lines) |
| 2 | `tone` | Tone and pillars | world-bible | `Tone and Atmosphere`, `Lore Pillars (immutable truths)`, `Things that do NOT exist in this world`, `Style notes for the agent` |
| 3 | `world` | Geography and cosmology | world-bible | `Basic Geography`, `Cosmology` |
| 4 | `names` | Naming conventions | world-bible | `Naming Conventions` |
| 5 | `rules` | House rules | `raw/house-rules.md` | whole file |
| 6 | `srd` | Rules reference (SRD) | `raw/srd/` | download; `Rules edition` line |
| 7 | `worldbuilding` | Worldbuilding | `raw/worldbuilding/<topic>.md` | draft has `## Regions`, `## Cities`, `## Factions`, `## NPCs`, `## Deities`, `## Lore`; each non-empty section → `regions.md`, `cities.md`, `factions.md`, `npcs.md`, `deities.md`, `lore.md` |
| 8 | `start` | Starting point | `raw/worldbuilding/starting-point.md` | whole file |
| 9 | `summary` | Summary | — | final coherence check, design-ingest command |

## Review Focus

- A world-bible edited by hand (extra blank lines, a custom `## Factions overview` section, CRLF line endings) must keep every byte outside the step's own sections. Test in Task 1.
- A world-bible missing a contract heading (older campaign) gets it inserted at its contract position, not appended at the end. Test in Task 1.
- Two browser tabs approving different steps at once must not lose either write (world-bible read-modify-write). Test in Task 2 (sequential writes keep both; writes are atomic temp+rename).
- The model calling `propose_edit` for a section the step doesn't own (e.g. step 4 proposing `Cosmology`) is rejected with a tool_result error, not applied. Test in Task 5.
- A stream interrupted mid-answer (network drop, refusal) leaves the step state valid and the draft untouched. Test in Task 5 (fake model throwing mid-stream).

---

### Task 1: World-bible section editor

**Files:** Create `src/app/utils/worldbible.ts`; Test `tests/worldbible.test.ts`

**Interfaces — Produces:**
- `WORLD_BIBLE_HEADINGS: readonly string[]` (contract order)
- `CAMPAIGN_LABELS`, `SETTING_LABELS: readonly string[]`
- `getSections(markdown: string, headings: string[]): Record<string, string>` — body of each `## <heading>` (text up to the next `## `), `''` when missing
- `replaceSections(markdown: string, bodies: Record<string, string>): string` — replaces only those sections' bodies; missing contract headings are inserted before the next contract heading present (or at the end); everything else byte-identical; preserves the file's line ending style
- `getField(markdown: string, heading: 'Campaign'|'Setting', label: string): string | null`
- `setField(markdown: string, heading, label, value): string` — replaces `- **<label>**: …` (adds it at the end of the section when missing)
- `addDeviation(markdown: string, text: string): string` — appends `  - <text>` under the Deviations label, dropping a `(none)` / placeholder line

- [ ] **Step 1: Failing tests** — fixtures inline: the template world-bible text; a hand-edited one (custom `## Factions overview` between contract sections, two blank lines, CRLF). Cases: get existing/missing; replace keeps other bytes (compare the untouched slices exactly); insert missing `## Cosmology` lands after `## Basic Geography`; CRLF stays CRLF; `getField('Campaign','Name')`; `setField` existing and missing label; `addDeviation` replacing the placeholder, then appending a second.
- [ ] **Step 2:** `pnpm test tests/worldbible.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Split by lines; a section starts at a line equal to `## <heading>` (trimmed of `\r`).
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5: Commit** — `feat: world-bible section editor`

### Task 2: Steps and campaign files

**Files:** Create `src/app/utils/studio-steps.ts`; Test `tests/studio-steps.test.ts`

**Interfaces — Consumes:** Task 1; `getCampaignRoot()`, `CampaignError` (409 when no campaign is open).
**Produces:**
- `STUDIO_STEPS: { n: number; id: string; title: string; kind: 'worldbible'|'file'|'worldbuilding'|'srd'|'summary'; headings?: string[]; file?: string }[]` (the step table)
- `readStepContent(n: number): string` — current text for the draft: the step's world-bible sections (as `## ` blocks), the file, or the worldbuilding topics joined as `## <Topic>` sections; `''` for srd/summary
- `writeStepContent(n: number, draft: string): string[]` — writes per the table; returns the relative paths written; worldbuilding writes only non-empty topics; step 1 also updates `CLAUDE.md` lines `> - **Output language:** <value>` and `> - **Campaign name:** <value>` from the draft's Campaign fields
- `campaignHasSessions(): boolean` (`raw/sessions/session-*.md` exists)
- `writeFileAtomic(abs: string, text: string)` and `resolveInCampaign(rel: string): string` (throws on `..`/absolute/outside the allowed list in Global Constraints)

- [ ] **Step 1: Failing tests** on a temp campaign (`makeCampaign` + a `raw/world-bible.md` from the template text, `CLAUDE.md` with the two config lines): read/write each kind; step 2 write leaves `## Campaign` untouched; step 7 with `## Factions` only writes `factions.md`; step 1 updates both CLAUDE.md lines; two sequential writes (steps 2 then 4) both survive; `resolveInCampaign('../x')` and `('wiki/a.md')` throw; `campaignHasSessions`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat: Studio steps read and write campaign files`

### Task 3: Studio state

**Files:** Create `src/app/utils/studio-state.ts`; Test `tests/studio-state.test.ts`

**Produces:**
- `type StepStatus = 'todo'|'in-progress'|'approved'`
- `interface Proposal { id: string; section: string; newText: string; reason: string; status: 'pending'|'accepted'|'rejected' }`
- `interface Inconsistency { id: string; file: string; quote: string; problem: string; proposedFix: string; severity: 'error'|'warning'; status: 'open'|'fixed'|'kept' }`
- `interface StepState { n: number; status: StepStatus; draft: string | null; messages: Anthropic.Beta.Messages.BetaMessageParam[]; proposals: Proposal[]; inconsistencies: Inconsistency[]; usage: { input: number; output: number; cacheRead: number } }`
- `loadStep(n): StepState` (defaults when missing or corrupt), `saveStep(state): void` (atomic, under `.dm-second-brain/studio/step-<n>.json`), `listSteps(): StepState[]`

- [ ] Steps 1–5 as above (tests: defaults, round-trip, corrupt JSON → defaults, file location, no file outside `.dm-second-brain/studio/`). Commit — `feat: Studio state saved in the campaign`

### Task 4: SRD download

**Files:** Create `src/app/utils/srd.ts`; Test `tests/srd.test.ts`

**Interfaces — Consumes:** `extractTemplate`-style filtering approach from `template.ts` (write a sibling extractor; don't change the template filter), Task 1 `setField`, Task 2 `writeFileAtomic`.
**Produces:**
- `SRD_SOURCES: Record<'5.1'|'5.2.1', { repo: string; tag: string; commit: string; label: string }>`
- `isAllowedSrdPath(rel: string): boolean` (`Legal.md`, or `^\d\d_[^/]+/.+\.md$`, no `..`, no backslash)
- `downloadSrd(edition: '5.1'|'5.2.1', download?: (url: string) => Promise<Buffer>): Promise<{ files: number }>` — URL `https://codeload.github.com/<repo>/tar.gz/<commit>`; extracts into `raw/srd/.downloading-<rand>` then swaps with `raw/srd/` keeping `raw/srd/README.md`; writes `raw/srd/ATTRIBUTION.md` (the repo's Legal.md attribution sentence for that edition + source repo/commit); sets world-bible `Rules edition` to `SRD 5.1` / `SRD 5.2.1`
- `setNoSrd(): void` — `Rules edition: none`, touches nothing in `raw/srd/`

- [ ] **Step 1: Failing tests** with a fixture tarball (top folder, `01_Races/Elf.md`, `docs_original/x.pdf`, `Legal.md`, a symlink, `README.md`): only allowed files land; `README.md` of `raw/srd/` preserved; `ATTRIBUTION.md` written; world-bible field set; failure leaves the previous `raw/srd/` intact and no `.downloading-*`; over-cap → `CampaignError` 502.
- [ ] Steps 2–4. **Step 5: one-off real download** of both editions into a scratch campaign (a throwaway test file, deleted after), record file counts in the ledger. **Commit** — `feat: SRD download pinned to two markdown conversions`

### Task 5: AI layer

**Files:** Create `src/app/utils/studio-ai.ts`, `src/app/utils/studio-prompts.ts`; Modify `package.json` (`pnpm add @anthropic-ai/sdk zod`); Test `tests/studio-ai.test.ts`

**Interfaces — Consumes:** Tasks 1–3; `searchEntities` (DM mode) for wiki context.
**Produces:**
- `interface StudioModel { streamTurn(params: Anthropic.Beta.Messages.MessageCreateParamsStreaming, onText: (t: string) => void): Promise<Anthropic.Beta.Messages.BetaMessage>; checkCoherence(params): Promise<Inconsistency[]>; available(): Promise<boolean> }`
- `createAnthropicModel(): StudioModel` — `new Anthropic()`, model from `STUDIO_MODEL ?? 'claude-opus-5'`, fallbacks/betas/thinking per Global Constraints; `available()` = `client.models.retrieve(model)` succeeds, cached 5 minutes; `checkCoherence` uses `client.beta.messages.parse` (or `create` with `output_config.format`) with a zod schema `{ issues: [{ file, quote, problem, proposedFix, severity }] }`
- `STUDIO_TOOLS` — `propose_edit { section: string, new_text: string, reason: string }` and `report_inconsistency { file: string, quote: string, problem: string, proposed_fix: string, severity: "error"|"warning" }`, both `strict: true`, `additionalProperties: false`
- `buildSystem(n: number): Anthropic.Beta.Messages.BetaTextBlockParam[]` — role + step brief (from `studio-prompts.ts`: goal, owned sections, 3–5 guiding questions per step; published-setting variant for steps 2–4, 7) + fixed-marker rule; last block `cache_control: { type: "ephemeral" }`
- `buildContext(n: number, message: string): string` — world-bible, house-rules, approved steps' files, `raw/setting/` file list; when `campaignHasSessions()`: `wiki/index.md` + top 5 DM-mode search hits for `message` (title + body)
- `runChatTurn(n: number, message: string, model: StudioModel, emit: (e: StudioEvent) => void): Promise<StepState>` — appends the user message (context as a first text block, message second), loops while `stop_reason === 'tool_use'`: `propose_edit` for a section the step owns → Proposal (pending) + tool_result "Shown to the DM as a pending proposal."; for another section → `is_error` tool_result "Step <n> can only edit: …"; `report_inconsistency` → Inconsistency (open) + tool_result "Shown to the DM."; saves state after every model message; on throw/refusal emits `error` and leaves draft and earlier messages unchanged
- `type StudioEvent = { type: 'text'; text: string } | { type: 'proposal'; proposal: Proposal } | { type: 'inconsistency'; inconsistency: Inconsistency } | { type: 'done'; usage: StepState['usage'] } | { type: 'error'; message: string }`
- `approveStep(n: number, draft: string, model: StudioModel | null, skipCheck: boolean): Promise<{ written: string[] } | { issues: Inconsistency[] }>` — with a model and `!skipCheck`, runs `checkCoherence` on draft + approved files + wiki context; open issues → returned, nothing written; else `writeStepContent`, status `approved`

- [ ] **Step 1: Failing tests** with a fake `StudioModel` scripted per test: text-only answer streams and saves; `propose_edit` owned → pending proposal + tool_result; not owned → is_error result and no proposal; `report_inconsistency` → open inconsistency; fake throws after one delta → `error` event, draft unchanged, state file valid; `approveStep` with issues writes nothing, with `skipCheck` writes; `buildContext` includes wiki hits only after a session exists; `buildSystem` has `cache_control` on the last block only.
- [ ] Steps 2–4. **Step 5: Commit** — `feat: Studio AI layer with proposals, inconsistencies and approval check`

### Task 6: API routes

**Files:** Create `src/app/api/studio/route.ts` (GET), `src/app/api/studio/steps/[n]/route.ts` (GET, PUT), `src/app/api/studio/chat/route.ts` (POST, streaming), `src/app/api/studio/steps/[n]/approve/route.ts` (POST), `src/app/api/studio/srd/route.ts` (POST), `src/app/api/studio/deviations/route.ts` (POST); Test `tests/api-studio.test.ts`

**HTTP — Produces:**
- `GET /api/studio` → `{ aiAvailable, model, hasSessions, steps: [{ n, id, title, status }] }`
- `GET /api/studio/steps/:n` → `StepState` with `draft ?? readStepContent(n)`; `PUT` `{ draft?, proposalId?, proposalStatus?, inconsistencyId?, inconsistencyStatus? }` → updated state (accepting a proposal replaces that section in the draft)
- `POST /api/studio/chat` `{ n, message }` → `Content-Type: application/x-ndjson`, one `StudioEvent` per line; `503` `{ error }` when the AI isn't available
- `POST /api/studio/steps/:n/approve` `{ skipCheck?: boolean }` → `{ written }` or `{ issues }`
- `POST /api/studio/srd` `{ edition: '5.1'|'5.2.1'|'none' }` → `{ files }`
- `POST /api/studio/deviations` `{ text }` → `{ ok: true }` (calls `addDeviation`)
- All: `409` without an open campaign, `400` for an invalid `n`/body; routes use the injected model factory from Task 5 (tests swap in the fake).

- [ ] Steps: failing tests (handlers called directly, fake model, temp campaign) → implement → pass. Verify the NDJSON stream with `curl -N` on the dev server against a scratch campaign (no credentials → 503 is the expected answer). **Commit** — `feat: Studio API`

### Task 7: The Studio page

**Files:** Create `src/app/studio/page.tsx`, `src/app/components/studio/StepList.tsx`, `StudioChat.tsx`, `DraftPanel.tsx`, `BasicsForm.tsx`, `RulesChecklist.tsx`, `SrdStep.tsx`, `SummaryStep.tsx`; Modify `src/app/globals.css`

**Interfaces — Consumes:** the HTTP API of Task 6.

- [ ] **Step 1:** Layout per spec B.5: three columns (Steps / Chat / Draft), tabs under 900 px; StepList with ○ ● ✓, each step's token usage (input/output, from `StepState.usage`), and disabled "Prepare"/"Interlude" ("after your first session — coming soon"); the AI-unavailable notice ("Set ANTHROPIC_API_KEY in .env.local or run `ant auth login`, then reload") hides the chat.
- [ ] **Step 2:** Chat: reads the NDJSON stream with `response.body.getReader()`, renders text as it arrives, proposal and inconsistency cards inline; inconsistency card buttons: "Fix here" (marks fixed, focuses the draft), "Fix the other file" (opens that step with the fix pre-filled as a pending proposal), "Keep" (warning) / "Keep as deviation" (published or mixed setting → `POST /api/studio/deviations`).
- [ ] **Step 3:** DraftPanel: editable textarea of the step's sections; pending proposals listed above it with section, new text and ✓/✗; **Approve step** → approve API; issues → shown as cards, then "Approve anyway" (`skipCheck`). Unsaved-draft guard (`beforeunload`).
- [ ] **Step 4:** BasicsForm (name, language, world type, published name, sources, starting level → writes the `## Campaign`/`## Setting` fields into the draft); RulesChecklist (8 common variants: crits max+roll, 1-hour short rest, lingering injuries, flanking, potion as bonus action, point buy 27, feat at level 1, slow natural healing — checked items become lines in the draft); SrdStep (three options + Download with a spinner and result); SummaryStep (files written, final check button, the command `cd "<campaign path>" && claude "design ingest of raw/worldbuilding"` with a Copy button).
- [ ] **Step 5: Verify** in headless Chromium on a scratch campaign (backup/restore `.env.local`): without credentials → notice, draft editing and approve work, files written; step 6 "none"; screenshots wide and 390 px. **Commit** — `feat: World Studio page`

### Task 8: Entry points, release, end-to-end

**Files:** Modify `src/app/components/CampaignMenu.tsx`, `src/app/components/CampaignPicker.tsx`, `src/app/page.tsx`, `src/app/utils/vault.ts` (`TEMPLATE_RELEASE = 'v0.6.0'`), `tests/template.test.ts`, `README.md`, `CHANGELOG.md`, `.env.example` (`# STUDIO_MODEL=claude-opus-5`, `# ANTHROPIC_API_KEY=`), `package.json` (0.7.0)

- [ ] **Step 1:** Failing test: `templateArchiveUrl` → `v0.6.0`; implement.
- [ ] **Step 2:** "World Studio" in the campaign menu (and a header link in `VAULT_PATH` mode); after creating a campaign, the picker asks "Prepare the world now?" (Yes → `/studio`, Later → reload).
- [ ] **Step 3: End-to-end with real credentials** (`ant auth status` or `ANTHROPIC_API_KEY`; if none, ask the DM before this step): scratch campaign, step 2 chat → a proposal arrives, accept, approve → `raw/world-bible.md` changed only in step 2's sections; an inconsistent step 4 ("names are Japanese" vs a pillar saying "no eastern cultures") → an inconsistency card. Record token usage.
- [ ] **Step 4:** README (World Studio, credentials, costs, privacy: drafts and conversations stay in `.dm-second-brain/`; content is sent to Anthropic), CHANGELOG 0.7.0; `pnpm test && pnpm lint && pnpm build`.
- [ ] **Step 5: Commit** — `feat: World Studio, version 0.7.0`; push; PR to `main` (the spec commit is already on this branch).
