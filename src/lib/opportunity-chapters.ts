/**
 * Northern Cape ICT opportunity chapters — mirror PDF pages 3–7
 * (NC_ICT_Ecosystem_Presentation.pptx.pdf / mLab NC 2025).
 */
export type OpportunityChapterDef = {
  pdfPage: number;
  id: string;
  /** PDF slide title */
  title: string;
  /** One-line subtitle under title */
  zoneLabel: string;
  emoji: string;
  accent: string;
  districtCodes: string[];
  /** Municipality codes to emphasise on the district map */
  munCodes: string[];
  locationSlugs: string[];
  /** PDF “key contacts” order */
  contactSlugs: string[];
  /** Icon chips under the map header (PDF left column) */
  chips: { label: string; note: string }[];
  opportunities: string[];
  strategic: string;
};

export const OPPORTUNITY_CHAPTERS: OpportunityChapterDef[] = [
  {
    pdfPage: 3,
    id: "kimberley",
    title: "Kimberley — Provincial capital & ICT knowledge hub",
    zoneLabel: "Frances Baard District · Sol Plaatje Municipality",
    emoji: "★",
    accent: "#C9B3E0",
    districtCodes: ["DC9"],
    munCodes: ["NC091"],
    locationSlugs: ["kimberley"],
    contactSlugs: [
      "sol-plaatje-university",
      "mlab-northern-cape",
      "dedat-northern-cape",
      "seda-nc",
      "nc-cetc",
      "tia-center-kimberley",
    ],
    chips: [
      { label: "SPU", note: "Sol Plaatje University" },
      { label: "mLab", note: "Digital & innovation hub" },
      { label: "2 TVETs", note: "Urban & Rural college" },
      { label: "DEDaT", note: "Investment office" },
      { label: "SEDA", note: "SMME support" },
    ],
    opportunities: [
      "Home to Sol Plaatje University — BSc Data Science, ICT diplomas & research",
      "mLab NC CodeTribe Academy — mobile app and web development training",
      "Government ICT services digitalisation — DEDaT, DSBD, CIPC, NOCCI",
      "Digital services for SMMEs — web dev, e-commerce, digital marketing",
      "NCDEV Hack, National Science Week, Frances Baard GEW annual events",
    ],
    strategic:
      "Establish a flagship Kimberley ICT Innovation Hub — co-working, incubation, and acceleration — anchored by SPU and mLab NC. This single intervention would transform Kimberley into the gravitational centre of the NC digital economy and attract national DSI and TIA programme investment.",
  },
  {
    pdfPage: 4,
    id: "upington",
    title: "Upington — Solar Valley & GreenTech opportunity zone",
    zoneLabel: "ZF Mgcawu District · Orange River corridor",
    emoji: "☀",
    accent: "#7A9EAD",
    districtCodes: ["DC8"],
    munCodes: ["NC086"],
    locationSlugs: ["upington"],
    contactSlugs: [
      "nc-rural-tvet-upington",
      "globeleq",
      "seda-nc",
      "dedat-northern-cape",
      "nyda",
      "fetola",
    ],
    chips: [
      { label: "SA #1", note: "Solar energy corridor" },
      { label: "IPPs", note: "Province-wide renewable" },
      { label: "Raisins", note: "Orange River AgriTech" },
      { label: "TVET", note: "Rural campus" },
    ],
    opportunities: [
      "Solar farm management software — monitoring, fault detection, output optimisation",
      "Smart grid platforms — energy trading, load balancing, grid analytics for IPPs",
      "Precision agriculture — irrigation apps, soil sensors, crop management",
      "Supply chain software for wine and raisin production (Orange River)",
      "Environmental monitoring — weather data, river flow sensors, climate analytics",
    ],
    strategic:
      'Establish a "Solar Valley Tech Incubator" in Upington co-located with major solar operators. A TVET-linked GreenTech programme could produce software solutions for the entire SA renewable energy sector and attract DSI, TIA, and energy-sector CSI funding.',
  },
  {
    pdfPage: 5,
    id: "kathu-postmasburg",
    title: "Kathu & Postmasburg — Mining belt & Industry 4.0 corridor",
    zoneLabel: "John Taolo Gaetsewe District · Iron ore & manganese belt",
    emoji: "⛏",
    accent: "#8EC4E8",
    districtCodes: ["DC45", "DC8"],
    munCodes: ["NC453", "NC085"],
    locationSlugs: ["kathu", "postmasburg"],
    contactSlugs: [
      "nc-rural-tvet-kathu-cferis",
      "anglo-smme-toolkit",
      "de-beers-zimele",
      "idc-nc",
      "seda-nc",
      "transnet-enterprise",
    ],
    chips: [
      { label: "Kumba", note: "Kolomela Mine SLP" },
      { label: "Assmang", note: "Iron & manganese" },
      { label: "IoT", note: "Fleet & safety tech" },
      { label: "CFERIS", note: "Incubator on campus" },
    ],
    opportunities: [
      "Industry 4.0 — IoT sensors, digital twin solutions, predictive maintenance",
      "Fleet management software — tracking, scheduling, compliance for haulage",
      "Mine safety platforms — wearable monitoring, gas detection, compliance tools",
      "Remote monitoring dashboards — real-time ops and logistics for Kumba & Assmang",
      "Robotics & automation support software for deep mining operations",
    ],
    strategic:
      '"Mining 4.0 Incubation Corridor" co-funded by Kumba Iron Ore and Assmang SLPs, hosted at CFERIS — Kathu TVET campus. ICT startups get a built-in corporate customer base from day one and access to SLP ring-fenced funding as their primary revenue and runway.',
  },
  {
    pdfPage: 6,
    id: "carnarvon",
    title: "Carnarvon — SKA / MeerKAT & the data economy corridor",
    zoneLabel: "Pixley ka Seme District · Global science infrastructure",
    emoji: "🔭",
    accent: "#A8D08D",
    districtCodes: ["DC7"],
    munCodes: ["NC074"],
    locationSlugs: ["carnarvon"],
    contactSlugs: ["sarao", "tia", "dsi", "nef", "seda-nc", "sol-plaatje-university"],
    chips: [
      { label: "SKA", note: "Global radio telescope" },
      { label: "MeerKAT", note: "64-dish array" },
      { label: "SARAO", note: "SA Radio Astronomy Obs" },
      { label: "Data", note: "Petabytes at scale" },
    ],
    opportunities: [
      "Data pipeline & engineering tools for radio astronomy at petabyte scale",
      "AI / ML platforms — pattern detection, anomaly flagging in radio frequency data",
      "Last-mile fibre & broadband connectivity for Karoo communities",
      "Remote sensing — satellite data analytics, environmental & land monitoring",
      "Community digital services — tourism, agri, logistics for Carnarvon town",
    ],
    strategic:
      '"Karoo Data Economy Cluster" — startups serving SKA data processing needs and the broader African data economy. SARAO is a ready anchor tenant. Fibre infrastructure already deployed is a platform for digital services across the region, from tourism to precision agriculture.',
  },
  {
    pdfPage: 7,
    id: "de-aar",
    title: "De Aar — Rail junction & southern NC digital gateway",
    zoneLabel: "Pixley ka Seme District · NC Rural TVET campus",
    emoji: "🚉",
    accent: "#8FC078",
    districtCodes: ["DC7"],
    munCodes: ["NC073"],
    locationSlugs: ["de-aar"],
    contactSlugs: [
      "nc-rural-tvet-de-aar-cferis",
      "transnet-enterprise",
      "seda-nc",
      "dsbd",
      "nceda",
      "nyda",
    ],
    chips: [
      { label: "Rail hub", note: "Transnet junction" },
      { label: "CFERIS", note: "Incubator on campus" },
      { label: "TVET", note: "Rural campus" },
      { label: "Remote", note: "Digital services" },
    ],
    opportunities: [
      "Logistics software — rail tracking, scheduling, digital freight management",
      "Agricultural services — digital tools for Karoo sheep and grain farming",
      "Digital services hub for small businesses in southern NC towns",
      "E-learning platforms — remote education for learners in isolated towns",
      "Connectivity infrastructure — last-mile broadband, public wifi, digital access",
    ],
    strategic:
      "De Aar's strategic position as SA's central rail junction makes it ideal for logistics-tech startups serving both the mining belt north and the agricultural heartland south. A CFERIS-anchored digital skills programme could serve the isolated young population of the Karoo.",
  },
];
