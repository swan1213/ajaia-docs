import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import ProgrammingError

from . import models  # noqa: F401  (registers tables)
from .db import Base, SessionLocal, engine
from .routes_auth import router as auth_router
from .routes_docs import router as docs_router
from .seed import seed

# Built React app. In Docker it's copied here; locally you can run Vite separately.
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parent.parent / "static"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(engine)
    except ProgrammingError:
        # Another serverless instance created the tables at the same moment.
        pass
    if os.getenv("SEED_DEMO", "1") == "1":
        with SessionLocal() as db:
            seed(db)
    yield


app = FastAPI(title="Ajaia Docs", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(docs_router)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    # Flatten pydantic errors into one readable message for the UI toast.
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query", "path"))
    msg = first.get("msg", "Invalid request").removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": f"{field}: {msg}" if field else msg})


@app.get("/api/health")
def health():
    return {"ok": True}


if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        # Let React Router handle client routes like /docs/12 on refresh.
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        candidate = (STATIC_DIR / full_path).resolve()
        if full_path and candidate.is_relative_to(STATIC_DIR.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
