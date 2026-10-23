/* eslint-disable @next/next/no-img-element */
import type { StoreListingRecord, VirtualStoreRecord } from "../../../../../db/stores";
import { OptimizedImage, PortalFooter, PortalHeader } from "../../../../shared";
import { StoreLogo } from "../../../../storefront";
import { LISTING_IMAGE_PLACEHOLDER, listingCoverImage, normalizeListingImages } from "../../../../../lib/listing-images";
import { SITE_URL } from "../../../../../lib/site-url";
import { listingPath } from "../../../../../lib/listing-url";
import { plainListingDescription } from "../../../../../lib/listing-description";
import { ListingDescription } from "../../../../listing-description";

function whatsappNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits : "";
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) return local.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (local.length === 10) return local.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value || "Não informado";
}

function safePurchaseUrl(value: string | null) {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

export default function StoreListingView({ store, listing }: { store: VirtualStoreRecord; listing: StoreListingRecord }) {
  if (!listing.slug) throw new Error("STORE_LISTING_SLUG_MISSING");
  const images = normalizeListingImages(JSON.parse(listing.imagesJson || "[]") as unknown[]);
  const coverImage = listingCoverImage(listing.coverImage, images) || LISTING_IMAGE_PLACEHOLDER;
  const attributes = JSON.parse(listing.attributesJson || "{}") as Record<string, string | number | boolean>;
  const price = listing.priceCents == null ? "Valor a combinar" : (listing.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const phone = whatsappNumber(store.whatsapp);
  const plainDescription = plainListingDescription(listing.description);
  const descriptionForMessage = plainDescription.length > 800 ? `${plainDescription.slice(0, 800)}…` : plainDescription;
  const canonical = `${SITE_URL}${listingPath(listing.slug)}`;
  const whatsappMessage = `Olá, vi seu produto publicado no site do Jornal Balcão. Gostaria de realizar a compra.\n\nTítulo: ${listing.title}\nPreço: ${price}\nDescrição: ${descriptionForMessage}\n${canonical}\n\nÉ possível realizar a compra? Podemos conversar melhor?`;
  const whatsappUrl = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(whatsappMessage)}` : null;
  const purchaseUrl = safePurchaseUrl(listing.externalUrl) || safePurchaseUrl(store.websiteUrl);
  const location = [store.address, store.city, store.state].filter(Boolean).join(" · ");
  const structuredData = {
    "@context": "https://schema.org", "@type": "Product", name: listing.title, description: plainDescription,
    image: images.map((image) => new URL(image, SITE_URL).toString()), url: canonical, category: listing.category,
    offers: { "@type": "Offer", priceCurrency: "BRL", ...(listing.priceCents != null ? { price: listing.priceCents / 100 } : {}),
      url: canonical, availability: "https://schema.org/InStock", seller: { "@type": "Organization", name: store.name } },
  };
  return <main><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><PortalHeader /><section className="store-ad-shell"><nav><a href={`/loja/${store.slug}`}>{store.name}</a><span>›</span><span>{listing.subcategory}</span></nav><div className="store-ad-layout"><div><section className="store-ad-gallery"><OptimizedImage src={coverImage} fallbackSources={images} alt={listing.title} width="900" height="680" /><div>{images.filter((image) => image !== coverImage).slice(0, 4).map((image) => <OptimizedImage key={image} src={image} alt="" width="360" height="270" loading="lazy" />)}</div></section><article className="store-ad-copy"><span>{listing.category} · {listing.subcategory}</span><h1>{listing.title}</h1><ListingDescription value={listing.description} /><h2>Detalhes</h2><dl>{Object.entries(attributes).filter(([, item]) => item !== true).map(([key, item]) => <div key={key}><dt>{key.replace(/_/g, " ")}</dt><dd>{String(item)}</dd></div>)}</dl></article></div><aside className="store-ad-sidebar"><div className="store-ad-price"><span>Preço</span><strong>{price}</strong><small>{listing.address}</small></div><div className="store-ad-seller"><StoreLogo store={store} /><div><span>Vendido por</span><a href={`/loja/${store.slug}`}>{store.name}</a><small>Loja verificada no Balcão</small></div></div><section className="store-contact-data" aria-label="Informações da loja"><h2>Informações da loja</h2><dl><div><dt>Localização</dt><dd>{location || "Não informada"}</dd></div><div><dt>Telefone e WhatsApp</dt><dd>{formatPhone(store.whatsapp)}</dd></div><div><dt>E-mail</dt><dd>{store.email || "Não informado"}</dd></div></dl></section><div className="store-purchase-actions">{purchaseUrl ? <a className="store-buy-button external" href={purchaseUrl} target="_blank" rel="noopener noreferrer sponsored">Comprar no site</a> : <span className="store-buy-button disabled" aria-disabled="true">Link de compra não configurado</span>}{whatsappUrl ? <a className="store-buy-button whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Comprar pelo WhatsApp</a> : <span className="store-buy-button disabled" aria-disabled="true">WhatsApp não configurado</span>}<a className="store-view-all" href={`/loja/${store.slug}`}>Ver todos os anúncios da loja</a></div>{store.isDemo ? <p>Este é um anúncio demonstrativo do recurso de lojas virtuais.</p> : null}</aside></div></section><PortalFooter /></main>;
}
