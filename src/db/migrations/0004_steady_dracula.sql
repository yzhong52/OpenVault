CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`transaction_id` text NOT NULL,
	`datetime` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_account_txid` ON `transactions` (`account_id`,`transaction_id`);