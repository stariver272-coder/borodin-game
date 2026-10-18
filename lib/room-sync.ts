import type {Credentials, RoomState} from "./types";

export type SyncStatus = "connecting" | "live" | "host-offline" | "finished" | "disconnected";
type Options = {
  session: Credentials;
  onState: (state: RoomState) => void;
  onStatus: (status: SyncStatus, error?: string) => void;
  fetcher?: typeof fetch;
};

// No timer survives a pause. Only an explicit resume (or reopening the page)
// starts requests again, so waiting players do not consume polling quota.
export function createRoomSync({session, onState, onStatus, fetcher = fetch}: Options) {
  let active = false, generation = 0, failures = 0, version = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let presenceId: string | undefined;
  const headers = {"Content-Type": "application/json", Authorization: "Bearer " + session.token};

  function stop() {
    active = false;
    generation++;
    clearTimeout(timer);
    controller?.abort();
    if (presenceId) {
      const departing = presenceId;
      presenceId = undefined;
      // Browsers may drop this on exit; the server lease also expires in 45s.
      void fetcher("/api/room", {method: "POST", headers, keepalive: true,
        body: JSON.stringify({action: "leave", code: session.code, presenceId: departing})}).catch(() => {});
    }
  }
  function observe(next: RoomState) {
    if (!active) return;
    if (next.room.code !== session.code || next.room.version < version) return;
    version = next.room.version;
    onState(next);
    const status = next.room.status === "finished" ? "finished" : !next.hostOnline ? "host-offline" : "live";
    if (status !== "live") stop();
    onStatus(status);
  }
  async function poll() {
    const current = generation;
    controller = new AbortController();
    try {
      const response = await fetcher(session.role === "host" ? "/api/room" : "/api/room?code=" + session.code, {
        cache: "no-store", headers,
        ...(session.role === "host" ? {method: "POST", body: JSON.stringify({action: "heartbeat", code: session.code, presenceId})} : {}),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      if (!active || current !== generation) return;
      const data = await response.json() as RoomState & {error?: string};
      if (!active || current !== generation) return;
      if (!response.ok) {
        if ([400, 401, 403, 404].includes(response.status)) failures = 3;
        throw new Error(data.error || "暂时无法连接房间。");
      }
      failures = 0;
      observe(data as RoomState);
    } catch (error) {
      if (!active || current !== generation) return;
      failures++;
      if (failures >= 3) {stop(); onStatus("disconnected", (error as Error).message);}
      else onStatus("connecting", (error as Error).message);
    } finally {
      if (active && current === generation) timer = setTimeout(poll, 2500);
    }
  }
  function resume() {
    stop();
    failures = 0;
    active = true;
    if (session.role === "host") presenceId = crypto.randomUUID();
    onStatus("connecting");
    void poll();
  }
  return {resume, stop, observe};
}
