CREATE TABLE IF NOT EXISTS `ballots` (
	`room` text NOT NULL,
	`poll` text NOT NULL,
	`player` text NOT NULL,
	`choice` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`room`, `poll`, `player`),
	FOREIGN KEY (`room`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_seen` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX IF NOT EXISTS `players_room_idx` ON `players` (`room`);
CREATE TABLE IF NOT EXISTS `portraits` (
	`owner` text NOT NULL,
	`character` text NOT NULL,
	`object_key` text NOT NULL,
	PRIMARY KEY(`owner`, `character`)
);

CREATE TABLE IF NOT EXISTS `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`host_hash` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`phase` text DEFAULT 'read' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`revealed_answers` text DEFAULT '[]' NOT NULL,
	`unlocked_act` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `rooms_owner_idx` ON `rooms` (`owner`);
CREATE TABLE IF NOT EXISTS `host_login_limits` (
	`ip_hash` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`attempts` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `host_login_limits_window_idx` ON `host_login_limits` (`window_start`);
CREATE TABLE IF NOT EXISTS `host_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires_at` integer NOT NULL,
	`password_version` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `host_sessions_expiry_idx` ON `host_sessions` (`expires_at`);
CREATE TABLE IF NOT EXISTS `room_host_presence` (
  `room` text NOT NULL,
  `session_id` text NOT NULL,
  `seen_at` integer NOT NULL,
  `closed` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`room`, `session_id`),
  FOREIGN KEY (`room`) REFERENCES `rooms` (`code`) ON UPDATE no action ON DELETE no action
);
CREATE INDEX IF NOT EXISTS `room_host_presence_online_idx` ON `room_host_presence` (`room`, `closed`, `seen_at`);
CREATE TABLE IF NOT EXISTS `room_reading_progress` (
  `room` text NOT NULL,
  `reader` text NOT NULL,
  `step` integer DEFAULT 0 NOT NULL,
  `version` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`room`, `reader`),
  FOREIGN KEY (`room`) REFERENCES `rooms` (`code`) ON UPDATE no action ON DELETE no action
);
SELECT name FROM sqlite_master
WHERE type = 'table' AND name IN ('rooms', 'players', 'ballots', 'portraits', 'host_sessions', 'host_login_limits', 'room_host_presence', 'room_reading_progress')
ORDER BY name;
