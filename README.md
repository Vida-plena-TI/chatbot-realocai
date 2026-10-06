# Chatbot RealocAI

Aplicação web da clínica multidisciplinar Vida Plena: um agente de IA com chatbot interativo.

> ⚠️ O sistema lida com dados de saúde (sensíveis pela LGPD). Nunca commite segredos
> ou dados de pacientes.

## Status

🚧 Backend (Django + DRF) com autenticação, conversas, envio de mensagens ao agente
RealocAI (com blocos de relatório), exportação de relatórios em Excel e extração de
memórias de longo prazo (OpenAI). Frontend em React + Vite em `frontend/`.

## Estrutura

```
backend/    Django 5.2 LTS + Django REST Framework
frontend/   React + Vite (SPA do chat)
```

## Pré-requisitos

- [uv](https://docs.astral.sh/uv/) (gerencia o Python e as dependências)
- Um projeto no [Supabase](https://supabase.com/) (PostgreSQL gerenciado)
- Acesso ao serviço **RealocAI** (agente de IA, outro repositório) e à sua chave de API,
  para o chat responder
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

#### RealocAI (agente de IA)

O chat encaminha as mensagens ao serviço RealocAI (FastAPI), sempre de servidor para
servidor: o navegador nunca vê a chave dele.

> ⚠️ **Conflito de porta em dev:** o `runserver` do Django usa a porta **8000**. Suba o
> RealocAI em outra porta, por exemplo `uvicorn ... --port 8001`, e aponte o
> `REALOCAI_BASE_URL` para ela.

No `.env` (nunca no `.env.example` nem em outro arquivo versionado):

```bash
REALOCAI_BASE_URL=http://localhost:8001
REALOCAI_API_KEY=<a mesma chave configurada no RealocAI>
REALOCAI_TIMEOUT_SECONDS=90
```

Peça a chave ao responsável pelo RealocAI (ou use a que você configurou na sua instância
local dele). Sem essas variáveis o resto da API funciona, mas enviar mensagem responde 502.

**Sem o RealocAI:** com `REALOCAI_USE_FAKE=true` o Django responde com textos fixos e com
os blocos de relatório de exemplo do RealocAI (dados fictícios), sem rede e sem chave. Só
para desenvolvimento e demonstração; nunca em produção. Peça "ocupação da semana",
"ocupação por especialidade", "pacientes por profissional", "relatório completo" (3 blocos)
ou "realocar" (proposta).

Deixe `REALOCAI_INJECT_MEMORIES=false`: é experimental e só deve ser ligada após validação
manual (ver `CLAUDE.md`).

#### OpenAI (extração de memórias)

Após cada resposta do agente, o Django chama a OpenAI diretamente para extrair
preferências do profissional e um resumo da conversa (nunca dados de pacientes). No
`.env`:

```bash
OPENAI_API_KEY=<chave da OpenAI>
OPENAI_EXTRACTION_MODEL=gpt-4o-mini
```

`OPENAI_API_KEY` é um segredo: nunca commite. Se ficar vazia, a extração fica desligada
e o chat funciona normalmente.

### 4. Instalar dependências e migrar

```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py createsuperuser   # pede e-mail e senha
```

> Não há cadastro público: veja [Contas da equipe](#contas-da-equipe).

### 5. Rodar

```bash
uv run python manage.py runserver
```

- Health check: http://localhost:8000/api/health/
- Documentação da API (Swagger): http://localhost:8000/api/docs/
- Schema OpenAPI: http://localhost:8000/api/schema/
  (públicos só com `DEBUG=true`; em produção exigem login de usuário `is_staff`, ex.: via `/admin/`)
- Admin: http://localhost:8000/admin/

## Contas da equipe

Só a equipe da clínica usa o sistema e **não existe endpoint de cadastro**. A primeira
conta é criada pela linha de comando (em qualquer ambiente, com o `.env` apontando para o
banco certo):

```bash
cd backend
uv run python manage.py createsuperuser        # interativo: pede e-mail e senha
```

Em produção (ou num script), sem prompt, passando os dados por variáveis de ambiente
(não deixe a senha no histórico do shell):

```bash
DJANGO_SUPERUSER_EMAIL=admin@exemplo.com.br DJANGO_SUPERUSER_PASSWORD='...' uv run python manage.py createsuperuser --noinput --settings=config.settings.prod
```

As demais contas são criadas por essa pessoa no admin (`/admin/` → Usuários). Marque
**membro da equipe** (`is_staff`) só para quem precisa do admin e da documentação da API;
os demais profissionais só precisam de uma conta ativa para usar a API.

### Testar o login manualmente (curl)

```bash
# 1. Obtém o cookie csrftoken
curl -s -c cookies.txt http://localhost:8000/api/auth/csrf/
CSRF=$(awk '$6=="csrftoken"{print $7}' cookies.txt)

# 2. Login (o CSRF também é exigido aqui)
curl -s -b cookies.txt -c cookies.txt -H "X-CSRFToken: $CSRF"   -H "Content-Type: application/json"   -d '{"email":"admin@exemplo.com.br","password":"..."}'   http://localhost:8000/api/auth/login/

# 3. Usuário atual
curl -s -b cookies.txt http://localhost:8000/api/auth/me/

# 4. Logout (o login rotaciona o token: releia o cookie)
CSRF=$(awk '$6=="csrftoken"{print $7}' cookies.txt)
curl -s -o /dev/null -w "%{http_code}
" -b cookies.txt -c cookies.txt   -H "X-CSRFToken: $CSRF" -X POST http://localhost:8000/api/auth/logout/

rm cookies.txt
```

### Testar o chat manualmente (curl)

Com o RealocAI rodando na porta 8001 e após o login acima (mantendo `cookies.txt`):

```bash
CSRF=$(awk '$6=="csrftoken"{print $7}' cookies.txt)

# 1. Cria uma conversa e guarda o id
ID=$(curl -s -b cookies.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json"   -d '{"title":"Teste"}' http://localhost:8000/api/conversations/   | python -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 2. Envia uma mensagem: 201 com user_message e assistant_message (pode levar segundos).
#    502 = o agente falhou e NADA foi gravado; 409 = já há uma mensagem em andamento.
curl -s -b cookies.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json"   -d '{"content":"Quais horarios livres amanha?"}'   http://localhost:8000/api/conversations/$ID/messages/

# 3. Lista as mensagens salvas (as do assistente com relatório trazem "blocos")
curl -s -b cookies.txt http://localhost:8000/api/conversations/$ID/messages/
```

### Testar relatórios e a exportação Excel (sem o RealocAI)

Suba o Django com `REALOCAI_USE_FAKE=true` (no `.env` ou no shell) e, após o login:

```bash
CSRF=$(awk '$6=="csrftoken"{print $7}' cookies.txt)
ID=$(curl -s -b cookies.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json"   -d '{}' http://localhost:8000/api/conversations/   | python -c "import sys,json;print(json.load(sys.stdin)['id'])")

# Pede um relatório: assistant_message.blocos traz os 3 blocos de exemplo
curl -s -b cookies.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json"   -d '{"content":"relatorio completo"}' -o resposta.json   http://localhost:8000/api/conversations/$ID/messages/

# Exporta os blocos em Excel (.xlsx)
python -c "import json;b=json.load(open('resposta.json',encoding='utf-8'))['assistant_message']['blocos'];json.dump({'formato':'excel','blocos':b},open('export.json','w',encoding='utf-8'))"
curl -s -b cookies.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json"   --data-binary @export.json -OJ http://localhost:8000/api/reports/export/
# → realocai-relatorios-AAAA-MM-DD.xlsx
```

> No Git Bash do Windows, texto acentuado passado em `-d` pode sair fora de UTF-8 (o
> Django responde 400 "JSON parse error"). Grave o JSON num arquivo UTF-8 e use
> `--data-binary @arquivo.json`.

> Com `DEBUG=true` o Django não exige HTTPS para os cookies, então isso funciona em
> `http://localhost`. O CSRF também confere a origem: o curl não envia `Origin`, e o
> navegador envia; por isso `CSRF_TRUSTED_ORIGINS` precisa conter a origem do frontend.

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

### Deploy

Cada mensagem segura um worker enquanto o RealocAI responde (até
`REALOCAI_TIMEOUT_SECONDS`, padrão 90 s) e depois a extração de memórias (até 20 s). Use
workers **gthread**, para que uma resposta lenta não bloqueie as demais requisições, e um
`--timeout` maior que `REALOCAI_TIMEOUT_SECONDS` (ex.: 120):

```bash
cd backend
uv run python manage.py migrate --settings=config.settings.prod
uv run python manage.py collectstatic --noinput --settings=config.settings.prod
uv run gunicorn config.wsgi:application --bind 0.0.0.0:8000 \
  --worker-class gthread --workers 2 --threads 4 --timeout 120
```

> Com 2 × 4 threads, até 8 mensagens são atendidas ao mesmo tempo; cada thread usa uma
> conexão com o Supabase (Session pooler), então confira o limite de conexões do plano.

Nunca use `REALOCAI_USE_FAKE=true` nem `ADMIN_SHOW_MESSAGE_CONTENT=true` em produção sem
necessidade justificada.

### Retenção de dados (LGPD)

Conversas apagadas pelo usuário continuam no banco (soft delete). Para removê-las de vez,
junto com as arquivadas sem atividade, rode à mão (não há agendamento):

```bash
cd backend
uv run python manage.py purge_old_conversations --days 365 --dry-run   # só conta
uv run python manage.py purge_old_conversations --days 365             # apaga
```

Regra: apaga as conversas com `deleted_at` há mais de N dias e as **arquivadas** sem
atividade (`updated_at`) há mais de N dias, com as mensagens. Conversas ativas nunca são
apagadas. Sem `--days` o comando não faz nada; `--days` precisa ser ≥ 1. Memórias não são
apagadas (perdem só o vínculo com a mensagem de origem).

Todas as variáveis estão documentadas em [`.env.example`](.env.example).
