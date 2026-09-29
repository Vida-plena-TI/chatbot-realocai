const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });

const clean = (s) => s.replace(/\./g, '');
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const daysAgo = (d) => Math.round((startOfDay(new Date()) - startOfDay(d)) / 864e5);

export function formatListDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = daysAgo(d);
  if (diff === 0) return time.format(d);
  if (diff === 1) return 'Ontem';
  if (diff < 7) return clean(weekday.format(d));
  return clean(dayMonth.format(d));
}

export function formatMessageTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = daysAgo(d);
  const t = time.format(d);
  if (diff === 0) return t;
  if (diff === 1) return `Ontem, ${t}`;
  return `${clean(dayMonth.format(d))}, ${t}`;
}

export const formatToday = () => clean(today.format(new Date()));
