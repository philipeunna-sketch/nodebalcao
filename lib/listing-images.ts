export const LISTING_IMAGE_PLACEHOLDER = "/listing-no-photo.svg";

const KNOWN_PLACEHOLDER_FILE = /(?:^|\/)(?:favicon|placeholder(?:-image)?|no[-_ ]?(?:image|photo)|sem[-_ ]?foto|default[-_ ]?image)(?:\.[a-z0-9]+)?(?:[?#].*)?$/i;

export function isUsableListingImage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const source = value.trim();
  if (!source || source === LISTING_IMAGE_PLACEHOLDER || KNOWN_PLACEHOLDER_FILE.test(source)) return false;
  if (source.startsWith("/")) return !source.startsWith("//");
  try {
    const url = new URL(source);
    return (url.protocol === "http:" || url.protocol === "https:") && !KNOWN_PLACEHOLDER_FILE.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeListingImages(values: unknown[]) {
  const normalized = values
    .filter(isUsableListingImage)
    .map((value) => value.trim());
  return [...new Set(normalized)];
}

export function listingCoverImage(coverImage: unknown, images: unknown[]) {
  return normalizeListingImages([coverImage, ...images])[0] || null;
}
