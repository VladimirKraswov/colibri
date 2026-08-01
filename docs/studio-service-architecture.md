# Colibri Studio service architecture

`studio/` turns the browser-only LLM Studio bundle into a self-contained local
service. The C/C++ inference processes remain focused model providers. Fastify
owns application behavior, PostgreSQL owns durable structured state, and MinIO
owns binary objects.

```mermaid
flowchart LR
  Browser["Browser"] -->|"HTTPS · REST + SSE"| Studio["LXC 202 · React + Fastify gateway"]
  Studio --> PG[("LXC 202 · PostgreSQL 16")]
  Studio --> S3[("LXC 104 · MinIO")]
  Studio --> CPU["LXC 201 · cpu-inference"]
  CPU --> Gemma["Gemma 4 · Colibri engine"]
  CPU --> Qwen["Qwen · llama.cpp engine"]
  CPU --> ASR["GigaAM ASR"]
  Studio -.-> VLM["VM5090 · future VLM"]
  Studio -.-> Images["VM5090 · future image provider"]
```

The control plane has no model weights and does not depend on a particular
accelerator. LXC 201 keeps Gemma and ASR resident; the much larger Qwen3.6 Q8
service is disabled at boot and loaded only through `qwen36ctl start`. LXC 202
owns the public product endpoint and can fan out to additional inference nodes.
`INFERENCE_PROVIDERS_JSON` maps stable provider keys to remote
OpenAI-compatible base URLs; engine rows refer to those keys.

## Boundaries

- `conversations`: conversation/message lifecycle and transactions;
- `engines`: provider registry, health and capability mapping;
- `chat`: prompt assembly, streaming, cancellation and final persistence;
- `attachments`: validation, MinIO objects and attachment metadata;
- `speech`: GigaAM transcription adapter;
- `settings`: durable workspace generation/UI settings;
- `legacy-import`: idempotent migration from the old localStorage payload;
- `platform`: PostgreSQL pool/migrations, S3 client, configuration and logging.

Each module exposes application ports. Infrastructure adapters implement these
ports and are wired only in the Fastify composition root. Route handlers do not
contain SQL, S3 calls, or provider-specific prompt conversion.

## Persistence

PostgreSQL stores workspaces, engines, settings, conversations, messages,
attachment metadata and import fingerprints. Message creation, attachment
binding and assistant placeholders are transactional. JSONB is limited to
provider metadata and evolving statistics; searchable domain fields remain
typed columns.

MinIO stores images, video, audio and source files in the private
`colibri-studio` bucket. Objects use workspace and attachment UUID prefixes;
their SHA-256 digest is stored beside the metadata for integrity checks and
future deduplication.
Fastify streams uploads/downloads and never exposes MinIO credentials to the
browser. The `ObjectStorage` port keeps MinIO replaceable with any S3-compatible
service.

## Compatibility and migration

The React client checks `llm-studio-conversations-v1` and
`llm-studio-settings-v2` once. If the workspace has not been imported, it sends
the old JSON payload to an idempotent import endpoint. A SHA-256 fingerprint
prevents duplicates. The old keys are retained as a rollback copy.

Nginx continues to expose the existing OpenAI-compatible routes for external
clients, while the new product API lives under `/api/v1`. HTTPS termination and
the microphone permission policy stay in Nginx; the React build is served by
Fastify so the application has one deployable service boundary.
