import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { createAdminVideo, listAdminVideos, updateAdminVideo } from "../../../../db/admin-videos";
import { invalidatePublicListingsCache } from "../../../../db/public-listings";
import { readPrivateSetting, writePortalSettings } from "../../../../db/settings";

type VimeoPicture = { width?: number; link?: string };
type VimeoVideo = {
  uri?: string;
  name?: string;
  description?: string;
  link?: string;
  duration?: number;
  status?: string;
  pictures?: { sizes?: VimeoPicture[] };
};

const VIMEO_API = "https://api.vimeo.com";

function tokenHint(value: string) {
  return value ? `${value.slice(0, 5)}••••${value.slice(-4)}` : "";
}

function enabled(value: unknown) {
  return value === true || String(value) === "true";
}

function durationLabel(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function thumbnail(video: VimeoVideo) {
  return (video.pictures?.sizes || [])
    .filter((picture) => Boolean(picture.link))
    .sort((a, b) => Number(b.width || 0) - Number(a.width || 0))[0]?.link || "";
}

async function configuration() {
  const [accessToken, active, lastSyncAt, lastImportResult] = await Promise.all([
    readPrivateSetting("vimeo_access_token"),
    readPrivateSetting("vimeo_enabled"),
    readPrivateSetting("vimeo_last_synced_at"),
    readPrivateSetting("vimeo_last_import_result"),
  ]);
  return {
    accessToken: String(accessToken || "").trim(),
    enabled: enabled(active),
    lastSyncAt: String(lastSyncAt || ""),
    lastImportResult: lastImportResult && typeof lastImportResult === "object" ? lastImportResult : null,
  };
}

async function vimeoFetch<T>(path: string, accessToken: string) {
  if (!accessToken) throw new Error("VIMEO_NOT_CONFIGURED");
  const response = await fetch(`${VIMEO_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.vimeo.*+json;version=3.4",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`VIMEO_${response.status}`);
  return response.json() as Promise<T>;
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const message = code === "VIMEO_NOT_CONFIGURED"
    ? "Informe o token de acesso da API do Vimeo."
    : /VIMEO_(401|403)/.test(code)
      ? "O Vimeo recusou o token informado. Verifique as permissões da aplicação."
      : /VIMEO_429/.test(code)
        ? "O limite temporário de requisições do Vimeo foi atingido."
        : "Não foi possível comunicar com a API do Vimeo.";
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const current = await configuration();
  return NextResponse.json({
    enabled: current.enabled,
    configured: Boolean(current.accessToken),
    tokenHint: tokenHint(current.accessToken),
    lastSyncAt: current.lastSyncAt,
    lastImportResult: current.lastImportResult,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { accessToken?: string; enabled?: boolean };
  const current = await configuration();
  const accessToken = body.accessToken?.trim().slice(0, 1000) || current.accessToken;
  const active = typeof body.enabled === "boolean" ? body.enabled : current.enabled;
  if (active && !accessToken) return NextResponse.json({ error: "Informe o token de acesso antes de ativar a integração." }, { status: 400 });
  await writePortalSettings({ vimeo_access_token: accessToken, vimeo_enabled: active });
  return NextResponse.json({ enabled: active, configured: Boolean(accessToken), tokenHint: tokenHint(accessToken) });
}

export async function PUT(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: string; accessToken?: string };
  const current = await configuration();
  const accessToken = body.accessToken?.trim() || current.accessToken;

  try {
    if (body.action === "test") {
      const account = await vimeoFetch<{ name?: string; uri?: string; link?: string }>("/me?fields=name,uri,link", accessToken);
      return NextResponse.json({ ok: true, accountName: account.name || "Conta Vimeo", accountLink: account.link || "" });
    }
    if (body.action !== "import") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

    const payload = await vimeoFetch<{ data?: VimeoVideo[] }>("/me/videos?per_page=100&sort=date&direction=desc&fields=uri,name,description,link,pictures.sizes,duration,created_time,status", accessToken);
    const videos = Array.isArray(payload.data) ? payload.data : [];
    const existing = await listAdminVideos();
    const byUrl = new Map(existing.map((video) => [video.videoUrl, video]));
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const video of videos) {
      const videoUrl = String(video.link || "").trim();
      const title = String(video.name || "").trim();
      if (!videoUrl || title.length < 3) { skipped += 1; continue; }
      const input = {
        title: title.slice(0, 180),
        description: String(video.description || "").trim().slice(0, 10000),
        category: "Vídeos",
        subcategory: "Vimeo",
        videoUrl,
        videoType: "vimeo",
        thumbnailUrl: thumbnail(video),
        status: video.status === "available" ? "active" : "inactive",
        source: "vimeo",
        sourceId: String(video.uri || "").split("/").filter(Boolean).pop() || "",
        durationLabel: durationLabel(Number(video.duration || 0)),
      };
      const stored = byUrl.get(videoUrl);
      if (stored) {
        await updateAdminVideo(stored.id, { ...input, category: stored.category || input.category, subcategory: stored.subcategory || input.subcategory });
        updated += 1;
      } else {
        await createAdminVideo(input);
        imported += 1;
      }
    }

    const syncedAt = new Date().toISOString();
    const result = { total: videos.length, imported, updated, skipped };
    await writePortalSettings({
      vimeo_access_token: accessToken,
      vimeo_enabled: true,
      vimeo_last_synced_at: syncedAt,
      vimeo_last_import_result: result,
    });
    invalidatePublicListingsCache();
    return NextResponse.json({ ok: true, ...result, lastSyncAt: syncedAt });
  } catch (error) {
    return errorResponse(error);
  }
}
