// API origin for the web client. Empty means same origin: in dev Vite
// proxies /api and /socket.io to the server, and in production the server
// serves the client itself. Vercel previews set VITE_API_URL to the staging
// server (see .env.example).
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(
  /\/+$/,
  "",
);

// Build a server URL: apiUrl("/api/healthz") -> "/api/healthz" locally,
// "https://staging.example.org/api/healthz" on a Vercel preview.
export function apiUrl(path: string): string {
  return API_BASE_URL + path;
}
