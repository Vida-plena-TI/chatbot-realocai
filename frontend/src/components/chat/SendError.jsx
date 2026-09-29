import { CircleAlert, RotateCw, X } from 'lucide-react';
import s from './chat.module.css';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

export function SendError({ title, detail, onRetry, onDismiss }) {
  return (
    <div className={s.sendError} role="alert">
      <CircleAlert size={18} aria-hidden="true" />
      <div className={s.sendErrorText}>
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" icon={RotateCw} onClick={onRetry}>
          Reenviar
        </Button>
      )}
      <IconButton label="Fechar aviso" icon={X} onClick={onDismiss} />
    </div>
  );
}
