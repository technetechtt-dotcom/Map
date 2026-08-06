# Northern Cape ICT Ecosystem Map — MVP

A runnable Airbnb-style split-view ecosystem map.

## Features
- OpenStreetMap basemap
- Search by town, sector, institution or opportunity
- District and category filters
- Clickable custom pins
- Synchronized cards and markers
- Responsive desktop/mobile layout
- JSON dataset and CSV admin-import template

## Run locally
```bash
cd northern-cape-ict-map
python -m http.server 8080
```
Then open `http://localhost:8080`.

Opening `index.html` directly may block the JSON request.

## Data status
The data comes from the uploaded Northern Cape ecosystem material and has not been independently verified. Before public launch, verify coordinates, municipality assignments, organisation contacts, URLs, partner status, source URLs and verification dates.

## Production path
1. Northern Cape public MVP
2. Verified directory and admin dashboard
3. PostgreSQL/PostGIS database
4. All nine provinces
5. Community submissions and moderation
6. Funding calls, events, procurement and analytics

## Map tiles
This prototype uses OpenStreetMap's public raster tile service. A public or high-traffic deployment should use a suitable hosted or self-managed provider and comply with attribution and usage policies.
