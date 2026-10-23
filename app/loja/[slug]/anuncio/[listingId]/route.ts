import { getStoreListing, getVirtualStoreBySlug } from "../../../../../db/stores";
import { ensureAllListingSlugs } from "../../../../../db/listing-slugs";
import { legacyListingIdFromSegment, listingPath } from "../../../../../lib/listing-url";
import { SITE_URL } from "../../../../../lib/site-url";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; listingId: string }> }) {
  const { slug, listingId } = await params;
  await ensureAllListingSlugs();
  const store = await getVirtualStoreBySlug(slug);
  const listing = store ? await getStoreListing(store.id, legacyListingIdFromSegment(listingId)) : null;
  if (!listing?.slug) return new Response("Anúncio não encontrado.", { status: 404 });
  return Response.redirect(`${SITE_URL}${listingPath(listing.slug)}`, 301);
}

export const HEAD = GET;
