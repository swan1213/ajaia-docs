"""Sharing + permissions. This is the part where a bug actually hurts (data leaks),
so it gets the most coverage."""

from .conftest import login


def _new_doc(client, headers, title="Plan"):
    r = client.post("/api/docs", json={"title": title, "content": "<p>hi</p>"}, headers=headers)
    assert r.status_code == 201
    return r.json()


def test_requires_login(client):
    assert client.get("/api/docs").status_code == 401
    assert client.get("/api/docs", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_bad_password(client):
    r = client.post("/api/auth/login", json={"email": "alice@ajaia.dev", "password": "wrong"})
    assert r.status_code == 401


def test_private_doc_is_invisible_to_others(client, alice, bob):
    doc = _new_doc(client, alice)
    # Bob gets 404, not 403, so he can't even tell the doc exists.
    assert client.get(f"/api/docs/{doc['id']}", headers=bob).status_code == 404
    patch = {"content": "<p>pwned</p>", "base_version": doc["version"]}
    assert client.patch(f"/api/docs/{doc['id']}", json=patch, headers=bob).status_code == 404
    ids = [d["id"] for d in client.get("/api/docs", headers=bob).json()["shared"]]
    assert doc["id"] not in ids


def test_share_flow_owned_vs_shared(client, alice, bob):
    doc = _new_doc(client, alice, "Roadmap")
    r = client.post(f"/api/docs/{doc['id']}/shares", json={"email": "BOB@ajaia.dev", "role": "editor"}, headers=alice)
    assert r.status_code == 200

    alice_list = client.get("/api/docs", headers=alice).json()
    bob_list = client.get("/api/docs", headers=bob).json()
    assert doc["id"] in [d["id"] for d in alice_list["owned"]]
    shared = {d["id"]: d for d in bob_list["shared"]}
    assert shared[doc["id"]]["role"] == "editor"
    assert shared[doc["id"]]["owner"]["email"] == "alice@ajaia.dev"
    assert doc["id"] not in [d["id"] for d in bob_list["owned"]]

    # Editor can save
    r = client.patch(f"/api/docs/{doc['id']}", json={"content": "<p>bob was here</p>", "base_version": 1}, headers=bob)
    assert r.status_code == 200
    assert r.json()["updated_by"]["email"] == "bob@ajaia.dev"


def test_viewer_cannot_edit_or_manage(client, alice, carol):
    doc = _new_doc(client, alice)
    client.post(f"/api/docs/{doc['id']}/shares", json={"email": "carol@ajaia.dev", "role": "viewer"}, headers=alice)

    assert client.get(f"/api/docs/{doc['id']}", headers=carol).json()["role"] == "viewer"
    r = client.patch(f"/api/docs/{doc['id']}", json={"title": "mine now", "base_version": 1}, headers=carol)
    assert r.status_code == 403
    assert client.delete(f"/api/docs/{doc['id']}", headers=carol).status_code == 403
    r = client.post(f"/api/docs/{doc['id']}/shares", json={"email": "bob@ajaia.dev"}, headers=carol)
    assert r.status_code == 403


def test_editor_cannot_reshare_or_delete(client, alice, bob):
    doc = _new_doc(client, alice)
    client.post(f"/api/docs/{doc['id']}/shares", json={"email": "bob@ajaia.dev"}, headers=alice)
    r = client.post(f"/api/docs/{doc['id']}/shares", json={"email": "carol@ajaia.dev"}, headers=bob)
    assert r.status_code == 403
    assert client.delete(f"/api/docs/{doc['id']}", headers=bob).status_code == 403


def test_revoke_access(client, alice, bob):
    doc = _new_doc(client, alice)
    client.post(f"/api/docs/{doc['id']}/shares", json={"email": "bob@ajaia.dev"}, headers=alice)
    bob_id = client.get("/api/auth/me", headers=bob).json()["id"]
    assert client.delete(f"/api/docs/{doc['id']}/shares/{bob_id}", headers=alice).status_code == 204
    assert client.get(f"/api/docs/{doc['id']}", headers=bob).status_code == 404


def test_share_validation(client, alice):
    doc = _new_doc(client, alice)
    url = f"/api/docs/{doc['id']}/shares"
    assert client.post(url, json={"email": "ghost@ajaia.dev"}, headers=alice).status_code == 404
    assert client.post(url, json={"email": "alice@ajaia.dev"}, headers=alice).status_code == 400
    assert client.post(url, json={"email": "bob@ajaia.dev", "role": "admin"}, headers=alice).status_code == 422


def test_seeded_demo_doc_is_shared(client, bob, carol):
    bob_shared = client.get("/api/docs", headers=bob).json()["shared"]
    carol_shared = client.get("/api/docs", headers=carol).json()["shared"]
    assert [d["role"] for d in bob_shared] == ["editor"]
    assert [d["role"] for d in carol_shared] == ["viewer"]


def test_register_then_receive_share(client, alice):
    r = client.post("/api/auth/register", json={"email": "Dana@Ajaia.dev", "name": "Dana", "password": "secret1"})
    assert r.status_code == 201
    dana = {"Authorization": f"Bearer {r.json()['token']}"}
    doc = _new_doc(client, alice)
    client.post(f"/api/docs/{doc['id']}/shares", json={"email": "dana@ajaia.dev", "role": "viewer"}, headers=alice)
    assert client.get(f"/api/docs/{doc['id']}", headers=dana).status_code == 200
    # duplicate email blocked
    dup = client.post("/api/auth/register", json={"email": "dana@ajaia.dev", "name": "D2", "password": "secret1"})
    assert dup.status_code == 409
    assert login(client, "dana@ajaia.dev", "secret1")
