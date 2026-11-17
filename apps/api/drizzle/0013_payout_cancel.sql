DROP INDEX `payouts_child_week_idx`;--> statement-breakpoint
ALTER TABLE `payouts` ADD `cancelled_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `payouts` ADD `cancelled_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `payouts_child_week_active_idx` ON `payouts` (`child_id`,`week_start`) WHERE cancelled_at IS NULL;