"""Single place that decides who can do what with a document.

Every route goes through `load_doc`, so access rules can't drift between endpoints.
"""

from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .models import Document, Share, User

Role = Literal["owner", "editor", "viewer"]
Need = Literal["view", "edit", "own"]

_RANK = {"viewer": 1, "editor": 2, "owner": 3}
_NEEDED = {"view": 1, "edit": 2, "own": 3}


def role_for(db: DbSession, doc: Document, user: User) -> Role | None:
    if doc.owner_id == user.id:
        return "owner"
    share = db.scalar(
        select(Share).where(Share.document_id == doc.id, Share.user_id == user.id)
    )
    return share.role if share else None  # type: ignore[return-value]


def load_doc(db: DbSession, doc_id: int, user: User, need: Need) -> tuple[Document, Role]:
    doc = db.get(Document, doc_id)
    role = role_for(db, doc, user) if doc else None
    if doc is None or role is None:
        # Same 404 whether it doesn't exist or you can't see it, so ids don't leak.
        raise HTTPException(status_code=404, detail="Document not found")
    if _RANK[role] < _NEEDED[need]:
        msg = {
            "edit": "You only have view access to this document",
            "own": "Only the owner can do that",
        }[need]
        raise HTTPException(status_code=403, detail=msg)
    return doc, role
