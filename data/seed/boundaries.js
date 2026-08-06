/**
 * Northern Cape district & local municipality envelopes aligned to the
 * municipalities.co.za district–municipality map (official layout reference).
 *
 * Geometry remains generalised for UX/print (not cadastral MDB parcels).
 * Use public/maps/nc-district-municipalities-official.png as visual authority.
 *
 * Legend colours (reference map):
 *   Frances Baard          #C9B3E0
 *   John Taolo Gaetsewe    #8EC4E8
 *   Namakwa                #E8C84A
 *   Pixley ka Seme         #A8D08D
 *   ZF Mgcawu              #7A9EAD
 */

function ring(points) {
  const closed =
    points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]
      ? points
      : points.concat([points[0]]);
  return [closed];
}

function poly(name, code, color, points, extra = {}) {
  return {
    type: "Feature",
    properties: { name, code, fill: color, ...extra },
    geometry: { type: "Polygon", coordinates: ring(points) },
  };
}

/** District fills — shapes track the official 5-district provincial layout */
const DISTRICT = {
  FB: "#C9B3E0",
  JTG: "#8EC4E8",
  NAM: "#E8C84A",
  PKS: "#A8D08D",
  ZFM: "#7A9EAD",
};

const ncDistricts = {
  type: "FeatureCollection",
  features: [
    // Yellow west — coastline, Richtersveld → Karoo Hoogland
    poly(
      "Namakwa",
      "DC6",
      DISTRICT.NAM,
      [
        [16.45, -28.55],
        [17.1, -28.25],
        [18.05, -28.2],
        [18.95, -28.45],
        [19.55, -28.95],
        [20.1, -29.55],
        [20.65, -30.25],
        [21.05, -30.95],
        [21.15, -31.65],
        [20.85, -32.35],
        [20.15, -32.55],
        [19.15, -32.45],
        [18.25, -32.05],
        [17.35, -31.35],
        [16.75, -30.45],
        [16.4, -29.55],
        [16.35, -28.85],
      ],
      { district: "Namakwa", legendOrder: 3 }
    ),

    // Teal centre-north — Dawid Kruiper block + Orange River west arm
    poly(
      "ZF Mgcawu",
      "DC8",
      DISTRICT.ZFM,
      [
        [19.0, -26.55],
        [20.4, -26.4],
        [21.7, -26.5],
        [22.65, -26.85],
        [23.45, -27.35],
        [23.7, -27.95],
        [23.45, -28.55],
        [22.75, -29.05],
        [21.85, -29.4],
        [20.85, -29.55],
        [19.95, -29.35],
        [19.15, -28.85],
        [18.75, -28.15],
        [18.65, -27.35],
        [18.85, -26.75],
      ],
      { district: "ZF Mgcawu", legendOrder: 5 }
    ),

    // Blue north — Joe Morolong / Ga-Segonyana / Gamagara
    poly(
      "John Taolo Gaetsewe",
      "DC45",
      DISTRICT.JTG,
      [
        [21.55, -26.55],
        [22.55, -26.4],
        [23.55, -26.45],
        [24.15, -26.7],
        [24.25, -27.15],
        [24.0, -27.65],
        [23.45, -28.05],
        [22.75, -28.2],
        [22.1, -28.05],
        [21.6, -27.55],
        [21.45, -27.0],
      ],
      { district: "John Taolo Gaetsewe", legendOrder: 2 }
    ),

    // Purple far east — Kimberley capital district (small)
    poly(
      "Frances Baard",
      "DC9",
      DISTRICT.FB,
      [
        [24.05, -27.55],
        [24.65, -27.45],
        [25.15, -27.55],
        [25.4, -27.9],
        [25.45, -28.35],
        [25.25, -28.8],
        [24.9, -29.1],
        [24.4, -29.2],
        [24.0, -28.95],
        [23.85, -28.5],
        [23.9, -28.0],
        [24.05, -27.7],
      ],
      { district: "Frances Baard", legendOrder: 1 }
    ),

    // Green south/southeast — Karoo to Umsobomvu
    poly(
      "Pixley ka Seme",
      "DC7",
      DISTRICT.PKS,
      [
        [21.1, -29.5],
        [22.15, -29.35],
        [23.25, -29.25],
        [24.2, -29.3],
        [24.95, -29.5],
        [25.4, -29.85],
        [25.5, -30.5],
        [25.35, -31.25],
        [24.75, -31.85],
        [23.9, -32.3],
        [22.95, -32.4],
        [22.0, -32.25],
        [21.3, -31.75],
        [20.95, -31.05],
        [20.85, -30.35],
        [20.95, -29.8],
      ],
      { district: "Pixley ka Seme", legendOrder: 4 }
    ),
  ],
};

/**
 * Local municipalities nested under districts (names match official map labels).
 * Relative placement follows municipalities.co.za NC map.
 */
const ncMunicipalities = {
  type: "FeatureCollection",
  features: [
    // —— Frances Baard (purple east) ——
    // Sol Plaatje south of district (Kimberley)
    poly("Sol Plaatje", "NC091", "#B89CD4", [
      [24.5, -29.05],
      [25.05, -29.0],
      [25.15, -28.55],
      [24.75, -28.45],
      [24.45, -28.65],
      [24.45, -28.95],
    ], { districtCode: "DC9", district: "Frances Baard" }),
    // Dikgatlong west of Sol Plaatje
    poly("Dikgatlong", "NC092", "#C5AEDB", [
      [24.05, -28.95],
      [24.55, -28.95],
      [24.55, -28.45],
      [24.2, -28.3],
      [24.0, -28.55],
    ], { districtCode: "DC9", district: "Frances Baard" }),
    // Magareng central-east
    poly("Magareng", "NC093", "#D1BFE3", [
      [24.7, -28.55],
      [25.2, -28.5],
      [25.3, -28.05],
      [24.9, -27.95],
      [24.6, -28.15],
    ], { districtCode: "DC9", district: "Frances Baard" }),
    // Phokwane north
    poly("Phokwane", "NC094", "#DCCFEA", [
      [24.5, -28.15],
      [25.15, -28.1],
      [25.3, -27.55],
      [24.75, -27.5],
      [24.4, -27.8],
    ], { districtCode: "DC9", district: "Frances Baard" }),

    // —— John Taolo Gaetsewe (blue north) ——
    poly("Joe Morolong", "NC451", "#6BA9D4", [
      [21.55, -27.45],
      [22.95, -27.25],
      [23.65, -26.7],
      [22.85, -26.5],
      [21.65, -26.65],
    ], { districtCode: "DC45", district: "John Taolo Gaetsewe" }),
    poly("Ga-Segonyana", "NC452", "#86BCE0", [
      [23.05, -27.85],
      [23.9, -27.7],
      [24.05, -27.15],
      [23.35, -26.95],
      [22.95, -27.35],
    ], { districtCode: "DC45", district: "John Taolo Gaetsewe" }),
    poly("Gamagara", "NC453", "#A0CEE9", [
      [22.55, -28.15],
      [23.5, -28.05],
      [23.6, -27.45],
      [22.95, -27.3],
      [22.45, -27.7],
    ], { districtCode: "DC45", district: "John Taolo Gaetsewe" }),

    // —— ZF Mgcawu (teal centre-north) ——
    // Dawid Kruiper large northern block (Upington area)
    poly("Dawid Kruiper", "NC086", "#688999", [
      [19.1, -28.35],
      [21.35, -28.05],
      [21.75, -26.7],
      [20.1, -26.5],
      [19.0, -27.15],
    ], { districtCode: "DC8", district: "ZF Mgcawu" }),
    poly("Kai !Garib", "NC082", "#7A98A6", [
      [19.35, -29.35],
      [20.95, -29.2],
      [21.25, -28.4],
      [19.95, -28.3],
      [19.25, -28.7],
    ], { districtCode: "DC8", district: "ZF Mgcawu" }),
    poly("!Kheis", "NC083", "#8BA7B3", [
      [20.95, -29.4],
      [22.25, -29.2],
      [22.45, -28.55],
      [21.45, -28.4],
      [20.9, -28.8],
    ], { districtCode: "DC8", district: "ZF Mgcawu" }),
    // Tsantsabane = Postmasburg south-east of ZF
    poly("Tsantsabane", "NC085", "#9BB5C0", [
      [22.35, -28.85],
      [23.5, -28.55],
      [23.55, -27.75],
      [22.65, -27.75],
      [22.25, -28.25],
    ], { districtCode: "DC8", district: "ZF Mgcawu" }),
    poly("Kgatelopele", "NC084", "#ACC4CD", [
      [23.1, -28.55],
      [23.65, -28.5],
      [23.65, -28.1],
      [23.2, -28.05],
    ], { districtCode: "DC8", district: "ZF Mgcawu" }),

    // —— Pixley ka Seme (green south) ——
    poly("Siyancuma", "NC071", "#8FC078", [
      [22.85, -29.7],
      [24.05, -29.55],
      [24.2, -28.95],
      [23.15, -28.95],
      [22.85, -29.3],
    ], { districtCode: "DC7", district: "Pixley ka Seme" }),
    poly("Thembelihle", "NC072", "#9BC986", [
      [23.9, -30.1],
      [24.6, -29.95],
      [24.65, -29.45],
      [24.05, -29.4],
    ], { districtCode: "DC7", district: "Pixley ka Seme" }),
    poly("Emthanjeni", "NC073", "#A7D194", [
      [23.5, -31.2],
      [24.65, -31.05],
      [24.75, -30.25],
      [23.7, -30.15],
    ], { districtCode: "DC7", district: "Pixley ka Seme" }),
    poly("Kareeberg", "NC074", "#B3D9A2", [
      [21.35, -31.4],
      [22.75, -31.25],
      [22.9, -30.5],
      [21.55, -30.5],
    ], { districtCode: "DC7", district: "Pixley ka Seme" }),
    poly("Umsobomvu", "NC075", "#BFE1B0", [
      [24.6, -31.4],
      [25.45, -31.2],
      [25.45, -30.35],
      [24.7, -30.35],
    ], { districtCode: "DC7", district: "Pixley ka Seme" }),
    poly("Renosterberg", "NC076", "#97C37F", [
      [24.2, -30.6],
      [25.1, -30.45],
      [25.15, -29.85],
      [24.3, -29.8],
    ], { districtCode: "DC7", district: "Pixley ka Seme" }),
    poly("Siyathemba", "NC077", "#86B56E", [
      [22.0, -30.4],
      [23.25, -30.2],
      [23.35, -29.45],
      [22.15, -29.5],
    ], { districtCode: "DC7", district: "Pixley ka Seme" }),
    poly("Ubuntu", "NC078", "#A3CD8F", [
      [22.35, -32.2],
      [23.9, -32.05],
      [24.0, -31.25],
      [22.45, -31.2],
    ], { districtCode: "DC7", district: "Pixley ka Seme" }),

    // —— Namakwa (yellow west) ——
    poly("Richtersveld", "NC061", "#D9B638", [
      [16.5, -29.4],
      [17.55, -29.15],
      [17.6, -28.3],
      [16.55, -28.4],
    ], { districtCode: "DC6", district: "Namakwa" }),
    poly("Nama Khoi", "NC062", "#E0C04F", [
      [17.25, -30.2],
      [18.6, -30.0],
      [18.65, -29.1],
      [17.4, -29.15],
    ], { districtCode: "DC6", district: "Namakwa" }),
    poly("Kamiesberg", "NC064", "#E6CA66", [
      [17.35, -31.1],
      [18.75, -30.95],
      [18.8, -30.1],
      [17.5, -30.15],
    ], { districtCode: "DC6", district: "Namakwa" }),
    poly("Hantam", "NC065", "#EDD47D", [
      [19.05, -32.2],
      [20.75, -32.05],
      [20.9, -30.55],
      [19.25, -30.55],
    ], { districtCode: "DC6", district: "Namakwa" }),
    poly("Karoo Hoogland", "NC066", "#DEB740", [
      [20.15, -32.5],
      [21.15, -32.35],
      [21.2, -31.0],
      [20.2, -30.95],
    ], { districtCode: "DC6", district: "Namakwa" }),
    poly("Khai-Ma", "NC067", "#D5AD30", [
      [18.55, -29.6],
      [19.8, -29.45],
      [19.9, -28.7],
      [18.7, -28.7],
    ], { districtCode: "DC6", district: "Namakwa" }),
  ],
};

const provincesCenters = [
  ["NC", "Northern Cape", "Noord-Kaap", "iMntla-Koloni", "iNyunivesithi", "northern-cape", -29.0, 21.5, 6],
  ["WC", "Western Cape", "Wes-Kaap", "iNtshona-Koloni", "iNtshonalanga Koloni", "western-cape", -33.5, 20.5, 7],
  ["EC", "Eastern Cape", "Oos-Kaap", "iMpuma-Koloni", "iMpumalanga Koloni", "eastern-cape", -32.3, 26.5, 7],
  ["FS", "Free State", "Vrystaat", "iFreyistata", "iFreyistata", "free-state", -28.5, 26.8, 7],
  ["GP", "Gauteng", "Gauteng", "iGauteng", "iGauteng", "gauteng", -26.2, 28.1, 8],
  ["KZN", "KwaZulu-Natal", "KwaZulu-Natal", "iKwaZulu-Natal", "iKwaZulu-Natal", "kwazulu-natal", -29.0, 30.5, 7],
  ["LP", "Limpopo", "Limpopo", "iLimpopo", "iLimpopo", "limpopo", -23.9, 29.5, 7],
  ["MP", "Mpumalanga", "Mpumalanga", "iMpumalanga", "iMpumalanga", "mpumalanga", -25.5, 30.5, 7],
  ["NW", "North West", "Noordwes", "iNyakatho-Ntshonalanga", "iNyakatho Ntshonalanga", "north-west", -26.5, 25.5, 7],
];

const nationalBoundaries = {
  type: "FeatureCollection",
  features: [
    poly("Northern Cape", "NC", "#0f766e", [
      [16.35, -32.55],
      [25.5, -32.55],
      [25.5, -26.4],
      [16.35, -26.4],
    ]),
    poly("Western Cape", "WC", "#0369a1", [[17.8, -34.8], [24.2, -34.8], [24.2, -31.0], [17.8, -31.0]]),
    poly("Eastern Cape", "EC", "#7c3aed", [[22.5, -34.2], [30.2, -34.2], [30.2, -30.0], [22.5, -30.0]]),
    poly("Free State", "FS", "#c2410c", [[24.3, -30.7], [29.8, -30.7], [29.8, -26.6], [24.3, -26.6]]),
    poly("Gauteng", "GP", "#be123c", [[27.6, -26.7], [28.6, -26.7], [28.6, -25.6], [27.6, -25.6]]),
    poly("KwaZulu-Natal", "KZN", "#0f766e", [[28.8, -31.2], [32.9, -31.2], [32.9, -26.8], [28.8, -26.8]]),
    poly("Limpopo", "LP", "#15803d", [[26.5, -25.5], [31.9, -25.5], [31.9, -22.1], [26.5, -22.1]]),
    poly("Mpumalanga", "MP", "#a16207", [[28.5, -27.2], [32.1, -27.2], [32.1, -24.0], [28.5, -24.0]]),
    poly("North West", "NW", "#1d4ed8", [[22.5, -28.2], [28.3, -28.2], [28.3, -24.6], [22.5, -24.6]]),
  ],
};

/** Legend entries for UI – match official municipalities.co.za district map */
const ncDistrictLegend = [
  { code: "DC9", name: "Frances Baard", color: DISTRICT.FB },
  { code: "DC45", name: "John Taolo Gaetsewe", color: DISTRICT.JTG },
  { code: "DC6", name: "Namakwa", color: DISTRICT.NAM },
  { code: "DC7", name: "Pixley ka Seme", color: DISTRICT.PKS },
  { code: "DC8", name: "ZF Mgcawu", color: DISTRICT.ZFM },
];

/** Official labelled district–municipality raster (visual source of truth) */
const officialMap = {
  path: "/maps/nc-district-municipalities-official.png",
  attribution: "© municipalities.co.za — Northern Cape district & local municipalities",
  // Approximate content envelope of the provincial drawing (WGS84)
  bounds: {
    west: 16.25,
    south: -32.55,
    east: 25.55,
    north: -26.35,
  },
};

module.exports = {
  ncDistricts,
  ncMunicipalities,
  provincesCenters,
  nationalBoundaries,
  ncDistrictLegend,
  officialMap,
  DISTRICT_COLORS: DISTRICT,
};
