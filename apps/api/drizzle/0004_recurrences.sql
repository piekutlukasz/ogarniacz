CREATE TABLE `recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`assignee_id` text,
	`pattern` text NOT NULL,
	`start_on` text NOT NULL,
	`last_due_on` text NOT NULL,
	`paused_at` integer,
	`paused_until` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_id` text REFERENCES recurrences(id);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_recurrence_due_on_idx` ON `tasks` (`recurrence_id`,`due_on`);