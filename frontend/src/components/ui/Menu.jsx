import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import s from './ui.module.css';
import { IconButton } from './IconButton';

const WIDTH = 190;
const ITEM_H = 40;

// Menu em portal com posição fixa, para não ser cortado pela lista com rolagem.
export function Menu({ label, icon, items, className = '' }) {
  const [pos, setPos] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const close = () => setPos(null);

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (pos) return close();
    const r = trigger.current.getBoundingClientRect();
    const h = items.length * ITEM_H + 12;
    const top = r.bottom + 4 + h > window.innerHeight ? r.top - 4 - h : r.bottom + 4;
    setPos({ top, left: Math.max(8, r.right - WIDTH) });
  };

  useEffect(() => {
    if (!pos) return undefined;
    const onDown = (e) => {
      if (!menu.current?.contains(e.target) && !trigger.current?.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
        trigger.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  useLayoutEffect(() => {
    if (pos) menu.current?.querySelector('button')?.focus();
  }, [pos]);

  return (
    <span ref={trigger} className={`${s.menuWrap} ${className}`}>
      <IconButton label={label} icon={icon} aria-haspopup="menu" aria-expanded={Boolean(pos)} onClick={toggle} />
      {pos &&
        createPortal(
          <div ref={menu} role="menu" className={s.menu} style={{ top: pos.top, left: pos.left, width: WIDTH }}>
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  className={`${s.menuItem} ${it.danger ? s.menuDanger : ''}`}
                  onClick={() => {
                    close();
                    it.onSelect();
                  }}
                >
                  {Icon && <Icon size={16} aria-hidden="true" />}
                  {it.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}
