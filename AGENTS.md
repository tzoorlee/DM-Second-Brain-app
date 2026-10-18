<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Project note

This is the DM-Second-Brain app: a local companion for campaigns built with the
DM-Second-Brain template (https://github.com/tzoorlee/DM-Second-Brain). The campaign
wiki rules live in the campaign's own `CLAUDE.md`, not here.

The app reads a vault set by `VAULT_PATH`. It supports the vault formats listed in
`SUPPORTED_VAULT_FORMATS` (`src/app/utils/vault.ts`). Raise that list only after the app
handles every change in the new format, above all how DM secrets are marked.
