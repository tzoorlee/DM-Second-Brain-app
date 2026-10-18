# Campaign picker and campaign creation — design

Date: 2026-10-18 · Target version: 0.5.0 · Status: approved in chat, awaiting spec review

## Goal

From the app, the DM can see the campaigns they already have, open one, and create a
new one from the DM-Second-Brain template, without editing `.env.local` or restarting.

What the DM asked for:

- create a vault from the setup screen;
- see a list of earlier campaigns there.

Decisions taken while designing:

- campaigns live in one folder, `CAMPAIGNS_DIR`, one subfolder per campaign;
- new campaigns are downloaded from GitHub, from a pinned template release;
- the open campaign is remembered server-side, for the whole app (not per browser);
- `VAULT_PATH` keeps working as today and wins over `CAMPAIGNS_DIR`;
- the dashboard gets a campaign menu at the top to switch campaigns.

Assumptions: the app runs locally for one DM (as the README already says), and a
campaign is "open" for every browser that talks to the app.

Out of scope: per-browser campaigns, campaigns stored outside `CAMPAIGNS_DIR`,
renaming or deleting campaigns, `git init` of new campaigns.

## 1. Resolving the campaign (server)

New environment variable `CAMPAIGNS_DIR`: absolute, or relative to the app folder.

Precedence in `getVaultStatus()`:

1. `VAULT_PATH` is set → open that folder, exactly as in 0.4.0. Mode `vault-path`:
   no picker, no creation.
2. Otherwise `CAMPAIGNS_DIR` is set → mode `campaigns-dir`. The open campaign is the
   id stored in `CAMPAIGNS_DIR/.active-campaign.json` (`{ "id": "silverbrook" }`).
   No file, or an id that no longer exists → problem `no-active-campaign`, and the
   setup screen shows the list.
3. Neither is set → mode `unconfigured`, problem `not-configured`, setup instructions.

After the folder is resolved, the existing checks run unchanged: folder exists, has
`wiki/`, `dm-second-brain.json` valid and its format in `SUPPORTED_VAULT_FORMATS`.
If `CAMPAIGNS_DIR` itself does not exist, problem `campaigns-dir-not-found`.

Campaign id = subfolder name. The server accepts an id only when it:

- matches `^[a-z0-9][a-z0-9-]*$` (max 64 characters);
- names a direct subfolder of `CAMPAIGNS_DIR`;
- that subfolder holds `wiki/`.

The browser only ever sends ids, never paths.

New functions in `src/app/utils/vault.ts`:

- `getVaultMode()` → `'vault-path' | 'campaigns-dir' | 'unconfigured'`;
- `listCampaigns()` → `{ id, title, vaultFormat, supported }[]`, sorted by title.
  Subfolders without `wiki/` and names starting with `.` are skipped. A campaign with a
  bad or unknown marker is listed with `supported: false`;
- `setActiveCampaign(id)` validates the id and writes `.active-campaign.json`;
- `createCampaign(name)`, see section 2.

`getCampaignRoot()` keeps its signature, so `wiki.ts`, `search.ts` and the API routes
do not change. The search cache is already keyed by the campaign root, so switching
campaigns rebuilds it.

Campaign title: the first `# ` heading of `wiki/index.md`, minus a trailing
` — Index`. If the heading is missing or is the template's `Campaign Index`, the
folder name is used.

## 2. Creation and API

Endpoints. All except `GET` answer `409` in mode `vault-path`.

- `GET /api/campaigns` →
  `{ mode, activeId, activeTitle, campaigns: [{ id, title, vaultFormat, supported }] }`.
  `activeTitle` is the open campaign's title for the dashboard header (`null` when
  none is open). In mode `vault-path`, `activeId` is `null` and `campaigns` is empty.
- `POST /api/campaigns/active` with `{ id }` → sets the open campaign. Unknown or
  unsupported id → `400`.
- `POST /api/campaigns` with `{ name }` → creates the campaign, makes it open, returns
  `{ id }`.

`GET /api/vault` stays as it is and keeps describing the open campaign.

Template source, pinned next to `SUPPORTED_VAULT_FORMATS`:

```ts
export const TEMPLATE_REPO = 'tzoorlee/DM-Second-Brain';
export const TEMPLATE_RELEASE = 'v0.4.0'; // vault format 1
```

Archive URL: `https://codeload.github.com/${TEMPLATE_REPO}/tar.gz/refs/tags/${TEMPLATE_RELEASE}`.
Extracted with the `tar` package (new dependency).

`createCampaign(name)`:

1. Trim the name. Empty or longer than 80 characters → `400`.
2. Make the id: lowercase, accents removed, runs of other characters → `-`, trimmed
   of `-`, cut to 64 characters ("La Valle di Silverbrook" → `la-valle-di-silverbrook`).
   An empty id → `400`. A folder with that id already exists → `409`.
3. Download the archive with a 30-second timeout. Network error or non-200 →
   `502` "Could not download the template. Are you offline?".
4. Extract into `CAMPAIGNS_DIR/.creating-<id>-<random>`, stripping the archive's top
   folder. Keep only `CLAUDE.md`, `dm-second-brain.json`, `.gitignore` and the
   `wiki/`, `raw/`, `output/` trees. Skip any entry whose path is absolute, contains
   `..`, or is not a regular file or folder (links included).
5. Read the extracted `dm-second-brain.json`: its format must be supported, otherwise
   `500` "The pinned template release uses an unsupported vault format".
6. Replace the first `# ` heading of `wiki/index.md` with `# <name> — Index`.
7. Rename the temporary folder to `CAMPAIGNS_DIR/<id>` (atomic on one filesystem), then
   write `.active-campaign.json`.
8. On any failure after step 4 starts, remove the temporary folder before answering.

Leftover `.creating-*` folders (for example after a crash) are ignored by
`listCampaigns()`.

## 3. Interface

Setup screen (`src/app/components/VaultSetup.tsx`):

- Mode `campaigns-dir`:
  - the list of campaigns (title, id); a click opens it and loads the dashboard;
  - unsupported campaigns are shown greyed out with "Update the app to open it";
  - a **New campaign** form: name field and "Create" button, which reads "Creating…"
    and is disabled while the request runs; errors show under the form;
  - empty list → "No campaigns yet. Create your first one.".
- Mode `unconfigured`: instructions, with `CAMPAIGNS_DIR` as the main option and
  `VAULT_PATH` as the way to open a single campaign folder.
- Unsupported format of the open campaign: the "Update the app" message as today; in
  mode `campaigns-dir` the list and the creation form are shown below it, so the DM
  can open another campaign.

Dashboard (`src/app/page.tsx`):

- the open campaign's title in the header, with a dropdown menu: the other supported
  campaigns, and "Manage campaigns…", which shows the setup screen with the list and the
  creation form;
- picking a campaign calls `POST /api/campaigns/active` and then reloads the
  dashboard's data (vault status, search, open entity, next session number);
- mode `vault-path`: the title is shown without the menu.

UI text stays in English, like the rest of the app.

## 4. Errors, security and verification

Errors, each with a clear message in the UI and no half-created folder left behind:
`CAMPAIGNS_DIR` missing, empty or duplicate name, download failed or timed out,
unsupported template format, unknown id sent to `active`.

Security:

- the server accepts validated ids only and writes only inside `CAMPAIGNS_DIR`;
- archive entries are filtered as in step 4, so a crafted archive cannot write
  outside the temporary folder;
- the app stays meant for `localhost` only.

Verification:

- add **Vitest** as a dev dependency, with a `test` script;
- unit tests for `vault.ts`, using temporary folders and a small local `.tar.gz`
  fixture (no network): precedence of `VAULT_PATH` and `CAMPAIGNS_DIR`, id validation,
  name → id, `listCampaigns()` (skips, titles, unsupported), `setActiveCampaign()`,
  extraction filter (rejects `..`, absolute paths, links; keeps only the allowed
  paths), cleanup after a failure;
- manual check: real creation from GitHub, switching campaigns from the dashboard,
  `VAULT_PATH` mode unchanged, `pnpm lint` and `pnpm build` pass.

Release 0.5.0: `CHANGELOG.md`, `README.md` (campaigns folder, creation, menu, how to
`git init` a campaign) and `.env.example` (`CAMPAIGNS_DIR` first, `VAULT_PATH`
as the alternative) updated.
