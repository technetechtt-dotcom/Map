import { NextRequest, NextResponse } from "next/server";
import { getBookData } from "@/lib/book";
import { bookDownloadFilename, buildBookHtmlDocument } from "@/lib/book-download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-side file download with Content-Disposition: attachment.
 * Browsers save this to the PC Downloads folder (no blob / JS tricks).
 *
 * GET /api/book/download?province=northern-cape&format=html|json
 */
export async function GET(req: NextRequest) {
  try {
    const province = req.nextUrl.searchParams.get("province") || "northern-cape";
    const format = (req.nextUrl.searchParams.get("format") || "html").toLowerCase();
    const book = await getBookData(province);

    if (format === "json") {
      const filename = bookDownloadFilename(book.scope, "json");
      const body = JSON.stringify(book, null, 2);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const origin = req.nextUrl.origin;
    const html = buildBookHtmlDocument(book, origin);
    const filename = bookDownloadFilename(book.scope, "html");

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(Buffer.byteLength(html, "utf8")),
      },
    });
  } catch (error) {
    console.error("[api/book/download]", error);
    return NextResponse.json(
      {
        error: "Failed to generate book download",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
