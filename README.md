# Companion Dashboard

This is the local web-based graphical interface for **Dungeon Master Second Brain**. It is designed to be run locally during your sessions to search the campaign wiki, view NPC profiles (with DM-only secrets), and write session recaps.

> [!WARNING]
> This dashboard is designed and intended for **local use only** (`localhost`). It lacks authentication and session-level isolation, so **do not deploy or expose this dashboard to the web**.

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access the dashboard.

## Project Structure

This is a Next.js project.

- API endpoints are located in `src/app/api/`
- Frontend logic and components are in `src/app/page.tsx`
- Utilities are in `src/app/utils/`
