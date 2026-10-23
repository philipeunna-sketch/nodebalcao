import type { Metadata } from "next";
import CategoryCatalog, { categoryMetadata } from "../../catalog-page";

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string; subslug: string }>;
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, subslug } = await params;
  return categoryMetadata(slug, subslug);
}
export default async function SubcategoryPage({ params }: { params: Params }) {
  const { slug, subslug } = await params;
  return <CategoryCatalog slug={slug} subslug={subslug} />;
}
