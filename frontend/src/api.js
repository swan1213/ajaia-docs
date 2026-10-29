// Tiny fetch wrapper. Keeps the token handling and error shape in one place.

const TOKEN_KEY = "ajaia_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(status, detail) {
    const message =
      typeof detail === "string" ? detail : detail?.message || `Request failed (${status})`;
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

async function request(method, path, { json, form, raw } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }

  if (res.status === 401 && path !== "/auth/login") {
    setToken(null);
    onUnauthorized();
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* non-json error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (raw) return res;
  if (res.status === 204) return null;
  return res.json();
}

const upload = (path, file) => {
  const form = new FormData();
  form.append("file", file);
  return request("POST", path, { form });
};

export const api = {
  login: (email, password) => request("POST", "/auth/login", { json: { email, password } }),
  register: (email, name, password) =>
    request("POST", "/auth/register", { json: { email, name, password } }),
  me: () => request("GET", "/auth/me"),
  logout: () => request("POST", "/auth/logout"),
  users: () => request("GET", "/auth/users"),

  listDocs: () => request("GET", "/docs"),
  createDoc: (title) => request("POST", "/docs", { json: { title } }),
  getDoc: (id) => request("GET", `/docs/${id}`),
  updateDoc: (id, patch) => request("PATCH", `/docs/${id}`, { json: patch }),
  deleteDoc: (id) => request("DELETE", `/docs/${id}`),
  importDoc: (file) => upload("/docs/import", file),
  convertFile: (file) => upload("/convert", file),
  exportDoc: (id) => request("GET", `/docs/${id}/export`, { raw: true }),

  listShares: (id) => request("GET", `/docs/${id}/shares`),
  share: (id, email, role) => request("POST", `/docs/${id}/shares`, { json: { email, role } }),
  unshare: (id, userId) => request("DELETE", `/docs/${id}/shares/${userId}`),
};

export const UPLOAD_ACCEPT = ".txt,.md,.markdown,.docx";
export const UPLOAD_HINT = ".txt, .md or .docx, up to 2 MB";
