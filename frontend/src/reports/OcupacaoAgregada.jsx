import { useMemo, useState } from 'react';
import s from './reports.module.css';
import { Meter, StatusBadge } from './parts';
import { ariaOcupacao, ouTraco, pctOuTraco, rotuloStatus, semEscala } from './format';

const ABAS = [
  ['por_especialidade', 'Especialidade'],
  ['por_sala', 'Sala'],
];

/** @param {{bloco: import('./types').BlocoOcupacaoAgregada, impressao?: boolean}} props */
export function OcupacaoAgregada({ bloco, impressao = false }) {
  const [aba, setAba] = useState('por_especialidade');

  // Na impressão não há abas: os dois agrupamentos aparecem, um depois do outro.
  if (impressao) {
    return ABAS.map(([k, rot], i) => (
      <div key={k} className={i ? s.section : undefined}>
        <Agrupamento bloco={bloco} chave={k} topo={<strong className={s.agrTitle}>Por {rot.toLowerCase()}</strong>} />
      </div>
    ));
  }

  return (
    <Agrupamento
      bloco={bloco}
      chave={aba}
      painel
      topo={
        <div className={s.seg} role="tablist" aria-label="Agrupar por">
          {ABAS.map(([k, rot]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}>
              {rot}
            </button>
          ))}
        </div>
      }
    />
  );
}

function Agrupamento({ bloco, chave, topo, painel = false }) {
  const meta = bloco.meta;
  // Ordenar é apresentação; os valores vêm como estão.
  const itens = useMemo(() => [...(bloco.dados[chave] || [])].sort((a, b) => a.percentual - b.percentual), [bloco, chave]);
  const abaixo = itens.filter((i) => i.abaixo_da_meta).length;
  const sem = (i) => semEscala(i.slots_escalados, i.slots_ocupados);
  const aria = (i) => ariaOcupacao(i.rotulo, i.percentual, sem(i), i.abaixo_da_meta);

  return (
    <>
      <div className={`${s.pad} ${s.row} ${s.spread}`} style={{ flexWrap: 'wrap', paddingBottom: 6 }}>
        {topo}
        {abaixo > 0 && <span className={s.lowText}>{abaixo} de {itens.length} abaixo da meta</span>}
      </div>

      <div className={s.agrList} role={painel ? 'tabpanel' : undefined}>
        {itens.map((i) => (
          <div key={i.rotulo}>
            <div className={`${s.agrRow} ${i.abaixo_da_meta ? s.agrBelow : ''} ${s.wideOnly}`}>
              <span className={s.agrLabel}>{i.rotulo}</span>
              <Meter value={i.percentual} meta={meta} neutro={sem(i)} label={aria(i)} />
              <span className={s.agrNum}>{ouTraco(i.slots_ocupados)}/{ouTraco(i.slots_escalados)}</span>
              <span className={s.agrPct}>{pctOuTraco(i.percentual)}</span>
              <span>
                <StatusBadge value={i.percentual} meta={meta} below={i.abaixo_da_meta} neutro={sem(i)}>{rotuloStatus(sem(i), i.abaixo_da_meta, 0, true)}</StatusBadge>
              </span>
            </div>
            <div className={`${s.dayCard} ${s.compactOnly} ${i.abaixo_da_meta ? s.agrBelow : ''}`} style={{ border: 0, borderTop: '1px solid var(--border)', borderRadius: 0, padding: '10px 0' }}>
              <div className={s.row}>
                <span className={`${s.agrLabel} ${s.grow}`}>{i.rotulo}</span>
                <span className={s.agrPct}>{pctOuTraco(i.percentual)}</span>
              </div>
              <Meter value={i.percentual} meta={meta} neutro={sem(i)} label={aria(i)} />
              <div className={`${s.row} ${s.spread}`}>
                <span className={s.agrNum}>{ouTraco(i.slots_ocupados)}/{ouTraco(i.slots_escalados)} slots</span>
                <StatusBadge value={i.percentual} meta={meta} below={i.abaixo_da_meta} neutro={sem(i)}>{rotuloStatus(sem(i), i.abaixo_da_meta, 0, true)}</StatusBadge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
