import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// One .env at the repo root is shared by the web client and the server.
const envDir = "../..";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const serverUrl = `http://localhost:${env.PORT || 3000}`;

  return {
    plugins: [react()],
    envDir,
    server: {
      // In dev, the client calls its own origin and Vite forwards to the server.
      proxy: {
        "/api": serverUrl,
        "/healthz": serverUrl,
        "/socket.io": { target: serverUrl, ws: true },
      },
    },
  };
});
