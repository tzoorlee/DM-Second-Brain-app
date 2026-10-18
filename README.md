# DM-Second-Brain App

![version](https://img.shields.io/badge/version-0.4.0-blue)
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

You need Node.js 20 or newer and [pnpm](https://pnpm.io), plus a campaign folder made
from the template (it holds `wiki/` and `raw/`).

```bash
git clone https://github.com/tzoorlee/DM-Second-Brain-app.git
cd DM-Second-Brain-app
pnpm install
cp .env.example .env.local
# edit .env.local and set VAULT_PATH to your campaign folder
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). If `VAULT_PATH` is missing or wrong,
the app shows a setup screen that explains what to fix.

`VAULT_PATH` can be absolute or relative to the app folder. With both repositories cloned
side by side:

```bash
VAULT_PATH=../my-campaign
# or the template's bundled example:
VAULT_PATH=../DM-Second-Brain/examples/silverbrook-campaign
```

Restart the dev server after changing it.

## Vault format

A campaign declares its format in `dm-second-brain.json` at its root, for example
`{ "vaultFormat": 1 }`. The template's README describes each format.

| App version | Vault formats |
| ----------- | ------------- |
| 0.4.x       | 1             |

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

All endpoints are local and read the vault set by `VAULT_PATH`. If the vault can't be
opened, they answer `503` with a message.

- `GET /api/vault` reports whether the campaign can be opened, and which format it uses.
- `GET /api/search` accepts `q`, `mode` (`dm` or `player`; anything else is treated as
  `player`), `type`, `canon` and `status`.
- `GET /api/entity` returns one page and accepts `path` (as returned by search) and `mode`,
  with the same player-safe default. In player mode it answers 404 for hidden pages, the
  same as for missing ones, and removes the DM-only section on the server. It only serves
  pages the search index lists.
- `GET /api/session` returns the next session number. `POST /api/session` saves a recap.

## Project structure

This is a Next.js project.

- API endpoints are in `src/app/api/`.
- The page is `src/app/page.tsx`, with components in `src/app/components/`.
- Utilities are in `src/app/utils/`:
  - `vault.ts` checks the vault;
  - `wiki.ts` reads it;
  - `search.ts` builds the index;
  - `secrets.ts` finds DM-only text.

## History

Until v0.3.2 this app lived in the template repository as `dashboard/`. It moved here,
history included, in 0.4.0. Its earlier changes are listed in the
[template's changelog](https://github.com/tzoorlee/DM-Second-Brain/blob/main/CHANGELOG.md).

## License

[MIT](LICENSE)
