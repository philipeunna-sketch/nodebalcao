import type { Metadata } from "next";
import { getHomeListings } from "../db/public-listings";
import { mapCategory } from "./categories";
import HomeClient from "./home-client";
import { ListingsBootstrap } from "./shared";
import { SITE_URL } from "../lib/site-url";
import { listingPath } from "../lib/listing-url";

export const metadata: Metadata = {
  title: "Classificados em Belo Horizonte",
  description: "Anúncios de imóveis, veículos, celulares, eletrônicos, serviços e empregos no Portal Balcão.",
  alternates: { canonical: "/" },
};
export const revalidate = 300;

function belongsToHomeRail(item: Awaited<ReturnType<typeof getHomeListings>>[number], rail: string) {
  if (mapCategory(item.category) !== rail) return false;
  return rail !== "Veículos" || item.imported === true;
}

function catalogSeed(items: Awaited<ReturnType<typeof getHomeListings>>) {
  let hash = 2166136261;
  for (const item of items.slice(0, 24)) {
    const value = `${item.id}:${item.createdAt || ""}`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

export default async function HomePage() {
  const listings = await getHomeListings({ regularLimit: 90, storeLimit: 20 });
  const videoListings = listings.filter((item) => typeof item.attributes?.videoUrl === "string" && item.attributes.videoUrl.trim().length > 0);
  const latestMobileListings = listings
    .filter((item) => typeof item.attributes?.videoUrl !== "string" || !item.attributes.videoUrl.trim())
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .slice(0, 30);
  const homeCategories = ["Veículos", "Imóveis", "Empregos", "Comércio e Negócios", "Informática", "Animais"];
  // Reserve a complete row for each category before trimming the bootstrap catalog.
  const railListings = homeCategories.flatMap((category) => listings.filter((item) => belongsToHomeRail(item, category)).slice(0, 5));
  const categoryListings = homeCategories.flatMap((category) => listings.filter((item) => mapCategory(item.category) === category).slice(0, 7));
  const homeListings = [...new Map([
    ...railListings,
    ...latestMobileListings,
    ...videoListings.slice(0, 4),
    ...listings.filter((item) => item.featured).slice(0, 6),
    ...listings.filter((item) => belongsToHomeRail(item, "Veículos")).slice(0, 6),
    ...categoryListings,
    ...listings.slice(0, 24),
  ].map((item) => [item.id, item])).values()].slice(0, 70);
  const homeSeed = catalogSeed(homeListings);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "Portal Balcão",
        url: SITE_URL,
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/busca?busca={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "ItemList",
        itemListElement: homeListings.slice(0, 12).map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: new URL(item.url || listingPath(item.slug),SITE_URL).toString(),
          name: item.title,
        })),
      },
    ],
  };

  return (
    <ListingsBootstrap data={homeListings}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <HomeClient seed={homeSeed} />
    </ListingsBootstrap>
  );
}
