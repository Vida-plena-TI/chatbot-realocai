import { Fragment, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import s from './reports.module.css';
import { Meter, StatusBadge } from './parts';
import { ariaOcupacao, diaLongo, exibir, pctOuTraco, rotuloDia, rotuloStatus, semEscala } from './format';

/** @param {{bloco: import('./types').BlocoOcupacaoProfissional}} props */
export function OcupacaoProfissional({ bloco }) {
  const { semana, dias, dias_sem_agenda: semAgenda } = bloco.dados;
  const meta = bloco.meta;
  const [abertos, setAbertos] = useState({});
  const toggle = (d) => setAbertos((a) => ({ ...a, [d]: !a[d] }));
  const aria = ariaOcupacao;

  const Salas = ({ d }) => (
    <div className={s.salas}>
      {d.por_sala_posto.length ? (
        d.por_sala_posto.map((p) => (
          <span key={`${p.sala}-${p.posto}`} className={s.sala}>
            <span>{p.sala} · posto {p.posto}</span>
            <strong>{p.ocupados} de {p.escalados}</strong>
          </span>
        ))
      ) : (
        <span className={s.muted}>Sem detalhamento por sala neste dia.</span>
      )}
    </div>
  );

  return (
    <>
      <div className={s.pad}>
        <div className={s.hero}>
          <div className={s.heroPct}>{exibir(bloco, 'Semana', pctOuTraco(semana.percentual))}</div>
          <div className={s.heroSide}>
            <StatusBadge value={semana.percentual} meta={meta} below={semana.abaixo_da_meta} neutro={semEscala(semana)}>
              {rotuloStatus(semana, semana.slots_para_meta)}
            </StatusBadge>
            <span className={s.heroLine}>
              {semana.ocupados} de {semana.escalados} slots ocupados · {semana.livres} livres
            </span>
          </div>
        </div>
        <Meter large showMetaLabel value={semana.percentual} meta={meta} neutro={semEscala(semana)} label={`${aria('Semana', semana)}.${meta != null ? ` Meta ${Math.round(meta * 100)}%.` : ''}`} />
      </div>

      <div className={`${s.tableWrap} ${s.wideOnly}`}>
        <table className={s.table}>
          <caption className="sr-only">Ocupação por dia</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Ocupação</th>
              <th scope="col" className={s.num}>Ocupados</th>
              <th scope="col" className={s.num}>Manhã</th>
              <th scope="col" className={s.num}>Tarde</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="sr-only">Detalhes por sala</span></th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <Fragment key={d.data}>
                <tr>
                  <th scope="row">{rotuloDia(d.data)}</th>
                  <td>
                    <div className={s.barCell}>
                      <Meter value={d.percentual} meta={meta} neutro={semEscala(d)} label={aria(diaLongo(d.data), d)} />
                      <strong>{pctOuTraco(d.percentual)}</strong>
                    </div>
                  </td>
                  <td className={s.num}>{d.ocupados} de {d.escalados}</td>
                  <td className={`${s.num} ${s.muted}`}>{d.manha.ocupados}/{d.manha.escalados}</td>
                  <td className={`${s.num} ${s.muted}`}>{d.tarde.ocupados}/{d.tarde.escalados}</td>
                  <td>
                    <StatusBadge value={d.percentual} meta={meta} below={d.abaixo_da_meta} neutro={semEscala(d)}>
                      {rotuloStatus(d, d.slots_para_meta)}
                    </StatusBadge>
                  </td>
                  <td className={s.num}>
                    <button
                      type="button"
                      className={`${s.toggle} ${abertos[d.data] ? s.toggleOpen : ''}`}
                      aria-expanded={!!abertos[d.data]}
                      aria-label={`${abertos[d.data] ? 'Ocultar' : 'Ver'} salas de ${diaLongo(d.data)}`}
                      onClick={() => toggle(d.data)}
                    >
                      <ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
                {abertos[d.data] && (
                  <tr className={s.detail}>
                    <td colSpan={7}>
                      <Salas d={d} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${s.dayList} ${s.compactOnly}`}>
        {dias.map((d) => (
          <div key={d.data} className={s.dayCard}>
            <div className={s.row}>
              <strong className={s.grow}>{rotuloDia(d.data)}</strong>
              <span className={s.dayPct}>{pctOuTraco(d.percentual)}</span>
            </div>
            <Meter value={d.percentual} meta={meta} neutro={semEscala(d)} label={aria(diaLongo(d.data), d)} />
            <div className={s.dayMeta}>
              <b>{d.ocupados} de {d.escalados}</b>
              <span>Manhã {d.manha.ocupados}/{d.manha.escalados}</span>
              <span>Tarde {d.tarde.ocupados}/{d.tarde.escalados}</span>
            </div>
            <div className={`${s.row} ${s.spread}`}>
              <StatusBadge value={d.percentual} meta={meta} below={d.abaixo_da_meta} neutro={semEscala(d)}>
                {rotuloStatus(d, d.slots_para_meta)}
              </StatusBadge>
              <button type="button" className={s.linkBtn} aria-expanded={!!abertos[d.data]} onClick={() => toggle(d.data)}>
                Por sala
                <ChevronDown size={14} strokeWidth={2.6} className={abertos[d.data] ? s.toggleOpen : ''} aria-hidden="true" />
              </button>
            </div>
            {abertos[d.data] && <Salas d={d} />}
          </div>
        ))}
      </div>

      {semAgenda?.length > 0 && (
        <div className={s.noAgenda}>
          <span>Sem agenda</span>
          {semAgenda.map((d) => (
            <span key={d}>{rotuloDia(d)}</span>
          ))}
        </div>
      )}
    </>
  );
}
