import { useEffect, useState } from 'react';
import s from './chat.module.css';
import { AgentAvatar } from './MessageBubble';

// A resposta chega inteira (sem streaming) e pode levar vários segundos.
export function TypingIndicator() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={s.rowAgent} role="status">
      <AgentAvatar />
      <div className={s.typing}>
        <span className={s.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {slow ? 'Ainda consultando, pode levar mais alguns segundos…' : 'Consultando a agenda…'}
      </div>
    </div>
  );
}
