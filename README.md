# ELICO Backend

NestJS API for the ELICO enterprise Time & Attendance platform.

## Local setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Start dependencies with `docker compose -f docker/docker-compose.yml up -d`.
3. Run `npm run prisma:generate` and `npm run prisma:migrate`.
4. Run `npm run start:dev`.

The API is versioned under `/api/v1`; Swagger is served at `/api/docs`.

## Ownership

- Person A: platform, identity, employees, devices, audit, super-admin.
- Person B: attendance, face recognition, shifts, leave, notifications, dashboards, reports.

See the two technical documents in the repository root for the architecture and task split.
