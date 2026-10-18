# World Studio — design

Date: 2026-10-18 · Repositories: DM-Second-Brain (template) and DM-Second-Brain-app ·
Status: approved in chat, awaiting spec review

## Goal

A guided space in the app where the DM builds and grows a campaign's world with an AI
partner: it asks, proposes and checks coherence, and the DM decides what becomes canon.
It covers the start of a campaign (a step-by-step tutorial), preparation between
sessions, events that happen off-screen, and reusing a world for a new campaign.

What the DM asked for:

- a tutorial to create new worlds/campaigns that helps fill the starting files
  (`raw/worldbuilding/`, house rules, whether to use the SRD...);
- an AI that discusses each step until the DM is happy, remembers earlier steps, and
  points out and helps fix inconsistencies between them;
- reopening worldbuilding at any time, even after session 134;
- material made between sessions is either preparation or a "ghost session";
- published settings (Forgotten Realms...) as well as invented worlds;
- reusing a world made for one campaign in a new campaign with other players.

Decisions taken while designing:

- guided path with an AI that proposes (not plain forms, not chat-only);
- each step is a **chat next to a live draft**; the AI proposes edits the DM accepts or
  rejects; it never writes files;
- files are written **step by step** on approval; the Studio's state is saved, so work
  can stop and resume;
- the Studio stays available forever: after the first session, new preparation goes to
  new dated files and coherence is checked against the wiki too;
- between sessions there are two kinds of material: **Prepare** (design → `prepared`
  pages) and **Interlude** (off-screen events → `established`, `pg_known: false`);
- SRD: the DM picks the edition (2014 / 5.1, 2024 / 5.2.1, none) and the app downloads a
  markdown conversion;
- published settings: steps "adapt" instead of "invent"; the world-bible records the
  setting, sources and the DM's deviations; published lore enters canon only through
  DM-approved files in `raw/`;
- reusing a world: "New campaign" can copy the world of another campaign (a copy, not a
  shared world);
- design ingest stays in the terminal (`claude` in the campaign folder); running the
  agent from the app is a separate, later project.

Out of scope: ingest from the app; a shared world referenced by several campaigns;
importing PDFs or copyrighted books; multi-user editing.

## Parts

The work ships in parts, each with its own plan, PR and release; each works on its own.

1. **Template 0.6.0** — `raw/interludes/`, `raw/setting/`, world-bible "Campaign" and
   "Setting" sections, `CLAUDE.md` rules. Detailed in section A.
2. **App: World Studio** — steps 1–9, chat with live draft, coherence check, saved
   state, credentials, homebrew / published / mixed worlds, SRD download. Detailed in
   section B.
3. **App: Prepare and Interlude** — the Studio after the campaign has started. Outline
   in section C.
4. **App: new campaign from another campaign's world**. Outline in section D.
5. **Later, separate: ingest from the app** (Claude Agent SDK). Not specified here.

Parts 3 and 4 get a short design pass of their own before their plans; this spec fixes
their boundaries and the contracts they rely on.

---

## A. Template 0.6.0

Vault format stays **1**: all additions are new folders, new sections and new rules.

**New `raw/` folders**

- `raw/interludes/README.md`: events the DM declares happened off-screen between
  sessions. One file per interlude, `YYYY-MM-DD-<slug>.md` (real date), starting with a
  frontmatter `date_in_world: "YYYY-Month-DD"` and `after_session: session-NN`.
- `raw/setting/README.md`: reference material for a published setting, or the history of
  another campaign this one inherits (part 4). Read by the agent as a source; the DM's
  own notes and excerpts from books they own may go here.

**World-bible** (`raw/world-bible.md`) gains two sections at the top, before "Tone and
Atmosphere":

- `## Campaign`: name, output language, starting level, rules edition (`SRD 5.1`,
  `SRD 5.2.1` or `none`), date the campaign starts in the world.
- `## Setting`: `Homebrew`, `Published: <name>` or `Mixed: <name> + homebrew`; sources
  (books, adventures); **Deviations** from the published canon, one per line.

The existing sections keep their headings; the Studio edits sections by heading, so
headings are a contract (English, never translated, like `## Secrets (DM only)`).

**`CLAUDE.md`**

- §1: `raw/interludes/` and `raw/setting/` in the architecture; `.dm-second-brain/` is
  the companion app's working folder: never read it as a source, never edit it.
- §2: a new **INTERLUDE INGEST** operation: like a session ingest, but pages created or
  changed are `established` with `pg_known: false` unless the interlude says the PCs
  know; events are dated with the interlude's `date_in_world`; log type `interlude`.
- §2 design ingest: after the first session exists, design material comes as new dated
  files in `raw/worldbuilding/`; ingest each new file once, in date order.
- §8: `raw/setting/` is canon for the world only through what the DM approved there; when
  the world-bible's Setting lists deviations, they win over published lore. Lore the
  agent knows from outside `raw/` is never canon (rule 2 unchanged).
- Lint: an interlude or worldbuilding file never ingested (no log line) is reported.

Release: template 0.6.0 with README, CHANGELOG, tag and pre-release. The app's
`TEMPLATE_RELEASE` moves to `v0.6.0` in part 2.

---

## B. App: World Studio

### B.1 Entry points

- Page `/studio` (dashboard unchanged). Reached from **World Studio** in the campaign
  menu; with `VAULT_PATH` it's in the dashboard header.
- After "New campaign": "Prepare the world now?" — Yes opens the Studio, Later the
  dashboard.

### B.2 Steps and files

| # | Step | Writes |
|---|---|---|
| 1 | Basics (name, language, world type: homebrew / published / mixed, starting level) | world-bible `## Campaign`, `## Setting`; `CLAUDE.md` configuration lines "Output language" and "Campaign name" |
| 2 | Tone and pillars | world-bible: Tone and Atmosphere, Lore Pillars, Things that do NOT exist in this world, Style notes for the agent |
| 3 | Geography and cosmology | world-bible: Basic Geography, Cosmology (calendar choice included) |
| 4 | Naming conventions | world-bible: Naming Conventions |
| 5 | House rules | `raw/house-rules.md` |
| 6 | SRD | `raw/srd/` (download) and the edition in world-bible `## Campaign` |
| 7 | Worldbuilding | one file per topic in `raw/worldbuilding/`: `regions.md`, `cities.md`, `factions.md`, `npcs.md`, `deities.md`, `lore.md` (only the topics the DM uses) |
| 8 | Starting point | `raw/worldbuilding/starting-point.md` |
| 9 | Summary | nothing: final coherence check, list of files, design ingest command |

- Steps 1–4 each own **their sections** of the world-bible and rewrite only those,
  located by `## ` heading; the rest of the file is untouched.
- Every step can be skipped and reopened; an approved step can be edited and approved
  again (it rewrites its sections/files).
- Published setting: steps 2–4 and 7 "adapt" (what applies, what the DM changes); the AI
  marks claims from published lore as "verify against your books"; deviations the DM
  confirms are added to `## Setting` → Deviations.

### B.3 Studio state

- `.dm-second-brain/studio/` at the campaign root (the app creates it):
  `step-<n>.json` = `{ status: 'todo'|'in-progress'|'approved', draft, messages, usage }`.
- `messages` keeps the conversation as sent to the API (content blocks preserved).
- The app writes only: the files in B.2, `raw/srd/`, `.dm-second-brain/`, and the two
  `CLAUDE.md` configuration lines — always after the DM's approval. Never `wiki/`.
- Writes go through one module that resolves paths inside the open campaign and refuses
  anything else (same discipline as `campaigns.ts`).

### B.4 The AI

- Route `POST /api/studio/chat` `{ step, message }` → streamed response. Server-side
  only; the browser never sees credentials.
- `@anthropic-ai/sdk`, model `claude-opus-5` (override: `STUDIO_MODEL` in `.env.local`),
  adaptive thinking, streaming, server-side fallbacks on refusals enabled by default
  (dark themes are common in D&D).
- Credentials: the SDK's default chain (`ANTHROPIC_API_KEY` or an `ant auth login`
  profile). `GET /api/studio/status` reports whether the AI is available. Without
  credentials the chat is hidden and the draft stays editable by hand.
- System prompt: the role (worldbuilding partner; discusses and proposes, never decides
  canon; writes in the campaign's language; labels published lore); the step's brief
  (goal, sections, guiding questions); the fixed-marker rule.
- Context, prompt-cached: world-bible, house-rules, approved step files, setting notes;
  once a session exists, `wiki/index.md` and the pages the existing search finds for the
  message (DM mode).
- Two custom tools, strict schemas, handled by the app:
  - `propose_edit { section, new_text, reason }` → a pending change on the draft;
  - `report_inconsistency { file, quote, problem, proposed_fix, severity: 'error'|'warning' }`.
- On **Approve**: a separate call with structured output returns the inconsistencies
  between the draft, approved steps and the wiki. Each is shown with: fix here / fix the
  other file (applies `proposed_fix` to that file's step draft, needs that step
  re-approved) / keep (for published lore: add to Deviations). The file is written when
  none is left open.
- Token usage per step is stored and shown.

### B.5 Interface

- Three columns: steps (○ todo, ● in progress, ✓ approved; "Prepare" and "Interlude"
  below, enabled by part 3) · chat (streamed answers; inconsistency cards with their
  buttons) · draft (the step's sections, editable; AI proposals highlighted with
  accept ✓ / reject ✗; **Approve step**).
- Narrow screens: tabs Steps / Chat / Draft.
- Step 1: a small form (name, language, world type, published setting name and sources,
  starting level) plus the chat.
- Step 5: a checklist of common variants at the top of the draft; checked ones become
  rules.
- Step 6: three options and **Download** with progress; no chat.
- Step 9: files written, final coherence result, the command
  `cd <campaign> && claude "design ingest of raw/worldbuilding"` to copy, with two lines
  on what it does.
- Errors: AI or network errors appear in the chat and keep the draft; a failed SRD
  download can be retried; leaving with an unsaved draft asks first.

### B.6 SRD download

- Two pinned sources (edition → repository, commit or tag, folder, license file),
  verified during planning: a CC-BY-4.0 markdown conversion of SRD 5.1 and one of SRD
  5.2.1. Candidates found: OldManUmby/DND.SRD.Wiki (5.1), downfallx/dnd-5e-srd-markdown
  (5.2.1).
- Downloaded as a GitHub tarball (the `tar` dependency is already there), extracted into
  `raw/srd/` with the same path filter as the template (no links, no `..`), plus
  `raw/srd/ATTRIBUTION.md` with the CC-BY-4.0 attribution text.
- Choosing "none" writes nothing in `raw/srd/` and records `none` in the world-bible.

### B.7 Template release

- `TEMPLATE_RELEASE` → `v0.6.0` (part 1 must be released first).

---

## C. App: Prepare and Interlude (outline)

- Enabled once `raw/sessions/session-*.md` exists (before that, the steps cover it).
- **Prepare**: a chat + draft that writes a new `raw/worldbuilding/YYYY-MM-DD-<slug>.md`.
- **Interlude**: a chat + draft that writes `raw/interludes/YYYY-MM-DD-<slug>.md` with
  `date_in_world` and `after_session`.
- Coherence always includes the wiki; `established` pages are the strongest constraint.
- The summary shows the command for the right ingest (design or interlude).

## D. App: new campaign from another campaign's world (outline)

- "New campaign" offers: from scratch / from the world of `<campaign>`.
- Copied: `raw/world-bible.md`, `raw/house-rules.md` (optional), `raw/srd/`,
  `raw/setting/`, `raw/worldbuilding/`; the source campaign's `wiki/` copied into
  `raw/setting/from-<source-id>/` as reference (established history, unknown to the new
  group). Sessions, interludes, the wiki itself and `.dm-second-brain/` are not copied.
- The source campaign is not changed.
- The new campaign's Studio starts with an extra step, **Inherited world**: when the new
  campaign takes place and what changed meanwhile, checked against the inherited history.

---

## Security and safety

- The AI never writes files; every change is a proposal the DM accepts.
- The app writes only inside the open campaign, to the paths listed in B.3; the browser
  sends a step number, never a path.
- Credentials stay on the server; nothing about them reaches the browser except
  "available / not available".
- Material in `raw/setting/` is the DM's own; it is passed to the model as content, not
  as instructions.
- Local-only app, as before.

## Verification

- Part 1: grep checks on the new rules and READMEs; the example campaign still opens in
  the app.
- Part 2: Vitest for the world-bible section editor (rewrite only the step's sections,
  keep the rest byte-for-byte), Studio state load/save, path guard, SRD extraction filter
  and attribution, step file mapping, tool-call handling (propose/report) with a mocked
  model client, approval flow with inconsistencies; one manual end-to-end run with real
  credentials on a scratch campaign; headless-browser screenshots of the three-column
  layout and the narrow layout.
- Each part ends with a PR; the app's versions: part 2 → 0.7.0, part 3 → 0.8.0,
  part 4 → 0.9.0.
