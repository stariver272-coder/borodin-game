export const HOST_TIMEOUT_MS = 45000;
const HEARTBEAT_WRITE_INTERVAL_MS = 10000;

// Each mounted host page has its own lease. Closed leases are tombstones so
// a delayed request cannot resurrect a tab that has already left the room.
export function validPresenceId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export async function hostOnline(db: D1Database, room: string) {
  const row = await db.prepare("SELECT 1 AS online FROM room_host_presence WHERE room=? AND closed=0 AND seen_at>? LIMIT 1")
    .bind(room, Date.now() - HOST_TIMEOUT_MS).first();
  return !!row;
}
export async function heartbeat(db: D1Database, room: string, sessionId: string) {
  const now = Date.now();
  await db.prepare("INSERT INTO room_host_presence(room,session_id,seen_at,closed) VALUES(?,?,?,0) ON CONFLICT(room,session_id) DO UPDATE SET seen_at=excluded.seen_at WHERE room_host_presence.closed=0 AND room_host_presence.seen_at<=?")
    .bind(room, sessionId, now, now - HEARTBEAT_WRITE_INTERVAL_MS).run();
}
export async function closePresence(db: D1Database, room: string, sessionId: string) {
  await db.prepare("INSERT INTO room_host_presence(room,session_id,seen_at,closed) VALUES(?,?,?,1) ON CONFLICT(room,session_id) DO UPDATE SET closed=1,seen_at=excluded.seen_at")
    .bind(room, sessionId, Date.now()).run();
}
