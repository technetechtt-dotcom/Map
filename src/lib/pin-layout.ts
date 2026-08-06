/**
 * Fan out near-duplicate WGS84 points so markers remain individually visible.
 * True coordinates should still be shown in labels/popups (pass original lat/lng).
 */

export type GeoPoint = { latitude: number; longitude: number };

/** Group key ~110m cell (0.001°) */
export function cellKey(lat: number, lng: number, precision = 3): string {
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
}

export function pinClusterSpan(items: GeoPoint[]): {
  spanDeg: number;
  centerLat: number;
  centerLng: number;
} {
  if (!items.length) return { spanDeg: 0, centerLat: 0, centerLng: 0 };
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  let sLat = 0,
    sLng = 0;
  for (const p of items) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
    sLat += p.latitude;
    sLng += p.longitude;
  }
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.max(0.55, Math.cos((midLat * Math.PI) / 180));
  const spanLat = maxLat - minLat;
  const spanLng = (maxLng - minLng) * cosLat;
  return {
    spanDeg: Math.max(spanLat, spanLng, 0.0001),
    centerLat: sLat / items.length,
    centerLng: sLng / items.length,
  };
}

/**
 * Spread points onto a readable circle when they sit on top of each other
 * (or all sit in one tight town cluster).
 *
 * @param radiusDeg base radius in degrees (~0.004 ≈ 400 m)
 * @param tightSpanDeg if whole set fits within this span, spider ALL around centroid
 */
export function layoutSpiralOffsets<T extends GeoPoint>(
  items: T[],
  options?: { radiusDeg?: number; precision?: number; tightSpanDeg?: number }
): (T & { displayLat: number; displayLng: number; wasSpread: boolean })[] {
  const radiusDeg = options?.radiusDeg ?? 0.0045;
  const precision = options?.precision ?? 3;
  const tightSpanDeg = options?.tightSpanDeg ?? 0.12; // ~13 km

  if (items.length <= 1) {
    return items.map((item) => ({
      ...item,
      displayLat: item.latitude,
      displayLng: item.longitude,
      wasSpread: false,
    }));
  }

  const cluster = pinClusterSpan(items);

  // Dense town cluster (e.g. Kimberley CBD contacts): fan EVERY pin around centroid
  if (cluster.spanDeg <= tightSpanDeg) {
    const n = items.length;
    // Circle large enough that each pin separates clearly on a zoomed book map
    const radius = Math.max(radiusDeg, 0.005 * Math.sqrt(n), 0.01);
    const cosLat = Math.cos((cluster.centerLat * Math.PI) / 180) || 0.9;
    return items.map((item, order) => {
      const angle = (order / n) * Math.PI * 2 - Math.PI / 2;
      // Rings if many pins
      const ring = Math.floor(order / 10);
      const r = radius * (1 + ring * 0.55);
      return {
        ...item,
        displayLat: cluster.centerLat + Math.sin(angle) * r,
        displayLng: cluster.centerLng + (Math.cos(angle) * r) / cosLat,
        wasSpread: true,
      };
    });
  }

  // Otherwise only group near-identical cells
  const groups = new Map<string, number[]>();
  items.forEach((item, idx) => {
    const key = cellKey(item.latitude, item.longitude, precision);
    const list = groups.get(key) || [];
    list.push(idx);
    groups.set(key, list);
  });

  const assigned = new Array(items.length).fill(-1);
  let groupId = 0;
  Array.from(groups.values()).forEach((idxs) => {
    if (idxs.length === 0) return;
    let gid = idxs.map((i: number) => assigned[i]).find((g: number) => g >= 0);
    if (gid === undefined) gid = groupId++;
    for (const i of idxs) assigned[i] = gid;
  });

  const byGroup = new Map<number, number[]>();
  assigned.forEach((g, i) => {
    if (g < 0) return;
    const list = byGroup.get(g) || [];
    list.push(i);
    byGroup.set(g, list);
  });

  return items.map((item, idx) => {
    const g = assigned[idx];
    const members = byGroup.get(g) || [idx];
    if (members.length === 1) {
      return {
        ...item,
        displayLat: item.latitude,
        displayLng: item.longitude,
        wasSpread: false,
      };
    }
    const order = members.indexOf(idx);
    const n = members.length;
    const radius = radiusDeg * (0.85 + Math.floor(order / 8) * 0.55 + Math.min(n, 8) * 0.08);
    const angle = (order / n) * Math.PI * 2 - Math.PI / 2;
    const cosLat = Math.cos((item.latitude * Math.PI) / 180) || 0.9;
    return {
      ...item,
      displayLat: item.latitude + Math.sin(angle) * radius,
      displayLng: item.longitude + (Math.cos(angle) * radius) / cosLat,
      wasSpread: true,
    };
  });
}

export type PixelPlacedPin<T> = T & {
  originX: number;
  originY: number;
  x: number;
  y: number;
  wasSpread: boolean;
};

export type AlignedLabel = {
  n: number;
  text: string;
  pinX: number;
  pinY: number;
  /** Left edge of label stack (all share same x for alignment) */
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  /** Text baseline */
  textX: number;
  textY: number;
};

/**
 * Align pin names in a single vertical column with room for every label.
 * Picks left or right of the pin cluster based on free map space.
 */
export function layoutAlignedPinLabels(
  pins: { n: number; short: string; x: number; y: number }[],
  options: { width: number; height: number; pinRadius?: number; pad?: number }
): AlignedLabel[] {
  if (!pins.length) return [];

  const pad = options.pad ?? 16;
  const pinR = options.pinRadius ?? 13;
  const boxH = 18;
  const rowGap = 4;
  const row = boxH + rowGap;
  const charW = 6.1;
  const gapFromPins = 28;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of pins) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const maxTextW = Math.max(...pins.map((p) => Math.min(p.short.length * charW + 10, 160)));
  const boxW = maxTextW + 8;
  const stackH = pins.length * row - rowGap;

  const roomRight = options.width - pad - (maxX + pinR);
  const roomLeft = minX - pinR - pad;
  const onRight = roomRight >= roomLeft && roomRight >= boxW + gapFromPins;

  const boxX = onRight
    ? Math.min(options.width - pad - boxW, maxX + pinR + gapFromPins)
    : Math.max(pad, minX - pinR - gapFromPins - boxW);

  // Vertical centre of stack on cluster, then clamp into frame
  let stackTop = (minY + maxY) / 2 - stackH / 2;
  stackTop = Math.max(pad, Math.min(options.height - pad - stackH, stackTop));

  // Sort by pin Y so leaders don’t cross as much
  const ordered = [...pins].sort((a, b) => a.y - b.y || a.n - b.n);

  return ordered.map((p, i) => {
    const boxY = stackTop + i * row;
    const textX = boxX + 6;
    const textY = boxY + boxH * 0.72;
    return {
      n: p.n,
      text: p.short,
      pinX: p.x,
      pinY: p.y,
      boxX,
      boxY,
      boxW,
      boxH,
      textX,
      textY,
    };
  });
}

/**
 * Space pins in *screen* coordinates so every marker is readable on a full
 * district map (geo spiral alone is invisible when towns are small on the sheet).
 */
export function layoutPinsInPixels<T extends { latitude: number; longitude: number }>(
  items: T[],
  project: (lng: number, lat: number) => { x: number; y: number },
  options?: { minSepPx?: number; padPx?: number; width?: number; height?: number }
): PixelPlacedPin<T>[] {
  const minSep = options?.minSepPx ?? 42;
  const pad = options?.padPx ?? 28;
  const width = options?.width ?? 820;
  const height = options?.height ?? 520;

  if (!items.length) return [];

  const base = items.map((item) => {
    const p = project(item.longitude, item.latitude);
    return {
      ...item,
      originX: p.x,
      originY: p.y,
      x: p.x,
      y: p.y,
      wasSpread: false,
    };
  });

  if (base.length === 1) return base;

  // Union-find clusters: link points closer than ~2× min separation
  const parent = base.map((_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const linkDist = minSep * 2.2;
  for (let i = 0; i < base.length; i++) {
    for (let j = i + 1; j < base.length; j++) {
      const dx = base[i].originX - base[j].originX;
      const dy = base[i].originY - base[j].originY;
      if (Math.hypot(dx, dy) < linkDist) unite(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  base.forEach((_, i) => {
    const r = find(i);
    const list = groups.get(r) || [];
    list.push(i);
    groups.set(r, list);
  });

  Array.from(groups.values()).forEach((idxs) => {
    if (idxs.length < 2) return;

    let cx = 0;
    let cy = 0;
    for (const i of idxs) {
      cx += base[i].originX;
      cy += base[i].originY;
    }
    cx /= idxs.length;
    cy /= idxs.length;

    const n = idxs.length;
    // Radius so chord length ≈ minSep around the circle
    const radius = Math.max(minSep * 1.05, (minSep * n) / (2 * Math.PI) + minSep * 0.35);
    // Extra ring for large clusters
    idxs.forEach((i: number, order: number) => {
      const ring = Math.floor(order / 8);
      const inRing = order % 8;
      const countOnRing = Math.min(8, n - ring * 8);
      const r = radius * (1 + ring * 0.85);
      const angle = (inRing / Math.max(countOnRing, 1)) * Math.PI * 2 - Math.PI / 2;
      // Offset start per ring so pins don't stack radially
      const a = angle + ring * 0.35;
      let x = cx + Math.cos(a) * r;
      let y = cy + Math.sin(a) * r;
      x = Math.max(pad, Math.min(width - pad, x));
      y = Math.max(pad, Math.min(height - pad, y));
      base[i].x = x;
      base[i].y = y;
      base[i].wasSpread = true;
    });
  });

  // Second pass: push any remaining pairwise overlaps (different clusters)
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < base.length; i++) {
      for (let j = i + 1; j < base.length; j++) {
        const dx = base[j].x - base[i].x;
        const dy = base[j].y - base[i].y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d >= minSep) continue;
        const push = (minSep - d) / 2 + 1;
        const ux = dx / d;
        const uy = dy / d;
        base[i].x = Math.max(pad, Math.min(width - pad, base[i].x - ux * push));
        base[i].y = Math.max(pad, Math.min(height - pad, base[i].y - uy * push));
        base[j].x = Math.max(pad, Math.min(width - pad, base[j].x + ux * push));
        base[j].y = Math.max(pad, Math.min(height - pad, base[j].y + uy * push));
        base[i].wasSpread = true;
        base[j].wasSpread = true;
      }
    }
  }

  return base;
}

/** Bounds that tightly frame display positions (auto-zoom for book maps). */
export function boundsAroundPoints(
  points: { lat: number; lng: number }[],
  options?: { minSpanDeg?: number; padRatio?: number }
): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  const minSpanDeg = options?.minSpanDeg ?? 0.035;
  const padRatio = options?.padRatio ?? 0.28;

  if (!points.length) {
    return { minLng: 16.5, maxLng: 25.5, minLat: -32.5, maxLat: -26.5 };
  }

  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }

  let spanLat = Math.max(maxLat - minLat, minSpanDeg);
  let spanLng = Math.max(maxLng - minLng, minSpanDeg);
  // square-ish frame
  if (spanLat < spanLng) spanLat = spanLng;
  else spanLng = spanLat;

  const cLat = (minLat + maxLat) / 2;
  const cLng = (minLng + maxLng) / 2;
  const halfLat = (spanLat / 2) * (1 + padRatio);
  const halfLng = (spanLng / 2) * (1 + padRatio);

  return {
    minLat: cLat - halfLat,
    maxLat: cLat + halfLat,
    minLng: cLng - halfLng,
    maxLng: cLng + halfLng,
  };
}
