import { useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../toast";
import { initials } from "../util";

export default function ShareDialog({ doc, onClose, onChanged }) {
  const [shares, setShares] = useState(null);
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = () => api.listShares(doc.id).then(setShares).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.users().then(setUsers).catch(() => {});
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const s = await api.share(doc.id, email.trim(), role);
      toast(`Shared with ${s.user.name}`, "success");
      setEmail("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (s, newRole) => {
    try {
      await api.share(doc.id, s.user.email, newRole);
      await load();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async (s) => {
    try {
      await api.unshare(doc.id, s.user.id);
      toast(`Removed ${s.user.name}`, "success");
      await load();
      onChanged?.();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const sharedIds = new Set((shares || []).map((s) => s.user.id));
  const suggestions = users.filter((u) => !sharedIds.has(u.id));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Share" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Share "{doc.title}"</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <form onSubmit={add} className="share-form">
          <input
            type="email"
            placeholder="Add people by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            list="share-users"
            required
            autoFocus
          />
          <datalist id="share-users">
            {suggestions.map((u) => (
              <option key={u.id} value={u.email}>{u.name}</option>
            ))}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Access level">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn btn-primary" disabled={busy}>Share</button>
        </form>
        {error && <div className="form-error">{error}</div>}

        <div className="share-list-label">People with access</div>
        <ul className="share-list">
          <li>
            <span className="avatar">{initials(doc.owner.name)}</span>
            <span className="grow">
              {doc.owner.name}
              <span className="muted small block">{doc.owner.email}</span>
            </span>
            <span className="muted small">Owner</span>
          </li>
          {shares === null && <li className="muted">Loading...</li>}
          {shares?.map((s) => (
            <li key={s.user.id}>
              <span className="avatar">{initials(s.user.name)}</span>
              <span className="grow">
                {s.user.name}
                <span className="muted small block">{s.user.email}</span>
              </span>
              <select value={s.role} onChange={(e) => changeRole(s, e.target.value)} aria-label={`Access for ${s.user.name}`}>
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button className="btn btn-ghost btn-sm danger" onClick={() => remove(s)}>Remove</button>
            </li>
          ))}
        </ul>
        <p className="muted small">
          People need an account first. Demo users: alice@, bob@, carol@ajaia.dev
        </p>
      </div>
    </div>
  );
}
