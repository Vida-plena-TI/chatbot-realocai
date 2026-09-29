import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const EMPTY = { items: [], loadedId: null, error: null, oldestPage: 1, loadingOlder: false };

// Mensagens em ordem crescente de `seq`. Abre na última página (as mais recentes)
// e carrega as anteriores sob demanda.
export function useMessages(conversationId) {
  const [state, setState] = useState(EMPTY);
  const token = useRef(0);

  const load = useCallback(async () => {
    const t = ++token.current;
    setState(EMPTY);
    if (!conversationId) return;
    try {
      const first = await api.listMessages(conversationId, { page: 1 });
      let page = 1;
      let data = first;
      if (first.next && first.results.length) {
        page = Math.ceil(first.count / first.results.length);
        data = await api.listMessages(conversationId, { page });
      }
      if (t === token.current) setState({ ...EMPTY, items: data.results, loadedId: conversationId, oldestPage: page });
    } catch (error) {
      if (t === token.current) setState({ ...EMPTY, loadedId: conversationId, error });
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadOlder = useCallback(async () => {
    const page = state.oldestPage - 1;
    if (page < 1 || state.loadingOlder) return;
    const t = token.current;
    setState((s) => ({ ...s, loadingOlder: true }));
    try {
      const data = await api.listMessages(conversationId, { page });
      if (t === token.current) {
        setState((s) => ({ ...s, items: [...data.results, ...s.items], oldestPage: page, loadingOlder: false }));
      }
    } catch {
      if (t === token.current) setState((s) => ({ ...s, loadingOlder: false }));
    }
  }, [conversationId, state.oldestPage, state.loadingOlder]);

  const append = useCallback((m) => setState((s) => ({ ...s, items: [...s.items, m] })), []);
  const replace = useCallback(
    (tempId, messages) => setState((s) => ({ ...s, items: [...s.items.filter((m) => m.id !== tempId), ...messages] })),
    [],
  );
  const remove = useCallback((tempId) => setState((s) => ({ ...s, items: s.items.filter((m) => m.id !== tempId) })), []);

  return {
    items: state.items,
    error: state.error,
    loadingOlder: state.loadingOlder,
    loading: Boolean(conversationId) && state.loadedId !== conversationId,
    hasOlder: state.oldestPage > 1,
    reload: load,
    loadOlder,
    append,
    replace,
    remove,
  };
}
