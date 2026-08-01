# Colibri Studio

Standalone local LLM product shell for the existing CPU inference providers.

- React 19 client in `apps/web`;
- Fastify 5 application/API in `apps/api`;
- shared TypeBox contracts in `packages/contracts`;
- PostgreSQL migrations owned by the API;
- private S3-compatible object storage (MinIO in LXC 104).

## Local development

Copy `.env.example` to `.env`, provide a PostgreSQL database and S3 credentials,
then run:

```bash
npm ci
npm run build
npm test
npm run dev:api
```

The Vite development server proxies `/api` to Fastify. Production serves the
compiled React application from the same Fastify process. Nginx terminates TLS
and preserves the existing OpenAI-compatible inference routes.

Database migrations are forward-only, checksummed, transactionally applied on
service startup and protected by a PostgreSQL advisory lock.
