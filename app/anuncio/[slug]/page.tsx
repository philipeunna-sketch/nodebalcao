import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getHomeListings, getPublicListing, getPublicListingSourceKey, normalizeStoreListing } from "../../../db/public-listings";
import { getStoreListing, getVirtualStoreById } from "../../../db/stores";
import { getItatiaiaVideoListing } from "../../itatiaia-videos";
import StoreListingView from "../../loja/[slug]/anuncio/[listingId]/store-details";
import { ListingsBootstrap } from "../../shared";
import ListingDetailsClient from "./details-client";
import { SITE_URL } from "../../../lib/site-url";
import { isUsableListingImage, listingCoverImage } from "../../../lib/listing-images";
import { listingPath } from "../../../lib/listing-url";
import { plainListingDescription } from "../../../lib/listing-description";

export const dynamic = "force-dynamic";
const getListing = cache(getPublicListing);

function absoluteUrl(value: string) {
  return new URL(value, SITE_URL).toString();
}

function socialImage(value: unknown) {
  if (!isUsableListingImage(value)) return null;
  try {
    const image = new URL(value, SITE_URL);
    if (/\.(?:webp|avif)$/i.test(image.pathname)) {
      const preview = new URL("https://wsrv.nl/");
      preview.searchParams.set("url", image.toString());
      preview.searchParams.set("output", "jpg");
      preview.searchParams.set("w", "1200");
      return preview.toString();
    }
    if (image.protocol === "https:") return image.toString();
    if (image.protocol === "http:") return `${SITE_URL}/api/image?url=${encodeURIComponent(image.toString())}&w=1200&format=webp`;
  } catch { /* No public image is available. */ }
  return null;
}

const resolveListing = cache(async (slug: string) => {
  const sourceKey = await getPublicListingSourceKey(slug);
  if (!sourceKey) return null;
  if (sourceKey.startsWith("video:")) {
    const videoItem = getItatiaiaVideoListing(sourceKey.slice("video:".length));
    return videoItem ? { item: null, videoItem, store: null, storeListing: null } : null;
  }
  if (sourceKey.startsWith("store:")) {
    const separator = sourceKey.lastIndexOf(":");
    const store = await getVirtualStoreById(sourceKey.slice("store:".length, separator));
    const storeListing = store ? await getStoreListing(store.id, sourceKey.slice(separator + 1)) : null;
    if (!store || !storeListing || storeListing.slug !== slug) return null;
    const item = normalizeStoreListing({ ...storeListing, storeSlug: store.slug, storeName: store.name, storeLogo: store.logoUrl });
    return { item, videoItem: null, store, storeListing };
  }
  if (!sourceKey.startsWith("listing:")) return null;
  const item = await getListing(sourceKey.slice("listing:".length));
  return item?.slug === slug ? { item, videoItem: null, store: null, storeListing: null } : null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const listing = await resolveListing(slug);
  const resolved = listing?.item || listing?.videoItem;
  const title = resolved ? `${resolved.title} | Portal Balcão` : "Anúncio não encontrado | Portal Balcão";
  const description = resolved ? plainListingDescription(resolved.description).slice(0, 220) : "Consulte anúncios classificados no Portal Balcão.";
  const image = socialImage(listing?.videoItem?.image || listingCoverImage(listing?.item?.coverImage, listing?.item?.images || [])) || `${SITE_URL}/logo-balcao.jpg`;
  const canonical = `${SITE_URL}${listingPath(slug)}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: resolved ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", locale: "pt_BR", url: canonical, siteName: "Portal Balcão", title: resolved?.title || title, description, images: [{ url: image, alt: resolved?.title || "Portal Balcão" }] },
    twitter: { card: "summary_large_image", title: resolved?.title || title, description, images: [image] },
  };
}

export default async function ListingDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await resolveListing(slug);
  if (!listing) notFound();
  const { item, videoItem, store, storeListing } = listing;
  if (store && storeListing) return <StoreListingView store={store} listing={storeListing} />;
  const resolved = item || videoItem;
  const listings = await getHomeListings({ regularLimit: 28, storeLimit: 4 });
  const detailListings = item
    ? [item, ...listings.filter((candidate) => candidate.id !== item.id && candidate.category === item.category).slice(0, 12)]
    : videoItem ? listings.slice(0, 12) : [];
  const canonical = `${SITE_URL}${listingPath(slug)}`;
  const videoUrl = videoItem?.videoUrl || (typeof item?.attributes?.videoUrl === "string" ? item.attributes.videoUrl : "");
  const durationLabel = String(videoItem?.attributes?.durationLabel || item?.attributes?.durationLabel || "");
  const durationMatch = durationLabel.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
  const duration = durationMatch ? `PT${durationMatch[1] ? `${Number(durationMatch[1])}H` : ""}${Number(durationMatch[2]) ? `${Number(durationMatch[2])}M` : ""}${Number(durationMatch[3])}S` : undefined;
  const structuredData = resolved ? videoUrl ? {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: resolved.title,
    description: plainListingDescription(resolved.description),
    thumbnailUrl: [socialImage(videoItem?.image || listingCoverImage(item?.coverImage, item?.images || []))].filter(Boolean),
    contentUrl: absoluteUrl(videoUrl),
    embedUrl: canonical,
    uploadDate: item?.createdAt || videoItem?.createdAt || "2026-08-17T00:00:00-03:00",
    ...(duration ? { duration } : {}),
    publisher: { "@type": "Organization", name: "Portal Balcão", logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-balcao.jpg` } },
  } : {
    "@context": "https://schema.org",
    "@type": "Product",
    name: resolved.title,
    description: plainListingDescription(resolved.description),
    image: item?.images.length ? item.images.map(socialImage).filter(Boolean) : [socialImage(listingCoverImage(item?.coverImage, []))].filter(Boolean),
    url: canonical,
    category: resolved.category,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      ...(resolved.price ? { price: resolved.price } : {}),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      url: canonical,
      seller: { "@type": "Organization", name: item?.seller.name || "Portal Balcão" },
    },
  } : null;

  return (
    <ListingsBootstrap data={detailListings}>
      {structuredData ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /> : null}
      <ListingDetailsClient key={resolved?.id} slug={resolved!.id} publicSlug={slug} videoItem={videoItem || undefined} />
    </ListingsBootstrap>
  );
}
