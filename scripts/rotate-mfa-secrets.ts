import { PrismaClient } from "@prisma/client";
import { currentMfaKeyVersion, decryptSecret, encryptSecret } from "../src/lib/secret-box";

const prisma = new PrismaClient();

async function main() {
  const targetVersion = currentMfaKeyVersion();
  const apply = process.env.MFA_ROTATE_APPLY === "1";
  const users = await prisma.user.findMany({
    where: { OR: [{ mfaSecret: { not: null } }, { mfaPendingSecret: { not: null } }] },
    select: { id: true, mfaSecret: true, mfaKeyVersion: true, mfaPendingSecret: true, mfaPendingKeyVersion: true },
  });
  let migrated = 0;
  for (const user of users) {
    const data: { mfaSecret?: string; mfaKeyVersion?: number; mfaPendingSecret?: string; mfaPendingKeyVersion?: number } = {};
    if (user.mfaSecret && !(user.mfaKeyVersion === targetVersion && user.mfaSecret.startsWith(`MFA2:${targetVersion}:`))) {
      data.mfaSecret = encryptSecret(decryptSecret(user.mfaSecret, user.mfaKeyVersion), targetVersion);
      data.mfaKeyVersion = targetVersion;
    }
    if (user.mfaPendingSecret && !(user.mfaPendingKeyVersion === targetVersion && user.mfaPendingSecret.startsWith(`MFA2:${targetVersion}:`))) {
      data.mfaPendingSecret = encryptSecret(decryptSecret(user.mfaPendingSecret, user.mfaPendingKeyVersion || user.mfaKeyVersion), targetVersion);
      data.mfaPendingKeyVersion = targetVersion;
    }
    if (!Object.keys(data).length) continue;
    if (apply) {
      await prisma.user.update({
        where: { id: user.id },
        data,
      });
    }
    migrated += 1;
  }
  console.log(JSON.stringify({ apply, targetVersion, scanned: users.length, migrated }));
  if (!apply) console.log("Dry run only. Set MFA_ROTATE_APPLY=1 after verifying current and previous keys.");
}

main().finally(() => prisma.$disconnect());
