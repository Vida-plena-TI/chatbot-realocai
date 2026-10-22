import s from './reports.module.css';
import { MaisLinhas, Meter, ResumoCards, StatusBadge, useLimite } from './parts';
import { formatarValor, pctOuTraco, rotuloStatus, semEscala } from './format';

const LIMITE = 15;
// Com muitas colunas a barra não cabe no cartão do chat: fica só o percentual (o selo continua).
const MAX_COLUNAS_COM_BARRA = 7;
const NUMERICOS = new Set(['percentual', 'inteiro', 'decimal']);

// Métrica booleana do relatório genérico: com meta vira selo, sem meta vira "Sim"/"Não".
const META = 'abaixo_da_meta';

/**
 * Tabela montada só com `dados.colunas` e `dados.linhas`, na ordem do agente. Colunas que não
 * existem em `total` são as dimensões (rótulo da linha); sem total, as colunas de texto e data.
 * @param {{bloco: import('./types').BlocoTabelaGenerica, impressao?: boolean}} props
 */
export function TabelaGenerica({ bloco, impressao = false }) {
  const { colunas = [], linhas = [], total, linhas_omitidas: omitidas } = bloco.dados;
  const meta = bloco.meta;
  const temTotal = total && typeof total === 'object' && Object.keys(total).length > 0;
  const dimensoes = colunas.filter((c) => (temTotal ? !(c.chave in total) : !NUMERICOS.has(c.formato)));
  const metricas = colunas.filter((c) => !dimensoes.includes(c));
  const { visiveis, botao } = useLimite(linhas, LIMITE, impressao);
  const comBarra = meta != null && colunas.length <= MAX_COLUNAS_COM_BARRA;

  const celula = (linha, c) => {
    const v = linha[c.chave];
    if (c.chave === META && meta != null && typeof v === 'boolean') {
      const sem = semEscala(linha.slots_escalados, linha.slots_ocupados);
      return (
        <StatusBadge value={Number.isFinite(linha.ocupacao) ? linha.ocupacao : v ? 0 : meta} meta={meta} below={v} neutro={sem}>
          {rotuloStatus(sem, v, 0, true)}
        </StatusBadge>
      );
    }
    if (c.formato === 'percentual' && comBarra && typeof v === 'number') {
      const sem = semEscala(linha.slots_escalados, linha.slots_ocupados);
      return (
        <div className={s.barCell}>
          <Meter value={v} meta={meta} neutro={sem} label={`${c.rotulo}: ${pctOuTraco(v)}`} />
          <strong>{pctOuTraco(v)}</strong>
        </div>
      );
    }
    return formatarValor(v, c.formato);
  };
  const alinhar = (c) => (NUMERICOS.has(c.formato) && !(c.formato === 'percentual' && comBarra) ? s.num : undefined);
  const rotuloLinha = (l) => dimensoes.map((c) => formatarValor(l[c.chave], c.formato)).join(' · ') || '—';

  return (
    <>
      <ResumoCards resumo={bloco.resumo} />

      <div className={`${s.tableWrap} ${s.wideOnly}`}>
        <table className={`${s.table} ${s.dense}`}>
          <caption className="sr-only">{bloco.titulo}</caption>
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c.chave} scope="col" className={alinhar(c)}>
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l, i) => (
              <tr key={i}>
                {colunas.map((c, j) =>
                  j === 0 && dimensoes.includes(c) ? (
                    <th key={c.chave} scope="row">{formatarValor(l[c.chave], c.formato)}</th>
                  ) : (
                    <td key={c.chave} className={alinhar(c)}>{celula(l, c)}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
          {temTotal && (
            <tfoot>
              {/* Coluna a coluna: métricas recebem o total; a primeira dimensão leva o rótulo. */}
              <tr className={s.totalRow}>
                {colunas.map((c) =>
                  metricas.includes(c) ? (
                    <td key={c.chave} className={alinhar(c)}>{celula(total, c)}</td>
                  ) : c === dimensoes[0] ? (
                    <th key={c.chave} scope="row">Total</th>
                  ) : (
                    <td key={c.chave} />
                  ),
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className={`${s.dayList} ${s.compactOnly}`}>
        {visiveis.map((l, i) => (
          <div key={i} className={s.dayCard}>
            <strong>{rotuloLinha(l)}</strong>
            <dl className={s.kv}>
              {metricas.map((c) => (
                <div key={c.chave}>
                  <dt>{c.rotulo}</dt>
                  <dd>{celula(l, c)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {temTotal && (
          <div className={`${s.dayCard} ${s.totalCard}`}>
            <strong>Total</strong>
            <dl className={s.kv}>
              {metricas.map((c) => (
                <div key={c.chave}>
                  <dt>{c.rotulo}</dt>
                  <dd>{celula(total, c)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {botao && <div className={s.pad}>{botao}</div>}
      <MaisLinhas n={omitidas} />
    </>
  );
}
