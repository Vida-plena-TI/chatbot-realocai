import { useMemo, useState } from 'react';
import s from './reports.module.css';
import { Meter, StatusBadge } from './parts';
import { pct, statusMeta } from './format';

const ABAS = [
  ['por_especialidade', 'Especialidade'],
  ['por_sala', 'Sala'],
];

/** @param {{bloco: import('./types').BlocoOcupacaoAgregada}} props */
export function OcupacaoAgregada({ bloco }) {
  const [aba, setAba] = useState('por_especialidade');
  const meta = bloco.meta;
  // Ordenar é apresentação; os valores vêm como estão.
  const itens = useMemo(() => [...(bloco.dados[aba] || [])].sort((a, b) => a.percentual - b.percentual), [bloco, aba]);
  const abaixo = itens.filter((i) => i.abaixo_da_meta).length;
  const aria = (i) => `${i.rotulo}: ${pct(i.percentual)}, ${i.abaixo_da_meta ? 'abaixo da meta' : 'meta atingida'}`;

  return (
    <>
      <div className={`${s.pad} ${s.row} ${s.spread}`} style={{ flexWrap: 'wrap', paddingBottom: 6 }}>
        <div className={s.seg} role="tablist" aria-label="Agrupar por">
          {ABAS.map(([k, rot]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}>
              {rot}
            </button>
          ))}
        </div>
        {abaixo > 0 && <span className={s.lowText}>{abaixo} de {itens.length} abaixo da meta</span>}
      </div>

      <div className={s.agrList} role="tabpanel">
        {itens.map((i) => (
          <div key={i.rotulo}>
            <div className={`${s.agrRow} ${i.abaixo_da_meta ? s.agrBelow : ''} ${s.wideOnly}`}>
              <span className={s.agrLabel}>{i.rotulo}</span>
              <Meter value={i.percentual} meta={meta} label={aria(i)} />
              <span className={s.agrNum}>{i.ocupados}/{i.escalados}</span>
              <span className={s.agrPct}>{pct(i.percentual)}</span>
              <span>
                <StatusBadge value={i.percentual} meta={meta} below={i.abaixo_da_meta}>{statusMeta(i.abaixo_da_meta, 0, true)}</StatusBadge>
              </span>
            </div>
            <div className={`${s.dayCard} ${s.compactOnly} ${i.abaixo_da_meta ? s.agrBelow : ''}`} style={{ border: 0, borderTop: '1px solid var(--border)', borderRadius: 0, padding: '10px 0' }}>
              <div className={s.row}>
                <span className={`${s.agrLabel} ${s.grow}`}>{i.rotulo}</span>
                <span className={s.agrPct}>{pct(i.percentual)}</span>
              </div>
              <Meter value={i.percentual} meta={meta} label={aria(i)} />
              <div className={`${s.row} ${s.spread}`}>
                <span className={s.agrNum}>{i.ocupados}/{i.escalados} slots</span>
                <StatusBadge value={i.percentual} meta={meta} below={i.abaixo_da_meta}>{statusMeta(i.abaixo_da_meta, 0, true)}</StatusBadge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
