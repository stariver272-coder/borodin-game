import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(), owner: text("owner").notNull(), hostHash: text("host_hash").notNull(), title: text("title").notNull(),
  status: text("status").notNull().default("lobby"), step: integer("step").notNull().default(0), phase: text("phase").notNull().default("read"),
  version: integer("version").notNull().default(0), createdAt: integer("created_at").notNull(), revealedAnswers: text("revealed_answers").notNull().default("[]"),
  unlockedAct: integer("unlocked_act").notNull().default(1),
}, t => [index("rooms_owner_idx").on(t.owner)]);
export const players = sqliteTable("players", {
  id: text("id").primaryKey(), room: text("room").notNull().references(() => rooms.code), name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(), lastSeen: integer("last_seen").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("players_room_idx").on(t.room)]);
export const roomReadingProgress = sqliteTable("room_reading_progress", {
  room: text("room").notNull().references(() => rooms.code), reader: text("reader").notNull(),
  step: integer("step").notNull().default(0), version: integer("version").notNull().default(0),
}, t => [primaryKey({columns: [t.room, t.reader]})]);
export const ballots = sqliteTable("ballots", {
  room: text("room").notNull().references(() => rooms.code), poll: text("poll").notNull(), player: text("player").notNull().references(() => players.id),
  choice: text("choice").notNull(), reason: text("reason").notNull().default(""), updatedAt: integer("updated_at").notNull(),
}, t => [primaryKey({columns: [t.room, t.poll, t.player]})]);
export const portraits = sqliteTable("portraits", {
  owner: text("owner").notNull(), character: text("character").notNull(), objectKey: text("object_key").notNull(),
}, t => [primaryKey({columns: [t.owner, t.character]})]);
export const hostSessions = sqliteTable("host_sessions", {
  tokenHash: text("token_hash").primaryKey(), owner: text("owner").notNull(),
  expiresAt: integer("expires_at").notNull(), passwordVersion: text("password_version").notNull(),
}, t => [index("host_sessions_expiry_idx").on(t.expiresAt)]);
export const hostLoginLimits = sqliteTable("host_login_limits", {
  ipHash: text("ip_hash").primaryKey(), windowStart: integer("window_start").notNull(), attempts: integer("attempts").notNull(),
}, t => [index("host_login_limits_window_idx").on(t.windowStart)]);
export const roomHostPresence = sqliteTable("room_host_presence", {
  room: text("room").notNull().references(() => rooms.code),
  sessionId: text("session_id").notNull(),
  seenAt: integer("seen_at").notNull(),
  closed: integer("closed").notNull().default(0),
}, t => [primaryKey({columns: [t.room, t.sessionId]}), index("room_host_presence_online_idx").on(t.room, t.closed, t.seenAt)]);
