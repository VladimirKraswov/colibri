# AI Control Center

Standalone gateway and control plane for local AI services: LLM/VLM inference,
ASR, TTS and future generation endpoints.

- React 19 client in `apps/web`;
- Fastify 5 application/API in `apps/api`;
- shared TypeBox contracts in `packages/contracts`;
- PostgreSQL migrations owned by the API;
- private S3-compatible object storage (MinIO in LXC 104).
- native RHVoice TTS service in `services/rhvoice-tts` (LXC 201).

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

In a distributed deployment, `INFERENCE_PROVIDERS_JSON` supplies an extensible
map of OpenAI-compatible inference endpoints. The AI Control Center plane can
therefore run in its own container and route to the CPU node, a VM5090 VLM, or
later model nodes without recompiling the API. `ASR_BASE_URL` remains separate
because speech transcription has a different contract. `TTS_BASE_URL` points
to the published RHVoice API used by Litora and the service catalog.

Database migrations are forward-only, checksummed, transactionally applied on
service startup and protected by a PostgreSQL advisory lock.

## Deployment profiles

- `deploy/install-runtime.sh` bootstraps the original co-located profile;
- `deploy/install-distributed-runtime.sh` bootstraps an isolated AI Control Center and PostgreSQL node;
- `deploy/install-rhvoice-tts.sh` installs RHVoice as a hardened systemd service on the CPU node;
- `deploy/nginx-ai-control-center.conf` is the co-located Nginx profile;
- `deploy/nginx-ai-control-center-gateway.conf` proxies compatibility routes from LXC 202 to CPU inference in LXC 201;
- `deploy/nginx-cpu-inference-gateway.conf` keeps the old LXC 201 address compatible after AI Control Center moves;
- `deploy/distributed.env.example` documents the node topology and future provider map.
