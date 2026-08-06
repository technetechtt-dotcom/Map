"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicLocation } from "@/lib/shape";
import { t, type Locale } from "@/lib/i18n";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MapHub } from "./EcosystemMap";

const EcosystemMap = dynamic(() => import("./EcosystemMap"), { ssr: false });

type Meta = {
  categories: { slug: string; name: string; color: string }[];
  provinces: {
    slug: string;
    name: string;
    code: string;
    centerLat: number;
    centerLng: number;
    defaultZoom: number;
  }[];
  districts: {
    code: string;
    name: string;
    municipalities: { code: string; name: string }[];
  }[];
};

type ListTab = "towns" | "hubs";

export default function MapExplorer({ locale = "en" }: { locale?: string }) {
  const searchParams = useSearchParams();
  const initialProvince = searchParams.get("province") || "northern-cape";
  const [meta, setMeta] = useState<Meta | null>(null);
  const [locations, setLocations] = useState<PublicLocation[]>([]);
  const [hubs, setHubs] = useState<MapHub[]>([]);
  const [showHubs, setShowHubs] = useState(true);
  const [listTab, setListTab] = useState<ListTab>("towns");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [province, setProvince] = useState(initialProvince);
  const [district, setDistrict] = useState("");
  const [category, setCategory] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [bounds, setBounds] = useState<string>("");
  const [boundaryMode, setBoundaryMode] = useState<"districts" | "municipalities" | "none">(
    "municipalities"
  );
  const [loading, setLoading] = useState(true);
  const [flyTarget, setFlyTarget] = useState<{
    id: string;
    lat: number;
    lng: number;
    token: number;
    zoom?: number;
  } | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [viewKey, setViewKey] = useState(initialProvince);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const flyToken = useRef(0);

  const L = (locale in { en: 1, af: 1, xh: 1, zu: 1 } ? locale : "en") as Locale;

  useEffect(() => {
    const p = province || "northern-cape";
    fetch(`/api/meta?province=${encodeURIComponent(p)}`)
      .then((r) => r.json())
      .then(setMeta)
      .catch(console.error);
  }, [province]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (province) params.set("province", province);
    if (district) params.set("district", district);
    if (category) params.set("category", category);
    if (verifiedOnly) params.set("verified", "1");
    if (searchVisible && bounds) params.set("bounds", bounds);

    const controller = new AbortController();
    setLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/locations?${params}`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.error || `Locations request failed (${r.status})`);
          }
          return r.json();
        })
        .then((data) => {
          const next: PublicLocation[] = data.locations || [];
          setLocations(next);
          const current = selectedIdRef.current;
          if (
            current &&
            !current.startsWith("hub-") &&
            !next.some((x) => x.id === current)
          ) {
            setSelectedId(null);
          }
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.error(err);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 280);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [q, province, district, category, verifiedOnly, bounds, searchVisible]);

  useEffect(() => {
    const params = new URLSearchParams({ map: "1" });
    if (q) params.set("q", q);
    if (province) params.set("province", province);

    const controller = new AbortController();
    const handle = setTimeout(() => {
      fetch(`/api/organisations?${params}`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error("Organisations request failed");
          return r.json();
        })
        .then((data) => {
          setHubs(data.hubs || []);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.error(err);
        });
    }, 280);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [q, province]);

  const selectedTown = useMemo(
    () => locations.find((l) => l.id === selectedId) || null,
    [locations, selectedId]
  );
  const selectedHub = useMemo(
    () => hubs.find((h) => h.id === selectedId) || null,
    [hubs, selectedId]
  );

  const hubsNearSelection = useMemo(() => {
    if (selectedTown) {
      return hubs.filter((h) => h.hostTown === selectedTown.slug);
    }
    return [];
  }, [hubs, selectedTown]);

  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-id="${selectedId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  const provMeta = meta?.provinces.find((p) => p.slug === province || p.code === province);
  const mapCenter: [number, number] = provMeta
    ? [provMeta.centerLat, provMeta.centerLng]
    : [-29, 21.5];
  const mapZoom = provMeta?.defaultZoom || 6;

  const selectFromList = useCallback((loc: PublicLocation) => {
    setSelectedId(loc.id);
    setListTab("towns");
    flyToken.current += 1;
    setFlyTarget({
      id: loc.id,
      lat: loc.latitude,
      lng: loc.longitude,
      token: flyToken.current,
    });
  }, []);

  const selectHubFromList = useCallback((hub: MapHub) => {
    setSelectedId(hub.id);
    setListTab("hubs");
    flyToken.current += 1;
    setFlyTarget({
      id: hub.id,
      lat: hub.latitude,
      lng: hub.longitude,
      token: flyToken.current,
      // Zoom in enough to leave cluster mode so fanned pins are each visible
      zoom: 15,
    });
  }, []);

  const selectFromMap = useCallback((id: string) => {
    setSelectedId(id);
    setListTab("towns");
  }, []);

  const selectHubFromMap = useCallback((id: string) => {
    setSelectedId(id);
    setListTab("hubs");
  }, []);

  const onBoundsChange = useCallback(
    (b: string) => {
      if (!searchVisible) return;
      setBounds((prev) => (prev === b ? prev : b));
    },
    [searchVisible]
  );

  function resetView() {
    setQ("");
    setDistrict("");
    setCategory("");
    setVerifiedOnly(false);
    setSearchVisible(false);
    setBounds("");
    setSelectedId(null);
    setShowHubs(true);
    setViewKey(`${province || "all"}-${Date.now()}`);
  }

  function fitResults() {
    setFitToken((n) => n + 1);
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col">
      <section className="grid gap-3 border-b border-line bg-white px-4 py-3 md:grid-cols-6 md:px-6">
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            {t(L, "search")}
          </span>
          <input
            className="field"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search towns, hubs or organisations…"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            {t(L, "province")}
          </span>
          <select
            className="field"
            value={province}
            onChange={(e) => {
              setProvince(e.target.value);
              setDistrict("");
              setBounds("");
              setViewKey(e.target.value || "all");
            }}
          >
            <option value="">All provinces</option>
            {(meta?.provinces || []).map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            {t(L, "district")}
          </span>
          <select className="field" value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">All districts</option>
            {(meta?.districts || []).map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            {t(L, "category")}
          </span>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {(meta?.categories || []).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showHubs}
              onChange={(e) => setShowHubs(e.target.checked)}
            />
            Show hubs &amp; organisations
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={searchVisible}
              onChange={(e) => {
                setSearchVisible(e.target.checked);
                if (!e.target.checked) setBounds("");
              }}
            />
            {t(L, "searchVisible")}
          </label>
        </div>
      </section>

      <div className="grid flex-1 lg:grid-cols-[minmax(320px,38%)_1fr]">
        <aside className="max-h-[50vh] overflow-y-auto border-r border-line bg-soft p-4 lg:max-h-[calc(100vh-180px)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="eyebrow">Browse</p>
              <h2 className="text-xl font-bold text-ink">Map directory</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="text-button text-sm font-bold text-g700" onClick={fitResults}>
                {t(L, "fitResults")}
              </button>
              <button type="button" className="text-button text-sm font-bold text-g700" onClick={resetView}>
                {t(L, "reset")}
              </button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`chip ${listTab === "towns" ? "chip-active" : ""}`}
              onClick={() => setListTab("towns")}
            >
              Towns ({loading ? "…" : locations.length})
            </button>
            <button
              type="button"
              className={`chip ${listTab === "hubs" ? "chip-active" : ""}`}
              onClick={() => setListTab("hubs")}
            >
              Hubs &amp; orgs ({hubs.length})
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className={`chip ${boundaryMode === "districts" ? "chip-active" : ""}`}
              onClick={() => setBoundaryMode("districts")}
            >
              Districts
            </button>
            <button
              type="button"
              className={`chip ${boundaryMode === "municipalities" ? "chip-active" : ""}`}
              onClick={() => setBoundaryMode("municipalities")}
            >
              Municipalities
            </button>
            <button
              type="button"
              className={`chip ${boundaryMode === "none" ? "chip-active" : ""}`}
              onClick={() => setBoundaryMode("none")}
            >
              No bounds
            </button>
          </div>

          <div className="mb-3 rounded-xl border border-line bg-white px-3 py-2 text-xs">
            <p className="mb-2 font-bold text-ink">Northern Cape districts</p>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { name: "Frances Baard", color: "#C9B3E0" },
                { name: "John Taolo Gaetsewe", color: "#8EC4E8" },
                { name: "Namakwa", color: "#E8C84A" },
                { name: "Pixley ka Seme", color: "#A8D08D" },
                { name: "ZF Mgcawu", color: "#7A9EAD" },
              ].map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-5 shrink-0 rounded-sm border border-black/10"
                    style={{ background: d.color }}
                  />
                  <span className="text-muted">{d.name}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-muted">
              Live map borders use the same MDB district/municipality shapes and colours as the
              opportunity book (municipalities.co.za palette). Tear-drop = towns · square ◎ = hubs.
            </p>
            <a
              className="mt-2 inline-block text-[10px] font-semibold text-g700"
              href="/maps/nc-district-municipalities-official.png"
              target="_blank"
              rel="noreferrer"
            >
              Open official district map (reference) →
            </a>
          </div>

          <div ref={listRef} className="grid gap-3">
            {listTab === "towns" &&
              locations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  data-id={loc.id}
                  onClick={() => selectFromList(loc)}
                  className={`location-card text-left ${selectedId === loc.id ? "is-active" : ""}`}
                  style={{ ["--category-color" as string]: loc.category.color }}
                >
                  <span className="card-icon" style={{ background: loc.category.color }}>
                    {loc.category.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-start justify-between gap-2">
                      <span>
                        <h3 className="card-title">{loc.name}</h3>
                        <p className="card-meta">
                          {loc.district?.name || loc.province.name}
                          {loc.municipality ? ` · ${loc.municipality.name}` : ""}
                        </p>
                      </span>
                      <span className="badge" style={{ color: loc.category.color }}>
                        {loc.category.name}
                      </span>
                    </span>
                    <p className="card-summary">{loc.summary}</p>
                    <p className="mt-1 text-xs font-semibold text-g700">
                      {hubs.filter((h) => h.hostTown === loc.slug).length} key contacts / hubs nearby
                    </p>
                    <Link
                      href={`/locations/${loc.slug}`}
                      className="mt-2 inline-block text-sm font-semibold text-g700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t(L, "viewProfile")} →
                    </Link>
                  </span>
                </button>
              ))}

            {listTab === "hubs" &&
              hubs.map((hub) => (
                <button
                  key={hub.id}
                  type="button"
                  data-id={hub.id}
                  onClick={() => selectHubFromList(hub)}
                  className={`location-card text-left ${selectedId === hub.id ? "is-active" : ""}`}
                  style={{ ["--category-color" as string]: hub.color }}
                >
                  <span className="card-icon hub-card-icon" style={{ background: hub.color }}>
                    ◎
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-start justify-between gap-2">
                      <span>
                        <h3 className="card-title">{hub.name}</h3>
                        <p className="card-meta">
                          {hub.type}
                          {hub.hostTownName ? ` · ${hub.hostTownName}` : ""}
                        </p>
                      </span>
                      <span className="badge" style={{ color: hub.color }}>
                        Hub
                      </span>
                    </span>
                    {hub.address && (
                      <p className="mt-1 text-xs text-muted">{hub.address}</p>
                    )}
                    {hub.description && <p className="card-summary">{hub.description}</p>}
                    <span className="chip-row">
                      {hub.email && <span className="chip">{hub.email}</span>}
                      {hub.phone && <span className="chip">{hub.phone}</span>}
                    </span>
                    <Link
                      href={`/org/${hub.slug}`}
                      className="mt-2 inline-block text-sm font-semibold text-g700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Organisation profile →
                    </Link>
                  </span>
                </button>
              ))}

            {listTab === "towns" && !loading && locations.length === 0 && (
              <div className="empty-state">{t(L, "noResults")}</div>
            )}
            {listTab === "hubs" && hubs.length === 0 && (
              <div className="empty-state">No hubs match the current search.</div>
            )}
          </div>
        </aside>

        <section className="relative min-h-[420px] lg:min-h-[calc(100vh-180px)]">
          <EcosystemMap
            locations={locations}
            hubs={hubs}
            showHubs={showHubs}
            selectedId={selectedId}
            onSelect={selectFromMap}
            onSelectHub={selectHubFromMap}
            onBoundsChange={onBoundsChange}
            viewKey={viewKey}
            center={mapCenter}
            zoom={mapZoom}
            provinceSlug={province || "northern-cape"}
            boundaryMode={boundaryMode}
            flyTarget={flyTarget}
            fitToken={fitToken}
          />
          {selectedTown && (
            <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-[500] max-w-xl rounded-xl border border-line bg-white/95 p-3 text-sm shadow-soft md:right-auto">
              <p className="font-bold text-g700">{selectedTown.category.name}</p>
              <p className="text-base font-semibold">{selectedTown.name}</p>
              <p className="text-muted">{selectedTown.summary}</p>
              {hubsNearSelection.length > 0 && (
                <div className="mt-2 border-t border-line pt-2">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                    Key contacts nearby
                  </p>
                  <ul className="max-h-28 space-y-1 overflow-y-auto text-xs">
                    {hubsNearSelection.slice(0, 8).map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          className="text-left font-semibold text-g700 hover:underline"
                          onClick={() => selectHubFromList(h)}
                        >
                          {h.name}
                        </button>
                        {h.email ? ` · ${h.email}` : ""}
                        {h.phone ? ` · ${h.phone}` : ""}
                      </li>
                    ))}
                  </ul>
                  {hubsNearSelection.length > 8 && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-semibold text-g700"
                      onClick={() => setListTab("hubs")}
                    >
                      View all {hubsNearSelection.length} hubs →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {selectedHub && (
            <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-[500] max-w-xl rounded-xl border border-line bg-white/95 p-3 text-sm shadow-soft md:right-auto">
              <p className="font-bold text-g700">Hub / organisation · {selectedHub.type}</p>
              <p className="text-base font-semibold">{selectedHub.name}</p>
              {selectedHub.address ? (
                <p className="text-muted">{selectedHub.address}</p>
              ) : (
                selectedHub.hostTownName && <p className="text-muted">{selectedHub.hostTownName}</p>
              )}
              <p className="text-xs text-muted">
                {selectedHub.latitude.toFixed(5)}, {selectedHub.longitude.toFixed(5)} (WGS84)
              </p>
              {selectedHub.email && <p className="mt-1">{selectedHub.email}</p>}
              {selectedHub.phone && <p>{selectedHub.phone}</p>}
              <Link href={`/org/${selectedHub.slug}`} className="mt-2 inline-block font-semibold text-g700">
                Open profile →
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
