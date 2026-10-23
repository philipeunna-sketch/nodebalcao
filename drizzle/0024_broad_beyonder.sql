CREATE TABLE `portal_banner_events` (
	`id` text PRIMARY KEY NOT NULL,
	`banner_id` text NOT NULL,
	`event_type` text NOT NULL,
	`session_id` text NOT NULL,
	`page_path` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_banner_events_banner_idx` ON `portal_banner_events` (`banner_id`,`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `portal_banner_events_session_idx` ON `portal_banner_events` (`banner_id`,`session_id`);--> statement-breakpoint
CREATE TABLE `portal_banners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`placement` text NOT NULL,
	`type` text NOT NULL,
	`image_url` text,
	`script_code` text,
	`target_url` text,
	`start_at` text,
	`end_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_banners_placement_idx` ON `portal_banners` (`placement`,`status`,`start_at`,`end_at`);