import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../../db/admin-auth";
import { getAiCallAudio } from "../../../../../db/ai-call-campaigns";

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const item = await getAiCallAudio(url.searchParams.get("id") || "");
  if (!item) return NextResponse.json({ error: "Áudio não localizado." }, { status: 404 });
  const headers = new Headers({ "content-type": item.audioMimeType, "cache-control": "private, no-store" });
  if (url.searchParams.get("download") === "1") headers.set("content-disposition", `attachment; filename="ligacao-${item.customerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.wav"`);
  return new Response(item.object.body, { headers });
}

export const dynamic = "force-dynamic";
