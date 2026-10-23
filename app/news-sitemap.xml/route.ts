import { readPortalSettings } from "../../db/settings";
import { SITE_URL } from "../../lib/site-url";
import { normalizeWordPressPost, wordpressPostsEndpoint } from "../../lib/wordpress-news";

const esc = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] || char);
const plain = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export async function GET() {
  const settings = await readPortalSettings();
  const base = typeof settings.wordpress_api_url === "string" && settings.wordpress_api_url.trim() ? settings.wordpress_api_url.trim() : "https://balcaonews.com.br";
  const imported = Array.isArray(settings.imported_news_posts) ? settings.imported_news_posts as ReturnType<typeof normalizeWordPressPost>[] : [];
  const posts = imported.length ? imported : await fetch(wordpressPostsEndpoint(base, { limit: 100 }), { headers: { Accept: "application/json" } }).then((response) => response.ok ? response.json() : []).then((data: unknown) => Array.isArray(data) ? data.map((post) => normalizeWordPressPost(post as Record<string, unknown>)) : []).catch(() => []);
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const recent = posts.filter((post) => post.date && new Date(post.date).getTime() >= cutoff).slice(0, 1000);
  const urls = recent.map((post) => `<url><loc>${esc(`${SITE_URL}/noticias/${encodeURIComponent(post.slug)}`)}</loc><news:news><news:publication><news:name>Jornal Balcão</news:name><news:language>pt</news:language></news:publication><news:publication_date>${esc(new Date(post.date).toISOString())}</news:publication_date><news:title>${esc(plain(post.title))}</news:title></news:news></url>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls}</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
}

export const dynamic = "force-dynamic";
