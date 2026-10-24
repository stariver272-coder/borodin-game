import { scenes } from "./story";
import type { PublicRoom, RoomState } from "./types";

// The shared step is a voting checkpoint; each reader has a separate cursor.
export function votingCheckpoint(room: Pick<PublicRoom, "status" | "step" | "phase">) {
  if (room.status !== "playing") return null;
  const step = scenes.findIndex((scene, index) => scene.type === "poll" &&
    (room.phase === "closed" ? index > room.step : index >= room.step));
  return step < 0 ? null : step;
}

export function readingLimit(room: Pick<PublicRoom, "status" | "step" | "phase">) {
  return room.status === "lobby" ? 0 : votingCheckpoint(room) ?? scenes.length - 1;
}

// A polling response can race a navigation response without changing room.version.
export function newerState(current: RoomState | null, next: RoomState) {
  if (!current || next.room.code !== current.room.code) return next;
  if (next.room.version < current.room.version) return current;
  return next.reading.version < current.reading.version
    ? { ...next, reading: { ...current.reading, limit: next.reading.limit }, myVote: current.myVote }
    : next;
}
