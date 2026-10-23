import { NextResponse } from "next/server";
import { createNewsComment, listApprovedNewsComments } from "../../../../db/news-comments";

const clean = (value: unknown, max: number) => String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);

export async function GET(request: Request) {
  const slug = clean(new URL(request.url).searchParams.get("slug"), 180);
  if (!slug) return NextResponse.json({ comments: [] });
  return NextResponse.json({ comments: await listApprovedNewsComments(slug) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const postSlug = clean(body.postSlug, 180);
  const name = clean(body.name, 80);
  const comment = clean(body.comment, 1500);
  if (!postSlug || name.length < 2 || comment.length < 3) return NextResponse.json({ error: "Preencha o nome e o comentário." }, { status: 400 });
  await createNewsComment({ postSlug, name, comment });
  return NextResponse.json({ ok: true, message: "Comentário enviado para moderação." });
}

export const dynamic = "force-dynamic";
