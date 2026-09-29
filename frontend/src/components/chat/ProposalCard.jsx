import { ArrowRight, Check } from 'lucide-react';
import s from './chat.module.css';
import { Button } from '../ui/Button';

const STATUS = {
  pendente: ['Aguardando decisão', s.statusPending],
  aprovada: ['Aprovada', s.statusApproved],
  recusada: ['Recusada', s.statusMuted],
  'sem-decisao': ['Sem decisão', s.statusMuted],
};

const place = (x) => [x.sala, x.profissional].filter((v) => v && v !== '—').join(' · ');

function Slot({ label, data, to = false, strike = true }) {
  return (
    <div className={`${s.slot} ${to ? s.slotTo : ''}`}>
      <div className={s.slotLabel}>{label}</div>
      <div className={`${s.slotTime} ${strike ? '' : s.noStrike}`}>{data.horario}</div>
      <div className={s.slotPlace}>{place(data) || '—'}</div>
      {data.dia && <div className={s.slotDay}>{data.dia}</div>}
    </div>
  );
}

export function ProposalCard({ proposal: p, status = 'pendente', canDecide, onDecide }) {
  const [label, cls] = STATUS[status] || STATUS.pendente;
  const isNew = p.de.horario === '—';

  return (
    <section className={s.card} aria-label={`Proposta para ${p.paciente}`}>
      <header className={s.cardHead}>
        <div className={s.cardHeadText}>
          <span className={s.cardKicker}>{isNew ? 'Proposta de encaixe' : 'Proposta de realocação'}</span>
          <span className={s.cardPatient}>{p.paciente}</span>
        </div>
        <span className={`${s.status} ${cls}`}>{label}</span>
      </header>

      <div className={s.slots}>
        <Slot label="DE" data={p.de} strike={!isNew} />
        <div className={s.arrow} aria-hidden="true">
          <ArrowRight size={16} strokeWidth={2.6} />
        </div>
        <Slot label="PARA" data={p.para} to />
      </div>

      {p.motivo && <p className={s.reason}>{p.motivo}</p>}

      {status === 'pendente' && (
        <div className={s.cardActions}>
          <Button size="sm" icon={Check} disabled={!canDecide} onClick={() => onDecide('aprovar')}>
            Aprovar
          </Button>
          <Button size="sm" variant="secondary" disabled={!canDecide} onClick={() => onDecide('recusar')}>
            Recusar
          </Button>
          <Button size="sm" variant="ghost" disabled={!canDecide} onClick={() => onDecide('outra')}>
            Outra opção
          </Button>
        </div>
      )}
      {status === 'aprovada' && (
        <p className={s.cardNote}>Aplique a mudança no sistema de agenda e avise a família. O realocAI não altera a agenda.</p>
      )}
      {status === 'recusada' && <p className={s.cardNote}>Nada foi alterado.</p>}
    </section>
  );
}
