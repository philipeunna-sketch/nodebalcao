import { readPortalSettings, writePortalSettings } from "./settings";

export type SitePage = { id: string; title: string; slug: string; content: string; active: boolean; contact?: boolean };
export const defaultSitePages: SitePage[] = [
  { id: "about", title: "Quem Somos", slug: "quem-somos", active: true, content: "<h2>Jornal Balcão</h2><p>O Jornal Balcão conecta pessoas, empresas e oportunidades por meio de classificados, notícias e serviços digitais.</p><h3>Nossa missão</h3><p>Facilitar negócios com informação clara, acesso simples e atendimento próximo.</p>" },
  { id: "contact", title: "Fale Conosco", slug: "fale-conosco", active: true, contact: true, content: "<h2>Entre em contato</h2><p>Envie sua dúvida, sugestão ou solicitação. Nossa equipe responderá pelos dados informados no formulário.</p>" },
  { id: "terms", title: "Termos de Uso", slug: "termos-de-uso", active: true, content: "<h2>Termos de Uso</h2><p>Ao utilizar o portal, o usuário concorda em fornecer informações verdadeiras, respeitar a legislação aplicável e não publicar conteúdo ilícito ou enganoso.</p><h3>Responsabilidade</h3><p>Os anunciantes são responsáveis pelo conteúdo, condições e veracidade de seus anúncios.</p>" },
  { id: "privacy", title: "Política de Privacidade", slug: "politica-de-privacidade", active: true, content: "<h2>Política de Privacidade</h2><p>Tratamos dados pessoais somente para prestar os serviços do portal, proteger contas, responder contatos e cumprir obrigações legais.</p><h3>Seus direitos</h3><p>O titular pode solicitar informações, correção ou exclusão de dados, observados os prazos legais de conservação.</p>" },
];
export async function getSitePages(){const settings=await readPortalSettings();return Array.isArray(settings.site_pages)?settings.site_pages as SitePage[]:defaultSitePages;}
export async function saveSitePages(pages:SitePage[]){await writePortalSettings({site_pages:pages});}
