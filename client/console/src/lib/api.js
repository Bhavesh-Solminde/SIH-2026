const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = "GET", body, form } = {}) {
  const opts = {
    method,
    // Every request carries the session cookie. The console holds no token in
    // JS — the httpOnly cookie set by /auth/login is the whole identity.
    credentials: "include",
    headers: {},
  };
  if (form) {
    opts.body = form;
  } else if (body !== undefined) {
    opts.headers["content-type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, opts);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  postForm: (path, form) => request(path, { method: "POST", form }),
};
