CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE engines (
  id text PRIMARY KEY,
  provider_key text NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  model text NOT NULL,
  context_window integer NOT NULL CHECK (context_window >= 1024),
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(capabilities) = 'array'),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  default_engine_id text NOT NULL REFERENCES engines(id),
  system_prompt text NOT NULL,
  temperature double precision NOT NULL DEFAULT 0.7 CHECK (temperature BETWEEN 0 AND 2),
  top_p double precision NOT NULL DEFAULT 0.8 CHECK (top_p BETWEEN 0 AND 1),
  top_k integer NOT NULL DEFAULT 20 CHECK (top_k >= 0),
  min_p double precision NOT NULL DEFAULT 0 CHECK (min_p BETWEEN 0 AND 1),
  presence_penalty double precision NOT NULL DEFAULT 1.5 CHECK (presence_penalty BETWEEN -2 AND 2),
  repeat_penalty double precision NOT NULL DEFAULT 1 CHECK (repeat_penalty >= 0),
  max_tokens integer NOT NULL DEFAULT 4096 CHECK (max_tokens BETWEEN 1 AND 32768),
  thinking_enabled boolean NOT NULL DEFAULT false,
  auto_compress boolean NOT NULL DEFAULT true,
  compression_threshold integer NOT NULL DEFAULT 75 CHECK (compression_threshold BETWEEN 50 AND 95),
  ui jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(ui) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  engine_id text NOT NULL REFERENCES engines(id),
  title text NOT NULL DEFAULT 'Новый диалог',
  context_summary text,
  compression_count integer NOT NULL DEFAULT 0 CHECK (compression_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX conversations_workspace_updated_idx
  ON conversations(workspace_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content text NOT NULL DEFAULT '',
  reasoning text,
  status text NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'streaming', 'cancelled', 'failed')),
  ordinal bigint GENERATED ALWAYS AS IDENTITY,
  client_request_id uuid,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(stats) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_ordinal_idx ON messages(conversation_id, ordinal);
CREATE UNIQUE INDEX messages_client_request_idx
  ON messages(conversation_id, client_request_id)
  WHERE role = 'user' AND client_request_id IS NOT NULL;

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'text')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  bucket text NOT NULL,
  object_key text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  text_content text,
  transcript text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attachments_message_idx ON attachments(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX attachments_orphan_idx ON attachments(workspace_id, created_at) WHERE message_id IS NULL;

CREATE TABLE legacy_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_version text NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  imported_conversations integer NOT NULL DEFAULT 0,
  imported_messages integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, fingerprint)
);

INSERT INTO engines(id, provider_key, display_name, description, model, context_window, capabilities, sort_order)
VALUES
  ('gemma4', 'gemma', 'Gemma 4 26B A4B QAT Q4_0', 'Gemma 4 26B-A4B IT · изображения и видео', 'gemma-4-26b-a4b-it-qat-q4_0', 131072, '["text","image","video"]', 10),
  ('legacy', 'qwen', 'Qwen3.6 35B A3B Q8_K_P', 'Предыдущая текстовая модель Qwen3.6-35B-A3B', 'qwen3.6-35b-q8', 131072, '["text"]', 20)
ON CONFLICT (id) DO UPDATE SET
  provider_key = EXCLUDED.provider_key,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  model = EXCLUDED.model,
  context_window = EXCLUDED.context_window,
  capabilities = EXCLUDED.capabilities,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO workspaces(slug, name)
VALUES ('local', 'Локальное пространство')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO workspace_settings(workspace_id, default_engine_id, system_prompt)
SELECT
  id,
  'gemma4',
  'Ты — универсальный локальный ИИ-ассистент. Точно выполняй запрос пользователя и отвечай на его языке. Сначала дай прямой ответ, затем только необходимое пояснение. Не выдумывай факты. Используй корректный Markdown.'
FROM workspaces
WHERE slug = 'local'
ON CONFLICT (workspace_id) DO NOTHING;
