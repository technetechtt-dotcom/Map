export default function FaqPage() {
  const items = [
    ["How do I save opportunities?", "Use Save on a record. Signed-in users sync Saved to their account. Anonymous visitors keep browser-only favourites."],
    ["What does a tracking reference look like?", "ICT-2026-00452. Use /track with that reference to see whether a submission is assigned, under review, needs information, or published."],
    ["Why was my organisation not shown with a verified site?", "Public organisation profiles only list PUBLISHED linked locations."],
    ["Can I claim an organisation?", "Yes, from the organisation profile. Administrators review evidence on the Organisation Claims queue."],
    ["How is national data sourced?", "See the data-sources page for authority, licence, retrieval date and freshness."],
  ];
  return (
    <div className="page max-w-3xl">
      <p className="eyebrow">Support</p>
      <h1>FAQ</h1>
      <div className="mt-6 grid gap-3">
        {items.map(([q, a]) => (
          <details key={q} className="panel-card">
            <summary className="font-bold">{q}</summary>
            <p className="mt-2 text-sm text-muted">{a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
