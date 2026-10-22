// Renderiza os cartões de relatório no Node (SSR do Vite, sem navegador nem dependências novas)
// e confere as regras gerais dos blocos:
//   - tipo desconhecido é ignorado sem erro (sozinho: nada; junto com outro: sem aba extra);
//   - meta null e parcial true não quebram, e o aviso lista os dias não lidos;
//   - "+N linhas" quando linhas_omitidas > 0; resumo mostra `exibicao`;
//   - nada vai para o console durante a renderização (LGPD: o nome do paciente nunca é logado).
//
// Uso: npm run check:render   (exit code 1 se alguma verificação falhar)
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const falhas = [];
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) falhas.push(msg);
};

try {
  // React vem do Node (o SSR do Vite externaliza node_modules: mesma instância dos componentes).
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');
  const { ReportGroup } = await server.ssrLoadModule('/src/reports/ReportGroup.jsx');
  const { PrintReport } = await server.ssrLoadModule('/src/reports/PrintReport.jsx');
  const amostras = await server.ssrLoadModule('/src/reports/sampleBlocks.js');

  // Captura todo o console durante as renderizações.
  const saida = [];
  const originais = {};
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    originais[m] = console[m];
    console[m] = (...a) => saida.push(a.map(String).join(' '));
  }
  const render = (blocos, el = ReportGroup) => {
    try {
      return renderToStaticMarkup(createElement(el, { blocos, texto: 'Resposta de teste.' }));
    } catch (e) {
      return `ERRO: ${e.message}`;
    }
  };
  const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const desconhecido = { ...amostras.ocupacaoAgregada, tipo: 'tipo_futuro', titulo: 'Tipo futuro' };
  const r = {
    soDesconhecido: render([desconhecido]),
    lixo: render([null, 'x', 42, { tipo: 'convenio' }]),
    misto: render([desconhecido, amostras.ocupacaoAgregada]),
    misto3: render([amostras.convenio, desconhecido, amostras.agendaPaciente]),
    parcial: render([amostras.disponibilidadeParcial]),
    semMeta: render([amostras.tabelaGenericaSemMeta]),
    metaNulaRanking: render([{ ...amostras.tabelaGenericaRanking, meta: null }]),
    ranking: render([amostras.tabelaGenericaRanking]),
    longa: render([amostras.tabelaGenericaLonga]),
    longaPdf: render([amostras.tabelaGenericaLonga], PrintReport),
    janelas: render([amostras.disponibilidadeJanelas]),
    qualidade: render([amostras.qualidadeAgenda]),
    qualidadePdf: render([amostras.qualidadeAgenda], PrintReport),
    agenda: render([amostras.agendaPaciente]),
    agendaPdf: render([amostras.agendaPaciente], PrintReport),
    novos: Object.fromEntries(
      ['disponibilidadeVagas', 'convenio', 'qualidadeAgenda', 'tabelaGenericaCapacidade', 'tabelaGenericaPersonalizado'].map((k) => [k, render([amostras[k]])]),
    ),
    antigos: render([amostras.ocupacaoProfissional, amostras.pacientesSemana, amostras.ocupacaoAgregada]),
  };
  Object.assign(console, originais);

  const erros = Object.entries({ ...r, ...r.novos }).filter(([, h]) => typeof h === 'string' && h.startsWith('ERRO'));
  ok(!erros.length, `nenhum bloco quebra a renderização${erros.length ? `: ${erros.map(([k, h]) => `${k} (${h})`).join('; ')}` : ''}`);
  ok(r.soDesconhecido === '', 'tipo desconhecido sozinho: nada é desenhado');
  ok(r.lixo === '', 'itens inválidos ou sem dados são ignorados');
  // Abas do grupo são as únicas com aria-controls (OcupacaoAgregada tem um seletor interno).
  const abas = (h) => (h.match(/role="tab"[^>]*aria-controls|aria-controls[^>]*role="tab"/g) || []).length;
  ok(abas(r.misto) === 0 && r.misto.includes('Ocupação agregada') && !r.misto.includes('Tipo futuro'), 'desconhecido + conhecido: só o conhecido, sem abas');
  ok(abas(r.misto3) === 2 && r.misto3.includes('Exportar os 2 relatórios juntos?'), 'abas e "Exportar todos" contam só os tipos conhecidos');
  ok(!/não suportado/i.test(texto(r.misto + r.misto3)), 'nenhum aviso de "tipo não suportado" na tela');
  ok(texto(r.parcial).includes('Dados parciais. Não foi possível ler: Qua 30/09.'), 'parcial: aviso lista os dias não lidos formatados');
  ok(!r.semMeta.includes('meterMark') && !/meta \d+%/i.test(texto(r.semMeta)), 'meta null: sem marca nem texto de meta');
  ok(!/badge-(ok|warn|low)/.test(r.metaNulaRanking) && !r.metaNulaRanking.includes('meterMark') && texto(r.metaNulaRanking).includes('Sim'), 'meta null com coluna booleana: "Sim"/"Não", sem selo nem barra de meta');
  ok(texto(r.ranking).includes('+1 linha não exibida'), '"+N linhas" quando linhas_omitidas > 0');
  ok(texto(r.ranking).includes('23,6%') && texto(r.ranking).includes('33,3%'), 'resumo mostra `exibicao` e percentuais com vírgula');
  ok(texto(r.longa).includes('Mostrar todas (60)') && texto(r.longa).includes('+14 linhas não exibidas'), 'tabela longa no chat: primeiras linhas + "Mostrar todas"');
  ok(!texto(r.longaPdf).includes('Mostrar todas') && (r.longaPdf.match(/<tr/g) || []).length >= 62, 'tabela longa no PDF: todas as linhas, sem botão');
  ok(texto(r.janelas).includes('Cabem (1 h 30)'), 'disponibilidade de janelas mostra a coluna "cabem"');
  ok(texto(r.qualidade).includes('4 slots · 2 h'), 'qualidade: slots convertidos em minutos (x30)');
  ok(texto(r.qualidadePdf).includes('Seg 28/09') && !r.qualidadePdf.includes('aria-expanded'), 'qualidade no PDF: detalhe por dia aberto, sem botões');
  ok(texto(r.agenda).includes('Intervalo de 4 h, inclui 1 h de pausa') && texto(r.agenda).includes('Terça, 29/09/2026'), 'agenda: linha do tempo com sessões e intervalos');
  ok(texto(r.antigos).includes('81,5%') && abas(r.antigos) === 3, 'tipos antigos continuam em abas, como antes');

  const nome = amostras.agendaPaciente.dados.paciente.nome;
  ok(!saida.length, `console vazio durante a renderização${saida.length ? `: ${saida.length} linha(s)` : ''}`);
  ok(!saida.some((l) => l.includes(nome)), 'nome do paciente nunca aparece no console');
  ok(!r.agendaPdf.match(/<title>/) && !texto(r.agenda).includes('Agenda de Paciente') && r.agenda.includes(nome), 'nome do paciente só no corpo do cartão (não no título de aba)');
} finally {
  await server.close();
}

if (falhas.length) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('\nRenderização dos blocos OK.');
