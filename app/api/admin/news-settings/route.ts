import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { readPortalSettings, writePortalSettings } from "../../../../db/settings";
import { normalizeWordPressPost, wordpressPostsEndpoint, type WordPressNewsPost } from "../../../../lib/wordpress-news";
import { submitSitemapToGoogle } from "../../../../lib/google-search";
import { SITE_URL } from "../../../../lib/site-url";

const DEFAULT_WORDPRESS_API = "https://balcaonews.com.br";

async function authorized(request: Request) {
  return Boolean(await getAdminFromRequest(request));
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const settings = await readPortalSettings();
  return NextResponse.json({ wordpressApi: typeof settings.wordpress_api_url === "string" && settings.wordpress_api_url ? settings.wordpress_api_url : DEFAULT_WORDPRESS_API, posts: Array.isArray(settings.imported_news_posts) ? settings.imported_news_posts : [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { wordpressApi?: string };
  const wordpressApi = payload.wordpressApi?.trim() || "";
  if (!wordpressApi || !validHttpUrl(wordpressApi)) return NextResponse.json({ error: "Informe uma URL válida do WordPress." }, { status: 400 });
  const response = await fetch(wordpressPostsEndpoint(wordpressApi, { limit: 20 }), { headers: { Accept: "application/json" } }).catch(() => null);
  if (!response?.ok) return NextResponse.json({ error: "A API foi salva, mas não foi possível importar as matérias desta URL." }, { status: 400 });
  const data = await response.json().catch(() => []) as Record<string, unknown>[];
  const posts = Array.isArray(data) ? data.map(normalizeWordPressPost) : [];
  await writePortalSettings({ wordpress_api_url: wordpressApi, imported_news_posts: posts, imported_news_last_synced_at: new Date().toISOString() });
  const settings = await readPortalSettings();
  let googleSubmitted = false;
  if (settings.google_search_enabled === true && typeof settings.google_search_service_account === "string" && settings.google_search_service_account) {
    googleSubmitted = await submitSitemapToGoogle(settings.google_search_service_account, SITE_URL, `${SITE_URL}/sitemap.xml`).then(async (result) => { await writePortalSettings({ google_search_last_submitted_at: result.submittedAt }); return true; }).catch(() => false);
  }
  return NextResponse.json({ ok: true, wordpressApi, posts, googleSubmitted }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { post?: Partial<WordPressNewsPost> & { id?: number } };
  const settings = await readPortalSettings();
  const posts = Array.isArray(settings.imported_news_posts) ? settings.imported_news_posts as unknown as WordPressNewsPost[] : [];
  const id = Number(payload.post?.id || 0);
  if (!id || !posts.some((post) => post.id === id)) return NextResponse.json({ error: "Matéria não encontrada." }, { status: 404 });
  const updated = posts.map((post) => post.id === id ? { ...post, title: String(payload.post?.title || post.title).slice(0, 180), subtitle: String(payload.post?.subtitle || post.subtitle).slice(0, 320), content: String(payload.post?.content || post.content).slice(0, 100_000), image: String(payload.post?.image || post.image).slice(0, 2_000), modified: new Date().toISOString() } : post);
  await writePortalSettings({ imported_news_posts: updated });
  return NextResponse.json({ ok: true, posts: updated }, { headers: { "Cache-Control": "no-store" } });
}
