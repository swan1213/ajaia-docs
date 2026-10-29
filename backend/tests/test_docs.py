"""Doc lifecycle, persistence of formatting, conflicts, sanitizing, file import/export."""

import io
import zipfile


def test_create_rename_edit_reopen(client, alice):
    doc = client.post("/api/docs", json={"title": "Draft"}, headers=alice).json()
    assert doc["version"] == 1

    html = "<h1>Title</h1><p><strong>b</strong> <em>i</em> <u>u</u></p><ul><li>one</li></ul><ol><li>two</li></ol>"
    r = client.patch(f"/api/docs/{doc['id']}", json={"title": "Final", "content": html, "base_version": 1}, headers=alice)
    assert r.status_code == 200
    assert r.json()["version"] == 2

    reopened = client.get(f"/api/docs/{doc['id']}", headers=alice).json()
    assert reopened["title"] == "Final"
    assert reopened["content"] == html  # formatting survives the round trip


def test_blank_title_rejected(client, alice):
    doc = client.post("/api/docs", json={}, headers=alice).json()
    r = client.patch(f"/api/docs/{doc['id']}", json={"title": "   ", "base_version": 1}, headers=alice)
    assert r.status_code == 422


def test_stale_save_gets_409_with_latest(client, alice, bob):
    doc = client.post("/api/docs", json={"title": "Shared"}, headers=alice).json()
    client.post(f"/api/docs/{doc['id']}/shares", json={"email": "bob@ajaia.dev"}, headers=alice)

    # Both open v1. Bob saves first.
    client.patch(f"/api/docs/{doc['id']}", json={"content": "<p>bob</p>", "base_version": 1}, headers=bob)
    # Alice's save is based on v1 so it must not silently clobber Bob's.
    r = client.patch(f"/api/docs/{doc['id']}", json={"content": "<p>alice</p>", "base_version": 1}, headers=alice)
    assert r.status_code == 409
    latest = r.json()["detail"]["latest"]
    assert latest["content"] == "<p>bob</p>"
    assert latest["version"] == 2


def test_html_is_sanitized(client, alice):
    evil = '<p onclick="x()">hi<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:1">l</a></p>'
    doc = client.post("/api/docs", json={"content": evil}, headers=alice).json()
    assert "script" not in doc["content"]
    assert "onerror" not in doc["content"]
    assert "onclick" not in doc["content"]
    assert "javascript" not in doc["content"]
    assert "hi" in doc["content"]


def test_delete_owner_only_and_gone(client, alice):
    doc = client.post("/api/docs", json={}, headers=alice).json()
    assert client.delete(f"/api/docs/{doc['id']}", headers=alice).status_code == 204
    assert client.get(f"/api/docs/{doc['id']}", headers=alice).status_code == 404


def _upload(client, headers, name, data, url="/api/docs/import"):
    return client.post(url, files={"file": (name, data)}, headers=headers)


def test_import_markdown_creates_doc(client, alice):
    md = b"# Meeting notes\n\nSome **bold** text\n\n- a\n- b\n"
    r = _upload(client, alice, "notes.md", md)
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "notes"
    assert "<h1>Meeting notes</h1>" in body["content"]
    assert "<strong>bold</strong>" in body["content"]
    assert "<li>a</li>" in body["content"]
    assert body["id"] in [d["id"] for d in client.get("/api/docs", headers=alice).json()["owned"]]


def test_import_txt_escapes_html(client, alice):
    r = _upload(client, alice, "plain.txt", b"line one\nline <b>two</b>\n\npara two")
    assert r.status_code == 201
    assert r.json()["content"] == "<p>line one<br>line &lt;b&gt;two&lt;/b&gt;</p><p>para two</p>"


def _minimal_docx(text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml",
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            '</Types>')
        z.writestr("_rels/.rels",
            '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            '</Relationships>')
        z.writestr("word/document.xml",
            '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f'<w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{text}</w:t></w:r></w:p></w:body></w:document>')
    return buf.getvalue()


def test_import_docx(client, alice):
    r = _upload(client, alice, "Quarterly Report.docx", _minimal_docx("Q3 numbers"))
    assert r.status_code == 201, r.text
    assert r.json()["title"] == "Quarterly Report"
    assert "<strong>Q3 numbers</strong>" in r.json()["content"]


def test_import_rejects_bad_files(client, alice):
    assert _upload(client, alice, "virus.exe", b"MZ").status_code == 400
    assert _upload(client, alice, "empty.txt", b"").status_code == 400
    assert _upload(client, alice, "broken.docx", b"not a zip").status_code == 400
    big = b"a" * (2 * 1024 * 1024 + 10)
    r = _upload(client, alice, "big.txt", big)
    assert r.status_code == 400 and "too large" in r.json()["detail"]


def test_convert_does_not_create_doc(client, alice):
    before = len(client.get("/api/docs", headers=alice).json()["owned"])
    r = _upload(client, alice, "snippet.md", b"*hello*", url="/api/convert")
    assert r.status_code == 200
    assert "<em>hello</em>" in r.json()["html"]
    assert len(client.get("/api/docs", headers=alice).json()["owned"]) == before


def test_export_markdown(client, alice):
    html = "<h2>Goals</h2><p><strong>Ship</strong> it</p><ul><li>one</li></ul>"
    doc = client.post("/api/docs", json={"title": "Plan", "content": html}, headers=alice).json()
    r = client.get(f"/api/docs/{doc['id']}/export", headers=alice)
    assert r.status_code == 200
    assert 'filename="Plan.md"' in r.headers["content-disposition"]
    text = r.text
    assert text.startswith("# Plan")
    assert "## Goals" in text and "**Ship**" in text and "- one" in text
