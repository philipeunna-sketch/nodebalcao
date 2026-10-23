import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { findCallCustomer, listAiCallCampaigns, saveAiCallCampaign } from "../../../../db/ai-call-campaigns";
import { readPrivateSetting, writePortalSettings } from "../../../../db/settings";

const TEXT_MODEL = "gemini-3.5-flash";
const TTS_MODEL = "gemini-3.1-flash-tts-preview";

function decodeBase64(value: string) {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

function pcmToWav(pcm: Uint8Array, sampleRate = 24_000) {
  const output = new Uint8Array(44 + pcm.length);
  const view = new DataView(output.buffer);
  const write = (offset: number, value: string) => [...value].forEach((letter, index) => output[offset + index] = letter.charCodeAt(0));
  write(0, "RIFF"); view.setUint32(4, 36 + pcm.length, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcm.length, true);
  output.set(pcm, 44); return output;
}

async function geminiRequest(apiKey: string, model: string, body: Record<string, unknown>) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof (data.error as { message?: unknown } | undefined)?.message === "string" ? (data.error as { message: string }).message : `Gemini respondeu com status ${response.status}.`);
  return data;
}

function responsePart(data: Record<string, unknown>) {
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const content = candidates[0] && typeof candidates[0] === "object" ? (candidates[0] as { content?: { parts?: unknown[] } }).content : undefined;
  return Array.isArray(content?.parts) && content.parts[0] && typeof content.parts[0] === "object" ? content.parts[0] as Record<string, unknown> : {};
}

function offerLabel(value: string) { return value === "featured" ? "um plano de anúncio destacado" : "a publicação de um novo anúncio no Jornal Balcão"; }

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const apiKey = await readPrivateSetting("gemini_api_key");
  return NextResponse.json({ configured: Boolean(apiKey), keyHint: apiKey ? `••••${apiKey.slice(-4)}` : "", history: await listAiCallCampaigns() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "generate");
  if (action === "settings") {
    const apiKey = String(body.apiKey || "").trim();
    if (apiKey && apiKey.length < 20) return NextResponse.json({ error: "A chave informada parece incompleta." }, { status: 400 });
    if (apiKey) await writePortalSettings({ gemini_api_key: apiKey });
    return NextResponse.json({ ok: true, configured: Boolean(apiKey || await readPrivateSetting("gemini_api_key")) });
  }
  const apiKey = await readPrivateSetting("gemini_api_key");
  if (!apiKey) return NextResponse.json({ error: "Cadastre a chave da API do Gemini antes de gerar o áudio." }, { status: 400 });
  const userId = Number(String(body.userId || "").replace(/^customer-/, ""));
  const customer = Number.isInteger(userId) && userId > 0 ? await findCallCustomer(userId) : null;
  if (!customer) return NextResponse.json({ error: "Escolha um cliente ativo." }, { status: 400 });
  const offerType = body.offerType === "featured" ? "featured" : "new_listing";
  const customNotes = String(body.notes || "").trim().slice(0, 800);
  const prompt = `Crie um roteiro de ligação comercial curto, respeitoso e persuasivo em português do Brasil para ${customer.name}. Objetivo: oferecer ${offerLabel(offerType)}. Identifique-se como atendimento do Jornal Balcão. Não invente descontos, prazos, audiência, garantias ou dados do cliente. Faça uma abertura cordial, explique o benefício, inclua uma pergunta de interesse e finalize sem pressão. Duração máxima aproximada: 45 segundos.${customNotes ? ` Observações do administrador: ${customNotes}` : ""}`;
  try {
    const textData = await geminiRequest(apiKey, TEXT_MODEL, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.65, maxOutputTokens: 500 } });
    const script = String(responsePart(textData).text || "").trim();
    if (!script) throw new Error("O Gemini não retornou o roteiro.");
    const audioData = await geminiRequest(apiKey, TTS_MODEL, {
      contents: [{ parts: [{ text: `Fale em português do Brasil, com voz comercial natural, cordial e confiante. Leia exatamente este roteiro:\n\n${script}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { languageCode: "pt-BR", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
    });
    const inline = responsePart(audioData).inlineData as { data?: unknown; mimeType?: unknown } | undefined;
    if (!inline || typeof inline.data !== "string") throw new Error("O Gemini não retornou o arquivo de áudio.");
    const originalMime = typeof inline.mimeType === "string" ? inline.mimeType : "audio/L16;codec=pcm;rate=24000";
    const decoded = decodeBase64(inline.data);
    const bytes = /pcm|l16/i.test(originalMime) ? pcmToWav(decoded) : decoded;
    const mimeType = /pcm|l16/i.test(originalMime) ? "audio/wav" : originalMime.split(";")[0];
    const extension = mimeType.includes("mpeg") ? "mp3" : mimeType.includes("ogg") ? "ogg" : "wav";
    const id = crypto.randomUUID();
    const audioKey = `ai-call-campaigns/${id}.${extension}`;
    const { env } = await import("cloudflare:workers");
    await env.BUCKET.put(audioKey, bytes, { httpMetadata: { contentType: mimeType, cacheControl: "private, max-age=0" }, customMetadata: { customerId: String(customer.id), source: "gemini-tts" } });
    const saved = await saveAiCallCampaign({ id, userId: customer.id, customerName: customer.name, customerEmail: customer.email, customerPhone: customer.whatsapp, offerType, prompt, script, audioKey, audioMimeType: mimeType });
    return NextResponse.json({ ok: true, item: saved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível gerar o roteiro e o áudio." }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
