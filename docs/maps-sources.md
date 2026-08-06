# Map sources & GIS guide

How to get **georeferenced official municipality data** for the Northern Cape ICT map, regenerate book district sheets, and work the same layers in QGIS.

## What this project uses

| Use | Source | Accuracy |
|-----|--------|----------|
| **Book · ICT startup opportunity zone maps** | MDB local + district polygons (WGS84) | Cadastral (official demarcation) |
| **Book · province overview art** | `public/maps/nc-district-municipalities-official.png` | Visual only (not georeferenced) |
| **Interactive map layers** | Seed boundaries / DB geojson | Envelope or seeded polygons; swap for MDB in production if needed |
| **Colours** | municipalities.co.za district palette | Cosmetic |

**Rule of thumb:** pins and zone chapters = **MDB geometry**. Pretty province poster = **PNG**. Do not crop the PNG and treat it as survey-accurate.

---

## Official data sources (South Africa)

| Authority | What | Link |
|-----------|------|------|
| **Municipal Demarcation Board (MDB)** | Official district & local municipality boundaries | [demarcation.org.za](https://www.demarcation.org.za/) |
| **DPME FeatureServer (MDB 2018)** | Hosted district + local layers (used by this repo) | [Administrative_Geospatial_Areas](https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/Administrative_Geospatial_Areas/FeatureServer) |
| **DRDLR / CSG MDB MapServer** | National MDB district/local services | [MDB MapServer layers](https://csggis.drdlr.gov.za/server/rest/services/MDB/MapServer/layers) |
| **NGI** | Topo / aerial base context (not mun parcels) | [ngi.gov.za](https://ngi.gov.za/) |
| **Stats SA** | Census-aligned admin areas | [statssa.gov.za](https://www.statssa.gov.za/) |
| **municipalities.co.za** | Labelled PDF/PNG maps & colour language | Not georeferenced — presentation only |

### Northern Cape district names (MDB 2018)

Use these exact names when filtering REST or desktop GIS:

| Code (this app) | MDB district name | Colour (municipalities.co.za palette) |
|-----------------|-------------------|----------------------------------------|
| DC9 | Frances Baard | `#C9B3E0` |
| DC45 | John Taolo Gaetsewe | `#8EC4E8` |
| DC6 | Namakwa | `#E8C84A` |
| DC7 | Pixley ka Seme | `#A8D08D` |
| DC8 | Z F Mgcawu *(display: ZF Mgcawu)* | `#7A9EAD` |

**Note:** ArcGIS layers sometimes show wrong *province* attributes next to these names. Filter by **`districtmunicipality`**, not province. Geometry for these five names covers Northern Cape as expected.

Local municipalities expected (MDB 2018):

- **Frances Baard:** Dikgatlong, Magareng, Phokwane, Sol Plaatje  
- **John Taolo Gaetsewe:** Gamagara, Ga-Segonyana, Joe Morolong  
- **Namakwa:** Hantam, Kamiesberg, Karoo Hoogland, Khâi-Ma, Nama Khoi, Richtersveld  
- **Pixley ka Seme:** Emthanjeni, Kareeberg, Renosterberg, Siyancuma, Siyathemba, Thembelihle, Ubuntu, Umsobomvu  
- **Z F Mgcawu:** !Kheis, Dawid Kruiper, Kai !Garib, Kgatelopele, Tsantsabane  

---

## REST query URLs (DPME / MDB 2018)

Base service:

```text
https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/Administrative_Geospatial_Areas/FeatureServer
```

| Layer | Id | Content |
|-------|----|---------|
| District Municipalities (MDB2018) | `0` | District polygons |
| Local Municipalities (MDB2018) | `1` | Local (category B) polygons |

**SQL `where` used for Northern Cape chapters:**

```sql
districtmunicipality IN (
  'Frances Baard',
  'John Taolo Gaetsewe',
  'Namakwa',
  'Pixley ka Seme',
  'Z F Mgcawu'
)
```

### Districts → GeoJSON (WGS84)

Open in a browser or `curl` / PowerShell. Response is a FeatureCollection.

```text
https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/Administrative_Geospatial_Areas/FeatureServer/0/query?where=districtmunicipality%20IN%20('Frances%20Baard','John%20Taolo%20Gaetsewe','Namakwa','Pixley%20ka%20Seme','Z%20F%20Mgcawu')&outFields=*&outSR=4326&f=geojson
```

### Local municipalities → GeoJSON (WGS84)

```text
https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/Administrative_Geospatial_Areas/FeatureServer/1/query?where=districtmunicipality%20IN%20('Frances%20Baard','John%20Taolo%20Gaetsewe','Namakwa','Pixley%20ka%20Seme','Z%20F%20Mgcawu')&outFields=*&outSR=4326&f=geojson
```

### Single district only (example: Frances Baard)

```text
https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/Administrative_Geospatial_Areas/FeatureServer/1/query?where=districtmunicipality%3D'Frances%20Baard'&outFields=*&outSR=4326&f=geojson
```

### Query parameters reference

| Param | Value | Meaning |
|-------|--------|---------|
| `where` | see SQL above | Feature filter |
| `outFields` | `*` or field list | Attributes |
| `outSR` | `4326` | WGS84 lon/lat (match app pins) |
| `f` | `geojson` | Return format (`json`, `pbf` also available) |
| `returnGeometry` | `true` (default) | Include polygons |

HTML query UI (browse fields / test filters):

```text
https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/Administrative_Geospatial_Areas/FeatureServer/0/query
https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/Administrative_Geospatial_Areas/FeatureServer/1/query
```

### Alternate national server (DRDLR CSG)

Explore layers and build similar queries:

```text
https://csggis.drdlr.gov.za/server/rest/services/MDB/MapServer
```

Field names differ on that service (`DISTRICT`, `DISTRICT_N`, `PROVINCE`, etc.). Always check `?f=json` on the layer before writing filters.

---

## Project scripts (already wired)

From the repo root (`northern-cape-ict-map`):

```bash
# Download MDB GeoJSON + build book-ready simplified districts
npm run maps:mdb

# Rebuild book JSON only (if raw GeoJSON already downloaded)
npm run maps:mdb:build

# Optional: crop municipalities.co.za PNG into per-district pictures (overview art only)
npm run maps:districts
```

### Files produced

| Path | Role |
|------|------|
| `data/boundaries/mdb/nc_districts_raw.geojson` | Full MDB district polys (download) |
| `data/boundaries/mdb/nc_local_mun_raw.geojson` | Full MDB local polys (download) |
| `data/boundaries/mdb/nc_mdb_book.json` | Simplified, coloured pack for `DistrictPinMap` |
| `public/maps/nc-district-municipalities-official.png` | Visual province map (not for pin georef) |
| `public/maps/districts/*.png` | Optional crop sheets (legacy / arts) |

Download scripts:

- `data/seed/download-mdb-boundaries.js`  
- `data/seed/build-mdb-maps.js`  

Book renderer:

- `src/components/book/DistrictPinMap.tsx`  

If the service URL or layer IDs change, update `BASE` and layer ids in `download-mdb-boundaries.js`, then re-run `npm run maps:mdb`.

---

## QGIS checklist (team)

Free desktop GIS: [https://qgis.org/](https://qgis.org/)

### A. Load MDB data from URL

1. Open QGIS → **Layer → Add Layer → Add ArcGIS REST Server Layer…**  
   Or **Data Source Manager → ArcGIS REST Server**.
2. New connection name: e.g. `DPME Admin Areas`.  
   URL:

   ```text
   https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/Administrative_Geospatial_Areas/FeatureServer
   ```

3. Connect → add **layer 0** (districts) and **layer 1** (local municipalities).  
4. CRS: project CRS **EPSG:4326** (WGS 84) for pin alignment with this app.

**If REST connection fails:** download GeoJSON via the browser URLs above → **Layer → Add Layer → Add Vector Layer** → choose the file.

### B. Filter Northern Cape districts

1. Right-click layer → **Filter…**
2. Expression:

   ```sql
   "districtmunicipality" IN (
     'Frances Baard',
     'John Taolo Gaetsewe',
     'Namakwa',
     'Pixley ka Seme',
     'Z F Mgcawu'
   )
   ```

3. Apply. You should see **5 districts** or **26 local municipalities**.

### C. Style like the book / municipalities.co.za

1. Right-click → **Properties → Symbology → Categorized** (or Rule-based).  
2. Column: `districtmunicipality`.  
3. Assign fills:

   | districtmunicipality | Fill |
   |----------------------|------|
   | Frances Baard | `#C9B3E0` |
   | John Taolo Gaetsewe | `#8EC4E8` |
   | Namakwa | `#E8C84A` |
   | Pixley ka Seme | `#A8D08D` |
   | Z F Mgcawu | `#7A9EAD` |

4. Stroke: dark `#1e293b`, ~0.4–0.8 mm.  
5. Labels: `localmunicipality` or `districtmunicipality`, uppercase if you want the poster style.

### D. Add organisation pins (CSV)

1. Export or copy a CSV with columns e.g. `name,latitude,longitude` (from org data / admin export).  
2. **Layer → Add Layer → Add Delimited Text Layer**.  
3. X = `longitude`, Y = `latitude`, Geometry CRS = **EPSG:4326**.  
4. Style as marker + label (`name`).  
5. Cross-check: Kimberley ICT pins should fall in **Sol Plaatje**; Upington area in **Dawid Kruiper**.

### E. One district print layout

1. Filter locals: `"districtmunicipality" = 'Frances Baard'`.  
2. **Zoom to layer**.  
3. **Project → New Print Layout** → add map, legend, title (“Frances Baard District Municipality”).  
4. Export **PDF/PNG** for presentations.  
5. Optional: drop pins for that chapter’s key contacts only.

### F. Export for this repo (optional manual path)

1. Filtered local muns → **Export → Save Features As…** → GeoJSON, CRS `EPSG:4326`.  
2. Replace or feed into `data/boundaries/mdb/` and run `npm run maps:mdb:build` if your pipeline still expects the same naming / simplification step.

### G. Do **not** rely on this for accuracy

- Georeferencing the 800px municipalities.co.za PNG with four fuzzy control points.  
- Rectangular pixel crops as “district maps”.  
- Guessing bounds from a screenshot.

Use georeferencing only if branding **requires** a specific scanned basemap *and* you set control points carefully; still verify pins against MDB polygons.

---

## Interactive map vs book

| Surface | Geometry today | Recommendation |
|---------|----------------|----------------|
| `/book/print` opportunity zones | `nc_mdb_book.json` (MDB simplified) | Keep; re-run `maps:mdb` after MDB updates |
| Interactive Leaflet map | Seed envelopes in DB / GeoJSON | Optional upgrade: load `nc_local_mun_raw.geojson` or PostGIS |
| Province overview in book | Official PNG | Keep as art; label “indicative” if shown next to MDB maps |

---

## Refresh / troubleshooting

| Symptom | Action |
|---------|--------|
| Book: “Accurate MDB district map missing” | Run `npm run maps:mdb` |
| Empty GeoJSON from URL | Check network/firewall; try DRDLR MapServer; confirm layer ids still `0`/`1` |
| District in wrong province attribute | Ignore province field; filter by name |
| Pins outside mun | Verify lat/lng in seed; swap lat/lng if inverted; confirm CRS 4326 |
| Labels with `KhA.i-Ma` encoding | Source encoding quirk; book pipeline normalises to KHÂI-MA |

---

## Contacts & further reading

- Municipal Demarcation Board: [demarcation.org.za](https://www.demarcation.org.za/)  
- municipalities.co.za (visual product only): [municipalities.co.za](https://municipalities.co.za/)  
- QGIS docs: [docs.qgis.org](https://docs.qgis.org/)  
- This app seed notes: `data/seed/boundaries.js` (palette + layout comments)

---

*Last aligned with app scripts: `maps:mdb`, DPME FeatureServer layers 0/1, book component `DistrictPinMap`.*
