CREATE TABLE IF NOT EXISTS "portal_banners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"placement" text NOT NULL,
	"type" text NOT NULL,
	"image_url" text,
	"script_code" text,
	"target_url" text,
	"start_at" text,
	"end_at" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_banners_placement_idx" ON "portal_banners" ("placement","status","start_at","end_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_banner_events" (
	"id" text PRIMARY KEY NOT NULL,
	"banner_id" text NOT NULL,
	"event_type" text NOT NULL,
	"session_id" text NOT NULL,
	"page_path" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_banner_events_banner_idx" ON "portal_banner_events" ("banner_id","event_type","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_banner_events_session_idx" ON "portal_banner_events" ("banner_id","session_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_listing_slugs" (
	"source_key" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_listing_suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_news_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_slug" text NOT NULL,
	"name" text NOT NULL,
	"comment" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_news_comments_post_idx" ON "portal_news_comments" ("post_slug","status","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_ai_call_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text NOT NULL,
	"offer_type" text NOT NULL,
	"prompt" text NOT NULL,
	"script" text NOT NULL,
	"audio_key" text NOT NULL,
	"audio_mime_type" text DEFAULT 'audio/wav' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_call_campaigns_created_idx" ON "portal_ai_call_campaigns" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_ai_call_campaigns_user_idx" ON "portal_ai_call_campaigns" ("user_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_listing_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"owner_user_id" integer NOT NULL,
	"sender_name" text NOT NULL,
	"sender_email" text NOT NULL,
	"sender_phone" text,
	"message" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_listing_proposals_owner_idx" ON "portal_listing_proposals" ("owner_user_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_password_resets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" text NOT NULL,
	"used_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_vehicle_brands" (
	"id" text PRIMARY KEY NOT NULL,
	"external_code" text NOT NULL,
	"name" text NOT NULL,
	"vehicle_type" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"last_synced_at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "portal_vehicle_brands_type_code_unique" UNIQUE("vehicle_type","external_code")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicle_brands_type_name" ON "portal_vehicle_brands" ("vehicle_type","name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_vehicle_models" (
	"id" text PRIMARY KEY NOT NULL,
	"external_code" text NOT NULL,
	"name" text NOT NULL,
	"brand_id" text NOT NULL,
	"vehicle_type" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"last_synced_at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "portal_vehicle_models_brand_code_unique" UNIQUE("brand_id","external_code")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicle_models_brand_name" ON "portal_vehicle_models" ("brand_id","name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_fipe_sync_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_type" text NOT NULL,
	"brands_found" integer NOT NULL,
	"brands_processed" integer NOT NULL,
	"models_found" integer NOT NULL,
	"errors_json" text NOT NULL,
	"status" text NOT NULL,
	"started_at" text NOT NULL,
	"finished_at" text
);
