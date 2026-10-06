import { ArrowDown, Check, Info, TriangleAlert } from 'lucide-react';
import s from './reports.module.css';
import { faixa } from './format';

/** Barra horizontal com a marca da meta. */
export function Meter({ value, meta = 0.8, label, large = false, showMetaLabel = false }) {
  const f = faixa(value, meta);
  return (
    <div className={`${s.meter} ${large ? s.meterLg : ''}`} role="img" aria-label={label}>
      <div className={`${s.meterFill} ${s[`fill-${f}`]}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
      <div className={s.meterMark} style={{ left: `${meta * 100}%` }} />
      {showMetaLabel && (
        <span className={s.meterLabel} style={{ left: `${meta * 100}%` }} aria-hidden="true">
          Meta {Math.round(meta * 100)}%
        </span>
      )}
    </div>
  );
}

/** Selo de meta: sempre texto + ícone, nunca só cor. */
export function StatusBadge({ value, meta = 0.8, below, children }) {
  const f = faixa(value, meta);
  const Icon = below ? ArrowDown : Check;
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
