import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { readPortalSettings } from "../../../db/settings";
import { SITE_URL } from "../../../lib/site-url";
import { PortalFooter } from "../../shared";
import CampaignTracking, { CampaignCta } from "../campaign-tracking";
import { mergeCampaignLanding } from "../landing-data";

type PageProps = { params: Promise<{ slug: string }> };

const readLanding = cache(async (slug: string) => {
  const settings = await readPortalSettings().catch(() => ({} as Record<string, unknown>));
  const stored = settings.campaign_landings && typeof settings.campaign_landings === "object"
    ? (settings.campaign_landings as Record<string, unknown>)[slug]
    : undefined;
  return { landing: mergeCampaignLanding(slug, stored), settings };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { landing } = await readLanding(slug);
  if (!landing) return {};
  const url = `${SITE_URL}/campanha/${slug}`;
  return {
    title: `${landing.title} | Jornal Balcão`,
    description: landing.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { type: "website", locale: "pt_BR", siteName: "Jornal Balcão", url, title: landing.title, description: landing.description, images: [{ url: "/banner-home-classificados.webp", width: 1200, height: 630, alt: landing.title }] },
    twitter: { card: "summary_large_image", title: landing.title, description: landing.description, images: ["/banner-home-classificados.webp"] },
  };
}

export default async function CampaignLandingPage({ params }: PageProps) {
  const { slug } = await params;
  const { landing, settings } = await readLanding(slug);
  if (!landing) notFound();
  const pixelId = typeof settings.facebook_pixel_id === "string" ? settings.facebook_pixel_id.trim() : "";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: landing.title,
    description: landing.description,
    provider: { "@type": "Organization", name: "Jornal Balcão", url: SITE_URL },
    areaServed: "Belo Horizonte e região",
    url: `${SITE_URL}/campanha/${landing.slug}`,
  };
  return <main className={`campaign-page campaign-${landing.theme}`}>
    <CampaignTracking pixelId={pixelId} campaign={landing.slug} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <header className="campaign-header"><Link href="/" aria-label="Ir para o Jornal Balcão"><Image src="/logo-balcao.webp" alt="Jornal Balcão" width={340} height={100} priority /></Link><a href="tel:+553133309600">Para anunciar, ligue <strong>(31) 3330-9600</strong></a></header>
    <section className="campaign-hero">
      <div className="campaign-hero-copy"><span>{landing.eyebrow}</span><h1>{landing.title}</h1><p>{landing.description}</p><CampaignCta href={landing.ctaHref} label={landing.ctaLabel} campaign={landing.slug} /><small>Você escolhe entre anúncio grátis e anúncio destacado durante o cadastro.</small></div>
      <div className="campaign-hero-visual" aria-label="Vantagens da publicação">
        <div className="campaign-score"><b>Jornal Balcão</b><span>Anunciou. Vendeu!</span></div>
        <ul>{landing.benefits.map((benefit) => <li key={benefit}><i aria-hidden="true">✓</i>{benefit}</li>)}</ul>
      </div>
    </section>
    <section className="campaign-benefits"><header><span>Simples do começo ao fim</span><h2>Seu anúncio publicado em três passos</h2></header><div>{landing.steps.map((step, index) => <article key={step.title}><b>0{index + 1}</b><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
    <section className="campaign-confidence"><div><span>Visibilidade local</span><h2>Quem procura encontra. Quem anuncia negocia.</h2><p>Uma página preparada para celular e computador, com seus contatos e informações organizadas para facilitar a decisão do comprador.</p></div><ul>{landing.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul></section>
    <section className="campaign-final"><span>Comece agora</span><h2>Leve sua oferta para o Jornal Balcão</h2><p>Cadastre os dados, publique e acompanhe tudo pela sua conta.</p><CampaignCta href={landing.ctaHref} label={landing.ctaLabel} campaign={landing.slug} className="campaign-cta-light" /></section>
    <PortalFooter />
  </main>;
}

export const dynamic = "force-dynamic";
