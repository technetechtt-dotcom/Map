import { getBookData } from "@/lib/book";
import BookPrintToolbar from "@/components/book/BookPrintToolbar";
import {
  DistrictPinMap,
  buildPinsFromOrgs,
  primaryDistrictCode,
} from "@/components/book/DistrictPinMap";

export const dynamic = "force-dynamic";

function fmtDate(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BookPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ province?: string }>;
}) {
  const { province } = await searchParams;
  const provinceSlug = province || "northern-cape";
  const book = await getBookData(provinceSlug);
  const title = `Northern Cape ICT Ecosystem Map — ${book.scope}`;
  const genDate = fmtDate(book.generatedAt);

  return (
    <div className="book-shell">
      <BookPrintToolbar title={title} scope={book.scope} provinceSlug={provinceSlug} />

      <article id="printable-book" className="printable-book pdf-style-book">
        {/* COVER — PDF-style */}
        <section className="book-cover pdf-cover">
          <div className="pdf-cover-badge">mLab NC · Updated 2025</div>
          <p className="book-kicker">Startups · Skills · Hubs · Entrepreneurship · Innovation · Funding</p>
          <h1 className="book-title">Northern Cape</h1>
          <h2 className="pdf-cover-sub">ICT Ecosystem Map</h2>
          <p className="book-subtitle">
            Printable system book — aligned to the mLab NC presentation, with district maps and exact
            contact pins for ICT startup opportunity zones.
          </p>
          <p className="book-edition">
            {book.scope} edition · Generated {genDate}
            <br />
            Source: {book.sourceDocument}
          </p>
          <div className="book-cover-stats">
            <div>
              <strong>{book.stats.locations}</strong>
              <span>Map towns</span>
            </div>
            <div>
              <strong>{book.stats.opportunityChapters}</strong>
              <span>Opportunity zones</span>
            </div>
            <div>
              <strong>{book.stats.organisations}</strong>
              <span>Key contacts</span>
            </div>
            <div>
              <strong>{book.stats.districts}</strong>
              <span>Districts</span>
            </div>
          </div>
          <p className="book-disclaimer">
            Developed with community members to guide investors and entrepreneurs. Coordinates are
            WGS84 place/street pins cross-checked for the platform map. Boundary shapes are simplified
            district/municipality envelopes for print — replace with official MDB layers for gazette
            products.
          </p>
        </section>

        {/* IMPRINT */}
        <section className="book-page book-section" id="imprint">
          <h2>Imprint</h2>
          <table className="book-table">
            <tbody>
              <tr>
                <th>Title</th>
                <td>{title}</td>
              </tr>
              <tr>
                <th>Primary source</th>
                <td>{book.sourceDocument}</td>
              </tr>
              <tr>
                <th>Scope</th>
                <td>{book.scope}</td>
              </tr>
              <tr>
                <th>Generated</th>
                <td>{genDate}</td>
              </tr>
              <tr>
                <th>Publication type</th>
                <td>
                  Printable district opportunity book (HTML / PDF via browser print) — PDF pages 3–7
                  structure with contact maps
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* TOC */}
        <section className="book-page book-section toc" id="contents">
          <h2>Contents</h2>
          <ol className="toc-list">
            <li>
              <a href="#summary">1. Province overview</a>
            </li>
            <li>
              <a href="#opportunities">2. ICT startup opportunity zones (PDF p.3–7)</a>
              <ol className="toc-sub">
                {book.opportunityChapters.map((ch) => (
                  <li key={ch.id}>
                    <a href={`#opp-${ch.id}`}>
                      p.{ch.pdfPage} {ch.title.split("—")[0].trim()}
                    </a>
                  </li>
                ))}
              </ol>
            </li>
            <li>
              <a href="#coverage">3. Geographic coverage</a>
            </li>
            <li>
              <a href="#structure">4. Administrative structure</a>
            </li>
            <li>
              <a href="#locations">5. Full location directory</a>
            </li>
            <li>
              <a href="#organisations">6. All organisations directory</a>
            </li>
            <li>
              <a href="#funding">7. Funding, events, programmes, procurement</a>
            </li>
            <li>
              <a href="#index">8. A–Z location index</a>
            </li>
            <li>
              <a href="#methodology">9. Methodology</a>
            </li>
          </ol>
        </section>

        {/* OVERVIEW */}
        <section className="book-page book-section" id="summary">
          <h2>1. Province overview</h2>
          <p className="pdf-lede">
            Geo-pin reference for ICT presence, sector zones, and contacts across the Northern Cape —
            built from the mLab NC ecosystem presentation and platform coordinates for accurate map
            placement.
          </p>

          <h3>Official district municipalities map</h3>
          <p className="meta">
            Authoritative administrative layout for the five district municipalities and all local
            municipalities in the Northern Cape (source: municipalities.co.za). Interactive and book
            district colours match this legend.
          </p>
          <figure className="official-admin-map">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/maps/nc-district-municipalities-official.png"
              alt="Northern Cape district and local municipalities map — Frances Baard, John Taolo Gaetsewe, Namakwa, Pixley ka Seme, ZF Mgcawu"
              className="official-admin-map-img"
            />
            <figcaption>
              © municipalities.co.za · Northern Cape districts &amp; local municipalities (visual
              source of truth for district colours and municipal names)
            </figcaption>
          </figure>

          <div className="pdf-district-legend">
            <div>
              <span style={{ background: "#C9B3E0" }} /> Frances Baard
            </div>
            <div>
              <span style={{ background: "#8EC4E8" }} /> John Taolo Gaetsewe
            </div>
            <div>
              <span style={{ background: "#E8C84A" }} /> Namakwa
            </div>
            <div>
              <span style={{ background: "#A8D08D" }} /> Pixley ka Seme
            </div>
            <div>
              <span style={{ background: "#7A9EAD" }} /> ZF Mgcawu
            </div>
          </div>

          <div className="pdf-fact-strip">
            <span>30.5% of SA landmass</span>
            <span>SKA / MeerKAT</span>
            <span>Solar &amp; renewable hub</span>
            <span>~1.3m population</span>
          </div>
          <table className="book-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Published map towns (PDF p.2)</td>
                <td>{book.stats.locations}</td>
              </tr>
              <tr>
                <td>ICT startup opportunity chapters (PDF p.3–7)</td>
                <td>{book.stats.opportunityChapters}</td>
              </tr>
              <tr>
                <td>Key contacts &amp; organisations</td>
                <td>{book.stats.organisations}</td>
              </tr>
              <tr>
                <td>District municipalities</td>
                <td>{book.stats.districts}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* PDF p.3–7 OPPORTUNITY CHAPTERS */}
        <section className="book-page book-section" id="opportunities">
          <h2>2. ICT startup opportunity zones</h2>
          <p className="meta">
            Structure mirrors presentation pages 3–7: zone identity, startup opportunities, strategic
            opportunity, and key contacts with an <strong>MDB-accurate district map</strong> (true
            local municipality boundaries) and WGS84 pins for each contact organisation.
          </p>
        </section>

        {book.opportunityChapters.map((ch) => {
          const pins = buildPinsFromOrgs(ch.contacts);
          const towns = ch.locations.map((l) => ({
            name: l.name,
            latitude: l.latitude,
            longitude: l.longitude,
          }));

          return (
            <section
              key={ch.id}
              className="book-page book-section opp-chapter"
              id={`opp-${ch.id}`}
              style={{ ["--opp-accent" as string]: ch.accent }}
            >
              <header className="opp-header">
                <p className="opp-page-tag">PDF page {ch.pdfPage} · ICT startup opportunities</p>
                <h2 className="opp-title">
                  <span className="opp-emoji" aria-hidden>
                    {ch.emoji}
                  </span>{" "}
                  {ch.title}
                </h2>
                <p className="opp-zone">
                  {ch.zoneLabel}
                  {ch.coordsLabel ? ` · ${ch.coordsLabel}` : ""}
                </p>
              </header>

              <div className="opp-chips">
                {ch.chips.map((c) => (
                  <div key={c.label} className="opp-chip">
                    <strong>{c.label}</strong>
                    <span>{c.note}</span>
                  </div>
                ))}
              </div>

              {/* Official single-district map (municipalities.co.za sheet) + pins */}
              <DistrictPinMap
                title={ch.zoneLabel}
                districtCode={primaryDistrictCode(ch.districtCodes)}
                accent={ch.accent}
                pins={pins}
                townMarkers={towns}
              />

              <div className="opp-grid">
                <div>
                  <h3 className="opp-h3">ICT startup opportunities</h3>
                  <ul className="opp-list">
                    {ch.opportunities.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </div>
                <div className="opp-strategic">
                  <h3 className="opp-h3">Strategic opportunity</h3>
                  <p>{ch.strategic}</p>
                </div>
              </div>

              <h3 className="opp-h3">Key contacts &amp; organisations</h3>
              <p className="meta">
                Pin numbers match the district map above. Every organisation named on the PDF slide
                has a pin; national HQs without a street address in the zone use a town marker
                (labelled “zone marker” in the list).
              </p>
              <div className="opp-contacts">
                {ch.contacts.map((c) => (
                  <article key={c.slug} className="opp-contact-card">
                    <div className="opp-contact-top">
                      {c.pinNumber != null ? (
                        <span className="pin-n" style={{ background: ch.accent }}>
                          {c.pinNumber}
                        </span>
                      ) : (
                        <span className="pin-n pin-n-muted">–</span>
                      )}
                      <div>
                        <h4>{c.name}</h4>
                        <p className="meta">
                          {c.type}
                          {c.pinProxy ? " · pin at zone town (HQ outside district)" : ""}
                        </p>
                      </div>
                    </div>
                    {c.address && <p className="opp-addr">{c.address}</p>}
                    {c.latitude != null && c.longitude != null && (
                      <p className="meta">
                        Pin: {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                        {" · "}
                        <a
                          href={`https://www.google.com/maps?q=${c.trueLatitude ?? c.latitude},${c.trueLongitude ?? c.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Google Maps
                        </a>
                      </p>
                    )}
                    <p className="opp-contact-line">
                      {[c.email, c.phone, c.website?.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ")}
                    </p>
                  </article>
                ))}
              </div>

              <p className="opp-footer-meta">
                Northern Cape ICT Ecosystem Map · mLab NC · northerncape@mlab.co.za · {ch.pdfPage} / 14
              </p>
            </section>
          );
        })}

        {/* COVERAGE */}
        <section className="book-page book-section" id="coverage">
          <h2>3. Geographic coverage</h2>
          <table className="book-table">
            <thead>
              <tr>
                <th>Province</th>
                <th>Locations</th>
              </tr>
            </thead>
            <tbody>
              {book.provinceCounts.map(([name, count]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="book-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {book.categoryCounts.map(([name, count]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* STRUCTURE */}
        <section className="book-page book-section" id="structure">
          <h2>4. Administrative structure</h2>
          {book.districts.length === 0 ? (
            <p className="meta">No districts in scope.</p>
          ) : (
            book.districts.map((d) => (
              <div key={d.id} className="book-subsection">
                <h3>
                  {d.name} <span className="meta">({d.code})</span>
                </h3>
                <p className="meta">
                  Municipalities:{" "}
                  {d.municipalities.map((m) => m.name).join(" · ") || "—"}
                </p>
              </div>
            ))
          )}
        </section>

        {/* LOCATIONS Abridged cards */}
        <section className="book-page book-section" id="locations">
          <h2>5. Full location directory</h2>
          <p className="meta">All PDF p.2 towns with coordinates and opportunity notes.</p>
          {book.byDistrict.map(([districtName, locs]) => (
            <div key={districtName} className="book-district-block">
              <h3 className="district-heading">
                {districtName}{" "}
                <span className="meta">
                  ({locs.length} location{locs.length === 1 ? "" : "s"})
                </span>
              </h3>
              {locs.map((loc: { id: string; slug: string; name: string; summary: string; latitude: number; longitude: number; status: string; category: { icon: string; name: string }; municipality?: { name: string } | null; opportunities: string[] }, idx: number) => (
                <article key={loc.id} className="loc-card" id={`loc-${loc.slug}`}>
                  <header className="loc-header">
                    <span className="loc-num">
                      {districtName.slice(0, 3).toUpperCase()}-{String(idx + 1).padStart(2, "0")}
                    </span>
                    <h4>
                      {loc.category.icon} {loc.name}
                    </h4>
                    <p className="meta">
                      {loc.category.name} · {loc.municipality?.name || "—"} · {loc.status}
                    </p>
                  </header>
                  <p>{loc.summary}</p>
                  <p className="meta">
                    Coordinates: {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                  </p>
                  {loc.opportunities.length > 0 && (
                    <>
                      <p>
                        <strong>Priority opportunities</strong>
                      </p>
                      <ul>
                        {loc.opportunities.map((o: string) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </article>
              ))}
            </div>
          ))}
        </section>

        {/* ORGS */}
        <section className="book-page book-section" id="organisations">
          <h2>6. All organisations directory</h2>
          <table className="book-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Pin / address</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {book.organisations.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.name}</strong>
                    {o.sourcePage ? <div className="meta">PDF {o.sourcePage}</div> : null}
                  </td>
                  <td>{o.type}</td>
                  <td>
                    {o.latitude != null && o.longitude != null ? (
                      <>
                        {o.latitude.toFixed(4)}, {o.longitude.toFixed(4)}
                        {o.address ? <div className="meta">{o.address}</div> : null}
                      </>
                    ) : (
                      <span className="meta">Directory only</span>
                    )}
                  </td>
                  <td className="meta">
                    {[o.email, o.phone].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Ecosystem remainder */}
        <section className="book-page book-section" id="funding">
          <h2>7. Funding, events, programmes &amp; procurement</h2>
          <h3>Funding</h3>
          {book.funding.length === 0 ? (
            <p className="meta">None published in scope.</p>
          ) : (
            book.funding.map((f) => (
              <article key={f.id} className="loc-card">
                <h4>{f.title}</h4>
                <p className="meta">
                  {f.organisation?.name || "—"} · {f.status}
                </p>
                {f.summary && <p>{f.summary}</p>}
              </article>
            ))
          )}
          <h3>Events</h3>
          {book.events.length === 0 ? (
            <p className="meta">None published in scope.</p>
          ) : (
            book.events.map((e) => (
              <article key={e.id} className="loc-card">
                <h4>{e.title}</h4>
                <p className="meta">{fmtDate(e.startsAt)}</p>
              </article>
            ))
          )}
          <h3>Programmes</h3>
          {book.programmes.length === 0 ? (
            <p className="meta">None published in scope.</p>
          ) : (
            book.programmes.map((p) => (
              <article key={p.id} className="loc-card">
                <h4>{p.title}</h4>
                {p.summary && <p>{p.summary}</p>}
              </article>
            ))
          )}
          <h3>Procurement</h3>
          {book.procurements.length === 0 ? (
            <p className="meta">None published in scope.</p>
          ) : (
            book.procurements.map((p) => (
              <article key={p.id} className="loc-card">
                <h4>{p.title}</h4>
                {p.summary && <p>{p.summary}</p>}
              </article>
            ))
          )}
        </section>

        {/* INDEX */}
        <section className="book-page book-section" id="index">
          <h2>8. A–Z location index</h2>
          <table className="book-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>District</th>
                <th>Coordinates</th>
              </tr>
            </thead>
            <tbody>
              {[...book.locations]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((l) => (
                  <tr key={l.id}>
                    <td>
                      <a href={`#loc-${l.slug}`}>{l.name}</a>
                    </td>
                    <td>{l.district?.name || "—"}</td>
                    <td className="meta">
                      {l.latitude.toFixed(4)}, {l.longitude.toFixed(4)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>

        {/* METHODOLOGY */}
        <section className="book-page book-section" id="methodology">
          <h2>9. Methodology</h2>
          <h3>How this book is produced</h3>
          <ul>
            <li>
              Opportunity chapters (section 2) follow <strong>PDF pages 3–7</strong> of the mLab NC
              ecosystem presentation: zone title, chips, startup opportunities, strategic statement,
              and key contacts.
            </li>
            <li>
              District maps use simplified GeoJSON envelopes for Frances Baard, ZF Mgcawu, John Taolo
              Gaetsewe, and Pixley ka Seme, with municipal emphasis where available.
            </li>
            <li>
              Contact pins use the platform&apos;s verified WGS84 latitudes/longitudes (Google
              Maps–compatible place or street location), not random offsets around town centres.
            </li>
            <li>
              Organisations without an NC street pin remain in the contact directory without a map
              number.
            </li>
          </ul>
          <p className="book-end">
            — End of {book.scope} edition · Generated {genDate} —
          </p>
        </section>
      </article>
    </div>
  );
}
