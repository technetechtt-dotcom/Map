/**
 * National connector registry — logical runners mapped to CONNECTORS source ids.
 * Each connector is run via: node scripts/connectors/run.js <connector-id>
 * CONNECTOR_ID passed to ingest:national is always `sourceId` (one catalogue source).
 */
module.exports = {
  connectors: [
    { id: "nc-municipalities", sourceId: "municipalities", province: "NC", entity: "location", authority: "MDB", health: "SEED" },
    { id: "nc-universities", sourceId: "universities", province: "NC", entity: "organisation", authority: "DHET", health: "SEED" },
    { id: "nc-tvet", sourceId: "tvet", province: "NC", entity: "organisation", authority: "DHET-TVET", health: "SEED" },
    { id: "nc-seta", sourceId: "seta-funders", province: "NC", entity: "organisation", authority: "SETA", health: "SEED" },
    { id: "nc-dsbd-seda", sourceId: "opportunities", province: "NC", entity: "opportunity", authority: "DSBD/SEDA", health: "SEED" },
    { id: "gp-municipalities", sourceId: "municipalities", province: "GP", entity: "location", authority: "MDB", health: "SEED" },
    { id: "gp-universities", sourceId: "universities", province: "GP", entity: "organisation", authority: "DHET", health: "SEED" },
    { id: "wc-municipalities", sourceId: "municipalities", province: "WC", entity: "location", authority: "MDB", health: "SEED" },
    { id: "wc-universities", sourceId: "universities", province: "WC", entity: "organisation", authority: "DHET", health: "SEED" },
    { id: "kzn-municipalities", sourceId: "municipalities", province: "KZN", entity: "location", authority: "MDB", health: "SEED" },
    { id: "ec-municipalities", sourceId: "municipalities", province: "EC", entity: "location", authority: "MDB", health: "SEED" },
    { id: "fs-municipalities", sourceId: "municipalities", province: "FS", entity: "location", authority: "MDB", health: "SEED" },
    { id: "lp-municipalities", sourceId: "municipalities", province: "LP", entity: "location", authority: "MDB", health: "SEED" },
    { id: "mp-municipalities", sourceId: "municipalities", province: "MP", entity: "location", authority: "MDB", health: "SEED" },
    { id: "nw-municipalities", sourceId: "municipalities", province: "NW", entity: "location", authority: "MDB", health: "SEED" },
    { id: "national-procurement", sourceId: "procurement", province: "*", entity: "procurement", authority: "National Treasury", health: "SEED" },
    { id: "national-funding", sourceId: "funders", province: "*", entity: "funding", authority: "DSBD/SEFA/SEDA", health: "SEED" },
    { id: "national-infrastructure", sourceId: "digital-infrastructure", province: "*", entity: "infrastructure", authority: "ICASA/SA Connect", health: "SEED" },
    { id: "national-events", sourceId: "events", province: "*", entity: "event", authority: "Public programmes", health: "SEED" },
    { id: "national-startups", sourceId: "startups-investors", province: "*", entity: "organisation", authority: "DSBD/SEDA", health: "SEED" },
    { id: "universities", sourceId: "universities", province: "*", entity: "organisation", authority: "DHET", health: "SEED" },
    { id: "tvet", sourceId: "tvet", province: "*", entity: "organisation", authority: "DHET-TVET", health: "SEED" },
    { id: "municipalities", sourceId: "municipalities", province: "*", entity: "location", authority: "MDB", health: "SEED" },
    { id: "programmes", sourceId: "programmes", province: "*", entity: "programme", authority: "Public skills", health: "SEED" },
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
