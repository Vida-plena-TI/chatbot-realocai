import { useEffect, useState } from 'react';
import u from '../ui/ui.module.css';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

export function RenameDialog({ conv, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTitle(conv?.title || '');
    setError('');
  }, [conv]);

  const submit = async (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setError('Informe um título.');
    setSaving(true);
    try {
      await onSave(t);
      onClose();
    } catch (err) {
      setError(err.detail || 'Não foi possível renomear. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(conv)} title="Renomear conversa" onClose={onClose}>
      <form className={u.form} onSubmit={submit}>
        <label className={u.field}>
          <span className={u.label}>Título</span>
          <input className={u.input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {error && <p className={u.fieldError}>{error}</p>}
        <div className={u.dialogActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
