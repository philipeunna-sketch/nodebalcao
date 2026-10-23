export type NewsComment = { id: number; name: string; comment: string; createdAt: string };

export async function listApprovedNewsComments(postSlug: string) {
  const { env } = await import("cloudflare:workers");
  const result = await env.DB.prepare("SELECT id, name, comment, created_at AS createdAt FROM portal_news_comments WHERE post_slug = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50").bind(postSlug).all<NewsComment>();
  return result.results || [];
}

export async function createNewsComment(input: { postSlug: string; name: string; comment: string }) {
  const { env } = await import("cloudflare:workers");
  const createdAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO portal_news_comments (post_slug, name, comment, status, created_at) VALUES (?, ?, ?, 'pending', ?)").bind(input.postSlug, input.name, input.comment, createdAt).run();
  return { createdAt };
}
