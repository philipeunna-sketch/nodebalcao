"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { listingPath } from "../lib/listing-url";
import { defaultDiscoverPages, DiscoverPage } from "./discover-data";
import { itatiaiaVideoListings } from "./itatiaia-videos";
import { mapCategory } from "./categories";
import {
  LatestNews,
  OptimizedImage,
  PortalFooter,
  PortalHeader,
  PortalListing,
  useImportedListings,
} from "./shared";
import BannerSlot from "./banner-slot";

const RAIL_SIZE = 5;
const MOBILE_INITIAL_SIZE = 10;
const MOBILE_MORE_SIZE = 10;

function DeferredSection({ children, minHeight = 360 }: { children: ReactNode; minHeight?: number }) {
  // The content stays in the initial document, so fast scrolling never shows
  // a blank page. Native rendering containment lets the browser skip layout
  // and paint work until each lower section is close to the viewport.
  const style = {
    contentVisibility: "auto",
    containIntrinsicSize: `auto ${Math.max(minHeight, 90)}px`,
  } as CSSProperties;
  return <div className="deferred-home-section" style={style}>{children}</div>;
}

function ListingCard({ item, favorite, toggleFavorite, badgeLabel, priority = false }: {
  item: PortalListing;
  favorite: boolean;
  toggleFavorite: (id: string) => void;
  badgeLabel?: string;
  priority?: boolean;
}) {
  return (
    <article className={`listing-card home-listing-card ${item.videoUrl ? "video-listing-card" : ""} ${/super/i.test(item.publicationType||"") ? "super-featured-listing" : item.featured ? "featured-listing" : item.storeListing ? "store-free-listing" : ""}`.trim()}>
      <a href={item.url || listingPath(item.slug || "")} className="image-wrap" aria-label={`Abrir anúncio: ${item.title}`}>
        <OptimizedImage src={item.image} fallbackSources={item.images} alt="" width="520" height="520" loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} />
        {item.featured || badgeLabel ? <span className="home-featured-corner">Destacado</span> : null}
        {item.videoUrl ? <span className="video-play-mark" aria-hidden="true">▶</span> : null}
      </a>
      <button className={`heart ${favorite ? "active" : ""}`} onClick={() => toggleFavorite(item.id)} aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} type="button">
        {favorite ? "♥" : "♡"}
      </button>
      <div className="card-copy">
        {/super/i.test(item.publicationType || "") ? (
          <div className="promotion-strip"><span className="promotion-red">★ Super destaque</span><span className="promotion-green">Prioridade máxima</span></div>
        ) : null}
        <span className="eyebrow">{item.category}</span>
        <h3><a href={item.url || listingPath(item.slug || "")}>{item.title}</a></h3>
        <p>{item.location}</p>
        <div className="price-row"><strong>{item.price > 0 ? item.priceLabel : "Valor a combinar"}</strong></div>
      </div>
    </article>
  );
}

function VideoListingCard({ item, priority = false }: { item: PortalListing; priority?: boolean }) {
  const duration = typeof item.attributes?.durationLabel === "string" ? item.attributes.durationLabel : "";
  return (
    <article className="video-ad-card">
      <a href={listingPath(item.slug || "")} aria-label={`Assistir ao vídeo anúncio de ${item.title}`}>
        <span className="video-ad-media">
          <OptimizedImage src={item.image} alt={`Vídeo anúncio — ${item.title}`} width="640" height="360" loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} />
          <span className="video-ad-badge">VÍDEO ANÚNCIO</span>
          <span className="video-ad-play" aria-hidden="true">▶</span>
          {duration ? <span className="video-ad-duration">{duration}</span> : null}
        </span>
        <span className="video-ad-copy">
          <small>ITATIAIA — ANUNCIOU, VENDEU</small>
          <h3>{item.title}</h3>
          <span className="video-ad-mobile-meta">{item.subcategory || item.category}</span>
          {item.description ? <p className="video-ad-mobile-description">{item.description}</p> : null}
          <strong>Ver vídeo <span aria-hidden="true">→</span></strong>
        </span>
      </a>
    </article>
  );
}

function seededOrder(items: PortalListing[], cycle: number) {
  return items.slice().sort((a, b) => {
    const hash = (value: string) => [...value].reduce((total, letter) => (total * 31 + letter.charCodeAt(0) + cycle * 97) % 2_147_483_647, 7);
    return hash(a.id) - hash(b.id);
  });
}

function RotatingRail({ title, items, favorites, toggleFavorite, href, badgeLabel, emptyMessage, priorityCount = 0, pageSize = RAIL_SIZE, videoMode = false, seed = 0 }: {
  title: string;
  items: PortalListing[];
  favorites: string[];
  toggleFavorite: (id: string) => void;
  href: string;
  badgeLabel?: string;
  emptyMessage?: string;
  priorityCount?: number;
  pageSize?: number;
  videoMode?: boolean;
  seed?: number;
}) {
  const canRotate = false;
  const visible = useMemo(() => {
    const promoted = seededOrder(items.filter((item) => item.featured || /featured|destaque/i.test(item.publicationType || "")), seed);
    const promotedIds = new Set(promoted.map((item) => item.id));
    const regular = seededOrder(items.filter((item) => !promotedIds.has(item.id)), seed + 17);
    return [...promoted, ...regular].slice(0, pageSize);
  }, [items, pageSize, seed]);

  return (
    <section className={`content-section rotating-rail ${videoMode ? "video-rail" : ""}`.trim()} id={videoMode ? "itatiaia-anunciou-vendeu" : undefined}>
      <div className={`section-heading ${videoMode ? "video-rail-heading" : ""}`.trim()}><h2>{title}</h2>{videoMode ? <span>Vídeos patrocinados</span> : <a href={href}>Ver todos ›</a>}</div>
      {visible.length ? (
        <div className={`rail-body ${canRotate ? "is-rotating" : "rail-body-static"}`}>
          <div className="listing-grid">
            {visible.map((item, index) => videoMode
              ? <VideoListingCard key={item.id} item={item} priority={index < priorityCount} />
              : <ListingCard key={item.id} item={item} favorite={favorites.includes(item.id)} toggleFavorite={toggleFavorite} badgeLabel={badgeLabel} priority={index < priorityCount} />)}
          </div>
        </div>
      ) : <p className="empty-rail">{emptyMessage || "Nenhum anúncio disponível nesta categoria."}</p>}
      {videoMode && visible.length ? <a className="video-rail-all" href={href}>Ver todos →</a> : null}
    </section>
  );
}

function MobileLatest({ items, canRequestMore, onNeedMore }: { items: PortalListing[]; canRequestMore: boolean; onNeedMore: () => void }) {
  const [visibleCount, setVisibleCount] = useState(MOBILE_INITIAL_SIZE);

  const visible = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  const loadMore = () => {
    if (canRequestMore) onNeedMore();
    setVisibleCount((current) => Math.min(current + MOBILE_MORE_SIZE, items.length));
  };

  return (
    <section className="mobile-home" aria-label="Anúncios mais recentes">
      <div className="mobile-home-heading"><div><span>Classificados Balcão</span><h1>Últimos anúncios</h1></div><a className="home-create-listing" href="/anunciar">＋ Criar anúncio</a></div>
      <div className="mobile-listings">
        {visible.map((item, index) => <a className="mobile-listing" href={item.url || listingPath(item.slug || "")} key={item.id}>
          <OptimizedImage src={item.image} fallbackSources={item.images} alt="" width="96" height="96" loading={index < 2 ? "eager" : "lazy"} decoding="async" fetchPriority={index === 0 ? "high" : "auto"} />
          <div><span>{item.category}</span><h2>{item.title}</h2><strong>{item.price > 0 ? item.priceLabel : "Valor a combinar"}</strong><small>{item.age}</small></div>
          <i aria-hidden="true">›</i>
        </a>)}
      </div>
      {visibleCount < items.length || canRequestMore ? <button className="mobile-more-results" type="button" onClick={loadMore}>Carregar mais</button> : null}
    </section>
  );
}

function DiscoverGrid() {
  const [pages, setPages] = useState<DiscoverPage[]>(defaultDiscoverPages);
  useEffect(() => {
    fetch("/api/settings").then((response) => response.json()).then((data) => {
      if (Array.isArray(data.discover_pages) && data.discover_pages.length) setPages(data.discover_pages);
    }).catch(() => undefined);
  }, []);
  return (
    <section className="discover">
      <div className="section-heading"><h2>Descubra</h2></div>
      <div className="discover-grid">{pages.filter((page) => page.active).slice(0, 10).map((page) => (
        <a href={`/descubra/${page.slug}`} key={page.id}>
          <OptimizedImage src={page.image} alt="" width="640" height="360" loading="lazy" decoding="async" />
          <strong>{page.title}</strong><span>{page.summary}</span>
        </a>
      ))}</div>
    </section>
  );
}

const popularSearches = ["Chevrolet Onix", "Apartamento para alugar", "iPhone", "Notebook", "Moto usada", "Casa com piscina", "Vagas de emprego", "Móveis", "Serviços", "Terrenos"];

export default function HomeClient({ seed = 0 }: { seed?: number }) {
  const { items, loading } = useImportedListings();
  const [favorites, setFavorites] = useState<string[]>([]);
  const catalog = useMemo(() => [
    ...itatiaiaVideoListings,
    ...items.filter((item, index, source) => !itatiaiaVideoListings.some((video) => video.id === item.id) && source.findIndex((candidate) => candidate.id === item.id) === index),
  ], [items]);
  const sorted = useMemo(() => catalog.slice().sort((a, b) => {
    const rank=(item:PortalListing)=>/super/i.test(item.publicationType||"")?4:item.featured?3:item.storeListing?1:2;
    const promoted=rank(b)-rank(a); if(promoted)return promoted;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    return bTime - aTime;
  }), [catalog]);


  const rails = useMemo(() => {
    const categoryOf = (item: PortalListing) => mapCategory(item.category);
    const classified = sorted.filter((item) => item.status !== "video-static");
    return {
      videos: sorted.filter((item) => item.status === "video-static" || (Boolean(item.videoUrl) && !item.id.startsWith("video-demo-"))),
      vehicles: classified.filter((item) => categoryOf(item) === "Veículos" && item.imported === true),
      properties: classified.filter((item) => categoryOf(item) === "Imóveis"),
      jobs: classified.filter((item) => categoryOf(item) === "Empregos"),
      business: classified.filter((item) => categoryOf(item) === "Comércio e Negócios"),
      technology: classified.filter((item) => categoryOf(item) === "Informática"),
      animals: classified.filter((item) => categoryOf(item) === "Animais"),
    };
  }, [sorted]);

  const toggleFavorite = (id: string) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const mobileListings = useMemo(() => catalog
    .filter((item) => item.status !== "video-static" && !item.videoUrl)
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "")), [catalog]);

  return (
    <main>
      <PortalHeader />
      <div className="mobile-home-banner"><BannerSlot placement="home_top" className="home-top-banner" priority /></div>
      <MobileLatest items={mobileListings} canRequestMore={false} onNeedMore={() => undefined} />
      <div className="page-shell desktop-home">
        {loading ? <p className="home-loading" role="status">Carregando anúncios…</p> : null}
        <RotatingRail title="Itatiaia - Anunciou, Vendeu" items={rails.videos} favorites={favorites} toggleFavorite={toggleFavorite} href="/anuncios?video=1" badgeLabel="Vídeo" emptyMessage="Nenhum anúncio em vídeo disponível no momento." priorityCount={1} pageSize={4} videoMode seed={seed + 1} />
        <BannerSlot placement="home_top" className="home-top-banner desktop-after-video-banner" />
        <RotatingRail title="Veículos" items={rails.vehicles} favorites={favorites} toggleFavorite={toggleFavorite} href="/categoria/veiculos" seed={seed + 11} />
        <DeferredSection><RotatingRail title="Imóveis" items={rails.properties} favorites={favorites} toggleFavorite={toggleFavorite} href="/categoria/imoveis" seed={seed + 23} /></DeferredSection>
        <DeferredSection minHeight={150}><BannerSlot placement="after_properties" /></DeferredSection>
        <DeferredSection><RotatingRail title="Empregos" items={rails.jobs} favorites={favorites} toggleFavorite={toggleFavorite} href="/categoria/empregos" seed={seed + 37} /></DeferredSection>
        <DeferredSection><RotatingRail title="Transferência de negócios, cotas e clubes" items={rails.business} favorites={favorites} toggleFavorite={toggleFavorite} href="/categoria/comercio-e-negocios" seed={seed + 41} /></DeferredSection>
        <DeferredSection minHeight={150}><BannerSlot placement="after_transfer" className="desktop-inline-banner" /></DeferredSection>
        <DeferredSection><RotatingRail title="Tecnologia" items={rails.technology} favorites={favorites} toggleFavorite={toggleFavorite} href="/categoria/informatica" seed={seed + 53} /></DeferredSection>
        <DeferredSection><RotatingRail title="Animais" items={rails.animals} favorites={favorites} toggleFavorite={toggleFavorite} href="/categoria/animais" seed={seed + 67} /></DeferredSection>
        <DeferredSection minHeight={380}><DiscoverGrid /></DeferredSection>
        <DeferredSection minHeight={140}><section className="popular-searches"><h2>Buscas mais populares</h2><div>{popularSearches.map((term) => <a key={term} href={`/anuncios?busca=${encodeURIComponent(term)}`}>{term}</a>)}</div></section></DeferredSection>
        <DeferredSection minHeight={420}><LatestNews /></DeferredSection>
        <DeferredSection minHeight={150}><BannerSlot placement="before_footer" /></DeferredSection>
      </div>
      <PortalFooter />
    </main>
  );
}
