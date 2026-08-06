/**
 * Pure HTML book builder (no react-dom/server — Next.js App Router forbids it
 * outside selected RSC paths). Used by /api/book/download for real file saves.
 */

type BookPayload = Awaited<ReturnType<typeof import("@/lib/book").getBookData>>;

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function safeFilePart(s: string) {
  return (
    s
      .replace(/[^\w\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "book"
  );
}

export function bookDownloadFilename(scope: string, ext: "html" | "json") {
  const day = new Date().toISOString().slice(0, 10);
  return `SA-ICT-Ecosystem-Book-${safeFilePart(scope)}-${day}.${ext}`;
}

/** Self-contained HTML book for Download → PC (Content-Disposition attachment). */
export function buildBookHtmlDocument(book: BookPayload, origin = ""): string {
  const title = `Northern Cape ICT Ecosystem Map — ${book.scope}`;
  const genDate = fmtDate(book.generatedAt);
  const printUrl = origin
    ? `${origin}/book/print?province=${encodeURIComponent(
        book.province?.slug || "northern-cape"
      )}`
    : "/book/print?province=northern-cape";

  const chapterBlocks = book.opportunityChapters
    .map((ch) => {
      const opportunities = ch.opportunities.map((o) => `<li>${esc(o)}</li>`).join("");
      const chips = (ch.chips || [])
        .map(
          (c) =>
            `<div class="opp-chip"><strong>${esc(c.label)}</strong><span>${esc(c.note)}</span></div>`
        )
        .join("");

      const pinLegend = ch.contacts
        .filter((c) => c.pinNumber != null)
        .map((c) => {
          const proxy = c.pinProxy ? " <em>(zone marker)</em>" : "";
          const coord =
            c.latitude != null && c.longitude != null
              ? ` — ${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`
              : "";
          return `<li><span class="pin-n" style="background:${esc(ch.accent)}">${c.pinNumber}</span>
            <span><strong>${esc(c.name)}</strong>${proxy}${c.type ? ` · ${esc(c.type)}` : ""}${
            c.address ? `<br/><span class="meta">${esc(c.address)}</span>` : ""
          }${coord ? `<br/><span class="meta">${coord}</span>` : ""}</span></li>`;
        })
        .join("\n");

      const contacts = ch.contacts
        .map((c) => {
          const pin =
            c.pinNumber != null
              ? `<span class="pin-n" style="background:${esc(ch.accent)}">${c.pinNumber}</span>`
              : `<span class="pin-n pin-n-muted">–</span>`;
          const proxy = c.pinProxy ? " · zone marker" : "";
          const addr = c.address ? `<p class="meta">${esc(c.address)}</p>` : "";
          const coords =
            c.latitude != null && c.longitude != null
              ? `<p class="meta">Pin: ${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}</p>`
              : "";
          const line = [c.email, c.phone, c.website?.replace(/^https?:\/\//, "")]
            .filter(Boolean)
            .map(esc)
            .join(" · ");
          return `<article class="opp-contact-card">
  <div class="opp-contact-top">${pin}<div><h4>${esc(c.name)}</h4><p class="meta">${esc(
            c.type || ""
          )}${proxy}</p></div></div>
  ${addr}${coords}${line ? `<p class="meta">${line}</p>` : ""}
</article>`;
        })
        .join("\n");

      return `
<section class="book-page book-section opp-chapter" id="opp-${esc(ch.id)}">
  <header class="opp-header">
    <p class="opp-page-tag">PDF page ${ch.pdfPage} · ICT startup opportunities</p>
    <h2 class="opp-title">${esc(ch.emoji)} ${esc(ch.title)}</h2>
    <p class="opp-zone">${esc(ch.zoneLabel)}${ch.coordsLabel ? ` · ${esc(ch.coordsLabel)}` : ""}</p>
  </header>
  <div class="opp-chips">${chips}</div>
  <div class="map-placeholder">
    <p><strong>District map</strong> — open the interactive book for the live MDB map with spaced pins:</p>
    <p><a href="${esc(printUrl)}#opp-${esc(ch.id)}">${esc(printUrl)}#opp-${esc(ch.id)}</a></p>
    <ol class="district-pin-legend">${pinLegend}</ol>
  </div>
  <div class="opp-grid">
    <div>
      <h3 class="opp-h3">ICT startup opportunities</h3>
      <ul class="opp-list">${opportunities}</ul>
    </div>
    <div class="opp-strategic">
      <h3 class="opp-h3">Strategic opportunity</h3>
      <p>${esc(ch.strategic)}</p>
    </div>
  </div>
  <h3 class="opp-h3">Key contacts &amp; organisations</h3>
  <div class="opp-contacts">${contacts}</div>
</section>`;
    })
    .join("\n");

  const orgRows = book.organisations
    .map(
      (o) =>
        `<tr><td>${esc(o.name)}</td><td>${esc(o.type || "")}</td><td>${esc(o.email || "")}</td><td>${esc(
          o.phone || ""
        )}</td><td>${
          o.website
            ? `<a href="${esc(o.website)}">${esc(o.website.replace(/^https?:\/\//, ""))}</a>`
            : "—"
        }</td></tr>`
    )
    .join("\n");

  const locBlocks = book.byDistrict
    .map(([districtName, locs]) => {
      const cards = locs
        .map((loc) => {
          const themes = (loc.themes || [])
            .map((t: string) => `<span class="chip">${esc(t)}</span>`)
            .join(" ");
          return `<article class="loc-card">
  <h4>${esc(loc.name)}</h4>
  <p class="meta">${esc(loc.category?.name || "")} · ${esc(loc.municipality?.name || "")} · ${esc(
            loc.district?.name || ""
          )}</p>
  <p class="meta">${Math.abs(loc.latitude).toFixed(5)}° S, ${loc.longitude.toFixed(5)}° E</p>
  ${loc.summary ? `<p>${esc(loc.summary)}</p>` : ""}
  <div>${themes}</div>
</article>`;
        })
        .join("\n");
      return `<div class="book-district-block"><h3>${esc(districtName)}</h3>${cards}</div>`;
    })
    .join("\n");

  const funding = book.funding
    .map(
      (f) =>
        `<article class="loc-card"><h4>${esc(f.title)}</h4><p class="meta">${esc(
          f.organisation?.name || ""
        )}</p><p>${esc(f.summary || f.description || "")}</p></article>`
    )
    .join("\n");

  const baseCss = `
:root { --ink:#17211d; --muted:#65736d; --line:#dbe4df; --g950:#073f34; }
* { box-sizing: border-box; }
body { margin:0; font-family: "Segoe UI", system-ui, sans-serif; color: var(--ink); background:#fff; line-height:1.4; }
.printable-book { max-width: 920px; margin: 0 auto; padding: 16px 18px 28px; }
.book-cover {
  min-height: 0; display:flex; flex-direction:column; justify-content:flex-start;
  padding: 28px 22px 22px; border-radius: 0 0 12px 12px; margin-bottom: 18px;
  background: linear-gradient(165deg, #042f28 0%, #0a4a3d 42%, #0d5c4a 100%); color:#f3faf7;
}
.book-title { font-size: 2.1rem; margin: 0; font-weight: 800; line-height:1.1; }
.pdf-cover-sub { font-size: 1.35rem; margin: 4px 0 10px; font-weight: 600; opacity: .95; }
.book-cover-stats { display:grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap:8px; margin: 12px 0 0; }
.book-cover-stats strong { display:block; font-size:1.2rem; }
.book-cover-stats span { font-size:.75rem; opacity:.85; }
.book-section { margin: 0 0 14px; padding: 0; }
.book-page { break-before: auto; page-break-before: auto; }
h2 { font-size: 1.25rem; border-bottom: 2px solid var(--g950); padding-bottom: 4px; margin: 0 0 8px; }
.opp-h3, h3 { font-size: 1rem; margin: 10px 0 6px; }
.book-table { width:100%; border-collapse: collapse; font-size: .88rem; margin: 6px 0 10px; }
.book-table th, .book-table td { border-bottom:1px solid var(--line); padding:5px 4px; text-align:left; vertical-align:top; }
.meta { color: var(--muted); font-size: .86rem; }
.chip { display:inline-block; border:1px solid var(--line); padding:2px 8px; margin:2px; border-radius:999px; font-size:.72rem; }
.loc-card { border:1px solid var(--line); border-left:4px solid #128269; padding:8px 10px; margin:6px 0; border-radius:4px; break-inside:avoid; }
.opp-chips { display:flex; flex-wrap:wrap; gap:6px; margin: 6px 0 10px; }
.opp-chip { border:1px solid var(--line); border-radius:8px; padding:6px 8px; min-width: 100px; }
.opp-chip strong { display:block; font-size:.82rem; }
.opp-chip span { font-size:.74rem; color: var(--muted); }
.map-placeholder { border: none; border-radius: 10px; padding: 10px 12px; margin: 8px 0 10px; background:#f8faf9; }
.opp-grid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px; }
.opp-list { margin: 4px 0 4px 16px; }
.opp-strategic { background:#f8faf9; border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
.opp-contacts { display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px; }
.opp-contact-card { border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
.opp-contact-top { display:flex; gap:8px; align-items:flex-start; }
.pin-n { display:inline-flex; align-items:center; justify-content:center; min-width:24px; height:24px; border-radius:999px; color:#fff; font-weight:800; font-size:.75rem; flex-shrink:0; }
.pin-n-muted { background:#94a3b8; }
.district-pin-legend { list-style:none; margin:8px 0 0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:6px 10px; }
.district-pin-legend li { display:flex; gap:6px; align-items:flex-start; font-size:.82rem; }
.opp-title { border:none; font-size:1.2rem; margin:0 0 4px; }
.opp-zone { color: var(--muted); margin:0; }
.opp-page-tag { font-size:.7rem; text-transform:uppercase; letter-spacing:.06em; color: var(--muted); font-weight:700; margin:0 0 4px; }
.book-section + .book-section, .opp-chapter + .opp-chapter { border-top:1px solid var(--line); padding-top:12px; margin-top:12px; }
@media (max-width: 720px) {
  .book-cover-stats, .opp-grid, .opp-contacts, .district-pin-legend { grid-template-columns: 1fr; }
}
@media print {
  @page { size: A4; margin: 10mm 12mm; }
  html, body { height: auto !important; min-height: 0 !important; }
  .printable-book { max-width: none; padding: 0; }
  .book-cover {
    min-height: 0 !important; padding: 8mm 0 5mm !important; margin: 0 0 4mm !important;
    border-radius: 0; page-break-after: always; break-after: page;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .book-page, .book-section, .opp-chapter {
    break-before: auto !important; page-break-before: auto !important;
    break-after: auto !important; page-break-after: auto !important;
    margin-bottom: 4mm;
  }
  .book-section + .book-section, .opp-chapter + .opp-chapter {
    margin-top: 3mm; padding-top: 3mm;
  }
  .loc-card, .opp-contact-card, .opp-chip, tr { break-inside: avoid; page-break-inside: avoid; }
  h2, h3, h4 { page-break-after: avoid; break-after: avoid; }
  a { color: inherit; text-decoration: none; }
  .map-placeholder, .opp-contacts, .district-pin-legend { break-inside: auto; page-break-inside: auto; }
}
`.trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>${baseCss}</style>
</head>
<body>
<article class="printable-book" id="printable-book">
  <section class="book-cover">
    <p>mLab NC · Updated 2025</p>
    <p>Startups · Skills · Hubs · Entrepreneurship · Innovation · Funding</p>
    <h1 class="book-title">Northern Cape</h1>
    <h2 class="pdf-cover-sub">ICT Ecosystem Map</h2>
    <p>${esc(book.scope)} edition · Generated ${esc(genDate)}</p>
    <p class="meta" style="opacity:.9">Source: ${esc(book.sourceDocument)}</p>
    <div class="book-cover-stats">
      <div><strong>${book.stats.locations}</strong><span>Map towns</span></div>
      <div><strong>${book.stats.opportunityChapters}</strong><span>Opportunity zones</span></div>
      <div><strong>${book.stats.organisations}</strong><span>Key contacts</span></div>
      <div><strong>${book.stats.districts}</strong><span>Districts</span></div>
    </div>
  </section>

  <section class="book-section">
    <h2>How to use this file</h2>
    <p>This HTML file was <strong>downloaded to your PC</strong> from the Northern Cape ICT map platform.</p>
    <ul>
      <li>Open it in any browser (double-click the file).</li>
      <li>Print or Save as PDF from the browser (Ctrl+P / Cmd+P).</li>
      <li>For interactive district maps with pins, open: <a href="${esc(printUrl)}">${esc(printUrl)}</a></li>
    </ul>
  </section>

  <section class="book-section" id="imprint">
    <h2>Imprint</h2>
    <table class="book-table">
      <tbody>
        <tr><th>Title</th><td>${esc(title)}</td></tr>
        <tr><th>Scope</th><td>${esc(book.scope)}</td></tr>
        <tr><th>Generated</th><td>${esc(genDate)}</td></tr>
        <tr><th>Source</th><td>${esc(book.sourceDocument)}</td></tr>
      </tbody>
    </table>
  </section>

  <section class="book-section" id="summary">
    <h2>1. Province overview</h2>
    <p>Northern Cape ICT ecosystem directory and opportunity zones aligned to the mLab NC presentation (pages 3–7).</p>
    <table class="book-table">
      <tbody>
        <tr><th>Map towns (PDF)</th><td>${book.stats.locations}</td></tr>
        <tr><th>Opportunity chapters</th><td>${book.stats.opportunityChapters}</td></tr>
        <tr><th>Organisations / contacts</th><td>${book.stats.organisations}</td></tr>
        <tr><th>Districts</th><td>${book.stats.districts}</td></tr>
      </tbody>
    </table>
  </section>

  <section class="book-section" id="opportunities">
    <h2>2. ICT startup opportunity zones</h2>
    <p class="meta">Structure mirrors PDF pages 3–7. Pin numbers match key contacts for each zone.</p>
  </section>

  ${chapterBlocks}

  <section class="book-page book-section" id="locations">
    <h2>3. Locations directory</h2>
    ${locBlocks || "<p class='meta'>No locations in this scope.</p>"}
  </section>

  <section class="book-page book-section" id="organisations">
    <h2>4. Organisations</h2>
    <table class="book-table">
      <thead><tr><th>Name</th><th>Type</th><th>Email</th><th>Phone</th><th>Website</th></tr></thead>
      <tbody>${orgRows || "<tr><td colspan='5'>None</td></tr>"}</tbody>
    </table>
  </section>

  <section class="book-page book-section" id="funding">
    <h2>5. Funding &amp; programmes</h2>
    ${funding || "<p class='meta'>No published funding calls in this scope.</p>"}
  </section>

  <section class="book-section" id="end">
    <p class="meta">— End of ${esc(book.scope)} edition · Generated ${esc(genDate)} —</p>
  </section>
</article>
</body>
</html>`;
}
