CREATE TABLE `auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`type` text NOT NULL,
	`user_id` text,
	`actor_id` text,
	`ip` text,
	`user_agent` text,
	`detail` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auth_events_created_at_idx` ON `auth_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `auth_events_user_id_idx` ON `auth_events` (`user_id`);