import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { initials } from "../util";

export default function Header({ children }) {
  const { user, signOut } = useAuth();
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark" />
        Ajaia Docs
      </Link>
      <div className="topbar-middle">{children}</div>
      <div className="topbar-user">
        <span className="avatar" title={user?.email}>{initials(user?.name)}</span>
        <span className="hide-sm">{user?.name}</span>
        <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}
