import s from './chat.module.css';
import { ProposalCard } from './ProposalCard';
import { formatMessageTime } from '../../utils/formatDate';

export function AgentAvatar() {
  return (
    <div className={s.avatar} aria-hidden="true">
      <img src="/vida-plena-simbolo.png" alt="" />
    </div>
  );
}

export function MessageBubble({ message, parsed, proposalStatus, canDecide, onDecide }) {
  const time = message.pending ? 'Enviando…' : formatMessageTime(message.created_at);

  if (message.role === 'user') {
    return (
      <div className={s.rowUser}>
        <div className={`${s.bubbleUser} ${message.pending ? s.pending : ''}`}>{message.content}</div>
        <span className={s.time}>{time}</span>
      </div>
    );
  }

  const { text, proposal } = parsed || { text: message.content, proposal: null };
  return (
    <div className={s.rowAgent}>
      <AgentAvatar />
      <div className={s.agentCol}>
        <div className={s.agentMeta}>
          <span className={s.agentName}>realocAI</span>
          <span className={s.time}>{time}</span>
        </div>
        {text && <div className={s.bubbleAgent}>{text}</div>}
        {proposal && (
          <ProposalCard
            proposal={proposal}
            status={proposalStatus}
            canDecide={canDecide}
            onDecide={(action) => onDecide(proposal, action)}
          />
        )}
      </div>
    </div>
  );
}
