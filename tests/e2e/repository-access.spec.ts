import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { opsUrl } from "./helpers/urls";

const prisma = new PrismaClient();

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function loginOps(context: BrowserContext, email: string, password: string) {
  const page = await context.newPage();
  await page.goto(opsUrl("/login"));
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
  const cookies = await context.cookies();
  const cookie = cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");
  return { page, cookie };
}

async function readJson(res: { ok: () => boolean; text: () => Promise<string> }) {
  const text = await res.text();
  expect(res.ok(), text).toBeTruthy();
  return JSON.parse(text) as Record<string, unknown>;
}

test.describe("repository upload, view, and tenant denial", () => {
  test("group member can upload and view; other group and organisation are denied", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "runs once");
    test.setTimeout(120_000);

    const stamp = Date.now();
    const password = "E2E-Repo-Access-42!";
    const province = await prisma.province.findFirst({ where: { code: "NC" } });
    if (!province) throw new Error("NC province missing");

    const createdOrgIds: string[] = [];
    const createdUserIds: string[] = [];
    const contexts: BrowserContext[] = [];
    let adminId = "";
    try {
    const orgA = await prisma.organisation.create({
      data: {
        name: `Repo A ${stamp}`,
        slug: `repo-a-${stamp}`,
        type: "hub",
        status: "PUBLISHED",
        provinceId: province.id,
      },
    });
    createdOrgIds.push(orgA.id);
    const orgB = await prisma.organisation.create({
      data: {
        name: `Repo B ${stamp}`,
        slug: `repo-b-${stamp}`,
        type: "hub",
        status: "PUBLISHED",
        provinceId: province.id,
      },
    });
    createdOrgIds.push(orgB.id);
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await prisma.user.create({
      data: {
        email: `repo-admin-${stamp}@example.test`,
        name: "Repo admin",
        passwordHash,
        role: "PROVINCIAL_ADMIN",
        provinceId: province.id,
      },
    });
    adminId = admin.id;
    createdUserIds.push(admin.id);
    const member = await prisma.user.create({
      data: {
        email: `repo-member-${stamp}@example.test`,
        name: "Repo member",
        passwordHash,
        role: "CONTRIBUTOR",
        provinceId: province.id,
        organisationId: orgA.id,
      },
    });
    createdUserIds.push(member.id);
    const outsider = await prisma.user.create({
      data: {
        email: `repo-outsider-${stamp}@example.test`,
        name: "Repo outsider",
        passwordHash,
        role: "CONTRIBUTOR",
        provinceId: province.id,
        organisationId: orgB.id,
      },
    });
    createdUserIds.push(outsider.id);

      const adminContext = await browser.newContext();
      const memberContext = await browser.newContext();
      const outsiderContext = await browser.newContext();
      contexts.push(adminContext, memberContext, outsiderContext);

      const adminSession = await loginOps(adminContext, admin.email, password);
      const groupRes = await adminSession.page.request.post(opsUrl("/api/repository/groups"), {
        data: { name: `Repo group A ${stamp}`, memberEmails: [member.email] },
        headers: { cookie: adminSession.cookie },
      });
      const groupBody = await readJson(groupRes);
      const groupA = groupBody.group as { id: string };
      const otherGroupRes = await adminSession.page.request.post(opsUrl("/api/repository/groups"), {
        data: { name: `Repo group B ${stamp}`, memberEmails: [outsider.email] },
        headers: { cookie: adminSession.cookie },
      });
      const otherGroupBody = await readJson(otherGroupRes);
      const groupB = otherGroupBody.group as { id: string };
      expect(groupA.id).not.toBe(groupB.id);

      const memberSession = await loginOps(memberContext, member.email, password);
      const uploadRes = await memberSession.page.request.post(opsUrl("/api/uploads"), {
        multipart: {
          file: { name: "note.png", mimeType: "image/png", buffer: PNG },
          access: "private",
        },
        headers: { cookie: memberSession.cookie },
      });
      const uploaded = await readJson(uploadRes);
      const storedObjectId = String(uploaded.id);
      const filename = String(uploaded.filename);

      const createRes = await memberSession.page.request.post(opsUrl("/api/repository"), {
        data: {
          storedObjectId,
          title: `Group brief ${stamp}`,
          visibility: "GROUPS",
          groupIds: [groupA.id],
        },
        headers: { cookie: memberSession.cookie },
      });
      const created = await readJson(createRes);
      const document = created.document as { id: string; version: number };
      expect(document.version).toBe(1);

      const viewRes = await memberSession.page.request.get(opsUrl(`/api/repository/${document.id}`), {
        headers: { cookie: memberSession.cookie },
      });
      const viewed = await readJson(viewRes);
      expect((viewed.document as { title: string }).title).toBe(`Group brief ${stamp}`);

      const memberList = await memberSession.page.request.get(opsUrl("/api/repository"), {
        headers: { cookie: memberSession.cookie },
      });
      const memberListBody = await readJson(memberList);
      const memberIds = ((memberListBody.documents as Array<{ id: string }>) || []).map((entry) => entry.id);
      expect(memberIds).toContain(document.id);

      const outsiderSession = await loginOps(outsiderContext, outsider.email, password);
      const deniedGet = await outsiderSession.page.request.get(opsUrl(`/api/repository/${document.id}`), {
        headers: { cookie: outsiderSession.cookie },
      });
      expect(deniedGet.status()).toBe(404);
      const outsiderList = await outsiderSession.page.request.get(opsUrl("/api/repository"), {
        headers: { cookie: outsiderSession.cookie },
      });
      const outsiderListBody = await readJson(outsiderList);
      const outsiderIds = ((outsiderListBody.documents as Array<{ id: string }>) || []).map((entry) => entry.id);
      expect(outsiderIds).not.toContain(document.id);

      const deniedDownload = await outsiderSession.page.request.get(opsUrl(`/api/uploads/object?key=${filename}`), {
        headers: { cookie: outsiderSession.cookie },
      });
      expect(deniedDownload.status()).toBe(403);

      const download = await memberSession.page.request.get(opsUrl(`/api/uploads/object?key=${filename}`), {
        headers: { cookie: memberSession.cookie },
      });
      expect(download.status()).toBe(200);
      expect((await download.body()).byteLength).toBeGreaterThan(0);

      const orgUpload = await memberSession.page.request.post(opsUrl("/api/uploads"), {
        multipart: {
          file: { name: "org.png", mimeType: "image/png", buffer: PNG },
          access: "private",
        },
        headers: { cookie: memberSession.cookie },
      });
      const orgFile = await readJson(orgUpload);
      const orgCreate = await memberSession.page.request.post(opsUrl("/api/repository"), {
        data: {
          storedObjectId: String(orgFile.id),
          title: `Org brief ${stamp}`,
          visibility: "ORGANISATION",
        },
        headers: { cookie: memberSession.cookie },
      });
      const orgCreated = await readJson(orgCreate);
      const orgDocument = orgCreated.document as { id: string };
      const orgAllowed = await memberSession.page.request.get(opsUrl(`/api/repository/${orgDocument.id}`), {
        headers: { cookie: memberSession.cookie },
      });
      expect(orgAllowed.status()).toBe(200);
      const orgDenied = await outsiderSession.page.request.get(opsUrl(`/api/repository/${orgDocument.id}`), {
        headers: { cookie: outsiderSession.cookie },
      });
      expect(orgDenied.status()).toBe(404);

      const versionUpload = await memberSession.page.request.post(opsUrl("/api/uploads"), {
        multipart: {
          file: { name: "v2.png", mimeType: "image/png", buffer: PNG },
          access: "private",
        },
        headers: { cookie: memberSession.cookie },
      });
      const versionFile = await readJson(versionUpload);
      const versionCreate = await memberSession.page.request.post(opsUrl("/api/repository"), {
        data: {
          storedObjectId: String(versionFile.id),
          title: `Group brief ${stamp}`,
          visibility: "GROUPS",
          groupIds: [groupA.id],
          supersedesId: document.id,
        },
        headers: { cookie: memberSession.cookie },
      });
      const versionCreated = await readJson(versionCreate);
      const version = versionCreated.document as { id: string; version: number };
      expect(version.version).toBe(2);
      const previous = await prisma.repositoryDocument.findUniqueOrThrow({ where: { id: document.id } });
      expect(previous.status).toBe("SUPERSEDED");

      const archive = await memberSession.page.request.patch(opsUrl(`/api/repository/${version.id}`), {
        data: { status: "ARCHIVED" },
        headers: { cookie: memberSession.cookie },
      });
      expect(archive.status()).toBe(200);
      const activeList = await memberSession.page.request.get(opsUrl("/api/repository"), {
        headers: { cookie: memberSession.cookie },
      });
      const activeBody = await readJson(activeList);
      const activeIds = ((activeBody.documents as Array<{ id: string }>) || []).map((entry) => entry.id);
      expect(activeIds).not.toContain(version.id);
      const history = await memberSession.page.request.get(opsUrl("/api/repository?history=1"), {
        headers: { cookie: memberSession.cookie },
      });
      const historyBody = await readJson(history);
      const historyDocs = (historyBody.documents as Array<{ id: string; status: string }>) || [];
      expect(historyDocs.find((entry) => entry.id === version.id)?.status).toBe("ARCHIVED");
      expect(historyDocs.find((entry) => entry.id === document.id)?.status).toBe("SUPERSEDED");

      const viewAudit = await prisma.auditLog.findFirst({
        where: { entityId: document.id, action: "REPOSITORY_DOCUMENT_VIEW" },
      });
      const downloadAudit = await prisma.auditLog.findFirst({
        where: { entityId: document.id, action: "REPOSITORY_DOCUMENT_DOWNLOAD" },
      });
      expect(viewAudit?.actorEmail).toBe(member.email);
      expect(downloadAudit?.actorEmail).toBe(member.email);
    } finally {
      await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
      if (createdUserIds.length) {
        await prisma.repositoryDocument.deleteMany({ where: { uploadedById: { in: createdUserIds } } }).catch(() => undefined);
      }
      if (adminId) {
        await prisma.repositoryGroup.deleteMany({ where: { createdById: adminId } }).catch(() => undefined);
      }
      if (createdUserIds.length) {
        await prisma.storedObject.deleteMany({ where: { uploadedById: { in: createdUserIds } } }).catch(() => undefined);
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
      }
      if (createdOrgIds.length) {
        await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } }).catch(() => undefined);
      }
    }
  });
});
