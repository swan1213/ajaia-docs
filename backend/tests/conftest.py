import os
import sys
from pathlib import Path

import pytest

# Point the app at a throwaway sqlite file BEFORE it gets imported.
_DB = Path(__file__).parent / "test.db"
# Set TEST_DATABASE_URL to run the same suite against Postgres.
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", f"sqlite:///{_DB}")
os.environ["STATIC_DIR"] = str(Path(__file__).parent / "_no_static")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:  # lifespan runs create_all + seed
        yield c
    Base.metadata.drop_all(engine)


def login(client: TestClient, email: str, password: str = "demo1234") -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture()
def alice(client):
    return login(client, "alice@ajaia.dev")


@pytest.fixture()
def bob(client):
    return login(client, "bob@ajaia.dev")


@pytest.fixture()
def carol(client):
    return login(client, "carol@ajaia.dev")
