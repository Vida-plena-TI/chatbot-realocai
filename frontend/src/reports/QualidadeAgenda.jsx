import { Fragment, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import s from './reports.module.css';
import { ResumoCards } from './parts';
import { duracao, int, MINUTOS_POR_SLOT, rotuloDia, rotuloEspecialidade, slotsDuracao, slotsEmMinutos } from './format';

// Todos os valores do bloco são contagens de slots; a tela só converte em minutos (1 slot = 30 min).
const maiorFaixa = (slots) => (slots ? duracao(slotsEmMinutos(slots)) : '—');

/** Tabela larga: o número de slots e, embaixo, a duração. */
function Slots({ n }) {
  return (
    <span className={s.slotCell} aria-label={slotsDuracao(n)}>
      <span aria-hidden="true">{int(n)}</span>
      {n > 0 && <small aria-hidden="true">{duracao(slotsEmMinutos(n))}</small>}
    </span>
  );
}

function PorDia({ dias }) {
  return (
    <table className={`${s.table} ${s.dense} ${s.subTable}`}>
      <thead>
        <tr>
          <th scope="col">Dia</th>
          <th scope="col" className={s.num}>Ocupados</th>
          <th scope="col" className={s.num}>Buracos</th>
          <th scope="col" className={s.num}>Slots em buracos</th>
          <th scope="col" className={s.num}>Slots isolados</th>
          <th scope="col" className={s.num}>Maior faixa livre</th>
        </tr>
      </thead>
      <tbody>
        {dias.map((d) => (
          <tr key={d.data}>
            <th scope="row">{rotuloDia(d.data)}</th>
            <td className={s.num}>{int(d.slots_ocupados)} de {int(d.slots_escalados)}</td>
            <td className={s.num}>{int(d.buracos)}</td>
            <td className={s.num}><Slots n={d.slots_em_buracos} /></td>
            <td className={s.num}><Slots n={d.slots_isolados} /></td>
            <td className={s.num}>{maiorFaixa(d.maior_faixa_livre)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** @param {{bloco: import('./types').BlocoQualidadeAgenda, impressao?: boolean}} props */
export function QualidadeAgenda({ bloco, impressao = false }) {
  const { por_profissional: profs = [], por_dia: porDia = [] } = bloco.dados;
  const [abertos, setAbertos] = useState({});
  const toggle = (id) => setAbertos((a) => ({ ...a, [id]: !a[id] }));
  // Na impressão o detalhe por dia sai sempre aberto: é a tabela "Por profissional e dia".
  const aberto = (id) => impressao || !!abertos[id];
  const diasDe = useMemo(
    () =>
      porDia.reduce((acc, d) => {
        (acc[d.profissional.id] ||= []).push(d);
        return acc;
      }, {}),
    [porDia],
  );

  return (
    <>
      <ResumoCards resumo={bloco.resumo} />
      <p className={s.legendNote}>
        <b>Buraco</b>: faixa livre entre dois atendimentos no mesmo posto. <b>Isolado</b>: vaga em que não cabe 1 h. Cada slot tem{' '}
        {MINUTOS_POR_SLOT} min.
      </p>

      <div className={`${s.tableWrap} ${s.wideOnly}`}>
        <table className={`${s.table} ${s.dense}`}>
          <caption className="sr-only">Qualidade da agenda por profissional</caption>
          <thead>
            <tr>
              <th scope="col">Profissional</th>
              <th scope="col" className={s.num}>Ocupados</th>
              <th scope="col" className={s.num}>Vagas livres</th>
              <th scope="col" className={s.num}>Buracos</th>
              <th scope="col" className={s.num}>Slots em buracos</th>
              <th scope="col" className={s.num}>Slots isolados</th>
              <th scope="col" className={s.num}>Faixas livres</th>
              <th scope="col" className={s.num}>Maior faixa livre</th>
              {!impressao && <th scope="col"><span className="sr-only">Detalhes por dia</span></th>}
            </tr>
          </thead>
          <tbody>
            {profs.map((p) => {
              const id = p.profissional.id;
              const dias = diasDe[id] || [];
              return (
                <Fragment key={id}>
                  <tr>
                    <th scope="row">
                      {p.profissional.nome}
                      <span className={s.cellSub}>{rotuloEspecialidade(p.profissional.especialidade)}</span>
                    </th>
                    <td className={s.num}>{int(p.slots_ocupados)} de {int(p.slots_escalados)}</td>
                    <td className={s.num}>{int(p.vagas_livres)}</td>
                    <td className={s.num}><strong>{int(p.buracos)}</strong></td>
                    <td className={s.num}><Slots n={p.slots_em_buracos} /></td>
                    <td className={s.num}><Slots n={p.slots_isolados} /></td>
                    <td className={s.num}>{int(p.faixas_livres)}</td>
                    <td className={s.num}>{maiorFaixa(p.maior_faixa_livre)}</td>
                    {!impressao && (
                      <td className={s.num}>
                        {dias.length > 0 && (
                          <button
                            type="button"
                            className={`${s.toggle} ${abertos[id] ? s.toggleOpen : ''}`}
                            aria-expanded={!!abertos[id]}
                            aria-label={`${abertos[id] ? 'Ocultar' : 'Ver'} dias de ${p.profissional.nome}`}
                            onClick={() => toggle(id)}
                          >
                            <ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {aberto(id) && dias.length > 0 && (
                    <tr className={s.detail}>
                      <td colSpan={impressao ? 8 : 9}>
                        <PorDia dias={dias} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`${s.dayList} ${s.compactOnly}`}>
        {profs.map((p) => {
          const id = p.profissional.id;
          const dias = diasDe[id] || [];
          return (
            <div key={id} className={s.dayCard}>
              <div className={`${s.row} ${s.spread}`}>
                <span className={s.grow}>
                  <strong>{p.profissional.nome}</strong>
                  <span className={s.cellSub}>{rotuloEspecialidade(p.profissional.especialidade)}</span>
                </span>
                <span className={s.dayPct}>{int(p.buracos)}</span>
              </div>
              <dl className={s.kv}>
                <div><dt>Ocupados</dt><dd>{int(p.slots_ocupados)} de {int(p.slots_escalados)}</dd></div>
                <div><dt>Buracos</dt><dd>{int(p.buracos)}</dd></div>
                <div><dt>Presos em buracos</dt><dd>{slotsDuracao(p.slots_em_buracos)}</dd></div>
                <div><dt>Isolados</dt><dd>{slotsDuracao(p.slots_isolados)}</dd></div>
                <div><dt>Faixas livres</dt><dd>{int(p.faixas_livres)}</dd></div>
                <div><dt>Maior faixa livre</dt><dd>{maiorFaixa(p.maior_faixa_livre)}</dd></div>
              </dl>
              {dias.length > 0 && !impressao && (
                <button type="button" className={s.linkBtn} aria-expanded={aberto(id)} onClick={() => toggle(id)}>
                  Por dia
                  <ChevronDown size={14} strokeWidth={2.6} className={aberto(id) ? s.toggleOpen : ''} aria-hidden="true" />
                </button>
              )}
              {aberto(id) && dias.length > 0 && (
                <ul className={s.plainList} style={{ margin: 0 }}>
                  {dias.map((d) => (
                    <li key={d.data}>
                      <span className={s.plainDay}>{rotuloDia(d.data)}</span>
                      <span className={s.grow}>
                        {int(d.buracos)} {d.buracos === 1 ? 'buraco' : 'buracos'} · {int(d.slots_isolados)} isolados
                      </span>
                      <span className={s.muted}>{int(d.slots_ocupados)}/{int(d.slots_escalados)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
