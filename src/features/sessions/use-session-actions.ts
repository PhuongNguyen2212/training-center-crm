import { useState } from "react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { errorMessage } from "@/lib/error";
import {
  createEvent,
  deleteEvent,
  isConnected,
  isGoogleConfigured,
  updateEvent,
} from "@/lib/google-calendar";
import type { Session } from "@/types";
import type { SessionInput } from "./SessionForm";

/**
 * Create / edit / delete a session. With browser-side Google configured and
 * connected, writes to Google first, then mirrors into the store (the remote
 * backend pushes to Google itself). Each action resolves true on success.
 */
export function useSessionActions() {
  const user = useAuthStore((s) => s.currentUser)!;
  const addSession = useDataStore((s) => s.addSession);
  const updateSession = useDataStore((s) => s.updateSession);
  const deleteSession = useDataStore((s) => s.deleteSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = (editing: Session | null, data: SessionInput) =>
    run(async () => {
      const useApi = isGoogleConfigured() && isConnected();
      if (editing) {
        if (useApi && editing.googleEventId) {
          await updateEvent(editing.googleEventId, data);
        }
        // await so a backend rejection lands in run()'s catch (not swallowed)
        await updateSession(editing.id, data, user.id);
      } else if (useApi) {
        const eventId = await createEvent(data);
        await addSession({ ...data, googleEventId: eventId }, user.id);
      } else {
        await addSession({ ...data, googleEventId: null }, user.id);
      }
    });

  const remove = (session: Session) =>
    run(async () => {
      if (isGoogleConfigured() && isConnected() && session.googleEventId) {
        await deleteEvent(session.googleEventId);
      }
      await deleteSession(session.id, user.id);
    });

  return { busy, error, setError, save, remove };
}
