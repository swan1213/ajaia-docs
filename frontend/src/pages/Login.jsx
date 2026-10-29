import { useState } from "react";
import { useAuth } from "../auth";

const DEMO = [
  { email: "alice@ajaia.dev", name: "Alice", note: "owns the welcome doc" },
  { email: "bob@ajaia.dev", name: "Bob", note: "can edit it" },
  { email: "carol@ajaia.dev", name: "Carol", note: "can only view it" },
];
const DEMO_PASSWORD = "demo1234";

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    run(() => (mode === "login" ? signIn(email, password) : signUp(email, name, password)));
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand brand-lg">
          <span className="brand-mark" />
          Ajaia Docs
        </div>
        <p className="muted">Write, format and share docs with your team.</p>

        <form onSubmit={submit} className="stack">
          {mode === "register" && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 6 : 1}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "One sec..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button className="link-btn" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>

        <div className="demo-box">
          <div className="demo-title">Demo accounts</div>
          <div className="muted small">One click to sign in. Password for all: <code>{DEMO_PASSWORD}</code></div>
          {DEMO.map((d) => (
            <button
              key={d.email}
              className="demo-user"
              disabled={busy}
              onClick={() => run(() => signIn(d.email, DEMO_PASSWORD))}
            >
              <strong>{d.name}</strong>
              <span className="muted">{d.email} &middot; {d.note}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
