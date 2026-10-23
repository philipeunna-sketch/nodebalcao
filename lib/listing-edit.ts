import { portalCategories } from "../app/categories";
import type { ListingEditInput, StoredListing } from "../db/listings";
import { normalizeListingImages } from "./listing-images";
import { plainListingDescription } from "./listing-description";

type EditPayload = Record<string, unknown>;
type CategoryOption = { name: string; subs: string[] };

const negotiations = new Set(["Compra", "Venda", "Troca", "Aluguel", "Temporada", "Serviço", "Outra"]);
const propertyAttributeKeys = new Set(["propertyType", "bedrooms", "suites", "bathrooms", "parkingSpaces", "area", "totalArea", "builtArea", "condition", "videoUrl"]);
const vehicleAttributeKeys = new Set(["vehicleType", "brand", "model", "version", "year", "modelYear", "mileage", "transmission", "fuel", "color", "doors", "plateEnding", "condition", "videoUrl"]);

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const cents = (value: unknown) => value === "" || value == null ? null : Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function safeListingVideoUrl(value: unknown) {
  const candidate = text(value).slice(0, 500);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./, "");
    const knownProvider = host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com") || host.endsWith("vimeo.com");
    const directVideo = /\.(mp4|webm)$/i.test(url.pathname);
    return knownProvider || directVideo ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeAttributes(payload: EditPayload, category: string, changedCategory: boolean) {
  const raw = payload.attributes && typeof payload.attributes === "object" && !Array.isArray(payload.attributes)
    ? payload.attributes as Record<string, unknown>
    : {};
  const allowed = category === "Imóveis" ? propertyAttributeKeys : category === "Veículos" ? vehicleAttributeKeys : null;
  const entries: Array<[string, string | number | boolean]> = [];
  for (const [key, value] of Object.entries(raw).slice(0, 40)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key) || key === "videoUrl") continue;
    if (changedCategory && allowed && !allowed.has(key)) continue;
    if (changedCategory && !allowed) continue;
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) entries.push([key, value]);
    else if (typeof value === "string") entries.push([key, value.trim().slice(0, 160)]);
  }
  const attributes = Object.fromEntries(entries) as Record<string, string | number | boolean>;
  const videoUrl = safeListingVideoUrl(raw.videoUrl);
  if (videoUrl) attributes.videoUrl = videoUrl;
  return { attributes, invalidVideo: videoUrl === null };
}

export function validateListingEdit(
  payload: EditPayload,
  current: StoredListing,
  imagePrefix: string,
  categories: CategoryOption[] = portalCategories,
): { input: ListingEditInput; error?: never } | { error: string; input?: never } {
  const title = text(payload.title);
  const description = text(payload.description);
  const category = text(payload.category);
  const subcategory = text(payload.subcategory);
  const negotiationType = text(payload.negotiationType);
  const categoryRecord = categories.find((item) => item.name === category);
  if (title.length < 8 || title.length > 120) return { error: "Informe um título entre 8 e 120 caracteres." };
  const descriptionLength = plainListingDescription(description).length;
  if (descriptionLength < 30 || descriptionLength > 5000 || description.length > 20000) return { error: "A descrição deve ter entre 30 e 5.000 caracteres." };
  if (!categoryRecord || !categoryRecord.subs.includes(subcategory)) return { error: "Categoria ou subcategoria inválida." };
  if (!negotiations.has(negotiationType)) return { error: "Selecione um tipo de negociação válido." };

  const previousImages = new Set(parseStringArray(current.imagesJson));
  const submittedImages = Array.isArray(payload.images) ? payload.images.map(text) : [];
  const images = normalizeListingImages(submittedImages.filter((url) => previousImages.has(url) || url.startsWith(imagePrefix))).slice(0, 12);
  if (!images.length) return { error: "Mantenha pelo menos uma foto no anúncio." };

  const address = text(payload.address);
  if (!address) return { error: "Informe a localização do anúncio." };
  const latitude = payload.latitude == null || payload.latitude === "" ? null : Number(payload.latitude);
  const longitude = payload.longitude == null || payload.longitude === "" ? null : Number(payload.longitude);
  if ((latitude == null) !== (longitude == null)) return { error: "Confira a latitude e a longitude do anúncio." };
  if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) return { error: "Latitude inválida." };
  if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) return { error: "Longitude inválida." };
  if (category === "Imóveis" && (latitude == null || longitude == null)) return { error: "Selecione a localização do imóvel no mapa." };

  const displayName = text(payload.displayName);
  const whatsapp = text(payload.whatsapp).replace(/\D/g, "");
  if (displayName.length < 2 || whatsapp.length < 10 || whatsapp.length > 13) return { error: "Informe o nome de exibição e um WhatsApp válido." };

  const negotiable = payload.negotiable === true;
  const priceCents = cents(payload.priceCents);
  const monthlyRentCents = cents(payload.monthlyRentCents);
  if (!negotiable && negotiationType === "Aluguel" && monthlyRentCents == null) return { error: "Informe o valor mensal do aluguel." };
  if (!negotiable && negotiationType !== "Aluguel" && priceCents == null) return { error: "Informe o valor do anúncio." };

  const normalized = normalizeAttributes(payload, category, category !== current.category);
  if (normalized.invalidVideo) return { error: "Use um link HTTPS válido do YouTube, Vimeo ou de um arquivo MP4/WebM." };
  const features = Array.isArray(payload.features)
    ? [...new Set(payload.features.map(text).filter(Boolean))].slice(0, 20)
    : [];

  return {
    input: {
      title,
      description,
      category,
      subcategory,
      negotiationType,
      priceCents: negotiable ? null : priceCents,
      monthlyRentCents: negotiable ? null : monthlyRentCents,
      iptuCents: cents(payload.iptuCents),
      condoCents: cents(payload.condoCents),
      negotiable,
      address,
      latitude,
      longitude,
      displayName,
      whatsapp,
      attributes: normalized.attributes,
      features,
      images,
    },
  };
}
