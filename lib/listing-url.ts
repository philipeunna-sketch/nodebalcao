const LEGACY_SEPARATOR = "--id-";

export function listingTitleSlug(title: string) {
  return title.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "") || "anuncio";
}

export function listingPath(slug: string) {
  return `/anuncio/${encodeURIComponent(slug)}`;
}

export function categoryPath(name: string, subcategory?: string) {
  const path = `/categoria/${listingTitleSlug(name)}`;
  return subcategory ? `${path}/${listingTitleSlug(subcategory)}` : path;
}

export function legacyListingIdFromSegment(segment: string) {
  const separator = segment.indexOf(LEGACY_SEPARATOR);
  if (separator >= 0) return segment.slice(separator + LEGACY_SEPARATOR.length);
  // Only used after an exact canonical slug lookup has failed.
  const trailingId = segment.match(/-(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return trailingId?.[1] || segment;
}
