import s from './ui.module.css';

export function Button({ variant = 'primary', size, block = false, icon: Icon, className = '', type = 'button', children, ...rest }) {
  const cls = [s.btn, s[variant], size === 'sm' && s.sm, block && s.block, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 15 : 17} strokeWidth={2.4} aria-hidden="true" />}
      {children}
    </button>
  );
}
