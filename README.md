# Chatbot RealocAI

Aplicação web da clínica multidisciplinar Vida Plena: um agente de IA com chatbot interativo.

> ⚠️ O sistema lida com dados de saúde (sensíveis pela LGPD). Nunca commite segredos
> ou dados de pacientes.

## Status

🚧 Fundação do backend pronta (Django + DRF). Chat, integração com LLM e frontend virão
nas próximas etapas.

## Estrutura

```
backend/    Django 5.2 LTS + Django REST Framework
frontend/   React + Vite (em breve)
```

## Pré-requisitos

- [uv](https://docs.astral.sh/uv/) (gerencia o Python e as dependências)
- Um projeto no [Supabase](https://supabase.com/) (PostgreSQL gerenciado)
- Git

> Não há Docker no projeto; o banco é o PostgreSQL do Supabase.

## Setup do zero

### 1. Clonar

```bash
git clone https://github.com/Vida-plena-TI/chatbot-realocai.git
cd chatbot-realocai
```

### 2. Obter a conexão do Supabase

No painel do Supabase: **Project Settings → Database → Connection string**, aba
**Session pooler** (porta 5432, compatível com IPv4). Copie a URL e substitua
`[YOUR-PASSWORD]` pela senha do banco.

> - Não use o **Transaction pooler** (porta 6543): ele não suporta conexões persistentes
>   nem cursores do Django.
> - Por conter dados de saúde (LGPD), prefira a região **South America (São Paulo)**.
> - O pytest usa um banco `test_postgres` no mesmo servidor e o reaproveita entre
>   execuções (`--reuse-db`). Após criar novas migrations, rode `uv run pytest --create-db`.

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` na raiz: cole a URL do passo 2 em `DATABASE_URL` e gere a `SECRET_KEY`:

```bash
cd backend
uv run python -c "from django.core.management.utils import get_random_secret_key as k; print(k())"
```

### 4. Instalar dependências e migrar

```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py createsuperuser   # pede e-mail e senha
```

### 5. Rodar

```bash
uv run python manage.py runserver
```

- Health check: http://localhost:8000/api/health/
- Documentação da API (Swagger): http://localhost:8000/api/docs/
- Schema OpenAPI: http://localhost:8000/api/schema/
- Admin: http://localhost:8000/admin/

## Testes e qualidade

```bash
cd backend
uv run pytest                  # testes
uv run ruff check .            # lint
uv run ruff format --check .   # verificação de formatação
uv run python manage.py check --deploy --settings=config.settings.prod
```

## Settings

| Módulo                  | Uso                                             |
| ----------------------- | ----------------------------------------------- |
| `config.settings.dev`   | Padrão do `manage.py` e do pytest               |
| `config.settings.prod`  | Padrão do `wsgi`/`asgi` (gunicorn); HTTPS, HSTS e cookies seguros |

Produção (exemplo):

```bash
cd backend
uv run python manage.py collectstatic --noinput --settings=config.settings.prod
uv run gunicorn config.wsgi:application --bind 0.0.0.0:8000
```

Todas as variáveis estão documentadas em [`.env.example`](.env.example).
