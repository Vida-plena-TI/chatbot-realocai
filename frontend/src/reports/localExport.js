// Geração local, usada pelo mock (e como alternativa enquanto o backend não gera os arquivos).
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PrintReport } from './PrintReport';
import printCss from './print.css?raw';
import { periodo } from './format';

/** Abre a impressão do navegador num iframe oculto (o usuário salva como PDF). */
export function imprimirBlocos(blocos) {
  return new Promise((resolve) => {
    const html = renderToStaticMarkup(createElement(PrintReport, { blocos, logoUrl: `${window.location.origin}/vida-plena-simbolo.png` }));
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, { position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 });
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>RealocAI</title><style>${printCss}</style></head><body>${html}</body></html>`);
    doc.close();
    const go = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => iframe.remove(), 1000);
      resolve();
    };
    const img = doc.querySelector('img');
    if (img && !img.complete) img.onload = img.onerror = go;
    else setTimeout(go, 50);
  });
}

// --- Excel (SpreadsheetML 2003, abre no Excel sem biblioteca) -----------------
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
