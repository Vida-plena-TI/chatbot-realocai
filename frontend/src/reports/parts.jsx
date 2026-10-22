import { useState } from 'react';
import { ArrowDown, CalendarX, Check, Info, TriangleAlert } from 'lucide-react';
import s from './reports.module.css';
import { faixa } from './format';

/** Barra horizontal com a marca da meta. `neutro`: sem escala (inconsistência de dados). */
export function Meter({ value, meta = 0.8, label, large = false, showMetaLabel = false, neutro = false }) {
  const f = neutro ? 'neutral' : faixa(value, meta);
  const width = Number.isFinite(value) ? Math.min(100, value * 100) : neutro ? 100 : 0;
  return (
    <div className={`${s.meter} ${large ? s.meterLg : ''}`} role="img" aria-label={label}>
      <div className={`${s.meterFill} ${s[`fill-${f}`]}`} style={{ width: `${width}%` }} />
      {meta != null && <div className={s.meterMark} style={{ left: `${meta * 100}%` }} />}
      {showMetaLabel && meta != null && (
        <span className={s.meterLabel} style={{ left: `${meta * 100}%` }} aria-hidden="true">
          Meta {Math.round(meta * 100)}%
        </span>
      )}
    </div>
  );
}

/** Selo de meta: sempre texto + ícone, nunca só cor. `neutro`: "Sem escala". */
export function StatusBadge({ value, meta = 0.8, below, neutro = false, children }) {
  const f = neutro ? 'neutral' : faixa(value, meta);
  const Icon = neutro ? CalendarX : below ? ArrowDown : Check;
  return (
    <span className={`${s.badge} ${s[`badge-${f}`]}`}>
      <Icon size={12} strokeWidth={3} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Notice({ children, warn = false }) {
  const Icon = warn ? TriangleAlert : Info;
  return (
    <div className={`${s.notice} ${warn ? s.noticeWarn : ''}`} role={warn ? 'status' : undefined}>
      <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** Cartões do `resumo` do bloco: mostram `exibicao`, já formatada pelo agente. */
export function ResumoCards({ resumo }) {
  if (!resumo?.length) return null;
  return (
    <dl className={s.stats}>
      {resumo.map((r) => (
        <div key={r.rotulo} className={s.stat}>
          <dt>{r.rotulo}</dt>
          <dd>{r.exibicao ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "+N linhas" quando o agente cortou o resultado (`linhas_omitidas`). */
export function MaisLinhas({ n }) {
  if (!(n > 0)) return null;
  return (
    <p className={s.moreRows}>
      +{n} {n === 1 ? 'linha não exibida' : 'linhas não exibidas'} (limite do relatório)
    </p>
  );
}

/**
 * Lista longa no chat: mostra as primeiras `limite` e um botão para ver todas.
 * Na impressão (PDF) mostra sempre tudo.
 */
export function useLimite(lista, limite, impressao) {
  const [todas, setTodas] = useState(false);
  const cortar = !impressao && !todas && lista.length > limite + 2;
  return {
    visiveis: cortar ? lista.slice(0, limite) : lista,
    botao: cortar ? (
      <button type="button" className={s.showAll} onClick={() => setTodas(true)}>
        Mostrar todas ({lista.length})
      </button>
    ) : null,
  };
}
