CREATE TABLE `shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`quantity` text,
	`checked_at` integer,
	`checked_by` text,
	`checked_changed_at` integer,
	`edited_at` integer,
	`added_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`checked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shopping_items_archived_at_idx` ON `shopping_items` (`archived_at`);--> statement-breakpoint
CREATE INDEX `shopping_items_name_key_idx` ON `shopping_items` (`name_key`);