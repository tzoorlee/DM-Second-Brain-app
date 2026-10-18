# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/).

Versions up to 0.3.2 were released as `dashboard/` inside the
[DM-Second-Brain template](https://github.com/tzoorlee/DM-Second-Brain/blob/main/CHANGELOG.md).

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
