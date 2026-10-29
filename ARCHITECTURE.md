# Architecture note

## The short version

React + TipTap on the front, FastAPI + SQLAlchemy on the back, Postgres in prod (SQLite locally). One Docker container serves both the API and the built frontend, deployed on Render's free tier.

```
Browser (React, TipTap)
   |  JSON over /api, bearer token
FastAPI
   |-- access.py   (owner / editor / viewer checks, every route goes through it)
   |-- content.py  (sanitize HTML, convert txt/md/docx, export md)
   |
SQLAlchemy -> Postgres (prod) / SQLite (local + tests)
```

## What I prioritized and why

With ~4 hours I went for "the core loop is solid" over "lots of features". The things I cared most about:

1. **The editor actually feels good.** TipTap (ProseMirror) gives me a real rich text model, keyboard shortcuts, undo and lists for free. Writing my own contenteditable thing would have eaten the whole timebox and been buggy.
2. **Sharing is correct.** This is where a bug actually hurts (someone sees a doc they shouldn't). So all permission logic lives in one function, `load_doc(db, doc_id, user, need)`, and every route calls it. Most of the backend tests are about access rules.
3. **You don't lose work.** Autosave with a debounce, a save status next to the title, a warning if you close the tab with unsaved changes, and version checks so two people saving at once doesn't silently clobber someone.

## Key decisions

**Storing content as HTML, not ProseMirror JSON.** TipTap reads and writes both. I went with HTML because the file import pipeline (markdown, mammoth for docx) already outputs HTML, export to markdown is one library call, and it's easy to eyeball in the DB. The tradeoff is HTML is a looser format, so the server runs every save and every import through `nh3` with an allowlist of only the tags the editor can produce. That also means a crafted API call can't store a `<script>` in a doc someone else opens.

**Optimistic concurrency instead of real time collab.** Each doc has a `version`. Saves send `base_version`, and if it doesn't match the server returns 409 with the latest copy. The UI then shows a banner: "Load their version" or "Keep mine". On top of that, the editor polls every 4 seconds and pulls in other people's changes when you have nothing unsaved, so collaborators see each other's edits without a refresh. This is not Google Docs level merging, but it's honest about conflicts and it's maybe 60 lines instead of a CRDT + websocket server. Real time (Yjs + websockets) is the first thing I'd add next.

**Simple auth.** Seeded users plus a basic register form, PBKDF2 password hashes, random bearer tokens stored in a `sessions` table (logout just deletes the row). No OAuth, no email verification, no password reset. Enough to demo sharing between real accounts without pretending to be a full auth system.

**404 instead of 403 for docs you can't see.** If you're not the owner and not shared, the API says "not found" so doc ids don't leak. Once you do have access, missing permissions return 403 with a clear message ("You only have view access").

**Two upload flows, same converter.** "Upload a file" on the dashboard creates a new doc. "Insert file" in the editor converts and inserts at the cursor without creating anything. Both go through `file_to_html` which checks extension, size (2 MB) and empty files, and gives a readable error for corrupt docx.

**One container.** FastAPI serves the built React app with an SPA fallback (so refreshing `/docs/12` works). One service to deploy, no CORS setup, and Render's blueprint wires in Postgres automatically.

## What I cut on purpose

- Real time co-editing and cursors (polling + conflict detection instead)
- Comments, suggestions, version history
- Images, tables, links, font colors (links are turned off in the editor since the sanitizer strips hrefs anyway)
- PDF import (would need OCR/layout handling to be useful)
- Proper auth (OAuth, password reset, session expiry)
- Folders, search, trash/restore
- Migrations (tables are created on startup; fine for a demo, I'd add Alembic before any real data)

## Known limitations

- "Keep mine" in a conflict overwrites the other person's version. There's no merge.
- Polling means another person's edit shows up within ~4 seconds, not instantly.
- Sessions never expire.
- Free Render tier sleeps when idle, so the first request after a while is slow.
- The JS bundle is ~680 KB (TipTap + React). Could code split, didn't matter at this scope.

## What I'd build next with another 2-4 hours

1. Real time editing with Yjs + a websocket provider, plus presence (who else is in the doc)
2. Version history: snapshot on each save (we already bump a version number) and a restore button
3. Comments anchored to text ranges
4. Session expiry + Alembic migrations
