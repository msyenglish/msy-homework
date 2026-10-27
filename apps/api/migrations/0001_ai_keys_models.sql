CREATE TABLE `ai_models` (
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`label` text NOT NULL,
	`in_price` real DEFAULT 0 NOT NULL,
	`out_price` real DEFAULT 0 NOT NULL,
	`audio` integer DEFAULT false NOT NULL,
	`json_schema` integer DEFAULT false NOT NULL,
	`free` integer DEFAULT false NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`provider`, `model_id`)
);
--> statement-breakpoint
CREATE TABLE `ai_provider_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`label` text,
	`cipher` text NOT NULL,
	`hint` text NOT NULL,
	`key_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_provider_keys_key_idx` ON `ai_provider_keys` (`key_id`);