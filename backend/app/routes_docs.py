from datetime import timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from .access import Role, load_doc
from .content import (
    MAX_CONTENT_CHARS,
    MAX_UPLOAD_BYTES,
    ImportError_,
    file_to_html,
    html_to_markdown,
    sanitize_html,
    title_from_filename,
)
from .db import get_db
from .models import Document, Share, User, utcnow
from .schemas import (
    ConvertOut,
    DocCreate,
    DocList,
    DocOut,
    DocSummary,
    DocUpdate,
    ShareIn,
    ShareOut,
    UserOut,
)
from .security import current_user

router = APIRouter(prefix="/api", tags=["documents"])


def _share_count(db: DbSession, doc_id: int) -> int:
    return db.scalar(select(func.count()).select_from(Share).where(Share.document_id == doc_id)) or 0


def _summary(db: DbSession, doc: Document, role: Role) -> dict:
    updated = doc.updated_at
    if updated.tzinfo is None:  # sqlite drops tz info, values are stored as UTC
        updated = updated.replace(tzinfo=timezone.utc)
    return dict(
        id=doc.id,
        title=doc.title,
        owner=UserOut.model_validate(doc.owner),
        role=role,
        updated_at=updated,
        updated_by=UserOut.model_validate(doc.updated_by) if doc.updated_by else None,
        shared_with_count=_share_count(db, doc.id),
    )


def _full(db: DbSession, doc: Document, role: Role) -> DocOut:
    return DocOut(**_summary(db, doc, role), content=doc.content, version=doc.version)


def _check_content(content: str) -> str:
    if len(content) > MAX_CONTENT_CHARS:
        raise HTTPException(status_code=413, detail="Document is too large")
    return sanitize_html(content)


async def _read_upload(file: UploadFile) -> bytes:
    # Read one byte past the limit so we can reject without loading huge files.
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    return data


# ---------- documents ----------

@router.get("/docs", response_model=DocList)
def list_docs(db: DbSession = Depends(get_db), user: User = Depends(current_user)):
    owned = db.scalars(
        select(Document).where(Document.owner_id == user.id).order_by(Document.updated_at.desc())
    ).all()
    shared_rows = db.execute(
        select(Document, Share.role)
        .join(Share, Share.document_id == Document.id)
        .where(Share.user_id == user.id)
        .order_by(Document.updated_at.desc())
    ).all()
    return DocList(
        owned=[DocSummary(**_summary(db, d, "owner")) for d in owned],
        shared=[DocSummary(**_summary(db, d, role)) for d, role in shared_rows],
    )


@router.post("/docs", response_model=DocOut, status_code=201)
def create_doc(body: DocCreate, db: DbSession = Depends(get_db), user: User = Depends(current_user)):
    doc = Document(
        title=body.title.strip() or "Untitled document",
        content=_check_content(body.content),
        owner_id=user.id,
        updated_by_id=user.id,
    )
    db.add(doc)
    db.commit()
    return _full(db, doc, "owner")


@router.get("/docs/{doc_id}", response_model=DocOut)
def get_doc(doc_id: int, db: DbSession = Depends(get_db), user: User = Depends(current_user)):
    doc, role = load_doc(db, doc_id, user, "view")
    return _full(db, doc, role)


@router.patch("/docs/{doc_id}", response_model=DocOut)
def update_doc(
    doc_id: int, body: DocUpdate, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    doc, role = load_doc(db, doc_id, user, "edit")
    if body.title is None and body.content is None:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if body.base_version != doc.version:
        # Someone else saved in between. Hand back the latest so the client can decide.
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This document was changed by someone else",
                "latest": _full(db, doc, role).model_dump(mode="json"),
            },
        )
    if body.title is not None:
        doc.title = body.title
    if body.content is not None:
        doc.content = _check_content(body.content)
    doc.version += 1
    doc.updated_at = utcnow()
    doc.updated_by_id = user.id
    db.commit()
    return _full(db, doc, role)


@router.delete("/docs/{doc_id}", status_code=204)
def delete_doc(doc_id: int, db: DbSession = Depends(get_db), user: User = Depends(current_user)):
    doc, _ = load_doc(db, doc_id, user, "own")
    db.delete(doc)
    db.commit()


@router.get("/docs/{doc_id}/export")
def export_doc(doc_id: int, db: DbSession = Depends(get_db), user: User = Depends(current_user)):
    doc, _ = load_doc(db, doc_id, user, "view")
    body = f"# {doc.title}\n\n" + html_to_markdown(doc.content)
    safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in doc.title).strip() or "document"
    return Response(
        content=body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.md"'},
    )


# ---------- file upload ----------

@router.post("/docs/import", response_model=DocOut, status_code=201)
async def import_doc(
    file: UploadFile = File(...), db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    """Upload .txt / .md / .docx and get a brand new editable doc."""
    data = await _read_upload(file)
    try:
        html = file_to_html(file.filename or "", data)
    except ImportError_ as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    doc = Document(
        title=title_from_filename(file.filename or ""),
        content=html,
        owner_id=user.id,
        updated_by_id=user.id,
    )
    db.add(doc)
    db.commit()
    return _full(db, doc, "owner")


@router.post("/convert", response_model=ConvertOut)
async def convert_file(file: UploadFile = File(...), user: User = Depends(current_user)):
    """Convert a file to editor HTML without saving. Used for 'insert file into this doc'."""
    data = await _read_upload(file)
    try:
        html = file_to_html(file.filename or "", data)
    except ImportError_ as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ConvertOut(html=html, title=title_from_filename(file.filename or ""))


# ---------- sharing ----------

@router.get("/docs/{doc_id}/shares", response_model=list[ShareOut])
def list_shares(doc_id: int, db: DbSession = Depends(get_db), user: User = Depends(current_user)):
    doc, _ = load_doc(db, doc_id, user, "view")
    return [ShareOut(user=UserOut.model_validate(s.user), role=s.role) for s in doc.shares]


@router.post("/docs/{doc_id}/shares", response_model=ShareOut)
def add_share(
    doc_id: int, body: ShareIn, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    doc, _ = load_doc(db, doc_id, user, "own")
    target = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if target is None:
        raise HTTPException(status_code=404, detail=f"No user with email {body.email}")
    if target.id == doc.owner_id:
        raise HTTPException(status_code=400, detail="You already own this document")
    share = db.scalar(select(Share).where(Share.document_id == doc.id, Share.user_id == target.id))
    if share:
        share.role = body.role  # re-sharing just updates the role
    else:
        share = Share(document_id=doc.id, user_id=target.id, role=body.role)
        db.add(share)
    db.commit()
    return ShareOut(user=UserOut.model_validate(target), role=share.role)


@router.delete("/docs/{doc_id}/shares/{user_id}", status_code=204)
def remove_share(
    doc_id: int, user_id: int, db: DbSession = Depends(get_db), user: User = Depends(current_user)
):
    doc, _ = load_doc(db, doc_id, user, "own")
    share = db.scalar(select(Share).where(Share.document_id == doc.id, Share.user_id == user_id))
    if share is None:
        raise HTTPException(status_code=404, detail="That user doesn't have access")
    db.delete(share)
    db.commit()
