CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`sync_id` integer NOT NULL,
	`amount_cents` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sync_id`) REFERENCES `syncs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `syncs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` text NOT NULL,
	`synced_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
