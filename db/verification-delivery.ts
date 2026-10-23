import { readPortalSettings } from "./settings";
import { SITE_URL } from "../lib/site-url";
import { listingPath } from "../lib/listing-url";
import { sendWapiText } from "./wapi";

type RuntimeValues = Record<string, unknown>;

function requiredString(runtime: RuntimeValues, key: string) {
  const value = runtime[key];
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

const settingKeyMap = {
  RESEND_API_KEY: "resend_api_key",
  VERIFICATION_EMAIL_FROM: "verification_email_from",
  WAPI_TOKEN: "wapi_token",
  WAPI_INSTANCE_ID: "wapi_instance_id",
} as const;

async function getDeliveryConfig() {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as RuntimeValues;
  const settings = await readPortalSettings().catch(() => ({} as Record<string, unknown>));
  const pairs = Object.entries(settingKeyMap).map(([envKey, settingKey]) => {
    const environmentValue = requiredString(runtime, envKey);
    const storedValue = settings[settingKey];
    return [envKey, environmentValue || (typeof storedValue === "string" ? storedValue.trim() : "")] as const;
  });
  return Object.fromEntries(pairs) as Record<keyof typeof settingKeyMap, string>;
}

export async function getVerificationChannels() {
  const config = await getDeliveryConfig();
  const settings = await readPortalSettings().catch(() => ({} as Record<string, unknown>));
  const enabledValue = settings.registration_code_enabled;
  const enabled = enabledValue === true || enabledValue === "true" || enabledValue === 1 || enabledValue === "1";
  return {
    enabled,
    email: enabled && Boolean(config.RESEND_API_KEY && config.VERIFICATION_EMAIL_FROM),
    whatsapp: enabled && Boolean(config.WAPI_TOKEN && config.WAPI_INSTANCE_ID),
    config,
  };
}

async function sendEmail(input: { email: string; name: string; code: string; registrationId: string }, config: Awaited<ReturnType<typeof getDeliveryConfig>>) {
  const activationUrl = `${SITE_URL}/api/customer/register/activate?registrationId=${encodeURIComponent(input.registrationId)}&code=${encodeURIComponent(input.code)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.VERIFICATION_EMAIL_FROM,
      to: [input.email],
      subject: "Código de confirmação — Portal Balcão",
      html: `<div style="font-family:Poppins,Arial,sans-serif;color:#1b1d22;line-height:1.55;max-width:620px;margin:auto"><h2 style="color:#d71920">Ative sua conta no Jornal Balcão</h2><p>Olá, ${escapeHtml(input.name)}.</p><p>Use este código para concluir seu cadastro:</p><p style="font-size:30px;font-weight:800;letter-spacing:8px;color:#d71920">${input.code}</p><p><a href="${activationUrl}" style="display:inline-block;padding:12px 20px;background:#d71920;color:#fff;border-radius:7px;text-decoration:none;font-weight:700">Ativar minha conta</a></p><p>O código e o link são válidos por 10 minutos. Não compartilhe estas informações.</p></div>`,
      text: `Olá, ${input.name}. Seu código de confirmação do Jornal Balcão é ${input.code}. Ative sua conta em: ${activationUrl}. O link é válido por 10 minutos.`,
    }),
  });
  if (!response.ok) throw new Error(`EMAIL_DELIVERY_FAILED:${response.status}`);
}

async function sendWhatsApp(input: { whatsapp: string; code: string }, config: Awaited<ReturnType<typeof getDeliveryConfig>>) {
  await sendWapiText({
    token: config.WAPI_TOKEN,
    instanceId: config.WAPI_INSTANCE_ID,
    whatsapp: input.whatsapp,
    message: `Seja bem-vindo ao Jornal Balcão. Seu cadastro foi realizado. Segue abaixo o seu código para ativação do seu cadastro.\n\nCódigo: ${input.code}`,
  });
}

export async function sendVerificationCode(input: {
  email: string;
  name: string;
  whatsapp: string;
  code: string;
  registrationId: string;
}) {
  const channels = await getVerificationChannels();
  const deliveries: Array<{ channel: "email" | "whatsapp"; promise: Promise<void> }> = [];
  if (channels.email) deliveries.push({ channel: "email", promise: sendEmail(input, channels.config) });
  if (channels.whatsapp) deliveries.push({ channel: "whatsapp", promise: sendWhatsApp(input, channels.config) });
  if (!deliveries.length) return [];
  const results = await Promise.allSettled(deliveries.map((delivery) => delivery.promise));
  return deliveries.flatMap((delivery, index) => results[index].status === "fulfilled" ? [delivery.channel] : []);
}

export async function sendListingCopy(input: {
  email: string; name: string; listingId: string; listingSlug: string; title: string; category: string; priceLabel: string; address: string; statusLabel: string;
}) {
  const config = await getDeliveryConfig();
  if (!config.RESEND_API_KEY || !config.VERIFICATION_EMAIL_FROM) throw new Error("LISTING_EMAIL_NOT_CONFIGURED");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.VERIFICATION_EMAIL_FROM, to: [input.email], subject: "Seu anúncio foi criado com sucesso — Jornal Balcão",
      html: `<div style="font-family:Poppins,Arial,sans-serif;color:#1b1d22;line-height:1.6"><h2 style="color:#d71920">Seu anúncio foi criado com sucesso!</h2><p>Olá, ${escapeHtml(input.name)}.</p><p>Recebemos o seu anúncio no Jornal Balcão. Confira abaixo os dados cadastrados:</p><table style="border-collapse:collapse;width:100%;max-width:620px"><tr><td style="padding:8px;border:1px solid #ddd"><strong>Código</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.listingId)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Título</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.title)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Categoria</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.category)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Valor</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.priceLabel)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Endereço</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.address)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Status</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.statusLabel)}</td></tr></table><p><a href="${SITE_URL}${listingPath(input.listingSlug)}" style="display:inline-block;margin-top:18px;padding:12px 20px;background:#d71920;color:#fff;border-radius:7px;text-decoration:none;font-weight:700">Ver meu anúncio</a></p></div>`,
      text: `Olá, ${input.name}. Seu anúncio foi criado com sucesso no Jornal Balcão. Título: ${input.title}. Código: ${input.listingId}. Categoria: ${input.category}. Valor: ${input.priceLabel}. Endereço: ${input.address}. Status: ${input.statusLabel}. Acesse: ${SITE_URL}${listingPath(input.listingSlug)}`,
    }),
  });
  if (!response.ok) throw new Error(`LISTING_EMAIL_FAILED:${response.status}`);
}

export async function sendWelcomeAccountEmail(input: { email: string; name: string }) {
  const config = await getDeliveryConfig();
  if (!config.RESEND_API_KEY || !config.VERIFICATION_EMAIL_FROM) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.VERIFICATION_EMAIL_FROM, to: [input.email], subject: "Bem-vindo ao Portal Balcão",
      html: `<div style="font-family:Poppins,Arial,sans-serif;color:#1b1d22;line-height:1.6;max-width:620px;margin:auto"><h2 style="color:#d71920">Bem-vindo ao Jornal Balcão!</h2><p>Olá, ${escapeHtml(input.name)}.</p><p>Sua conta foi ativada e seu acesso já está pronto. Agora você pode publicar, acompanhar e editar seus anúncios em um só lugar.</p><p><a href="${SITE_URL}/entrar" style="display:inline-block;padding:12px 20px;background:#d71920;color:#fff;border-radius:7px;text-decoration:none;font-weight:700">Entrar na minha conta</a></p><p style="color:#69717b;font-size:13px">Se você não realizou este cadastro, desconsidere esta mensagem.</p></div>`,
      text: `Bem-vindo ao Jornal Balcão, ${input.name}! Sua conta foi ativada e seu acesso está pronto. Entre em: ${SITE_URL}/entrar`,
    }),
  });
  return response.ok;
}

export async function sendCommercialWelcomeEmail(input: { email: string; name: string; temporaryPassword: string }) {
  const config = await getDeliveryConfig();
  if (!config.RESEND_API_KEY || !config.VERIFICATION_EMAIL_FROM) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.VERIFICATION_EMAIL_FROM, to: [input.email], subject: "Seu acesso ao Portal Balcão",
      html: `<div style="font-family:Inter,Arial,sans-serif;color:#1b1d22;line-height:1.6;max-width:620px;margin:auto"><h2 style="color:#d71920">Seu cadastro foi concluído</h2><p>Olá, ${escapeHtml(input.name)}.</p><p>A equipe comercial criou sua conta no Jornal Balcão.</p><p><strong>E-mail:</strong> ${escapeHtml(input.email)}<br><strong>Senha temporária:</strong> ${escapeHtml(input.temporaryPassword)}</p><p><a href="${SITE_URL}/entrar" style="display:inline-block;padding:12px 20px;background:#d71920;color:#fff;border-radius:7px;text-decoration:none;font-weight:700">Acessar minha conta</a></p><p style="color:#69717b;font-size:13px">Altere seus dados de acesso após entrar na conta e não compartilhe sua senha.</p></div>`,
      text: `Olá, ${input.name}. Sua conta no Jornal Balcão foi criada. E-mail: ${input.email}. Senha temporária: ${input.temporaryPassword}. Acesse: ${SITE_URL}/entrar`,
    }),
  });
  return response.ok;
}

export async function sendVisitorWelcomeEmail(input: { email: string; name: string; unsubscribeToken: string }) {
  const config = await getDeliveryConfig();
  if (!config.RESEND_API_KEY || !config.VERIFICATION_EMAIL_FROM) return false;
  const unsubscribeUrl = `${SITE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.VERIFICATION_EMAIL_FROM,
      to: [input.email],
      subject: "Seja bem-vindo ao Jornal Balcão",
      html: `<div style="font-family:Poppins,Arial,sans-serif;color:#1b1d22;line-height:1.65;max-width:640px;margin:auto"><h1 style="color:#d71920">Seja bem-vindo ao Jornal Balcão, ${escapeHtml(input.name)}!</h1><p>Seu cadastro foi concluído com sucesso.</p><p>No Jornal Balcão você encontra anúncios, oportunidades, notícias e publicidade legal em um só lugar. Acompanhe as novidades e encontre o que procura de forma rápida.</p><p><a href="${SITE_URL}/anuncios" style="display:inline-block;padding:13px 22px;background:#d71920;color:#fff;border-radius:7px;text-decoration:none;font-weight:700">Ver anúncios</a></p><p style="margin-top:28px;color:#707781;font-size:12px">Não deseja mais receber estas mensagens? <a href="${unsubscribeUrl}">Cancelar inscrição</a>.</p></div>`,
      text: `Seja bem-vindo ao Jornal Balcão, ${input.name}! Seu cadastro foi concluído com sucesso. Encontre anúncios, oportunidades, notícias e publicidade legal em ${SITE_URL}. Cancelar inscrição: ${unsubscribeUrl}`,
    }),
  });
  return response.ok;
}

export async function sendListingProposal(input: {
  email: string;
  advertiserName: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  message: string;
}) {
  const config = await getDeliveryConfig();
  if (!config.RESEND_API_KEY || !config.VERIFICATION_EMAIL_FROM) throw new Error("PROPOSAL_EMAIL_NOT_CONFIGURED");
  const listingUrl = `${SITE_URL}${listingPath(input.listingSlug)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.VERIFICATION_EMAIL_FROM,
      to: [input.email],
      reply_to: input.senderEmail,
      subject: `Nova proposta — ${input.listingTitle}`,
      html: `<div style="font-family:Poppins,Arial,sans-serif;color:#1b1d22;line-height:1.6"><h2>Você recebeu uma nova proposta</h2><p>Olá, ${escapeHtml(input.advertiserName || "anunciante")}.</p><p><strong>${escapeHtml(input.senderName)}</strong> enviou uma proposta pelo Portal Balcão para o anúncio <a href="${listingUrl}">${escapeHtml(input.listingTitle)}</a>.</p><table style="border-collapse:collapse;width:100%;max-width:620px"><tr><td style="padding:8px;border:1px solid #ddd"><strong>E-mail</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.senderEmail)}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Telefone</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(input.senderPhone || "Não informado")}</td></tr></table><div style="margin-top:16px;padding:16px;background:#f5f6f7;border-radius:8px;white-space:pre-wrap">${escapeHtml(input.message)}</div></div>`,
      text: `Nova proposta para ${input.listingTitle}. De: ${input.senderName} (${input.senderEmail}${input.senderPhone ? `, ${input.senderPhone}` : ""}). Mensagem: ${input.message}. Anúncio: ${listingUrl}`,
    }),
  });
  if (!response.ok) throw new Error(`PROPOSAL_EMAIL_FAILED:${response.status}`);
}

export async function sendPasswordResetEmail(input: { email: string; name: string; token: string }) {
  const config = await getDeliveryConfig();
  if (!config.RESEND_API_KEY || !config.VERIFICATION_EMAIL_FROM) throw new Error("PASSWORD_EMAIL_NOT_CONFIGURED");
  const url = `${SITE_URL}/recuperar-senha?token=${encodeURIComponent(input.token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.VERIFICATION_EMAIL_FROM, to: [input.email], subject: "Recuperação de senha — Portal Balcão",
      html: `<div style="font-family:Poppins,Arial,sans-serif;color:#1b1d22;line-height:1.6"><h2>Recupere sua senha</h2><p>Olá, ${escapeHtml(input.name)}.</p><p>Recebemos uma solicitação de recuperação. O link abaixo é válido por 30 minutos.</p><p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#d71920;color:#fff;border-radius:7px;text-decoration:none;font-weight:700">Criar nova senha</a></p><p>Se você não solicitou, ignore esta mensagem.</p></div>`,
      text: `Olá, ${input.name}. Crie uma nova senha pelo link válido por 30 minutos: ${url}` }),
  });
  if (!response.ok) throw new Error(`PASSWORD_EMAIL_FAILED:${response.status}`);
}
