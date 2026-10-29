# Ajaia Docs

A small Google Docs style editor. You can create docs, format them, upload files into them, share them with other people, and everything persists.

**Live app:** `<PASTE RENDER URL HERE>`

## Test accounts

All passwords are `demo1234`. The login page also has one click buttons for these.

| User | Email | What they show |
|---|---|---|
| Alice | alice@ajaia.dev | Owns the "Welcome to Ajaia Docs" doc |
| Bob | bob@ajaia.dev | Has **edit** access to the welcome doc |
| Carol | carol@ajaia.dev | Has **view only** access to the welcome doc |

You can also make a new account from the login page and share docs with it.

Quick way to see sharing: open the app in a normal window as Alice and a private window as Bob. Edit as Bob and Alice's tab picks up the change within a few seconds.

## What works

- Create, rename (click the title), edit, autosave, reopen docs
- Formatting: bold, italic, underline, strikethrough, H1/H2/H3, bullet and numbered lists, quotes, undo/redo, clear formatting. Keyboard shortcuts work too (Ctrl+B/I/U, Ctrl+S to save right away)
- **File upload:** `.txt`, `.md`, `.docx` (max 2 MB)
  - From the dashboard: "Upload a file" turns it into a new editable doc (title comes from the filename)
  - Inside a doc: "Insert file" drops the file content at your cursor
  - Anything else (pdf, images, etc) gets a clear error message
- **Sharing:** owner shares by email as "Can edit" or "Can view", can change the role or remove people. Dashboard splits "My documents" vs "Shared with me" with the owner name and your access level
- **Persistence:** Postgres in prod, SQLite locally. Content is stored as sanitized HTML so formatting round trips exactly
- Edit conflict handling: if two people save on top of each other you get a banner instead of silently losing someone's work
- Export any doc to Markdown

## Run it locally

You need Python 3.11+ and Node 20+.

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

This creates `backend/ajaia_docs.db` (SQLite) and seeds the 3 demo users plus the welcome doc on first start.

### 2. Frontend (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the backend on port 8000.

### Single server mode (how prod runs)

```bash
cd frontend && npm install && npm run build
cp -r dist ../backend/static
cd ../backend && uvicorn app.main:app --port 8000
```

Then open http://localhost:8000. FastAPI serves the built React app and the API from one process.

### Docker

```bash
docker build -t ajaia-docs .
docker run -p 8000:8000 ajaia-docs
```

## Tests

### Backend (pytest, 21 tests)

```bash
cd backend
pytest -q
```

Covers the access rules (private docs return 404 to others, viewers can't edit, editors can't reshare or delete, revoking access works), the stale save / 409 conflict logic, HTML sanitizing, and file import for txt/md/docx plus bad files. To run the same suite on Postgres:

```bash
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/ajaia_test pytest -q
```

### End to end UI flow (headless Chrome)

With the app running on :8000 against a fresh DB:

```bash
cd e2e
npm install
npm test        # or: CHROME_PATH=/path/to/chrome npm test
```

It logs in as Alice, Bob and Carol in separate browser contexts and checks formatting survives a reload, rename, sharing, live update between users, the conflict banner, read only for viewers, upload and the bad upload error. It writes screenshots to `e2e/screenshots/`.

## Deploying (Render, free)

The repo has a `render.yaml` blueprint that creates a free Docker web service and a free Postgres.

1. Push this folder to a GitHub repo
2. In Render: New > Blueprint > pick the repo > Apply
3. Wait for the build, then open the `.onrender.com` URL

Heads up: free Render services sleep after ~15 min idle, so the first load can take 30 to 60 seconds.

Env vars:

| Var | Default | What it does |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./ajaia_docs.db` | Any SQLAlchemy URL. `postgres://` urls are handled |
| `SEED_DEMO` | `1` | Seed demo users + welcome doc if the DB is empty |
| `STATIC_DIR` | `backend/static` | Where the built frontend lives |

## Project layout

```
backend/
  app/
    main.py          app setup, error handler, serves the SPA
    models.py        User, Session, Document, Share
    access.py        the one function that decides who can view/edit/own a doc
    routes_docs.py   docs CRUD, import/convert, export, sharing
    routes_auth.py   login, register, logout, user list
    content.py       sanitizing + file conversion (txt/md/docx) + markdown export
    security.py      password hashing, bearer token sessions
    seed.py          demo data
  tests/             pytest suite
frontend/
  src/pages/         Login, Dashboard, EditorPage
  src/components/    Toolbar, ShareDialog, Header
  src/api.js         fetch wrapper
e2e/                 headless browser flow test
docs/screenshots/    screenshots of the main flows
```

See `ARCHITECTURE.md` for the why behind the choices and `AI_WORKFLOW.md` for how I used AI.
