import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from './IconButton';

// Preferência visual (não é dado de sessão).
const KEY = 'realocai.tema';

export function temaInicial() {
  const salvo = localStorage.getItem(KEY);
  const tema = salvo || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = tema;
}

export function ThemeToggle() {
  const [tema, setTema] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    localStorage.setItem(KEY, tema);
  }, [tema]);
  const escuro = tema === 'dark';
  return (
    <IconButton
      label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
      icon={escuro ? Sun : Moon}
      onClick={() => setTema(escuro ? 'light' : 'dark')}
    />
  );
}
