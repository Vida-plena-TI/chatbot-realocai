import { useEffect, useState } from 'react';
import s from './chat.module.css';
import { AgentAvatar } from './MessageBubble';
import { ReportSkeleton } from '../../reports/ReportCard';

// A resposta chega inteira (sem streaming) e pode levar vários segundos. O cliente não tem
// timeout próprio: espera o backend, que desiste antes (502) se o agente não responder.
const AINDA = 8;
const DEMORA = 20;

export function TypingIndicator({ report = false }) {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    const inicio = Date.now();
    const t = setInterval(() => setSeg(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const slow = seg >= AINDA;
  const demorando = seg >= DEMORA;
  const decorrido = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

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
        {demorando
          ? 'A resposta está demorando mais que o normal. Continuamos aguardando, não precisa reenviar.'
          : slow
            ? 'Ainda consultando, pode levar mais alguns segundos…'
            : report
              ? 'Montando o relatório…'
              : 'Consultando a agenda…'}
        {demorando && (
          <span className={s.elapsed} aria-hidden="true">
            {decorrido}
          </span>
        )}
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
