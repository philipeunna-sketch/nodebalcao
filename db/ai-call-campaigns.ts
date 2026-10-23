export type AiCallCampaign = {
  id: string;
  userId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  offerType: string;
  prompt: string;
  script: string;
  audioMimeType: string;
  createdAt: string;
};

export async function findCallCustomer(userId: number) {
  const { env } = await import("cloudflare:workers");
  return env.DB.prepare(`SELECT id, name, email, whatsapp FROM portal_users WHERE id = ? AND status = 'active' LIMIT 1`)
    .bind(userId).first<{ id: number; name: string; email: string; whatsapp: string }>();
}

export async function listAiCallCampaigns(limit = 50) {
  const { env } = await import("cloudflare:workers");
  const result = await env.DB.prepare(`SELECT id, user_id AS userId, customer_name AS customerName,
    customer_email AS customerEmail, customer_phone AS customerPhone, offer_type AS offerType,
    prompt, script, audio_mime_type AS audioMimeType, created_at AS createdAt
    FROM portal_ai_call_campaigns ORDER BY created_at DESC LIMIT ?`).bind(Math.min(Math.max(limit, 1), 100)).all<AiCallCampaign>();
  return result.results;
}

export async function saveAiCallCampaign(input: Omit<AiCallCampaign, "createdAt"> & { audioKey: string }) {
  const { env } = await import("cloudflare:workers");
  const createdAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO portal_ai_call_campaigns
    (id,user_id,customer_name,customer_email,customer_phone,offer_type,prompt,script,audio_key,audio_mime_type,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(input.id, input.userId, input.customerName, input.customerEmail, input.customerPhone,
      input.offerType, input.prompt, input.script, input.audioKey, input.audioMimeType, createdAt).run();
  return { ...input, createdAt };
}

export async function getAiCallAudio(id: string) {
  const { env } = await import("cloudflare:workers");
  const row = await env.DB.prepare("SELECT audio_key AS audioKey, audio_mime_type AS audioMimeType, customer_name AS customerName FROM portal_ai_call_campaigns WHERE id = ? LIMIT 1")
    .bind(id).first<{ audioKey: string; audioMimeType: string; customerName: string }>();
  if (!row) return null;
  const object = await env.BUCKET.get(row.audioKey);
  return object ? { ...row, object } : null;
}
