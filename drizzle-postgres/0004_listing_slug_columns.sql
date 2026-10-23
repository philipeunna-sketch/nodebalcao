ALTER TABLE "portal_listings" ADD COLUMN IF NOT EXISTS "slug" text;--> statement-breakpoint
ALTER TABLE "portal_store_listings" ADD COLUMN IF NOT EXISTS "slug" text;
