CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`status` text,
	`resume_path` text,
	`score_snapshot` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ats` text,
	`board_token` text,
	`careers_url` text,
	`website` text,
	`first_seen_at` integer,
	`last_seen_at` integer,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`external_id` text,
	`source` text,
	`title` text NOT NULL,
	`location` text,
	`url` text,
	`description` text,
	`posted_date` integer,
	`status` text DEFAULT 'NEW' NOT NULL,
	`score` integer,
	`claimed_by` text,
	`claimed_at` integer,
	`last_error` text,
	`discovered_at` integer,
	`scored_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_source_external_id_unq` ON `jobs` (`source`,`external_id`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);