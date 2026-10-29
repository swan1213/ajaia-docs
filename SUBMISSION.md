# Submission

**Live app:** `<PASTE RENDER URL HERE>`
**Walkthrough video:** see `VIDEO_URL.txt`
**Test accounts:** alice@ajaia.dev, bob@ajaia.dev, carol@ajaia.dev, password `demo1234` (one click buttons on the login page)

## What's in this folder

| Path | What it is |
|---|---|
| `README.md` | Setup, run, test and deploy instructions, test accounts |
| `ARCHITECTURE.md` | What I prioritized, key decisions, cuts, what's next |
| `AI_WORKFLOW.md` | Which AI tools I used, what I changed or rejected, how I verified |
| `SUBMISSION.md` | This file |
| `VIDEO_URL.txt` | Link to the walkthrough video |
| `backend/` | FastAPI app (`app/`) and pytest suite (`tests/`) |
| `frontend/` | React + TipTap app (Vite) |
| `e2e/` | Headless Chrome test that runs the full multi user flow |
| `docs/screenshots/` | Screenshots of each main flow from the e2e run |
| `Dockerfile`, `render.yaml` | Container build and Render deploy blueprint |

## Status

**Working end to end**
- Create, rename, edit, autosave, reopen docs with bold, italic, underline, strike, headings, bullet/numbered lists, quotes
- Upload .txt / .md / .docx as a new doc, or insert one into an open doc. Other types get a clear error
- Sharing by email with Can edit / Can view, change role, remove access. Owned vs shared split on the dashboard
- Persistence in Postgres (prod) / SQLite (local), formatting preserved exactly
- Edit conflict detection + other people's edits showing up within a few seconds
- Export to Markdown (stretch)
- Viewer vs editor roles (stretch)

**Not done / partial**
- No true real time co-editing or live cursors (polling every 4s + conflict banner instead)
- No version history, comments, images, tables or links
- Basic auth only: no password reset, sessions don't expire

**Next 2-4 hours:** Yjs + websockets for real time editing and presence, version history with restore, comments, session expiry + Alembic migrations.
