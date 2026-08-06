/**
 * Crop the official municipalities.co.za NC map into per-district sheets.
 *
 * Source is only ~800×743, so crops are supersampled (multi-pass Lanczos) so
 * book/print display is not blocky. Labels stay limited by source resolution —
 * DistrictPinMap overlays crisp municipality names on top of the basemap.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "public", "maps", "nc-district-municipalities-official.png");
const OUT_DIR = path.join(ROOT, "public", "maps", "districts");

/** Supersample factor applied to the full map before extract (max 6). */
const HIRES_SCALE = 5;

/** Georeference of the full PNG map body (native 800×743 pixels) */
const GEO = {
  west: 16.25,
  east: 25.55,
  north: -26.3,
  south: -32.55,
};
const CONTENT = { left: 2, top: 2, right: 798, bottom: 738 };
const NATIVE_W = 800;
const NATIVE_H = 743;

/**
 * Pixel crops on the native 800×743 source.
 * Municipality label anchors are fractions (nx, ny) of the crop rect
 * and match municipalities.co.za placement.
 */
const MANUAL_CROPS = {
  DC9: {
    slug: "frances-baard",
    name: "Frances Baard",
    color: "#C9B3E0",
    left: 625,
    top: 140,
    width: 172,
    height: 265,
    labels: [
      { name: "PHOKWANE", nx: 0.62, ny: 0.18 },
      { name: "MAGARENG", nx: 0.58, ny: 0.42 },
      { name: "DIKGATLONG", nx: 0.22, ny: 0.48 },
      { name: "SOL PLAATJE", nx: 0.52, ny: 0.78 },
    ],
  },
  DC45: {
    slug: "john-taolo-gaetsewe",
    name: "John Taolo Gaetsewe",
    color: "#8EC4E8",
    left: 515,
    top: 18,
    width: 200,
    height: 185,
    labels: [
      { name: "JOE MOROLONG", nx: 0.42, ny: 0.28 },
      { name: "GA-SEGONYANA", nx: 0.72, ny: 0.55 },
      { name: "GAMAGARA", nx: 0.48, ny: 0.78 },
    ],
  },
  DC6: {
    slug: "namakwa",
    name: "Namakwa",
    color: "#E8C84A",
    left: 4,
    top: 95,
    width: 410,
    height: 635,
    labels: [
      { name: "RICHTERSVELD", nx: 0.18, ny: 0.12 },
      { name: "NAMA KHOI", nx: 0.28, ny: 0.32 },
      { name: "KAMIESBERG", nx: 0.22, ny: 0.48 },
      { name: "HANTAM", nx: 0.48, ny: 0.55 },
      { name: "KAROO HOOGLAND", nx: 0.62, ny: 0.72 },
      { name: "KHÂI-MA", nx: 0.55, ny: 0.28 },
    ],
  },
  DC7: {
    slug: "pixley-ka-seme",
    name: "Pixley ka Seme",
    color: "#A8D08D",
    left: 400,
    top: 300,
    width: 395,
    height: 430,
    labels: [
      { name: "SIYANCUMA", nx: 0.55, ny: 0.22 },
      { name: "THEMBELIHLE", nx: 0.42, ny: 0.38 },
      { name: "SIYATHEMBA", nx: 0.68, ny: 0.42 },
      { name: "EMTHANJENI", nx: 0.55, ny: 0.55 },
      { name: "RENOSTERBERG", nx: 0.72, ny: 0.58 },
      { name: "UBUNTU", nx: 0.38, ny: 0.68 },
      { name: "UMSOBOMVU", nx: 0.78, ny: 0.72 },
      { name: "KAREEBERG", nx: 0.28, ny: 0.78 },
    ],
  },
  DC8: {
    slug: "zf-mgcawu",
    name: "ZF Mgcawu",
    color: "#7A9EAD",
    left: 270,
    top: 35,
    width: 380,
    height: 310,
    labels: [
      { name: "DAWID KRUIPER", nx: 0.38, ny: 0.28 },
      { name: "!KHARA HAIS", nx: 0.48, ny: 0.42 },
      { name: "!KHEIS", nx: 0.55, ny: 0.58 },
      { name: "TSANTSABANE", nx: 0.72, ny: 0.48 },
      { name: "KGATELOPELE", nx: 0.82, ny: 0.35 },
      { name: "KAI !GARIB", nx: 0.22, ny: 0.52 },
    ],
  },
};

function pxToLngLat(x, y, imgW, imgH) {
  const left = (CONTENT.left / NATIVE_W) * imgW;
  const right = (CONTENT.right / NATIVE_W) * imgW;
  const top = (CONTENT.top / NATIVE_H) * imgH;
  const bottom = (CONTENT.bottom / NATIVE_H) * imgH;
  const lng = GEO.west + ((x - left) / (right - left)) * (GEO.east - GEO.west);
  const lat = GEO.north - ((y - top) / (bottom - top)) * (GEO.north - GEO.south);
  return { lng, lat };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(SRC)) {
    throw new Error(`Missing source map: ${SRC}`);
  }

  const meta = await sharp(SRC).metadata();
  const srcW = meta.width || NATIVE_W;
  const srcH = meta.height || NATIVE_H;
  const scale = HIRES_SCALE;

  console.log(`Source ${srcW}×${srcH} → supersample ×${scale}`);

  // Multi-pass upsample of full province map (sharper than single huge jump)
  let pipeline = sharp(SRC).resize(Math.round(srcW * 2), Math.round(srcH * 2), {
    kernel: sharp.kernel.lanczos3,
  });
  if (scale >= 4) {
    pipeline = sharp(await pipeline.png().toBuffer()).resize(
      Math.round(srcW * scale),
      Math.round(srcH * scale),
      { kernel: sharp.kernel.lanczos3 }
    );
  } else if (scale !== 2) {
    pipeline = sharp(await pipeline.png().toBuffer()).resize(
      Math.round(srcW * scale),
      Math.round(srcH * scale),
      { kernel: sharp.kernel.lanczos3 }
    );
  }

  const hires = await pipeline.png().toBuffer();
  const hiW = Math.round(srcW * scale);
  const hiH = Math.round(srcH * scale);
  const pad = 24;

  const manifest = {
    source: "/maps/nc-district-municipalities-official.png",
    attribution: "© municipalities.co.za — Northern Cape district & local municipalities",
    sourceGeo: GEO,
    contentBox: CONTENT,
    imageWidth: srcW,
    imageHeight: srcH,
    hiresScale: scale,
    districts: {},
  };

  for (const [code, d] of Object.entries(MANUAL_CROPS)) {
    // Crops defined on native 800×743; scale to actual source then hires
    const nScaleX = srcW / NATIVE_W;
    const nScaleY = srcH / NATIVE_H;
    const left = Math.round(d.left * nScaleX * scale);
    const top = Math.round(d.top * nScaleY * scale);
    const width = Math.round(d.width * nScaleX * scale);
    const height = Math.round(d.height * nScaleY * scale);

    const outPath = path.join(OUT_DIR, `${d.slug}.png`);
    await sharp(hires)
      .extract({
        left: Math.max(0, left),
        top: Math.max(0, top),
        width: Math.min(width, hiW - left),
        height: Math.min(height, hiH - top),
      })
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png({ compressionLevel: 6, quality: 100 })
      .toFile(outPath);

    // Geo envelope from native crop rect (independent of supersample)
    const nLeft = d.left * nScaleX;
    const nTop = d.top * nScaleY;
    const nW = d.width * nScaleX;
    const nH = d.height * nScaleY;
    const nw = pxToLngLat(nLeft, nTop, srcW, srcH);
    const se = pxToLngLat(nLeft + nW, nTop + nH, srcW, srcH);
    const geo = {
      west: Math.min(nw.lng, se.lng),
      east: Math.max(nw.lng, se.lng),
      north: Math.max(nw.lat, se.lat),
      south: Math.min(nw.lat, se.lat),
    };

    const labels = (d.labels || []).map((lb) => ({
      name: lb.name,
      // Position in paint area (with pad)
      x: pad + lb.nx * width,
      y: pad + lb.ny * height,
    }));

    manifest.districts[code] = {
      slug: d.slug,
      name: d.name,
      color: d.color,
      path: `/maps/districts/${d.slug}.png`,
      crop: { left: nLeft, top: nTop, width: nW, height: nH },
      geo,
      paintInset: { left: pad, top: pad, width, height },
      imageWidth: width + pad * 2,
      imageHeight: height + pad * 2,
      labels,
    };

    console.log(`${d.slug}: ${width}×${height} hires @ native (${d.left},${d.top}) ${d.width}×${d.height}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, "districts-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("Wrote districts-manifest.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
