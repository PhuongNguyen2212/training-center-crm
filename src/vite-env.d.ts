/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth 2.0 Web client ID (exposed to the browser — not secret). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Target Google Calendar ID to sync sessions to/from. Defaults to "primary". */
  readonly VITE_GOOGLE_CALENDAR_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
