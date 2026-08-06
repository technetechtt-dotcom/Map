const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.province
  .count()
  .then((c) => console.log("provinces", c))
  .catch((e) => console.error("ERR", e))
  .finally(() => p.$disconnect());
