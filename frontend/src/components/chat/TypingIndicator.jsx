import { useEffect, useState } from 'react';
import s from './chat.module.css';
import { AgentAvatar } from './MessageBubble';
import { ReportSkeleton } from '../../reports/ReportCard';

// A resposta chega inteira (sem streaming) e pode levar vários segundos.
export function TypingIndicator({ report = false }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={s.rowAgent} role="status">
      <AgentAvatar />
      <div className={s.agentCol}>
      <div className={s.typing}>
        <span className={s.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {slow ? 'Ainda consultando, pode levar mais alguns segundos…' : report ? 'Montando o relatório…' : 'Consultando a agenda…'}
      </div>
      {report && (
        <div style={{ alignSelf: 'stretch', maxWidth: 820 }}>
          <ReportSkeleton />
        </div>
      )}
      </div>
    </div>
  );
}
