const rawBase = (import.meta.env.VITE_API_BASE || "http://localhost:4000").replace(/\/$/, "");
// Hosts may provide a bare hostname; assume https in that case.
export const API_BASE = /^https?:\/\//.test(rawBase) ? rawBase : `https://${rawBase}`;

export type SessionUser = { id: number; username: string; email: string; role: "USER" | "ADMIN" };

export const session = {
  token: () => localStorage.getItem("token"),
  user(): SessionUser | null {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  },
  isAdmin: () => session.user()?.role === "ADMIN",
  save(data: { accessToken: string; refreshToken?: string; user?: SessionUser }) {
    localStorage.setItem("token", data.accessToken);
    if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
  },
  clear() {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// One refresh in flight at a time, shared by all requests that hit a 401 together.
let refreshing: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return false;
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      session.save(await res.json());
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function redirectToLogin() {
  session.clear();
  if (!location.pathname.startsWith("/login")) location.assign("/login");
}

async function request<T>(path: string, opts: RequestInit = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as any) };
  const t = session.token();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 401 && t && !path.startsWith("/auth/")) {
    if (!retried && (await refreshAccessToken())) return request<T>(path, opts, true);
    redirectToLogin();
  }

  if (!res.ok) {
    const text = await res.text();
    let message = text || `Request failed with status ${res.status}`;
    try {
      const data = JSON.parse(text);
      message = data.error || data.message || message;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, message);
  }

  return (res.status === 204 ? null : await res.json()) as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>(p, { method: "GET" }),
  post: <T = any>(p: string, body?: unknown) => request<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T = any>(p: string, body?: unknown) => request<T>(p, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T = any>(p: string) => request<T>(p, { method: "DELETE" }),
};
