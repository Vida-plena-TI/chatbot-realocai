import { useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import s from './chat.module.css';
import { Spinner } from '../ui/Spinner';

export function Composer({ value, onChange, onSubmit, busy = false, disabled = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (!busy && !disabled) ref.current?.focus();
  }, [busy, disabled]);

  const canSend = !busy && !disabled && value.trim().length > 0;
  const submit = () => canSend && onSubmit(value);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={s.composer}>
        <label className="sr-only" htmlFor="composer">
          Mensagem para o realocAI
        </label>
        <textarea
          id="composer"
          ref={ref}
          rows={1}
          className={s.textarea}
          value={value}
          disabled={disabled}
          placeholder="Descreva a demanda: remarcar, trocar de sala, encaixe, consultar agenda…"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" className={s.sendBtn} disabled={!canSend} aria-label="Enviar">
          {busy ? <Spinner light label="Enviando" /> : <ArrowUp size={18} strokeWidth={2.6} aria-hidden="true" />}
        </button>
      </div>
      <div className={s.hint}>Enter envia · Shift+Enter quebra linha</div>
    </form>
  );
}
