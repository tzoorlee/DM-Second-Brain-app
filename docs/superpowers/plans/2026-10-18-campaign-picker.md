# Campaign Picker and Campaign Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the DM list, open and create campaigns from the app (setup screen and a dashboard menu), with campaigns kept in one `CAMPAIGNS_DIR` folder.

**Architecture:** `vault.ts` resolves the open campaign (`VAULT_PATH` first, else the id in `CAMPAIGNS_DIR/.active-campaign.json`) and keeps `getCampaignRoot()` unchanged for the rest of the app. `campaigns.ts` lists, activates and creates campaigns; `template.ts` downloads and safely extracts the pinned template release. Two API routes expose this; the setup screen and a dashboard menu use them and reload the page after a switch.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing route code, per `AGENTS.md`), React 19, TypeScript, `tar` (new dependency), Vitest (new dev dependency), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-18-campaign-picker-design.md`

## Global Constraints

- `VAULT_PATH`, when set, wins over `CAMPAIGNS_DIR` and behaves exactly as in 0.4.0; in that mode `POST` campaign endpoints answer `409`.
- Campaign id pattern: `^[a-z0-9][a-z0-9-]*$`, max 64 characters; name max 80 characters.
- Active campaign file: `CAMPAIGNS_DIR/.active-campaign.json`, content `{ "id": "<id>" }`.
- Template: `TEMPLATE_REPO = 'tzoorlee/DM-Second-Brain'`, `TEMPLATE_RELEASE = 'v0.4.0'`, URL `https://codeload.github.com/${TEMPLATE_REPO}/tar.gz/refs/tags/${TEMPLATE_RELEASE}`, download timeout 30 s.
- Kept from the archive: `CLAUDE.md`, `dm-second-brain.json`, `.gitignore`, and the `wiki/`, `raw/`, `output/` trees. Nothing else; no links.
- Temporary folder: `CAMPAIGNS_DIR/.creating-<id>-<random>`; names starting with `.` are never listed as campaigns.
- New campaign's `wiki/index.md` first `# ` heading becomes `# <name> — Index`. Title shown: first `# ` heading minus ` — Index`; `Campaign Index` or no heading → folder name.
- The browser sends ids only, never paths. The server writes only inside `CAMPAIGNS_DIR`.
- UI copy in English. Download failure message: `Could not download the template. Are you offline?`
- Version 0.5.0.
- Deviation from the spec, agreed in spirit with the chat: a leading `~/` in `CAMPAIGNS_DIR` and `VAULT_PATH` expands to the home folder (Node does not do it, and `~/campagne` is the natural way to write it).

## Review Focus

- Corrupt or hand-edited `.active-campaign.json` (bad JSON, missing `id`, id with `../`) → treated as "no active campaign", never a crash or a path outside `CAMPAIGNS_DIR`. Test in Task 1.
- Active campaign folder deleted while the app runs → `no-active-campaign`, setup screen with the list. Test in Task 1.
- Names that slug to nothing or to odd ids ("!!!", "Ñoño", "  ", a 200-character name) → `400` or a clean id. Test in Task 2.
- Double-click on "Create", or a folder with that id appearing during the download → second request gets `409`, the first campaign stays intact, no `.creating-*` left. Test in Task 3.
- GitHub answers 200 with something that is not a gzip tarball (captive portal, HTML) → `502`-style error, no leftover folder. Test in Task 3.

---

### Task 1: Vitest and campaign resolution in `vault.ts`

**Files:**
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)
- Create: `vitest.config.ts` (environment `node`, include `tests/**/*.test.ts`)
- Modify: `src/app/utils/vault.ts`
- Test: `tests/vault.test.ts`

**Interfaces:**
- Produces (all in `vault.ts`):
  - `type VaultMode = 'vault-path' | 'campaigns-dir' | 'unconfigured'`
  - `VaultProblem` gains `'no-active-campaign' | 'campaigns-dir-not-found'`
  - `const ACTIVE_CAMPAIGN_FILE = '.active-campaign.json'`
  - `const TEMPLATE_REPO`, `const TEMPLATE_RELEASE` (values in Global Constraints)
  - `getVaultMode(): VaultMode`
  - `getCampaignsDir(): string | null` — resolved absolute path, or null when not set
  - `isValidCampaignId(id: unknown): id is string`
  - `readActiveCampaignId(): string | null` — null on missing/bad file or invalid id
  - `readVaultFormat(root: string): { ok: true; vaultFormat: number; warning?: string } | { ok: false; problem: 'bad-marker' | 'unsupported-format'; message: string }` — the marker logic extracted from today's `getVaultStatus()`
  - `getVaultStatus()`, `getCampaignRoot()`, `errorStatus()`, `VaultUnavailableError` keep their signatures

- [ ] **Step 1: Add Vitest** — `pnpm add -D vitest`, add the `test` script and `vitest.config.ts`.

- [ ] **Step 2: Write failing tests in `tests/vault.test.ts`.** Each test makes a temp folder with `fs.mkdtempSync`, builds campaign folders (`wiki/` + `dm-second-brain.json` `{"vaultFormat":1}`), sets `process.env` in `beforeEach` and restores it in `afterEach`.

```ts
it('VAULT_PATH wins over CAMPAIGNS_DIR', ...)         // getVaultMode() === 'vault-path'; status.root === VAULT_PATH folder
it('unconfigured without both variables', ...)         // mode 'unconfigured'; problem 'not-configured'
it('CAMPAIGNS_DIR missing on disk', ...)              // problem 'campaigns-dir-not-found'
it('no active file → no-active-campaign', ...)
it('opens the active campaign', ...)                   // .active-campaign.json {"id":"alpha"} → ok, root ends with /alpha, vaultFormat 1
it('active folder deleted → no-active-campaign', ...)
it.each(['not json', '{}', '{"id":"../alpha"}', '{"id":"Alpha"}'])('bad active file %s → no-active-campaign', ...)
it('isValidCampaignId', ...)  // true: 'alpha', 'a-1'; false: '', '-a', 'A', 'a/b', '..', 'a'.repeat(65), 42
it('expands ~/ in CAMPAIGNS_DIR', ...)                 // set HOME to a temp folder; CAMPAIGNS_DIR='~/c' → getCampaignsDir() === path.join(HOME,'c')
it('unsupported format of the active campaign', ...)   // marker {"vaultFormat":99} → problem 'unsupported-format'
```

- [ ] **Step 3: Run** `pnpm test` — expected: FAIL (`getVaultMode` is not exported).

- [ ] **Step 4: Implement in `vault.ts`.** `getVaultStatus()` follows the precedence in the spec section 1, then calls a shared `checkVaultFolder(root, label)` holding today's folder/`wiki/` checks plus `readVaultFormat(root)`. Path expansion: `~/` → `os.homedir()` before `path.resolve(process.cwd(), …)` (keep the `turbopackIgnore` comment). Messages:
  - `no-active-campaign`: `No campaign is open. Pick one or create a new one.`
  - `campaigns-dir-not-found`: `CAMPAIGNS_DIR is "<value>", but there is no folder there.`
  - `not-configured`: `Neither CAMPAIGNS_DIR nor VAULT_PATH is set. Set one in .env.local.`

- [ ] **Step 5: Run** `pnpm test` — expected: PASS. Run `curl -s localhost:3000/api/vault` with the current `.env.local` (`VAULT_PATH` → example campaign) — expected `{"ok":true,"vaultFormat":1}`.

- [ ] **Step 6: Commit** — `feat: resolve the open campaign from CAMPAIGNS_DIR, add Vitest`

### Task 2: Listing and activating campaigns (`campaigns.ts`)

**Files:**
- Create: `src/app/utils/campaigns.ts`
- Test: `tests/campaigns.test.ts`

**Interfaces:**
- Consumes: `getVaultMode`, `getCampaignsDir`, `isValidCampaignId`, `readVaultFormat`, `ACTIVE_CAMPAIGN_FILE` from Task 1.
- Produces:
  - `class CampaignError extends Error { constructor(message: string, readonly status: number) }`
  - `interface CampaignSummary { id: string; title: string; vaultFormat: number | null; supported: boolean }`
  - `interface CampaignsInfo { mode: VaultMode; activeId: string | null; activeTitle: string | null; campaigns: CampaignSummary[] }` (exported type; client code imports it with `import type`)
  - `campaignIdFromName(name: string): string` — `''` when nothing usable is left
  - `getCampaignTitle(root: string): string`
  - `listCampaigns(): CampaignSummary[]` — `[]` when mode isn't `campaigns-dir` or the folder is missing; sorted by title
  - `setActiveCampaign(id: string): void` — throws `CampaignError` 409 in `vault-path` mode, 400 for invalid/unknown/unsupported id
  - `getCampaignsInfo(): CampaignsInfo`

- [ ] **Step 1: Write failing tests**

```ts
it.each([
  ['La Valle di Silverbrook', 'la-valle-di-silverbrook'],
  ['Ñoño', 'nono'],
  ['  Città  del   Sole!! ', 'citta-del-sole'],
  ['!!!', ''],
])('campaignIdFromName(%s) === %s', ...)
it('ids are cut to 64 characters without a trailing dash', ...)   // 'a'.repeat(63) + ' b' + 'c'.repeat(10)
it('title from index heading', ...)        // '# Silverbrook Campaign — Index' → 'Silverbrook Campaign'
it('template heading falls back to folder name', ...)   // '# Campaign Index' in folder 'alpha' → 'alpha'
it('missing index falls back to folder name', ...)
it('lists campaigns sorted by title, skips dot folders, folders without wiki/ and files', ...)
it('lists unsupported campaigns with supported: false', ...)   // marker 99 → { vaultFormat: 99, supported: false }; bad JSON → { vaultFormat: null, supported: false }
it('setActiveCampaign writes the active file', ...)            // then getVaultStatus().ok === true
it.each(['../x', 'missing', 'unsupported'])('setActiveCampaign(%s) throws 400', ...)
it('setActiveCampaign throws 409 when VAULT_PATH is set', ...)
it('getCampaignsInfo in vault-path mode', ...)   // { mode: 'vault-path', activeId: null, activeTitle: <title>, campaigns: [] }
```

- [ ] **Step 2: Run** `pnpm test tests/campaigns.test.ts` — expected: FAIL (module not found).

- [ ] **Step 3: Implement `campaigns.ts`.** Slug: `normalize('NFKD')`, strip combining marks, lowercase, non-`[a-z0-9]` runs → `-`, trim `-`, slice 64, trim `-` again. `activeTitle` comes from `getVaultStatus()` when ok.

- [ ] **Step 4: Run** `pnpm test` — expected: PASS.

- [ ] **Step 5: Commit** — `feat: list and activate campaigns in CAMPAIGNS_DIR`

### Task 3: Template download and campaign creation

**Files:**
- Create: `src/app/utils/template.ts`
- Modify: `src/app/utils/campaigns.ts` (add `createCampaign`)
- Modify: `package.json` (dependency `tar`)
- Test: `tests/template.test.ts`, `tests/create-campaign.test.ts`

**Interfaces:**
- Consumes: Task 1 constants; `CampaignError`, `campaignIdFromName`, `setActiveCampaign` from Task 2.
- Produces:
  - `templateArchiveUrl(): string`
  - `isAllowedTemplatePath(relativePath: string): boolean` — path with the archive's top folder already removed
  - `downloadTemplateArchive(): Promise<Buffer>` — throws `CampaignError(…, 502)` with the offline message on network error, timeout or non-200
  - `extractTemplate(archive: Buffer, dest: string): Promise<void>` — `tar.x` with `strip: 1`, a filter using `isAllowedTemplatePath` and entry type `File` or `Directory` only; rejects (throws) on a corrupt archive
  - `createCampaign(name: string, download: () => Promise<Buffer> = downloadTemplateArchive): Promise<{ id: string }>`

- [ ] **Step 1: `pnpm add tar`** (v7 ships its own types). Check in its README whether the `filter` callback sees the path before or after `strip`, and write the filter accordingly.

- [ ] **Step 2: Write failing tests.** The fixture is built in the test: a temp folder `DM-Second-Brain-0.4.0/` with `CLAUDE.md`, `README.md`, `dm-second-brain.json` (`{"vaultFormat":1}`), `wiki/index.md` (`# Campaign Index\n\nbody`), `raw/world-bible.md`, `output/.gitkeep`, `examples/x/wiki/a.md` and a symlink `wiki/link.md → ../README.md`, packed with `tar.c({ gzip: true, cwd })` into a Buffer.

```ts
// template.test.ts
it.each(['CLAUDE.md', 'dm-second-brain.json', '.gitignore', 'wiki', 'wiki/index.md', 'raw/sessions/README.md', 'output/.gitkeep'])('allows %s', ...)
it.each(['README.md', 'examples/x/wiki/a.md', '../x', '/etc/passwd', 'wiki/../../x', 'wikis/a.md', ''])('rejects %s', ...)
it('extracts only the allowed files and no links', ...)   // README.md, examples/, wiki/link.md absent; wiki/index.md present
it('rejects a corrupt archive', ...)                      // Buffer.from('<html>') → rejects
it('templateArchiveUrl', ...)  // === 'https://codeload.github.com/tzoorlee/DM-Second-Brain/tar.gz/refs/tags/v0.4.0'

// create-campaign.test.ts (CAMPAIGNS_DIR = temp folder, download = async () => fixture)
it('creates, titles and opens the campaign', ...)   // { id: 'la-valle' } for 'La Valle'; index starts with '# La Valle — Index'; active id 'la-valle'
it.each(['', '   ', 'x'.repeat(81), '!!!'])('rejects name %j with 400', ...)
it('rejects an existing id with 409', ...)
it('two concurrent creations with the same name: one succeeds, one 409', ...)   // Promise.allSettled
it('download failure leaves nothing behind', ...)   // download rejects CampaignError 502 → same error; readdir(CAMPAIGNS_DIR) has no '.creating-*'
it('corrupt archive leaves nothing behind', ...)    // download returns Buffer.from('<html>') → CampaignError 502
it('unsupported template format → 500, nothing left', ...)   // fixture marker {"vaultFormat":99}
it('throws 409 when VAULT_PATH is set', ...)
```

- [ ] **Step 3: Run** `pnpm test` — expected: FAIL (module not found).

- [ ] **Step 4: Implement** `template.ts` and `createCampaign` following spec section 2, steps 1–8. Download uses `fetch` with `AbortSignal.timeout(30_000)`. Extraction errors become `CampaignError(…, 502)` with message `The downloaded template is not a valid archive.` Right before the rename, re-check that `<id>` does not exist (→ 409) and map a rename failure with `EEXIST`/`ENOTEMPTY` to 409; on Linux an empty target folder would be silently replaced, which the re-check prevents. Cleanup with `fs.rmSync(tmp, { recursive: true, force: true })` in `finally` when the rename did not happen.

- [ ] **Step 5: Run** `pnpm test` — expected: PASS.

- [ ] **Step 6: Commit** — `feat: create campaigns from the pinned template release`

### Task 4: API routes

**Files:**
- Create: `src/app/api/campaigns/route.ts` (`GET`, `POST`)
- Create: `src/app/api/campaigns/active/route.ts` (`POST`)
- Test: `tests/api-campaigns.test.ts`

**Interfaces:**
- Consumes: `getCampaignsInfo`, `setActiveCampaign`, `createCampaign`, `CampaignError` from Tasks 2–3.
- Produces (HTTP):
  - `GET /api/campaigns` → `200` `CampaignsInfo`
  - `POST /api/campaigns` `{ name }` → `201 { id }`; errors `{ error }` with `CampaignError.status`
  - `POST /api/campaigns/active` `{ id }` → `200 { ok: true }`; errors `{ error }` with `CampaignError.status`
  - A body that is not JSON or lacks a string field → `400`; any other error → `500`.

- [ ] **Step 1: Write failing tests** calling the exported handlers directly with `new Request('http://x/api/campaigns', { method: 'POST', body })`:

```ts
it('GET lists campaigns', ...)                       // status 200, body.campaigns.length === 2, body.mode === 'campaigns-dir'
it('POST active switches campaign', ...)             // 200; then GET body.activeId === 'beta'
it('POST active with a path → 400', ...)             // { id: '../beta' }
it('POST active with bad JSON → 400', ...)
it('POST active in vault-path mode → 409', ...)
it('POST create with a missing name → 400', ...)
```

Creation through the route is covered by Task 3's tests and the manual check in Task 7; the route only maps errors.

- [ ] **Step 2: Run** `pnpm test tests/api-campaigns.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement the routes**, matching the style of `src/app/api/vault/route.ts` and `search/route.ts` (`NextResponse.json`, try/catch). Mark both route files dynamic if the Next 16 docs require it for routes reading the file system per request.

- [ ] **Step 4: Run** `pnpm test` — expected: PASS. With the dev server: `curl -s localhost:3000/api/campaigns` → `{"mode":"vault-path",…}` with the current `.env.local`.

- [ ] **Step 5: Commit** — `feat: campaigns API`

### Task 5: Setup screen with list and creation form

**Files:**
- Create: `src/app/components/CampaignPicker.tsx`
- Modify: `src/app/components/VaultSetup.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `CampaignsInfo` (type) from Task 2; the HTTP API from Task 4.
- Produces:
  - `CampaignPicker({ info }: { info: CampaignsInfo })` — list + "New campaign" form; after a successful pick or creation calls `window.location.reload()`
  - `VaultSetup({ problem, message, campaigns, onBack }: { problem?: string; message?: string; campaigns: CampaignsInfo | null; onBack?: () => void })` — `onBack` set means "Manage campaigns" opened from the dashboard (shows a "Back to the dashboard" button)
  - `page.tsx` fetches `/api/campaigns` in `init` next to `/api/vault` and keeps it in state `campaigns: CampaignsInfo | null`

- [ ] **Step 1: Implement `CampaignPicker`.** Copy from the spec section 3: list items show title and id; unsupported ones disabled with `Update the app to open it`; empty list `No campaigns yet. Create your first one.`; form label `Campaign name`, button `Create` / `Creating…` (disabled while pending, and while the field is blank); errors from `{ error }` shown under the form or the list in a `role="alert"` element.

- [ ] **Step 2: Update `VaultSetup`.** Mode `campaigns-dir` (any problem, or no problem when opened from the dashboard): heading `Campaigns`, the problem message if any, then `CampaignPicker`; for `unsupported-format` keep today's update text above the picker. Mode `unconfigured`: today's instructions rewritten with `CAMPAIGNS_DIR=~/campaigns` first (step 2) and `VAULT_PATH` as the single-campaign alternative. Mode `vault-path`: today's screens unchanged.

- [ ] **Step 3: Wire `page.tsx`** to pass `campaigns` to `VaultSetup`.

- [ ] **Step 4: Verify by hand** with `.env.local` set to `CAMPAIGNS_DIR` pointing at a temp folder that holds a copy of `examples/silverbrook-campaign`, and no active file: the list shows "Silverbrook Campaign"; clicking it opens the dashboard; an unconfigured `.env.local` shows the new instructions. `pnpm lint` passes.

- [ ] **Step 5: Commit** — `feat: campaign list and creation on the setup screen`

### Task 6: Campaign menu in the dashboard

**Files:**
- Create: `src/app/components/CampaignMenu.tsx`
- Modify: `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `CampaignsInfo` from Task 2; `POST /api/campaigns/active` from Task 4; `VaultSetup` `onBack` from Task 5.
- Produces: `CampaignMenu({ info, onManage }: { info: CampaignsInfo; onManage: () => void })`

- [ ] **Step 1: Implement `CampaignMenu`.** It replaces the `📖 Campaign Wiki` heading in the wiki panel header (`page.tsx` around line 461) with `📖 <activeTitle>`. Mode `vault-path`: plain heading, no menu. Mode `campaigns-dir`: a button with `aria-haspopup="menu"` and `aria-expanded`, opening a list of the other supported campaigns plus `Manage campaigns…`; Escape and a click outside close it. Picking a campaign posts to `/api/campaigns/active` and calls `window.location.reload()` (the session draft survives, it lives in `localStorage`); an error shows in the menu.

- [ ] **Step 2: Wire `page.tsx`:** state `managing: boolean`; when true render `<VaultSetup campaigns={campaigns} onBack={() => setManaging(false)} />`.

- [ ] **Step 3: Verify by hand:** with two campaigns, switch from the menu (search results and next session number change), open "Manage campaigns…" and go back, check that the menu is absent with `VAULT_PATH`. Narrow window: the header still fits. `pnpm lint` passes.

- [ ] **Step 4: Commit** — `feat: switch campaigns from the dashboard`

### Task 7: Docs, version 0.5.0 and end-to-end check

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `.env.example`, `package.json` (`"version": "0.5.0"`), `AGENTS.md` (mention `TEMPLATE_RELEASE` next to `SUPPORTED_VAULT_FORMATS`: raise both together)

- [ ] **Step 1: Update docs.** `.env.example`: `CAMPAIGNS_DIR` first (commented example `~/campaigns`), `VAULT_PATH` as the alternative that wins when set. README: campaigns folder, creating a campaign (needs internet, which release it uses), the dashboard menu, `git init` inside a campaign to version it, API list with the three new endpoints. CHANGELOG `## [0.5.0] - <date>` with Added / Changed sections.

- [ ] **Step 2: Real check.** `CAMPAIGNS_DIR` → a new empty temp folder; create "Prova" from the setup screen. Expected: folder `prova/` with `CLAUDE.md`, `dm-second-brain.json`, `.gitignore`, `wiki/`, `raw/`, `output/`, no `README.md`, no `examples/`; `wiki/index.md` starts with `# Prova — Index`; dashboard opens on it. Then restore `.env.local` to the user's setting.

- [ ] **Step 3: Run** `pnpm test && pnpm lint && pnpm build` — expected: all pass.

- [ ] **Step 4: Commit** — `feat: campaign picker and campaign creation, version 0.5.0`
