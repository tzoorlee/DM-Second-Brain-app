# DM-Second-Brain App

![version](https://img.shields.io/badge/version-0.5.1-blue)
![vault format](https://img.shields.io/badge/vault%20format-1-purple)

A local companion app for campaigns built with the
[**DM-Second-Brain** template](https://github.com/tzoorlee/DM-Second-Brain), the
LLM-maintained wiki for D&D 5e campaigns. Run it during your sessions to search the
campaign wiki, open entity sheets with or without DM secrets, and write session recaps
straight into your campaign's `raw/sessions/`.

> [!WARNING]
> This app is designed for **local use only** (`localhost`). It has no authentication,
> so **do not deploy it or expose it to the web**.

## Getting started

You need Node.js 20 or newer and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/tzoorlee/DM-Second-Brain-app.git
cd DM-Second-Brain-app
pnpm install
cp .env.example .env.local
# edit .env.local and set CAMPAIGNS_DIR (or VAULT_PATH)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). If the settings are missing or wrong,
the app shows a setup screen that explains what to fix.

### Campaigns folder

Set `CAMPAIGNS_DIR` to a folder that holds your campaigns, one subfolder each. It can
start empty:

```bash
CAMPAIGNS_DIR=~/campaigns
```

The app lists every subfolder that has a `wiki/` folder and a lowercase name made of
letters, numbers and dashes (`my-campaign`); a symlink to a campaign folder counts too.
Pick one to open it; the choice is saved in
`CAMPAIGNS_DIR/.active-campaign.json`, so the app reopens it next time, for every
browser. Switch campaign from the menu on the campaign's name, at the top of the wiki
panel; it also has shortcuts to create a campaign and to manage them.

**New campaign** creates a subfolder from the
[template](https://github.com/tzoorlee/DM-Second-Brain): the app downloads the template
release it is built for (currently `v0.4.0`) from GitHub, so it needs an internet
connection. The new campaign gets the template's `CLAUDE.md`, `wiki/`, `raw/`, `output/`,
`dm-second-brain.json` and `.gitignore`, and is opened right away. The folder name comes
from the campaign name; names in other scripts (say "Дракон") get `campaign`,
`campaign-2`, ... and keep their title. To version it, run
`git init` inside it and keep the repository private: `secrets/` is not ignored.

### A single campaign

To open one campaign folder directly, set `VAULT_PATH` instead. It wins over
`CAMPAIGNS_DIR`, and the campaign menu and creation are turned off. With both
repositories cloned side by side:

```bash
VAULT_PATH=../my-campaign
# or the template's bundled example:
VAULT_PATH=../DM-Second-Brain/examples/silverbrook-campaign
```

Both settings can be absolute, relative to the app folder, or start with `~/`. Restart
the dev server after changing them.

## Vault format

A campaign declares its format in `dm-second-brain.json` at its root, for example
`{ "vaultFormat": 1 }`. The template's README describes each format.

| App version | Vault formats |
| ----------- | ------------- |
| 0.4.x       | 1             |
| 0.5.x       | 1             |

If a campaign has no `dm-second-brain.json` (made before template 0.4.0), the app assumes
format 1 and shows a small notice. It refuses formats it doesn't know rather than guess,
because a newer format could mark secrets in a way this version doesn't hide.

## Features

- **Wiki browser** with ranked full-text search ([MiniSearch](https://github.com/lucaong/minisearch),
  in-process, no models to download): prefix and typo-tolerant matching, case and accents
  ignored, titles weighted above tags and tags above body text. Filters by `type`,
  `canon_status` and `status`, with options taken from your own frontmatter.
- **Entity sheets** with rendered markdown, clickable `[[wikilinks]]` and a Back button.
  They also show location, faction, tags and `canon_status` (prepared or established).
- **Player Safe** mode for sharing your screen. It hides `secrets/` pages, entities with
  `pg_known: false`, and DM-only sections. Those are `## Secrets (DM only)`, or any
  level-2 heading that names the DM or GM, such as `## Segreti (solo DM)`. Each runs to
  the end of its page. The server enforces the same rules, not only the screen.
- **Session note taker** with `[[` autocompletion at the cursor and a draft kept in the
  browser. Ctrl/Cmd+S saves the recap as the next `raw/sessions/session-NN.md`.
- `_template-*.md` starters, `index.md` and `log.md` are not listed.

> The app acts as **you, the DM**: it writes only your session notes into `raw/sessions/`.
> Turning them into wiki pages is still the agent's job (an *ingest*, see the template's
> `CLAUDE.md`).

## API

All endpoints are local and read the open campaign: the one set by `VAULT_PATH`, or the
one picked in `CAMPAIGNS_DIR`. If it can't be opened, they answer `503` with a message.
Campaigns are named by their folder name (the *id*), never by a path.

- `GET /api/vault` reports whether the campaign can be opened, and which format it uses.
- `GET /api/search` accepts `q`, `mode` (`dm` or `player`; anything else is treated as
  `player`), `type`, `canon` and `status`.
- `GET /api/entity` returns one page and accepts `path` (as returned by search) and `mode`,
  with the same player-safe default. In player mode it answers 404 for hidden pages, the
  same as for missing ones, and removes the DM-only section on the server. It only serves
  pages the search index lists.
- `GET /api/session` returns the next session number. `POST /api/session` saves a recap.
- `GET /api/campaigns` returns the mode (`campaigns-dir`, `vault-path` or `unconfigured`),
  the open campaign's id and title, and the campaigns in `CAMPAIGNS_DIR`.
- `POST /api/campaigns` with `{ "name": "..." }` creates a campaign from the template and
  opens it. `POST /api/campaigns/active` with `{ "id": "..." }` opens another campaign
  (`404` for an unknown id). Both answer `409` when `VAULT_PATH` is set.

## Project structure

This is a Next.js project.

- API endpoints are in `src/app/api/`.
- The page is `src/app/page.tsx`, with components in `src/app/components/`.
- Tests are in `tests/` and run with `pnpm test` (Vitest).
- Utilities are in `src/app/utils/`:
  - `vault.ts` finds and checks the open campaign;
  - `campaigns.ts` lists, opens and creates campaigns;
  - `template.ts` downloads and unpacks the template;
  - `wiki.ts` reads it;
  - `search.ts` builds the index;
  - `secrets.ts` finds DM-only text.

## History

Until v0.3.2 this app lived in the template repository as `dashboard/`. It moved here,
history included, in 0.4.0. Its earlier changes are listed in the
[template's changelog](https://github.com/tzoorlee/DM-Second-Brain/blob/main/CHANGELOG.md).

## License

[MIT](LICENSE)
