/**
 * National connector registry — authoritative sources by province and entity type.
 * Each connector is run via: node scripts/connectors/run.js <connector-id>
 */
module.exports = {
  connectors: [
    { id: "nc-municipalities", province: "NC", entity: "location", authority: "MDB", status: "active" },
    { id: "nc-universities", province: "NC", entity: "organisation", authority: "DHET", status: "active" },
    { id: "nc-tvet", province: "NC", entity: "organisation", authority: "DHET-TVET", status: "planned" },
    { id: "nc-seta", province: "NC", entity: "organisation", authority: "SETA", status: "planned" },
    { id: "nc-dsbd-seda", province: "NC", entity: "opportunity", authority: "DSBD/SEDA", status: "planned" },
    { id: "gp-municipalities", province: "GP", entity: "location", authority: "MDB", status: "planned" },
    { id: "gp-universities", province: "GP", entity: "organisation", authority: "DHET", status: "planned" },
    { id: "wc-municipalities", province: "WC", entity: "location", authority: "MDB", status: "planned" },
    { id: "wc-universities", province: "WC", entity: "organisation", authority: "DHET", status: "planned" },
    { id: "kzn-municipalities", province: "KZN", entity: "location", authority: "MDB", status: "planned" },
    { id: "ec-municipalities", province: "EC", entity: "location", authority: "MDB", status: "planned" },
    { id: "fs-municipalities", province: "FS", entity: "location", authority: "MDB", status: "planned" },
    { id: "lp-municipalities", province: "LP", entity: "location", authority: "MDB", status: "planned" },
    { id: "mp-municipalities", province: "MP", entity: "location", authority: "MDB", status: "planned" },
    { id: "nw-municipalities", province: "NW", entity: "location", authority: "MDB", status: "planned" },
    { id: "national-procurement", province: "*", entity: "procurement", authority: "National Treasury", status: "planned" },
    { id: "national-funding", province: "*", entity: "funding", authority: "DSBD/SEFA/SEDA", status: "planned" },
    { id: "national-infrastructure", province: "*", entity: "infrastructure", authority: "ICASA/SA Connect", status: "planned" },
  ],
  coverageTargets: {
    perProvince: {
      authoritativeCoveragePctMin: 20,
      verifiedPctMin: 5,
      currentPctMin: 5,
      geocodedPctMin: 70,
      organisationMin: 10,
      opportunityMin: 2,
    },
    northernCapePilot: {
      authoritativeCoveragePctMin: 80,
      verifiedPctMin: 50,
      currentPctMin: 40,
      geocodedPctMin: 90,
      organisationMin: 40,
      opportunityMin: 5,
    },
  },
};
