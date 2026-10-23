import { normalizeWordPressPost, wordpressPostsEndpoint, type WordPressNewsPost } from "../lib/wordpress-news";
import { readPortalSettings, writePortalSettings } from "./settings";

const DEFAULT_WORDPRESS_API = "https://balcaonews.com.br";
const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
let activeSync: Promise<WordPressNewsPost[]> | null = null;

function searchable(value: unknown) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function configuredPosts(value: unknown) {
  return Array.isArray(value)
    ? value.filter((post): post is WordPressNewsPost => Boolean(post) && typeof post === "object" && typeof (post as { slug?: unknown }).slug === "string")
    : [];
}

function newestFirst(posts: WordPressNewsPost[]) {
  return posts.slice().sort((a, b) => Date.parse(b.date || b.modified || "") - Date.parse(a.date || a.modified || ""));
}

async function fetchPosts(base: string, options: { limit: number; search?: string }) {
  const response = await fetch(wordpressPostsEndpoint(base, options), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`WORDPRESS_${response.status}`);
  const data = await response.json() as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(normalizeWordPressPost) : [];
}

export async function getSynchronizedNews(options: { search?: string; limit?: number; force?: boolean } = {}) {
  const settings = await readPortalSettings();
  const base = typeof settings.wordpress_api_url === "string" && settings.wordpress_api_url.trim()
    ? settings.wordpress_api_url.trim()
    : DEFAULT_WORDPRESS_API;
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit || 10)));
  const query = String(options.search || "").trim().slice(0, 120);
  let imported = configuredPosts(settings.imported_news_posts);
  const lastSync = typeof settings.imported_news_last_synced_at === "string"
    ? Date.parse(settings.imported_news_last_synced_at)
    : 0;
  const stale = options.force === true || !Number.isFinite(lastSync) || Date.now() - lastSync >= AUTO_SYNC_INTERVAL_MS;
  let syncPromise: Promise<WordPressNewsPost[]> | null = null;

  if (stale) {
    if (!activeSync) {
      activeSync = fetchPosts(base, { limit: 20 })
        .then(async (posts) => {
          if (posts.length) {
            await writePortalSettings({
              imported_news_posts: posts,
              imported_news_last_synced_at: new Date().toISOString(),
            });
          }
          return posts;
        })
        .finally(() => { activeSync = null; });
    }
    syncPromise = activeSync;
    if (!query) imported = await syncPromise.catch(() => imported);
  }

  if (!query) return { posts: newestFirst(imported).slice(0, limit), configured: true };

  const terms = searchable(query).split(/\s+/).filter(Boolean);
  const local = imported.filter((post) => {
    const content = searchable(`${post.title} ${post.subtitle} ${post.excerpt} ${post.content} ${post.author}`);
    return terms.every((term) => content.includes(term));
  });
  const [synchronized, remote] = await Promise.all([
    syncPromise ? syncPromise.catch(() => imported) : Promise.resolve(imported),
    fetchPosts(base, { limit, search: query }).catch(() => []),
  ]);
  imported = synchronized;
  const synchronizedLocal = imported.filter((post) => {
    const content = searchable(`${post.title} ${post.subtitle} ${post.excerpt} ${post.content} ${post.author}`);
    return terms.every((term) => content.includes(term));
  });
  const posts = newestFirst([...new Map([...remote, ...local, ...synchronizedLocal].map((post) => [post.slug, post])).values()]).slice(0, limit);
  return { posts, configured: true };
}
