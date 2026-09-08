import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { opsUrl } from "./helpers/urls";

const prisma = new PrismaClient();

/**
 * Log in via the browser and return the session cookie string so that
 * page.request.* calls carry the same authenticated context.
 * Without this, the BOLA PATCH/GET requests are treated as anonymous
 * and return 401 instead of the expected 403 — the test then fails
 * because 401 !== >=403.
 */
async function loginOps(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto(opsUrl("/login"));
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return sessionCookie;
}

test.describe("HTTP-level BOLA adversarial tests", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "runs once");

  test("ecosystem PATCH denied cross-organisation", async ({ page }) => {
    test.setTimeout(90_000);
    const password = "E2E-Bola-Adversarial-42!";
    const orgA = await prisma.organisation.create({
      data: { name: `BOLA A ${Date.now()}`, slug: `bola-a-${Date.now()}`, type: "hub", status: "PUBLISHED", provinceId: (await prisma.province.findFirst({ where: { code: "NC" } }))!.id },
    });
    const orgB = await prisma.organisation.create({
      data: { name: `BOLA B ${Date.now()}`, slug: `bola-b-${Date.now()}`, type: "hub", status: "PUBLISHED", provinceId: orgA.provinceId },
    });
    const userA = await prisma.user.create({
      data: { email: `bola-a-${Date.now()}@example.test`, name: "BOLA A", passwordHash: await bcrypt.hash(password, 12), role: "ORG_ADMIN", provinceId: orgA.provinceId, organisationId: orgA.id },
    });
    const funding = await prisma.fundingCall.create({
      data: { slug: `bola-f-${Date.now()}`, title: "BOLA funding", summary: "test", status: "DRAFT", provinceId: orgB.provinceId, organisationId: orgB.id },
    });
    try {
      const cookie = await loginOps(page, userA.email, password);
      const res = await page.request.patch(opsUrl(`/api/ecosystem/${funding.id}`), {
        data: { type: "funding", title: "Hijacked" },
        headers: { cookie },
      });
      expect(res.status()).toBeGreaterThanOrEqual(403);
    } finally {
      await prisma.fundingCall.delete({ where: { id: funding.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: userA.id } }).catch(() => undefined);
      await prisma.organisation.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } }).catch(() => undefined);
    }
  });

  test("location PATCH denied for contributor on foreign org record", async ({ page }) => {
    test.setTimeout(90_000);
    const password = "E2E-Bola-Location-42!";
    const province = await prisma.province.findFirst({ where: { code: "NC" } });
    if (!province) throw new Error("NC province missing");
    const orgA = await prisma.organisation.create({
      data: { name: `Loc A ${Date.now()}`, slug: `loc-a-${Date.now()}`, type: "hub", status: "PUBLISHED", provinceId: province.id },
    });
    const orgB = await prisma.organisation.create({
      data: { name: `Loc B ${Date.now()}`, slug: `loc-b-${Date.now()}`, type: "hub", status: "PUBLISHED", provinceId: province.id },
    });
    const ownerB = await prisma.user.create({
      data: { email: `loc-b-${Date.now()}@example.test`, name: "Owner B", passwordHash: await bcrypt.hash(password, 12), role: "CONTRIBUTOR", provinceId: province.id, organisationId: orgB.id },
    });
    const attacker = await prisma.user.create({
      data: { email: `loc-a-${Date.now()}@example.test`, name: "Attacker A", passwordHash: await bcrypt.hash(password, 12), role: "CONTRIBUTOR", provinceId: province.id, organisationId: orgA.id },
    });
    const category = await prisma.category.findFirst();
    if (!category) throw new Error("category missing");
    const location = await prisma.location.create({
      data: {
        slug: `bola-loc-${Date.now()}`,
        name: "Foreign location",
        summary: "test",
        status: "DRAFT",
        provinceId: province.id,
        organisationId: orgB.id,
        ownerId: ownerB.id,
        categoryId: category.id,
        latitude: -28.7,
        longitude: 24.7,
      },
    });
    try {
      const before = await prisma.location.findUniqueOrThrow({
        where: { id: location.id },
      });
      const cookie = await loginOps(page, attacker.email, password);
      const res = await page.request.patch(opsUrl(`/api/locations/${location.id}`), {
        data: {
          name: "Stolen",
          summary: "Cross-tenant mutation must never persist",
          organisationId: orgA.id,
        },
        headers: { cookie },
      });
      expect(res.status()).toBe(403);
      const after = await prisma.location.findUniqueOrThrow({
        where: { id: location.id },
      });
      expect(after).toEqual(before);
    } finally {
      await prisma.location.delete({ where: { id: location.id } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: [ownerB.id, attacker.id] } } }).catch(() => undefined);
      await prisma.organisation.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } }).catch(() => undefined);
    }
  });

  test("provincial admin denied another province ecosystem record", async ({ page }) => {
    test.setTimeout(90_000);
    const password = "E2E-Bola-Prov-42!";
    const nc = await prisma.province.findFirst({ where: { code: "NC" } });
    const gp = await prisma.province.findFirst({ where: { code: "GP" } });
    if (!nc || !gp) throw new Error("provinces missing");
    const admin = await prisma.user.create({
      data: { email: `prov-nc-${Date.now()}@example.test`, name: "NC Admin", passwordHash: await bcrypt.hash(password, 12), role: "PROVINCIAL_ADMIN", provinceId: nc.id },
    });
    const event = await prisma.ecosystemEvent.create({
      data: { slug: `bola-ev-${Date.now()}`, title: "GP event", summary: "x", status: "DRAFT", provinceId: gp.id, startsAt: new Date() },
    });
    try {
      const cookie = await loginOps(page, admin.email, password);
      const res = await page.request.patch(opsUrl(`/api/ecosystem/${event.id}`), {
        data: { type: "events", title: "Cross province" },
        headers: { cookie },
      });
      expect(res.status()).toBeGreaterThanOrEqual(403);
    } finally {
      await prisma.ecosystemEvent.delete({ where: { id: event.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: admin.id } }).catch(() => undefined);
    }
  });

  test("guessed unpublished ecosystem id cannot be patched by another tenant", async ({ page }) => {
    test.setTimeout(90_000);
    const password = "E2E-Bola-Guess-42!";
    const province = await prisma.province.findFirst({ where: { code: "NC" } });
    if (!province) throw new Error("province missing");
    const org = await prisma.organisation.create({
      data: { name: `Guess ${Date.now()}`, slug: `guess-${Date.now()}`, type: "hub", status: "PUBLISHED", provinceId: province.id },
    });
    const admin = await prisma.user.create({
      data: { email: `guess-${Date.now()}@example.test`, name: "Org admin", passwordHash: await bcrypt.hash(password, 12), role: "ORG_ADMIN", provinceId: province.id, organisationId: org.id },
    });
    const hidden = await prisma.programme.create({
      data: { slug: `hidden-${Date.now()}`, title: "Hidden programme", summary: "draft", status: "DRAFT", provinceId: province.id, organisationId: null },
    });
    try {
      const before = await prisma.programme.findUniqueOrThrow({ where: { id: hidden.id } });
      const cookie = await loginOps(page, admin.email, password);
      const res = await page.request.patch(opsUrl(`/api/ecosystem/${hidden.id}`), {
        data: { type: "programmes", title: "Guessed and hijacked", organisationId: org.id },
        headers: { cookie },
      });
      expect(res.status()).toBe(403);
      const after = await prisma.programme.findUniqueOrThrow({ where: { id: hidden.id } });
      expect(after).toEqual(before);
    } finally {
      await prisma.programme.delete({ where: { id: hidden.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: admin.id } }).catch(() => undefined);
      await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
    }
  });
});
