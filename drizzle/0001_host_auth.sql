CREATE TABLE `host_login_limits` (
	`ip_hash` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `host_login_limits_window_idx` ON `host_login_limits` (`window_start`);--> statement-breakpoint
CREATE TABLE `host_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires_at` integer NOT NULL,
	`password_version` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `host_sessions_expiry_idx` ON `host_sessions` (`expires_at`);