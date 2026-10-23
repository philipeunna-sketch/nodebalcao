import { NextResponse } from "next/server";
import { portalCategories } from "../../../categories";
import { generateVisitorListingDraftWithOpenAI } from "../../../../db/openai";
import { readPortalSettings } from "../../../../db/settings";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { description?: unknown };
  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  if (description.length < 20 || description.length > 6_000) {
    return NextResponse.json({ error: "Descreva o produto ou serviço usando entre 20 e 6.000 caracteres." }, { status: 400 });
  }
  const settings = await readPortalSettings();
  const categories = Array.isArray(settings.categories)
    ? settings.categories.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        if (typeof record.name !== "string" || !Array.isArray(record.subs)) return [];
        return [{ name: record.name, subs: record.subs.filter((value): value is string => typeof value === "string") }];
      })
    : portalCategories;
  try {
    const draft = await generateVisitorListingDraftWithOpenAI({ description, categories });
    return NextResponse.json({ ok: true, draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "OPENAI_NOT_CONFIGURED") {
      return NextResponse.json({ error: "A geração por inteligência artificial ainda não foi ativada no painel administrativo." }, { status: 503 });
    }
    return NextResponse.json({ error: "Não foi possível gerar o anúncio agora. Revise a descrição e tente novamente." }, { status: 502 });
  }
}
