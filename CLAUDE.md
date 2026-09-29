# CLAUDE.md

## Visão do projeto

RealocAI é uma aplicação web para a clínica multidisciplinar Vida Plena: um agente de IA
com chatbot interativo. O sistema lida com **dados de saúde (sensíveis pela LGPD)**, então
segurança e privacidade têm prioridade sobre conveniência.

## Estrutura do monorepo

```
/
├── backend/            Django 5.2 LTS + Django REST Framework (Python 3.12+, uv)
│   ├── config/         Projeto Django (urls, wsgi, asgi)
│   │   └── settings/   base.py, dev.py, prod.py
│   ├── accounts/       Custom User (login por e-mail) + endpoints /api/auth/
│   ├── core/           Utilitários compartilhados + health check
│   └── chat/           Conversas, mensagens e memórias do agente (models + services)
├── frontend/           React + Vite (será adicionado depois; não modificar sem pedido)
├── .env.example        Todas as variáveis de ambiente documentadas
└── CLAUDE.md
```

## Comandos (rodar dentro de `backend/`)

```bash
uv sync                                   # instala dependências (inclui dev)
uv run python manage.py migrate           # aplica migrations
uv run python manage.py runserver         # servidor de dev (config.settings.dev)
uv run python manage.py makemigrations    # gera migrations
uv run pytest                             # testes
uv run ruff check .                       # lint
uv run ruff format .                      # formatação
uv run python manage.py check --deploy --settings=config.settings.prod
```

- API: `/api/health/`, `/api/auth/...`, schema OpenAPI em `/api/schema/`, Swagger em
  `/api/docs/` (públicos só com `DEBUG=True`; fora disso, apenas usuários `is_staff`).
- Configuração vem de variáveis de ambiente / `.env` na **raiz** do repositório.
- Banco: PostgreSQL gerenciado no **Supabase**, via *Session pooler* (porta 5432) com
  `sslmode=require`. Não usar o Transaction pooler (6543). Não há Docker no projeto.

## Convenções

- Código, identificadores, comentários de código e mensagens de commit em **inglês**.
- Conversas com o usuário em **português**.
- Commits no padrão Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`...).
- Toda configuração sensível via variável de ambiente; nada hardcoded.
- DRF é "seguro por padrão": `IsAuthenticated` é global; endpoints públicos precisam
  declarar `AllowAny` explicitamente.
- Não instalar pacotes globalmente; usar `uv add` / `uv add --dev`.
- Toda funcionalidade nova vem com testes (pytest-django).

## Autenticação

Sessão do Django + CSRF (sem JWT). O SPA é servido na mesma origem da API em produção.
Não existe autocadastro: contas são criadas pelo admin ou por `createsuperuser`.

Fluxo que o frontend deve seguir:

1. `GET /api/auth/csrf/` → seta o cookie `csrftoken` (não é HttpOnly; o JS lê).
2. `POST /api/auth/login/` com `{email, password}` e header `X-CSRFToken: <csrftoken>`.
   Sucesso: 200 com `{id, email, full_name, is_staff}` e cookie `sessionid` (HttpOnly).
   Falha: sempre 401 `{"detail": "Credenciais inválidas."}`; 429 após 5 tentativas/min por IP.
3. Requisições autenticadas: cookies enviados (`credentials: "include"` em dev com CORS) e,
   em métodos não seguros (POST/PUT/PATCH/DELETE), header `X-CSRFToken`.
   **O login rotaciona o token CSRF**: leia o cookie a cada requisição, não guarde em cache.
4. `GET /api/auth/me/` → 200 com o usuário, ou 401 se não há sessão (use ao carregar o app).
5. `POST /api/auth/logout/` (com `X-CSRFToken`) → 204.

Anônimo recebe **401**; autenticado sem permissão, **403** (via
`core.authentication.SessionAuthentication`). O CSRF é exigido também no login.

## Modelo de dados do chat (`backend/chat/`)

Todas as PKs são UUID. Dados de saúde: usar só dados fictícios em testes e exemplos.

- **Conversation** — pertence a um `user` (`related_name="conversations"`); `title`,
  `status` (`active`/`archived`), `summary` (resumo incremental para contexto longo),
  `metadata` (JSON), `created_at`, `updated_at`, `deleted_at` (soft delete: conversa
  "apagada" continua no banco, com as mensagens). Índice em `(user, -updated_at)`.
- **Message** — pertence a uma `conversation` (`related_name="messages"`); `seq` (ordem na
  conversa, único por conversa via `UniqueConstraint`), `role`
  (`system`/`user`/`assistant`/`tool`), `content`, `model`, `prompt_tokens`,
  `completion_tokens`, `finish_reason`, `metadata` (tool calls etc.), `created_at`.
  Ordenação padrão por `seq`.
- **Memory** — memória de longo prazo de um `user` (`related_name="memories"`); `kind`
  (`fact`/`preference`/`summary`), `content`, `source_message` (FK para Message,
  `SET_NULL`), `importance` (1–5, padrão 3), `is_active` (desativar em vez de apagar),
  `last_used_at`, `expires_at`, `created_at`, `updated_at`. Índice em
  `(user, is_active, -importance)`.

Apagar um User apaga em cascata suas conversas, mensagens e memórias.

### Camada de serviço (`chat/services/conversations.py`)

Views e a integração com o LLM devem usar estas funções, não escrever nos models direto:

- `create_conversation(user, title="")`
- `append_message(conversation, role, content, **extra)` — atribui `seq = último + 1`
  dentro de `transaction.atomic()` com `select_for_update()` na Conversation (seguro sob
  concorrência) e atualiza `updated_at`. `extra`: `model`, `prompt_tokens`,
  `completion_tokens`, `finish_reason`, `metadata`. `role` inválido → `ValueError`.
- `get_context_messages(conversation, limit=None)` — últimas N mensagens em ordem
  cronológica, como `[{"role", "content"}]`.
- `soft_delete_conversation(conversation)` — preenche `deleted_at` (idempotente).
- `add_memory(user, kind, content, source_message=None, importance=3)` — roda
  `full_clean()` (valida `kind` e `importance`); inválido → `ValidationError`.
- `deactivate_memory(memory)`
- `get_active_memories(user, limit=20)` — ativas e não expiradas, por `importance` desc e
  `created_at` desc.

No admin, mensagens são somente leitura (registro de auditoria) e não podem ser criadas
por lá.

## Regras invioláveis

- **Nunca commitar segredos** (`.env`, chaves de API, senhas, tokens).
- **Nunca commitar dados de pacientes** — nem em fixtures, testes, logs, dumps ou exemplos.
  Use apenas dados fictícios.
- Não logar corpo de requisições nem conteúdo de conversas com dados pessoais.
