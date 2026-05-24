# Threat Model

## Project Overview

This repository is a pnpm workspace with a public Replit deployment. The production application consists of a React/Vite frontend in `artifacts/aether`, a small Express API in `artifacts/api-server`, and shared libraries in `lib/` for the OpenAPI client, Zod schemas, and database access. The deployed API currently exposes a minimal health-check surface, and the frontend is a mostly static interactive experience.

For scan scoping, `artifacts/mockup-sandbox` is treated as a development-only mockup environment and should be ignored unless future scans show that it is included in the production deployment path.

## Assets

- **Deployment availability** — the public site and `/api` routes must remain reachable and resistant to trivial abuse or crashes.
- **Application secrets and infrastructure credentials** — `DATABASE_URL`, future API keys, and any signing secrets must remain server-only and must not leak through logs, bundles, or error responses.
- **Database contents and integrity** — the PostgreSQL connection configured in `lib/db` must not become reachable through injection, unauthorized queries, or accidental exposure.
- **Request metadata and headers** — authorization and cookie material must not be logged or reflected back to clients.

## Trust Boundaries

- **Browser to API** — all requests from the public internet to the Express server cross an untrusted boundary and must be validated and handled safely.
- **API to database** — `artifacts/api-server` and `lib/db` hold privileged access to PostgreSQL through `DATABASE_URL`; compromise here would expose all stored data.
- **Build-time environment to runtime bundle** — Vite and esbuild consume environment variables and local files during build; secrets must not be embedded into client assets.
- **Production vs dev-only artifacts** — `artifacts/aether` and `artifacts/api-server` are in scope for production review; `artifacts/mockup-sandbox` is out of scope unless explicitly deployed.

## Scan Anchors

- Production entry points: `artifacts/aether/src/main.tsx`, `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `lib/db/src/index.ts`
- Highest-risk areas: `artifacts/api-server/src/`, `lib/db/src/`, `lib/api-client-react/src/custom-fetch.ts`
- Public surface: frontend bundle in `artifacts/aether`, API router mounted at `/api`
- Authenticated/admin surface: none currently implemented in production code
- Usually dev-only: `artifacts/mockup-sandbox/`, Vite dev-server settings, generated preview modules under `.generated/`

## Threat Categories

### Spoofing

There is no user authentication in the current production code, so the main spoofing risk is future accidental exposure of token-based or trusted-service flows without server-side verification. Any newly added protected route MUST validate the caller on the server side rather than relying on the client or generated API hooks.

### Tampering

All request data that reaches the API is untrusted. Any future state-changing or database-backed endpoint MUST validate input with schema checks and use parameterized database access. Client-side code in `artifacts/aether` must not be treated as an authority for business logic or authorization decisions.

### Information Disclosure

The main disclosure risks in this project are leaking secrets through logs, bundling server-only configuration into the frontend, or adding verbose error paths that reveal internals. Server logs MUST continue to redact authorization and cookie headers, and production responses MUST not expose stack traces, connection details, or other sensitive diagnostics.

### Denial of Service

Because the deployment is public, any future expensive route, large upload path, or blocking external call could become a trivial abuse target. Public endpoints MUST stay cheap by default, and any future heavy or state-changing operation MUST have appropriate bounds such as request size limits, timeouts, and rate limiting where relevant.

### Elevation of Privilege

The most important privilege-escalation risks for this codebase are hidden route expansion, broken access control if auth is added later, and server-side injection into the database layer. All database interaction MUST remain parameterized, and any future admin or user-specific capability MUST be enforced on the server, not just hidden in the frontend.
