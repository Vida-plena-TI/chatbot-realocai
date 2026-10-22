import { Clock, Hourglass } from 'lucide-react';
import s from './reports.module.css';
import { ResumoCards } from './parts';
import { diaCompleto, duracao, ouTraco } from './format';

// LGPD: único bloco com nome de paciente. Só aparece na tela e no PDF; nunca em log,
// armazenamento do navegador, URL ou título do documento.

// Sessões e intervalos na ordem do horário ("HH:MM" ordena como texto).
const linhaDoTempo = (dia) =>
  [...(dia.sessoes || []).map((x) => ({ tipo: 'sessao', ...x })), ...(dia.intervalos || []).map((x) => ({ tipo: 'intervalo', ...x }))].sort(
    (a, b) => a.inicio.localeCompare(b.inicio) || (a.tipo === 'sessao' ? -1 : 1),
  );

function Intervalo({ i }) {
  const pausa = i.minutos_de_pausa > 0 ? `, inclui ${duracao(i.minutos_de_pausa)} de pausa` : '';
  return (
    <li className={s.tlGap}>
      <span className={s.tlTime}>{i.inicio}–{i.fim}</span>
      <span className={s.tlGapText}>
        <Hourglass size={13} strokeWidth={2.4} aria-hidden="true" />
        Intervalo de {duracao(i.minutos)}
        {pausa}
      </span>
    </li>
  );
}

function Sessao({ x }) {
  return (
    <li className={s.tlItem}>
      <span className={s.tlTime}>
        <b>{x.inicio}</b>
        <small>{x.fim}</small>
      </span>
      <div className={s.tlCard}>
        <strong>{ouTraco(x.especialidade)}</strong>
        <span>{ouTraco(x.profissional_nome)} · {ouTraco(x.sala_nome)}</span>
        {x.aguardando_autorizacao && (
          <span className={`${s.badge} ${s['badge-warn']}`}>
            <Clock size={12} strokeWidth={3} aria-hidden="true" />
            Aguardando autorização
          </span>
        )}
      </div>
    </li>
  );
}

/** @param {{bloco: import('./types').BlocoAgendaPaciente}} props */
export function AgendaPaciente({ bloco }) {
  const { dias = [] } = bloco.dados;
  return (
    <>
      <ResumoCards resumo={bloco.resumo} />
      <div className={s.tlDays}>
        {dias.map((d) => {
          const n = d.sessoes?.length ?? 0;
          return (
          <section key={d.data} className={s.tlDay} aria-label={diaCompleto(d.data)}>
            <h4 className={s.tlDayTitle}>
              {diaCompleto(d.data)}
              <span className={s.muted}>
                {n} {n === 1 ? 'sessão' : 'sessões'}
              </span>
            </h4>
            <ol className={s.tl}>
              {linhaDoTempo(d).map((x) =>
                x.tipo === 'sessao' ? <Sessao key={`s-${x.inicio}-${x.sala_nome}`} x={x} /> : <Intervalo key={`i-${x.inicio}`} i={x} />,
              )}
            </ol>
          </section>
          );
        })}
      </div>
    </>
  );
}
