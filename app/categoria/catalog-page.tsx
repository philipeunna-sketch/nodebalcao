import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicListings } from "../../db/public-listings";
import { readPortalSettings } from "../../db/settings";
import { categoryPath, listingTitleSlug } from "../../lib/listing-url";
import { SITE_URL } from "../../lib/site-url";
import type { PortalCategory } from "../categories";
import { ListingsBootstrap } from "../shared";
import ResultsClient from "../anuncios/results-client";

async function resolveCategory(slug: string, subslug?: string) {
  const settings = await readPortalSettings();
  const categories = settings.categories as PortalCategory[];
  const category = categories.find((item) => listingTitleSlug(item.name) === slug);
  if (!category) notFound();
  const subcategory = subslug ? category.subs.find((name) => listingTitleSlug(name) === subslug) : undefined;
  if (subslug && !subcategory) notFound();
  return { category: category.name, subcategory };
}

export async function categoryMetadata(slug: string, subslug?: string): Promise<Metadata> {
  const { category, subcategory } = await resolveCategory(slug, subslug);
  const subject = subcategory || category;
  const title = `${subject} | Portal Balcão`;
  const description = `Encontre ${subject.toLocaleLowerCase("pt-BR")} em anúncios classificados no Portal Balcão.`;
  const canonical = `${SITE_URL}${categoryPath(category, subcategory)}`;
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical, type: "website" } };
}

export default async function CategoryCatalog({ slug, subslug }: { slug: string; subslug?: string }) {
  const [{ category, subcategory }, listings] = await Promise.all([resolveCategory(slug, subslug), getPublicListings()]);
  const categoryListings = listings.filter((item) => item.category === category);
  const filtered = subcategory ? categoryListings.filter((item) => item.subcategory === subcategory) : categoryListings;
  const structuredData = {
    "@context": "https://schema.org", "@type": "ItemList", name: subcategory || category,
    itemListElement: filtered.slice(0, 50).map((item, index) => ({ "@type": "ListItem", position: index + 1, url: `${SITE_URL}${item.url}`, name: item.title })),
  };
  return <ListingsBootstrap data={categoryListings}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <ResultsClient initialParams={{ category, subcategory }} categoryPage />
  </ListingsBootstrap>;
}
