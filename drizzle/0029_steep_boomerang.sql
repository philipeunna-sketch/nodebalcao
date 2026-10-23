CREATE TABLE `portal_listing_slugs` (
	`source_key` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_listing_slugs_slug_unique` ON `portal_listing_slugs` (`slug`);--> statement-breakpoint
ALTER TABLE `portal_listings` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `portal_listings_slug_idx` ON `portal_listings` (`slug`);--> statement-breakpoint
ALTER TABLE `portal_store_listings` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `portal_store_listings_slug_idx` ON `portal_store_listings` (`slug`);