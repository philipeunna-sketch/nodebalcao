import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPortalSettings } from "../../../db/settings";
import { SITE_URL } from "../../../lib/site-url";
import { normalizeWordPressPost, wordpressPostsEndpoint } from "../../../lib/wordpress-news";
import { AdSenseUnit, ListingsBootstrap, OptimizedImage, PortalFooter, PortalHeader } from "../../shared";
import { getPublicListings } from "../../../db/public-listings";
import { ListenArticleButton, NewsCommentForm } from "./news-interactions";

const DEFAULT_WORDPRESS_API = "https://balcaonews.com.br";
const plain = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function getPost(slug: string) {
  const settings = await readPortalSettings();
  const decodedSlug = decodeURIComponent(slug);
  const imported = Array.isArray(settings.imported_news_posts) ? settings.imported_news_posts as unknown as ReturnType<typeof normalizeWordPressPost>[] : [];
  const stored = imported.find((post) => post.slug === decodedSlug);
  if (stored) return stored;
  const base = typeof settings.wordpress_api_url === "string" && settings.wordpress_api_url.trim() ? settings.wordpress_api_url.trim() : DEFAULT_WORDPRESS_API;
  const response = await fetch(wordpressPostsEndpoint(base, { slug: decodedSlug, limit: 1 }), { headers: { Accept: "application/json" } }).catch(() => null);
  if (!response?.ok) return null;
  const data = await response.json().catch(() => []) as Record<string, unknown>[];
  return data[0] ? normalizeWordPressPost(data[0]) : null;
}

async function getNewsFeed() {
  const settings = await readPortalSettings();
  const imported = Array.isArray(settings.imported_news_posts) ? settings.imported_news_posts as unknown as ReturnType<typeof normalizeWordPressPost>[] : [];
  if (imported.length) return imported.slice(0, 20);
  const base = typeof settings.wordpress_api_url === "string" && settings.wordpress_api_url.trim() ? settings.wordpress_api_url.trim() : DEFAULT_WORDPRESS_API;
  const response = await fetch(wordpressPostsEndpoint(base, { limit: 20 }), { headers: { Accept: "application/json" } }).catch(() => null);
  if (!response?.ok) return [];
  const data = await response.json().catch(() => []) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(normalizeWordPressPost) : [];
}

function splitAfterSecondParagraph(html: string) {
  const matches = [...html.matchAll(/<\/p\s*>/gi)];
  if (matches.length < 2) return [html, ""] as const;
  const index = (matches[1].index || 0) + matches[1][0].length;
  return [html.slice(0, index), html.slice(index)] as const;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Notícia não encontrada" };
  const title = plain(post.title);
  const description = post.subtitle.slice(0, 160);
  const canonical = `${SITE_URL}/noticias/${encodeURIComponent(post.slug)}`;
  return { title, description, alternates: { canonical }, openGraph: { type: "article", title, description, url: canonical, publishedTime: post.date, modifiedTime: post.modified, images: post.image ? [{ url: post.image, alt: post.imageAlt }] : [] }, twitter: { card: "summary_large_image", title, description, images: post.image ? [post.image] : [] } };
}

export const dynamic = "force-dynamic";

export default async function NewsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [post, listings, feed] = await Promise.all([getPost(slug), getPublicListings(), getNewsFeed()]);
  if (!post) notFound();
  const canonical = `${SITE_URL}/noticias/${encodeURIComponent(post.slug)}`;
  const related = feed.filter((item) => item.slug !== post.slug).slice(0, 4);
  const latest = feed.filter((item) => item.slug !== post.slug).slice(0, 10);
  const [contentBeforeRelated, contentAfterRelated] = splitAfterSecondParagraph(post.content);
  const articleText = plain(`${post.title}. ${post.subtitle}. ${post.content}`).slice(0, 18000);
  const schema = { "@context": "https://schema.org", "@type": "NewsArticle", headline: plain(post.title), description: post.subtitle, image: [{ "@type": "ImageObject", url: post.image }], datePublished: post.date, dateModified: post.modified, mainEntityOfPage: { "@type": "WebPage", "@id": canonical }, inLanguage: "pt-BR", isAccessibleForFree: true, author: { "@type": "Organization", name: "Jornal Balcão", url: SITE_URL }, publisher: { "@type": "Organization", name: "Jornal Balcão", url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-balcao.jpg` } } };
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${plain(post.title)} ${canonical}`)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonical)}`;
  return <ListingsBootstrap data={listings.slice(0, 120)}><main><PortalHeader /><article className="news-article page-shell"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} /><AdSenseUnit placement="news-article-top" format="horizontal" className="news-article-ad" /><header><span>Balcão News</span><h1 dangerouslySetInnerHTML={{ __html: post.title }} />{post.subtitle ? <p>{post.subtitle}</p> : null}<div className="news-share-row"><a href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a><a href={facebookUrl} target="_blank" rel="noopener noreferrer">Facebook</a></div><time dateTime={post.date}>{post.date ? new Date(post.date).toLocaleString("pt-BR") : ""}</time></header><OptimizedImage className="news-article-cover" src={post.image} alt={post.imageAlt} width={1200} height={675} loading="eager" fetchPriority="high" /><div className="news-audio-row"><ListenArticleButton text={articleText} /></div><div className="news-article-content"><div dangerouslySetInnerHTML={{ __html: contentBeforeRelated }} />{related.length ? <aside className="news-read-more"><h2>Leia também nosso site:</h2><div>{related.map((item) => <a key={item.slug} href={item.link}><OptimizedImage src={item.image} alt={item.imageAlt} width={88} height={62} loading="lazy" /><strong dangerouslySetInnerHTML={{ __html: item.title }} /></a>)}</div></aside> : null}<div dangerouslySetInnerHTML={{ __html: contentAfterRelated }} /><NewsCommentForm postSlug={post.slug} /></div>{latest.length ? <section className="news-latest-block"><header><span>Balcão News</span><h2>Últimas matérias</h2></header><div>{latest.map((item) => <a key={item.slug} href={item.link}><OptimizedImage src={item.image} alt={item.imageAlt} width={320} height={180} loading="lazy" /><strong dangerouslySetInnerHTML={{ __html: item.title }} /><time dateTime={item.date}>{item.date ? new Date(item.date).toLocaleDateString("pt-BR") : ""}</time></a>)}</div></section> : null}</article><PortalFooter /></main></ListingsBootstrap>;
}

