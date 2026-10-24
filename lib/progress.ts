import { scenes } from "./story";
import type { PublicRoom, RoomState } from "./types";

// The shared step is a voting checkpoint; each reader has a separate cursor.
export function votingCheckpoint(room: Pick<PublicRoom, "status" | "step" | "phase">) {
  if (room.status !== "playing") return null;
  const step = scenes.findIndex((scene, index) => scene.type === "poll" &&
    (room.phase === "closed" ? index > room.step : index >= room.step));
  return step < 0 ? null : step;
}

type ActProgress = Pick<PublicRoom, "status" | "step" | "phase"> & { unlocked_act: number };

function lockedActStart(room: ActProgress) {
  // The closing summary is act 4, and opens with the end of act 3.
  return scenes.findIndex(scene => (scene.act === 2 || scene.act === 3) && scene.act > room.unlocked_act);
}

export function waitingAct(room: ActProgress) {
  if (room.status !== "playing") return null;
  const start = lockedActStart(room), checkpoint = votingCheckpoint(room);
  return start >= 0 && (checkpoint === null || checkpoint >= start) ? scenes[start].act : null;
}

export function readingLimit(room: ActProgress) {
  if (room.status === "lobby") return 0;
  if (room.status === "finished") return scenes.length - 1;
  const start = lockedActStart(room);
  return Math.min(votingCheckpoint(room) ?? scenes.length - 1, start < 0 ? scenes.length - 1 : start - 1);
}

// A polling response can race a navigation response without changing room.version.
export function newerState(current: RoomState | null, next: RoomState) {
  if (!current || next.room.code !== current.room.code) return next;
  if (next.room.version < current.room.version) return current;
  return next.reading.version < current.reading.version
    ? { ...next, reading: { ...current.reading, limit: next.reading.limit }, myVote: current.myVote }
    : next;
}
