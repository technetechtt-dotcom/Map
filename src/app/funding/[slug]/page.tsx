import { notFound } from "next/navigation";
import { getEcosystemBySlug } from "@/lib/ecosystem";
import EcosystemDetailView from "@/components/EcosystemDetailView";

export const dynamic = "force-dynamic";

export default async function FundingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await getEcosystemBySlug("funding", slug);
  if (!item) notFound();
  return <EcosystemDetailView type="funding" item={item} />;
}
