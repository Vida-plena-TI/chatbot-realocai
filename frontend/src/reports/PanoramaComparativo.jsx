import { useId, useState } from 'react';
import { Check } from 'lucide-react';
import s from './reports.module.css';
import { ResumoCards } from './parts';
import { formatarValor, int } from './format';

// Visão do comparativo do panorama de enxugamento: uma linha por cenário, com selo "Recomendado",
// barras de turnos liberados e pacientes movidos (escala: o maior valor entre os cenários) e chips
// com os demais números. Só formata: nunca recalcula nem reordena. A tabela completa fica atrás de
// "Ver tabela completa" (na impressão, sai inteira depois do painel, e os chips não saem).

const RELATORIO = 'panorama_enxugamento';
/** Colunas sem as quais a visão não é desenhada (cai na tabela comum). */
export const COLUNAS_PANORAMA = ['cenario', 'turnos_liberados', 'passos', 'pacientes_movidos'];
const BARRAS = ['turnos_liberados', 'pacientes_movidos'];
// Chips na ordem do contrato; as duas últimas são opcionais (o agente vai acrescentá-las).
const CHIPS = ['passos', 'profissionais_afetadas', 'trocam_de_profissional', 'trocam_de_dia', 'profissionais_sem_atendimento', 'turnos_sem_profissional'];

/** Comparativo do panorama com as colunas mínimas e ao menos uma linha. */
export function ehComparativoPanorama(dados) {
  if (dados?.relatorio !== RELATORIO || !Array.isArray(dados.colunas) || !Array.isArray(dados.linhas) || !dados.linhas.length) return false;
  const chaves = new Set(dados.colunas.map((c) => c?.chave));
  return COLUNAS_PANORAMA.every((k) => chaves.has(k));
}

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Largura da barra em %, de 0 a 100; sem número ou com máximo 0, 0. */
export function larguraBarra(valor, maximo) {
  const v = numero(valor);
  if (v == null || !(maximo > 0)) return 0;
  return Math.max(0, Math.min(100, (v / maximo) * 100));
}

function Barra({ rotulo, valor, maximo }) {
  const v = numero(valor);
  const texto = v == null ? '—' : int(v);
  return (
    <div className={s.panBar}>
      <span className={s.panBarLabel}>{rotulo}</span>
      <div className={s.panTrack} role="img" aria-label={`${rotulo}: ${texto}${maximo > 0 ? ` (maior entre os cenários: ${int(maximo)})` : ''}`}>
        <div className={s.panFill} style={{ width: `${larguraBarra(v, maximo)}%` }} />
      </div>
      <b className={s.panBarValue}>{texto}</b>
    </div>
  );
}

/**
 * @param {{bloco: import('./types').BlocoTabelaGenerica, impressao?: boolean, tabela: import('react').ReactNode}} props
 * `tabela`: a tabela completa (modo plano), montada por TabelaGenerica.
 */
export function PanoramaComparativo({ bloco, impressao = false, tabela }) {
  const [aberta, setAberta] = useState(false);
  const id = useId();
  const { colunas, linhas } = bloco.dados;
  const coluna = (k) => colunas.find((c) => c?.chave === k);
  const rotulo = (k) => coluna(k)?.rotulo || k;
  const maximos = Object.fromEntries(BARRAS.map((k) => [k, Math.max(0, ...linhas.map((l) => numero(l?.[k]) ?? 0))]));
  const chips = CHIPS.filter((k) => coluna(k));

  return (
    <>
      <ResumoCards resumo={bloco.resumo} />

      <ol className={s.panList} aria-label="Cenários">
        {linhas.map((l, i) => {
          const recomendado = l?.recomendado === true;
          return (
            <li key={i} className={`${s.panItem} ${recomendado ? s.panRec : ''}`}>
              <div className={s.panHead}>
                <strong className={s.panName}>{formatarValor(l?.cenario, 'texto')}</strong>
                {recomendado && (
                  <span className={s.panBadge}>
                    <Check size={13} strokeWidth={3} aria-hidden="true" />
                    Recomendado
                  </span>
                )}
              </div>
              <div className={s.panBars}>
                {BARRAS.map((k) => (
                  <Barra key={k} rotulo={rotulo(k)} valor={l?.[k]} maximo={maximos[k]} />
                ))}
              </div>
              {/* No PDF, sem chips: a tabela completa vem logo abaixo com os mesmos números. */}
              {chips.length > 0 && !impressao && (
                <ul className={s.panChips} aria-label="Outros números do cenário">
                  {chips.map((k) => (
                    <li key={k} className={s.panChip}>
                      {rotulo(k)} <b>{formatarValor(l?.[k], coluna(k).formato)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {impressao ? (
        <div className={s.panTable}>
          <h4 className={s.blockTitle}>Tabela completa</h4>
          {tabela}
        </div>
      ) : (
        <div className={s.panTable}>
          <div className={s.pad}>
            <button type="button" className={s.showAll} aria-expanded={aberta} aria-controls={id} onClick={() => setAberta((v) => !v)}>
              {aberta ? 'Ocultar tabela completa' : 'Ver tabela completa'}
            </button>
          </div>
          <div id={id}>{aberta && tabela}</div>
        </div>
      )}
    </>
  );
}
