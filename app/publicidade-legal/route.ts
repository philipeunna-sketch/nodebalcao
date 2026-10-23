export function GET(request: Request) {
  const target = new URL("/publicidadelegal", request.url);
  target.search = new URL(request.url).search;
  return Response.redirect(target, 301);
}
