# DateTheMoment — First customer workspace

A React + TypeScript frontend replacement for the default Vite welcome screen.

## Installation in /workspaces/datethemoment-theplatform

1. Upload `dtm-platform-first-screen.zip` into the Codespace root (alongside `package.json`).
2. Run:

```bash
unzip -o dtm-platform-first-screen.zip -d .
npm install lucide-react
npm run build
```

3. If you have `npm run dev -- --host 0.0.0.0` running in another terminal, your iPad preview should refresh without a new deployment. If the dev server was stopped, restart it.

## What actually works

- Create a demo club with its sport and name.
- Club information, events, and captions persist in the browser's localStorage.
- Add real match/training events, view them, delete events.
- Generate **template-based** event captions and edit/copy the drafts.
- Change organization colors and tagline.
- Download a native-canvas PNG match/training graphic (1080 × 1350).
- Responsive desktop and tablet UI.

## What does NOT exist yet

- No real login, account verification, database, team-member permissions, Make.com provisioning, PDF parsing, Google Sheets connection, AI captions or social posting. This is a local demo with no cross-device synchronization. Do not treat it as production SaaS.
- The PDF import tile is intentionally labeled `coming next`; it is not a functional upload.

## Next real milestone

Add Supabase project (Auth + Postgres + Storage), organization and membership tables with RLS, then a **server-only** provisioning job triggered by organization creation, never login. Use the Make API token only on the server, with a unique organization ID and idempotent provisioning status.
