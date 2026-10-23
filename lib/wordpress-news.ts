export type WordPressNewsPost = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  image: string;
  imageAlt: string;
  date: string;
  modified: string;
  author: string;
  sourceLink: string;
  link: string;
};

type UnknownRecord = Record<string, unknown>;

function rendered(value: unknown) {
  return typeof value === "object" && value !== null && typeof (value as UnknownRecord).rendered === "string"
    ? String((value as UnknownRecord).rendered)
    : "";
}

function stripHtml(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanWordPressHtml(value: string) {
  const cleaned = value
    .replace(/<!--\s*\/?wp:[\s\S]*?-->/gi, "")
    .replace(/&nbsp;|\u00a0/gi, " ")
    .replace(/<p[^>]*>\s*(?:<br\s*\/?\s*>\s*)*<\/p>/gi, "")
    .replace(/\s+(<\/?(?:p|h[1-6]|ul|ol|li|blockquote|figure|figcaption)\b)/gi, "$1")
    .replace(/(<\/(?:p|h[1-6]|ul|ol|li|blockquote|figure|figcaption)>)\s+/gi, "$1")
    .trim();
  if (/<(?:p|h[1-6]|ul|ol|blockquote|figure)\b/i.test(cleaned)) return cleaned;
  return cleaned.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`).join("");
}

export function wordpressPostsEndpoint(base: string, options: { limit?: number; slug?: string; search?: string } = {}) {
  const url = new URL(base);
  const path = url.pathname.replace(/\/$/, "");
  if (!path.includes("/wp-json/")) url.pathname = `${path}/wp-json/wp/v2/posts`;
  else if (/\/wp-json$/i.test(path)) url.pathname = `${path}/wp/v2/posts`;
  url.searchParams.set("_embed", "1");
  url.searchParams.set("_fields", "id,slug,title,link,excerpt,content,date,modified,author,featured_media,_links,_embedded,yoast_head_json");
  url.searchParams.set("per_page", String(Math.min(100, Math.max(1, options.limit || 20))));
  if (options.slug) url.searchParams.set("slug", options.slug);
  if (options.search) url.searchParams.set("search", options.search.slice(0, 120));
  return url.toString();
}

export function normalizeWordPressPost(post: UnknownRecord): WordPressNewsPost {
  const embedded = post._embedded as { [key: string]: UnknownRecord[] } | undefined;
  const media = embedded?.["wp:featuredmedia"]?.[0] || {};
  const authorData = embedded?.author?.[0] || {};
  const mediaDetails = media.media_details as { sizes?: Record<string, { source_url?: string }> } | undefined;
  const sizes = mediaDetails?.sizes || {};
  const yoast = post.yoast_head_json as UnknownRecord | undefined;
  const yoastImages = Array.isArray(yoast?.og_image) ? yoast.og_image as UnknownRecord[] : [];
  const yoastImage = typeof yoastImages[0]?.url === "string" ? yoastImages[0].url : "";
  const slug = String(post.slug || post.id || "noticia");
  const excerptHtml = rendered(post.excerpt);
  const subtitle = stripHtml(typeof yoast?.description === "string" && yoast.description.trim() ? yoast.description : excerptHtml);
  const image = String(sizes.large?.source_url || sizes.medium_large?.source_url || sizes.full?.source_url || media.source_url || yoastImage || "/logo-balcao.jpg");
  return {
    id: Number(post.id || 0),
    slug,
    title: rendered(post.title) || "Notícia",
    subtitle,
    excerpt: stripHtml(excerptHtml),
    content: cleanWordPressHtml(rendered(post.content)),
    image,
    imageAlt: String(media.alt_text || stripHtml(rendered(post.title)) || "Notícia do Balcão News"),
    date: String(post.date || ""),
    modified: String(post.modified || post.date || ""),
    author: String(authorData.name || "Jornal Balcão"),
    sourceLink: String(post.link || ""),
    link: `/noticias/${encodeURIComponent(slug)}`,
  };
}
