# Session ingest from the app — design

Date: 2026-10-18 · Target: app 0.10.0 · Template unchanged (vault format 1) ·
Status: approved in chat, awaiting spec review

## Goal

Do in the app what the DM does today in a terminal with `claude`: turn a session recap
(`raw/sessions/session-NN.md`) into wiki updates, following the campaign's `CLAUDE.md`
and `TEMPLATES.md`. The agent discusses the session with the DM first, then prepares
every change in a staging area; nothing reaches the wiki until the DM reviews and
approves it.

Decisions taken while designing:

- **the agent proposes, the DM approves**: all writes go to a staging copy; the DM
  reviews each page (diff), approves, rejects or asks for changes, then applies;
- five phases: **discuss → work → review → (changes) → apply**, matching `CLAUDE.md`'s
  INGEST (step 2: discuss before writing);
- **sessions only** for now; design, interlude and inherited-history ingests come later on
  the same machinery;
- engine: **Messages API with app-defined tools** (`@anthropic-ai/sdk`, as the World
  Studio), not the Claude Agent SDK or Managed Agents;
- model `claude-sonnet-5-5` (`INGEST_MODEL`).

Out of scope: other ingest kinds; re-ingesting an applied session from the app; lint;
multi-user use.

## 1. Ingest sessions and staging

- The list of sessions comes from `raw/sessions/session-NN.md`. A session is
  **ingested** when `wiki/log.md` names it (the INGEST log line
  `## [<date> | session-NN] ingest — …`; the app matches `| session-NN]` or the file
  path).
- **One session at a time, in order**: a session can start only when every earlier
  session is ingested and no other ingest is open.
- State in `.dm-second-brain/ingest/session-NN/`:
  - `state.json`: `phase` (`discuss` | `working` | `review` | `applied` | `discarded`),
    `messages` (API format, as the Studio), `changes` (below), `summary` (from `finish`),
    `usage`, `sourceMtime` (the recap's mtime when the ingest started),
    `reads` (wiki path → mtime when the agent first read it);
  - `staged/`: mirrors `wiki/`, holding only files the agent created or rewrote.
- `changes`: one entry per touched path:
  `{ path, kind: 'new' | 'changed' | 'moved', from?: string, review: 'pending' | 'approved' | 'rejected', note?: string }`.
  A moved page is recorded as `moved` with `from` (its content staged at the new path).
- Reading for the agent: a page's staged version if any, else the real wiki file. Search:
  the app's existing index over the real wiki, plus a plain-text match over staged files.
- Paths the tools accept: relative to `wiki/`, segments of slug characters
  (`[a-z0-9-]`, `.md` files), no `..`; `index.md` and `log.md` allowed. `raw/` is
  readable only through `read_source`. The real wiki is written only by **apply**.
- Closing the page loses nothing: reopening resumes the phase. An applied session can't be
  ingested again from the app.

## 2. The agent

- Model `claude-sonnet-5-5` (`INGEST_MODEL`), same options as the Studio (beta messages,
  `fallbacks: "default"` with `server-side-fallback-2026-07-01`, adaptive thinking,
  streaming), same credentials (`ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, or
  `ant auth login`).
- System prompt (cached): the campaign's `CLAUDE.md` and `TEMPLATES.md` (when
  `TEMPLATES.md` is missing — campaigns created before template 0.5.0 — the app downloads it
from the pinned template release on GitHub and caches it in `.dm-second-brain/`), plus an app preamble:
  you run inside the companion app; you change files only through the tools; the DM
  reviews every change; in the discuss phase present key takeaways and ask about
  ambiguities, write nothing; in the work phase make all the changes, then call `finish`.
- Tools (strict schemas):

| Tool | Discuss | Work |
|---|---|---|
| `read_source(file)` — `session` (this recap), `world-bible`, `house-rules`, or an `raw/srd/…` path | ✓ | ✓ |
| `list_pages(folder)` · `search_wiki(query)` · `read_page(path)` | ✓ | ✓ |
| `write_page(path, content)` — whole page | — | ✓ |
| `move_page(from, to)` | — | ✓ |
| `append_log(line)` — appended to the staged `log.md` | — | ✓ |
| `finish(summary)` | — | ✓ |

- Write checks before staging (an error tool_result on failure, so the agent fixes it):
  path rules above; a page other than `index.md`/`log.md` has parseable frontmatter with a
  `type`; DM-only headings use exactly `## Secrets (DM only)`; `append_log` lines start
  with `## [`.
- Phases:
  - **discuss** starts automatically: the agent reads the recap and the relevant pages and
    posts takeaways and questions; the DM answers in chat; **Proceed** (or saying so) moves
    to **working**;
  - **working**: the agent writes; each staged path is streamed to the UI; it ends with
    `finish` (→ **review**) or after 40 rounds (→ the DM is told and can Continue);
  - **changes requested** in review send the agent back to **working** with the notes and
    the list of pages to redo; it rewrites those and calls `finish` again.
- Context: tool results older than the last few turns are cleared with the API's context
  editing (`context-management-2025-06-27`, `clear_tool_uses_20250919`); token usage is
  shown.

## 3. Review and apply

- Review screen: the agent's summary; the list of changes grouped New / Changed / Moved /
  index & log, each pending / ✓ / ✗; for the selected page: a new page rendered, a
  changed page as a line diff against the real wiki, a moved page as from → to plus diff.
  Per page: **Approve**, **Reject**, **Ask for changes** (note). Global: **Approve all**,
  **Apply approved**.
- Before applying, a link check: an approved page whose frontmatter link fields or text
  links point to a page that is new in this ingest but rejected → warning listing them;
  the DM can approve those too or apply anyway.
- Apply:
  1. conflict check: for each approved change to an existing page, if the real file's
     mtime is newer than the mtime recorded in `reads` (or the file changed since the
     agent first read it), it is listed as a conflict; the DM keeps theirs (the change is
     rejected) or takes the agent's;
  2. writes approved pages atomically, performs approved moves (delete `from`, write `to`),
     writes the staged `index.md` and `log.md` if approved;
  3. if the staged `log.md` wasn't approved or has no line for this session, the app appends
     `## [unknown date | session-NN] ingest — applied from the app (raw/sessions/session-NN.md)` so the session reads as ingested;
  4. phase `applied`; `staged/` is deleted; `state.json` stays as a record.
- The search index rebuilds on its own (it keys on file mtimes); the dashboard shows the
  new pages on reload.
- Discard: an ingest can be discarded at any phase before apply (phase `discarded`,
  staged files deleted); the session can then be ingested again.

## 4. Interface, errors, verification, release

- Page `/ingest`: left, sessions with status (not ingested / in progress / ingested ✓);
  centre, chat (agent takeaways and questions, DM answers, **Proceed**, live "✎ path"
  lines while working, **Continue** after an interruption, **Discard**); right, in review
  the changes list and diff, otherwise the session recap (read-only).
- Entry points: "Ingest it now" after **Save Session Recap** in the dashboard; **Ingest
  sessions** in the campaign menu; a header link in `VAULT_PATH` mode.
- Errors: network, refusal or cut-off answers keep phase and staging and offer Continue;
  another open ingest → message; the recap changed during the ingest (mtime) → suggest
  discarding and restarting; no credentials → explanation plus the terminal command
  `claude "ingest raw/sessions/session-NN.md"`.
- Security: the tools can't reach outside `wiki/` (writes, staged) and the listed
  sources (reads); the real wiki is written only by apply, after the DM's approval;
  campaign content goes to the model as content, never as instructions to the app.
- Verification: Vitest with a fake model for tools (path rules, staged-over-real reads,
  move), phases (no write tools in discuss), write checks, review actions, the rejected-link
  warning, apply (conflict, moves, log making the session ingested), session order and the
  single open ingest; a real run on a copy of Silverbrook with a written session 03
  (discuss, work, review with one change request, apply, dashboard shows the pages); an
  independent final review.
- Release: app 0.10.0; README (ingest from the app, cost, privacy), CHANGELOG,
  `.env.example` (`INGEST_MODEL`).
