CREATE TABLE `allowance_rates` (
	`child_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`amount` integer NOT NULL,
	`set_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`child_id`, `effective_from`),
	FOREIGN KEY (`child_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`set_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`week_start` text NOT NULL,
	`base` integer NOT NULL,
	`rewards` integer NOT NULL,
	`paid_by` text NOT NULL,
	`paid_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paid_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payouts_child_week_idx` ON `payouts` (`child_id`,`week_start`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `reward` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `completed_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `payout_id` text REFERENCES payouts(id);--> statement-breakpoint
CREATE INDEX `tasks_payout_id_idx` ON `tasks` (`payout_id`);--> statement-breakpoint
-- Zadania ukończone przed tą migracją: za chwilę ukończenia przyjmujemy ostatnią zmianę.
UPDATE `tasks` SET `completed_at` = `updated_at` WHERE `status` = 'done';
