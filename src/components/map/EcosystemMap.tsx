"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { PublicLocation } from "@/lib/shape";
import { escapeAttr, escapeHtml } from "@/lib/security";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export type MapHub = {
  id: string;
  organisationId: string;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  sourcePage: string | null;
  address?: string | null;
  coordQuality?: string | null;
  color: string;
  latitude: number;
  longitude: number;
  trueLatitude?: number;
  trueLongitude?: number;
  wasSpread?: boolean;
  hostTown: string | null;
  hostTownName: string | null;
  kind: "hub";
};

type Props = {
  locations: PublicLocation[];
  hubs: MapHub[];
  showHubs: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectHub: (id: string) => void;
  onBoundsChange: (bounds: string) => void;
  viewKey: string;
  center: [number, number];
  zoom: number;
  provinceSlug: string;
  boundaryMode: "districts" | "municipalities" | "none";
  flyTarget: { id: string; lat: number; lng: number; token: number; zoom?: number } | null;
  fitToken: number;
};

function BoundsWatcher({
  onBoundsChange,
  suppressRef,
}: {
  onBoundsChange: (b: string) => void;
  suppressRef: React.MutableRefObject<boolean>;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emit = useCallback(
    (map: L.Map) => {
      if (suppressRef.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (suppressRef.current) return;
        const b = map.getBounds();
        onBoundsChange(
          `${b.getWest().toFixed(4)},${b.getSouth().toFixed(4)},${b.getEast().toFixed(4)},${b.getNorth().toFixed(4)}`
        );
      }, 450);
    },
    [onBoundsChange, suppressRef]
  );

  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
  });

  useEffect(() => {
    emit(map);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function FlyController({
  flyTarget,
  suppressRef,
}: {
  flyTarget: Props["flyTarget"];
  suppressRef: React.MutableRefObject<boolean>;
}) {
  const map = useMap();
  const lastToken = useRef<number | null>(null);

  useEffect(() => {
    if (!flyTarget) return;
    if (lastToken.current === flyTarget.token) return;
    lastToken.current = flyTarget.token;

    suppressRef.current = true;
    const targetZoom = Math.max(map.getZoom(), flyTarget.zoom ?? 10);
    map.flyTo([flyTarget.lat, flyTarget.lng], targetZoom, { duration: 0.55 });

    const release = setTimeout(() => {
      suppressRef.current = false;
    }, 700);

    return () => clearTimeout(release);
  }, [flyTarget, map, suppressRef]);

  return null;
}

function TownClusterLayer({
  locations,
  selectedId,
  onSelect,
}: {
  locations: PublicLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const signature = useMemo(
    () =>
      locations
        .map((l) => `${l.id}:${l.latitude}:${l.longitude}:${l.category.color}`)
        .sort()
        .join("|"),
    [locations]
  );

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cluster = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      spiderfyOnMaxZoom: true,
      animate: false,
    });

    const markers = new Map<string, L.Marker>();

    for (const loc of locations) {
      const icon = L.divIcon({
        className: "",
        html: `<div class="custom-marker" style="--marker-color:${escapeAttr(loc.category.color)}"><span>${escapeHtml(loc.category.icon)}</span></div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
        popupAnchor: [0, -38],
      });
      const m = L.marker([loc.latitude, loc.longitude], { icon, title: loc.name });
      const place = loc.district?.name || loc.province.name;
      const mun = loc.municipality ? ` · ${escapeHtml(loc.municipality.name)}` : "";
      m.bindPopup(`
        <article class="popup">
          <p class="popup-category">${escapeHtml(loc.category.name)}</p>
          <h3>${escapeHtml(loc.name)}</h3>
          <p><strong>${escapeHtml(place)}</strong>${mun}</p>
          <p>${escapeHtml(loc.summary)}</p>
          <p><a href="/locations/${escapeAttr(loc.slug)}">Open town profile →</a></p>
        </article>
      `);
      m.on("click", () => onSelectRef.current(loc.id));
      cluster.addLayer(m);
      markers.set(loc.id, m);
    }

    map.addLayer(cluster);
    markersRef.current = markers;

    return () => {
      map.removeLayer(cluster);
      markersRef.current = new Map();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);

  useEffect(() => {
    if (!selectedId || selectedId.startsWith("hub-")) return;
    const m = markersRef.current.get(selectedId);
    if (!m) return;
    const t = setTimeout(() => m.openPopup(), 80);
    return () => clearTimeout(t);
  }, [selectedId, signature]);

  return null;
}

function HubClusterLayer({
  hubs,
  selectedId,
  onSelectHub,
}: {
  hubs: MapHub[];
  selectedId: string | null;
  onSelectHub: (id: string) => void;
}) {
  const map = useMap();
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelectHub);
  onSelectRef.current = onSelectHub;

  const signature = useMemo(
    () =>
      hubs
        .map((h) => `${h.id}:${h.latitude}:${h.longitude}`)
        .sort()
        .join("|"),
    [hubs]
  );

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cluster = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      // Click cluster → zoom in; at high zoom, spiderfy so every pin is tappable
      maxClusterRadius: 52,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 2.4,
      spiderLegPolylineOptions: { weight: 1.5, color: "#0c4a6e", opacity: 0.55 },
      zoomToBoundsOnClick: true,
      // Separated CBD pins show individually from z14+
      disableClusteringAtZoom: 14,
      animate: true,
      iconCreateFunction: (c: {
        getChildCount: () => number;
        getAllChildMarkers: () => L.Marker[];
      }) => {
        const n = c.getChildCount();
        return L.divIcon({
          html: `<div class="hub-cluster" title="Click to expand ${n} organisations"><span>${n}</span><small>hubs</small></div>`,
          className: "",
          iconSize: [44, 44],
        });
      },
    });

    const markers = new Map<string, L.Marker>();

    for (const hub of hubs) {
      const contact = [hub.email, hub.phone]
        .filter(Boolean)
        .map((v) => escapeHtml(v))
        .join("<br/>");
      const place = hub.address
        ? `<p class="meta">${escapeHtml(hub.address)}</p>`
        : hub.hostTownName
          ? `<p><strong>${escapeHtml(hub.hostTownName)}</strong></p>`
          : "";
      const trueLat = hub.trueLatitude ?? hub.latitude;
      const trueLng = hub.trueLongitude ?? hub.longitude;
      const spreadNote = hub.wasSpread
        ? `<p class="meta">Pin fanned out so neighbours stay visible · true site ${trueLat.toFixed(5)}, ${trueLng.toFixed(5)}</p>`
        : `<p class="meta">${trueLat.toFixed(5)}, ${trueLng.toFixed(5)} · WGS84</p>`;
      const icon = L.divIcon({
        className: "",
        html: `<div class="hub-marker" style="--hub-color:${escapeAttr(hub.color)}" title="${escapeAttr(hub.name)}"><span>◎</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -12],
      });
      const m = L.marker([hub.latitude, hub.longitude], {
        icon,
        title: `${hub.name} (${hub.type})`,
        zIndexOffset: 200,
      });
      const safeWebsite =
        hub.website && /^https?:\/\//i.test(hub.website) ? escapeAttr(hub.website) : null;
      m.bindPopup(`
        <article class="popup">
          <p class="popup-category">Hub / organisation · ${escapeHtml(hub.type)}</p>
          <h3>${escapeHtml(hub.name)}</h3>
          ${place}
          ${spreadNote}
          ${hub.description ? `<p>${escapeHtml(hub.description)}</p>` : ""}
          ${contact ? `<p>${contact}</p>` : ""}
          ${safeWebsite ? `<p><a href="${safeWebsite}" target="_blank" rel="noreferrer">Website</a></p>` : ""}
          <p><a href="/org/${escapeAttr(hub.slug)}">Open organisation profile →</a></p>
          ${hub.sourcePage ? `<p class="meta">Source: PDF ${escapeHtml(hub.sourcePage)}</p>` : ""}
        </article>
      `);
      m.on("click", () => onSelectRef.current(hub.id));
      cluster.addLayer(m);
      markers.set(hub.id, m);
    }

    // Clicking a dense cluster immediately spiderfies when already zoomed in
    cluster.on("clusterclick", (e: { layer: { spiderfy: () => void; getChildCount: () => number }; originalEvent: Event }) => {
      if (map.getZoom() >= 13) {
        e.layer.spiderfy();
      }
    });

    map.addLayer(cluster);
    markersRef.current = markers;

    return () => {
      map.removeLayer(cluster);
      markersRef.current = new Map();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);

  useEffect(() => {
    if (!selectedId || !selectedId.startsWith("hub-")) return;
    const m = markersRef.current.get(selectedId);
    if (!m) return;
    const t = setTimeout(() => m.openPopup(), 80);
    return () => clearTimeout(t);
  }, [selectedId, signature]);

  return null;
}

function ViewSync({
  viewKey,
  center,
  zoom,
  suppressRef,
}: {
  viewKey: string;
  center: [number, number];
  zoom: number;
  suppressRef: React.MutableRefObject<boolean>;
}) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (lastKey.current === viewKey) return;
    lastKey.current = viewKey;
    suppressRef.current = true;
    map.setView(center, zoom, { animate: false });
    const t = setTimeout(() => {
      suppressRef.current = false;
    }, 400);
    return () => clearTimeout(t);
  }, [viewKey, center, zoom, map, suppressRef]);

  return null;
}

function FitToResults({
  locations,
  hubs,
  showHubs,
  fitToken,
  suppressRef,
}: {
  locations: PublicLocation[];
  hubs: MapHub[];
  showHubs: boolean;
  fitToken: number;
  suppressRef: React.MutableRefObject<boolean>;
}) {
  const map = useMap();
  const last = useRef(0);

  useEffect(() => {
    if (!fitToken || fitToken === last.current) return;
    last.current = fitToken;
    const pts: [number, number][] = [
      ...locations.map((l) => [l.latitude, l.longitude] as [number, number]),
      ...(showHubs ? hubs.map((h) => [h.latitude, h.longitude] as [number, number]) : []),
    ];
    if (!pts.length) return;

    suppressRef.current = true;
    map.fitBounds(L.latLngBounds(pts).pad(0.18), { maxZoom: 10, animate: true });
    const t = setTimeout(() => {
      suppressRef.current = false;
    }, 700);
    return () => clearTimeout(t);
  }, [fitToken, locations, hubs, showHubs, map, suppressRef]);

  return null;
}

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);
  return null;
}

export default function EcosystemMap({
  locations,
  hubs,
  showHubs,
  selectedId,
  onSelect,
  onSelectHub,
  onBoundsChange,
  viewKey,
  center,
  zoom,
  provinceSlug,
  boundaryMode,
  flyTarget,
  fitToken,
}: Props) {
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const suppressRef = useRef(false);

  useEffect(() => {
    if (boundaryMode === "none") {
      setGeo(null);
      return;
    }
    const type = boundaryMode === "municipalities" ? "municipalities" : "districts";
    const p = provinceSlug || "northern-cape";
    let cancelled = false;
    fetch(`/api/boundaries?type=${type}&province=${encodeURIComponent(p)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setGeo(data);
      })
      .catch(() => {
        if (!cancelled) setGeo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [boundaryMode, provinceSlug]);

  const style = useMemo(
    () => (feature?: GeoJSON.Feature) => {
      const props = (feature?.properties || {}) as {
        fill?: string;
        level?: string;
        source?: string;
      };
      const fill = props.fill || "#0f766e";
      const isMdb = props.source === "mdb";
      const isMun = boundaryMode === "municipalities" || props.level === "municipality";
      // Match book DistrictPinMap: thin dark borders, soft district fills
      return {
        color: "#1e293b",
        weight: isMun ? 1.1 : isMdb ? 2.0 : 1.8,
        opacity: 0.9,
        fillOpacity: isMun ? 0.42 : 0.38,
        fillColor: fill,
        lineJoin: "round" as const,
        lineCap: "round" as const,
      };
    },
    [boundaryMode]
  );

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="h-full w-full min-h-[420px]"
      scrollWheelZoom
      preferCanvas={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ResizeFix />
      <ViewSync viewKey={viewKey} center={center} zoom={zoom} suppressRef={suppressRef} />
      <BoundsWatcher onBoundsChange={onBoundsChange} suppressRef={suppressRef} />
      <FlyController flyTarget={flyTarget} suppressRef={suppressRef} />
      <FitToResults
        locations={locations}
        hubs={hubs}
        showHubs={showHubs}
        fitToken={fitToken}
        suppressRef={suppressRef}
      />
  {geo && (
        <GeoJSON
          key={`${boundaryMode}-${provinceSlug}`}
          data={geo}
          style={style}
          onEachFeature={(feature, layer) => {
            const props = feature.properties as {
              name?: string;
              district?: string;
              level?: string;
            };
            const label =
              props.level === "municipality" && props.district
                ? `${props.name} (${props.district})`
                : props.name;
            if (label) {
              layer.bindTooltip(label, {
                sticky: true,
                direction: "center",
                className: "district-tip",
              });
            }
          }}
        />
      )}
      <TownClusterLayer locations={locations} selectedId={selectedId} onSelect={onSelect} />
      {showHubs && hubs.length > 0 && (
        <HubClusterLayer hubs={hubs} selectedId={selectedId} onSelectHub={onSelectHub} />
      )}
    </MapContainer>
  );
}
