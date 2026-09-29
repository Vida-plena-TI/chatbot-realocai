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
│   └── chat/           Chat/agente de IA (ainda vazio)
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

## Regras invioláveis

- **Nunca commitar segredos** (`.env`, chaves de API, senhas, tokens).
- **Nunca commitar dados de pacientes** — nem em fixtures, testes, logs, dumps ou exemplos.
  Use apenas dados fictícios.
- Não logar corpo de requisições nem conteúdo de conversas com dados pessoais.
