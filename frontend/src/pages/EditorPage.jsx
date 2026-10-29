import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { api, UPLOAD_ACCEPT, UPLOAD_HINT } from "../api";
import Header from "../components/Header";
import Toolbar from "../components/Toolbar";
import ShareDialog from "../components/ShareDialog";
import { useToast } from "../toast";
import { timeAgo } from "../util";

const SAVE_DELAY_MS = 700;
const POLL_MS = 4000;

// Save status shown next to the title
const STATUS_TEXT = {
  saved: "All changes saved",
  dirty: "Unsaved changes",
  saving: "Saving...",
  error: "Couldn't save, retrying...",
  conflict: "Edit conflict",
};

export default function EditorPage() {
  const { id } = useParams();
  const location = useLocation();
  const toast = useToast();

  const [doc, setDoc] = useState(null); // metadata (title, role, owner, ...)
  const [loadError, setLoadError] = useState(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("saved");
  const [conflict, setConflict] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [remoteNote, setRemoteNote] = useState("");

  // Refs so the save loop always sees current values without re-rendering.
  const versionRef = useRef(0);
  const pendingRef = useRef({});
  const inflightRef = useRef(false);
  const conflictRef = useRef(null);
  const timerRef = useRef(null);
  const fileRef = useRef(null);
  const titleRef = useRef(null);
  const scheduleRef = useRef(() => {});
  const wantTitleFocus = useRef(Boolean(location.state?.focusTitle));

  const canEdit = doc && doc.role !== "viewer";

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      CharacterCount,
    ],
    content: "",
    editable: false,
    onUpdate: ({ editor, transaction }) => {
      if (!editor.isEditable || !transaction.docChanged) return;
      pendingRef.current.content = editor.getHTML();
      scheduleRef.current();
    },
  });

  // ---------- saving ----------

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (inflightRef.current || conflictRef.current) return;
    const patch = pendingRef.current;
    if (!Object.keys(patch).length) return;

    pendingRef.current = {};
    inflightRef.current = true;
    setStatus("saving");
    try {
      const saved = await api.updateDoc(id, { ...patch, base_version: versionRef.current });
      versionRef.current = saved.version;
      setDoc(saved);
      inflightRef.current = false;
      if (Object.keys(pendingRef.current).length) {
        flush(); // more edits came in while we were saving
      } else {
        setStatus("saved");
      }
    } catch (e) {
      inflightRef.current = false;
      // put the unsaved changes back (newer edits win)
      pendingRef.current = { ...patch, ...pendingRef.current };
      if (e.status === 409) {
        conflictRef.current = e.detail.latest;
        setConflict(e.detail.latest);
        setStatus("conflict");
      } else if (e.status === 403 || e.status === 404) {
        setStatus("error");
        toast(e.message, "error");
        setDoc((d) => d && { ...d, role: "viewer" });
      } else {
        setStatus("error");
        timerRef.current = setTimeout(flush, 3000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const scheduleSave = useCallback(() => {
    setStatus("dirty");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [flush]);
  scheduleRef.current = scheduleSave;

  // ---------- loading ----------

  const applyRemote = useCallback(
    (fresh) => {
      versionRef.current = fresh.version;
      setDoc(fresh);
      setTitle(fresh.title);
      editor?.commands.setContent(fresh.content || "", { emitUpdate: false });
    },
    [editor]
  );

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    setDoc(null);
    setLoadError(null);
    api
      .getDoc(id)
      .then((d) => {
        if (cancelled) return;
        applyRemote(d);
        if (!wantTitleFocus.current) editor.commands.focus("end");
      })
      .catch((e) => !cancelled && setLoadError(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editor]);

  useEffect(() => {
    editor?.setEditable(Boolean(canEdit), false); // false = don't fire a fake 'update'
  }, [editor, canEdit]);

  // Brand new docs land with the title selected so you can just type a name.
  useEffect(() => {
    if (doc && wantTitleFocus.current && titleRef.current) {
      wantTitleFocus.current = false;
      titleRef.current.select();
    }
  }, [doc]);

  // Light "collaboration": poll for changes others made and pull them in when
  // we have nothing unsaved. Not real-time merging, but people see each
  // other's work without refreshing. Conflicts are caught by versioning.
  useEffect(() => {
    if (!doc) return;
    const tick = async () => {
      if (document.hidden || inflightRef.current || conflictRef.current) return;
      if (Object.keys(pendingRef.current).length) return;
      try {
        const fresh = await api.getDoc(id);
        if (fresh.version > versionRef.current && !Object.keys(pendingRef.current).length) {
          applyRemote(fresh);
          setRemoteNote(`Updated by ${fresh.updated_by?.name ?? "someone"} just now`);
          setTimeout(() => setRemoteNote(""), 4000);
        } else if (fresh.role !== doc.role) {
          setDoc(fresh);
        }
      } catch (e) {
        if (e.status === 404) setLoadError(e);
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [id, doc, applyRemote]);

  // Don't lose work: warn on close, save on Ctrl+S, flush on leaving the page.
  useEffect(() => {
    const beforeUnload = (e) => {
      if (Object.keys(pendingRef.current).length || inflightRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flush();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", onKey);
      flush();
    };
  }, [flush]);

  // ---------- actions ----------

  const commitTitle = () => {
    const t = title.trim();
    if (!t) {
      setTitle(doc.title);
      toast("Title can't be empty", "error");
      return;
    }
    if (t === doc.title) return;
    setTitle(t);
    pendingRef.current.title = t;
    flush();
  };

  const resolveConflict = (keepMine) => {
    const latest = conflictRef.current;
    conflictRef.current = null;
    setConflict(null);
    if (keepMine) {
      // Re-apply our version on top of theirs.
      versionRef.current = latest.version;
      pendingRef.current = { content: editor.getHTML(), title: title.trim() || latest.title };
      flush();
    } else {
      pendingRef.current = {};
      applyRemote(latest);
      setStatus("saved");
    }
  };

  const insertFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { html } = await api.convertFile(file);
      editor.chain().focus().insertContent(html).run();
      toast(`Inserted "${file.name}"`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const exportMd = async () => {
    try {
      await flush();
      const res = await api.exportDoc(id);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `${doc.title.replace(/[^\w\- ]/g, "_") || "document"}.md`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  // ---------- render ----------

  if (loadError) {
    return (
      <>
        <Header />
        <div className="center-screen stack">
          <h2>{loadError.status === 404 ? "Document not found" : "Couldn't open document"}</h2>
          <p className="muted">
            {loadError.status === 404
              ? "It may have been deleted, or you don't have access anymore."
              : loadError.message}
          </p>
          <Link to="/" className="btn btn-primary">Back to documents</Link>
        </div>
      </>
    );
  }

  const words = editor?.storage.characterCount?.words() ?? 0;

  return (
    <>
      <Header>
        {doc && (
          <div className="doc-head">
            <input
              ref={titleRef}
              className="title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { setTitle(doc.title); e.currentTarget.blur(); }
              }}
              readOnly={!canEdit}
              maxLength={200}
              aria-label="Document title"
            />
            <span className={`save-status status-${status}`}>
              {canEdit ? STATUS_TEXT[status] : "View only"}
            </span>
          </div>
        )}
      </Header>

      {doc && (
        <div className="doc-bar">
          <span className="muted small">
            {doc.role === "owner"
              ? `You own this${doc.shared_with_count ? `, shared with ${doc.shared_with_count}` : ""}`
              : `Owned by ${doc.owner.name} \u00b7 you ${doc.role === "editor" ? "can edit" : "can view"}`}
            {" "}&middot; edited {timeAgo(doc.updated_at)}
            {doc.updated_by && ` by ${doc.updated_by.name}`}
          </span>
          <span className="doc-bar-actions">
            {remoteNote && <span className="pill pill-live">{remoteNote}</span>}
            {canEdit && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} title={`Insert ${UPLOAD_HINT}`}>
                  Insert file
                </button>
                <input ref={fileRef} type="file" accept={UPLOAD_ACCEPT} hidden onChange={insertFile} />
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={exportMd}>Export .md</button>
            {doc.role === "owner" && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowShare(true)}>Share</button>
            )}
          </span>
        </div>
      )}

      {conflict && (
        <div className="banner banner-warn">
          <span>
            <strong>{conflict.updated_by?.name ?? "Someone"}</strong> saved changes while you were editing.
            Your latest edits are not saved yet. "Keep mine" replaces their version with yours.
          </span>
          <span className="banner-actions">
            <button className="btn btn-sm" onClick={() => resolveConflict(false)}>Load their version</button>
            <button className="btn btn-sm btn-primary" onClick={() => resolveConflict(true)}>Keep mine</button>
          </span>
        </div>
      )}

      {doc && !canEdit && (
        <div className="banner banner-info">You have view access. Ask {doc.owner.name} for edit access to make changes.</div>
      )}

      <main className="editor-shell">
        {editor && canEdit && <Toolbar editor={editor} />}
        <div className="page">
          {!doc && <p className="muted">Loading...</p>}
          <EditorContent editor={editor} className={doc ? "" : "hidden"} />
        </div>
        {doc && <div className="word-count muted small">{words} {words === 1 ? "word" : "words"}</div>}
      </main>

      {showShare && doc && (
        <ShareDialog
          doc={doc}
          onClose={() => setShowShare(false)}
          onChanged={() => api.getDoc(id).then((d) => setDoc((cur) => ({ ...cur, shared_with_count: d.shared_with_count })))}
        />
      )}
    </>
  );
}
