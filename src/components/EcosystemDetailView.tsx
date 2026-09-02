import Link from "next/link";
import type { EcosystemType } from "@/lib/ecosystem";
import SaveFavouriteButton from "@/components/SaveFavouriteButton";

type DetailProps = {
  type: EcosystemType;
  item: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    description?: string | null;
    url?: string | null;
    tags?: string[];
    province?: { name: string; slug: string } | null;
    organisation?: { name: string; slug: string } | null;
    amount?: string | null;
    budget?: string | null;
    deadline?: Date | null;
    closingDate?: Date | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    venue?: string | null;
    onlineUrl?: string | null;
    referenceNumber?: string | null;
    issuingAuthority?: string | null;
  };
};

const TYPE_LABEL: Record<EcosystemType, string> = {
  funding: "Funding",
  events: "Event",
  programmes: "Programme",
  procurement: "Procurement",
};

export default function EcosystemDetailView({ type, item }: DetailProps) {
  const listHref = `/${type}`;
  return (
    <div className="page">
      <p className="eyebrow">{TYPE_LABEL[type]}</p>
      <h1>{item.title}</h1>
      <p className="text-muted max-w-3xl">{item.summary}</p>
      {item.description && <p className="mt-4 max-w-3xl">{item.description}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {item.province && <span className="chip">{item.province.name}</span>}
        {item.organisation && (
          <Link href={`/organisations/${item.organisation.slug}`} className="chip chip-active">
            {item.organisation.name}
          </Link>
        )}
        {(item.tags || []).map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-6 grid gap-2 text-sm">
        {item.amount && <p><strong>Amount:</strong> {item.amount}</p>}
        {item.budget && <p><strong>Budget:</strong> {item.budget}</p>}
        {item.deadline && <p><strong>Deadline:</strong> {new Date(item.deadline).toLocaleDateString()}</p>}
        {item.closingDate && <p><strong>Closing:</strong> {new Date(item.closingDate).toLocaleDateString()}</p>}
        {item.startsAt && <p><strong>Starts:</strong> {new Date(item.startsAt).toLocaleString()}</p>}
        {item.endsAt && <p><strong>Ends:</strong> {new Date(item.endsAt).toLocaleString()}</p>}
        {item.venue && <p><strong>Venue:</strong> {item.venue}</p>}
        {item.referenceNumber && <p><strong>Reference:</strong> {item.referenceNumber}</p>}
        {item.issuingAuthority && <p><strong>Authority:</strong> {item.issuingAuthority}</p>}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {item.url && (
          <a href={item.url} className="btn" target="_blank" rel="noreferrer">
            Open official source
          </a>
        )}
        {item.onlineUrl && (
          <a href={item.onlineUrl} className="btn btn-outline" target="_blank" rel="noreferrer">
            Join online
          </a>
        )}
        <SaveFavouriteButton kind={type} slug={item.slug} title={item.title} />
        <Link href={listHref} className="btn btn-outline">
          Back to {TYPE_LABEL[type].toLowerCase()} list
        </Link>
      </div>
    </div>
  );
}
