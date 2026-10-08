# Deploy no Easypanel (produção)

Guia para publicar o chatbot RealocAI da Vida Plena numa VPS com **Easypanel v2.36**,
projeto `producao`. Tudo que vai em cada aba do painel está aqui. Nenhum segredo fica no
repositório: os valores reais só existem na aba **Environment** de cada App.

> Dados de saúde (LGPD): leia a [checklist LGPD](#checklist-lgpd) antes do primeiro
> deploy.

## Arquitetura

```
navegador
  │ https://chatbot.vidaplenamulti.com.br       https://api-chatbot.vidaplenamulti.com.br
  ▼                                              ▼
Traefik (Easypanel, TLS Let's Encrypt, redireciona HTTP -> HTTPS)
  │                                              │
  ▼ :8080                                        ▼ :8000
App "chatbot-frontend"                        App "chatbot-backend"
nginx não-root, SPA estática                  Django + gunicorn (gthread), não-root
                                                │                 │
                                                ▼                 ▼
                                    Supabase Postgres      RealocAI (FastAPI)
                                    sa-east-1, Session     https://realocai.vidaplenamulti.com.br
                                    pooler :5432, TLS      (+ OpenAI só para extração de memórias)
```

- Dois Apps do mesmo repositório (`Vida-plena-TI/chatbot-realocai`, branch `main`), cada
  um com o próprio caminho de build (`/backend` e `/frontend`) e o próprio `Dockerfile`.
- Front e API são **subdomínios irmãos**. O cookie `csrftoken` usa
  `Domain=.vidaplenamulti.com.br` para o front conseguir lê-lo. O `sessionid` fica só no
  host da API (HttpOnly). Ver [Cookies entre subdomínios](#cookies-entre-subdomínios).
- **Sem volumes**: os dois Apps não guardam estado. Os dados ficam só no Postgres; os
  arquivos estáticos (admin, docs da API) vão dentro da imagem, servidos pelo whitenoise.

| App | Caminho de build | Porta interna | Healthcheck (Docker `HEALTHCHECK`) |
|---|---|---|---|
| `chatbot-backend` | `/backend` | `8000` (variável `PORT`) | `GET /api/health/` via `docker/healthcheck.py` (envia o Host público e `X-Forwarded-Proto: https`; não toca no banco nem em serviços pagos) |
| `chatbot-frontend` | `/frontend` | `8080` (variável `PORT`) | `GET /healthz` (resposta estática do nginx) |

## Dependências

- **Postgres (Supabase)**: projeto **novo, só de produção**, região `sa-east-1` (São
  Paulo), conexão pelo **Session pooler** (porta 5432, `sslmode=require`). Nunca aponte a
  produção para o projeto de desenvolvimento, nem o contrário: os testes (`pytest
  --reuse-db`) usam o banco do `.env` local.
- **RealocAI**: `https://realocai.vidaplenamulti.com.br` (`POST /agenda/chat`, header
  `X-API-Key`). Precisa estar no ar antes do primeiro teste de chat. Pode levar dezenas de
  segundos por resposta.
- **OpenAI** (opcional): só para a extração de memórias. `OPENAI_API_KEY` vazia desliga a
  extração e o chat continua funcionando.

## DNS

No provedor do domínio `vidaplenamulti.com.br`, crie dois registros **A** apontando para o
IP da VPS:

| Tipo | Nome | Valor | Proxy |
|---|---|---|---|
| A | `chatbot` | IP da VPS | **DNS only** (sem proxy da Cloudflare) |
| A | `api-chatbot` | IP da VPS | **DNS only** |

Espere a propagação (`dig +short chatbot.vidaplenamulti.com.br` devolve o IP) antes de
ligar os domínios no Easypanel: o Let's Encrypt precisa resolver o nome para emitir o
certificado.

> **Se a Cloudflare (proxy, nuvem laranja) for ativada depois:** mude `NUM_PROXIES` para
> `2` (Cloudflare + Traefik). Sem isso, o throttle (login 5/min, chat 30/min) passa a
> contar o IP da Cloudflare e bloqueia usuários que não têm nada a ver entre si. Atenção:
> o plano gratuito da Cloudflare corta respostas que demoram mais de **100 s** (erro
> 524). Um turno de chat pode levar até ~190 s, então respostas longas seriam
> interrompidas.

## Variáveis de ambiente

Os valores abaixo são **exemplos falsos**. Gere os segredos reais na hora e cole só no
painel. Os nomes e comentários também estão em [`.env.example`](../.env.example) e
[`frontend/.env.example`](../frontend/.env.example).

### Backend (runtime, aba Environment do App `chatbot-backend`)

O backend valida o ambiente ao iniciar (`config/env_check.py`). Se algo faltar ou estiver
inválido, o container **para** e o log lista **todos** os problemas de uma vez, só com os
nomes das variáveis, por exemplo:

```
Invalid production environment (3 problem(s)):
  - SECRET_KEY: required
  - REALOCAI_USE_FAKE: must be false in production
  - CSRF_TRUSTED_ORIGINS: item 1 must use https://
```

| Nome | Obrigatória? | Exemplo (falso) / valor | Observação |
|---|---|---|---|
| `SECRET_KEY` | **Sim** | `<gerar: 50+ caracteres aleatórios>` | Gere com `python -c "import secrets; print(secrets.token_urlsafe(64))"`. Placeholders como `change-me` e chaves `django-insecure-...` são recusados. Trocar a chave derruba todas as sessões. |
| `DATABASE_URL` | **Sim** | `postgres://postgres.<ref>:<senha>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres` | Supabase > Connect > **Session pooler**. Senha com `@ : / # ?` precisa de URL-encode. Nunca o Transaction pooler (6543). |
| `ALLOWED_HOSTS` | **Sim** | `api-chatbot.vidaplenamulti.com.br` | Sem esquema e sem `*`. |
| `CSRF_TRUSTED_ORIGINS` | **Sim** | `https://chatbot.vidaplenamulti.com.br` | Origem do front, com `https://`. |
| `CORS_ALLOWED_ORIGINS` | **Sim** (neste desenho) | `https://chatbot.vidaplenamulti.com.br` | Só a origem do front. Nunca inclua `painel.`, `realocai.` etc. |
| `CSRF_COOKIE_DOMAIN` | **Sim** (neste desenho) | `.vidaplenamulti.com.br` | O front precisa ler o `csrftoken`. Validado: a origem do CORS tem de estar sob esse domínio. |
| `SESSION_COOKIE_DOMAIN` | Não | *(vazio)* | **Deixe vazio**: `sessionid` só no host da API. |
| `NUM_PROXIES` | **Sim** | `1` | Só o Traefik. Com o proxy da Cloudflare: `2`. |
| `REALOCAI_BASE_URL` | **Sim** | `https://realocai.vidaplenamulti.com.br` | `https://` obrigatório (a API key trafega no header). |
| `REALOCAI_API_KEY` | **Sim** | `<chave fornecida pelo responsável do RealocAI>` | Segredo. |
| `DEBUG` | Não | `false` | `true` aborta a inicialização. |
| `REALOCAI_USE_FAKE` | Não | `false` | `true` aborta a inicialização. |
| `REALOCAI_TIMEOUT_SECONDS` | Não | `90` | Timeout de leitura de cada chamada ao RealocAI. |
| `REALOCAI_INJECT_MEMORIES` | Não | `false` | Experimental; só depois de validação manual (ver CLAUDE.md). |
| `OPENAI_API_KEY` | Não | *(vazio = extração desligada)* | Segredo. |
| `OPENAI_EXTRACTION_MODEL` | Não | `gpt-4o-mini` | |
| `DB_SSLMODE` | Não | `require` | `disable` só para Postgres na rede interna do Easypanel. |
| `CONN_MAX_AGE` | Não | `60` | Segundos de reuso da conexão. |
| `LOG_LEVEL` | Não | `INFO` | `DEBUG`/`INFO`/`WARNING`/`ERROR`/`CRITICAL`. |
| `MESSAGE_MAX_LENGTH` | Não | `2000` | |
| `REPORTS_EXPORT_MAX_BYTES` | Não | `2097152` | Limite do corpo da exportação Excel (o limite do Django acompanha automaticamente). |
| `ADMIN_SHOW_MESSAGE_CONTENT` | Não | `false` | Manter `false` (LGPD). |
| `ADMIN_URL` | Não | `admin/` | Caminho do Django admin (ex.: `gestao-vp/`). Sem `/` no início, com `/` no fim. |
| `SECURE_SSL_REDIRECT` | Não | `true` | |
| `SECURE_HSTS_SECONDS` | Não | `3600` | Ver [HSTS](#hsts-como-subir-o-valor). |
| `SECURE_HSTS_INCLUDE_SUBDOMAINS` | Não | `false` | |
| `SECURE_HSTS_PRELOAD` | Não | `false` | |
| `PORT` | Não | `8000` | Se mudar, mude também a porta em Domains. |
| `GUNICORN_WORKERS` | Não | `2` | |
| `GUNICORN_THREADS` | Não | `4` | Workers x threads = conexões simultâneas com o banco. |
| `GUNICORN_TIMEOUT` | Não | `240` | Validado: precisa ser > 2 x (`REALOCAI_TIMEOUT_SECONDS` + 5). |
| `GUNICORN_GRACEFUL_TIMEOUT` | Não | `30` | |
| `GUNICORN_KEEPALIVE` | Não | `95` | |
| `GUNICORN_LOG_LEVEL` | Não | `info` | |

`DJANGO_SETTINGS_MODULE` já vem fixado como `config.settings.prod` na imagem. **Não
defina** essa variável no painel: o entrypoint recusa qualquer outro valor.

**Conta do timeout.** O pior turno chama o RealocAI duas vezes (a conversa expirou, 404,
e o turno recomeça): 2 × (5 s de conexão + 90 s de leitura) = **190 s**. Depois vêm a
gravação e a extração de memórias (até 20 s). `GUNICORN_TIMEOUT=240` deixa margem. Se
subir `REALOCAI_TIMEOUT_SECONDS`, suba também o `GUNICORN_TIMEOUT`; a validação recusa
combinações incoerentes.

### Frontend (build args, aba Environment do App `chatbot-frontend`)

`VITE_*` são **embutidas no JavaScript durante o build** e são **públicas**: nunca
coloque segredos nelas. Mudar o valor exige **novo build** (Deploy).

| Nome | Obrigatória? | Valor | Observação |
|---|---|---|---|
| `VITE_API_BASE_URL` | **Sim** | `https://api-chatbot.vidaplenamulti.com.br` | Sem `/` no final. O build **falha** se estiver vazia ou sem `https://`. |
| `VITE_USE_MOCK` | Não | `false` | O build **falha** com qualquer valor diferente de `false`. |
| `PORT` | Não (runtime) | `8080` | Porta do nginx. Se mudar, mude também a porta em Domains. |

O Easypanel repassa as variáveis da aba Environment como build args (`--build-arg`). O
build também confere que a URL da API foi parar no bundle. Se o log de build mostrar
`build: VITE_API_BASE_URL must be set to an https:// origin`, a variável não chegou ao
build: confira o nome e o valor na aba Environment.

## Passo a passo no Easypanel

Ordem: **DNS → Supabase → backend → frontend → testes pós-deploy**.

### 0. Supabase (produção)

1. Crie (ou confirme) o projeto **novo**, região **South America (São Paulo)
   `sa-east-1`**, com senha forte do banco (gerenciador de senhas; nunca no repositório).
2. **Desligue a Data API** (Project Settings → Data API / API → desabilitar, ou remover
   `public` dos *exposed schemas*). O Django cria as tabelas no schema `public`, sem RLS. Com
   a Data API ligada, elas ficam expostas pela API REST do Supabase. O Django não usa essa
   API.
3. Copie a connection string do **Session pooler** (Connect → Session pooler) para usar em
   `DATABASE_URL`.
4. Confira o *pool size* do pooler (Database settings): o backend usa até
   `GUNICORN_WORKERS × GUNICORN_THREADS` = 8 conexões, mais 1 durante as migrações.

### 1. App `chatbot-backend`

- **Source**: GitHub → owner `Vida-plena-TI`, repositório `chatbot-realocai`, branch
  `main`, **Build Path `/backend`**.
- **Build**: tipo **Dockerfile**, arquivo `Dockerfile` (relativo ao Build Path).
- **Environment**: as variáveis da [tabela do backend](#backend-runtime-aba-environment-do-app-chatbot-backend).
  Valores de produção:

  ```
  SECRET_KEY=<gerar>
  DATABASE_URL=<Session pooler do projeto de produção>
  ALLOWED_HOSTS=api-chatbot.vidaplenamulti.com.br
  CSRF_TRUSTED_ORIGINS=https://chatbot.vidaplenamulti.com.br
  CORS_ALLOWED_ORIGINS=https://chatbot.vidaplenamulti.com.br
  CSRF_COOKIE_DOMAIN=.vidaplenamulti.com.br
  SESSION_COOKIE_DOMAIN=
  NUM_PROXIES=1
  REALOCAI_BASE_URL=https://realocai.vidaplenamulti.com.br
  REALOCAI_API_KEY=<chave>
  REALOCAI_USE_FAKE=false
  DEBUG=false
  ADMIN_SHOW_MESSAGE_CONTENT=false
  OPENAI_API_KEY=<chave ou vazio>
  ```

- **Domains**: host `api-chatbot.vidaplenamulti.com.br`, HTTPS ligado, path `/`, **porta
  `8000`**.
- **Mounts/Volumes**: nenhum.
- **Réplicas**: 1. As migrações rodam no início do container. Com mais de uma réplica,
  duas migrariam ao mesmo tempo.
- Clique em **Deploy** e acompanhe os logs. O esperado é: `Production environment OK.`,
  as migrações (`Applying ...` no primeiro deploy), `Listening at: http://0.0.0.0:8000` e
  `Using worker: gthread`. O status fica *healthy* em até ~1 min.
- **Primeiro acesso ao admin**: no Console do App (shell do container), rode
  `python manage.py createsuperuser`. Não há autocadastro: as contas dos usuários são
  criadas no admin (`https://api-chatbot.vidaplenamulti.com.br/<ADMIN_URL>`).

### 2. App `chatbot-frontend`

- **Source**: mesmo repositório e branch, **Build Path `/frontend`**.
- **Build**: tipo **Dockerfile**, arquivo `Dockerfile`.
- **Environment** (viram build args):

  ```
  VITE_API_BASE_URL=https://api-chatbot.vidaplenamulti.com.br
  VITE_USE_MOCK=false
  ```

- **Domains**: host `chatbot.vidaplenamulti.com.br`, HTTPS ligado, path `/`, **porta
  `8080`**.
- **Mounts/Volumes**: nenhum.
- **Deploy**. O log de build mostra `npm ci`, `check:blocks` e `vite build`. Na execução,
  o nginx sobe sem erros e o status fica *healthy*.

### Deploys seguintes

Fluxo: branch → push → PR → merge na `main` → Deploy no Easypanel (manual, ou automático
se o *auto deploy* via webhook do GitHub estiver ligado). **Mudar uma variável exige
clicar em Deploy.** No frontend, a mudança só vale depois de um novo build.

Durante o deploy, a requisição em andamento recebe SIGTERM e tem até
`GUNICORN_GRACEFUL_TIMEOUT` para terminar, limitado ao *stop grace period* do Docker
(10 s por padrão no Swarm). Um chat em andamento no momento do deploy pode falhar, sem
gravar nada; o usuário reenvia. A conversa pode responder 409 por até ~2 min (a
reivindicação presa expira sozinha).

## Testes pós-deploy (manuais)

Faça na ordem, com um usuário de teste e **dados fictícios**:

1. **Health**: `curl -s https://api-chatbot.vidaplenamulti.com.br/api/health/` → `{"status":"ok"}`
   e `curl -s https://chatbot.vidaplenamulti.com.br/healthz` → `ok`.
2. **Headers**: `curl -sI https://chatbot.vidaplenamulti.com.br/` mostra
   `Content-Security-Policy`, `X-Frame-Options: DENY`, `Cache-Control: no-cache`.
   `curl -sI https://api-chatbot.vidaplenamulti.com.br/api/health/` mostra
   `Strict-Transport-Security: max-age=3600`.
3. **Login + CSRF entre subdomínios**: abra `https://chatbot.vidaplenamulti.com.br`, faça
   login. No DevTools (Application → Cookies), confira:
   - `csrftoken` com Domain `.vidaplenamulti.com.br`, Secure, SameSite=Lax, **sem**
     HttpOnly;
   - `sessionid` com Domain `api-chatbot.vidaplenamulti.com.br` (host-only), HttpOnly,
     Secure.

   Crie, renomeie e arquive uma conversa (POST/PATCH com `X-CSRFToken`). Nenhum 403.
4. **Recarregar numa rota interna** (`/c/<id>`): a página abre, sem 404 (fallback do SPA).
5. **Chat longo sem timeout**: peça um relatório pesado (ex.: ocupação do mês de várias
   especialidades). No DevTools → Network, o `POST .../messages/` precisa terminar com
   **201**, mesmo passando de 60 s. Se cair com **504** ou conexão encerrada perto de
   60 s ou 100 s, o limite está no proxy: veja [Traefik](#traefik-versão-e-timeouts).
6. **Excel**: num cartão de relatório, exporte **Excel** → download `.xlsx` abre no Excel.
7. **PDF**: exporte **PDF** → abre a janela de impressão com o cartão no tema claro. No
   console do DevTools, **nenhum** erro `Content-Security-Policy`.
8. **Throttle**: 6 logins errados seguidos → o 6º recebe 429. Isso confirma que o IP real
   chega via `NUM_PROXIES=1` e que o limite é compartilhado entre os workers.
9. **Logs**: nos logs do backend aparecem só método, caminho (sem query string), status,
   tamanho e duração. Nenhum texto de mensagem.

## Traefik: versão e timeouts

A versão e os timeouts do Traefik embarcado no Easypanel não foram verificados. Na VPS
(SSH):

```bash
docker service ls | grep -i traefik                 # nome do serviço e imagem (versão)
docker service inspect <servico-traefik> --pretty  # args, mounts e arquivos de configuração
```

Procure por `respondingTimeouts` (`readTimeout`, `writeTimeout`, `idleTimeout`) e por
middlewares `buffering` (`maxRequestBodyBytes`) na configuração estática e dinâmica:

- **Respostas longas**: no Traefik v2/v3, por padrão, não há limite para esperar a
  resposta do backend (`writeTimeout` 0 e `responseHeaderTimeout` 0). O `readTimeout` do
  v3 (60 s) vale para **ler a requisição** do cliente, não para a resposta. Se houver
  valores customizados, eles precisam ser maiores que 240 s.
- **Tamanho do corpo**: o Traefik não limita o corpo por padrão (só com o middleware
  `buffering`). A exportação aceita até `REPORTS_EXPORT_MAX_BYTES` (2 MB): acima disso a
  própria API responde 413. O gunicorn não limita o corpo, e o
  `DATA_UPLOAD_MAX_MEMORY_SIZE` do Django fica 512 KB acima do limite da exportação.
- Confirme na prática com o teste 5 acima.

## Cookies entre subdomínios

- `chatbot.*` e `api-chatbot.*` são o **mesmo site** (mesmo domínio registrável), então
  cookies SameSite=Lax vão nas chamadas `fetch` com `credentials: 'include'`, e o CORS
  libera só a origem do front, com credenciais.
- O `csrftoken` com `Domain=.vidaplenamulti.com.br` também é enviado a `painel.`,
  `realocai.` e qualquer outro subdomínio, que podem lê-lo ou sobrescrevê-lo. O impacto é
  baixo: o token sozinho não autentica, e a API confere a origem (`CSRF_TRUSTED_ORIGINS`
  e CORS restritos ao front). Para manter assim:
  - não hospede conteúdo de terceiros ou enviado por usuários em
    `*.vidaplenamulti.com.br`;
  - nunca coloque outros subdomínios em `CSRF_TRUSTED_ORIGINS` nem em
    `CORS_ALLOWED_ORIGINS`.
- Se algum dia existir um `csrftoken` antigo só do host da API (ex.: o
  `CSRF_COOKIE_DOMAIN` foi trocado), o navegador pode enviar dois cookies com o mesmo nome
  e causar 403. Solução: limpar os cookies do site.

## HSTS: como subir o valor

O backend começa com `SECURE_HSTS_SECONDS=3600` (1 h). O header só vale para
`api-chatbot.*`; com `SECURE_HSTS_INCLUDE_SUBDOMAINS=false`, nada além desse host. Depois
de confirmar HTTPS estável, suba aos poucos, um Deploy por vez: `86400` (1 dia) →
`2592000` (30 dias) → `31536000` (1 ano). Só ligue `SECURE_HSTS_PRELOAD` se **todos** os
subdomínios de `vidaplenamulti.com.br` tiverem HTTPS permanente: o preload é difícil de
desfazer.

## Rollback

1. **Código**: reverta o merge na `main` (`git revert <merge>` → PR → merge) e faça
   Deploy. Assim o histórico fica limpo e o Easypanel builda a versão anterior.
2. **Variáveis**: corrija na aba Environment e clique em Deploy. Se o backend nem sobe, o
   log da validação diz quais variáveis estão erradas.
3. **Migrações**: o Django não desfaz migrações sozinho. Se a versão revertida tinha uma
   migração **destrutiva** (remover coluna ou tabela), desfaça antes, pelo Console, com
   `python manage.py migrate <app> <migração_anterior>`, ou restaure o backup. Regra para
   os PRs: migrações compatíveis com a versão anterior (adicionar antes de remover).
4. **Dados**: restaure o backup (abaixo).

## Backup do banco

**Supabase (escolhido):**

- **Plano Pro**: backups diários automáticos (retenção de 7 dias no Pro) e restauração
  pelo painel. PITR (*point-in-time recovery*) é um add-on pago.
- **Plano Free**: **sem backups baixáveis**. Faça `pg_dump` manual e periódico a partir
  de uma máquina confiável:

  ```bash
  # Cliente pg_dump com versão >= à do servidor do Supabase.
  pg_dump "<DATABASE_URL de produção>" --format=custom --no-owner --file=realocai-AAAA-MM-DD.dump
  ```

  Guarde o arquivo **criptografado** e com acesso restrito (contém dados de saúde).
  Nunca no repositório: `*.dump` está no `.gitignore`. Atenção: no Free, projetos sem
  atividade por uma semana são **pausados**. Para produção, prefira o Pro.

**Alternativa: Postgres como serviço do Easypanel (não implementado).** Crie um serviço
Postgres no projeto `producao`, com volume persistente. Use
`DATABASE_URL=postgres://<usuario>:<senha>@<projeto>_<servico>:5432/<banco>` (host interno
do Easypanel) e `DB_SSLMODE=disable` (tráfego só na rede interna Docker, sem TLS). Prós:
latência menor e dados na própria VPS. Contras: backups, atualizações e monitoramento por
nossa conta (configure os backups do Easypanel para um storage externo e teste a
restauração), e a região dos dados passa a ser a da VPS.

## Checklist LGPD

- [ ] Projeto Supabase de produção na região **sa-east-1 (São Paulo)**, separado do de
      desenvolvimento.
- [ ] **Data API do Supabase desligada** (ou `public` fora dos schemas expostos).
- [ ] Senha do banco, `SECRET_KEY`, `REALOCAI_API_KEY` e `OPENAI_API_KEY` só no painel e
      no gerenciador de senhas; nunca em chat, e-mail, commit ou print.
- [ ] `ADMIN_SHOW_MESSAGE_CONTENT=false` (admin mostra só metadados das mensagens).
- [ ] `REALOCAI_USE_FAKE=false`, `DEBUG=false` (a validação garante).
- [ ] `REALOCAI_INJECT_MEMORIES=false` até a validação manual descrita no CLAUDE.md.
- [ ] Logs sem conteúdo: o access log não tem query string, IP, user agent nem corpo, e
      os tracebacks saem sem a mensagem da exceção.
- [ ] Revisar periodicamente as `Memory` no admin e desativar o que tiver dado de paciente.
- [ ] **Retenção**: rodar à mão, pelo Console do App backend (não há agendamento):

      python manage.py purge_old_conversations --days 365 --dry-run   # só conta
      python manage.py purge_old_conversations --days 365             # apaga

      (Apaga conversas excluídas e arquivadas sem atividade há mais de N dias; defina N
      com o responsável pela LGPD da clínica.)
- [ ] Backups criptografados e com acesso restrito; política de retenção também para eles.
- [ ] Transferência internacional: a extração de memórias envia trechos das conversas à
      OpenAI (`store=False`). Avalie com o responsável pela LGPD ou deixe
      `OPENAI_API_KEY` vazia.
- [ ] `/admin/` em caminho próprio (`ADMIN_URL`) e contas staff com senha forte. A
      restrição por IP fica para uma próxima fase.

## Testar as imagens localmente

```bash
# Backend: build e validação (sem variáveis, lista todas as que faltam e sai com 1)
docker build -t chatbot-backend ./backend
docker run --rm chatbot-backend

# Frontend: build com a URL da API (falha sem ela ou com mock)
docker build -t chatbot-frontend \
  --build-arg VITE_API_BASE_URL=https://api-chatbot.vidaplenamulti.com.br ./frontend
docker run --rm -p 8080:8080 chatbot-frontend    # http://localhost:8080/healthz
```

Se o Docker Hub limitar os downloads (erro 429), use o mirror só no build local:
`--build-arg PYTHON_IMAGE=mirror.gcr.io/library/python:3.13.13-slim-trixie` (backend) ou
`--build-arg NODE_IMAGE=mirror.gcr.io/library/node:24.21.0-alpine --build-arg NGINX_IMAGE=mirror.gcr.io/nginxinc/nginx-unprivileged:1.30.5-alpine`
(frontend).
