# AI workflow note

## Tools I used

- **Claude (Opus 5.5) in the Claude app** as my main coding agent. It had a Linux sandbox with Python, Node and a shell, so it could write files, install packages, run the tests and drive a headless browser.
- That's it. No Copilot or other assistants for this one.

## How I used it

I treated it like a fast pair who types for me, and I kept the decisions. Roughly:

1. Pasted the assignment and decided the stack and scope up front (FastAPI because Python is what I'm fastest in, TipTap so I don't hand roll an editor, versioning + polling instead of real time collab).
2. Had it scaffold the backend first (models, access rules, routes) and write the pytest suite right after, then fixed whatever failed before moving to the UI.
3. Built the frontend, then had it write a headless Chrome script that logs in as three users and clicks through the whole flow. That script is in `e2e/` and it's what actually caught the real bugs.
4. Looked at the screenshots from every run and fixed what looked off.

## Where AI really sped things up

- Boilerplate I'd otherwise spend an hour on: SQLAlchemy models, pydantic schemas, the fetch wrapper, all the CSS.
- Writing a lot of tests fast, including the annoying ones like building a minimal `.docx` zip by hand inside a test so docx import is tested without a fixture file.
- Setting up a headless browser in a locked down sandbox (the normal Playwright download was blocked, so it found a Chromium build that ships inside an npm package).
- Spinning up a throwaway Postgres to run the same test suite against it, so I know the deploy DB actually works and not just SQLite.

## What I changed or rejected

- **Real time collab with Yjs/websockets.** AI suggested it as an option. I said no for this timebox. It's the riskiest piece to get working on a free host, and a half working version is worse than honest conflict detection.
- **Storing ProseMirror JSON.** Went with sanitized HTML instead (reasons in ARCHITECTURE.md).
- **A bug in the generated editor code:** TipTap's `setEditable()` fires an "update" event by default. So just opening a doc as a viewer triggered a save, which got a 403, and opening any doc marked it as "unsaved" so the browser showed a leave page warning. The e2e run caught it (unexpected 403 + a navigation timeout). Fixed by passing `emitUpdate: false` and only saving on real doc changes.
- **New doc title focus** used a `setTimeout` that raced with React rendering, so the title wasn't selected and the rename test failed. Replaced with an effect that runs once the doc is actually loaded.
- **Stale closure risk** in the editor `onUpdate` callback. Routed it through a ref so it always calls the current save function.
- **SQLite drops timezone info,** so "edited X min ago" would've been off by the UTC offset. Added a fix in the API response.
- **Static file route** for the SPA could in theory serve files outside the build folder with a crafted path. Added a resolved path check and tested it with encoded `../` requests.
- Small UX stuff from looking at screenshots: the demo password was rendered in uppercase by CSS (confusing since it's case sensitive), the doc bar said "Owner" twice, the conflict banner didn't say "Keep mine" overwrites the other person.

## How I verified it

- **21 backend tests** (pytest), run on both SQLite and Postgres. Most are about access control since that's where a bug matters most.
- **End to end browser test** (`e2e/ui-flow.mjs`) with three users in separate browser sessions: formatting survives reload, rename sticks, sharing shows up under "Shared with me", Bob's edit appears in Alice's open tab, conflict banner shows and resolves, Carol can't edit, upload works, bad upload shows a clear error, and it fails if there's any unexpected console error.
- **Screenshots** from that run (in `docs/screenshots/`) that I went through by eye, including a phone sized one.
- Simulated the Docker build steps locally (clean `npm ci`, build, run with a `postgres://` URL and `$PORT`) since there was no Docker daemon in the sandbox.
- Then clicked through the deployed app myself.
