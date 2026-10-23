import type { Metadata } from "next";
import { SITE_URL } from "../../lib/site-url";
import { PortalFooter, PortalHeader } from "../shared";
import ListingAssistantClient from "./assistant-client";

export const metadata: Metadata = {
  title: "Criar anúncio com IA | Jornal Balcão",
  description: "Descreva o produto ou serviço, adicione as fotos e use a inteligência artificial para preparar e publicar seu anúncio no Jornal Balcão.",
  alternates: { canonical: `${SITE_URL}/criar-anuncio-ia` },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Jornal Balcão",
    url: `${SITE_URL}/criar-anuncio-ia`,
    title: "Criar anúncio com IA | Jornal Balcão",
    description: "Crie um anúncio a partir da descrição e das fotos do produto ou serviço.",
  },
};

export default function CreateListingWithAiPage() {
  return (
    <main>
      <PortalHeader />
      <ListingAssistantClient />
      <PortalFooter />
    </main>
  );
}
