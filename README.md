# DM-Second-Brain App

![version](https://img.shields.io/badge/version-0.9.0-blue)
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
release it is built for (currently `v0.6.0`) from GitHub, so it needs an internet
connection. The new campaign gets the template's `CLAUDE.md`, `wiki/`, `raw/`, `output/`,
`TEMPLATES.md`, `dm-second-brain.json` and `.gitignore`, and is opened right away. The folder name comes
from the campaign name; names in other scripts (say "Дракон") get `campaign`,
`campaign-2`, ... and keep their title. To version it, run
`git init` inside it and keep the repository private: `secrets/` is not ignored.

### A new campaign in an old world

To play a new campaign in a world you already built, with other players or years later,
choose **Start from: The world of …** when you create it. The app downloads the template
as usual, then copies the world of the other campaign: the world bible (with the new
name), the setting, the SRD, the worldbuilding and, if you tick the box, the house rules.
The old campaign's wiki goes to `raw/setting/from-<id>/` as history the new players don't
know; its sessions and interludes stay behind, and the old campaign is not changed. The
World Studio then opens on an extra step, **Inherited world**, where you decide with the
AI when the new campaign takes place and what changed meanwhile. Its summary gives you
the commands for the design ingest and, if you want, the ingest of the inherited history.

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
| 0.6.x       | 1             |
| 0.7.x       | 1             |
| 0.8.x       | 1             |
| 0.9.x       | 1             |

If a campaign has no `dm-second-brain.json` (made before template 0.4.0), the app assumes
format 1 and shows a small notice. It refuses formats it doesn't know rather than guess,
because a newer format could mark secrets in a way this version doesn't hide.

## World Studio

Open **World Studio** from the campaign menu (or right after creating a campaign) to build
your world in nine steps: basics, tone and pillars, geography and cosmology, naming, house
rules, the SRD, worldbuilding, the starting point, and a summary. Each step is a chat with
an AI partner next to a live draft of the file it writes:

- you write what you have in mind and discuss it; the AI proposes changes to the draft,
  which you accept or reject, and points out contradictions with earlier steps (and, once
  you have played, with the wiki);
- **Approve step** runs a last coherence check and writes the draft to `raw/`
  (`world-bible.md` by section, `house-rules.md`, `worldbuilding/`); the AI never writes
  files itself;
- the SRD step downloads the 2014 (5.1) or 2024 (5.2.1) rules reference into `raw/srd/`,
  from pinned CC-BY-4.0 markdown conversions, with the attribution;
- the summary gives you the command for the agent's design ingest.

Works with a published setting too: the steps then help you adapt it and record your
deviations from the published canon.

**Between sessions**, once `raw/sessions/` has a recap, the Studio adds two more tools:

- **+ Prepare**: new design for the next sessions (a region, a faction, the next adventure),
  written to a dated file in `raw/worldbuilding/`;
- **+ Interlude**: what happened off-screen since the last session, written to
  `raw/interludes/` with its in-world date; the AI helps you say, fact by fact, what the
  players know.

Both are checked against the wiki (what was played is the strongest constraint). Each shows
its status — draft, written, ingested — and, once written, the command for the agent's
ingest. After the agent has ingested one, it is read-only: start a new one to add more.

**AI credentials**: set `ANTHROPIC_API_KEY` in `.env.local`, or run `ant auth login`. With a
user-level key (`sk-ant-usr…`), also set `ANTHROPIC_WORKSPACE_ID` to the workspace to use. The
nine steps use `claude-opus-5-5` (`STUDIO_MODEL`); Prepare and Interlude use the faster
`claude-sonnet-5-5` (`STUDIO_PREP_MODEL`). Each message costs a few cents
on your Anthropic account; the Studio shows the tokens each step used. Without credentials
the Studio still works: you write the drafts by hand.

**Privacy**: your campaign files and the conversation are sent to Anthropic to answer each
message. Drafts and conversations are saved in the campaign's `.dm-second-brain/` folder;
the agent ignores it.

## Session ingest

After a session, save the recap from the dashboard and choose **Ingest it now** (or
**Ingest sessions** in the campaign menu). The ingest page does what the agent does in a
terminal with `claude "ingest raw/sessions/session-NN.md"`, following the campaign's
`CLAUDE.md` and `TEMPLATES.md`, but nothing reaches the wiki until you approve it:

1. **Discuss**: the agent reads the recap and the pages it touches, then lists the key
   takeaways and asks about anything ambiguous. Answer in the chat; it writes nothing yet.
2. **Proceed**: the agent makes every change (new and updated pages, moved quests, the
   index and the log). Each page appears as "✎ path" while it works; the changes are kept
   in `.dm-second-brain/ingest/session-NN/staged/`, not in the wiki.
3. **Review**: the changes are grouped as new, changed, moved, and index & log, each with a
   line diff against the wiki. Approve or reject each one, or **Ask for changes** with a
   note: the agent rewrites only those pages. The app warns when an approved page links to
   a new page you rejected.
4. **Apply approved** writes the approved pages to `wiki/`. If you edited one of them by
   hand meanwhile, the app shows the conflict and you choose: keep yours or take the
   agent's. The log then names the session, so it reads as ingested.

Sessions are ingested one at a time and in order. Closing the page loses nothing: the
ingest resumes where it was. **Discard** drops it (the wiki is untouched) so you can start
again, for example after editing the recap.

The ingest uses `claude-sonnet-5-5` (`INGEST_MODEL`) with the Studio's credentials. A
session that touches about 15 pages costs well under a dollar on your Anthropic account
(most of the input is served from the prompt cache); the page shows the tokens used. The recap, the pages the agent reads, `CLAUDE.md` and `TEMPLATES.md` are sent
to Anthropic. Without credentials the page shows the terminal command instead.

## Features

- **Wiki browser** with ranked full-text search ([MiniSearch](https://github.com/lucaong/minisearch),
  in-process, no models to download): prefix and typo-tolerant matching, case and accents
  ignored, titles weighted above tags and tags above body text. Filters by `type`,
  `canon_status` and `status`, with options taken from your own frontmatter.
- **Entity sheets** with rendered markdown, clickable `[[wikilinks]]` and a Back button.
  They also show tags, `canon_status` (prepared or established) and every link field of
  the page (location, region, faction, owner, deity, quest giver, adventure...) by the
  linked page's title, plus plain fields such as a PC's player or an event's date.
- **Links between pages**: each sheet ends with **Linked from**, the pages that point to
  it. A quest shows its **Dependencies** (the quests it requires, ✓ when completed, and
  the ones it unlocks); an adventure shows its quests and their status. In Player Safe,
  hidden pages and DM-only text are left out of all of these.
- **Player Safe** mode for sharing your screen. It hides `secrets/` pages, entities with
  `pg_known: false`, and DM-only sections. Those are `## Secrets (DM only)`, or any
  level-2 heading that names the DM or GM, such as `## Segreti (solo DM)`. Each runs to
  the end of its page. The server enforces the same rules, not only the screen.
- **Session note taker** with `[[` autocompletion at the cursor and a draft kept in the
  browser. Ctrl/Cmd+S saves the recap as the next `raw/sessions/session-NN.md`.
- `_template-*.md` starters, `index.md` and `log.md` are not listed.

> The app acts as **you, the DM**: it writes your session notes into `raw/sessions/`, and
> wiki pages only when you apply an ingest you reviewed (see [Session ingest](#session-ingest)).

## API

All endpoints are local and read the open campaign: the one set by `VAULT_PATH`, or the
one picked in `CAMPAIGNS_DIR`. If it can't be opened, they answer `503` with a message.
Campaigns are named by their folder name (the *id*), never by a path.

- `GET /api/vault` reports whether the campaign can be opened, and which format it uses.
- `GET /api/search` accepts `q`, `mode` (`dm` or `player`; anything else is treated as
  `player`), `type`, `canon` and `status`.
- `GET /api/entity` returns one page with its `links` (resolved link fields, `linkedFrom`,
  and the quests it `unlocks`) and accepts `path` (as returned by search) and `mode`,
  with the same player-safe default. In player mode it answers 404 for hidden pages, the
  same as for missing ones, and removes the DM-only section on the server. It only serves
  pages the search index lists.
- `GET /api/session` returns the next session number. `POST /api/session` saves a recap.
- `/api/studio/*`: the World Studio (overview, steps, chat as NDJSON, approve, SRD,
  deviations). Steps are numbers; the browser never sends paths.
- `/api/ingest/*`: session ingest (sessions and status; per session `session-NN`: state,
  start, chat and requested changes as NDJSON, review, page diff, recap, apply, discard).
  Sessions are ids; wiki paths are checked against the slug pattern.
- `GET /api/campaigns` returns the mode (`campaigns-dir`, `vault-path` or `unconfigured`),
  the open campaign's id and title, and the campaigns in `CAMPAIGNS_DIR`.
- `POST /api/campaigns` with `{ "name": "..." }` creates a campaign from the template and
  opens it; add `"from": "<id>"` (and `"copyHouseRules": false` to leave the rules out) to
  start from the world of another campaign. `POST /api/campaigns/active` with `{ "id": "..." }` opens another campaign
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
