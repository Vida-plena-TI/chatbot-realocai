import s from './ui.module.css';

export function IconButton({ label, icon: Icon, size = 18, className = '', ...rest }) {
  return (
    <button type="button" className={`${s.iconBtn} ${className}`} aria-label={label} title={label} {...rest}>
      <Icon size={size} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
