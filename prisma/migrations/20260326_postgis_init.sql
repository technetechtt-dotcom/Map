-- PostGIS init for SA ICT Ecosystem Map (run after Prisma tables exist)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Optional geometry column for spatial queries (keeps lat/lng canonical in Prisma)
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

UPDATE "Location"
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS location_geom_idx ON "Location" USING GIST (geom);

-- Optional: province/district envelopes when geojson columns hold full Feature JSON
-- UPDATE "District" SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4326) WHERE geojson IS NOT NULL;
