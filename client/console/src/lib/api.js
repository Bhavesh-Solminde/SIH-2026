// All requests go through the Next.js rewrite: /api/* → Express :4000/*
// This makes them same-origin from the browser's perspective — no CORS needed.
const BASE = "/api";


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

async function requestBlob(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload);
  }
  return res.blob();
}

export const api = {
  get: (path) => request(path),
  getBlob: (path) => requestBlob(path),
  post: (path, body) => request(path, { method: "POST", body }),
  postForm: (path, form) => request(path, { method: "POST", form }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
};
