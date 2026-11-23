// Renderiza os cartões de relatório no Node (SSR do Vite, sem navegador nem dependências novas)
// e confere as regras gerais dos blocos:
//   - tipo desconhecido é ignorado sem erro (sozinho: nada; junto com outro: sem aba extra);
//   - meta null e parcial true não quebram, e o aviso lista os dias não lidos;
//   - "+N linhas" quando linhas_omitidas > 0; resumo mostra `exibicao`;
//   - disponibilidade por dia e especialidade: nenhuma faixa perdida ou duplicada, soma de vagas
//     preservada, especialidade única no dia, subtotal = soma, mesma ordem em todos os dias;
//   - sala em ordem natural dentro do grupo ("Sala 2" antes de "Sala 10");
//   - booleano do JSON vira "Sim"/"Não" (tela, PDF e Excel local); a string "true" fica como veio;
//   - plano semanal (tabela_generica): linhas na ordem do agente na tela, no PDF e no Excel local,
//     "Não coube" com "—", posto null como "—" (vazio no Excel), aviso na tela, no PDF e no Resumo;
//   - periodo null ou ausente (bloco sem datas): tela larga e compacta, PDF e Excel local sem
//     "null"/"Invalid Date" nem separador solto; bloco com período mostra o mesmo de antes;
//   - tabela genérica agrupada (dados.agrupar_por, opcional): (a) soma das linhas dos grupos =
//     total; (b) soma dos N dos títulos = total; (c) linhas na ordem recebida na tela e no PDF;
//     (d) colunas de agrupamento fora do corpo; (e) nenhum título vazio/"null"/"undefined"/"NaN";
//     (f) singular/plural; (g) grupos não consecutivos com os mesmos valores não se fundem;
//     (h) "Mostrar todas" corta só entre grupos; agrupar_por inválido = HTML do modo plano;
//     o mesmo nos exemplos oficiais agrupados (nomes por profissional e plano de realocação, com
//     os títulos "Opção N (M passos)" e uma variante com 1 passo para o singular); a pergunta do
//     plano de realocação (sem agrupar_por) sai no modo plano;
//   - panorama de enxugamento em dois blocos: comparativo no modo plano (recomendado booleano como
//     "Sim"/"Não" na tela, no celular, no PDF e no Excel local), passos em um nível ("Cenário 1 · … (4
//     passos)"), detalhe de outro cenário (saltos no passo, observacao "" como "—", avisos longos),
//     os dois juntos (duas abas; PDF com os dois cartões, resumo próprio, thead, sem período);
//   - nada vai para o console durante a renderização (LGPD: o nome do paciente nunca é logado);
//   - com DOM (check-render-dom.mjs): bloco quebrado não derruba o grupo, os vizinhos nem a
//     conversa; histórico com periodo null e com período.
//
// Uso: npm run check:render   (exit code 1 se alguma verificação falhar)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  const { agruparFaixas, subtotal } = await server.ssrLoadModule('/src/reports/Disponibilidade.jsx');
  const { diaCompleto: diaCompletoSsr, formatarValor, int, rotuloTipo } = await server.ssrLoadModule('/src/reports/format.js');
  const { gerarExcel } = await server.ssrLoadModule('/src/reports/localExport.js');
  const { agruparLinhas } = await server.ssrLoadModule('/src/reports/TabelaGenerica.jsx');
  // Exemplos OFICIAIS do agente (cópia sincronizada, dados fictícios): os nomes por profissional e
  // o plano de realocação com agrupar_por/unidade_grupo; a pergunta do plano sem agrupamento; o
  // panorama de enxugamento em dois blocos: o quadro comparativo (modo plano) e os passos agrupados
  // em um nível (cenario); e a resposta completa do agente com os dois.
  const exemplo = async (nome) => (await server.ssrLoadModule(`/src/reports/contrato/exemplos/${nome}.js`)).default;
  const nomesOficial = await exemplo('tabela_generica_pacientes_por_profissional_nomes');
  const realocacaoOficial = await exemplo('tabela_generica_plano_realocacao');
  const perguntaOficial = await exemplo('tabela_generica_plano_realocacao_pergunta');
  const panoramaOficial = await exemplo('tabela_generica_panorama_enxugamento');
  const comparativoOficial = await exemplo('tabela_generica_panorama_enxugamento_comparativo');
  const respostaPanorama = (await server.ssrLoadModule('/src/reports/contrato/respostas/panorama_enxugamento.js')).default;
  const detalhePanorama = amostras.tabelaGenericaPanoramaPassosDetalhe;

  // Captura todo o console durante as renderizações.
  const saida = [];
  const originais = {};
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    originais[m] = console[m];
    console[m] = (...a) => saida.push(a.map(String).join(' '));
  }
  // "Gerado em" fixo no PDF: duas renderizações em minutos diferentes não podem diferir.
  const geradoEm = new Date('2026-11-11T12:00:00');
  const render = (blocos, el = ReportGroup) => {
    try {
      return renderToStaticMarkup(createElement(el, { blocos, texto: 'Resposta de teste.', ...(el === PrintReport && { geradoEm }) }));
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
    disp: Object.fromEntries(
      ['disponibilidadeSintetica', 'disponibilidadeVagas', 'disponibilidadeJanelas', 'disponibilidadeParcial'].map((k) => [
        k,
        { pdf: render([amostras[k]], PrintReport), tela: render([amostras[k]]) },
      ]),
    ),
    qualidade: render([amostras.qualidadeAgenda]),
    qualidadePdf: render([amostras.qualidadeAgenda], PrintReport),
    agenda: render([amostras.agendaPaciente]),
    agendaPdf: render([amostras.agendaPaciente], PrintReport),
    novos: Object.fromEntries(
      ['disponibilidadeVagas', 'convenio', 'qualidadeAgenda', 'tabelaGenericaCapacidade', 'tabelaGenericaPersonalizado'].map((k) => [k, render([amostras[k]])]),
    ),
    antigos: render([amostras.ocupacaoProfissional, amostras.pacientesSemana, amostras.ocupacaoAgregada]),
  };
  // Fictícios: mesmo dia, especialidade, início e profissional; só a sala desempata.
  const faixaSala = (sala, posto = 1) => ({
    ...amostras.disponibilidadeVagas.dados.faixas[0],
    profissional: { id: 'p-ficticio', nome: 'Ana Lima', especialidade: 'psicologia' },
    data: '2026-09-28', inicio: '07:00', fim: '08:00', slots: 2, sala_id: `s-${sala}-${posto}`, sala_nome: `Sala ${sala}`, posto,
  });
  const faixasSalas = [faixaSala(10), faixaSala(2, 2), faixaSala(1), faixaSala(2, 1)];
  const blocoSalas = { ...amostras.disponibilidadeVagas, dados: { ...amostras.disponibilidadeVagas.dados, faixas: faixasSalas } };
  r.salasPdf = render([blocoSalas], PrintReport);
  r.salasTela = render([blocoSalas]);
  const colunasBool = [{ chave: 'nome', rotulo: 'Nome', formato: 'texto' }, { chave: 'flag', rotulo: 'Flag', formato: 'texto' }];
  const blocoBool = {
    ...amostras.tabelaGenericaSemMeta,
    tabelas: [{ nome: 'Flags', colunas: colunasBool, linhas: [{ nome: 'A', flag: true }, { nome: 'B', flag: false }, { nome: 'C', flag: 'true' }, { nome: 'D', flag: null }] }],
  };
  r.boolTela = render([{ ...blocoBool, dados: { ...blocoBool.dados, colunas: colunasBool, linhas: blocoBool.tabelas[0].linhas } }]);
  r.planoTela = render([amostras.tabelaGenericaPlanoSemanal]);
  r.planoPdf = render([amostras.tabelaGenericaPlanoSemanal], PrintReport);
  // periodo null (bloco sem datas, como o plano) em todos os tipos, no estado vazio e com meta;
  // periodo ausente também não quebra. A tela traz a versão larga e a compacta (celular).
  const semPeriodo = Object.fromEntries(
    ['ocupacaoProfissional', 'pacientesSemana', 'ocupacaoAgregada', 'disponibilidadeVagas', 'convenio', 'agendaPaciente', 'qualidadeAgenda', 'tabelaGenericaRanking', 'tabelaGenericaPlanoSemanal'].map(
      (k) => [k, { ...amostras[k], periodo: null }],
    ),
  );
  semPeriodo.comMeta = { ...amostras.tabelaGenericaCapacidade, periodo: null };
  semPeriodo.vazio = { ...amostras.tabelaGenericaRanking, periodo: null, dados: { ...amostras.tabelaGenericaRanking.dados, linhas: [] } };
  const { periodo: _omitido, ...semCampo } = amostras.ocupacaoAgregada;
  semPeriodo.ausente = semCampo;
  semPeriodo.pacientesNomesAgrupada = amostras.tabelaGenericaPacientesNomesAgrupada;
  semPeriodo.pacientesNomesOficial = nomesOficial;
  semPeriodo.planoRealocacaoOficial = realocacaoOficial;
  semPeriodo.planoRealocacaoPerguntaOficial = perguntaOficial;
  semPeriodo.panoramaEnxugamentoOficial = panoramaOficial;
  semPeriodo.panoramaComparativoOficial = comparativoOficial;
  semPeriodo.panoramaPassosDetalhe = detalhePanorama;
  r.semPeriodo = Object.fromEntries(Object.entries(semPeriodo).map(([k, b]) => [k, { tela: render([b]), pdf: render([b], PrintReport) }]));
  r.comPeriodo = Object.fromEntries(
    ['ocupacaoProfissional', 'pacientesSemana', 'pacientesDia', 'ocupacaoAgregada', 'agendaPaciente', 'tabelaGenericaRanking', 'tabelaGenericaCapacidade'].map((k) => [k, render([amostras[k]])]),
  );

  // Tabela genérica agrupada (agrupar_por): o bloco oficial e variações fictícias derivadas dele.
  const agr = amostras.tabelaGenericaPacientesNomesAgrupada;
  const comDados = (b, dados) => ({ ...b, dados: { ...b.dados, ...dados } });
  const semCampos = (b, campos) => ({ ...b, dados: Object.fromEntries(Object.entries(b.dados).filter(([k]) => !campos.includes(k))) });
  const gruposOrig = (() => {
    const g = [];
    let ant;
    for (const l of agr.dados.linhas) {
      const k = `${l.especialidade}|${l.profissional}`;
      if (k !== ant) g.push([]);
      ant = k;
      g.at(-1).push(l);
    }
    return g;
  })();
  // Fora de ordem: cada grupo invertido (pacientes em ordem alfabética decrescente) e os dois
  // primeiros grupos trocados. Só passa se a tela e o PDF repetirem a ordem recebida.
  const linhasForaDeOrdem = [gruposOrig[1], gruposOrig[0], ...gruposOrig.slice(2)].flatMap((g) => [...g].reverse());
  // Não consecutivos: grupo A, grupo B e de novo A (os mesmos valores) => três grupos.
  const linhasRepetidas = [...gruposOrig[0], ...gruposOrig[1], ...gruposOrig[0].slice(0, 2)];
  // Vazios: null, "", só espaços e "—" (o que o agente manda) seguidos são o mesmo grupo
  // "Sem especialidade".
  const vazios = [null, '', '   ', '—'].map((especialidade, i) => ({ ...gruposOrig[0][i], especialidade, profissional: 'Profissional Fictícia Única' }));
  const variantes = {
    foraDeOrdem: comDados(agr, { linhas: linhasForaDeOrdem }),
    repetidos: comDados(agr, { linhas: linhasRepetidas }),
    semUnidade: semCampos(agr, ['unidade_grupo']),
    vazios: comDados(agr, { linhas: vazios }),
    soPrimeiro: comDados(agr, { linhas: gruposOrig[0] }),
    primeiroGrande: comDados(agr, { linhas: [...gruposOrig[2], ...gruposOrig[3]] }),
  };
  r.agr = { tela: render([agr]), pdf: render([agr], PrintReport) };
  // Plano de realocação: todas as opções têm 3 passos; a variante com só o 1º passo da Opção 1
  // (e a Opção 2 inteira) testa o singular.
  const [op1, op2] = (() => {
    const g = new Map();
    for (const l of realocacaoOficial.dados.linhas) g.set(l.opcao, [...(g.get(l.opcao) ?? []), l]);
    return [...g.values()];
  })();
  const realocacaoSingular = comDados(realocacaoOficial, { linhas: [op1[0], ...op2] });
  const oficiais = [
    ['oficial nomes', nomesOficial, { igualFixture: true, singularEPlural: true }],
    ['oficial plano_realocacao', realocacaoOficial, {}],
    ['oficial plano_realocacao (1 passo)', realocacaoSingular, { singularEPlural: true }],
    // Passos do panorama, um nível (cenario): um grupo de 4 passos; a variante com só o 1º passo
    // testa o singular; o detalhe de outro cenário tem saltos no número do passo (1, 3, 4).
    ['oficial panorama_enxugamento', panoramaOficial, {}],
    ['oficial panorama_enxugamento (1 passo)', comDados(panoramaOficial, { linhas: panoramaOficial.dados.linhas.slice(0, 1) }), {}],
    ['panorama detalhe de outro cenário', detalhePanorama, {}],
  ].map(([tag, bloco, opcoes]) => ({ tag, bloco, opcoes, html: { tela: render([bloco]), pdf: render([bloco], PrintReport) } }));
  r.pergunta = { tela: render([perguntaOficial]), pdf: render([perguntaOficial], PrintReport) };
  r.comparativo = { tela: render([comparativoOficial]), pdf: render([comparativoOficial], PrintReport) };
  r.panoramaPar = { tela: render(respostaPanorama.blocos), pdf: render(respostaPanorama.blocos, PrintReport) };
  r.agrVar = Object.fromEntries(Object.entries(variantes).map(([k, b]) => [k, { tela: render([b]), pdf: render([b], PrintReport) }]));
  // Volta ao modo plano: HTML idêntico ao do mesmo bloco sem agrupar_por/unidade_grupo.
  const plano0 = semCampos(agr, ['agrupar_por', 'unidade_grupo']);
  const invalidos = {
    'coluna inexistente (fixture)': amostras.tabelaGenericaPacientesNomesAgruparInvalido,
    'campo ausente (fixture plana)': amostras.tabelaGenericaPacientesNomesPlana,
    'lista vazia': comDados(agr, { agrupar_por: [] }),
    'texto em vez de lista': comDados(agr, { agrupar_por: 'especialidade' }),
    'item não textual': comDados(agr, { agrupar_por: ['especialidade', 1] }),
    'null': comDados(agr, { agrupar_por: null }),
    'objeto': comDados(agr, { agrupar_por: { 0: 'especialidade' } }),
    'chave repetida': comDados(agr, { agrupar_por: ['especialidade', 'especialidade'] }),
    'todas as colunas': comDados(agr, { agrupar_por: agr.dados.colunas.map((c) => c.chave) }),
  };
  r.plano0 = { tela: render([plano0]), pdf: render([plano0], PrintReport) };
  r.invalidos = Object.fromEntries(Object.entries(invalidos).map(([k, b]) => [k, { tela: render([b]), pdf: render([b], PrintReport) }]));
  r.agrVazio = render([comDados(agr, { linhas: [] })]);
  r.planoVazio = render([comDados(plano0, { linhas: [] })]);
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

  const salas = (html) => [...texto(html).matchAll(/Sala (\d+) · posto (\d+)/g)].map((m) => `${m[1]}/${m[2]}`).join(',');
  const ordemSalas = agruparFaixas(faixasSalas)[0].grupos[0].faixas.map((f) => `${f.sala_nome.slice(5)}/${f.posto}`).join(',');
  ok(ordemSalas === '1/1,2/1,2/2,10/1', `sala em ordem natural no grupo, posto desempata (${ordemSalas})`);
  // A tela tem a versão larga e a compacta: a mesma sequência aparece uma vez por versão.
  const soOrdem = (html) => [...new Set(salas(html).match(/(?:[^,]+,){3}[^,]+/g))].join(';');
  ok(soOrdem(r.salasPdf) === '1/1,2/1,2/2,10/1' && soOrdem(r.salasTela) === '1/1,2/1,2/2,10/1', 'sala em ordem natural no PDF e na tela');

  ok(formatarValor(true, 'texto') === 'Sim' && formatarValor(false, 'texto') === 'Não' && formatarValor(true, 'inteiro') === 'Sim', 'booleano vira "Sim"/"Não" em qualquer formato');
  ok(formatarValor('true', 'texto') === 'true' && formatarValor('false', 'texto') === 'false' && formatarValor(null, 'texto') === '—', 'string "true"/"false" fica como veio; null vira "—"');
  const celulasBool = [...texto(r.boolTela).matchAll(/\b([ABCD]) (Sim|Não|true|—)(?= )/g)].map((m) => `${m[1]}=${m[2]}`).join(',');
  ok(celulasBool === 'A=Sim,B=Não,C=true,D=—', `tabela genérica na tela: booleano como "Sim"/"Não" (${celulasBool})`);
  const xls = await gerarExcel([blocoBool]).text();
  const flags = [...xls.split('ss:Name="Flags"')[1].matchAll(/<Row>(.*?)<\/Row>/gs)].slice(1).map((m) => m[1].match(/<Cell[^>]*?(?:\/>|>.*?<\/Cell>)/g)[1].match(/>([^<]*)<\/Data>/)?.[1] ?? '');
  ok(flags.join(',') === 'Sim,Não,true,', `Excel local: booleano como "Sim"/"Não", string intacta, null vazio (${flags.join(',')})`);

  // --- Plano semanal: linhas na ordem do agente, "Não coube" com "—" e posto null ----------
  const plano = amostras.tabelaGenericaPlanoSemanal;
  const chaves = plano.dados.colunas.map((c) => c.chave);
  const seq = (linhas) => linhas.map((l) => `${l.dia}|${l.situacao}|${l.especialidade}|${l.horario}`).join(';');
  const esperado = plano.dados.linhas.map((l) => chaves.map((k) => (l[k] == null ? '—' : String(l[k]))));
  // A fixture só pega uma ordenação se a sequência dela for diferente da ordenada.
  const ordenada = (k) => seq([...plano.dados.linhas].sort((a, b) => a[k].localeCompare(b[k], 'pt-BR')));
  ok(['dia', 'horario', 'situacao', 'sala'].every((k) => ordenada(k) !== seq(plano.dados.linhas)), 'plano: fixture fora de ordem por dia, horário, situação e sala (o teste detecta ordenação)');
  // Células da tabela larga (a do <caption>), linha a linha.
  const celulasTabela = (html) =>
    [...(html.split('<table').find((t) => t.includes('<caption'))?.match(/<tbody>(.*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr>(.*?)<\/tr>/g)].map(([, tr]) =>
      [...tr.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map((m) => texto(m[1]).trim()),
    );
  for (const [onde, html] of [['na tela', r.planoTela], ['no PDF', r.planoPdf]]) {
    const linhas = celulasTabela(html);
    ok(JSON.stringify(linhas) === JSON.stringify(esperado), `plano ${onde}: todas as linhas, na ordem recebida, com os valores como vieram (${linhas.length} de ${esperado.length})`);
    ok(linhas.filter((l) => l[1] === 'Não coube').every((l) => l.slice(3).every((v) => v === '—')), `plano ${onde}: "Não coube" com horário, profissional, sala e posto "—"`);
    ok(!/\b(null|NaN|undefined)\b/.test(texto(html)), `plano ${onde}: nenhum "null", "NaN" ou "undefined"`);
    ok(texto(html).includes(plano.avisos[0]), `plano ${onde}: aviso de feriados e exceções aparece`);
    ok(!html.includes('meterMark') && !/meta \d+%|Meta atingida|Abaixo da meta/i.test(texto(html)), `plano ${onde}: meta null, sem barra nem selo de meta`);
  }
  // Versão compacta (celular): um cartão por linha, na mesma ordem.
  const cartoes = [...r.planoTela.matchAll(/class="[^"]*dayCard[^"]*"><strong>(.*?)<\/strong>/g)].map((m) => texto(m[1]).trim());
  ok(JSON.stringify(cartoes) === JSON.stringify(esperado.map((l) => l.slice(0, 6).join(' · '))), `plano na tela compacta: cartões na ordem recebida (${cartoes.length})`);
  ok(texto(r.planoTela).includes('2 de 3 especialidades') && texto(r.planoTela).includes('Não couberam'), 'plano: resumo por dia mostra `exibicao`');

  const xlsPlano = await gerarExcel([plano]).text();
  const linhasXls = [...xlsPlano.split('ss:Name="Plano"')[1].split('</Worksheet>')[0].matchAll(/<Row>(.*?)<\/Row>/gs)]
    .slice(1)
    .map((m) => m[1].match(/<Cell[^>]*?(?:\/>|>.*?<\/Cell>)/g).map((c) => c.match(/>([^<]*)<\/Data>/)?.[1] ?? ''));
  const esperadoXls = plano.tabelas[0].linhas.map((l) => chaves.map((k) => (l[k] == null ? '' : String(l[k]))));
  ok(JSON.stringify(linhasXls) === JSON.stringify(esperadoXls), `Excel local do plano: linhas na ordem recebida, posto null vazio, "—" como texto (${linhasXls.length})`);
  ok(xlsPlano.split('ss:Name="Resumo"')[1].split('</Worksheet>')[0].includes(plano.avisos[0]), 'Excel local do plano: aviso na aba Resumo');

  // --- periodo null: nada de "null"/"Invalid Date" nem separador sobrando; cartão alinhado --
  const css = await server.ssrLoadModule('/src/reports/reports.module.css').then((m) => m.default);
  // Avisos: até 4, todos em caixas; mais de 4, a tela mostra os 3 primeiros e "Ver mais N avisos"
  // (aria-expanded="false", aria-controls); o PDF mostra todos numa lista compacta (ul.noticeList).
  const avisosOk = (avisos, { tela, pdf }) => {
    const t = texto(tela);
    const p = texto(pdf);
    if (avisos.length <= 4) return avisos.every((a) => t.includes(a) && p.includes(a)) && !t.includes('Ver mais');
    const botao = tela.match(/<button[^>]*aria-expanded="false"[^>]*>Ver mais (\d+) avisos<\/button>/);
    const alvo = botao?.[0].match(/aria-controls="([^"]+)"/)?.[1];
    const lista = pdf.match(new RegExp(`<ul class="${css.noticeList}"[^>]*>(.*?)</ul>`))?.[1] ?? '';
    return avisos.slice(0, 3).every((a) => t.includes(a)) && avisos.slice(3).every((a) => !t.includes(a)) && Number(botao?.[1]) === avisos.length - 3 &&
      Boolean(alvo) && tela.includes(`id="${alvo}"`) && avisos.every((a) => p.includes(a)) && (lista.match(/<li>/g) || []).length === avisos.length && !pdf.includes('Ver mais');
  };
  // Cartões compactos (celular) do modo plano: rótulo (strong) e pares [dt, dd].
  const cartoesCompactos = (html) =>
    [...html.matchAll(/class="[^"]*dayCard[^"]*"><strong>(.*?)<\/strong><dl[^>]*>(.*?)<\/dl>/g)].map(([, rot, dl]) => ({
      rotulo: texto(rot).trim(),
      pares: [...dl.matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/g)].map((m) => [texto(m[1]).trim(), texto(m[2]).trim()]),
    }));
  // Texto do cabeçalho do cartão (div headText): tipo, título e o subtítulo, se houver.
  const cabecalhos = (html) => [...html.matchAll(new RegExp(`<div class="${css.headText}">(.*?)</div>`, 'g'))].map((m) => m[1]);
  const subtitulos = (html) =>
    cabecalhos(html).flatMap((h) => [...h.matchAll(new RegExp(`<span class="${css.sub}">(.*?)</span>`, 'g'))].map((m) => texto(m[1]).trim()));
  const problemas = (html) => [
    ...(html.startsWith('ERRO') || !html.includes(css.card) || html.includes('Relatório indisponível') ? ['cartão não desenhado'] : []),
    ...(/\b(null|undefined|NaN)\b|Invalid Date/.test(texto(html)) ? ['"null"/"undefined"/"NaN"/"Invalid Date" no texto'] : []),
    ...subtitulos(html).filter((t) => !t || /^[·—]|[·—]$|· ·/.test(t)).map((t) => `subtítulo ${JSON.stringify(t)}`),
    ...(cabecalhos(html).every((h) => h.includes(css.kicker) && h.includes('<h3')) ? [] : ['cabeçalho sem tipo ou título']),
  ];
  for (const [k, { tela, pdf }] of Object.entries(r.semPeriodo)) {
    const p = [...problemas(tela).map((x) => `tela: ${x}`), ...problemas(pdf).map((x) => `PDF: ${x}`)];
    ok(!p.length, `periodo ${k === 'ausente' ? 'ausente' : 'null'}, ${k}: tela (larga e compacta) e PDF sem "null"/"Invalid Date" nem separador solto [${subtitulos(tela)[0] ?? 'sem subtítulo'}]${p.length ? ` — ${p.join('; ')}` : ''}`);
  }
  ok(subtitulos(r.semPeriodo.comMeta.tela)[0] === 'meta 80%', 'periodo null com meta: subtítulo só "meta 80%"');
  ok(subtitulos(r.semPeriodo.tabelaGenericaPlanoSemanal.tela).length === 0, 'periodo null sem meta (plano): sem subtítulo');
  ok(texto(r.semPeriodo.vazio.tela).includes('Nenhum resultado para este recorte.') && !/<span><\/span>/.test(r.semPeriodo.vazio.tela), 'periodo null no estado vazio: só a mensagem, sem período vazio');
  ok(r.semPeriodo.tabelaGenericaPlanoSemanal.tela.includes('dayCard'), 'periodo null: versão compacta (celular) desenhada');
  // Bloco antigo com período: o mesmo subtítulo de antes.
  const esperadoCom = {
    ocupacaoProfissional: 'Terapia Ocupacional · 05/10 a 10/10/2026',
    pacientesSemana: '05/10 a 10/10/2026',
    pacientesDia: 'Quinta, 08/10/2026',
    ocupacaoAgregada: 'Quinta, 08/10/2026 · meta 80%',
    agendaPaciente: 'Convênio Unimed · 28/09 a 03/10/2026',
    tabelaGenericaRanking: '28/09 a 03/10/2026 · meta 80%',
    tabelaGenericaCapacidade: '28/09 a 03/10/2026 · meta 80%',
  };
  for (const [k, sub] of Object.entries(esperadoCom)) ok(subtitulos(r.comPeriodo[k])[0] === sub, `com período, ${k}: subtítulo igual ao de antes (${subtitulos(r.comPeriodo[k])[0]})`);
  const xlsSem = await gerarExcel(Object.values(semPeriodo)).text();
  const periodosXls = [...xlsSem.split('ss:Name="Resumo"')[1].split('</Worksheet>')[0].matchAll(/<Row>(.*?)<\/Row>/gs)]
    .slice(1)
    .map((m) => m[1].match(/<Cell[^>]*?(?:\/>|>.*?<\/Cell>)/g)[1]);
  ok(periodosXls.length === Object.keys(semPeriodo).length && periodosXls.every((c) => c === '<Cell ss:StyleID="txt"/>'), `Excel local: Período vazio no Resumo com periodo null (${periodosXls.length})`);
  const xlsCom = await gerarExcel([amostras.tabelaGenericaRanking]).text();
  ok(xlsCom.includes('<Data ss:Type="String">28/09 a 03/10/2026</Data>'), 'Excel local: período preenchido continua no Resumo');

  // --- Disponibilidade por dia e especialidade: nada se perde nem se duplica -----------------
  // Lê as tabelas por dia do HTML (PDF e tela) e confere com o dado original.
  const tabelasDisp = (html) =>
    html
      .split('<table')
      .slice(1)
      .filter((t) => t.includes('dispDayRow'))
      .map((t) => {
        const dia = texto(t.match(/dispDayRow[^>]*>\s*<th[^>]*>(.*?)<\/th>/)?.[1] ?? '').trim();
        const grupos = [];
        const corpos = [...t.matchAll(/<tbody[^>]*>(.*?)<\/tbody>/g)].map((m) => m[1]).join('');
        for (const [, cls = '', corpo] of corpos.matchAll(/<tr(?: class="([^"]*)")?>(.*?)<\/tr>/g)) {
          if (cls.includes('specRow')) {
            const [, rotulo, sub] = corpo.match(/<th[^>]*>(.*?)<span>(.*?)<\/span>/);
            grupos.push({ rotulo: texto(rotulo).trim(), sub: texto(sub).trim(), linhas: [] });
          } else {
            grupos.at(-1).linhas.push(Number(texto(corpo).match(/(\d+) vagas? \(/)[1]));
          }
        }
        return { dia, grupos };
      });
  const soma = (l) => l.reduce((a, n) => a + n, 0);
  const ordemRef = (rotulos) =>
    [...new Set(rotulos)].sort((a, b) =>
      a === 'Sem especialidade' ? 1 : b === 'Sem especialidade' ? -1 : a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
    );

  for (const nomeBloco of ['disponibilidadeSintetica', 'disponibilidadeVagas', 'disponibilidadeJanelas', 'disponibilidadeParcial']) {
    const bloco = amostras[nomeBloco];
    const { faixas } = bloco.dados;
    const slotsOrig = soma(faixas.map((f) => f.slots));
    const agrupado = agruparFaixas(faixas);
    const todasAgrupadas = agrupado.flatMap((d) => d.grupos.flatMap((g) => g.faixas));
    ok(todasAgrupadas.length === faixas.length && new Set(todasAgrupadas).size === faixas.length && faixas.every((f) => todasAgrupadas.includes(f)),
      `${nomeBloco}: agrupar não perde nem duplica faixas (${faixas.length})`);

    const pdf = tabelasDisp(r.disp[nomeBloco].pdf);
    const linhasPdf = pdf.flatMap((d) => d.grupos.flatMap((g) => g.linhas));
    ok(pdf.length === new Set(faixas.map((f) => f.data)).size, `${nomeBloco}: uma tabela por dia no PDF (${pdf.length})`);
    ok(linhasPdf.length === faixas.length, `${nomeBloco}: (a) PDF com todas as faixas (${linhasPdf.length} de ${faixas.length})`);
    ok(soma(linhasPdf) === slotsOrig, `${nomeBloco}: (b) soma de vagas no PDF igual ao dado (${soma(linhasPdf)} de ${slotsOrig})`);
    ok(pdf.every((d) => new Set(d.grupos.map((g) => g.rotulo)).size === d.grupos.length), `${nomeBloco}: (c) nenhuma especialidade repetida no mesmo dia`);
    ok(pdf.every((d) => d.grupos.every((g) => g.sub === subtotal(soma(g.linhas)))) && agrupado.every((d) => d.grupos.every((g) => g.slots === soma(g.faixas.map((f) => f.slots)))),
      `${nomeBloco}: (d) subtotal de cada grupo = soma das suas faixas`);
    const ref = ordemRef(pdf.flatMap((d) => d.grupos.map((g) => g.rotulo)));
    ok(pdf.every((d) => d.grupos.every((g, i) => !i || ref.indexOf(d.grupos[i - 1].rotulo) < ref.indexOf(g.rotulo))),
      `${nomeBloco}: (e) ordem dos grupos igual em todos os dias (alfabética, "Sem especialidade" por último)`);
    ok(agrupado.every((d) => d.grupos.every((g) => g.faixas.every((f, i) => !i || g.faixas[i - 1].inicio <= f.inicio))), `${nomeBloco}: faixas do grupo por horário de início`);

    // Tela: o limite mostra só grupos inteiros.
    const tela = tabelasDisp(r.disp[nomeBloco].tela);
    const tamanhos = new Map(agrupado.flatMap((d) => d.grupos.map((g) => [`${d.data}|${g.rotulo}`, g.faixas.length])));
    const diaIso = new Map(agrupado.map((d) => [texto(diaCompletoSsr(d.data)), d.data]));
    ok(tela.every((d) => d.grupos.every((g) => g.linhas.length === tamanhos.get(`${diaIso.get(d.dia)}|${g.rotulo}`))), `${nomeBloco}: na tela, só grupos inteiros`);
  }
  const sint = tabelasDisp(r.disp.disponibilidadeSintetica.pdf);
  const rotulosSint = new Set(sint.flatMap((d) => d.grupos.map((g) => g.rotulo)));
  ok(rotulosSint.size === 10 && rotulosSint.has('Sem especialidade') && !rotulosSint.has('terapia_ocupacional'), 'sintética: 9 especialidades + "Sem especialidade"; identificador no mesmo grupo do rótulo');
  ok(texto(r.disp.disponibilidadeSintetica.tela).includes(`Mostrar todas (${amostras.disponibilidadeSintetica.dados.faixas.length})`), 'sintética na tela: botão "Mostrar todas" continua');
  ok(!/Especialidade<\/th>|Turno<\/th>/.test(r.disp.disponibilidadeSintetica.pdf), 'lista de faixas sem as colunas Especialidade e Turno');

  // --- Tabela genérica agrupada --------------------------------------------------------------
  // Lê a tabela agrupada (classe groupTable): títulos (specRow) e as células de cada linha.
  const tabelaAgrupada = (html) => {
    const t = html.split('<table').slice(1).find((x) => x.includes(css.groupTable));
    if (!t) return null;
    const cabecalho = [...(t.match(/<thead>(.*?)<\/thead>/)?.[1] ?? '').matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => texto(m[1]).trim());
    const grupos = [];
    const corpos = [...t.matchAll(/<tbody(?: class="([^"]*)")?>(.*?)<\/tbody>/g)];
    for (const [, cls = '', corpo] of corpos) {
      const trs = [...corpo.matchAll(/<tr(?: class="([^"]*)")?>(.*?)<\/tr>/g)];
      if (cls.includes(css.specHead) && !(trs.length === 2 && (trs[0][1] ?? '').includes(css.specRow))) grupos.push({ titulo: '', linhas: [], erro: 'título sem a primeira linha no mesmo tbody' });
      for (const [, trCls = '', tr] of trs) {
        if (trCls.includes(css.specRow)) grupos.push({ titulo: texto(tr).trim(), linhas: [] });
        else grupos.at(-1).linhas.push([...tr.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map((m) => texto(m[1]).trim()));
      }
    }
    return { cabecalho, grupos };
  };
  // Versão compacta (celular): título do grupo (h4) e o rótulo (strong) de cada cartão.
  const cartoesAgrupados = (html) => {
    const grupos = [];
    for (const [, sec] of html.matchAll(new RegExp(`<section class="${css.groupCards}">(.*?)</section>`, 'g'))) {
      grupos.push({
        titulo: texto(sec.match(/<h4[^>]*>(.*?)<\/h4>/)?.[1] ?? '').trim(),
        cartoes: [...sec.matchAll(/<strong>(.*?)<\/strong>/g)].map((m) => texto(m[1]).trim()),
        rotulos: [...sec.matchAll(/<dt>(.*?)<\/dt>/g)].map((m) => texto(m[1]).trim()),
      });
    }
    return grupos;
  };
  const corpoAgr = agr.dados.colunas.filter((c) => !agr.dados.agrupar_por.includes(c.chave));
  const celulasEsperadas = (linhas) => linhas.map((l) => corpoAgr.map((c) => formatarValor(l[c.chave], c.formato)));
  const cartaoEsperado = (linhas) => linhas.map((l) => `${l.paciente} · ${l.dias}`);
  const nDoTitulo = (t) => Number((t.match(/\((\d[\d.]*)(?: [^()]+)?\)$/)?.[1] ?? 'NaN').replace(/\./g, ''));
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const total = agr.dados.linhas.length;

  const pdfAgr = tabelaAgrupada(r.agr.pdf);
  const telaAgr = tabelaAgrupada(r.agr.tela);
  const celPdf = pdfAgr?.grupos.flatMap((g) => g.linhas) ?? [];
  ok(pdfAgr && telaAgr && !pdfAgr.grupos.some((g) => g.erro) && !telaAgr.grupos.some((g) => g.erro), 'agrupada: tabela agrupada desenhada (tela e PDF), título + primeira linha no mesmo tbody');
  ok(pdfAgr?.grupos.length === 33 && agruparLinhas(agr.dados)?.grupos.length === 33, `agrupada: 33 grupos no PDF (${pdfAgr?.grupos.length})`);
  ok(celPdf.length === total && pdfAgr.grupos.reduce((a, g) => a + g.linhas.length, 0) === total, `agrupada: (a) soma das linhas dos grupos = total do bloco (${celPdf.length} de ${total})`);
  ok(pdfAgr.grupos.reduce((a, g) => a + nDoTitulo(g.titulo), 0) === total && pdfAgr.grupos.every((g) => nDoTitulo(g.titulo) === g.linhas.length), 'agrupada: (b) soma dos N dos títulos = total, e cada N = linhas do grupo');
  ok(igual(celPdf, celulasEsperadas(agr.dados.linhas)), 'agrupada: (c) PDF com todas as linhas na ordem recebida, valores como vieram');
  const celTela = telaAgr.grupos.flatMap((g) => g.linhas);
  ok(celTela.length > 0 && igual(celTela, celulasEsperadas(agr.dados.linhas.slice(0, celTela.length))), `agrupada: (c) tela com as primeiras linhas na ordem recebida (${celTela.length})`);
  const compTela = cartoesAgrupados(r.agr.tela);
  ok(igual(compTela.flatMap((g) => g.cartoes), cartaoEsperado(agr.dados.linhas.slice(0, celTela.length))) && igual(compTela.map((g) => g.titulo), telaAgr.grupos.map((g) => g.titulo)),
    'agrupada: (c) celular com os mesmos títulos e um cartão por linha, na ordem recebida');
  const fora = variantes.foraDeOrdem.dados.linhas;
  const ordenadaPor = (k) => igual([...fora].sort((a, b) => String(a[k]).localeCompare(String(b[k]), 'pt-BR')), fora);
  ok(['especialidade', 'profissional', 'paciente', 'dias', 'atendimentos_semana'].every((k) => !ordenadaPor(k)), 'agrupada: variante fora de ordem por todas as colunas (o teste detecta ordenação)');
  const pdfFora = tabelaAgrupada(r.agrVar.foraDeOrdem.pdf);
  const telaFora = tabelaAgrupada(r.agrVar.foraDeOrdem.tela).grupos.flatMap((g) => g.linhas);
  ok(igual(pdfFora.grupos.flatMap((g) => g.linhas), celulasEsperadas(fora)) && igual(telaFora, celulasEsperadas(fora.slice(0, telaFora.length))),
    'agrupada: (c) fora de ordem: tela e PDF repetem exatamente a sequência recebida, sem reordenar');
  ok(pdfFora.grupos[0].titulo.startsWith(`${gruposOrig[1][0].especialidade} · ${gruposOrig[1][0].profissional} (`), 'agrupada: (c) a ordem dos grupos também é a recebida');

  const rotulosGrupo = agr.dados.colunas.filter((c) => agr.dados.agrupar_por.includes(c.chave)).map((c) => c.rotulo);
  const valoresGrupo = new Set(agr.dados.linhas.flatMap((l) => [l.especialidade, l.profissional]).filter(Boolean));
  const semColunaGrupo = (h) => {
    const t = tabelaAgrupada(h);
    const comp = cartoesAgrupados(h);
    return (
      igual(t.cabecalho, corpoAgr.map((c) => c.rotulo)) &&
      t.grupos.every((g) => g.linhas.every((l) => l.length === corpoAgr.length && l.every((v) => !valoresGrupo.has(v)))) &&
      comp.every((g) => g.rotulos.every((x) => !rotulosGrupo.includes(x)) && g.cartoes.every((c) => c.split(' · ').every((v) => !valoresGrupo.has(v))))
    );
  };
  ok(semColunaGrupo(r.agr.tela) && semColunaGrupo(r.agr.pdf), 'agrupada: (d) Especialidade e Profissional só no título (fora do cabeçalho, das células e dos cartões)');

  const titulos = [...pdfAgr.grupos, ...tabelaAgrupada(r.agrVar.vazios.pdf).grupos, ...tabelaAgrupada(r.agrVar.semUnidade.pdf).grupos].map((g) => g.titulo);
  ok(titulos.every((t) => t && !/\b(null|undefined|NaN)\b/.test(t) && !/^[·(]|· ·|· \(/.test(t)), 'agrupada: (e) nenhum título vazio, "null", "undefined" ou "NaN"');
  ok(pdfAgr.grupos.filter((g) => g.titulo.startsWith('Sem especialidade · ')).length === 2 && !pdfAgr.grupos.some((g) => g.titulo.startsWith('—')), 'agrupada: (e) especialidade "—" vira "Sem especialidade"');
  const vaz = tabelaAgrupada(r.agrVar.vazios.pdf).grupos;
  ok(vaz.length === 1 && vaz[0].titulo === 'Sem especialidade · Profissional Fictícia Única (4 pacientes)', `agrupada: (e) null, "", só espaços e "—" seguidos são um grupo só (${vaz.map((g) => g.titulo).join(' | ')})`);
  const singular = pdfAgr.grupos.filter((g) => g.linhas.length === 1);
  ok(singular.length === 1 && singular[0].titulo === 'Nutrição · Natália Simões Andrade (1 paciente)' && pdfAgr.grupos.filter((g) => g.linhas.length > 1).every((g) => g.titulo.endsWith(` (${g.linhas.length} pacientes)`)),
    `agrupada: (f) singular com 1 ("${singular[0]?.titulo}") e plural nos demais`);
  const semUn = tabelaAgrupada(r.agrVar.semUnidade.pdf).grupos;
  ok(semUn.every((g) => g.titulo.endsWith(` (${g.linhas.length})`)) && semUn.some((g) => g.titulo.endsWith(' (1)')), 'agrupada: (f) sem unidade_grupo, só "(N)"');
  const rep = tabelaAgrupada(r.agrVar.repetidos.pdf).grupos;
  ok(rep.length === 3 && rep[0].titulo.split(' (')[0] === rep[2].titulo.split(' (')[0] && rep[0].titulo !== rep[1].titulo && igual(rep.flatMap((g) => g.linhas), celulasEsperadas(linhasRepetidas)) && agruparLinhas(variantes.repetidos.dados).grupos.length === 3,
    `agrupada: (g) grupos não consecutivos com os mesmos valores não se fundem (${rep.map((g) => g.linhas.length).join('+')})`);

  ok(texto(r.agr.tela).includes(`Mostrar todas (${total})`) && !texto(r.agr.pdf).includes('Mostrar todas'), `agrupada: "Mostrar todas (${total})" na tela, PDF sem botão`);
  const inteiros = (t) => t.grupos.every((g, i) => g.titulo === pdfAgr.grupos[i].titulo && g.linhas.length === pdfAgr.grupos[i].linhas.length);
  const vis = telaAgr.grupos.reduce((a, g) => a + g.linhas.length, 0);
  ok(inteiros(telaAgr) && telaAgr.grupos.length >= 1 && (vis <= 15 || telaAgr.grupos.length === 1) && vis + pdfAgr.grupos[telaAgr.grupos.length].linhas.length > 15,
    `agrupada: (h) "Mostrar todas" corta só entre grupos (${telaAgr.grupos.length} grupos, ${vis} linhas)`);
  const grande = tabelaAgrupada(r.agrVar.primeiroGrande.tela);
  ok(grande.grupos.length === 1 && grande.grupos[0].linhas.length === gruposOrig[2].length && gruposOrig[2].length > 15 && texto(r.agrVar.primeiroGrande.tela).includes(`Mostrar todas (${gruposOrig[2].length + gruposOrig[3].length})`),
    `agrupada: (h) primeiro grupo maior que o limite aparece inteiro (${grande.grupos[0].linhas.length} linhas)`);
  ok(!texto(r.agrVar.soPrimeiro.tela).includes('Mostrar todas') && tabelaAgrupada(r.agrVar.soPrimeiro.tela).grupos.length === 1, 'agrupada: (h) sem botão quando tudo cabe');

  // --- Exemplos OFICIAIS do agente: as mesmas invariantes, com os grupos esperados calculados aqui
  // (sem agruparLinhas). Só contagens e títulos nas mensagens; nunca linhas.
  const NUMERICOS = new Set(['percentual', 'inteiro', 'decimal']);
  const titulosOficiais = {};
  for (const { tag: nomeOficial, bloco: oficial, opcoes, html } of oficiais) {
    const { colunas, linhas, agrupar_por: por, unidade_grupo: un } = oficial.dados;
    const doGrupo = por.map((k) => colunas.find((c) => c.chave === k));
    const corpo = colunas.filter((c) => !por.includes(c.chave));
    const semValor = (v) => v == null || (typeof v === 'string' && ['', '—'].includes(v.trim()));
    const esperados = [];
    let ant;
    for (const l of linhas) {
      const vals = doGrupo.map((c) => (semValor(l[c.chave]) ? null : l[c.chave]));
      const k = JSON.stringify(vals);
      if (k !== ant) esperados.push({ vals, linhas: [] });
      ant = k;
      esperados.at(-1).linhas.push(l);
    }
    const tituloEsperado = ({ vals, linhas: ls }) =>
      `${vals.map((v, j) => (v == null ? `Sem ${doGrupo[j].rotulo.toLocaleLowerCase('pt-BR')}` : formatarValor(v, doGrupo[j].formato))).join(' · ')} (${int(ls.length)} ${ls.length === 1 ? un.singular : un.plural})`;
    const celulas = (ls) => ls.map((l) => corpo.map((c) => formatarValor(l[c.chave], c.formato)));
    // Rótulo do cartão no celular: as colunas não numéricas do corpo (total vazio), unidas por " · ".
    const dimsCorpo = corpo.filter((c) => !NUMERICOS.has(c.formato));
    const cartoes = (ls) => ls.map((l) => dimsCorpo.map((c) => formatarValor(l[c.chave], c.formato)).join(' · ') || '—');
    const pdf = tabelaAgrupada(html.pdf);
    const tela = tabelaAgrupada(html.tela);
    const comp = cartoesAgrupados(html.tela);
    const totalOf = linhas.length;
    const tag = `${nomeOficial} (${totalOf} linhas, ${esperados.length} grupos)`;
    ok(typeof html.tela === 'string' && !html.tela.startsWith('ERRO') && !html.pdf.startsWith('ERRO') && pdf && tela && !pdf.grupos.some((g) => g.erro) && !tela.grupos.some((g) => g.erro),
      `${tag}: modo agrupado desenhado na tela e no PDF, título + primeira linha no mesmo tbody`);
    if (opcoes.igualFixture) ok(igual(colunas, agr.dados.colunas) && igual(por, agr.dados.agrupar_por) && igual(un, agr.dados.unidade_grupo), `${tag}: mesmas colunas, agrupar_por e unidade_grupo da fixture`);
    if (opcoes.singularEPlural) ok(esperados.some((g) => g.linhas.length === 1) && esperados.some((g) => g.linhas.length > 1), `${tag}: tem grupo com 1 e com várias linhas (singular e plural testados)`);
    titulosOficiais[nomeOficial] = pdf?.grupos.map((g) => g.titulo) ?? [];
    // Sem modo agrupado (falha registrada acima): as invariantes seguintes não se aplicam.
    if (!pdf || !tela) continue;
    for (const [onde, t] of [['PDF', pdf], ['tela', tela]]) {
      ok(t.grupos.reduce((a, g) => a + g.linhas.length, 0) === totalOf, `${tag}: (a) ${onde}: soma das linhas dos grupos = total`);
      ok(t.grupos.reduce((a, g) => a + nDoTitulo(g.titulo), 0) === totalOf && t.grupos.every((g) => nDoTitulo(g.titulo) === g.linhas.length), `${tag}: (b) ${onde}: soma dos N dos títulos = total e cada N = linhas do grupo`);
      ok(igual(t.grupos.map((g) => g.titulo), esperados.map(tituloEsperado)), `${tag}: (c)(e)(f) ${onde}: títulos exatos, na ordem recebida, singular/plural`);
      ok(igual(t.grupos.flatMap((g) => g.linhas), celulas(linhas)) && igual(t.grupos.map((g) => g.linhas.length), esperados.map((g) => g.linhas.length)), `${tag}: (c) ${onde}: todas as linhas na ordem exata recebida`);
      ok(igual(t.cabecalho, corpo.map((c) => c.rotulo)) && t.grupos.every((g) => g.linhas.every((l) => l.length === corpo.length)), `${tag}: (d) ${onde}: colunas de agrupamento fora do cabeçalho e do corpo`);
    }
    const valoresDoGrupo = new Set(linhas.flatMap((l) => por.map((k) => l[k])));
    ok([pdf, tela].every((t) => t.grupos.every((g) => g.linhas.every((l) => l.every((v) => !valoresDoGrupo.has(v))))), `${tag}: (d) nenhum valor de agrupamento nas células`);
    ok(igual(comp.map((g) => g.titulo), tela.grupos.map((g) => g.titulo)) && igual(comp.flatMap((g) => g.cartoes), cartoes(linhas)) && comp.every((g) => g.rotulos.every((x) => !doGrupo.some((c) => c.rotulo === x))),
      `${tag}: (c)(d) celular: mesmos títulos, um cartão por linha na ordem, sem colunas de agrupamento`);
    ok(![html.tela, html.pdf].some((h) => /\b(null|undefined|NaN)\b|Invalid Date/.test(texto(h))), `${tag}: (e) nenhum "null", "undefined", "NaN" ou "Invalid Date" na tela nem no PDF`);
    ok(totalOf > 15 || (!texto(html.tela).includes('Mostrar todas') && !texto(html.pdf).includes('Mostrar todas')), `${tag}: cabe sem "Mostrar todas"`);
    ok(avisosOk(oficial.avisos, html), `${tag}: avisos na tela (3 + "Ver mais" se passar de 4) e todos no PDF`);
  }
  // Título do grupo do plano de realocação: formato atual "valores (N unidade)". Só "Opção N" e
  // contagens; nunca nomes.
  {
    const t = titulosOficiais['oficial plano_realocacao'];
    ok(igual(t, ['Opção 1 (3 passos)', 'Opção 2 (3 passos)', 'Opção 3 (3 passos)']), `plano_realocacao: títulos dos grupos ${JSON.stringify(t)}`);
    const t1 = titulosOficiais['oficial plano_realocacao (1 passo)'];
    ok(igual(t1, ['Opção 1 (1 passo)', 'Opção 2 (3 passos)']), `plano_realocacao: singular ${JSON.stringify(t1)}`);
  }
  // --- Panorama de enxugamento em dois blocos (resposta do agente desde 2026-11-23) -------------
  // Mensagens só com títulos, contagens e "Sim"/"Não": nunca linhas (nomes fictícios, mas o bloco de
  // passos é sensível de RH).
  {
    // (b) Passos: um nível, título "cenário (N passos)", coluna do cenário fora do corpo.
    ok(igual(panoramaOficial.dados.agrupar_por, ['cenario']), 'panorama passos: agrupar_por em um nível (["cenario"])');
    ok(igual(titulosOficiais['oficial panorama_enxugamento'], ['Cenário 1 · equilibrado · libera 3 turnos (4 passos)']),
      `panorama passos: título ${JSON.stringify(titulosOficiais['oficial panorama_enxugamento'])}`);
    ok(igual(titulosOficiais['oficial panorama_enxugamento (1 passo)'], ['Cenário 1 · equilibrado · libera 3 turnos (1 passo)']), 'panorama passos: singular "(1 passo)"');
    // (d) Detalhe de outro cenário: título do bloco inteiro, saltos no passo, observacao "" vira "—".
    const det = tabelaAgrupada(r.semPeriodo.panoramaPassosDetalhe.pdf);
    const corpoDet = detalhePanorama.dados.colunas.filter((c) => c.chave !== 'cenario').map((c) => c.chave);
    const passosDet = det?.grupos.flatMap((g) => g.linhas.map((l) => l[corpoDet.indexOf('passo')])) ?? [];
    const obsDet = det?.grupos.flatMap((g) => g.linhas.map((l) => l[corpoDet.indexOf('observacao')])) ?? [];
    ok(igual(titulosOficiais['panorama detalhe de outro cenário'], ['Cenário 2 · mais turnos · libera 3 turnos (3 passos)']) && igual(passosDet, ['1', '3', '4']),
      `panorama detalhe: grupo com 3 passos e números com saltos ${JSON.stringify(passosDet)}`);
    ok(obsDet.length === 3 && obsDet.every((v) => v === '—'), 'panorama detalhe: observacao "" vira "—" (nunca vazio, "null" ou "undefined")');
    for (const onde of ['tela', 'pdf']) {
      const h = texto(r.semPeriodo.panoramaPassosDetalhe[onde]);
      ok(h.includes(detalhePanorama.titulo) && detalhePanorama.avisos.every((a) => h.includes(a)), `panorama detalhe (${onde}): título "(apenas o que difere do Cenário 1)" e avisos longos inteiros`);
    }

    // (b)(c) Comparativo: sem agrupar_por, modo plano; recomendado (booleano em coluna "texto") vira Sim/Não.
    const { colunas, linhas } = comparativoOficial.dados;
    const iRec = colunas.findIndex((c) => c.chave === 'recomendado');
    const esperadoComp = linhas.map((l) => colunas.map((c) => formatarValor(l[c.chave], c.formato)));
    const recEsperado = linhas.map((l) => (l.recomendado ? 'Sim' : 'Não'));
    ok(linhas.every((l) => typeof l.recomendado === 'boolean') && colunas[iRec]?.formato === 'texto' && igual(recEsperado, ['Sim', 'Não', 'Não']),
      'comparativo: recomendado é booleano JSON em coluna "texto" (true, false, false)');
    for (const [onde, html] of [['tela', r.comparativo.tela], ['PDF', r.comparativo.pdf]]) {
      const cel = celulasTabela(html);
      ok(!html.startsWith('ERRO') && !html.includes(css.groupTable) && igual(cel, esperadoComp), `comparativo (${onde}): modo plano, ${cel.length} linhas na ordem recebida, todas as colunas`);
      ok(igual(cel.map((l) => l[iRec]), recEsperado), `comparativo (${onde}): coluna Recomendado ${JSON.stringify(cel.map((l) => l[iRec]))}`);
      ok(!/\b(true|false|null|undefined|NaN)\b/.test(texto(html)), `comparativo (${onde}): nenhum "true", "false", "null" ou "undefined"`);
    }
    // Celular: a coluna booleana sai do rótulo do cartão e aparece com o rótulo ("Recomendado: Sim").
    const cartoesComp = cartoesCompactos(r.comparativo.tela);
    ok(igual(cartoesComp.map((c) => c.rotulo), linhas.map((l) => l.cenario)), `comparativo (celular): rótulo do cartão só com o cenário ${JSON.stringify(cartoesComp.map((c) => c.rotulo))}`);
    const recCel = cartoesComp.map((c) => c.pares.find(([k]) => k === 'Recomendado')?.join(': '));
    ok(igual(recCel, recEsperado.map((v) => `Recomendado: ${v}`)), `comparativo (celular): ${JSON.stringify(recCel)}`);
    ok(cartoesComp.every((c) => c.pares.length === colunas.length - 1) && !/\b(true|false|null|undefined|NaN)\b/.test(cartoesComp.flatMap((c) => c.pares.flat()).join(' ')),
      'comparativo (celular): todas as colunas fora o cenário como "rótulo: valor", sem "true"/"null"/"undefined"');
    // Excel local: aba "Cenários", Sim/Não como texto; com os dois blocos, "Cenários (1)" e "Passos (2)".
    const xlsComp = await gerarExcel([comparativoOficial]).text();
    const linhasXlsComp = [...xlsComp.split('ss:Name="Cenários"')[1].split('</Worksheet>')[0].matchAll(/<Row>(.*?)<\/Row>/gs)].slice(1)
      .map((m) => m[1].match(/<Cell[^>]*?(?:\/>|>.*?<\/Cell>)/g).map((c) => c.match(/>([^<]*)<\/Data>/)?.[1] ?? ''));
    ok(igual(linhasXlsComp.map((l) => l[iRec]), recEsperado) && !/>(true|false)</.test(xlsComp), `Excel local do comparativo: Recomendado ${JSON.stringify(linhasXlsComp.map((l) => l[iRec]))}`);
    const xlsPar = await gerarExcel(respostaPanorama.blocos).text();
    const abasPar = [...xlsPar.matchAll(/<Worksheet ss:Name="([^"]*)"/g)].map((m) => m[1]);
    ok(igual(abasPar, ['Resumo', 'Cenários (1)', 'Passos (2)']), `Excel local dos dois blocos: abas únicas com sufixo ${JSON.stringify(abasPar)}`);
    const linhaVaziaXls = [...xlsPar.split('ss:Name="Passos (2)"')[1].split('</Worksheet>')[0].matchAll(/<Row>(.*?)<\/Row>/gs)].slice(1);
    ok(linhaVaziaXls.length === 4 && linhaVaziaXls.every((m) => m[1].trim().endsWith('<Cell ss:StyleID="txt"/>')), 'Excel local dos passos: observacao "" vira célula vazia');

    // (a) Os dois blocos na mesma mensagem: duas abas na ordem recebida, cartão do comparativo ativo.
    const tela = r.panoramaPar.tela;
    ok(abas(tela) === 2 && tela.includes('Exportar os 2 relatórios juntos?') && texto(tela).includes(comparativoOficial.titulo), 'panorama (tela): dois blocos viram duas abas, a 1ª (comparativo) aberta');
    // (e)(h) PDF com os dois: dois artigos na ordem, cada um com o seu resumo (KPIs), tabela com thead
    // (repetido em cada página por .printDoc .dense thead), título do grupo junto da 1ª linha, sem período.
    const pdf = r.panoramaPar.pdf;
    const artigos = pdf.split('<article').slice(1);
    const resumos = artigos.map((a) => [...(a.match(new RegExp(`<dl class="${css.stats}">(.*?)</dl>`))?.[1] ?? '').matchAll(/<dt>(.*?)<\/dt>/g)].map((m) => texto(m[1]).trim()));
    ok(artigos.length === 2 && artigos.map((a) => texto(a).includes(comparativoOficial.titulo) ? 'c' : texto(a).includes(panoramaOficial.titulo) ? 'p' : '?').join('') === 'cp',
      'panorama (PDF): dois cartões, comparativo e depois passos');
    ok(igual(resumos, respostaPanorama.blocos.map((b) => b.resumo.map((x) => x.rotulo))), `panorama (PDF): cada bloco com o seu resumo (${resumos.map((x) => x.length).join(' + ')} KPIs)`);
    ok(artigos.every((a) => /<table class="[^"]*dense[^"]*"[^>]*>(<caption[^>]*>.*?<\/caption>)?<thead>/.test(a)), 'panorama (PDF): as duas tabelas são densas e com cabeçalho (thead)');
    ok(artigos.every((a) => subtitulos(a).length === 0) && !/\b(null|undefined|NaN|true|false)\b|Invalid Date/.test(texto(pdf)), 'panorama (PDF): sem linha de período/meta e sem "null"/"true"/"false"');
    const pdfPassos = tabelaAgrupada(artigos[1]);
    ok(pdfPassos && !pdfPassos.grupos.some((g) => g.erro) && pdfPassos.grupos.length === 1, 'panorama (PDF): título do grupo e a 1ª linha no mesmo tbody');
    const cssBruto = readFileSync(new URL('../src/reports/reports.module.css', import.meta.url), 'utf8');
    ok(/\.printDoc \.dense thead\s*\{\s*display: table-header-group;/.test(cssBruto) && /\.printDoc \.specHead\s*\{\s*break-inside: avoid;/.test(cssBruto),
      'CSS de impressão: thead repetido em cada página e título do grupo que não quebra');
  }
  // --- Avisos recolhidos (mais de 4) ------------------------------------------------------------
  {
    const avisosComp = comparativoOficial.avisos;
    ok(avisosComp.length === 7 && avisosOk(avisosComp, r.comparativo), 'comparativo (7 avisos): 3 na tela + "Ver mais 4 avisos"; todos no PDF em lista compacta');
    const cinco = { ...comparativoOficial, avisos: avisosComp.slice(0, 5) };
    const quatro = { ...comparativoOficial, avisos: avisosComp.slice(0, 4) };
    const h5 = { tela: render([cinco]), pdf: render([cinco], PrintReport) };
    const h4 = { tela: render([quatro]), pdf: render([quatro], PrintReport) };
    ok(avisosOk(cinco.avisos, h5) && texto(h5.tela).includes('Ver mais 2 avisos'), '5 avisos: "Ver mais 2 avisos"');
    ok(avisosOk(quatro.avisos, h4) && !h4.pdf.includes(css.noticeList), '4 avisos: todos em caixas, sem botão nem lista compacta');
    const repetidos = { ...comparativoOficial, avisos: ['Aviso fictício igual.', 'Aviso fictício igual.', 'Outro.', 'Outro.', 'Mais um.'] };
    ok((render([repetidos], PrintReport).match(/<li>/g) || []).length === 5, 'avisos repetidos não somem (chave pela posição)');
  }
  // --- Rótulos das abas e booleanos no celular (fix/panorama-rotulos) ----------------------------
  {
    const botoes = (html) => [...html.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map(([b, t]) => ({ texto: texto(t).trim(), title: b.match(/ title="([^"]*)"/)?.[1] }));
    const desesc = (t) => t?.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
    const par = botoes(r.panoramaPar.tela);
    ok(igual(par.map((b) => b.texto), ['Comparativo de cenários', 'Passos do cenário recomendado']) && par.every((b) => desesc(b.title) === b.texto),
      `abas do panorama com rótulos distintos, na ordem, com title ${JSON.stringify(par.map((b) => b.texto))}`);
    const longo = amostras.tabelaGenericaPlanoSemanal;
    const abasLongo = botoes(render([longo, comparativoOficial]));
    ok(abasLongo[0]?.texto === longo.titulo && desesc(abasLongo[0]?.title) === longo.titulo && longo.titulo.length > 60, `título longo inteiro na aba e no title (${longo.titulo.length} caracteres; o corte é do CSS)`);
    const vazios = [{ ...comparativoOficial, titulo: '' }, { ...comparativoOficial, titulo: '   ' }, (({ titulo: _t, ...b }) => b)(comparativoOficial), { ...comparativoOficial, titulo: null }];
    const abasVazias = vazios.map((b) => botoes(render([b, panoramaOficial]))[0]);
    ok(abasVazias.every((b) => b?.texto === 'Relatório' && b.title === 'Relatório'), `título vazio, só espaços, ausente ou null: aba "Relatório" ${JSON.stringify(abasVazias.map((b) => b?.texto))}`);
    const misto = botoes(r.misto3);
    ok(igual(misto.map((b) => b.texto), [rotuloTipo('convenio'), rotuloTipo('agenda_paciente')]) && misto.every((b) => b.texto !== amostras.agendaPaciente.titulo),
      `outros tipos mantêm o rótulo de antes (só o tipo) ${JSON.stringify(misto.map((b) => b.texto))}`);
    const cssTab = readFileSync(new URL('../src/reports/reports.module.css', import.meta.url), 'utf8').match(/\n\.tab \{([^}]*)\}/)?.[1] ?? '';
    ok(/max-width:/.test(cssTab) && /overflow: hidden;/.test(cssTab) && /text-overflow: ellipsis;/.test(cssTab) && /white-space: nowrap;/.test(cssTab) && /flex-shrink: 0;/.test(cssTab),
      'CSS da aba: largura máxima, reticências e sem quebra de linha (a barra rola na tela estreita)');
    // abaixo_da_meta continua métrica: no celular com rótulo; com meta vira selo, sem meta "Sim"/"Não".
    const rank = amostras.tabelaGenericaRanking;
    const rotuloMeta = rank.dados.colunas.find((c) => c.chave === 'abaixo_da_meta').rotulo;
    const linhasCel = (html) => cartoesCompactos(html).filter((c) => c.rotulo !== 'Total');
    const semMetaCel = linhasCel(r.metaNulaRanking).map((c) => c.pares.find(([k]) => k === rotuloMeta)?.[1]);
    ok(semMetaCel.length === rank.dados.linhas.length && igual(semMetaCel, rank.dados.linhas.map((l) => (l.abaixo_da_meta ? 'Sim' : 'Não'))), `abaixo_da_meta sem meta (celular): "${rotuloMeta}: Sim/Não"`);
    const comMetaCel = linhasCel(r.ranking).map((c) => c.pares.find(([k]) => k === rotuloMeta)?.[1]);
    ok(comMetaCel.length === rank.dados.linhas.length && comMetaCel.every((v) => v && !/^(Sim|Não)$/.test(v)) && linhasCel(r.ranking).every((c) => !/\b(Sim|Não)\b/.test(c.rotulo)),
      'abaixo_da_meta com meta (celular): selo com rótulo, nunca no rótulo do cartão');
  }
  // Pergunta do plano de realocação (sem agrupar_por): modo plano, todas as linhas, sem null.
  {
    const { colunas, linhas } = perguntaOficial.dados;
    const pdf = r.pergunta.pdf;
    ok(!r.pergunta.tela.startsWith('ERRO') && !pdf.startsWith('ERRO') && !r.pergunta.tela.includes(css.groupTable) && !pdf.includes(css.groupTable), 'oficial plano_realocacao (pergunta): modo plano na tela e no PDF');
    ok(colunas.every((c) => texto(pdf).includes(c.rotulo)) && linhas.every((l) => colunas.every((c) => texto(pdf).includes(formatarValor(l[c.chave], c.formato)))), `oficial plano_realocacao (pergunta): ${linhas.length} linhas e ${colunas.length} colunas no PDF`);
    ok(![r.pergunta.tela, pdf].some((h) => /\b(null|undefined|NaN)\b|Invalid Date/.test(texto(h))), 'oficial plano_realocacao (pergunta): nenhum "null", "undefined", "NaN" ou "Invalid Date"');
  }

  for (const [k, { tela, pdf }] of Object.entries(r.invalidos)) {
    ok(tela === r.plano0.tela && pdf === r.plano0.pdf && !tela.includes(css.groupTable), `agrupar_por inválido (${k}): modo plano, HTML idêntico (tela e PDF)`);
  }
  ok(r.agrVazio === r.planoVazio && texto(r.agrVazio).includes('Nenhum resultado'), 'agrupar_por sem linhas: estado vazio igual ao do modo plano');

  const nome = amostras.agendaPaciente.dados.paciente.nome;
  ok(!saida.length, `console vazio durante a renderização${saida.length ? `: ${saida.length} linha(s)` : ''}`);
  ok(!saida.some((l) => l.includes(nome) || l.includes('Paciente Fictício')), 'nome do paciente nunca aparece no console');
  ok(!r.agendaPdf.match(/<title>/) && !texto(r.agenda).includes('Agenda de Paciente') && r.agenda.includes(nome), 'nome do paciente só no corpo do cartão (não no título de aba)');
} finally {
  await server.close();
}

// Boundaries e histórico precisam de DOM: processo próprio (os globais mudariam o SSR acima).
const dom = spawnSync(process.execPath, [fileURLToPath(new URL('./check-render-dom.mjs', import.meta.url))], { stdio: 'inherit' });
if (dom.status !== 0) falhas.push('verificações com DOM (check-render-dom.mjs)');

if (falhas.length) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('\nRenderização dos blocos OK.');
