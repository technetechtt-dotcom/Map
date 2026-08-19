import { describe, expect, it } from "vitest";
import { scoreFundingMatch, scoreTenderMatch } from "@/lib/matching";

describe("matching engine", () => {
  const org = {
    id: "org1",
    name: "Kalahari Cloud",
    type: "SMME",
    provinceId: "nc",
    servicesJson: ["hosting", "training"],
    skillsJson: ["cloud"],
    industrySectorsJson: ["ict"],
    beeLevel: "1",
    companySize: "startup",
  };

  it("scores same-province funding with overlapping sectors", () => {
    const result = scoreFundingMatch(org, {
      id: "f1",
      slug: "ict-grant",
      title: "ICT grant",
      summary: "Cloud hosting",
      provinceId: "nc",
      eligibleSectorsJson: ["ict"],
      tagsJson: ["hosting"],
      ownershipCriteria: "B-BBEE",
      businessStage: "startup",
    });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.qualifies).toBe(true);
  });

  it("explains missing geography", () => {
    const result = scoreFundingMatch(org, {
      id: "f2",
      slug: "wc-grant",
      title: "WC grant",
      summary: "Western Cape only",
      provinceId: "wc",
      eligibleSectorsJson: ["agriculture"],
    });
    expect(result.missing.join(" ")).toMatch(/province|sectors/i);
  });

  it("scores tenders by category and tags", () => {
    const result = scoreTenderMatch(org, {
      id: "t1",
      slug: "hosting-rfp",
      title: "Hosting RFP",
      summary: "Need hosting",
      provinceId: "nc",
      procurementCategory: "hosting",
      tagsJson: ["cloud"],
    });
    expect(result.score).toBeGreaterThan(30);
  });
});
