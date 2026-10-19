# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/).

Versions up to 0.3.2 were released as `dashboard/` inside the
[DM-Second-Brain template](https://github.com/tzoorlee/DM-Second-Brain/blob/main/CHANGELOG.md).

## [0.11.2] - 2026-10-19

### Fixed

- Design ingest:
  - a second Prepare of the same day and title (`…-2.md`) is queued after the original, and `-2` before `-10`;
  - the agent's instructions no longer speak of a "recap" for design;
  - the `append_log` example now shows both the session and the design format;
  - session ingests left open by 0.10 keep the `| session-NN]` log rule, so apply doesn't add a second log line.

## [0.11.1] - 2026-10-19

### Fixed

- A campaign made from the world of another no longer copies the old campaign's dated design files (`raw/worldbuilding/YYYY-MM-DD-…`). They were made for the old campaign's play and are already in its wiki, which arrives as history; copied, they blocked the new campaign's design queue.

## [0.11.0] - 2026-10-19

### Added

- **Design ingest** on the ingest page, next to sessions:
  - the initial design (every undated file of `raw/worldbuilding/`);
  - each dated design file (`YYYY-MM-DD-<slug>.md`, the Studio's + Prepare), in date order.
- The agent follows the template's DESIGN INGEST. New pages must be `prepared` with `first_seen: design`, and contradictions with `established` pages are flagged, not written.
- Sessions and design have separate queues; one ingest is open at a time.
- Links from the World Studio: **Ingest in the app** in the summary step, and **Ingest it now** for a written + Prepare.
- Without credentials, the page shows the terminal command for the selected source.

### Changed

- `GET /api/ingest` returns `sources` (each with its kind, files, status and terminal command) instead of `sessions`.
- `GET /api/ingest/:id/recap` is now `/source`.
- Ingest links use `?source=`; `?session=` still works.
- The campaign menu's "Ingest sessions" is now "Ingest".

## [0.10.1] - 2026-10-19

### Fixed

- Session ingest:
  - a one-word answer such as "go" or "vai" no longer counts as Proceed: only "proceed" or "procedi" does;
  - **Apply approved** is disabled while it runs, so a double click no longer shows a conflict after a successful apply;
  - a review request that arrives while an apply runs can no longer reopen the ingest;
  - the agent's `list_pages` now includes `index.md` and `log.md`;
  - after a reload, the chat no longer shows refused writes as "✎ path";
  - fewer false conflicts: a page the agent reads again counts as seen with your edits. The agent must also read an existing page before rewriting it;
  - moving a page back where it was undoes the move instead of being refused.

## [0.10.0] - 2026-10-19

### Added

- **Session ingest** (`/ingest`): an AI agent (Claude Sonnet 5.5, `INGEST_MODEL`) turns a session recap into wiki changes following the campaign's `CLAUDE.md` and `TEMPLATES.md`. It discusses the session first, then stages every change; you review each page as a diff, approve, reject or ask for changes, and apply. The wiki is written only on apply, with a conflict check for pages you edited meanwhile and a warning for links to rejected pages.
- Pages are checked before staging: valid frontmatter with a `type`, and DM-only text under exactly `## Secrets (DM only)`.
- Campaigns without `TEMPLATES.md` (made before template 0.5.0) use the pinned template release's, downloaded once into `.dm-second-brain/`.
- "Ingest it now" after saving a recap; **Ingest sessions** in the campaign menu.

## [0.9.0] - 2026-10-18

### Added

- **New campaign from the world of another**: "Start from: The world of …" in the new-campaign form. The world (world bible with the new name, setting, SRD, worldbuilding, and optionally the house rules) is copied; the old wiki becomes history in `raw/setting/from-<id>/`; sessions, interludes and the old campaign stay as they are.
- **Inherited world** step at the top of the World Studio for such campaigns: when the new campaign takes place and what changed, with the inherited history in the AI's context. The steps the copy already covers start approved; the summary adds the command to ingest the inherited history.
- `POST /api/campaigns` accepts `from` and `copyHouseRules`.

## [0.8.0] - 2026-10-18

### Added

- **+ Prepare** and **+ Interlude** in the World Studio, once the campaign has a session: new design in a dated `raw/worldbuilding/` file, or what happened off-screen in `raw/interludes/` (with `date_in_world` and `after_session`). Each shows draft / written / ingested, the command for the agent's ingest, and becomes read-only once the agent has ingested it.
- Written interludes are part of the AI's context, as history.

### Changed

- The nine steps use Claude Opus 5.5 (`STUDIO_MODEL`); Prepare and Interlude use Claude Sonnet 5.5 (`STUDIO_PREP_MODEL`).

### Fixed

- The Studio chat could reload the page in recent browsers (an effect returned a promise), losing the answer being written.

## [0.7.0] - 2026-10-18

### Added

- **World Studio** (`/studio`): build the world in nine steps, each a chat with an AI partner (Claude Opus 5) next to a live draft. The AI proposes edits you accept or reject and reports contradictions with earlier steps, the wiki and published lore; approving a step runs a coherence check and writes the draft to `raw/`.
- Step 1 form for the campaign basics (name, language, starting level, start date, homebrew / published / mixed setting); it also sets `CLAUDE.md`'s language and campaign name.
- House-rules checklist with common variants.
- **SRD download**: SRD 5.1 or 5.2.1 into `raw/srd/`, pinned markdown conversions (CC-BY-4.0) with an `ATTRIBUTION.md`.
- "Keep as deviation" adds a published-lore warning to the world-bible's deviations.
- World Studio in the campaign menu, and an offer to open it after creating a campaign.

### Changed

- New campaigns use template `v0.6.0` (interludes, setting reference, world-bible Campaign and Setting sections).

## [0.6.1] - 2026-10-18

### Changed

- New campaigns use template `v0.5.1` (clearer rules in `TEMPLATES.md` and `CLAUDE.md`; vault format still 1).

## [0.6.0] - 2026-10-18

### Added

- **Every link field on the entity sheet**: location, region, faction, owner, deity, quest giver, adventure, the secret's subjects and the history pages, shown by the linked page's title. Plain fields too: player, domains, symbol, SRD monster, an event's date and session. Empty fields are not shown.
- **Linked from**: the pages that point to the open one, grouped by type, with the field they use.
- **Quest dependencies**: the quests a quest requires (✓ when completed) and the ones it unlocks. An adventure lists its quests with their status.
- Labels and colors for the template's new types: adventure, deity, creature, lore.

### Changed

- **New campaigns use template `v0.5.0`** and get its `TEMPLATES.md`, the rules for every page type. Vault format is still 1.
- A `[[slug]]` written without a shown name displays the page's title.

### Security

- In Player Safe, link fields, Linked from and dependencies leave out hidden pages, and links inside DM-only sections don't count.

## [0.5.1] - 2026-10-18

### Changed

- **Campaign menu** redesigned: it looks like a selector, lists every campaign with its folder name and a ✓ on the open one, and adds a **New campaign** shortcut next to **Manage campaigns…**.

### Fixed

- A campaign with a broken `dm-second-brain.json` now says so, instead of asking to update the app.
- Campaign folders reached through a symlink are listed.
- Names in other scripts ("Дракон", "龍") create `campaign`, `campaign-2`, ... instead of failing. Line breaks in a name become spaces.
- `.active-campaign.json` is written in one step, so it is never read half-written.
- Opening an unknown campaign answers `404` instead of `400`.
- The template download stops at 20 MB.
- The setup screen no longer runs a search, which left a `503` in the browser console.

## [0.5.0] - 2026-10-18

### Added

- **Campaigns folder.** Set `CAMPAIGNS_DIR` to a folder of campaigns: the setup screen lists them and opens the one you pick. The choice is saved in `.active-campaign.json` and holds for the whole app.
- **New campaign** from the setup screen: the app downloads the template release it supports (`v0.4.0`) from GitHub, keeps only what a campaign needs, and opens it.
- **Campaign menu** on the campaign's name in the wiki panel, to switch campaign or manage them.
- `GET /api/campaigns`, `POST /api/campaigns` and `POST /api/campaigns/active`. They take campaign ids, never paths.
- Tests with Vitest (`pnpm test`).

### Changed

- `VAULT_PATH` still opens a single campaign and wins over `CAMPAIGNS_DIR`.
- `VAULT_PATH` and `CAMPAIGNS_DIR` accept paths starting with `~/`.

## [0.4.0] - 2026-10-18

### Changed

- **The app has its own repository.** It moved out of the template, with its history. The template keeps the agent rules, the folder structure and the example campaign.
- `VAULT_PATH` is now required: the app no longer reads the folder above itself. Without a valid campaign, a setup screen explains how to point the app at one.
- The package is named `dm-second-brain-app`.

### Added

- **Vault format check.** The app reads `dm-second-brain.json` at the campaign root and supports format 1. A campaign without the file is treated as format 1 and gets a notice. An unknown format is refused, so its secrets are never shown by mistake.
- `GET /api/vault` reports whether the campaign can be opened. The other endpoints answer `503` with a clear message when it can't.

### Security

- Saving a session recap no longer returns the file's absolute path.
