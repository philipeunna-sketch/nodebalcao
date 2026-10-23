import type { Metadata } from "next";
import { searchPublicListings } from "../../db/public-listings";
import { getSynchronizedNews } from "../../db/news";
import {
  ListingsBootstrap,
  OptimizedImage,
  PortalFooter,
  PortalHeader,
} from "../shared";
import { LISTING_IMAGE_PLACEHOLDER } from "../../lib/listing-images";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const RESULTS_PER_PAGE = 48;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function plainText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:0?39|x27);/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const query = firstValue(params.busca || params.q).trim().slice(0, 120);
  return {
    title: query ? `Busca por ${query} | Portal Balcão` : "Busca | Portal Balcão",
    description:
      "Pesquise anúncios classificados e matérias do Balcão News em um só lugar.",
    robots: { index: false, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = firstValue(params.busca || params.q).trim().slice(0, 120);
  const requestedPage = Number(firstValue(params.pagina));
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.trunc(requestedPage)) : 1;
  const [listingResult, newsResult] = query
    ? await Promise.all([
        searchPublicListings(query, { limit: RESULTS_PER_PAGE, offset: (page - 1) * RESULTS_PER_PAGE }),
        getSynchronizedNews({ search: query, limit: 24 }),
      ])
    : [{ data: [], total: 0 }, { posts: [] }];
  const listings = listingResult.data;
  const news = newsResult.posts;
  const total = listingResult.total + news.length;
  const totalPages = Math.max(1, Math.ceil(listingResult.total / RESULTS_PER_PAGE));
  const pageUrl = (target: number) => `/busca?busca=${encodeURIComponent(query)}&pagina=${target}`;

  return (
    <ListingsBootstrap data={listings}>
      <main>
        <PortalHeader />
        <section className="global-search-page page-shell">
          <header className="global-search-heading">
            <span>Busca no Portal Balcão</span>
            <h1>{query ? `Resultados para “${query}”` : "Pesquise no site"}</h1>
            <p role="status">
              {query
                ? `${total} resultado${total === 1 ? "" : "s"}: ${listingResult.total} anúncio${listingResult.total === 1 ? "" : "s"} e ${news.length} matéria${news.length === 1 ? "" : "s"}.`
                : "Digite um termo na busca para encontrar anúncios e matérias."}
            </p>
          </header>

          {query && !total ? (
            <div className="global-search-empty">
              <strong>Nenhum resultado encontrado</strong>
              <p>Tente usar menos palavras ou um termo mais amplo.</p>
            </div>
          ) : null}

          {listings.length ? (
            <section className="global-search-section" aria-labelledby="search-listings-title">
              <h2 id="search-listings-title">Anúncios</h2>
              <div className="global-search-list">
                {listings.map((item) => (
                  <a key={item.id} className="global-search-card" href={item.url}>
                    <OptimizedImage
                      src={item.coverImage || LISTING_IMAGE_PLACEHOLDER}
                      fallbackSources={item.images}
                      alt=""
                      width={220}
                      height={150}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>
                      <small>{item.category}{item.subcategory ? ` · ${item.subcategory}` : ""}</small>
                      <strong>{item.title}</strong>
                      <em>{item.locationLabel}</em>
                      <b>{item.formattedPrice}</b>
                    </span>
                  </a>
                ))}
              </div>
              {totalPages > 1 ? (
                <nav className="global-search-pagination" aria-label="Páginas dos resultados de anúncios">
                  {page > 1 ? <a href={pageUrl(page - 1)}>‹ Anterior</a> : <span aria-disabled="true">‹ Anterior</span>}
                  <strong>Página {Math.min(page, totalPages)} de {totalPages}</strong>
                  {page < totalPages ? <a href={pageUrl(page + 1)}>Próxima ›</a> : <span aria-disabled="true">Próxima ›</span>}
                </nav>
              ) : null}
            </section>
          ) : null}

          {news.length ? (
            <section className="global-search-section" aria-labelledby="search-news-title">
              <h2 id="search-news-title">Matérias do Balcão News</h2>
              <div className="global-search-list">
                {news.map((post) => (
                  <a key={post.slug} className="global-search-card news" href={`/noticias/${encodeURIComponent(post.slug)}`}>
                    <OptimizedImage
                      src={post.image}
                      alt=""
                      width={220}
                      height={150}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>
                      <small>Balcão News</small>
                      <strong>{plainText(post.title)}</strong>
                      {post.subtitle ? <em>{post.subtitle}</em> : null}
                      <time dateTime={post.date}>
                        {post.date
                          ? new Date(post.date).toLocaleDateString("pt-BR")
                          : ""}
                      </time>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </section>
        <PortalFooter />
      </main>
    </ListingsBootstrap>
  );
}
