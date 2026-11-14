CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`token_hash` text NOT NULL,
	`kind` text NOT NULL,
	`login` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`user_id` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_idx` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_expires_at_idx` ON `invites` (`expires_at`);