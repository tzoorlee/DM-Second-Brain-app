# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/).

Versions up to 0.3.2 were released as `dashboard/` inside the
[DM-Second-Brain template](https://github.com/tzoorlee/DM-Second-Brain/blob/main/CHANGELOG.md).

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
