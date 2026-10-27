// Monta mensagens do chat com react-dom/client (DOM mínimo de scripts/lib/mini-dom.mjs, sem
// dependências), porque o SSR não executa error boundaries. Confere:
//   - um bloco que quebra ao desenhar vira o cartão "não foi possível exibir", sem conteúdo do
//     bloco nem texto da exceção, e não desmonta o grupo, os blocos vizinhos nem as outras mensagens;
//   - histórico: uma conversa salva com um bloco de periodo null e outro antigo com período mostra os dois;
//   - nada do bloco vai para o console (LGPD).
//
// Roda em processo próprio (os globais de DOM mudariam o SSR do check-render). Chamado pelo
// check:render; sozinho: node scripts/check-render-dom.mjs
import { instalarDom } from './lib/mini-dom.mjs';

const document = instalarDom();
const falhas = [];
// Direto no stdout: o console fica capturado durante a montagem.
const ok = (cond, msg) => {
  process.stdout.write(`${cond ? '✓' : '✗'} ${msg}\n`);
  if (!cond) falhas.push(msg);
};

const { createServer } = await import('vite');
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });

try {
  // react-dom depois dos globais: ele detecta o DOM ao carregar.
  const { createRoot } = await import('react-dom/client');
  const { flushSync } = await import('react-dom');
  const { createElement } = await import('react');
  const { MessageBubble } = await server.ssrLoadModule('/src/components/chat/MessageBubble.jsx');
  const amostras = await server.ssrLoadModule('/src/reports/sampleBlocks.js');

  const montar = (mensagens) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    try {
      flushSync(() => root.render(createElement('div', null, mensagens.map((m) => createElement(MessageBubble, { key: m.id, message: m })))));
    } catch {
      ok(false, 'um erro de renderização desmontou a conversa inteira');
    }
    return { el, root };
  };
  const msg = (id, role, content, blocos) => ({ id, role, content, created_at: '2026-10-27T13:00:00Z', ...(blocos && { blocos }) });
  const fragmentos = (el) => [...(el.childNodes[0]?.childNodes ?? [])].map((n) => n.textContent ?? '');

  const saida = [];
  const originais = {};
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    originais[m] = console[m];
    console[m] = (...a) => saida.push(a.map(String).join(' '));
  }

  // Malformado de propósito: o cabeçalho de ocupacao_profissional lê dados.profissional.nome.
  // Os nomes fictícios no bloco servem para provar que nada dele aparece na tela nem no console.
  const segredo = 'Paciente Fictício Quebrado';
  const quebrado = { ...amostras.ocupacaoProfissional, titulo: segredo, dados: { dias: [{ nome: segredo }], semana: null } };
  const conversa = [
    msg('u1', 'user', 'Convênios da semana?'),
    msg('a1', 'assistant', 'Convênios.', [amostras.convenio]),
    msg('a2', 'assistant', 'Dois relatórios.', [quebrado, amostras.ocupacaoAgregada]),
    msg('a3', 'assistant', 'Só o quebrado.', [quebrado]),
    msg('a4', 'assistant', 'Agregada primeiro.', [amostras.ocupacaoAgregada, quebrado]),
    msg('a5', 'assistant', 'Ranking.', [amostras.tabelaGenericaRanking]),
  ];
  const { el, root } = montar(conversa);
  const [, a1 = '', a2 = '', a3 = '', a4 = '', a5 = ''] = fragmentos(el);
  const total = el.textContent;
  ok(fragmentos(el).length === conversa.length, `bloco quebrado: as ${conversa.length} mensagens continuam montadas`);
  ok((total.match(/Não foi possível exibir este relatório\./g) || []).length === 2, 'bloco quebrado: cartão "não foi possível exibir" só onde o bloco quebrado está ativo (2)');
  ok(a1.includes('Por convênio') && a5.includes(amostras.tabelaGenericaRanking.titulo), 'bloco quebrado: as mensagens vizinhas mostram os seus relatórios');
  ok(a2.includes('Não foi possível exibir') && a2.includes('Ocupação agregada') && a2.includes('Exportar os 2 relatórios juntos?'), 'bloco quebrado na 1ª aba: abas e "Exportar todos" continuam');
  ok(a3.includes('Não foi possível exibir') && a3.includes('Só o quebrado.'), 'bloco quebrado sozinho: o texto da mensagem continua');
  ok(a4.includes('Por especialidade e por sala') && !a4.includes('Não foi possível'), 'bloco quebrado na 2ª aba: a 1ª aba aparece normalmente');
  ok(!total.includes(segredo) && !/TypeError|Cannot read|undefined/.test(total), 'bloco quebrado: nenhum conteúdo do bloco nem texto da exceção na tela');
  flushSync(() => root.unmount());

  // Histórico: conversa salva com um bloco sem datas (plano) e um antigo com período.
  const plano = amostras.tabelaGenericaPlanoSemanal;
  const historico = montar([
    msg('h1', 'user', 'Plano de quarta e quinta'),
    msg('h2', 'assistant', 'Plano pronto.', [plano]),
    msg('h3', 'user', 'E a ocupação agregada?'),
    msg('h4', 'assistant', 'Ocupação agregada.', [amostras.ocupacaoAgregada]),
  ]);
  const [, h2 = '', , h4 = ''] = fragmentos(historico.el);
  ok(plano.periodo === null && h2.includes(plano.titulo) && h2.includes(plano.avisos[0]) && !/\b(null|undefined|NaN)\b|Invalid Date/.test(h2), 'histórico: bloco com periodo null aparece, sem "null" nem "Invalid Date"');
  ok(h4.includes('Quinta, 08/10/2026 · meta 80%') && h4.includes('Por especialidade e por sala'), 'histórico: bloco antigo com período aparece como antes');
  ok(!historico.el.textContent.includes('Não foi possível'), 'histórico: nenhum cartão de erro');
  flushSync(() => historico.root.unmount());

  Object.assign(console, originais);
  if (process.env.DEBUG_DOM) saida.forEach((l) => process.stdout.write(`--- ${l.slice(0, 160)}\n`));
  // O React (dev) avisa que um boundary capturou um erro, com a pilha de componentes.
  ok(!saida.some((l) => l.includes(segredo) || l.includes('Cannot read')), `console sem conteúdo do bloco nem texto da exceção (${saida.length} aviso(s) do React)`);
} finally {
  await server.close();
}

if (falhas.length) {
  console.error(`\n${falhas.length} verificação(ões) com DOM falharam.`);
  process.exit(1);
}
