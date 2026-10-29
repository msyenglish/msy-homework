CREATE TABLE `installs` (
	`url` text PRIMARY KEY NOT NULL,
	`version` text DEFAULT '' NOT NULL,
	`last_event` text NOT NULL,
	`pings` integer DEFAULT 0 NOT NULL,
	`first_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_update_at` text
);
