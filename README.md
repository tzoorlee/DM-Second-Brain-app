# Companion Dashboard

This is the local web-based graphical interface for **Dungeon Master Second Brain**. It is designed to be run locally during your sessions to search the campaign wiki, view NPC profiles (with DM-only secrets), and write session recaps.

> [!WARNING]
> This dashboard is designed and intended for **local use only** (`localhost`). It lacks authentication and session-level isolation, so **do not deploy or expose this dashboard to the web**.

## Getting Started

First, install dependencies:

```bash
pnpm install
```

Then, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access the dashboard.

## Using a Campaign Stored Elsewhere

By default the dashboard reads the campaign vault (the folder containing `wiki/` and `raw/`)
from the folder above `dashboard/`. To point it at another campaign, set `VAULT_PATH`:

```bash
cp .env.example .env.local
# then edit .env.local, e.g.:
# VAULT_PATH=../examples/silverbrook-campaign
```

`VAULT_PATH` can be absolute or relative to `dashboard/`. Restart the dev server after changing it.

## Search

The wiki browser uses [MiniSearch](https://github.com/lucaong/minisearch), an in-process
full-text index — no extra services or models. The index is built on the first search
and rebuilt automatically whenever a wiki page is added, changed or removed.

- Ranked results with prefix and typo-tolerant matching; case and accents are ignored.
- Titles weigh more than tags, tags more than body text.
- Filters by `type`, `canon_status` and `status` (options come from your own frontmatter).
- **Player Safe** mode hides `secrets/` pages and entities with `pg_known: false`, and
  never matches text inside `## Secrets (DM only)` sections.
- `_template-*.md` starters, `index.md` and `log.md` are not listed.

`GET /api/search` accepts `q`, `mode` (`dm` or `player`; anything else is treated as
`player`), `type`, `canon` and `status`.

## Project Structure

This is a Next.js project.

- API endpoints are located in `src/app/api/`
- Frontend logic and components are in `src/app/page.tsx`
- Utilities are in `src/app/utils/` (`wiki.ts` reads the vault, `search.ts` builds the index)
