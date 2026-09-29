import { useLayoutEffect, useMemo, useRef } from 'react';
import s from './chat.module.css';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { Button } from '../ui/Button';
import { decisionOf, parseContent } from '../../utils/content';

export function MessageList({ messages, sending, hasOlder, loadingOlder, onLoadOlder, canDecide, onDecide }) {
  const ref = useRef(null);
  const prev = useRef({ first: null, last: null, height: 0 });

  // Estado de cada proposta: definido pela próxima mensagem do usuário.
  const rows = useMemo(
    () =>
      messages.map((m, i) => {
        if (m.role === 'user') return { m, parsed: null, status: null };
        const parsed = parseContent(m.content);
        let status = null;
        if (parsed.proposal) {
          const next = messages.slice(i + 1).find((x) => x.role === 'user');
          status = !next || next.pending ? 'pendente' : decisionOf(next.content) || 'sem-decisao';
        }
        return { m, parsed, status };
      }),
    [messages],
  );

  // Rola para o fim em mensagens novas; mantém a posição ao carregar anteriores.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = messages[0]?.id;
    const last = messages[messages.length - 1]?.id;
    const p = prev.current;
    if (p.first != null && p.last === last && p.first !== first) el.scrollTop += el.scrollHeight - p.height;
    else if (p.last !== last || sending) el.scrollTop = el.scrollHeight;
    prev.current = { first, last, height: el.scrollHeight };
  }, [messages, sending]);

  return (
    <div className={s.scroll} ref={ref}>
      <div className={s.thread} role="log" aria-live="polite" aria-label="Mensagens">
        {hasOlder && (
          <Button variant="ghost" size="sm" className={s.older} onClick={onLoadOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}
          </Button>
        )}
        {rows.map(({ m, parsed, status }) => (
          <MessageBubble
            key={m.id}
            message={m}
            parsed={parsed}
            proposalStatus={status}
            canDecide={canDecide && status === 'pendente'}
            onDecide={onDecide}
          />
        ))}
        {sending && <TypingIndicator />}
      </div>
    </div>
  );
}
