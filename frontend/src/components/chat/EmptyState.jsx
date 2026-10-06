import s from './chat.module.css';

const SUGGESTIONS = [
  ['Remarcar', 'Paciente A não pode vir às 16:30. Qual o melhor horário hoje com a mesma profissional?'],
  ['Trocar de sala', 'A Sala 3 vai ficar sem ar-condicionado à tarde. Para onde levo os atendimentos?'],
  ['Encaixe', 'Preciso encaixar uma avaliação de fonoaudiologia hoje à tarde.'],
  ['Consultar agenda', 'Quais horários de psicologia estão livres hoje?'],
  ['Confirmar pacientes', 'Quais atendimentos de hoje ainda aguardam autorização?'],
  ['Relatório', 'Qual a taxa de ocupação da Helena Prado nesta semana?'],
];

export function WelcomeState({ onPick, disabled }) {
  return (
    <div className={s.scroll}>
      <div className={s.welcome}>
        <img className={s.welcomeLogo} src="/vida-plena-simbolo.png" alt="" />
        <h2 className={s.welcomeTitle}>
          Olá! O que precisa ser <em>realocado</em> hoje?
        </h2>
        <p className={s.welcomeSub}>
          Consulte horários, especialidades e salas, ou peça uma sugestão de remarcação, encaixe ou troca de sala.
        </p>
        <div className={s.suggestions}>
          {SUGGESTIONS.map(([tipo, texto], i) => (
            <button key={tipo} type="button" className={s.suggestion} disabled={disabled} onClick={() => onPick(texto)}>
              <span className={`${s.chip} ${i % 2 ? s.chipRose : ''}`}>{tipo}</span>
              <span className={s.suggestionText}>{texto}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className={s.empty}>
      {Icon && (
        <div className={s.emptyIcon}>
          <Icon size={26} strokeWidth={2.2} aria-hidden="true" />
        </div>
      )}
      <h2 className={s.emptyTitle}>{title}</h2>
      {text && <p className={s.emptyText}>{text}</p>}
      {action}
    </div>
  );
}
