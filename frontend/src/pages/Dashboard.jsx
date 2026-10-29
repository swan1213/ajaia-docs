import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, UPLOAD_ACCEPT, UPLOAD_HINT } from "../api";
import Header from "../components/Header";
import { useToast } from "../toast";
import { ROLE_LABEL, timeAgo } from "../util";

export default function Dashboard() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback(() => {
    api.listDocs().then(setDocs).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const newDoc = async () => {
    setBusy(true);
    try {
      const doc = await api.createDoc("Untitled document");
      navigate(`/docs/${doc.id}`, { state: { focusTitle: true } });
    } catch (e) {
      toast(e.message, "error");
      setBusy(false);
    }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const doc = await api.importDoc(file);
      toast(`Imported "${file.name}"`, "success");
      navigate(`/docs/${doc.id}`);
    } catch (err) {
      toast(err.message, "error");
      setBusy(false);
    }
  };

  const remove = async (doc) => {
    if (!confirm(`Delete "${doc.title}"? This can't be undone.`)) return;
    try {
      await api.deleteDoc(doc.id);
      toast("Document deleted", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return (
    <>
      <Header />
      <main className="dash">
        <section className="dash-actions">
          <button className="new-card" onClick={newDoc} disabled={busy}>
            <span className="plus">+</span>
            <span>
              <strong>Blank document</strong>
              <span className="muted">Start from scratch</span>
            </span>
          </button>
          <button className="new-card" onClick={() => fileRef.current?.click()} disabled={busy}>
            <span className="plus">&uarr;</span>
            <span>
              <strong>Upload a file</strong>
              <span className="muted">{UPLOAD_HINT}</span>
            </span>
          </button>
          <input ref={fileRef} type="file" accept={UPLOAD_ACCEPT} hidden onChange={onUpload} />
        </section>

        {error && <div className="form-error">{error}</div>}
        {!docs && !error && <p className="muted">Loading documents...</p>}

        {docs && (
          <>
            <DocSection
              title="My documents"
              empty="No documents yet. Create one or upload a file to get going."
              docs={docs.owned}
              onDelete={remove}
            />
            <DocSection
              title="Shared with me"
              empty="Nothing shared with you yet."
              docs={docs.shared}
            />
          </>
        )}
      </main>
    </>
  );
}

function DocSection({ title, docs, empty, onDelete }) {
  return (
    <section className="doc-section">
      <h2>
        {title} <span className="count">{docs.length}</span>
      </h2>
      {docs.length === 0 ? (
        <p className="muted empty">{empty}</p>
      ) : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id} className="doc-row">
              <Link to={`/docs/${d.id}`} className="doc-link">
                <span className="doc-icon" aria-hidden />
                <span className="doc-main">
                  <span className="doc-title">{d.title}</span>
                  <span className="muted small">
                    Edited {timeAgo(d.updated_at)}
                    {d.updated_by && ` by ${d.updated_by.name}`}
                  </span>
                </span>
              </Link>
              <span className="doc-meta">
                {d.role === "owner" ? (
                  d.shared_with_count > 0 && (
                    <span className="pill">Shared with {d.shared_with_count}</span>
                  )
                ) : (
                  <>
                    <span className="muted small hide-sm">from {d.owner.name}</span>
                    <span className={`pill pill-${d.role}`}>{ROLE_LABEL[d.role]}</span>
                  </>
                )}
                {onDelete && (
                  <button className="btn btn-ghost btn-sm danger" onClick={() => onDelete(d)} title="Delete">
                    Delete
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
