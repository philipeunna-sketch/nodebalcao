import EditListingClient from "./edit-listing-client";

export const dynamic = "force-dynamic";

export default async function EditListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ admin?: string; intent?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  return <EditListingClient id={id} mode={query.admin === "1" ? "admin" : "customer"} intent={query.intent === "review" ? "review" : "edit"} />;
}
