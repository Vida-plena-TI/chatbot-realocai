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
│   ├── accounts/       Custom User (login por e-mail, sem username)
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

- API: `/api/health/`, schema OpenAPI em `/api/schema/`, Swagger em `/api/docs/`.
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

## Regras invioláveis

- **Nunca commitar segredos** (`.env`, chaves de API, senhas, tokens).
- **Nunca commitar dados de pacientes** — nem em fixtures, testes, logs, dumps ou exemplos.
  Use apenas dados fictícios.
- Não logar corpo de requisições nem conteúdo de conversas com dados pessoais.
