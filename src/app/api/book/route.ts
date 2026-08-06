import { NextRequest, NextResponse } from "next/server";
import { getBookData } from "@/lib/book";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** JSON export of full book payload for external typesetting / Word pipelines */
export async function GET(req: NextRequest) {
  try {
    const province = req.nextUrl.searchParams.get("province") || undefined;
    const book = await getBookData(province || undefined);
    return NextResponse.json(book);
  } catch (error) {
    console.error("[api/book]", error);
    return NextResponse.json(
      {
        error: "Failed to build book data",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
