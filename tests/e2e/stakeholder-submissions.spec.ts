import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { opsUrl } from "./helpers/urls";

const prisma = new PrismaClient();

test("signed-in stakeholder can track and resubmit requested information", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "stateful stakeholder flow runs once");
  test.setTimeout(90_000);
  const email = `e2e-stakeholder-${Date.now()}@example.test`;
  const password = "E2E-Stakeholder-42!";
  const title = `E2E Stakeholder Grant ${Date.now()}`;
  const user = await prisma.user.create({
    data: { email, name: "E2E Stakeholder", passwordHash: await bcrypt.hash(password, 12), role: "CONTRIBUTOR" },
  });
  let submissionId: string | null = null;

  try {
    await page.goto("/login?callbackUrl=%2Faccount%2Fsubmissions");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();

    const submitted = await page.request.post("/api/submissions", {
      data: {
        type: "funding",
        submitterName: "E2E Stakeholder",
        submitterEmail: email,
        payload: {
          title,
          summary: "Funding opportunity submitted by an authenticated stakeholder.",
          provinceSlug: "northern-cape",
          applicationUrl: "https://example.test/stakeholder-grant",
        },
      },
    });
    expect(submitted.status(), await submitted.text()).toBe(201);
    const body = await submitted.json();
    submissionId = body.id;

    const stored = await prisma.submission.findUnique({ where: { id: body.id } });
    expect(stored?.submittedById).toBe(user.id);

    await prisma.submission.update({
      where: { id: body.id },
      data: { status: "NEEDS_INFORMATION", reviewedNotes: "Please confirm the application closing date." },
    });

    await page.goto("/account/submissions");
    const card = page.getByRole("article").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByText("Action required", { exact: true })).toBeVisible();
    await expect(card.getByText(/confirm the application closing date/i)).toBeVisible();
    await card.getByPlaceholder(/provide the requested details/i).fill("Applications close on 30 November 2026.");
    await card.getByRole("button", { name: /resubmit to ops/i }).click();
    await expect(card.getByText("Submitted", { exact: true })).toBeVisible({ timeout: 15_000 });

    const resubmitted = await prisma.submission.findUnique({ where: { id: body.id } });
    expect(resubmitted?.status).toBe("SUBMITTED");
    expect(resubmitted?.notes).toContain("30 November 2026");
  } finally {
    if (submissionId) await prisma.submission.delete({ where: { id: submissionId } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { OR: [{ userId: user.id }, { email }] } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
});

test("Ops approve and publish makes a stakeholder funding submission public", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "stateful publishing flow runs once");
  test.setTimeout(90_000);
  const adminEmail = `e2e-publisher-${Date.now()}@example.test`;
  const stakeholderEmail = `e2e-source-${Date.now()}@example.test`;
  const password = "E2E-Publisher-42!";
  const title = `E2E Published Opportunity ${Date.now()}`;
  const admin = await prisma.user.create({
    data: { email: adminEmail, name: "E2E Publisher", passwordHash: await bcrypt.hash(password, 12), role: "SUPER_ADMIN" },
  });
  let submissionId: string | null = null;
  let fundingId: string | null = null;

  try {
    const submitted = await page.request.post("/api/submissions", {
      data: {
        type: "funding",
        submitterName: "E2E External Stakeholder",
        submitterEmail: stakeholderEmail,
        payload: {
          title,
          summary: "A stakeholder funding opportunity that should publish after Ops approval.",
          provinceSlug: "northern-cape",
          applicationUrl: "https://example.test/published-grant",
          deadline: "2026-11-30",
        },
      },
    });
    expect(submitted.status(), await submitted.text()).toBe(201);
    const created = await submitted.json();
    submissionId = created.id;

    await page.goto(opsUrl("/login"));
    await page.locator('input[name="email"]').fill(adminEmail);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:3001\/admin/, { timeout: 20_000 });

    const published = await page.request.patch(opsUrl("/api/submissions"), {
      data: {
        id: submissionId,
        status: "PUBLISHED",
        reviewedNotes: "Official source checked and approved for publication.",
      },
    });
    expect(published.status(), await published.text()).toBe(200);

    const stored = await prisma.submission.findUnique({ where: { id: submissionId } });
    expect(stored?.status).toBe("PUBLISHED");
    expect(stored?.createdEntityType).toBe("funding");
    expect(stored?.createdEntityId).toBeTruthy();
    fundingId = stored?.createdEntityId || null;

    const funding = fundingId ? await prisma.fundingCall.findUnique({ where: { id: fundingId } }) : null;
    expect(funding?.status).toBe("PUBLISHED");
    expect(funding?.slug).toBeTruthy();

    await page.goto(`/funding/${funding?.slug}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 20_000 });
  } finally {
    if (fundingId) await prisma.fundingCall.delete({ where: { id: fundingId } }).catch(() => undefined);
    if (submissionId) await prisma.submission.delete({ where: { id: submissionId } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { OR: [{ userId: admin.id }, { email: stakeholderEmail }] } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: admin.id } }).catch(() => undefined);
  }
});
