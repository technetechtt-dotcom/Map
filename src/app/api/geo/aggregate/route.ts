import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimitAsync } from "@/lib/api";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimitAsync(req, "geo-agg", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const group = req.nextUrl.searchParams.get("group") || "municipality";
  if (group === "district") {
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; organisations: bigint; locations: bigint; verified: bigint }>>`
      SELECT d.id, d.name,
        COUNT(DISTINCT o.id)::bigint AS organisations,
        COUNT(DISTINCT l.id)::bigint AS locations,
        COUNT(DISTINCT l.id) FILTER (WHERE l.status IN ('VERIFIED','PUBLISHED'))::bigint AS verified
      FROM "District" d
      LEFT JOIN "Location" l ON l."districtId" = d.id
      LEFT JOIN "Organisation" o ON o."provinceId" = d."provinceId" AND o.status = 'PUBLISHED'
      GROUP BY d.id, d.name
      ORDER BY locations DESC
    `;
    return NextResponse.json({ group, rows: rows.map((row) => ({ ...row, organisations: Number(row.organisations), locations: Number(row.locations), verified: Number(row.verified) })) });
  }
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; organisations: bigint; locations: bigint; verified: bigint }>>`
    SELECT m.id, m.name,
      COUNT(DISTINCT l."organisationId")::bigint AS organisations,
      COUNT(l.id)::bigint AS locations,
      COUNT(l.id) FILTER (WHERE l.status IN ('VERIFIED','PUBLISHED'))::bigint AS verified
    FROM "Municipality" m
    LEFT JOIN "Location" l ON l."municipalityId" = m.id
    GROUP BY m.id, m.name
    ORDER BY locations DESC
  `;
  return NextResponse.json({
    group,
    rows: rows.map((row) => ({ ...row, organisations: Number(row.organisations), locations: Number(row.locations), verified: Number(row.verified) })),
  });
}
