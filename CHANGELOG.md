# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/).

Versions up to 0.3.2 were released as `dashboard/` inside the
[DM-Second-Brain template](https://github.com/tzoorlee/DM-Second-Brain/blob/main/CHANGELOG.md).

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
