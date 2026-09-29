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
│   └── chat/           Conversas, mensagens e memórias; endpoints /api/conversations/;
│                       integração com o RealocAI e extração de memórias (services/)
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
- O serviço de IA **RealocAI** (FastAPI, outro repositório) roda à parte; em dev use a
  porta **8001** (a 8000 é do `runserver`). Ver [Integração com o RealocAI](#integração-com-o-realocai).
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
  `metadata` (JSON), `memory_extracted_seq` (último `Message.seq` já processado pela
  extração de memórias), `created_at`, `updated_at`, `deleted_at` (soft delete: conversa
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

`Conversation.external_conversation_id` guarda o `conversa_id` do RealocAI (vazio até a
primeira troca). É interno: nunca aparece em serializers expostos ao frontend e é somente
leitura no admin. O mesmo vale para `summary` e `memory_extracted_seq` (geridos pela
extração de memórias). Ainda não há endpoints REST para `Memory`.

No admin, mensagens são somente leitura (registro de auditoria) e não podem ser criadas
por lá.

## Regras invioláveis

- **Nunca commitar segredos** (`.env`, chaves de API, senhas, tokens).
- **Nunca commitar dados de pacientes** — nem em fixtures, testes, logs, dumps ou exemplos.
  Use apenas dados fictícios.
- Não logar corpo de requisições nem conteúdo de conversas com dados pessoais.

## Endpoints do chat (`/api/conversations/`)

Todos exigem sessão (401 se anônimo) e CSRF nos métodos não seguros. O queryset é filtrado
pelo usuário logado e exclui conversas soft-deleted: conversa de outro usuário ou apagada
responde **404** (nunca 403).

- `GET /api/conversations/` — lista paginada (`?page=`, `?page_size=` até 100; padrão 50),
  por `updated_at` desc. `POST` com `{title?}` cria (sempre `active`).
- `GET/PATCH/DELETE /api/conversations/{id}/` — PATCH altera só `title`/`status` (sem PUT);
  DELETE é soft delete (204).
- `GET /api/conversations/{id}/messages/` — paginada, por `seq`. Campos: `id`, `seq`,
  `role`, `content`, `created_at`.
- `POST /api/conversations/{id}/messages/` com `{content}` (1–5000 caracteres, sem ser só
  espaço):
  - conversa arquivada → 400 `{"detail": ...}` (o agente não é chamado); conteúdo inválido → 400;
  - sucesso → **201** `{"user_message": {...}, "assistant_message": {...}}`;
  - agente indisponível → **502** `{"detail": "Não foi possível processar sua mensagem.
    Tente novamente."}`. A mensagem do usuário **já está salva**; o frontend pode
    confirmar via GET e oferecer "tentar de novo" (reenviar cria uma nova mensagem).
  - muitas mensagens → **429**: throttle `chat_messages`, **30/min por usuário**, só neste
    POST. Justificativa: cada mensagem dispara **duas chamadas de IA pagas** (RealocAI e a
    extração de memórias na OpenAI); o limite contém o custo que uma conta pode gerar.
  - A chamada é síncrona e pode levar vários segundos (sem streaming).

## Integração com o RealocAI

O RealocAI é um serviço FastAPI separado que implementa o agente (LangChain + OpenAI) e
mantém a memória de curto prazo de cada conversa. O chat passa **só** pelo RealocAI; o
Django chama a OpenAI diretamente apenas para a
[extração de memórias](#memória-de-longo-prazo-extração-com-a-openai). As chaves **nunca
vão para o navegador**: toda chamada é servidor-a-servidor.

Variáveis (ver `.env.example`):

- `REALOCAI_BASE_URL` — ex.: `http://localhost:8001` em dev.
- `REALOCAI_API_KEY` — enviada no header `X-API-Key`. Segredo: nunca logar nem commitar.
- `REALOCAI_TIMEOUT_SECONDS` — padrão 60. Em produção, o `--timeout` do gunicorn tem de
  ser maior que ele somado ao timeout da extração (20 s) — ex.: 90 —, senão o worker é
  morto antes da resposta.
- `REALOCAI_INJECT_MEMORIES` — **experimental**, padrão `False`. Ver
  [Injeção de contexto](#injeção-de-contexto-no-realocai-experimental).

Sem `REALOCAI_BASE_URL`/`REALOCAI_API_KEY`, o envio de mensagens responde 502 (erro
`config_error` no log).

Fluxo de uma mensagem:

```
navegador ──POST /api/conversations/{id}/messages/──▶ Django (view)
  1. valida (404 / arquivada 400 / conteúdo 400)
  2. chat.services.agent.exchange_messages:
     a. append_message(role="user")                 ← salva ANTES de chamar o agente
     b. transaction.atomic() + select_for_update() na Conversation (b–d sob o lock):
        realocai_client.send_chat_message(external_conversation_id or None, content)
          └──POST {REALOCAI_BASE_URL}/agenda/chat  (X-API-Key)──▶ RealocAI ──▶ OpenAI
        (com conversa_id=null e REALOCAI_INJECT_MEMORIES=True, a mensagem enviada ganha
        o prefixo de contexto)
     c. 404 (conversa expirou no RealocAI) e havia id → limpa o id e tenta UMA vez com
        conversa_id=null (o RealocAI começa sem o histórico anterior)
     d. sucesso → salva o novo conversa_id (se mudou); fim do lock
     e. append_message(role="assistant")
     f. memory_extraction.extract_memories(conversation) — nunca levanta exceção
     g. falha do agente em b/c → log ERROR (conversation.id + tipo) e AgentUnavailableError
  3. 201 {user_message, assistant_message}  ou  502 {detail genérico}
```

Módulos:

- `chat/services/realocai_client.py` — `send_chat_message(conversa_id, mensagem)` devolve
  `ChatSuccess(conversa_id, resposta)` ou `ChatFailure(kind, status_code)`, com `kind` em
  `ChatErrorKind`: `expired` (404), `invalid` (422), `upstream_error` (5xx, status
  inesperado ou resposta malformada), `network_error` (timeout/conexão), `config_error`
  (401 ou settings ausentes). Não levanta exceção para erros HTTP e não loga.
- `chat/services/agent.py` — `send_user_message(conversation, content) -> Message` (a do
  assistant) e `exchange_messages(conversation, content) -> Exchange(user_message,
  assistant_message)` (usada pela view). Conteúdo vazio → `ValueError`; falha do agente →
  `AgentUnavailableError` (mensagem genérica em português, segura para o usuário).

O lock da etapa 2b serializa os turnos de uma mesma conversa: uma segunda requisição
concorrente espera a primeira gravar o `conversa_id` em vez de abrir outra conversa no
RealocAI. Custo: a transação fica aberta durante a chamada HTTP (até o timeout); outras
conversas não são afetadas.

Regras de log: registrar só `conversation.id`, tipo de erro e status HTTP. **Nunca** o
conteúdo da mensagem, a resposta do agente ou a API key. Os loggers `httpx`/`httpcore`
ficam em WARNING.

Testes: `chat/tests/conftest.py` aponta as settings para `http://realocai.test` com uma
chave falsa, e as chamadas HTTP são mockadas com o fixture `respx_mock` (requisição não
mockada falha o teste). Nunca apontar testes para um RealocAI real.

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
`/relatorio/enviar`) e streaming.
