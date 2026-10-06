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
│   ├── chat/           Conversas, mensagens e memórias; endpoints /api/conversations/;
│   │                   integração com o RealocAI e extração de memórias (services/)
│   └── reports/        Exportação de blocos de relatório em Excel (/api/reports/export/)
├── frontend/           React 18 + Vite 5 (SPA do chat; ver [Frontend](#frontend))
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
- O serviço de IA **RealocAI** (FastAPI, outro repositório) roda à parte; em dev use a
  porta **8001** (a 8000 é do `runserver`). Ver [Integração com o RealocAI](#integração-com-o-realocai).
- Banco: PostgreSQL gerenciado no **Supabase**, via *Session pooler* (porta 5432) com
  `sslmode=require`. Não usar o Transaction pooler (6543). Não há Docker no projeto.

## Frontend

Rodar dentro de `frontend/`: `npm install && npm run dev` (Vite em `http://localhost:5173`);
`npm run build` gera `frontend/dist/` (ignorado pelo git).

- Já segue o contrato de API do backend: sessão + CSRF (cookie `csrftoken` lido a cada
  requisição, `credentials: "include"`), paginação do DRF e **nada em `localStorage`**.
- Configuração via `.env.development` / `.env.production` (versionados, sem segredos;
  exceção no `frontend/.gitignore`) e `.env.local` para ajustes locais (ignorado):
  - `VITE_USE_MOCK=true` (padrão no dev) usa o mock em `src/api/mock/`, sem backend;
    `false` chama a API real.
  - `VITE_API_BASE_URL` — origem do Django (vazio = mesma origem, como em produção).
  - `VITE_PROXY_TARGET` (só no dev) — encaminha `/api` para o Django; use com
    `VITE_API_BASE_URL` vazio.
- Com a API real no dev, a origem do Vite (`http://localhost:5173`) precisa estar em
  `CORS_ALLOWED_ORIGINS` (acesso direto) ou em `CSRF_TRUSTED_ORIGINS` (via proxy).
- Nunca colocar segredos em variáveis `VITE_*`: elas vão parar no bundle do navegador.

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

**Formato de erro:** todo erro da API é `{"detail": "<texto em português>"}`
(`core.exceptions.exception_handler`): erros de validação do DRF viram a primeira
mensagem; 401 é "Não autenticado."; JSON malformado é "Requisição malformada."; falha de
CSRF (DRF ou Django, via `CSRF_FAILURE_VIEW`) é JSON 403 em português. Exceções não
tratadas continuam com o Django (500).

## Modelo de dados do chat (`backend/chat/`)

Todas as PKs são UUID. Dados de saúde: usar só dados fictícios em testes e exemplos.

- **Conversation** — pertence a um `user` (`related_name="conversations"`); `title`,
  `status` (`active`/`archived`), `summary` (resumo incremental para contexto longo,
  **interno**), `preview` (prévia de até 90 caracteres da última resposta, exposta na API
  como `summary`), `metadata` (JSON), `memory_extracted_seq` (último `Message.seq` já
  processado pela extração de memórias), `processing_started_at` (turno em andamento; ver
  [409](#integração-com-o-realocai)), `created_at`, `updated_at`, `deleted_at` (soft
  delete: conversa "apagada" continua no banco, com as mensagens). Índice em
  `(user, -updated_at)`.
- **Message** — pertence a uma `conversation` (`related_name="messages"`); `seq` (ordem na
  conversa, único por conversa via `UniqueConstraint`), `role`
  (`system`/`user`/`assistant`/`tool`), `content`, `blocos` (JSON, lista de blocos de
  relatório do RealocAI; `[]` na maioria), `model`, `prompt_tokens`,
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
- `record_exchange(conversation, user_content, assistant_content, *, blocos=None,
  external_conversation_id=None)` — grava a pergunta e a resposta com `seq` consecutivos
  numa única transação (lock de linha só durante essas escritas) e, na mesma transação,
  atualiza `preview`, o título automático (se vazio) e o `conversa_id`. Usada pelo agente.
- `get_context_messages(conversation, limit=None)` — últimas N mensagens em ordem
  cronológica, como `[{"role", "content"}]`.
- `soft_delete_conversation(conversation)` — preenche `deleted_at` (idempotente).
- `add_memory(user, kind, content, source_message=None, importance=3)` — roda
  `full_clean()` (valida `kind` e `importance`); inválido → `ValidationError`.
- `deactivate_memory(memory)`
- `get_active_memories(user, limit=20)` — ativas e não expiradas, por `importance` desc e
  `created_at` desc.

`Conversation.external_conversation_id` guarda o `conversa_id` do RealocAI (vazio até a
primeira troca). É interno: nunca aparece em serializers expostos ao frontend e é somente
leitura no admin. O mesmo vale para `summary` e `memory_extracted_seq` (geridos pela
extração de memórias). Ainda não há endpoints REST para `Memory`.

No admin, mensagens são somente leitura (registro de auditoria) e não podem ser criadas
por lá. Por padrão o admin mostra só metadados das mensagens (seq, papel, data, tamanho);
o texto, os blocos e a `preview` da conversa só aparecem com
`ADMIN_SHOW_MESSAGE_CONTENT=true` (padrão `false`).

Título e prévia seguem o front (`src/utils/content.js`), em `chat/services/content.py`:
`title_from` (espaços colapsados, corte em 60 com "…") e `summarize` (resposta sem o
bloco ```` ```proposta ```` / ```` ```json ```` válido, espaços colapsados, corte em 90 com "…").
Mantenha os dois em sincronia com o front.

**Retenção:** `manage.py purge_old_conversations --days N [--dry-run]` apaga de vez as
conversas com `deleted_at` há mais de N dias e as arquivadas sem atividade (`updated_at`)
há mais de N dias, com as mensagens. Ativas nunca. Sem `--days`, não faz nada; `--days`
≥ 1. Sem agendamento; imprime só contagens.

## Regras invioláveis

- **Nunca commitar segredos** (`.env`, chaves de API, senhas, tokens).
- **Nunca commitar dados de pacientes** — nem em fixtures, testes, logs, dumps ou exemplos.
  Use apenas dados fictícios.
- Não logar corpo de requisições nem conteúdo de conversas com dados pessoais.

## Endpoints do chat (`/api/conversations/`)

Todos exigem sessão (401 se anônimo) e CSRF nos métodos não seguros. O queryset é filtrado
pelo usuário logado e exclui conversas soft-deleted: conversa de outro usuário ou apagada
responde **404** (nunca 403).

O contrato segue o mock do front (`src/api/mock/mockClient.js`, a especificação
executável); `chat/tests/test_frontend_contract.py` percorre todas as chamadas de
`src/api/http.js`.

- Conversa exposta: `id`, `title`, `status`, `summary` (= `Conversation.preview`, nunca
  o resumo interno de memória), `message_count`, `created_at`, `updated_at`.
- `GET /api/conversations/` — lista paginada (`?page=`; **20** por página; `?page_size=`
  até 100), por `updated_at` desc. Página além do fim → 404 "Página inválida.".
  `?status=active` ou `?status=archived` filtra pelo status (abas da sidebar); sem o
  parâmetro, lista ambos; qualquer outro valor (inclusive vazio) → 400
  `{"detail": "Status inválido."}`. O filtro só vale para a listagem e se soma às regras
  de dono e soft delete. `POST` com `{title?}` cria (sempre `active`).
- `GET/PATCH/DELETE /api/conversations/{id}/` — PATCH altera só `title`/`status` (sem PUT);
  `title` sofre trim e corte em 120 caracteres (sem erro); status inválido → 400
  "Status inválido.". DELETE é soft delete (204). Inexistente → 404 "Conversa não
  encontrada.".
- Título automático: se a conversa não tem título, a primeira troca gravada o define a
  partir da mensagem do usuário (`title_from`).
- `GET /api/conversations/{id}/messages/` — paginada (**30** por página), por `seq`
  crescente. Campos: `id`, `seq`, `role`, `content`, `created_at` e `blocos` **só quando
  a mensagem tem blocos** (igual ao mock), para o histórico reabrir com os cartões.
- `POST /api/conversations/{id}/messages/` com `{content}` (trim; 1 a `MESSAGE_MAX_LENGTH`
  caracteres, padrão 2000):
  - conversa arquivada → 400 (o agente não é chamado); vazio/só espaços → 400 "A mensagem
    não pode ficar vazia."; longo demais → 400 com o limite no texto;
  - sucesso → **201** `{"user_message": {...}, "assistant_message": {...}}` (o front aceita
    qualquer 2xx); `assistant_message.blocos` quando houver relatório;
  - já há uma mensagem em andamento nesta conversa → **409** `{"detail": "Já há uma
    mensagem sendo processada nesta conversa."}` (nada é gravado);
  - agente falhou (qualquer causa) → **502** `{"detail": "O agente não respondeu a
    tempo."}`. **Nada é gravado**, nem a pergunta: o front pode reenviar o mesmo texto.
  - muitas mensagens → **429**: throttle `chat_messages`, **30/min por usuário**, só neste
    POST. Justificativa: cada mensagem dispara **duas chamadas de IA pagas** (RealocAI e a
    extração de memórias na OpenAI); o limite contém o custo que uma conta pode gerar.
  - A chamada é síncrona e pode levar vários segundos (sem streaming).
- **Propostas:** mensagem que começa com "Proposta aprovada" ou "Proposta recusada" (o
  front envia assim a decisão sobre um cartão de proposta) é gravada com uma resposta
  **fixa** (`PROPOSAL_APPROVED_REPLY` / `PROPOSAL_REJECTED_REPLY` em `agent.py`), **sem
  chamar o RealocAI** nem extrair memórias. O realocAI nunca altera a agenda. O `content`
  do agente é gravado sem alteração (blocos ```` ```proposta ```` incluídos).

## Exportação de relatórios (`/api/reports/export/`)

`POST /api/reports/export/` com `{formato, blocos}` → arquivo. Sessão + CSRF obrigatórios.
Gera o arquivo **só a partir do corpo** (não lê o banco: nada de outro usuário entra).

- `formato`: só `"excel"` (.xlsx, openpyxl). Qualquer outro, inclusive `"pdf"`, → 400
  "Formato não suportado." (o PDF v1 é impressão do navegador, feita no front).
- Corpo limitado por `REPORTS_EXPORT_MAX_BYTES` (padrão 2 MB) → 413. Acima de 2,5 MB o
  limite do próprio Django (`DATA_UPLOAD_MAX_MEMORY_SIZE`) age antes.
- Serializer estrito (`reports/serializers.py`): 1 a 10 blocos; `tipo` em
  `^[a-z0-9_]{1,50}$`; `titulo`, `periodo{inicio,fim}` (ISO), `meta` (número ou null; sem
  checar intervalo), `parcial` (bool), `avisos`, `resumo`, `tabelas` (`nome`,
  `colunas[chave, rotulo, formato]`, `linhas` de valores simples). `dados` e chaves
  desconhecidas são ignorados. Tipos estritos ("0.8" não é número).
- Planilha (`reports/excel.py`) segue a "Especificação do Excel" de
  `docs/relatorios.md` do front novo (referência: `gerarExcel` em `localExport.js`): aba
  "Resumo" (Relatório, Período, Meta `0.0%` — vazia se null, Gerado em = data local do
  servidor `dd/mm/yyyy`, Avisos = avisos + "Dados parciais" com " | "); uma aba por tabela
  (nome sem `\ / ? * [ ] :`, ≤ 31, sufixo " (n)" com vários blocos, repetidos numerados);
  cabeçalho negrito em `#E6F3EF`; 1ª linha congelada; larguras 10/12/22–40; vazio = célula
  vazia; booleanos em colunas de texto viram "Sim"/"Não".
- **Injeção de fórmula:** todo texto é gravado como célula de texto (`data_type "s"`);
  "=cmd|...", "+", "-", "@" nunca viram fórmula (coberto por teste).
- Resposta: `Content-Disposition: attachment; filename="realocai-<tipo>-<AAAA-MM-DD>.xlsx"`
  (vários blocos: `realocai-relatorios-<AAAA-MM-DD>.xlsx`), igual a `nomeArquivo`.

## Integração com o RealocAI

O RealocAI é um serviço FastAPI separado que implementa o agente (LangChain + OpenAI) e
mantém a memória de curto prazo de cada conversa. O chat passa **só** pelo RealocAI; o
Django chama a OpenAI diretamente apenas para a
[extração de memórias](#memória-de-longo-prazo-extração-com-a-openai). As chaves **nunca
vão para o navegador**: toda chamada é servidor-a-servidor.

Variáveis (ver `.env.example`):

- `REALOCAI_BASE_URL` — ex.: `http://localhost:8001` em dev.
- `REALOCAI_API_KEY` — enviada no header `X-API-Key`. Segredo: nunca logar nem commitar.
- `REALOCAI_TIMEOUT_SECONDS` — timeout de **leitura**, padrão 90 (a conexão tem 5 s fixos,
  `CONNECT_TIMEOUT_SECONDS`). Sem retentativa além do 404. Em produção: gunicorn com
  workers **gthread** (ex.: 2 workers × 4 threads) e `--timeout` maior que este valor
  (ex.: 120). Ver "Deploy" no README.
- `REALOCAI_USE_FAKE` — padrão `False`. Com `True`, `send_chat_message` usa
  `chat/services/realocai_fake.py` (respostas fixas + blocos de exemplo copiados dos
  exemplos reais, em `chat/services/fake_blocos/`), sem rede nem chave. Só dev/demo.
- `REALOCAI_INJECT_MEMORIES` — **experimental**, padrão `False`. Ver
  [Injeção de contexto](#injeção-de-contexto-no-realocai-experimental).

Sem `REALOCAI_BASE_URL`/`REALOCAI_API_KEY` (e sem o fake), o envio de mensagens responde
502 (erro `config_error` no log).

Contrato do RealocAI (`POST {REALOCAI_BASE_URL}/agenda/chat`, header `X-API-Key`): envia
`{conversa_id, mensagem, renderiza_relatorios: true}`; recebe `{conversa_id, resposta,
blocos}` (`blocos` ausente → `[]`).

Fluxo de uma mensagem:

```
navegador ──POST /api/conversations/{id}/messages/──▶ Django (view)
  1. valida (404 / arquivada 400 / conteúdo 400)
  2. chat.services.agent.exchange_messages:
     a. reivindica a conversa: UPDATE condicional em processing_started_at (livre OU mais
        antigo que REALOCAI_TIMEOUT_SECONDS + 30 s). Perdeu → ConversationBusyError (409)
     b. "Proposta aprovada/recusada…" → record_exchange com resposta fixa; pula c–d e f
     c. sem transação aberta: realocai_client.send_chat_message(external_id or None, content)
          └──POST /agenda/chat ──▶ RealocAI ──▶ OpenAI
        (com conversa_id=null e REALOCAI_INJECT_MEMORIES=True, a mensagem enviada ganha
        o prefixo de contexto)
        404 (conversa expirou no RealocAI) e havia id → log WARNING e tenta UMA vez com
        conversa_id=null (o RealocAI começa sem o histórico anterior)
        falha → log ERROR (conversation.id, tipo, status, duração) e AgentUnavailableError
        (502); NADA é gravado e o external_conversation_id não muda
     d. sucesso → record_exchange: UMA transação grava user + assistant (seq consecutivos,
        blocos), preview, título automático e o novo conversa_id
     e. finally: libera a reivindicação (só se ainda for a nossa)
     f. memory_extraction.extract_memories(conversation) — nunca levanta exceção
  3. 201 {user_message, assistant_message}  ou  409/502 {detail}
```

Módulos:

- `chat/services/realocai_client.py` — `send_chat_message(conversa_id, mensagem)` é a
  **única interface** (HTTP ou fake). Devolve `ChatSuccess(conversa_id, resposta, blocos,
  blocos_descartados)` ou `ChatFailure(kind, status_code)`, com `kind` em
  `ChatErrorKind`: `expired` (404), `invalid` (422), `upstream_error` (5xx, status
  inesperado ou resposta malformada), `network_error` (timeout/conexão), `config_error`
  (401 ou settings ausentes). Não levanta exceção para erros HTTP e não loga.
  `validate_blocos`: blocos são JSON **opaco**; só se valida o envelope (lista de até 10
  objetos, cada um com `tipo` e `versao`). Inválido → `blocos=[]`,
  `blocos_descartados=True` (o agente loga WARNING; o turno nunca falha por isso). Nunca
  remodelar `dados` nem extrair números do texto do agente.
- `chat/services/agent.py` — `send_user_message(conversation, content) -> Message` (a do
  assistant) e `exchange_messages(conversation, content) -> Exchange(user_message,
  assistant_message)` (usada pela view). Conteúdo vazio → `ValueError`; conversa ocupada →
  `ConversationBusyError`; falha do agente → `AgentUnavailableError` (mensagem genérica em
  português, segura para o usuário).

A reivindicação (2a) substitui o antigo lock de linha segurado durante a chamada HTTP: não
fica transação aberta por até 90 s atrás do pooler do Supabase, e duas requisições
simultâneas na mesma conversa nunca abrem duas conversas no RealocAI (a segunda recebe
409). `QuerySet.update()` não mexe em `updated_at`. Uma reivindicação "presa" (worker morto
antes do `finally`) expira após `REALOCAI_TIMEOUT_SECONDS + 30 s`. Limite conhecido: com o
reinício após 404, um turno pode durar até ~2× o timeout; nesse caso raro outra
requisição pode assumir a reivindicação antes do fim.

Regras de log: registrar só `conversation.id`, tipo de erro, status HTTP e duração.
**Nunca** o conteúdo da mensagem, a resposta do agente, os blocos ou a API key. Os loggers
`httpx`/`httpcore` ficam em WARNING.

Testes: `chat/tests/conftest.py` aponta as settings para `http://realocai.test` com uma
chave falsa, e as chamadas HTTP são mockadas com o fixture `respx_mock` (requisição não
mockada falha o teste). Nunca apontar testes para um RealocAI real. Exemplos reais de
blocos (dados fictícios) ficam em `chat/tests/fixtures/` e são usados nos testes do
cliente, da API e da exportação.

## Memória de longo prazo (extração com a OpenAI)

Depois de cada turno bem-sucedido, `chat/services/memory_extraction.py`
(`extract_memories(conversation)`) extrai memórias do **profissional** e um resumo da
conversa. É a única chamada direta do Django à OpenAI (SDK oficial `openai`).

Variáveis: `OPENAI_API_KEY` (segredo; **vazia = extração desligada**, o chat funciona
normalmente) e `OPENAI_EXTRACTION_MODEL` (padrão `gpt-4o-mini`; precisa suportar
Structured Outputs).

Fluxo:

1. Lê do banco `memory_extracted_seq` e busca as mensagens com `seq` maior (no máximo as
   20 mais recentes; pendências mais antigas são puladas). Sem mensagens novas, ou sem
   `OPENAI_API_KEY`, retorna sem chamar a OpenAI.
2. Monta a transcrição só com `user`/`assistant` ("Profissional:"/"Assistente:") e chama
   `chat.completions` com **Structured Outputs estrito** (`EXTRACTION_SCHEMA`:
   `{"memories": [{"kind": "fact"|"preference", "content", "importance": 1-5}],
   "summary"}`), `store=False`, timeout de 20 s e sem retries. A saída é revalidada.
3. Numa transação: `UPDATE` condicional (`memory_extracted_seq` ainda igual ao lido) que
   avança o seq para o maior processado e substitui `summary` (se não vier vazio) — via
   `QuerySet.update()`, então **`updated_at` não muda**. Se outra extração concorrente
   chegou antes, nada é gravado (evita memórias duplicadas).
4. Cada memória vira `add_memory(..., source_message=<última mensagem processada>)`;
   memória ativa idêntica (mesmo `kind` e `content`, sem diferenciar maiúsculas) é
   ignorada. `content` é truncado em 300 caracteres e `summary` em 500.
5. Qualquer exceção é capturada e logada em ERROR só com `conversation.id` e o **tipo** da
   exceção (nunca a mensagem dela, conteúdos ou a chave). Nada é gravado e o seq não
   avança, então a troca é reprocessada no próximo turno. O chat nunca recebe 502 por
   causa da extração.

### Guardrail de LGPD

Memórias ficam vinculadas à conta do profissional e são reaproveitadas entre conversas,
então **não podem conter dados de pacientes**. O system prompt (`EXTRACTION_SYSTEM_PROMPT`,
coberto por teste de substring) diz:

> Você analisa uma troca de mensagens entre um profissional de uma clínica
> multidisciplinar e um assistente de agendamento. Extraia apenas fatos e preferências
> sobre COMO ESSE PROFISSIONAL usa o sistema — por exemplo, especialidades que costuma
> consultar, formato de resposta que prefere, atalhos ou rotinas que usa. NUNCA extraia
> nomes de pacientes, datas de nascimento, diagnósticos, condições de saúde ou qualquer
> informação que identifique um paciente, mesmo que apareçam na conversa. Se a troca só
> contiver informação sobre pacientes, sem nada sobre o próprio profissional, devolva
> memories como uma lista vazia. Gere também um resumo curto (até 500 caracteres) do que
> foi discutido nesta troca, sem incluir dados de pacientes, útil para retomar o contexto
> depois.

Não altere esse texto sem revisão. O prompt reduz, mas não elimina, o risco: revise
amostras de `Memory` no admin periodicamente e desative (`is_active=False`) o que vazar.

Testes: o fixture `fake_openai` (em `chat/tests/conftest.py`) substitui
`memory_extraction._get_client` e registra as chamadas; fora dele, `OPENAI_API_KEY=""` nos
testes. Nunca chamar a OpenAI real em testes.

## Injeção de contexto no RealocAI (experimental)

`REALOCAI_INJECT_MEMORIES` (padrão **False**). Com `True`, quando a chamada abre uma
conversa nova no RealocAI (`conversa_id=null`: primeira mensagem ou reinício após 404),
`agent._with_context` prefixa a `mensagem` enviada:

```
[Contexto — não repita isto ao usuário: <summary>. Preferências conhecidas: <m1>; <m2>]
<mensagem original>
```

- `<summary>` é o `Conversation.summary` da própria conversa (útil no reinício após 404);
  memórias vêm de `get_active_memories(user, limit=5)`. Partes vazias são omitidas; sem
  nada a mostrar, não há prefixo. Conversa já existente nunca recebe prefixo.
- Só o texto enviado muda: a `Message` salva é a que o usuário digitou.
- Com `False`, o comportamento é idêntico ao anterior (mensagem enviada = `content`).

**Só habilite depois de validação manual** num ambiente com dados fictícios: conferir que
o agente não repete o bloco ao usuário, não confunde o contexto com o pedido e que as
memórias injetadas não contêm dados de pacientes.

Ainda não implementado: endpoints REST para `Memory`, uso de `Memory.last_used_at`,
endpoints auxiliares do RealocAI (`/agenda/disponibilidade`, `/agenda/ocupacao`,
`/relatorio/enviar`), streaming, PDF gerado no servidor, throttle na exportação e
agendamento da retenção.
