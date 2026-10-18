CREATE TABLE `ballots` (
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
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_seen` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `players_room_idx` ON `players` (`room`);--> statement-breakpoint
CREATE TABLE `portraits` (
	`owner` text NOT NULL,
	`character` text NOT NULL,
	`object_key` text NOT NULL,
	PRIMARY KEY(`owner`, `character`)
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`host_hash` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`phase` text DEFAULT 'read' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_owner_idx` ON `rooms` (`owner`);