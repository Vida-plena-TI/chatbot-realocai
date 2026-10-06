import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArchiveRestore, CloudOff, MessageSquareDashed, PanelLeft, SearchX, ShieldCheck } from 'lucide-react';
import s from './ChatPage.module.css';
import { api } from '../api/client';
import { useConversations } from '../conversations/ConversationsContext';
import { useMessages } from '../hooks/useMessages';
import { Sidebar } from '../components/sidebar/Sidebar';
import { MessageList } from '../components/chat/MessageList';
import { Composer } from '../components/chat/Composer';
import { SendError } from '../components/chat/SendError';
import { EmptyState, WelcomeState } from '../components/chat/EmptyState';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Spinner } from '../components/ui/Spinner';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { DECISION, titleFrom } from '../utils/content';
import { formatToday } from '../utils/formatDate';

function sendErrorCopy(e) {
  if (e?.status === 400) return { title: e.detail || 'A mensagem não pôde ser enviada.' };
  if (e?.status === 404) return { title: 'Esta conversa não existe mais.' };
  return {
    title: 'Não foi possível processar sua mensagem. Tente novamente.',
    detail: e?.status === 0 ? e.message : e?.detail,
  };
}

export default function ChatPage() {
  const { id } = useParams(); // undefined = nova conversa (ainda não criada)
  const navigate = useNavigate();
  const location = useLocation();
  const { overrides, create, refreshOne, setArchived } = useConversations();
  const msgs = useMessages(id);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const currentId = useRef(id);
  currentId.current = id;
  const firstHandled = useRef(null);

  useEffect(() => {
    setDrawerOpen(false);
    setSendError(null);
    setSending(false);
    setDetail(null);
    setDetailError(null);
    if (!location.state?.firstMessage) setDraft('');
    if (!id) return undefined;
    let alive = true;
    api
      .getConversation(id)
      .then((c) => alive && setDetail(c))
      .catch((e) => alive && setDetailError(e));
    return () => {
      alive = false;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const conv = detail ? { ...detail, ...overrides[String(detail.id)] } : null;
  const archived = conv?.status === 'archived';

  useEffect(() => {
    if (id && overrides[id]?.deleted) navigate('/', { replace: true });
  }, [id, overrides, navigate]);

  const send = async (raw, { fromComposer = false } = {}) => {
    const content = (raw || '').trim();
    if (!content || sending) return;
    setSendError(null);
    if (fromComposer) setDraft('');

    const fail = (error) => {
      setSendError({ ...sendErrorCopy(error), content, fromComposer });
      if (fromComposer) setDraft((d) => d || content); // não apaga o que foi digitado
    };

    // Primeira mensagem: cria a conversa e envia depois de navegar para ela.
    if (!id) {
      setSending(true);
      try {
        const c = await create(titleFrom(content));
        navigate(`/c/${c.id}`, { state: { firstMessage: content } });
      } catch (e) {
        fail(e);
        setSending(false);
      }
      return;
    }

    const convId = id;
    const tempId = `tmp-${Date.now()}`;
    msgs.append({ id: tempId, role: 'user', content, created_at: new Date().toISOString(), pending: true });
    setSending(true);
    try {
      const r = await api.sendMessage(convId, content);
      if (currentId.current !== convId) return;
      msgs.replace(tempId, [r.user_message, r.assistant_message]);
      refreshOne(convId)
        .then((c) => currentId.current === convId && setDetail(c))
        .catch(() => {});
    } catch (e) {
      if (currentId.current !== convId) return;
      msgs.remove(tempId);
      fail(e);
    } finally {
      if (currentId.current === convId) setSending(false);
    }
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const first = location.state?.firstMessage;
    if (!id || !first || msgs.loading || firstHandled.current === id) return;
    firstHandled.current = id;
    navigate(location.pathname, { replace: true, state: null });
    sendRef.current(first, { fromComposer: true });
  }, [id, msgs.loading, location.state, location.pathname, navigate]);

  const decide = (p, action) => {
    const para = [p.para.sala, p.para.profissional].filter(Boolean).join(', ');
    if (action === 'aprovar') send(`${DECISION.approve}: ${p.paciente}, ${p.de.horario} → ${p.para.horario}${para ? ` (${para})` : ''}.`);
    else if (action === 'recusar') send(`${DECISION.reject}: ${p.paciente}.`);
    else send(`Tem outra opção para ${p.paciente}?`);
  };

  const unarchive = async () => {
    try {
      await setArchived(id, false);
    } catch (e) {
      setSendError({ title: e.detail || 'Não foi possível desarquivar a conversa.' });
    }
  };

  const notFound = detailError?.status === 404 || msgs.error?.status === 404;

  let body;
  if (!id) {
    body = <WelcomeState onPick={(t) => send(t)} disabled={sending} />;
  } else if (notFound) {
    body = (
      <EmptyState
        icon={SearchX}
        title="Conversa não encontrada"
        text="Ela pode ter sido excluída."
        action={<Button onClick={() => navigate('/')}>Nova conversa</Button>}
      />
    );
  } else if (msgs.loading) {
    body = (
      <div className={s.center}>
        <Spinner label="Carregando mensagens" />
      </div>
    );
  } else if (msgs.error) {
    body = (
      <EmptyState
        icon={CloudOff}
        title="Não foi possível carregar as mensagens"
        text="Verifique a conexão e tente de novo."
        action={
          <Button variant="secondary" onClick={msgs.reload}>
            Tentar de novo
          </Button>
        }
      />
    );
  } else if (!msgs.items.length && !sending) {
    body = (
      <EmptyState
        icon={MessageSquareDashed}
        title="Conversa sem mensagens"
        text={archived ? 'Esta conversa foi arquivada antes de receber mensagens.' : 'Descreva a demanda abaixo para começar.'}
      />
    );
  } else {
    body = (
      <MessageList
        messages={msgs.items}
        sending={sending}
        hasOlder={msgs.hasOlder}
        loadingOlder={msgs.loadingOlder}
        onLoadOlder={msgs.loadOlder}
        canDecide={!sending && !archived}
        onDecide={decide}
      />
    );
  }

  const title = !id ? 'Nova conversa' : conv ? conv.title || 'Sem título' : '';

  return (
    <div className={s.shell}>
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} activeId={id} />
      <main className={s.main}>
        <header className={s.header}>
          <IconButton className={s.menuBtn} label="Abrir conversas" icon={PanelLeft} onClick={() => setDrawerOpen(true)} />
          <h1 className={s.title}>{title}</h1>
          {archived && <span className={s.pillArchived}>Arquivada</span>}
          <span className={s.pillMint} title="O realocAI consulta e sugere. Ele não altera a agenda.">
            <ShieldCheck size={14} strokeWidth={2.4} aria-hidden="true" />
            Só sugere
          </span>
          <span className={s.pillDate}>{formatToday()}</span>
          <ThemeToggle />
        </header>

        <div className={s.body}>{body}</div>

        {!notFound && (
          <div className={s.footer}>
            <div className={s.footerInner}>
              {sendError && (
                <SendError
                  title={sendError.title}
                  detail={sendError.detail}
                  onRetry={
                    sendError.content
                      ? () => send(sendError.fromComposer ? draft || sendError.content : sendError.content, { fromComposer: sendError.fromComposer })
                      : undefined
                  }
                  onDismiss={() => setSendError(null)}
                />
              )}
              {archived ? (
                <div className={s.archivedNote}>
                  <span>Conversa arquivada. Desarquive para enviar mensagens.</span>
                  <Button size="sm" variant="secondary" icon={ArchiveRestore} onClick={unarchive}>
                    Desarquivar
                  </Button>
                </div>
              ) : (
                <Composer
                  value={draft}
                  onChange={setDraft}
                  onSubmit={(v) => send(v, { fromComposer: true })}
                  busy={sending}
                  disabled={Boolean(id) && (msgs.loading || Boolean(msgs.error))}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
