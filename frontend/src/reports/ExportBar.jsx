import { useRef, useState } from 'react';
import { Check, FileText, Sheet } from 'lucide-react';
import s from './reports.module.css';
import { exportarBlocos } from './exporters';

const NOME = { pdf: 'PDF', excel: 'Excel' };

/**
 * @param {{blocos: import('./types').Bloco[], pergunta?: string, compact?: boolean}} props
 */
export function ExportBar({ blocos, pergunta = 'Deseja exportar este relatório?' }) {
  const [estado, setEstado] = useState({ fase: 'ocioso', formato: null, arquivo: '' });
  const ativo = useRef(false);

  const exportar = async (formato) => {
    if (ativo.current) return;
    ativo.current = true;
    setEstado({ fase: 'gerando', formato, arquivo: '' });
    try {
      const r = await exportarBlocos(blocos, formato);
      setEstado({ fase: 'concluido', formato, arquivo: r.arquivo, impressao: r.impressao });
    } catch {
      setEstado({ fase: 'erro', formato, arquivo: '' });
    } finally {
      ativo.current = false;
    }
  };

  const gerando = estado.fase === 'gerando';
  const Botao = ({ formato, Icon }) => {
    const esteGerando = gerando && estado.formato === formato;
    return (
      <button type="button" className={`${s.exportBtn} ${esteGerando ? s.busy : ''}`} disabled={gerando} onClick={() => exportar(formato)} aria-busy={esteGerando}>
        {esteGerando ? <span className={s.spin} aria-hidden="true" /> : <Icon size={15} strokeWidth={2.2} aria-hidden="true" />}
        {esteGerando ? `Gerando ${NOME[formato]}…` : NOME[formato]}
      </button>
    );
  };

  return (
    <div className={s.exportBar}>
      <span className={s.exportQ}>{pergunta}</span>
      <div className={s.exportBtns}>
        <Botao formato="pdf" Icon={FileText} />
        <Botao formato="excel" Icon={Sheet} />
      </div>
      <div aria-live="polite" style={{ display: 'contents' }}>
        {estado.fase === 'concluido' && (
          <div className={`${s.exportStatus} ${s.exportOk}`}>
            <Check size={14} strokeWidth={3} aria-hidden="true" />
            {estado.impressao ? 'Janela de impressão aberta. Escolha "Salvar como PDF".' : `Download iniciado · ${estado.arquivo}`}
          </div>
        )}
        {estado.fase === 'erro' && (
          <div className={`${s.exportStatus} ${s.exportErr}`} role="alert">
            <span className={s.grow}>Não foi possível gerar o {NOME[estado.formato]}.</span>
            <button type="button" onClick={() => exportar(estado.formato)}>Tentar de novo</button>
          </div>
        )}
      </div>
    </div>
  );
}
