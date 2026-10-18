CREATE TABLE IF NOT EXISTS `room_host_presence` (
	`room` text NOT NULL,
	`session_id` text NOT NULL,
	`seen_at` integer NOT NULL,
	`closed` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`room`, `session_id`),
	FOREIGN KEY (`room`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `room_host_presence_online_idx` ON `room_host_presence` (`room`,`closed`,`seen_at`);
