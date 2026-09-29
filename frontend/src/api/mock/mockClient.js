// Implementa a mesma interface de httpApi, em memória, seguindo o contrato da API Django.
import { ApiError } from '../errors';
import { summarize, titleFrom } from '../../utils/content';
import { MOCK_USER, MOCK_PASSWORD, seedConversations, gerarResposta } from './fixtures';

const PAGE_CONVERSATIONS = 20;
const PAGE_MESSAGES = 30;
const SESSION_COOKIE = 'realocai_mock_session';

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

const db = { conversations: seedConversations(), nextId: 100, nextMsgId: 10000 };

const wait = (min = 250, max = 600) =>
  new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
const now = () => new Date().toISOString();
const hasSession = () => document.cookie.split('; ').includes(`${SESSION_COOKIE}=1`);

function requireSession() {
  if (!hasSession()) {
    onUnauthorized?.();
    throw new ApiError(401, 'Não autenticado.');
  }
}

function paginate(items, page, size, path) {
  const p = Math.max(1, Number(page) || 1);
  const start = (p - 1) * size;
  if (start > 0 && start >= items.length) throw new ApiError(404, 'Página inválida.');
  return {
    count: items.length,
    next: start + size < items.length ? `${path}?page=${p + 1}` : null,
    previous: p > 1 ? `${path}?page=${p - 1}` : null,
    results: items.slice(start, start + size),
  };
}

function toPublic(c) {
  const { messages, deleted, ...rest } = c;
  return { ...rest, message_count: messages.length };
}

function findConversation(id) {
  const c = db.conversations.find((x) => String(x.id) === String(id) && !x.deleted);
  if (!c) throw new ApiError(404, 'Conversa não encontrada.');
  return c;
}

function addMessage(c, role, content) {
  const m = { id: db.nextMsgId++, seq: c.messages.length + 1, role, content, created_at: now() };
  c.messages.push(m);
  return m;
}

export const mockApi = {
  async csrf() {
    await wait(80, 160);
    document.cookie = 'csrftoken=mock-csrf-token; path=/; SameSite=Lax';
    return null;
  },
  async login(email, password) {
    await wait(400, 800);
    if (String(email).trim().toLowerCase() !== MOCK_USER.email || password !== MOCK_PASSWORD) {
      throw new ApiError(401, 'Credenciais inválidas.');
    }
    document.cookie = `${SESSION_COOKIE}=1; path=/; SameSite=Lax`;
    return { ...MOCK_USER };
  },
  async logout() {
    await wait();
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
    return null;
  },
  async me() {
    await wait(150, 300);
    if (!hasSession()) throw new ApiError(401, 'Não autenticado.');
    return { ...MOCK_USER };
  },

  async listConversations({ page = 1, status } = {}) {
    await wait();
    requireSession();
    const items = db.conversations
      .filter((c) => !c.deleted && (!status || c.status === status))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(toPublic);
    return paginate(items, page, PAGE_CONVERSATIONS, '/api/conversations/');
  },
  async createConversation(title = '') {
    await wait();
    requireSession();
    const t = now();
    const c = { id: db.nextId++, title: title || '', status: 'active', summary: '', created_at: t, updated_at: t, messages: [] };
    db.conversations.push(c);
    return toPublic(c);
  },
  async getConversation(id) {
    await wait(120, 300);
    requireSession();
    return toPublic(findConversation(id));
  },
  async updateConversation(id, patch = {}) {
    await wait();
    requireSession();
    const c = findConversation(id);
    if ('title' in patch) c.title = String(patch.title).trim().slice(0, 120);
    if ('status' in patch) {
      if (!['active', 'archived'].includes(patch.status)) throw new ApiError(400, 'Status inválido.');
      c.status = patch.status;
    }
    c.updated_at = now();
    return toPublic(c);
  },
  async deleteConversation(id) {
    await wait();
    requireSession();
    findConversation(id).deleted = true; // soft delete
    return null;
  },

  async listMessages(id, { page = 1 } = {}) {
    await wait();
    requireSession();
    const c = findConversation(id);
    return paginate(c.messages, page, PAGE_MESSAGES, `/api/conversations/${id}/messages/`);
  },
  async sendMessage(id, content) {
    requireSession();
    const c = findConversation(id);
    const text = String(content ?? '').trim();
    if (!text) {
      await wait();
      throw new ApiError(400, 'A mensagem não pode ficar vazia.');
    }
    // A resposta real pode levar vários segundos e chega inteira (sem streaming).
    await wait(1500, 4000);
    // Para testar o estado de erro: inclua a palavra "erro" ou "falha" na mensagem.
    if (/\b(erro|falha)\b/i.test(text)) throw new ApiError(502, 'O agente não respondeu a tempo.');

    const user_message = addMessage(c, 'user', text);
    const assistant_message = addMessage(c, 'assistant', gerarResposta(text));
    c.summary = summarize(assistant_message.content);
    c.updated_at = assistant_message.created_at;
    if (!c.title) c.title = titleFrom(text);
    return { user_message, assistant_message };
  },
};
