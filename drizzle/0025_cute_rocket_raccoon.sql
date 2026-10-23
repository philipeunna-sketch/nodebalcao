CREATE TABLE `portal_ai_call_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_phone` text NOT NULL,
	`offer_type` text NOT NULL,
	`prompt` text NOT NULL,
	`script` text NOT NULL,
	`audio_key` text NOT NULL,
	`audio_mime_type` text DEFAULT 'audio/wav' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_ai_call_campaigns_created_idx` ON `portal_ai_call_campaigns` (`created_at`);--> statement-breakpoint
CREATE INDEX `portal_ai_call_campaigns_user_idx` ON `portal_ai_call_campaigns` (`user_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
