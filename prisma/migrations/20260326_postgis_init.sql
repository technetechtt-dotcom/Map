-- PostGIS init + auto geometry sync for Location coordinates
CREATE EXTENSION IF NOT EXISTS postgis;

-- Placeholder table if Prisma has not created Location yet (CI smoke)
CREATE TABLE IF NOT EXISTS "Location" (
  id TEXT PRIMARY KEY,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
);

ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

CREATE OR REPLACE FUNCTION location_sync_geom() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  ELSE
    NEW.geom := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS location_geom_trg ON "Location";
CREATE TRIGGER location_geom_trg
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "Location"
  FOR EACH ROW EXECUTE FUNCTION location_sync_geom();

UPDATE "Location"
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS location_geom_idx ON "Location" USING GIST (geom);

-- Append-only audit protection (run after AuditLog exists)
-- CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
-- BEGIN
--   RAISE EXCEPTION 'AuditLog is append-only';
-- END;
-- $$ LANGUAGE plpgsql;
-- CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
--   FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
