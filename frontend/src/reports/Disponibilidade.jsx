import { Fragment, useMemo } from 'react';
import s from './reports.module.css';
import { ResumoCards, useLimite } from './parts';
import { dec1OuTraco, diaCompleto, duracao, int, MINUTOS_POR_SLOT, ouTraco, rotuloDia, rotuloEspecialidade, rotuloTurno, slotsEmMinutos } from './format';

const LIMITE = 12;
const TURNOS = ['manha', 'tarde'];

// Agrupar por data é apresentação; a ordem e os valores vêm do agente.
const porData = (lista) =>
  lista.reduce((acc, item) => {
    (acc[item.data] ||= []).push(item);
    return acc;
  }, {});

const vagas = (n) => `${int(n)} ${n === 1 ? 'vaga' : 'vagas'}`;

/** @param {{bloco: import('./types').BlocoDisponibilidade, impressao?: boolean}} props */
export function Disponibilidade({ bloco, impressao = false }) {
  const { faixas = [], por_dia: porDia = [], minutos_por_janela: janela } = bloco.dados;
  const comJanela = janela > MINUTOS_POR_SLOT;
  const rotuloJanela = `Cabem (${duracao(janela)})`;
  const dias = useMemo(() => porData(porDia), [porDia]);
  const { visiveis, botao } = useLimite(faixas, LIMITE, impressao);
  const grupos = useMemo(() => Object.entries(porData(visiveis)), [visiveis]);

  return (
    <>
      <ResumoCards resumo={bloco.resumo} />

      {porDia.length > 0 && (
        <div className={s.block}>
          <h4 className={s.blockTitle}>Por dia</h4>
          <ul className={s.dispDays}>
            {Object.entries(dias).map(([data, turnos]) => (
              <li key={data} className={s.dispDay}>
                <strong>{rotuloDia(data)}</strong>
                {TURNOS.map((t) => {
                  const d = turnos.find((x) => x.periodo === t);
                  return (
                    <div key={t} className={s.dispTurno}>
                      <span>{rotuloTurno(t)}</span>
                      {d ? (
                        <b>
                          {vagas(d.vagas_livres)} · {dec1OuTraco(d.horas_livres)} h
                          {d.janelas != null && comJanela && <small> · cabem {int(d.janelas)}</small>}
                        </b>
                      ) : (
                        <b className={s.muted}>—</b>
                      )}
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {faixas.length > 0 && (
        <div className={s.block}>
          <h4 className={s.blockTitle}>
            Faixas livres <span className={s.muted}>· {faixas.length}</span>
          </h4>

          <div className={`${s.tableWrap} ${s.wideOnly}`}>
            <table className={`${s.table} ${s.dense}`}>
              <caption className="sr-only">Faixas de vagas livres por dia, profissional, sala e posto</caption>
              <thead>
                <tr>
                  <th scope="col">Horário</th>
                  <th scope="col">Turno</th>
                  <th scope="col">Profissional</th>
                  <th scope="col">Especialidade</th>
                  <th scope="col">Sala · posto</th>
                  <th scope="col" className={s.num}>Vagas</th>
                  {comJanela && <th scope="col" className={s.num}>{rotuloJanela}</th>}
                </tr>
              </thead>
              <tbody>
                {grupos.map(([data, lista]) => (
                  <Fragment key={data}>
                    <tr className={s.groupRow}>
                      <th scope="colgroup" colSpan={comJanela ? 7 : 6}>{diaCompleto(data)}</th>
                    </tr>
                    {lista.map((f) => (
                      <tr key={`${f.profissional.id}-${f.sala_id}-${f.posto}-${f.inicio}`}>
                        <th scope="row">{f.inicio}–{f.fim}</th>
                        <td className={s.muted}>{rotuloTurno(f.periodo)}</td>
                        <td>{ouTraco(f.profissional.nome)}</td>
                        <td>{rotuloEspecialidade(f.profissional.especialidade)}</td>
                        <td>{ouTraco(f.sala_nome)} · posto {ouTraco(f.posto)}</td>
                        <td className={s.num}>
                          {vagas(f.slots)} <span className={s.muted}>({duracao(slotsEmMinutos(f.slots))})</span>
                        </td>
                        {comJanela && <td className={s.num}><strong>{int(f.cabem)}</strong></td>}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`${s.dayList} ${s.compactOnly}`}>
            {grupos.map(([data, lista]) => (
              <section key={data} className={s.compactGroup} aria-label={diaCompleto(data)}>
                <h5>{diaCompleto(data)}</h5>
                {lista.map((f) => (
                  <div key={`${f.profissional.id}-${f.sala_id}-${f.posto}-${f.inicio}`} className={s.faixa}>
                    <div className={s.grow}>
                      <strong>
                        {f.inicio}–{f.fim} <span className={s.muted}>· {rotuloTurno(f.periodo)}</span>
                      </strong>
                      <span>{ouTraco(f.profissional.nome)} · {rotuloEspecialidade(f.profissional.especialidade)}</span>
                      <span className={s.muted}>{ouTraco(f.sala_nome)} · posto {ouTraco(f.posto)}</span>
                    </div>
                    <div className={s.faixaNum}>
                      <b>{vagas(f.slots)}</b>
                      <small>{duracao(slotsEmMinutos(f.slots))}</small>
                      {comJanela && <small>cabem {int(f.cabem)}</small>}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
          {botao && <div className={s.pad}>{botao}</div>}
        </div>
      )}
    </>
  );
}
