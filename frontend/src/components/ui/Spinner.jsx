import s from './ui.module.css';

export function Spinner({ label = 'Carregando', light = false }) {
  return <span className={`${s.spinner} ${light ? s.spinnerLight : ''}`} role="status" aria-label={label} />;
}

export function FullscreenSpinner() {
  return (
    <div className={s.fullscreen}>
      <Spinner />
    </div>
  );
}
