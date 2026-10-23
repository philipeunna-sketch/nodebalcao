CREATE TABLE `portal_news_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_slug` text NOT NULL,
	`name` text NOT NULL,
	`comment` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_news_comments_post_idx` ON `portal_news_comments` (`post_slug`,`status`,`created_at`);