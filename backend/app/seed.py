"""Seed demo users and one shared doc so reviewers can test sharing right away."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .models import Document, Share, User
from .security import hash_password

DEMO_PASSWORD = "demo1234"

DEMO_USERS = [
    ("alice@ajaia.dev", "Alice Owner"),
    ("bob@ajaia.dev", "Bob Editor"),
    ("carol@ajaia.dev", "Carol Viewer"),
]

WELCOME_HTML = """
<h1>Welcome to Ajaia Docs</h1>
<p>This doc is owned by <strong>Alice</strong> and shared with
<strong>Bob</strong> (can edit) and <strong>Carol</strong> (can view).</p>
<h2>Try this</h2>
<ol>
<li>Sign in as Bob and edit this doc. Changes autosave.</li>
<li>Sign in as Carol. The editor is <em>read only</em> for her.</li>
<li>Upload a <u>.txt, .md or .docx</u> file from the dashboard to make a new doc.</li>
</ol>
<ul>
<li>Bold, italic, underline</li>
<li>Headings and lists</li>
</ul>
"""


def seed(db: DbSession) -> None:
    if db.scalar(select(User).limit(1)) is not None:
        return  # already seeded, never clobber real data
    try:
        _insert_demo_data(db)
    except IntegrityError:
        # On serverless, two cold starts can try to seed at the same moment.
        # Whoever loses just backs off, the data is already there.
        db.rollback()


def _insert_demo_data(db: DbSession) -> None:
    users = {}
    for email, name in DEMO_USERS:
        u = User(email=email, name=name, password_hash=hash_password(DEMO_PASSWORD))
        db.add(u)
        users[email] = u
    db.flush()

    alice = users["alice@ajaia.dev"]
    doc = Document(
        title="Welcome to Ajaia Docs",
        content=" ".join(WELCOME_HTML.split()),
        owner_id=alice.id,
        updated_by_id=alice.id,
    )
    db.add(doc)
    db.flush()
    db.add(Share(document_id=doc.id, user_id=users["bob@ajaia.dev"].id, role="editor"))
    db.add(Share(document_id=doc.id, user_id=users["carol@ajaia.dev"].id, role="viewer"))
    db.commit()
