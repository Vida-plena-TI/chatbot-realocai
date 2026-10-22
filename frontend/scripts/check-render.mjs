// Renderiza os cartões de relatório no Node (SSR do Vite, sem navegador nem dependências novas)
// e confere as regras gerais dos blocos:
//   - tipo desconhecido é ignorado sem erro (sozinho: nada; junto com outro: sem aba extra);
//   - meta null e parcial true não quebram, e o aviso lista os dias não lidos;
//   - "+N linhas" quando linhas_omitidas > 0; resumo mostra `exibicao`;
//   - disponibilidade por dia e especialidade: nenhuma faixa perdida ou duplicada, soma de vagas
//     preservada, especialidade única no dia, subtotal = soma, mesma ordem em todos os dias;
//   - sala em ordem natural dentro do grupo ("Sala 2" antes de "Sala 10");
//   - booleano do JSON vira "Sim"/"Não" (tela, PDF e Excel local); a string "true" fica como veio;
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
  const { agruparFaixas, subtotal } = await server.ssrLoadModule('/src/reports/Disponibilidade.jsx');
  const { diaCompleto: diaCompletoSsr, formatarValor } = await server.ssrLoadModule('/src/reports/format.js');
  const { gerarExcel } = await server.ssrLoadModule('/src/reports/localExport.js');

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
