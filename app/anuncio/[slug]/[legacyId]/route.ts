import { getPublicListing } from "../../../../db/public-listings";
import { ensureAllListingSlugs, slugForSourceKey, videoListingKey } from "../../../../db/listing-slugs";
import { getItatiaiaVideoListing } from "../../../itatiaia-videos";
import { legacyListingIdFromSegment, listingPath } from "../../../../lib/listing-url";
import { SITE_URL } from "../../../../lib/site-url";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ legacyId: string }> }) {
  const id = legacyListingIdFromSegment((await params).legacyId);
  await ensureAllListingSlugs();
  const item = await getPublicListing(id);
  const slug = item?.slug || (getItatiaiaVideoListing(id) ? await slugForSourceKey(videoListingKey(id)) : null);
  if (!slug) return new Response("Anúncio não encontrado.", { status: 404 });
  return Response.redirect(`${SITE_URL}${listingPath(slug)}`, 301);
}

export const HEAD = GET;
