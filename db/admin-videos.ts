import { ensureListingTables, findStoredListingById, type StoredListing } from "./listings";
import { LISTING_IMAGE_PLACEHOLDER } from "../lib/listing-images";
import { ensureAllListingSlugs, ensureListingSlugs, storedListingKey } from "./listing-slugs";

export type AdminVideo = StoredListing & { videoUrl: string; videoType: string; thumbnailUrl: string };
function parseAttributes(value: string) { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } }
function normalize(row: StoredListing): AdminVideo { const attributes = parseAttributes(row.attributesJson); const videoUrl = String(attributes.videoUrl || ""); return { ...row, videoUrl, videoType: String(attributes.videoType || (/youtu(?:\.be|be\.com)/i.test(videoUrl) ? "youtube" : "direct")), thumbnailUrl: row.coverImage }; }

export async function listAdminVideos() {
  const { env } = await import("cloudflare:workers"); await ensureListingTables();
  await ensureAllListingSlugs();
  const rows = (await env.DB.prepare(`SELECT id,slug,user_id AS userId,title,description,negotiation_type AS negotiationType,category,subcategory,
    price_cents AS priceCents,monthly_rent_cents AS monthlyRentCents,iptu_cents AS iptuCents,condo_cents AS condoCents,negotiable,address,
    latitude,longitude,display_name AS displayName,whatsapp,attributes_json AS attributesJson,features_json AS featuresJson,images_json AS imagesJson,
    cover_image AS coverImage,publication_type AS publicationType,featured_plan AS featuredPlan,featured_until AS featuredUntil,expires_at AS expiresAt,
    status,payment_provider AS paymentProvider,payment_reference AS paymentReference,payment_method AS paymentMethod,payment_amount_cents AS paymentAmountCents,
    payment_expires_at AS paymentExpiresAt,payment_status AS paymentStatus,created_at AS createdAt
    FROM portal_listings WHERE json_extract(attributes_json,'$.videoUrl') IS NOT NULL AND trim(json_extract(attributes_json,'$.videoUrl')) <> '' ORDER BY created_at DESC`).all<StoredListing>()).results;
  return rows.map(normalize);
}

type VideoInput = { title:string; description:string; category:string; subcategory:string; videoUrl:string; videoType:string; thumbnailUrl:string; status:string; source?:string; sourceId?:string; durationLabel?:string };
export async function createAdminVideo(input: VideoInput) {
  const { env } = await import("cloudflare:workers"); await ensureListingTables(); const id = crypto.randomUUID(); const now = new Date().toISOString();
  await ensureAllListingSlugs();
  await env.DB.prepare(`INSERT INTO portal_listings (id,user_id,title,description,negotiation_type,category,subcategory,negotiable,address,display_name,whatsapp,attributes_json,features_json,images_json,cover_image,publication_type,status,created_at,updated_at)
    VALUES (?,0,?,?, 'Serviço',?,?,1,'Belo Horizonte, MG','Portal Balcão','3133309600',?,'["Vídeo anúncio"]',?,?, 'video',?,?,?)`)
    .bind(id,input.title,input.description,input.category,input.subcategory,JSON.stringify({videoUrl:input.videoUrl,videoType:input.videoType,...(input.source?{source:input.source}:{}),...(input.sourceId?{sourceId:input.sourceId}:{}),...(input.durationLabel?{durationLabel:input.durationLabel}:{})}),JSON.stringify(input.thumbnailUrl?[input.thumbnailUrl]:[]),input.thumbnailUrl||LISTING_IMAGE_PLACEHOLDER,input.status,now,now).run();
  await ensureListingSlugs([{ key: storedListingKey(id), id, title: input.title, table: "portal_listings" }]);
  return findStoredListingById(id,true);
}
export async function updateAdminVideo(id:string,input:VideoInput) {
  const { env } = await import("cloudflare:workers"); const current = await findStoredListingById(id,true); if(!current) return null;
  const attributes={...parseAttributes(current.attributesJson),videoUrl:input.videoUrl,videoType:input.videoType,...(input.source?{source:input.source}:{}),...(input.sourceId?{sourceId:input.sourceId}:{}),...(input.durationLabel?{durationLabel:input.durationLabel}:{})};
  await env.DB.prepare(`UPDATE portal_listings SET title=?,description=?,category=?,subcategory=?,attributes_json=?,images_json=?,cover_image=?,publication_type='video',status=?,updated_at=? WHERE id=?`)
    .bind(input.title,input.description,input.category,input.subcategory,JSON.stringify(attributes),JSON.stringify(input.thumbnailUrl?[input.thumbnailUrl]:[]),input.thumbnailUrl||LISTING_IMAGE_PLACEHOLDER,input.status,new Date().toISOString(),id).run();
  return findStoredListingById(id,true);
}
export async function deleteAdminVideo(id:string){ const {env}=await import("cloudflare:workers"); const current=await findStoredListingById(id,true); if(!current||!String(parseAttributes(current.attributesJson).videoUrl||"")) return false; const result=await env.DB.prepare("DELETE FROM portal_listings WHERE id=?").bind(id).run(); return Number(result.meta.changes||0)>0; }
