// Geração local: PDF pela impressão do navegador (mock e API real) e Excel do mock.
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PrintReport } from './PrintReport';
import printCss from './print.css?raw';
import { nomeArquivo, periodo } from './format';

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Documento de impressão: os mesmos cartões do chat (layout largo), com os estilos do app
 * copiados do documento atual e sempre no tema claro.
 * @param {import('./types').Bloco[]} blocos
 * @param {{texto?: string}} [opcoes] texto de destaque da mensagem do assistente
 */
export function documentoImpressao(blocos, { texto = '' } = {}) {
  const estilos = [...document.querySelectorAll('style, link[rel="stylesheet"]')]
    .map((el) => (el.tagName === 'LINK' ? `<link rel="stylesheet" href="${esc(el.href)}">` : el.outerHTML))
    .join('');
  const corpo = renderToStaticMarkup(createElement(PrintReport, { blocos, texto, logoUrl: new URL('/vida-plena-simbolo.png', window.location.origin).href }));
  const titulo = nomeArquivo(blocos, 'pdf').replace(/\.pdf$/, '');
  return `<!doctype html><html lang="pt-BR" data-theme="light"><head><meta charset="utf-8"><base href="${esc(document.baseURI)}"><title>${esc(titulo)}</title>${estilos}<style>${printCss}</style></head><body>${corpo}</body></html>`;
}

const carregado = (el) =>
  new Promise((ok) => {
    if (el.tagName === 'IMG' ? el.complete : el.sheet) return ok();
    el.addEventListener('load', ok, { once: true });
    el.addEventListener('error', ok, { once: true });
  });

/** Espera folhas de estilo, imagens e os pesos da Nunito usados pelos cartões. */
async function prontoParaImprimir(doc) {
  await Promise.all([...doc.querySelectorAll('link[rel="stylesheet"], img')].map(carregado));
  await Promise.all([400, 600, 700, 800, 900].map((p) => doc.fonts.load(`${p} 16px Nunito`).catch(() => {})));
  await doc.fonts.ready;
}

/**
 * Abre a impressão do navegador num iframe oculto (o usuário salva como PDF).
 * @param {import('./types').Bloco[]} blocos
 * @param {{texto?: string}} [opcoes]
 */
export async function imprimirBlocos(blocos, opcoes) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  // Fora da tela, mas com o tamanho da página: o layout e as fontes carregam antes de imprimir.
  Object.assign(iframe.style, { position: 'fixed', left: '-10000px', top: 0, width: '297mm', height: '210mm', border: 0 });
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(documentoImpressao(blocos, opcoes));
    doc.close();
    await prontoParaImprimir(doc);
    const win = iframe.contentWindow;
    const remover = () => iframe.remove();
    win.addEventListener('afterprint', () => setTimeout(remover, 0), { once: true });
    setTimeout(remover, 60000);
    win.focus();
    win.print();
  } catch (e) {
    iframe.remove();
    throw e;
  }
}

// --- Excel (SpreadsheetML 2003, abre no Excel sem biblioteca) -----------------
const ESTILO = { percentual: 'pct', inteiro: 'int', decimal: 'dec', data: 'date', texto: 'txt' };
const LARGURA = { percentual: 70, inteiro: 70, decimal: 70, data: 80, texto: 160 };

function celula(valor, formato) {
  if (valor == null || valor === '') return '<Cell ss:StyleID="txt"/>';
  if (formato === 'data') return `<Cell ss:StyleID="date"><Data ss:Type="DateTime">${valor}T00:00:00.000</Data></Cell>`;
  if (['percentual', 'inteiro', 'decimal'].includes(formato) && typeof valor === 'number') {
    return `<Cell ss:StyleID="${ESTILO[formato]}"><Data ss:Type="Number">${valor}</Data></Cell>`;
  }
  return `<Cell ss:StyleID="txt"><Data ss:Type="String">${esc(valor)}</Data></Cell>`;
}

const congelar = '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>';

function nomeAba(nome, usados) {
  let base = nome.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Tabela';
  let n = base, i = 2;
  while (usados.has(n)) n = `${base.slice(0, 28)} ${i++}`;
  usados.add(n);
  return n;
}

export function gerarExcel(blocos) {
  const usados = new Set(['Resumo']);
  const agora = new Date();
  const resumo = [
    ['Relatório', 'Período', 'Meta', 'Gerado em', 'Avisos'],
    ...blocos.map((b) => [b.titulo, periodo(b.periodo), b.meta, agora.toISOString().slice(0, 10), [...(b.parcial ? ['Dados parciais'] : []), ...(b.avisos || [])].join(' | ')]),
  ];
  const fmtResumo = ['texto', 'texto', 'percentual', 'data', 'texto'];
  const abaResumo = `<Worksheet ss:Name="Resumo"><Table>${[260, 140, 60, 80, 420].map((w) => `<Column ss:Width="${w}"/>`).join('')}
    <Row>${resumo[0].map((h) => `<Cell ss:StyleID="head"><Data ss:Type="String">${h}</Data></Cell>`).join('')}</Row>
    ${resumo.slice(1).map((r) => `<Row>${r.map((v, i) => celula(v, fmtResumo[i])).join('')}</Row>`).join('')}
  </Table>${congelar}</Worksheet>`;

  const abas = blocos.flatMap((b) =>
    (b.tabelas || []).map((t) => {
      const nome = nomeAba(blocos.length > 1 ? `${t.nome} (${blocos.indexOf(b) + 1})` : t.nome, usados);
      return `<Worksheet ss:Name="${esc(nome)}"><Table>${t.colunas.map((c) => `<Column ss:Width="${LARGURA[c.formato] || 100}"/>`).join('')}
        <Row>${t.colunas.map((c) => `<Cell ss:StyleID="head"><Data ss:Type="String">${esc(c.rotulo)}</Data></Cell>`).join('')}</Row>
        ${t.linhas.map((l) => `<Row>${t.colunas.map((c) => celula(l[c.chave], c.formato)).join('')}</Row>`).join('')}
      </Table>${congelar}</Worksheet>`;
    }),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="head"><Font ss:Bold="1"/><Interior ss:Color="#E6F3EF" ss:Pattern="Solid"/></Style>
  <Style ss:ID="pct"><NumberFormat ss:Format="0.0%"/></Style>
  <Style ss:ID="int"><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="dec"><NumberFormat ss:Format="0.0"/></Style>
  <Style ss:ID="date"><NumberFormat ss:Format="dd/mm/yyyy"/></Style>
  <Style ss:ID="txt"/>
</Styles>
${abaResumo}${abas.join('')}
</Workbook>`;
  return new Blob([xml], { type: 'application/vnd.ms-excel' });
}
