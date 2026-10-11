/**
 * National connector registry — authoritative sources by province and entity type.
 * Each connector is run via: node scripts/connectors/run.js <connector-id>
 */
module.exports = {
  connectors: [
    { id: "nc-municipalities", province: "NC", entity: "location", authority: "MDB", status: "active" },
    { id: "nc-universities", province: "NC", entity: "organisation", authority: "DHET", status: "active" },
    { id: "nc-tvet", province: "NC", entity: "organisation", authority: "DHET-TVET", status: "active" },
    { id: "nc-seta", province: "NC", entity: "organisation", authority: "SETA", status: "active" },
    { id: "nc-dsbd-seda", province: "NC", entity: "opportunity", authority: "DSBD/SEDA", status: "active" },
    { id: "gp-municipalities", province: "GP", entity: "location", authority: "MDB", status: "active" },
    { id: "gp-universities", province: "GP", entity: "organisation", authority: "DHET", status: "active" },
    { id: "wc-municipalities", province: "WC", entity: "location", authority: "MDB", status: "active" },
    { id: "wc-universities", province: "WC", entity: "organisation", authority: "DHET", status: "active" },
    { id: "kzn-municipalities", province: "KZN", entity: "location", authority: "MDB", status: "active" },
    { id: "ec-municipalities", province: "EC", entity: "location", authority: "MDB", status: "active" },
    { id: "fs-municipalities", province: "FS", entity: "location", authority: "MDB", status: "active" },
    { id: "lp-municipalities", province: "LP", entity: "location", authority: "MDB", status: "active" },
    { id: "mp-municipalities", province: "MP", entity: "location", authority: "MDB", status: "active" },
    { id: "nw-municipalities", province: "NW", entity: "location", authority: "MDB", status: "active" },
    { id: "national-procurement", province: "*", entity: "procurement", authority: "National Treasury", status: "active" },
    { id: "national-funding", province: "*", entity: "funding", authority: "DSBD/SEFA/SEDA", status: "active" },
    { id: "national-infrastructure", province: "*", entity: "infrastructure", authority: "ICASA/SA Connect", status: "active" },
    { id: "national-events", province: "*", entity: "event", authority: "Public programmes", status: "active" },
    { id: "national-startups", province: "*", entity: "organisation", authority: "DSBD/SEDA", status: "active" },
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
