import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Plus, Trash2, X } from 'lucide-react';
import s from './Sidebar.module.css';
import u from '../ui/ui.module.css';
import { ConversationItem } from './ConversationItem';
import { RenameDialog } from './RenameDialog';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Dialog } from '../ui/Dialog';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '../../auth/AuthContext';
import { useConversations } from '../../conversations/ConversationsContext';
import { USING_MOCK } from '../../api/client';

const TABS = [
  ['active', 'Ativas'],
  ['archived', 'Arquivadas'],
];

function initials(user) {
  const base = user?.full_name || user?.email || '';
  return base
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function Sidebar({ open, onClose, activeId }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { tab, setTab, list, rename, setArchived, remove } = useConversations();
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (msg) => {
    setActionError(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActionError(''), 5000);
  };

  const toggleArchive = async (c) => {
    try {
      await setArchived(c.id, c.status !== 'archived');
    } catch (e) {
      flash(e.detail || 'Não foi possível atualizar a conversa.');
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await remove(deleting.id);
    } catch (e) {
      flash(e.detail || 'Não foi possível excluir a conversa.');
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <>
      <div className={`${s.scrim} ${open ? s.scrimOpen : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`${s.sidebar} ${open ? s.open : ''}`} aria-label="Conversas">
        <div className={s.brand}>
          <img src="/vida-plena-simbolo.png" alt="Vida Plena" />
          <div className={s.brandText}>
            <div className={s.brandName}>
              realoc<span>AI</span>
            </div>
            <div className={s.brandSub}>Vida Plena · Espaço Multidisciplinar</div>
          </div>
          <IconButton className={s.closeBtn} label="Fechar conversas" icon={X} onClick={onClose} />
        </div>

        <div className={s.newWrap}>
          <Button
            icon={Plus}
            className={s.newBtn}
            onClick={() => {
              navigate('/');
              onClose();
            }}
          >
            Nova conversa
          </Button>
        </div>

        <div className={s.tabs} role="tablist" aria-label="Filtrar conversas">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`${s.tab} ${tab === key ? s.tabOn : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {actionError && (
          <div className={s.actionError} role="alert">
            {actionError}
          </div>
        )}

        <div className={s.list}>
          {list.items.map((c) => (
            <ConversationItem
              key={c.id}
              conv={c}
              active={String(c.id) === activeId}
              onNavigate={onClose}
              onRename={() => setRenaming(c)}
              onToggleArchive={() => toggleArchive(c)}
              onDelete={() => setDeleting(c)}
            />
          ))}
          {list.loading && (
            <div className={s.listStatus}>
              <Spinner label="Carregando conversas" />
            </div>
          )}
          {!list.loading && list.error && (
            <div className={s.listStatus}>
              Não foi possível carregar as conversas.
              <button type="button" className={s.linkBtn} onClick={list.reload}>
                Tentar de novo
              </button>
            </div>
          )}
          {!list.loading && !list.error && list.items.length === 0 && (
            <div className={s.listEmpty}>
              {tab === 'active'
                ? 'Nenhuma conversa ainda. Use “Nova conversa” para consultar a agenda.'
                : 'Nenhuma conversa arquivada.'}
            </div>
          )}
          {!list.loading && list.hasMore && (
            <button type="button" className={s.loadMore} onClick={list.loadMore}>
              Carregar mais
            </button>
          )}
        </div>

        {USING_MOCK && (
          <div className={s.mock}>
            <span className={s.dot} />
            Modo demonstração · dados fictícios
          </div>
        )}

        <div className={s.user}>
          <div className={s.avatar} aria-hidden="true">
            {initials(user)}
          </div>
          <div className={s.userText}>
            <div className={s.userName}>{user?.full_name || user?.email}</div>
            <div className={s.userEmail}>{user?.email}</div>
          </div>
          <IconButton label="Sair" icon={LogOut} onClick={logout} />
        </div>
      </aside>

      <RenameDialog conv={renaming} onClose={() => setRenaming(null)} onSave={(title) => rename(renaming.id, title)} />

      <Dialog open={Boolean(deleting)} title="Excluir conversa?" onClose={() => setDeleting(null)}>
        <p>“{deleting?.title || 'Sem título'}” sai da lista de conversas. Não é possível desfazer por aqui.</p>
        <div className={u.dialogActions}>
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancelar
          </Button>
          <Button variant="danger" icon={Trash2} disabled={busy} onClick={confirmDelete}>
            Excluir
          </Button>
        </div>
      </Dialog>
    </>
  );
}
