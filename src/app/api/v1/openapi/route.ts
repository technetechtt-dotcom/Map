import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "SA ICT Ecosystem API", version: "1.0.0" },
    servers: [{ url: "/api/v1" }],
    components: { securitySchemes: { apiKey: { type: "apiKey", in: "header", name: "x-api-key" } } },
    paths: {
      "/locations": {
        get: {
          summary: "Search published ICT ecosystem locations",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "province", in: "query", schema: { type: "string" } },
            { name: "lat", in: "query", schema: { type: "number" } },
            { name: "lng", in: "query", schema: { type: "number" } },
            { name: "radiusKm", in: "query", schema: { type: "number", maximum: 250 } },
          ],
          responses: { "200": { description: "Published locations ordered by relevance or distance" } },
        },
      },
    },
  });
}
