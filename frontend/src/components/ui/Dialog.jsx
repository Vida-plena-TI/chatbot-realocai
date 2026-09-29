import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import s from './ui.module.css';

export function Dialog({ open, title, onClose, children }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    ref.current?.querySelector('input, textarea, button')?.focus();
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current?.();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title" className={s.dialogTitle}>
          {title}
        </h2>
        <div className={s.dialogBody}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
