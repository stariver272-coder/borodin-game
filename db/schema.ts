import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(), owner: text("owner").notNull(), hostHash: text("host_hash").notNull(), title: text("title").notNull(),
  status: text("status").notNull().default("lobby"), step: integer("step").notNull().default(0), phase: text("phase").notNull().default("read"),
  version: integer("version").notNull().default(0), createdAt: integer("created_at").notNull(),
}, t => [index("rooms_owner_idx").on(t.owner)]);
export const players = sqliteTable("players", {
  id: text("id").primaryKey(), room: text("room").notNull().references(() => rooms.code), name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(), lastSeen: integer("last_seen").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("players_room_idx").on(t.room)]);
export const ballots = sqliteTable("ballots", {
  room: text("room").notNull().references(() => rooms.code), poll: text("poll").notNull(), player: text("player").notNull().references(() => players.id),
  choice: text("choice").notNull(), reason: text("reason").notNull().default(""), updatedAt: integer("updated_at").notNull(),
}, t => [primaryKey({columns: [t.room, t.poll, t.player]})]);
export const portraits = sqliteTable("portraits", {
  owner: text("owner").notNull(), character: text("character").notNull(), objectKey: text("object_key").notNull(),
}, t => [primaryKey({columns: [t.owner, t.character]})]);
