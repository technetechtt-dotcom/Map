import { notFound } from "next/navigation";
import { getEcosystemBySlug } from "@/lib/ecosystem";
import EcosystemDetailView from "@/components/EcosystemDetailView";

export const dynamic = "force-dynamic";

export default async function ProcurementDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await getEcosystemBySlug("procurement", slug);
  if (!item) notFound();
  return <EcosystemDetailView type="procurement" item={item} />;
}
