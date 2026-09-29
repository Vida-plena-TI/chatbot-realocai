# realocAI · frontend

Interface de chat interna da equipe de agendamento e recepção da clínica. Feita em React + Vite e conectada à API Django (sessão por cookie + CSRF).

## Rodar

Requer Node 18 ou superior.

```bash
npm install && npm run dev
```

Abra http://localhost:5173. Por padrão o app roda com o **mock local** (`.env.development`):

- e-mail: `equipe@clinica.test`
- senha: `demo1234`

Para testar o erro de envio, mande uma mensagem com a palavra **erro** ou **falha**. O mock responde 502, o texto volta para o campo e aparece o botão "Reenviar".

## Configuração

| Variável | Uso |
| --- | --- |
| `VITE_API_BASE_URL` | URL base da API Django, sem barra final. Vazio = mesma origem do front. |
| `VITE_USE_MOCK` | `true` usa `src/api/mock`; `false` chama a API real. |
| `VITE_PROXY_TARGET` | Opcional, só em `npm run dev`: encaminha `/api` para o Django. |

`.env.development` já vem com o mock ligado. `.env.production` vem com `VITE_USE_MOCK=false` e a mesma origem. Para sobrescrever localmente, crie um `.env.local` a partir do `.env.example`.

## Ligar na API real

1. Em `.env.local`, defina `VITE_USE_MOCK=false`.
2. Escolha uma das opções:
   - **Proxy (recomendado no dev):** `VITE_API_BASE_URL=` (vazio) e `VITE_PROXY_TARGET=http://localhost:8000`. Front e API ficam na mesma origem, sem precisar de CORS.
   - **Origens separadas:** `VITE_API_BASE_URL=http://localhost:8000`. No Django, configure:
     ```python
     CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]
     CORS_ALLOW_CREDENTIALS = True
     CSRF_TRUSTED_ORIGINS = ["http://localhost:5173"]
     CSRF_COOKIE_HTTPONLY = False  # o front lê o cookie csrftoken
     ```
     Em produção, com domínios diferentes, use `SESSION_COOKIE_SAMESITE = "None"` e `SESSION_COOKIE_SECURE = True`.
3. `npm run dev`.

Nenhum componente muda. Toda a comunicação passa por `src/api/client.js`, que escolhe entre `http.js` e `mock/mockClient.js`.

## Autenticação

- Nada é salvo em localStorage ou sessionStorage.
- Ao abrir o app: `GET /api/auth/me/`. Se retornar 200, o usuário está logado; se retornar 401, vai para `/login`.
- Login: `GET /api/auth/csrf/` e depois `POST /api/auth/login/`.
- Todo POST/PATCH/DELETE envia `X-CSRFToken` (lido do cookie `csrftoken`) e `credentials: 'include'`.
- Qualquer 401 durante o uso leva de volta ao login.

## Pontos a alinhar com o backend

- **Filtro por status:** a aba "Arquivadas" chama `GET /api/conversations/?status=archived`, e a aba "Ativas" chama `?status=active`. O backend precisa aceitar esse filtro.
- **Ordem das mensagens:** o front considera `messages/` em ordem crescente de `seq`, com a página 1 trazendo as mais antigas. Ele abre direto na última página e carrega as anteriores sob demanda.
- **Cartão de proposta:** quando o assistente sugere uma realocação, o `content` pode incluir um bloco:
  ````
  Texto da resposta.

  ```proposta
  {"paciente": "Paciente A",
   "de":   {"horario": "16:30", "sala": "Sala 2", "profissional": "Profissional B", "dia": "Hoje"},
   "para": {"horario": "10:00", "sala": "Sala 2", "profissional": "Profissional B", "dia": "Hoje"},
   "motivo": "Mantém a mesma profissional."}
  ```
  ````
  O bloco vira um cartão "De → Para". Para encaixe, use `"de": {"horario": "—", "sala": "Fila de espera"}`.
- **Decisões:** "Aprovar" e "Recusar" enviam uma mensagem normal que começa com `Proposta aprovada:` ou `Proposta recusada:`. O status do cartão é deduzido dessa mensagem, então fica salvo no histórico sem precisar de um endpoint novo. O realocAI não altera a agenda.
- **Título:** a conversa é criada no envio da primeira mensagem, com as primeiras palavras como `title`. Pode ser renomeada depois.

## Estrutura

```
src/
├─ main.jsx, App.jsx        rotas: /login, /, /c/:id
├─ api/
│  ├─ client.js             única interface usada pelos componentes
│  ├─ http.js               fetch + credentials + X-CSRFToken
│  ├─ csrf.js, errors.js
│  └─ mock/                 mockClient.js (mesmo contrato), fixtures.js (dados fictícios)
├─ auth/                    AuthContext (GET /me), RequireAuth
├─ conversations/           ConversationsContext (lista, abas, renomear, arquivar, excluir)
├─ hooks/                   usePaginated, useMessages
├─ pages/                   LoginPage, ChatPage
├─ components/
│  ├─ sidebar/              Sidebar, ConversationItem, RenameDialog
│  ├─ chat/                 MessageList, MessageBubble, ProposalCard, TypingIndicator,
│  │                        Composer, SendError, EmptyState
│  └─ ui/                   Button, IconButton, Dialog, Menu, Spinner
├─ utils/                   content.js (proposta, resumo), formatDate.js
└─ styles/                  tokens.css, global.css (+ CSS Modules por componente)
```

## Dados fictícios

O mock usa apenas identificadores genéricos ("Paciente A", "Profissional B", "Sala 3"). Mantenha esse padrão em testes e demonstrações.

## Build

```bash
npm run build     # gera dist/
npm run preview
```

Em produção, sirva `dist/` e redirecione rotas desconhecidas para `index.html`, porque o roteamento é client-side.
