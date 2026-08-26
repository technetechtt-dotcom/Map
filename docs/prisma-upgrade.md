# Prisma upgrade path (not this release)

The platform stays on **Prisma ORM 5.22.0** until a dedicated migration window.

Planned sequence:

1. Stay on 5.22 while Next 15.5.24 and the current CI/security repair settle.
2. Prisma 5 → 6: client API and generator review in a isolated staging database.
3. Only then evaluate a newer supported line. There is no same-day jump.

Do not run `prisma migrate dev` against Neon. Use `prisma migrate deploy` for production-shaped databases.

Driver adapters and Prisma 7 breaking changes are out of scope until the 5 → 6 step is certified.
