CREATE TABLE `room_reading_progress` (
	`room` text NOT NULL,
	`reader` text NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`room`, `reader`),
	FOREIGN KEY (`room`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `room_reading_progress` (`room`, `reader`, `step`, `version`)
SELECT p.room, p.id, r.step, 0 FROM players p JOIN rooms r ON r.code=p.room;
--> statement-breakpoint
INSERT INTO `room_reading_progress` (`room`, `reader`, `step`, `version`)
SELECT code, 'host', step, 0 FROM rooms;
