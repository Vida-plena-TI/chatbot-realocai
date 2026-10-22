import { Component, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, Maximize2, RotateCw, X } from 'lucide-react';
import s from './reports.module.css';
import { Notice } from './parts';
import { ExportBar } from './ExportBar';
import { OcupacaoProfissional } from './OcupacaoProfissional';
import { PacientesPorProfissional } from './PacientesPorProfissional';
import { OcupacaoAgregada } from './OcupacaoAgregada';
import { IconButton } from '../components/ui/IconButton';
import { duracao, MINUTOS_POR_SLOT, periodo, rotuloDia, rotuloTipo } from './format';

const CORPOS = {
  ocupacao_profissional: OcupacaoProfissional,
  pacientes_por_profissional: PacientesPorProfissional,
  ocupacao_agregada: OcupacaoAgregada,
};

/** Só os tipos conhecidos são desenhados; os demais são ignorados sem erro (contrato aditivo). */
export const blocoSuportado = (b) =>
  Boolean(b && typeof b === 'object' && Object.hasOwn(CORPOS, b.tipo) && b.dados && typeof b.dados === 'object');

const metaSub = (b) => (b.meta != null ? ` · meta ${Math.round(b.meta * 100)}%` : '');

// Tipos novos: o `titulo` do agente já é a frase do relatório.
const CABECALHOS_NOVOS = {
};

const VAZIOS_NOVOS = {
};

const TEXTO_VAZIO = {
};

/** Erro ao desenhar um bloco fica no cartão; não derruba a conversa. Não registra dados. */
class CorpoSeguro extends Component {
  state = { erro: false };
  static getDerivedStateFromError() {
    return { erro: true };
  }
  render() {
    if (this.state.erro) {
      return (
        <div className={s.stateBox}>
          <div>
            <strong>Não foi possível mostrar este relatório.</strong>
            <span>Os dados chegaram num formato inesperado. A exportação continua disponível.</span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function cabecalho(b) {
  if (CABECALHOS_NOVOS[b.tipo]) return CABECALHOS_NOVOS[b.tipo](b);
  if (b.tipo === 'ocupacao_profissional') {
    const p = b.dados.profissional;
    return { titulo: p.nome, sub: [p.especialidade, periodo(b.periodo)].filter(Boolean).join(' · ') };
  }
  if (b.tipo === 'pacientes_por_profissional') {
    return { titulo: b.dados.escopo === 'dia' ? 'Pacientes do dia' : 'Semana por especialidade', sub: periodo(b.periodo) };
  }
  const meta = b.meta != null ? ` · meta ${Math.round(b.meta * 100)}%` : '';
  return { titulo: 'Por especialidade e por sala', sub: `${periodo(b.periodo)}${meta}` };
}

function vazio(b) {
  const d = b.dados || {};
  if (VAZIOS_NOVOS[b.tipo]) return VAZIOS_NOVOS[b.tipo](d);
  if (b.tipo === 'ocupacao_profissional') return !d.dias?.length;
  if (b.tipo === 'pacientes_por_profissional') return !d.profissionais?.length;
  return !d.por_especialidade?.length && !d.por_sala?.length;
}

export function ReportSkeleton() {
  return (
    <div className={s.card} aria-busy="true" aria-label="Montando relatório">
      <div className={s.skeleton}>
        <div className={s.skel} style={{ width: '30%', height: 12 }} />
        <div className={s.skel} style={{ width: '55%', height: 18 }} />
        <div className={s.skel} style={{ width: '38%', height: 34, marginTop: 8 }} />
        <div className={s.skel} style={{ height: 12, borderRadius: 999 }} />
        <div className={s.skel} style={{ height: 40 }} />
        <div className={s.skel} style={{ height: 40 }} />
      </div>
    </div>
  );
}

export function ReportError({ onRetry }) {
  return (
    <div className={s.card} role="alert">
      <div className={s.stateBox}>
        <span className={s.stateIcon}><CircleAlert size={18} aria-hidden="true" /></span>
        <div>
          <strong>Não foi possível montar este relatório.</strong>
          <span>A agenda não respondeu a tempo. Os dados não foram alterados.</span>
          {onRetry && (
            <button type="button" className={s.exportBtn} onClick={onRetry}>
              <RotateCw size={15} aria-hidden="true" /> Tentar de novo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Cartão de relatório: cabeçalho, corpo do tipo, avisos e exportação.
 * `impressao`: versão do PDF, sem exportação nem controles. `texto`: destaque da mensagem, vai para o PDF.
 * @param {{bloco: import('./types').Bloco, texto?: string, exportavel?: boolean, expandido?: boolean, impressao?: boolean, onExpand?: () => void}} props
 */
export function ReportCard({ bloco, texto, exportavel = true, expandido = false, impressao = false, onExpand }) {
  const Corpo = CORPOS[bloco.tipo];
  const h = cabecalho(bloco);
  const semDados = vazio(bloco);

  return (
    <section className={s.card} aria-label={bloco.titulo}>
      <header className={s.head}>
        <div className={s.headText}>
          <span className={s.kicker}>{rotuloTipo(bloco.tipo)}</span>
          <h3 className={s.title}>{h.titulo}</h3>
          <span className={s.sub}>{h.sub}</span>
        </div>
        {!expandido && !impressao && onExpand && (
          <button type="button" className={s.expandBtn} aria-label="Expandir relatório" title="Expandir" onClick={onExpand}>
            <Maximize2 size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </header>

      {bloco.parcial && (
        <Notice warn>
          <strong>Dados parciais.</strong>{' '}
          {bloco.dias_nao_lidos?.length
            ? `Não foi possível ler: ${bloco.dias_nao_lidos.map(rotuloDia).join(', ')}. Os totais consideram apenas os dias lidos.`
            : 'Parte da agenda não pôde ser lida. Os totais consideram apenas o que foi lido.'}
        </Notice>
      )}
      {bloco.dados?.inconsistencia && (
        <Notice warn>
          <strong>Inconsistência na agenda.</strong> Alguns números não fecham com a grade. Confira antes de decidir.
        </Notice>
      )}

      {!Corpo ? (
        <div className={s.stateBox}><div><strong>Tipo de relatório não suportado.</strong><span>{bloco.tipo}</span></div></div>
      ) : semDados ? (
        <div className={s.stateBox}><div><strong>{TEXTO_VAZIO[bloco.tipo] || 'Nenhum atendimento no período.'}</strong><span>{periodo(bloco.periodo)}</span></div></div>
      ) : (
        <CorpoSeguro>
          <Corpo bloco={bloco} impressao={impressao} />
        </CorpoSeguro>
      )}

      {bloco.avisos?.map((a) => (
        <Notice key={a}>{a}</Notice>
      ))}

      {exportavel && !impressao && Corpo && !semDados && <ExportBar blocos={[bloco]} texto={texto} />}
    </section>
  );
}

export function ReportModal({ bloco, texto, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-label={bloco.titulo}>
        <IconButton className={s.modalClose} label="Fechar" icon={X} onClick={onClose} autoFocus />
        <ReportCard bloco={bloco} texto={texto} expandido />
      </div>
    </div>,
    document.body,
  );
}

export function useExpand() {
  const [aberto, setAberto] = useState(null);
  return { aberto, abrir: setAberto, fechar: () => setAberto(null) };
}
