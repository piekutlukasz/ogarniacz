CREATE TABLE `calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`calendar_id` text NOT NULL,
	`uid` text NOT NULL,
	`instance` text NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`all_day` integer NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`start_on` text NOT NULL,
	`end_on` text NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_instance_idx` ON `calendar_events` (`calendar_id`,`uid`,`instance`);--> statement-breakpoint
CREATE INDEX `calendar_events_end_on_idx` ON `calendar_events` (`end_on`);--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url_enc` text NOT NULL,
	`url_host` text NOT NULL,
	`scope` text NOT NULL,
	`owner_id` text NOT NULL,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`last_error` text,
	`failures` integer DEFAULT 0 NOT NULL,
	`next_sync_at` integer,
	`etag` text,
	`last_modified` text,
	`content_hash` text,
	`synced_day` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `calendars_archived_at_idx` ON `calendars` (`archived_at`);