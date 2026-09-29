import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api } from '../api/client';
import { usePaginated } from '../hooks/usePaginated';

const ConversationsContext = createContext(null);
const same = (a, b) => String(a) === String(b);

export function ConversationsProvider({ children }) {
  const [tab, setTab] = useState('active'); // active | archived
  // Alterações locais por id (título, status, exclusão) para a conversa aberta refletir o menu da sidebar.
  const [overrides, setOverrides] = useState({});

  const fetchPage = useCallback((page) => api.listConversations({ page, status: tab }), [tab]);
  const list = usePaginated(fetchPage);
  const { setItems } = list;

  const override = useCallback(
    (id, patch) => setOverrides((o) => ({ ...o, [String(id)]: { ...o[String(id)], ...patch } })),
    [],
  );

  // Coloca a conversa no topo da aba certa, ou tira da lista se não pertence à aba atual.
  const place = useCallback(
    (c) =>
      setItems((items) => {
        const rest = items.filter((x) => !same(x.id, c.id));
        return c.status === tab ? [c, ...rest] : rest;
      }),
    [tab, setItems],
  );

  const create = useCallback(
    async (title) => {
      const c = await api.createConversation(title);
      if (tab === 'active') place(c);
      else setTab('active');
      return c;
    },
    [tab, place],
  );

  const rename = useCallback(
    async (id, title) => {
      const c = await api.updateConversation(id, { title });
      override(id, { title: c.title });
      setItems((items) => items.map((x) => (same(x.id, id) ? { ...x, title: c.title } : x)));
      return c;
    },
    [override, setItems],
  );

  const setArchived = useCallback(
    async (id, archived) => {
      const c = await api.updateConversation(id, { status: archived ? 'archived' : 'active' });
      override(id, { status: c.status });
      place(c);
      return c;
    },
    [override, place],
  );

  const remove = useCallback(
    async (id) => {
      await api.deleteConversation(id);
      override(id, { deleted: true });
      setItems((items) => items.filter((x) => !same(x.id, id)));
    },
    [override, setItems],
  );

  // Depois de enviar uma mensagem: busca prévia/contagem atualizadas e sobe a conversa.
  const refreshOne = useCallback(
    async (id) => {
      const c = await api.getConversation(id);
      place(c);
      return c;
    },
    [place],
  );

  const value = useMemo(
    () => ({ tab, setTab, list, overrides, create, rename, setArchived, remove, refreshOne }),
    [tab, list, overrides, create, rename, setArchived, remove, refreshOne],
  );
  return <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>;
}

export const useConversations = () => useContext(ConversationsContext);
