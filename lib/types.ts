export type Credentials = {code: string; token: string; role: "host" | "player"; name?: string};
export type PublicRoom = {code: string; title: string; status: string; step: number; phase: string; version: number};
export type Result = {counts: Record<string, number>; total: number; winners: string[]; reasons: {name: string; choice: string; reason: string}[]};
export type RoomState = {room: PublicRoom; hostOnline: boolean; role: "host" | "player"; players: {id: string; name: string; online: boolean; voted: boolean}[]; portraits: Record<string, string>; submitted: number; myVote: {choice: string; reason: string} | null; results: Record<string, Result>};
