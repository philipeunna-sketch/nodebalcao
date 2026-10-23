import type { Metadata } from "next";
import CategoryCatalog, { categoryMetadata } from "../catalog-page";

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return categoryMetadata((await params).slug);
}
export default async function CategoryPage({ params }: { params: Params }) {
  return <CategoryCatalog slug={(await params).slug} />;
}
