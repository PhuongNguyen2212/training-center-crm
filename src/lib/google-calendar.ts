// Google Calendar API integration for the browser.
//
// Uses Google Identity Services (GIS) "token flow": a popup grants an OAuth
// access token directly to the SPA — no client secret in the browser. The token
// then authorizes REST calls to Calendar API v3.
//
// Config comes from Vite env (exposed to the browser, so VITE_ prefix). When
// VITE_GOOGLE_CLIENT_ID is empty the Schedule page falls back to local-only mode.
//
// Production note (CLAUDE.md): the desktop build should instead run OAuth via
// Tauri and keep the refresh token in secure OS storage. This browser flow is
// for the hosted web demo.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const CALENDAR_ID =
  (import.meta.env.VITE_GOOGLE_CALENDAR_ID as string | undefined) || "primary";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GSI_SRC = "https://accounts.google.com/gsi/client";
const API_BASE = "https://www.googleapis.com/calendar/v3";

export const isGoogleConfigured = (): boolean => Boolean(CLIENT_ID);
export const getCalendarId = (): string => CALENDAR_ID;

let gisLoaded = false;
let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiry = 0;

export const isConnected = (): boolean =>
  Boolean(accessToken) && Date.now() < tokenExpiry;

function loadGis(): Promise<void> {
  if (gisLoaded && window.google) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing && window.google) {
      gisLoaded = true;
      return resolve();
    }
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      gisLoaded = true;
      resolve();
    };
    s.onerror = () =>
      reject(new Error("Không tải được Google Identity Services."));
    document.head.appendChild(s);
  });
}

/** Open the Google consent popup and obtain an access token. */
export async function connectGoogle(): Promise<void> {
  if (!CLIENT_ID)
    throw new Error("Chưa cấu hình VITE_GOOGLE_CLIENT_ID trong file .env.");
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(`Đăng nhập Google thất bại: ${resp.error}`));
          return;
        }
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000;
        resolve();
      },
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

export function disconnectGoogle(): void {
  if (accessToken && window.google) {
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  tokenExpiry = 0;
}

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!isConnected())
    throw new Error("Chưa kết nối Google Calendar. Vui lòng kết nối lại.");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar API lỗi ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : ((await res.json()) as T);
}

// ---- Session <-> Google event mapping --------------------------------------

export interface CalendarSession {
  googleEventId: string;
  title: string;
  startTime: string; // ISO
  endTime: string; // ISO
  teacherId: string | null;
  classId: string | null;
}

interface GEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

function eventToSession(e: GEvent): CalendarSession {
  return {
    googleEventId: e.id,
    title: e.summary ?? "(Không tiêu đề)",
    startTime: e.start?.dateTime ?? e.start?.date ?? new Date().toISOString(),
    endTime: e.end?.dateTime ?? e.end?.date ?? new Date().toISOString(),
    teacherId: e.extendedProperties?.private?.teacherId || null,
    classId: e.extendedProperties?.private?.classId || null,
  };
}

function sessionToEvent(s: Omit<CalendarSession, "googleEventId">) {
  return {
    summary: s.title,
    start: { dateTime: s.startTime },
    end: { dateTime: s.endTime },
    extendedProperties: {
      private: {
        teacherId: s.teacherId ?? "",
        classId: s.classId ?? "",
      },
    },
  };
}

const cal = () => encodeURIComponent(CALENDAR_ID);

/** Pull events from ~30 days ago onward (sync strategy in CLAUDE.md). */
export async function listEvents(): Promise<CalendarSession[]> {
  const timeMin = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const params = new URLSearchParams({
    timeMin,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const data = await api<{ items?: GEvent[] }>(
    `/calendars/${cal()}/events?${params.toString()}`,
  );
  return (data?.items ?? []).map(eventToSession);
}

export async function createEvent(
  s: Omit<CalendarSession, "googleEventId">,
): Promise<string> {
  const data = await api<GEvent>(`/calendars/${cal()}/events`, {
    method: "POST",
    body: JSON.stringify(sessionToEvent(s)),
  });
  if (!data?.id) throw new Error("Google không trả về ID sự kiện.");
  return data.id;
}

export async function updateEvent(
  eventId: string,
  s: Omit<CalendarSession, "googleEventId">,
): Promise<void> {
  await api(`/calendars/${cal()}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify(sessionToEvent(s)),
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await api(`/calendars/${cal()}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
}
