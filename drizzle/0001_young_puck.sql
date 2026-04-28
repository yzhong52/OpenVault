PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_balances`("id", "account_id", "date", "amount_cents") SELECT "id", "account_id", "date", "amount_cents" FROM `balances`;--> statement-breakpoint
DROP TABLE `balances`;--> statement-breakpoint
ALTER TABLE `__new_balances` RENAME TO `balances`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `balances_account_date` ON `balances` (`account_id`,`date`);