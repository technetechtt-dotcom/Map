/**
 * Non-destructive: upsert the two walkthrough logins.
 * Blocked when NODE_ENV=production unless ALLOW_DEMO_USERS=1 (still never logs the password).
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && process.env.ALLOW_DEMO_USERS !== "1") {
    throw new Error("Refusing to upsert demo users in production without ALLOW_DEMO_USERS=1");
  }

  const password = (process.env.SEED_ADMIN_PASSWORD || "").trim();
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  }

  const superEmail = (process.env.SEED_ADMIN_EMAIL || "admin@ictmap.gov.za").toLowerCase();
  const provincialEmail = (process.env.SEED_NC_ADMIN_EMAIL || "nc.admin@ictmap.gov.za").toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const nc = await prisma.province.findUnique({ where: { slug: "northern-cape" }, select: { id: true } });
  if (!nc) throw new Error("northern-cape province is missing — seed or migrate first");

  await prisma.user.upsert({
    where: { email: superEmail },
    create: {
      email: superEmail,
      name: "National Super Admin",
      passwordHash,
      role: "SUPER_ADMIN",
      locale: "en",
      active: true,
      mfaEnabled: false,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
    update: {
      passwordHash,
      role: "SUPER_ADMIN",
      active: true,
      mfaEnabled: false,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  await prisma.user.upsert({
    where: { email: provincialEmail },
    create: {
      email: provincialEmail,
      name: "Northern Cape Admin",
      passwordHash,
      role: "PROVINCIAL_ADMIN",
      provinceId: nc.id,
      locale: "en",
      active: true,
      mfaEnabled: false,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
    update: {
      passwordHash,
      role: "PROVINCIAL_ADMIN",
      provinceId: nc.id,
      active: true,
      mfaEnabled: false,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  console.log(`Demo users ready: ${superEmail} (super), ${provincialEmail} (provincial). Password not logged.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
