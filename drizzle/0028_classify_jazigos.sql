UPDATE `portal_listings`
SET `category` = 'Imóveis',
    `subcategory` = 'Jazigos',
    `updated_at` = CURRENT_TIMESTAMP
WHERE lower(
  coalesce(`title`, '') || ' ' ||
  coalesce(`description`, '') || ' ' ||
  coalesce(`category`, '') || ' ' ||
  coalesce(`subcategory`, '')
) LIKE '%jazig%';
--> statement-breakpoint
UPDATE `portal_store_listings`
SET `category` = 'Imóveis',
    `subcategory` = 'Jazigos',
    `updated_at` = CURRENT_TIMESTAMP
WHERE lower(
  coalesce(`title`, '') || ' ' ||
  coalesce(`description`, '') || ' ' ||
  coalesce(`category`, '') || ' ' ||
  coalesce(`subcategory`, '')
) LIKE '%jazig%';
--> statement-breakpoint
UPDATE `portal_listing_ai_overrides`
SET `category` = 'Imóveis',
    `subcategory` = 'Jazigos',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `listing_id` IN (
  SELECT `id`
  FROM `portal_listings`
  WHERE `category` = 'Imóveis' AND `subcategory` = 'Jazigos'
);
