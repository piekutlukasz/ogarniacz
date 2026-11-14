ALTER TABLE `task_events` ADD `actor_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `assignee_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `due_on` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `tasks_assignee_id_idx` ON `tasks` (`assignee_id`);