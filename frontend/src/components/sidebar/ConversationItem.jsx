import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import s from './Sidebar.module.css';
import { Menu } from '../ui/Menu';
import { formatListDate } from '../../utils/formatDate';

export function ConversationItem({ conv, active, onNavigate, onRename, onToggleArchive, onDelete }) {
  const archived = conv.status === 'archived';
  return (
    <div className={`${s.item} ${active ? s.itemActive : ''}`}>
      <Link to={`/c/${conv.id}`} className={s.itemLink} onClick={onNavigate} aria-current={active ? 'page' : undefined}>
        <span className={s.itemTop}>
          <span className={s.itemTitle}>{conv.title || 'Sem título'}</span>
          <span className={s.itemDate}>{formatListDate(conv.updated_at)}</span>
        </span>
        <span className={s.itemPreview}>{conv.summary || 'Sem mensagens'}</span>
      </Link>
      <Menu
        className={s.itemMenu}
        label="Ações da conversa"
        icon={Ellipsis}
        items={[
          { label: 'Renomear', icon: Pencil, onSelect: onRename },
          { label: archived ? 'Desarquivar' : 'Arquivar', icon: archived ? ArchiveRestore : Archive, onSelect: onToggleArchive },
          { label: 'Excluir', icon: Trash2, danger: true, onSelect: onDelete },
        ]}
      />
    </div>
  );
}
