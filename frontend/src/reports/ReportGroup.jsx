import { useId, useRef, useState } from 'react';
import s from './reports.module.css';
import { ReportCard, ReportModal, useExpand } from './ReportCard';
import { ExportBar } from './ExportBar';
import { tituloAba } from './format';

const MAX_BLOCOS = 10;

/**
 * Um turno pode trazer até 10 blocos. 1 bloco: cartão direto. 2 ou mais: abas + "Exportar todos".
 * @param {{blocos: import('./types').Bloco[]}} props
 */
export function ReportGroup({ blocos }) {
  const lista = blocos.slice(0, MAX_BLOCOS);
  const [ativo, setAtivo] = useState(0);
  const { aberto, abrir, fechar } = useExpand();
  const id = useId();
  const tabs = useRef([]);

  if (!lista.length) return null;
  const atual = lista[Math.min(ativo, lista.length - 1)];

  const onKey = (e) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (ativo + delta + lista.length) % lista.length;
    setAtivo(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className={s.group}>
      {lista.length > 1 && (
        <div className={s.groupBar}>
          <div className={s.tabs} role="tablist" aria-label="Relatórios desta resposta" onKeyDown={onKey}>
            {lista.map((b, i) => (
              <button
                key={i}
                ref={(el) => (tabs.current[i] = el)}
                type="button"
                role="tab"
                id={`${id}-tab-${i}`}
                aria-controls={`${id}-panel`}
                aria-selected={i === ativo}
                tabIndex={i === ativo ? 0 : -1}
                className={`${s.tab} ${i === ativo ? s.tabOn : ''}`}
                onClick={() => setAtivo(i)}
              >
                {tituloAba(b)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div role={lista.length > 1 ? 'tabpanel' : undefined} id={`${id}-panel`} aria-labelledby={lista.length > 1 ? `${id}-tab-${ativo}` : undefined}>
        <ReportCard key={ativo} bloco={atual} onExpand={() => abrir(atual)} />
      </div>

      {lista.length > 1 && (
        <div className={s.card} style={{ boxShadow: 'none' }}>
          <ExportBar blocos={lista} pergunta={`Exportar os ${lista.length} relatórios juntos?`} />
        </div>
      )}

      {aberto && <ReportModal bloco={aberto} onClose={fechar} />}
    </div>
  );
}
