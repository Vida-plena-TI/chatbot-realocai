import { Fragment, useMemo, useState } from 'react';
import s from './reports.module.css';
import { ResumoCards } from './parts';
import {
  chaveEspecialidade,
  dec1,
  dec1OuTraco,
  diaCompleto,
  duracao,
  ehIdentificador,
  int,
  MINUTOS_POR_SLOT,
  ouTraco,
  rotuloDia,
  rotuloEspecialidade,
  rotuloTurno,
  slotsEmMinutos,
} from './format';

// "Mostrar todas": o limite conta grupos (dia + especialidade) inteiros, até cerca de LIMITE faixas.
const LIMITE = 12;
const TURNOS = ['manha', 'tarde'];
const SEM_ESPECIALIDADE = 'Sem especialidade';
const comparar = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare;

// Agrupar por data é apresentação; a ordem e os valores vêm do agente.
const porData = (lista) =>
  lista.reduce((acc, item) => {
    (acc[item.data] ||= []).push(item);
    return acc;
  }, {});

const vagas = (n) => `${int(n)} ${n === 1 ? 'vaga' : 'vagas'}`;
/** Subtotal do grupo: "12 vagas · 6,0 h" (1 vaga = 30 min). */
export const subtotal = (slots) => `${vagas(slots)} · ${dec1(slotsEmMinutos(slots) / 60)} h`;

const porHorario = (a, b) =>
  a.inicio.localeCompare(b.inicio) ||
  comparar(a.profissional?.nome ?? '', b.profissional?.nome ?? '') ||
  comparar(a.sala_nome ?? '', b.sala_nome ?? '') ||
  (a.posto ?? 0) - (b.posto ?? 0);

/**
 * Dia → especialidade → faixas. A chave da especialidade é normalizada ("Terapia Ocupacional" e
 * "terapia_ocupacional" caem no mesmo grupo); a ordem dos grupos é alfabética e igual em todos os
 * dias, com "Sem especialidade" por último. Nenhuma faixa é criada, perdida ou alterada.
 * @param {import('./types').FaixaVaga[]} faixas
 * @returns {{data: string, grupos: {chave: string, rotulo: string, faixas: import('./types').FaixaVaga[], slots: number}[]}[]}
 */
export function agruparFaixas(faixas) {
  // Rótulo de cada chave: prefere o texto escrito pelo agente (com acentos) ao identificador.
  const rotulos = new Map();
  for (const f of faixas) {
    const bruto = f.profissional?.especialidade;
    const chave = chaveEspecialidade(bruto);
    if (chave && (!rotulos.has(chave) || (ehIdentificador(rotulos.get(chave).bruto) && !ehIdentificador(bruto)))) {
      rotulos.set(chave, { bruto, texto: rotuloEspecialidade(bruto) });
    }
  }
  const ordem = [...rotulos.keys()].sort((a, b) => comparar(rotulos.get(a).texto, rotulos.get(b).texto));
  const posicao = new Map([...ordem, ''].map((k, i) => [k, i]));

  const dias = new Map();
  for (const f of faixas) {
    const chave = chaveEspecialidade(f.profissional?.especialidade);
    if (!dias.has(f.data)) dias.set(f.data, new Map());
    const grupos = dias.get(f.data);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(f);
  }
  return [...dias.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, grupos]) => ({
      data,
      grupos: [...grupos.entries()]
        .sort(([a], [b]) => posicao.get(a) - posicao.get(b))
        .map(([chave, lista]) => ({
          chave,
          rotulo: chave ? rotulos.get(chave).texto : SEM_ESPECIALIDADE,
          faixas: [...lista].sort(porHorario),
          slots: lista.reduce((acc, f) => acc + f.slots, 0),
        })),
    }));
}

/** Grupos inteiros até somar LIMITE faixas (pelo menos um); corta só se sobrarem 3 ou mais. */
function limitar(dias, total) {
  let linhas = 0;
  const visiveis = [];
  for (const d of dias) {
    const grupos = [];
    for (const g of d.grupos) {
      if (linhas && linhas + g.faixas.length > LIMITE) break;
      grupos.push(g);
      linhas += g.faixas.length;
    }
    if (grupos.length) visiveis.push({ ...d, grupos });
    if (grupos.length < d.grupos.length) break;
  }
  return total - linhas > 2 ? visiveis : dias;
}

const chaveFaixa = (f, i) => `${f.profissional?.id}-${f.sala_id}-${f.posto}-${f.inicio}-${i}`;

/** @param {{bloco: import('./types').BlocoDisponibilidade, impressao?: boolean}} props */
export function Disponibilidade({ bloco, impressao = false }) {
  const { faixas = [], por_dia: porDia = [], minutos_por_janela: janela } = bloco.dados;
  const comJanela = janela > MINUTOS_POR_SLOT;
  const rotuloJanela = `Cabem (${duracao(janela)})`;
  const colunas = comJanela ? 5 : 4;
  const dias = useMemo(() => porData(porDia), [porDia]);
  const agrupado = useMemo(() => agruparFaixas(faixas), [faixas]);
  const [todas, setTodas] = useState(false);
  const visiveis = useMemo(() => (impressao || todas ? agrupado : limitar(agrupado, faixas.length)), [agrupado, faixas.length, impressao, todas]);
  const cortado = visiveis !== agrupado;

  const linha = (f, key) => (
    <tr key={key}>
      <th scope="row">{f.inicio}–{f.fim}</th>
      <td>{ouTraco(f.profissional?.nome)}</td>
      <td>{ouTraco(f.sala_nome)} · posto {ouTraco(f.posto)}</td>
      <td className={s.num}>
        {vagas(f.slots)} <span className={s.muted}>({duracao(slotsEmMinutos(f.slots))})</span>
      </td>
      {comJanela && <td className={s.num}><strong>{int(f.cabem)}</strong></td>}
    </tr>
  );

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

          {visiveis.map(({ data, grupos }) => (
            <Fragment key={data}>
              {/* Uma tabela por dia; o dia fica no thead e se repete em cada página do PDF. */}
              <div className={`${s.tableWrap} ${s.wideOnly}`}>
                <table className={`${s.table} ${s.dense} ${s.dispTable}`}>
                  <caption className="sr-only">Faixas livres de {diaCompleto(data)}, por especialidade</caption>
                  <thead>
                    <tr className={s.dispDayRow}>
                      <th scope="colgroup" colSpan={colunas}>{diaCompleto(data)}</th>
                    </tr>
                    <tr>
                      <th scope="col">Horário</th>
                      <th scope="col">Profissional</th>
                      <th scope="col">Sala · posto</th>
                      <th scope="col" className={s.num}>Vagas</th>
                      {comJanela && <th scope="col" className={s.num}>{rotuloJanela}</th>}
                    </tr>
                  </thead>
                  {grupos.map((g) => (
                    <Fragment key={g.chave}>
                      {/* Título + primeira faixa juntos: o título nunca fica sozinho no fim da página. */}
                      <tbody className={s.specHead}>
                        <tr className={s.specRow}>
                          <th scope="rowgroup" colSpan={colunas}>
                            {g.rotulo} <span>{subtotal(g.slots)}</span>
                          </th>
                        </tr>
                        {linha(g.faixas[0])}
                      </tbody>
                      {g.faixas.length > 1 && (
                        <tbody>
                          {g.faixas.slice(1).map((f, i) => linha(f, chaveFaixa(f, i)))}
                        </tbody>
                      )}
                    </Fragment>
                  ))}
                </table>
              </div>

              <section className={`${s.dayList} ${s.compactGroup} ${s.compactOnly}`} aria-label={diaCompleto(data)}>
                <h5>{diaCompleto(data)}</h5>
                {grupos.map((g) => (
                  <div key={g.chave} className={s.specGroup}>
                    <div className={s.specTitle}>
                      <strong>{g.rotulo}</strong>
                      <span>{subtotal(g.slots)}</span>
                    </div>
                    {g.faixas.map((f, i) => (
                      <div key={chaveFaixa(f, i)} className={s.faixa}>
                        <div className={s.grow}>
                          <strong>{f.inicio}–{f.fim}</strong>
                          <span>{ouTraco(f.profissional?.nome)}</span>
                          <span className={s.muted}>{ouTraco(f.sala_nome)} · posto {ouTraco(f.posto)}</span>
                        </div>
                        <div className={s.faixaNum}>
                          <b>{vagas(f.slots)}</b>
                          <small>{duracao(slotsEmMinutos(f.slots))}</small>
                          {comJanela && <small>cabem {int(f.cabem)}</small>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            </Fragment>
          ))}

          {cortado && (
            <div className={s.pad}>
              <button type="button" className={s.showAll} onClick={() => setTodas(true)}>
                Mostrar todas ({faixas.length})
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
