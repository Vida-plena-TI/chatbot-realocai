import { Fragment } from 'react';
import s from './reports.module.css';
import { MaisLinhas, Meter, ResumoCards, StatusBadge, useLimite, useLimiteGrupos } from './parts';
import { formatarValor, int, pctOuTraco, rotuloStatus, semEscala } from './format';

const LIMITE = 15;
// Com muitas colunas a barra não cabe no cartão do chat: fica só o percentual (o selo continua).
const MAX_COLUNAS_COM_BARRA = 7;
const NUMERICOS = new Set(['percentual', 'inteiro', 'decimal']);

// Métrica booleana do relatório genérico: com meta vira selo, sem meta vira "Sim"/"Não".
const META = 'abaixo_da_meta';

// Sem valor numa coluna de agrupamento: null, "" ou só espaços, ou o "—" que o agente manda nas
// colunas das tabelas prontas quando falta o valor (ex.: especialidade ausente).
const SEM_VALOR = '—';
const vazio = (v) => v == null || (typeof v === 'string' && (v.trim() === '' || v.trim() === SEM_VALOR));
const texto = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Modo agrupado (`dados.agrupar_por` e `dados.unidade_grupo`, opcionais na `versao` 1).
 * Percorre as linhas NA ORDEM RECEBIDA e abre um grupo novo sempre que a combinação de valores
 * das colunas de agrupamento muda em relação à linha anterior: valores iguais não consecutivos
 * viram grupos separados. Nunca reordena, junta, cria ou descarta linhas.
 *
 * Devolve null (modo plano, como antes) se `agrupar_por` não for uma lista não vazia de textos
 * distintos que existem em `dados.colunas`, se não houver linhas ou se não sobrar coluna no corpo.
 * @param {import('./types').BlocoTabelaGenerica['dados']} dados
 * @returns {null | {colunas: {chave: string, rotulo: string, formato: string}[], grupos: {chave: number, titulo: string, linhas: object[]}[], total: number}}
 */
export function agruparLinhas(dados) {
  const { colunas, linhas, agrupar_por: por, unidade_grupo: unidade } = dados ?? {};
  if (!Array.isArray(por) || !por.length || !por.every(texto) || new Set(por).size !== por.length) return null;
  if (!Array.isArray(colunas) || !Array.isArray(linhas) || !linhas.length) return null;
  const doGrupo = por.map((k) => colunas.find((c) => c?.chave === k));
  if (doGrupo.some((c) => !c)) return null;
  const corpo = colunas.filter((c) => !por.includes(c?.chave));
  if (!corpo.length) return null;
  const nomes = unidade && texto(unidade.singular) && texto(unidade.plural) ? unidade : null;

  const grupos = [];
  let anterior;
  for (const linha of linhas) {
    // Sem valor (null, "", só espaços ou "—") conta como um valor só: "Sem <coluna>".
    const valores = doGrupo.map((c) => (vazio(linha?.[c.chave]) ? null : linha[c.chave]));
    const chave = JSON.stringify(valores);
    if (chave !== anterior) grupos.push({ valores, linhas: [] });
    anterior = chave;
    grupos.at(-1).linhas.push(linha);
  }
  return {
    colunas: corpo,
    total: linhas.length,
    grupos: grupos.map(({ valores, linhas: doGrupoLinhas }, i) => {
      const n = doGrupoLinhas.length;
      const rotulos = valores.map((v, j) =>
        v == null ? `Sem ${String(doGrupo[j].rotulo || doGrupo[j].chave).toLocaleLowerCase('pt-BR')}` : formatarValor(v, doGrupo[j].formato),
      );
      const unidadeTexto = nomes ? ` ${n === 1 ? nomes.singular : nomes.plural}` : '';
      return { chave: i, titulo: `${rotulos.join(' · ')} (${int(n)}${unidadeTexto})`, linhas: doGrupoLinhas };
    }),
  };
}

/**
 * Dimensões, métricas e células de um conjunto de colunas (o mesmo nos dois modos). Colunas que
 * não existem em `total` são as dimensões (rótulo da linha); sem total, as colunas de texto e data.
 */
function montarColunas(bloco, colunas) {
  const { total } = bloco.dados;
  const meta = bloco.meta;
  const temTotal = total && typeof total === 'object' && Object.keys(total).length > 0;
  const dimensoes = colunas.filter((c) => (temTotal ? !(c.chave in total) : !NUMERICOS.has(c.formato)));
  const metricas = colunas.filter((c) => !dimensoes.includes(c));
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
  const linhaTabela = (l, key) => (
    <tr key={key}>
      {colunas.map((c, j) =>
        j === 0 && dimensoes.includes(c) ? (
          <th key={c.chave} scope="row">{formatarValor(l[c.chave], c.formato)}</th>
        ) : (
          <td key={c.chave} className={alinhar(c)}>{celula(l, c)}</td>
        ),
      )}
    </tr>
  );
  const cabecalho = (
    <thead>
      <tr>
        {colunas.map((c) => (
          <th key={c.chave} scope="col" className={alinhar(c)}>
            {c.rotulo}
          </th>
        ))}
      </tr>
    </thead>
  );
  const rodape = temTotal && (
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
  );
  const cartao = (l, key, extra = '') => (
    <div key={key} className={`${s.dayCard}${extra}`}>
      <strong>{l === total ? 'Total' : rotuloLinha(l)}</strong>
      <dl className={s.kv}>
        {metricas.map((c) => (
          <div key={c.chave}>
            <dt>{c.rotulo}</dt>
            <dd>{celula(l, c)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
  const cartaoTotal = temTotal && cartao(total, 'total', ` ${s.totalCard}`);
  return { linhaTabela, cabecalho, rodape, cartao, cartaoTotal };
}

/**
 * Tabela montada só com `dados.colunas` e `dados.linhas`, na ordem do agente. Com
 * `dados.agrupar_por` válido, a tabela sai em grupos consecutivos (ver `agruparLinhas`).
 * @param {{bloco: import('./types').BlocoTabelaGenerica, impressao?: boolean}} props
 */
export function TabelaGenerica({ bloco, impressao = false }) {
  const agrupado = agruparLinhas(bloco.dados);
  return agrupado ? <TabelaAgrupada bloco={bloco} agrupado={agrupado} impressao={impressao} /> : <TabelaPlana bloco={bloco} impressao={impressao} />;
}

function TabelaPlana({ bloco, impressao }) {
  const { colunas = [], linhas = [], linhas_omitidas: omitidas } = bloco.dados;
  const { visiveis, botao } = useLimite(linhas, LIMITE, impressao);
  const { linhaTabela, cabecalho, rodape, cartao, cartaoTotal } = montarColunas(bloco, colunas);

  return (
    <>
      <ResumoCards resumo={bloco.resumo} />

      <div className={`${s.tableWrap} ${s.wideOnly}`}>
        <table className={`${s.table} ${s.dense}`}>
          <caption className="sr-only">{bloco.titulo}</caption>
          {cabecalho}
          <tbody>{visiveis.map((l, i) => linhaTabela(l, i))}</tbody>
          {rodape}
        </table>
      </div>

      <div className={`${s.dayList} ${s.compactOnly}`}>
        {visiveis.map((l, i) => cartao(l, i))}
        {cartaoTotal}
      </div>

      {botao && <div className={s.pad}>{botao}</div>}
      <MaisLinhas n={omitidas} />
    </>
  );
}

/**
 * Um grupo por mudança de valor nas colunas de `agrupar_por`; essas colunas saem do corpo e
 * ficam só no título do grupo. Mesmo padrão da disponibilidade: uma tabela só (colunas alinhadas
 * e cabeçalho repetido em cada página do PDF) e um tbody por grupo com o título + a primeira
 * linha, para o título nunca ficar sozinho no fim da página. "Mostrar todas" corta só entre grupos.
 */
function TabelaAgrupada({ bloco, agrupado, impressao }) {
  const { colunas, grupos } = agrupado;
  const { visiveis, botao } = useLimiteGrupos(grupos, LIMITE, impressao);
  const { linhaTabela, cabecalho, rodape, cartao, cartaoTotal } = montarColunas(bloco, colunas);

  return (
    <>
      <ResumoCards resumo={bloco.resumo} />

      <div className={`${s.tableWrap} ${s.wideOnly}`}>
        <table className={`${s.table} ${s.dense} ${s.groupTable}`}>
          <caption className="sr-only">{bloco.titulo}</caption>
          {cabecalho}
          {visiveis.map((g) => (
            <Fragment key={g.chave}>
              <tbody className={s.specHead}>
                <tr className={s.specRow}>
                  <th scope="rowgroup" colSpan={colunas.length}>{g.titulo}</th>
                </tr>
                {linhaTabela(g.linhas[0])}
              </tbody>
              {g.linhas.length > 1 && <tbody>{g.linhas.slice(1).map((l, i) => linhaTabela(l, i))}</tbody>}
            </Fragment>
          ))}
          {rodape}
        </table>
      </div>

      <div className={`${s.dayList} ${s.compactOnly}`}>
        {visiveis.map((g) => (
          <section key={g.chave} className={s.groupCards}>
            <h4 className={`${s.specTitle} ${s.groupTitle}`}>{g.titulo}</h4>
            {g.linhas.map((l, i) => cartao(l, i))}
          </section>
        ))}
        {cartaoTotal}
      </div>

      {botao && <div className={s.pad}>{botao}</div>}
      <MaisLinhas n={bloco.dados.linhas_omitidas} />
    </>
  );
}
