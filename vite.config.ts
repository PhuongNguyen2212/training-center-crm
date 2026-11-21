import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The web app must talk to the real API server. Without VITE_API_URL it falls
// back to a browser-only demo whose data lives in localStorage — fine for a
// sales demo, a data-loss trap for real staff. So a production web build
// refuses to run without it, unless the demo is asked for explicitly
// (VITE_DEMO=true). The desktop build (TAURI_ENV_PLATFORM set) is exempt: it
// uses the embedded backend.
function requireApiUrl(mode: string) {
  const env = loadEnv(mode, process.cwd(), "");
  const isTauri = Boolean(env.TAURI_ENV_PLATFORM);
  if (mode !== "production" || isTauri) return;
  if (!env.VITE_API_URL && env.VITE_DEMO !== "true") {
    throw new Error(
      "VITE_API_URL is not set: this build would run as a localStorage demo " +
        "and real data would never reach the server. Set VITE_API_URL to the " +
        "API server URL, or VITE_DEMO=true for an intentional demo build.",
    );
  }
}

// Tauri expects a fixed port and ignores the src-tauri folder when watching.
export default defineConfig(({ mode }) => ({
  plugins: [react(), { name: "require-api-url", apply: "build", config: () => requireApiUrl(mode) }],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 1420,
    strictPort: false,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
