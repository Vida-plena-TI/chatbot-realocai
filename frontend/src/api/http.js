import { ApiError } from './errors';
import { getCsrfToken } from './csrf';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, { body, query, skipAuthRedirect = false } = {}) {
  const url = new URL(BASE_URL + path, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (UNSAFE.has(method)) {
    const token = getCsrfToken();
    if (token) headers['X-CSRFToken'] = token;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: 'include', // sessão por cookie
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && !skipAuthRedirect) onUnauthorized?.();
    throw new ApiError(res.status, data?.detail, data);
  }
  return data;
}

export const httpApi = {
  csrf: () => request('GET', '/api/auth/csrf/'),
  login: (email, password) =>
    request('POST', '/api/auth/login/', { body: { email, password }, skipAuthRedirect: true }),
  logout: () => request('POST', '/api/auth/logout/'),
  me: () => request('GET', '/api/auth/me/', { skipAuthRedirect: true }),

  listConversations: ({ page = 1, status } = {}) =>
    request('GET', '/api/conversations/', { query: { page, status } }),
  createConversation: (title) =>
    request('POST', '/api/conversations/', { body: title ? { title } : {} }),
  getConversation: (id) => request('GET', `/api/conversations/${id}/`),
  updateConversation: (id, patch) => request('PATCH', `/api/conversations/${id}/`, { body: patch }),
  deleteConversation: (id) => request('DELETE', `/api/conversations/${id}/`),

  listMessages: (id, { page = 1 } = {}) =>
    request('GET', `/api/conversations/${id}/messages/`, { query: { page } }),
  sendMessage: (id, content) =>
    request('POST', `/api/conversations/${id}/messages/`, { body: { content } }),
};
