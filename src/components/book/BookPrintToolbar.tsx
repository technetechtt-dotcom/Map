"use client";

import { useCallback, useState } from "react";

/**
 * Download buttons use real HTTP attachments from /api/book/download.
 * That forces the browser to save a file — client-side blobs are unreliable
 * in some browsers / embedded webviews.
 */
export default function BookPrintToolbar({
  title,
  scope,
  provinceSlug = "northern-cape",
}: {
  title: string;
  scope: string;
  provinceSlug?: string;
}) {
  const [status, setStatus] = useState<string | null>(null);

  const htmlHref = `/api/book/download?province=${encodeURIComponent(provinceSlug)}&format=html`;
  const jsonHref = `/api/book/download?province=${encodeURIComponent(provinceSlug)}&format=json`;

  const printBook = useCallback(() => {
    setStatus(null);
    try {
      window.print();
      setStatus("Print dialog opened — choose “Save as PDF” or a printer.");
    } catch {
      setStatus("Print was blocked. Press Ctrl+P (Cmd+P on Mac) → Save as PDF.");
    }
  }, []);

  return (
    <div className="book-toolbar no-print">
      <div>
        <p className="eyebrow">Printable system book</p>
        <h1 className="text-2xl font-extrabold text-ink">Generate &amp; print</h1>
        <p className="text-muted text-sm">
          Scope: <strong>{scope}</strong>. Downloads are served by the server as real files (saved
          to your Downloads folder). For PDF: use <strong>Print / Save PDF</strong>.
        </p>
        {status ? (
          <p className="mt-2 text-sm font-semibold text-ink" role="status">
            {status}
          </p>
        ) : null}
        <p className="meta mt-1" style={{ fontSize: "0.8rem" }}>
          Title: {title}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={printBook}>
          Print / Save PDF
        </button>
        {/*
          Real file download via HTTP Content-Disposition (do not use blob/JS).
          Same-tab navigation so the browser must save the attachment.
        */}
        <a
          className="btn btn-outline"
          href={htmlHref}
          download={`SA-ICT-Ecosystem-Book-${provinceSlug}.html`}
          onClick={() =>
            setStatus(
              "Download started — check your PC Downloads folder for SA-ICT-Ecosystem-Book-….html"
            )
          }
        >
          Download HTML book
        </a>
        <a
          className="btn btn-outline"
          href={jsonHref}
          download={`SA-ICT-Ecosystem-Book-${provinceSlug}.json`}
          onClick={() =>
            setStatus("Download started — check your PC Downloads folder for the .json file")
          }
        >
          Download JSON
        </a>
        <a className="btn btn-outline" href="/book">
          Change scope
        </a>
      </div>
    </div>
  );
}
