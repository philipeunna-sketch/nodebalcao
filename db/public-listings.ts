import { readListingAiOverrides } from "./ai-review";
import {
  findStoredListingById,
  isListingSuppressed,
  listSuppressedListingIds,
  getListingSellerProfiles,
  listHomeStoredListings,
  listHomeStoredListingsByCategories,
  listImportedVehicleHomeListings,
  listImportedVehicleListings,
  listStoredListings,
  searchStoredListings,
  type ListingSellerProfile,
  type StoredListing,
} from "./listings";
import { listActiveStoreListingsForPortal } from "./stores";
import { classifyListingLocally, makeListingSourceRecordsUnique, normalizeListingSourceRecord, type ImportRecord, type UnknownListingSourceRecord } from "./listing-import";
import { readPortalSettings } from "./settings";
import { portalCategories } from "../app/categories";
import { listingCoverImage, normalizeListingImages } from "../lib/listing-images";
import { listingPath } from "../lib/listing-url";
import { ensureAllListingSlugs, ensureListingSlugs, sourceKeyForSlug, storedListingKey, storeListingKey } from "./listing-slugs";

export type PublicListing = {
  id: string;
  url: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  price: number | null;
  formattedPrice: string;
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  coverImage: string | null;
  featured: boolean;
  createdAt: string | null;
  status: string;
  negotiationType: string;
  attributes: Record<string, string | number | boolean>;
  features: string[];
  publicationType: string;
  featuredPlan: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentAmountCents: number | null;
  paymentExpiresAt: string | null;
  storeListing?: boolean;
  imported?: boolean;
  seller: { name?: string; avatar?: string; email?: string; sellerEmail?: string };
  aiReviewed?: boolean;
  analytics?: { views: number; pageViews: number; sessions: number; phoneClicks: number; whatsappClicks: number };
};

function parseJson<T>(value: string, fallback: T) {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function normalizeStored(row: StoredListing, profile?: ListingSellerProfile): PublicListing {
  const storedImages = normalizeListingImages(parseJson<string[]>(row.imagesJson, []));
  const coverImage = listingCoverImage(row.coverImage, storedImages);
  const images = normalizeListingImages([coverImage, ...storedImages]);
  const priceCents = row.negotiable ? null : row.monthlyRentCents ?? row.priceCents;
  const formattedPrice = row.negotiable || !priceCents
    ? "Valor a combinar"
    : `${(priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${row.monthlyRentCents ? "/mês" : ""}`;

  return {
    id: row.id,
    url: listingPath(row.slug || ""),
    slug: row.slug || "",
    title: row.title,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    price: priceCents == null ? null : priceCents / 100,
    formattedPrice,
    locationLabel: row.address,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    images,
    coverImage,
    featured: (row.publicationType === "featured" || row.publicationType === "super_featured") && row.paymentStatus === "paid",
    createdAt: row.createdAt,
    status: row.status,
    negotiationType: row.negotiationType,
    attributes: parseJson(row.attributesJson, {}),
    features: parseJson(row.featuresJson, []),
    publicationType: row.publicationType,
    featuredPlan: row.featuredPlan,
    paymentStatus: row.paymentStatus,
    paymentMethod: row.paymentMethod,
    paymentAmountCents: row.paymentAmountCents,
    paymentExpiresAt: row.paymentExpiresAt,
    seller: {
      name: row.displayName || profile?.name,
      avatar: profile?.profileImageUrl || undefined,
    },
    imported: ["importacao@balcao.com", "importacao@balcao.com.br", "importacao@palcao.com.br"].includes((profile?.email || "").toLowerCase()),
  };
}

export function normalizeStoreListing(row: Record<string, unknown>): PublicListing {
  const priceCents = row.priceCents == null ? null : Number(row.priceCents);
  const storedImages = normalizeListingImages(parseJson<string[]>(String(row.imagesJson || "[]"),[]));
  const coverImage = listingCoverImage(row.coverImage, storedImages);
  const images = normalizeListingImages([coverImage, ...storedImages]);
  return {
    id: `store:${String(row.storeId)}:${String(row.id)}`,
    url: listingPath(String(row.slug || "")),
    slug: String(row.slug || ""), title: String(row.title), description: String(row.description || ""),
    category: String(row.category), subcategory: String(row.subcategory), price: priceCents == null ? null : priceCents / 100,
    formattedPrice: priceCents == null ? "Valor a combinar" : (priceCents / 100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),
    locationLabel: String(row.address || ""), latitude: null, longitude: null, images, coverImage,
    featured: false, createdAt: String(row.createdAt || ""), status: "active", negotiationType: "Venda",
    attributes: parseJson(String(row.attributesJson || "{}"),{}), features: [], publicationType: "store", featuredPlan: null,
    paymentStatus: null, paymentMethod: null, paymentAmountCents: null, paymentExpiresAt: null, storeListing: true,
    seller: { name: String(row.storeName || "Loja Balcão"), avatar: row.storeLogo ? String(row.storeLogo) : undefined },
  };
}

async function withStoredSlugs(rows: StoredListing[]) {
  if (rows.every((row) => Boolean(row.slug))) return rows;
  const assigned = await ensureListingSlugs(rows.map((row) => ({ key: storedListingKey(row.id), id: row.id, title: row.title, storedSlug: row.slug, table: "portal_listings" })));
  return rows.map((row) => ({ ...row, slug: assigned.get(storedListingKey(row.id)) || row.slug }));
}

async function withStoreSlugs(rows: Record<string, unknown>[]) {
  if (rows.every((row) => Boolean(row.slug))) return rows;
  const assigned = await ensureListingSlugs(rows.map((row) => ({ key: storeListingKey(String(row.storeId), String(row.id)), id: String(row.id), title: String(row.title), storedSlug: row.slug ? String(row.slug) : null, table: "portal_store_listings" })));
  return rows.map((row) => ({ ...row, slug: assigned.get(storeListingKey(String(row.storeId), String(row.id))) || row.slug }));
}

let publicCache: { expiresAt: number; data: PublicListing[] } | null = null;
let homeCache: { expiresAt: number; data: PublicListing[] } | null = null;
let externalCache: { expiresAt: number; sourceUrl: string; data: PublicListing[] } | null = null;

const DEFAULT_LISTINGS_API_URL = process.env.LISTINGS_API_URL ?? "https://ow7hfhirtmiiw.kimi.page/data/api.json";

function externalPublicListing(record: ImportRecord, source: UnknownListingSourceRecord, index = 0): PublicListing | null {
  const classification = classifyListingLocally(record, portalCategories);
  const price = record.priceCents == null ? null : record.priceCents / 100;
  const sourceStatus = String(source.status || "publish").toLowerCase();
  if (!["publish", "published", "active", "ativo"].includes(sourceStatus)) return null;
  const attributes: Record<string, string | number | boolean> = {};
  if (record.sourceUrl) attributes.sourceUrl = record.sourceUrl;
  return {
    id: record.id,
    url: "",
    slug: "",
    title: record.title,
    description: record.description,
    category: classification.category,
    subcategory: classification.subcategory,
    price,
    formattedPrice: price == null || price === 0
      ? "Valor a combinar"
      : price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    locationLabel: "Belo Horizonte, MG",
    latitude: -19.9166813,
    longitude: -43.9344931,
    images: normalizeListingImages(record.images),
    coverImage: listingCoverImage(null, record.images),
    featured: index < 6,
    createdAt: record.createdAt,
    status: "active",
    negotiationType: /alug|locaç|locacao/i.test(`${record.title} ${record.description}`) ? "Aluguel" : "Venda",
    attributes,
    features: [],
    publicationType: index < 6 ? "featured" : "free",
    featuredPlan: index < 6 ? "monthly" : null,
    paymentStatus: index < 6 ? "paid" : null,
    paymentMethod: null,
    paymentAmountCents: null,
    paymentExpiresAt: null,
    imported: true,
    seller: { name: record.displayName },
  } satisfies PublicListing;
}

async function externalListings(options: { fresh?: boolean } = {}) {
  let sourceUrl = DEFAULT_LISTINGS_API_URL;
  try {
    const settings = await readPortalSettings();
    if (typeof settings.listing_import_url === "string" && /^https?:\/\//i.test(settings.listing_import_url)) sourceUrl = settings.listing_import_url;
  } catch { /* O catálogo público padrão continua disponível sem configurações salvas. */ }
  if (!options.fresh && externalCache && externalCache.sourceUrl === sourceUrl && externalCache.expiresAt > Date.now()) return externalCache.data;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let response: Response;
    try { response = await fetch(sourceUrl, { signal: controller.signal, headers: { accept: "application/json" } }); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json: unknown = await response.json();
    const root = json && typeof json === "object" ? json as UnknownListingSourceRecord : {};
    const collection = Array.isArray(json)
      ? json
      : ["listings", "anuncios", "ads", "items", "data"].map((key) => root[key]).find(Array.isArray);
    if (!Array.isArray(collection)) throw new Error("LISTING_COLLECTION_NOT_FOUND");
    const sources = collection.slice(0, 3_000).filter((item): item is UnknownListingSourceRecord => Boolean(item) && typeof item === "object");
    const records = makeListingSourceRecordsUnique(sources.flatMap((item, index) => {
      const record = normalizeListingSourceRecord(item, index);
      return record ? [record] : [];
    }));
    const rawData = records.flatMap((record, index) => {
      const normalized = externalPublicListing(record, sources[index] || {}, index);
      return normalized ? [normalized] : [];
    });
    const assigned = await ensureListingSlugs(rawData.map((item) => ({ key: storedListingKey(item.id), id: item.id, title: item.title })));
    const data = rawData.map((item) => ({ ...item, slug: assigned.get(storedListingKey(item.id)) || "", url: listingPath(assigned.get(storedListingKey(item.id)) || "") }));
    externalCache = { data, sourceUrl, expiresAt: Date.now() + 300_000 };
    return data;
  } catch {
    return externalCache?.data || [];
  }
}

export function invalidatePublicListingsCache() {
  publicCache = null;
  homeCache = null;
}

function listingRank(item: PublicListing) {
  if (item.publicationType === "super_featured" && item.paymentStatus === "paid") return 4;
  if (item.publicationType === "featured" && item.paymentStatus === "paid") return 3;
  // Publicações reais de usuários entram antes do catálogo complementar das lojas.
  return item.storeListing ? 1 : 2;
}

function orderListings(items: PublicListing[]) {
  return items.sort((a, b) => listingRank(b) - listingRank(a) || Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
}

function coverOnly(item: PublicListing): PublicListing {
  const cover = listingCoverImage(item.coverImage, item.images);
  const videoUrl = typeof item.attributes?.videoUrl === "string" ? item.attributes.videoUrl : undefined;
  return {
    ...item,
    description: "",
    latitude: null,
    longitude: null,
    images: cover ? [cover] : [],
    coverImage: cover,
    attributes: videoUrl ? { videoUrl } : {},
    features: [],
    paymentMethod: null,
    paymentAmountCents: null,
    paymentExpiresAt: null,
    seller: { name: item.seller.name },
  };
}

async function applyOverrides(listings: PublicListing[]) {
  const overrides = await readListingAiOverrides(listings.map((item) => item.id));
  return listings.map((item) => {
    const override = overrides.get(item.id);
    return override
      ? { ...item, category: override.category, subcategory: override.subcategory, aiReviewed: true }
      : item;
  });
}

export async function getPublicListings(options: { includePending?: boolean; fresh?: boolean } = {}) {
  const includePending = options.includePending === true;
  if (!includePending && !options.fresh && publicCache && publicCache.expiresAt > Date.now()) return publicCache.data;
  try {
    await ensureAllListingSlugs();
    const [stored,storeRows,external,suppressedIds] = await Promise.all([
      listStoredListings(includePending),
      includePending ? [] : listActiveStoreListingsForPortal(),
      includePending ? [] : externalListings({ fresh: options.fresh }),
      includePending ? new Set<string>() : listSuppressedListingIds(),
    ]);
    const profiles = await getListingSellerProfiles(stored.map((listing) => listing.userId));
    const regular = await applyOverrides((await withStoredSlugs(stored)).map((listing) => normalizeStored(listing, profiles.get(listing.userId))));
    const storeListings = (await withStoreSlugs(storeRows)).map(normalizeStoreListing);
    const data = orderListings([...new Map([
      ...external.filter((listing) => !suppressedIds.has(listing.id)),
      ...regular,
      ...storeListings,
    ].map((listing) => [listing.id, listing])).values()]);
    if (!includePending) publicCache = { data, expiresAt: Date.now() + 60_000 };
    return data;
  } catch {
    return !includePending && publicCache ? publicCache.data : [];
  }
}

export async function getHomeListings(options: { regularLimit?: number; storeLimit?: number; fresh?: boolean } = {}) {
  if (!options.fresh && homeCache && homeCache.expiresAt > Date.now()) return homeCache.data;
  const regularLimit = Math.min(Math.max(options.regularLimit || 140, 20), 400);
  const storeLimit = Math.min(Math.max(options.storeLimit || 30, 1), 100);
  try {
    await ensureAllListingSlugs();
    // Read the three local catalog sources in parallel. Auxiliary collections
    // must never prevent the main listings from rendering.
    const [stored, categoryRows, importedVehicles, storeRows] = await Promise.all([
      listHomeStoredListings(regularLimit)
        .catch(() => listStoredListings(false, regularLimit, true))
        .catch(() => listStoredListings(false, regularLimit)),
      listHomeStoredListingsByCategories(["Veículos", "Imóveis", "Empregos", "Comércio e Negócios", "Informática", "Tecnologia", "Animais"], 9)
        .catch(() => []),
      listImportedVehicleHomeListings(40)
        .catch(() => listImportedVehicleListings(40, true))
        .catch(() => []),
      listActiveStoreListingsForPortal(storeLimit, true).catch(() => []),
    ]);
    const combined = [...new Map([...stored, ...categoryRows, ...importedVehicles].map((listing) => [listing.id, listing])).values()];
    const importedVehicleIds = new Set(importedVehicles.map((listing) => listing.id));
    // Stored imports are the canonical public catalog. Avoid waiting for the
    // external import feed on every cold Home request; synchronization remains
    // available in the administrative importer.
    const regular = (await withStoredSlugs(combined)).map((listing) => ({
      ...normalizeStored(listing),
      imported: importedVehicleIds.has(listing.id),
    }));
    const data = orderListings([...new Map([
      ...regular,
      ...(await withStoreSlugs(storeRows)).map(normalizeStoreListing),
    ].map((listing) => [listing.id, listing])).values()]).map(coverOnly);
    homeCache = { data, expiresAt: Date.now() + 300_000 };
    return data;
  } catch {
    return homeCache?.data || [];
  }
}

export async function searchPublicListings(query: string, options: { limit?: number; offset?: number } = {}) {
  await ensureAllListingSlugs();
  const result = await searchStoredListings(query, options);
  const data = await applyOverrides((await withStoredSlugs(result.rows)).map((listing) => normalizeStored(listing)));
  return { data, total: result.total };
}

export async function getPublicListing(id: string) {
  await ensureAllListingSlugs();
  if (publicCache && publicCache.expiresAt > Date.now()) {
    const cached = publicCache.data.find((item) => item.id === id);
    if (cached) return cached;
  }
  try {
    const row = await findStoredListingById(id);
    if (!row) return await isListingSuppressed(id) ? null : (await externalListings()).find((item) => item.id === id) || null;
    const profiles = await getListingSellerProfiles([row.userId]);
    const [item] = await applyOverrides((await withStoredSlugs([row])).map((listing) => normalizeStored(listing, profiles.get(listing.userId))));
    return item || null;
  } catch { return null; }
}

export async function getPublicListingSourceKey(slug: string) {
  await ensureAllListingSlugs();
  const key = await sourceKeyForSlug(slug);
  if (key) return key;
  await externalListings();
  return sourceKeyForSlug(slug);
}
