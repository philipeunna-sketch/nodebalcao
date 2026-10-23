export type CampaignLanding = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  theme: "property" | "vehicle" | "featured";
  benefits: string[];
  steps: Array<{ title: string; text: string }>;
};

export const campaignLandings: Record<string, CampaignLanding> = {
  "anuncie-seu-imovel": {
    slug: "anuncie-seu-imovel",
    eyebrow: "Imóveis no Jornal Balcão",
    title: "Seu imóvel diante de quem está pronto para negociar",
    description: "Crie seu anúncio de imóvel com fotos, localização e informações completas. Publique com rapidez e receba contatos de interessados em Belo Horizonte e região.",
    ctaLabel: "Anunciar meu imóvel",
    ctaHref: "/anunciar?categoria=Im%C3%B3veis&utm_source=facebook&utm_medium=paid_social&utm_campaign=imoveis",
    theme: "property",
    benefits: ["Cadastro simples e orientado", "Fotos e detalhes do imóvel", "Contato direto com interessados"],
    steps: [
      { title: "Cadastre", text: "Informe os dados do imóvel e adicione as melhores fotos." },
      { title: "Publique", text: "Escolha anúncio grátis ou destaque para ganhar prioridade." },
      { title: "Negocie", text: "Receba contatos e converse diretamente com os interessados." },
    ],
  },
  "anuncie-seu-veiculo": {
    slug: "anuncie-seu-veiculo",
    eyebrow: "Veículos no Jornal Balcão",
    title: "Transforme seu veículo anunciado em uma nova oportunidade",
    description: "Apresente carro, moto ou utilitário com fotos, preço e ficha completa. Alcance compradores locais e conduza a negociação pelo seu canal preferido.",
    ctaLabel: "Anunciar meu veículo",
    ctaHref: "/anunciar?categoria=Ve%C3%ADculos&utm_source=facebook&utm_medium=paid_social&utm_campaign=veiculos",
    theme: "vehicle",
    benefits: ["Ficha completa do veículo", "Anúncio otimizado para celular", "WhatsApp direto com o anunciante"],
    steps: [
      { title: "Apresente", text: "Adicione fotos, marca, modelo, ano, preço e características." },
      { title: "Destaque", text: "Ganhe mais visibilidade com a opção de anúncio destacado." },
      { title: "Venda", text: "Receba contatos de compradores e avance na negociação." },
    ],
  },
  "anuncio-destacado": {
    slug: "anuncio-destacado",
    eyebrow: "Mais visibilidade para seu anúncio",
    title: "Apareça primeiro para quem já está procurando",
    description: "Dê prioridade ao seu anúncio nas listas e categorias do Jornal Balcão. A identificação de destaque ajuda sua oferta a chamar atenção no momento da decisão.",
    ctaLabel: "Criar anúncio destacado",
    ctaHref: "/anunciar?plano=featured&utm_source=facebook&utm_medium=paid_social&utm_campaign=destaque",
    theme: "featured",
    benefits: ["Prioridade nas listagens", "Selo visual de destaque", "Mais exposição para sua oferta"],
    steps: [
      { title: "Crie", text: "Cadastre seu anúncio com as informações que geram confiança." },
      { title: "Destaque", text: "Escolha o plano destacado no fim do cadastro." },
      { title: "Acompanhe", text: "Consulte seu anúncio e os dados da sua conta." },
    ],
  },
};

export function mergeCampaignLanding(slug: string, stored: unknown) {
  const fallback = campaignLandings[slug];
  if (!fallback) return null;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return fallback;
  const value = stored as Record<string, unknown>;
  return {
    ...fallback,
    eyebrow: typeof value.eyebrow === "string" && value.eyebrow.trim() ? value.eyebrow.trim().slice(0, 100) : fallback.eyebrow,
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 180) : fallback.title,
    description: typeof value.description === "string" && value.description.trim() ? value.description.trim().slice(0, 520) : fallback.description,
    ctaLabel: typeof value.ctaLabel === "string" && value.ctaLabel.trim() ? value.ctaLabel.trim().slice(0, 80) : fallback.ctaLabel,
  } satisfies CampaignLanding;
}
