CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text DEFAULT 'STARTED' NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`succeeded` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer,
	`tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost` real DEFAULT 0 NOT NULL,
	`error` text,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `agent_runs_agent_idx` ON `agent_runs` (`agent`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`type` text NOT NULL,
	`path` text NOT NULL,
	`mime_type` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `artifacts_job_id_type_idx` ON `artifacts` (`job_id`,`type`);--> statement-breakpoint
CREATE TABLE `job_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`agent` text NOT NULL,
	`event` text NOT NULL,
	`payload` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `job_events_job_id_idx` ON `job_events` (`job_id`);