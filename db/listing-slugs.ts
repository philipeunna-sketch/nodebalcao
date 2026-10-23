import { itatiaiaVideos } from "../app/itatiaia-videos";
import { listingTitleSlug } from "../lib/listing-url";

export type SlugSource = {
  key: string;
  id: string;
  title: string;
  storedSlug?: string | null;
  table?: "portal_listings" | "portal_store_listings";
};

const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
let backfillPromise: Promise<void> | null = null;

// The registry reserves slugs across ordinary, imported, store and video ads.
// A reservation is never renamed or reused when an ad is edited or deleted.
export async function ensureListingSlugs(sources: SlugSource[]) {
  const { env } = await import("cloudflare:workers");
  const unique = [...new Map(sources.map((source) => [source.key, source])).values()];
  const assigned = new Map<string, string>();
  if (!unique.length) return assigned;

  const rows = await env.DB.prepare("SELECT source_key AS sourceKey, slug FROM portal_listing_slugs").all<{ sourceKey: string; slug: string }>();
  const used = new Set(rows.results.map((row) => row.slug));
  for (const row of rows.results) assigned.set(row.sourceKey, row.slug);

  const missing = unique.filter((source) => !assigned.has(source.key));
  const reservations = missing.map((source) => {
    const base = source.storedSlug && validSlug.test(source.storedSlug) ? source.storedSlug : listingTitleSlug(source.title);
    let slug = base;
    for (let suffix = 2; used.has(slug); suffix++) slug = `${base}-${suffix}`;
    used.add(slug);
    return { key: source.key, slug };
  });
  // D1's production SQLite build may allow fewer bound variables than the
  // local preview. Twenty rows keep the three bindings per row below 100.
  for (let start = 0; start < reservations.length; start += 20) {
    const chunk = reservations.slice(start, start + 20);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT OR IGNORE INTO portal_listing_slugs (source_key, slug, created_at) VALUES ${chunk.map(() => "(?, ?, ?)").join(",")}`)
      .bind(...chunk.flatMap((entry) => [entry.key, entry.slug, now])).run();
  }

  for (let start = 0; start < missing.length; start += 50) {
    const chunk = missing.slice(start, start + 50);
    const result = await env.DB.prepare(`SELECT source_key AS sourceKey, slug FROM portal_listing_slugs WHERE source_key IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk.map((source) => source.key)).all<{ sourceKey: string; slug: string }>();
    for (const row of result.results) assigned.set(row.sourceKey, row.slug);
  }

  // Two Workers can reserve the same title concurrently. The unique index
  // decides the winner; the losing Worker retries with the next free suffix.
  for (const source of missing.filter((item) => !assigned.has(item.key))) {
    const base = listingTitleSlug(source.title);
    for (let suffix = 2; !assigned.has(source.key); suffix++) {
      const candidate = `${base}-${suffix}`;
      await env.DB.prepare("INSERT OR IGNORE INTO portal_listing_slugs (source_key, slug, created_at) VALUES (?, ?, ?)")
        .bind(source.key, candidate, new Date().toISOString()).run();
      const row = await env.DB.prepare("SELECT slug FROM portal_listing_slugs WHERE source_key = ?").bind(source.key).first<{ slug: string }>();
      if (row) assigned.set(source.key, row.slug);
    }
  }

  const updates = unique.filter((source) => source.table && source.storedSlug !== assigned.get(source.key));
  if (updates.some((source) => source.table === "portal_listings")) {
    await env.DB.prepare(`UPDATE portal_listings SET slug =
      (SELECT slug FROM portal_listing_slugs WHERE source_key = 'listing:' || portal_listings.id)
      WHERE EXISTS (SELECT 1 FROM portal_listing_slugs WHERE source_key = 'listing:' || portal_listings.id)
      AND (slug IS NULL OR slug <> (SELECT slug FROM portal_listing_slugs WHERE source_key = 'listing:' || portal_listings.id))`).run();
  }
  if (updates.some((source) => source.table === "portal_store_listings")) {
    await env.DB.prepare(`UPDATE portal_store_listings SET slug =
      (SELECT slug FROM portal_listing_slugs WHERE source_key = 'store:' || portal_store_listings.store_id || ':' || portal_store_listings.id)
      WHERE EXISTS (SELECT 1 FROM portal_listing_slugs WHERE source_key = 'store:' || portal_store_listings.store_id || ':' || portal_store_listings.id)
      AND (slug IS NULL OR slug <> (SELECT slug FROM portal_listing_slugs WHERE source_key = 'store:' || portal_store_listings.store_id || ':' || portal_store_listings.id))`).run();
  }
  return new Map(unique.map((source) => [source.key, assigned.get(source.key)!]));
}

export function storedListingKey(id: string) { return `listing:${id}`; }
export function storeListingKey(storeId: string, id: string) { return `store:${storeId}:${id}`; }
export function videoListingKey(id: string) { return `video:${id}`; }

export async function ensureAllListingSlugs() {
  if (!backfillPromise) {
    backfillPromise = (async () => {
      const { env } = await import("cloudflare:workers");
      const [listings, stores] = await Promise.all([
        env.DB.prepare("SELECT id, title, slug FROM portal_listings ORDER BY created_at, id").all<{ id: string; title: string; slug: string | null }>(),
        env.DB.prepare("SELECT id, store_id AS storeId, title, slug FROM portal_store_listings ORDER BY created_at, id").all<{ id: string; storeId: string; title: string; slug: string | null }>(),
      ]);
      await ensureListingSlugs([
        ...itatiaiaVideos.map((video) => ({ key: videoListingKey(`itatiaia-${video.slug}`), id: `itatiaia-${video.slug}`, title: video.title })),
        ...listings.results.map((row) => ({ key: storedListingKey(row.id), id: row.id, title: row.title, storedSlug: row.slug, table: "portal_listings" as const })),
        ...stores.results.map((row) => ({ key: storeListingKey(row.storeId, row.id), id: row.id, title: row.title, storedSlug: row.slug, table: "portal_store_listings" as const })),
      ]);
    })().catch((error: unknown) => { backfillPromise = null; throw error; });
  }
  await backfillPromise;
}

export async function sourceKeyForSlug(slug: string) {
  const { env } = await import("cloudflare:workers");
  const result = await env.DB.prepare("SELECT source_key AS sourceKey FROM portal_listing_slugs WHERE slug = ? LIMIT 1")
    .bind(slug).first<{ sourceKey: string }>();
  return result?.sourceKey || null;
}

export async function slugForSourceKey(key: string) {
  const { env } = await import("cloudflare:workers");
  const result = await env.DB.prepare("SELECT slug FROM portal_listing_slugs WHERE source_key = ? LIMIT 1")
    .bind(key).first<{ slug: string }>();
  return result?.slug || null;
}
