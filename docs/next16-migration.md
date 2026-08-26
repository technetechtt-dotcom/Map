# Next.js 16 migration (separate project)

Next 15.5 is Maintenance LTS. Next 16 is Active LTS. This is **not** mixed into the 15.5.24 security repair.

Before any 16.x bump:

- Keep React 18 and `react-leaflet` 4 until a React 19 compatibility pass exists.
- Confirm App Router, next-auth v4, and the PostGIS/server-external Prisma setup on a branch that is not `main`.
- Replace remaining Next 15-only APIs after 15.5.24 has been production-stable.

Do not land Next 16 and the security repair in the same commit.
