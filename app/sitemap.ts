import type { MetadataRoute } from "next";
import { getPublicListings } from "../db/public-listings";
import { listVirtualStores } from "../db/stores";
import { listPublicAdvertiserSlugs } from "../db/customer-auth";
import { itatiaiaVideoListings } from "./itatiaia-videos";
import { SITE_URL } from "../lib/site-url";
import { categoryPath, listingPath } from "../lib/listing-url";
import { readPortalSettings } from "../db/settings";
import { normalizeWordPressPost, wordpressPostsEndpoint } from "../lib/wordpress-news";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, stores, advertisers, settings] = await Promise.all([getPublicListings(), listVirtualStores().catch(() => []), listPublicAdvertiserSlugs().catch(() => []), readPortalSettings()]);
  const wordpressBase = typeof settings.wordpress_api_url === "string" && settings.wordpress_api_url.trim() ? settings.wordpress_api_url.trim() : "https://balcaonews.com.br";
  const importedNews = Array.isArray(settings.imported_news_posts) ? settings.imported_news_posts as unknown as ReturnType<typeof normalizeWordPressPost>[] : [];
  const news = importedNews.length ? importedNews : await fetch(wordpressPostsEndpoint(wordpressBase, { limit: 100 }), { headers: { Accept: "application/json" } }).then((response) => response.ok ? response.json() : []).then((data: unknown) => Array.isArray(data) ? data.map((post) => normalizeWordPressPost(post as Record<string, unknown>)) : []).catch(() => []);
  const categories = settings.categories as Array<{ name: string; subs: string[] }>;
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/anuncios`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/videos`, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE_URL}/noticias`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/news-sitemap.xml`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/publicidadelegal`, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE_URL}/lojas`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/imobiliarias`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/lojas-de-carros`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/lojas-virtuais`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/criar-anuncio-ia`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${SITE_URL}/campanha/anuncie-seu-imovel`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/campanha/anuncie-seu-veiculo`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/campanha/anuncio-destacado`, changeFrequency: "weekly", priority: 0.8 },
    ...stores.map((store) => ({ url: `${SITE_URL}/loja/${encodeURIComponent(store.slug)}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...advertisers.map((slug) => ({ url: `${SITE_URL}/anunciantes/${encodeURIComponent(slug)}`, changeFrequency: "daily" as const, priority: 0.75 })),
    ...categories.map((category) => ({ url: `${SITE_URL}${categoryPath(category.name)}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...categories.flatMap((category) => category.subs.map((sub) => ({ url: `${SITE_URL}${categoryPath(category.name, sub)}`, changeFrequency: "daily" as const, priority: 0.75 }))),
    ...itatiaiaVideoListings.map((item) => ({ url: `${SITE_URL}${listingPath(item.slug || "")}`, lastModified: item.createdAt ? new Date(item.createdAt) : now, changeFrequency: "weekly" as const, priority: 0.85 })),
    ...listings.slice(0, 5000).map((item) => ({ url: new URL(item.url || listingPath(item.slug || ""), SITE_URL).toString(), lastModified: item.createdAt ? new Date(item.createdAt) : undefined, changeFrequency: "weekly" as const, priority: item.featured ? 0.9 : 0.7 })),
    ...news.map((post) => ({ url: `${SITE_URL}/noticias/${encodeURIComponent(post.slug)}`, lastModified: post.modified ? new Date(post.modified) : undefined, changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
