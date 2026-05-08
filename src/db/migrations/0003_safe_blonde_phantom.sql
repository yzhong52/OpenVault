PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` text NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`currency` text,
	`latest_date` text,
	`latest_amount_cents` integer,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("institution_id", "account_id", "name", "type", "currency", "latest_date", "latest_amount_cents") SELECT "institution_id", SUBSTR("id", LENGTH("institution_id") + 2), "name", "type", "currency", "latest_date", "latest_amount_cents" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_institution_account` ON `accounts` (`institution_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `__new_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_balances`("account_id", "date", "amount_cents") SELECT a."id", b."date", b."amount_cents" FROM `balances` b JOIN `accounts` a ON a."institution_id" || '/' || a."account_id" = b."account_id";--> statement-breakpoint
DROP TABLE `balances`;--> statement-breakpoint
ALTER TABLE `__new_balances` RENAME TO `balances`;--> statement-breakpoint
CREATE UNIQUE INDEX `balances_account_date` ON `balances` (`account_id`,`date`);
