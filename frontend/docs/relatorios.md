# Relatórios no chat

Mockups para revisão: `Relatorios realocAI.dc.html`, no projeto de design. O código fica em `src/reports/`.

## Como funciona

- A mensagem do assistente pode trazer `blocos` (de 1 a 10) além do `content`. O `content` deve ter de 1 a 3 frases de destaque; o cartão mostra o resto.
- Com 1 bloco, o cartão aparece direto. Com 2 ou mais, os cartões ficam em **abas** (as setas ← → do teclado trocam a aba), e uma barra abaixo oferece **Exportar os N relatórios juntos**.
  A tela só monta o cartão da aba ativa; por isso, com 2 ou mais blocos, o **PDF do próprio cartão**
  (e do modal Expandir) imprime **todos os blocos da resposta**, na ordem, cada um com o seu título, e
  a pergunta avisa ("O PDF inclui os N relatórios desta resposta; o Excel, só este"). O Excel do
  cartão continua só com o bloco dele. Antes, o PDF do cartão saía só com a aba ativa (no panorama,
  só o comparativo).
- **Avisos:** até 4, todos em caixas. Com mais de 4, a tela mostra os 3 primeiros e o resto atrás de
  "Ver mais N avisos" (botão, `aria-expanded`/`aria-controls`; "Ver menos avisos" recolhe); no PDF
  saem todos numa lista compacta, uma linha cada (`.noticeList`). Vale para todo bloco (hoje: o
  comparativo do panorama com 7, pacientes por plano com 7, nomes por profissional com 5).
- O cartão se adapta à **largura do próprio container** (`@container`): até 600 px, usa cartões por dia; acima disso, usa tabela. O mesmo componente serve no widget (380 a 420 px) e na página.
- **Expandir** abre o cartão num modal de até 1100 px de largura.
- Enquanto o agente responde, um esqueleto do cartão aparece se a pergunta parecer um pedido de relatório (`pareceRelatorio`).
- A tela não recalcula números. Ela formata frações (arredondamento half-up, uma casa, vírgula), dá prioridade a `exibicao` quando existe e ordena as barras da ocupação agregada.

| Arquivo | Papel |
| --- | --- |
| `types.js` | Contrato em JSDoc (`Bloco`, `Tabela`, `ItemResumo`…) |
| `format.js` | `pct`, `dec1`, datas dd/mm, faixas, nome do arquivo |
| `ReportGroup.jsx` | Abas, Exportar todos, modal |
| `ReportCard.jsx` | Cabeçalho, avisos, estados (esqueleto, erro, vazio, parcial), exportação |
| `parts.jsx` | Peças comuns: `Seguro` (error boundary), `Avisos`, `ResumoCards`, `Meter`, "Mostrar todas" |
| `PanoramaComparativo.jsx` | Painel do comparativo do panorama de enxugamento (dentro de `TabelaGenerica`) |
| `OcupacaoProfissional.jsx`, `PacientesPorProfissional.jsx`, `OcupacaoAgregada.jsx` | Corpo de cada tipo |
| `Disponibilidade.jsx`, `Convenio.jsx`, `AgendaPaciente.jsx`, `QualidadeAgenda.jsx`, `TabelaGenerica.jsx` | Corpo dos tipos novos (ver [Tipos novos](#tipos-novos)) |
| `contrato/` | Cópia do schema e dos 8 exemplos reais dos tipos novos (dados fictícios), com origem e commit do agente no cabeçalho |
| `ExportBar.jsx` | "Deseja exportar este relatório?" com os estados ocioso, gerando, concluído e erro |
| `PrintReport.jsx` + `print.css` | Documento de impressão do PDF: cabeçalho de registro + os mesmos `ReportCard` (`impressao`), A4 paisagem |
| `localExport.js` | PDF pela impressão do navegador num iframe (mock e API real) e planilha Excel do mock |
| `sampleBlocks.js` | Dados fictícios dos três tipos antigos, os 8 exemplos reais dos novos e variantes (parcial, sem meta, tabela longa) |

No mock, experimente:
- "ocupação da Helena"
- "ocupação por especialidade"
- "pacientes por profissional"
- "quantos pacientes hoje"
- "relatório completo" (traz os 3 blocos, em abas)
- "ocupação parcial" (estado âmbar; exportar em Excel simula o erro)
- "horários vagos", "janelas de 1h30", "disponibilidade parcial"
- "sessões por convênio", "agenda do paciente", "buracos na agenda"
- "ranking de ocupação", "capacidade por especialidade", "relatório personalizado", "tabela sem meta", "tabela longa"
- "relatórios novos" (os 8 exemplos novos em abas) e "bloco desconhecido" (um tipo futuro, que deve sumir)
- "demorado" (resposta em ~25 s, mostra o aviso de demora), "falha" (502) e "sem conexão" (queda de rede)

## Tipos novos

Aditivos na versão 1 do contrato. A fonte da verdade é o repositório do agente
(`docs/exemplos-blocos/`, branch `main`); `npm run sync:contrato` copia schema e exemplos (lista
`EXEMPLOS` em `scripts/sync-contrato.mjs`) para `src/reports/contrato/` sem alterar aquele
repositório, e `npm run sync:contrato -- --check` confere se a cópia está em dia.

**Contrato sincronizado** com `Vida-plena-TI/reallocaai-agente` @ `eccc4c8292c001b8b1d7e0a60f95d5943d3e3e04`
(main, merge do PR #20, panorama em dois blocos): schema com `dados.agrupar_por`, `dados.unidade_grupo` e
`contem_dados_pacientes` no nível do bloco (igual ao do PR #15); exemplos oficiais incluindo
`tabela_generica_pacientes_por_plano`, `tabela_generica_pacientes_por_profissional_nomes`,
`tabela_generica_plano_realocacao`, `tabela_generica_plano_realocacao_pergunta`,
`tabela_generica_panorama_enxugamento_comparativo` e `tabela_generica_panorama_enxugamento`. O sync
também copia a **resposta completa** de exemplo do panorama (bloco json marcado com
`<!-- exemplo-resposta-panorama -->` em `docs/api-relatorios.md` do agente) para
`src/reports/contrato/respostas/panorama_enxugamento.js` (cópia no backend:
`chat/tests/fixtures/resposta_panorama_enxugamento.json`, conferida pelo `check:fixtures`).

- **Abas** (2 ou mais blocos na resposta; `tituloAba` em `format.js`): `tabela_generica` usa o
  `titulo` do bloco (o mesmo do cabeçalho do cartão), sem espaços nas pontas; título ausente, vazio,
  só espaços ou não textual cai em "Relatório". Os outros tipos não mudam (só o tipo; em
  `agenda_paciente` nunca o nome do paciente). Título longo é cortado com reticências pelo CSS
  (`.tab`: até `min(260px, 70vw)`, sem quebra de linha; a barra de abas rola na tela estreita) e fica
  inteiro no atributo `title` do botão. Os nomes das abas do Excel não mudam.
- **Tipo desconhecido é ignorado** (`blocoSuportado` em `ReportCard.jsx`): sem cartão, sem aba e
  fora do "Exportar todos". Um erro ao desenhar um bloco fica no próprio cartão.
- **Comuns:** cartões do `resumo` mostram `exibicao`; aviso âmbar de parcial lista `dias_nao_lidos`;
  `meta: null` não desenha marca nem selo de meta; booleanos viram "Sim"/"Não".
- **Booleano em coluna de formato `"texto"`** (ex.: `recomendado` do comparativo do panorama): o
  booleano JSON `true`/`false` vira "Sim"/"Não" na tela (tabela e cartão do celular), no PDF, no
  Excel local (`gerarExcel`) e no Excel do backend (célula de texto). A string `"true"` fica como veio;
  `null` e `""` viram "—" na tela e célula vazia no Excel. Nunca "true", "false" nem vazio para um booleano.
  No cartão compacto (celular), coluna booleana (ao menos um booleano e só booleanos, `null` ou `""`)
  sai do rótulo do cartão e aparece como as métricas, com o rótulo da coluna ("Recomendado: Sim");
  a tabela larga não muda. `abaixo_da_meta` já era métrica (está em `total`): com meta, selo; sem meta,
  "Abaixo da meta: Sim/Não". `aguardando_autorizacao` não é tabela genérica (selo na agenda do
  paciente, contagem no convênio) e não muda.
- **`disponibilidade`:** resumo por dia (manhã/tarde) e faixas livres por dia, com profissional,
  sala e posto (a partir de 1). Com `minutos_por_janela` > 30, mostra quantos atendimentos cabem.
- **`convenio`:** só contagens, barras de uma cor (sem meta) e a lista de aguardando autorização.
- **`agenda_paciente`:** linha do tempo por dia com sessões e intervalos (com a pausa). É o único bloco
  com nome de paciente: o nome só aparece no corpo do cartão e no PDF. Nunca em console, storage,
  URL, título de aba ou de documento (o PDF se chama `realocai-agenda_paciente-<data>`).
- **`qualidade_agenda`:** valores em slots; a tela converte em minutos (1 slot = 30 min,
  `MINUTOS_POR_SLOT`). Detalhe por dia recolhido no chat e aberto no PDF.
- **`tabela_generica`:** só `dados.colunas`/`linhas`/`total`, na ordem do agente. Colunas fora de
  `total` são as dimensões. Com meta, percentuais ganham barra e `abaixo_da_meta` vira selo.
  `linhas_omitidas` > 0 mostra "+N linhas não exibidas".
- **`tabela_generica` agrupada (`dados.agrupar_por`, opcional):** campos aditivos na `versao` 1, no
  schema sincronizado (hoje em `pacientes_por_profissional_nomes`, no plano de `plano_realocacao` e
  nos passos de `panorama_enxugamento`, este em um nível desde o PR #20 do agente; vêm juntos ou não vêm). O bloco também traz `contem_dados_pacientes: true` no nível do bloco (a tela não usa).
  - `agrupar_por`: lista ordenada de chaves de `dados.colunas` (ex.: `["especialidade",
    "profissional"]`). `unidade_grupo` (opcional): `{"singular": "paciente", "plural": "pacientes"}`.
  - Só agrupa se `agrupar_por` for lista não vazia de textos distintos, todos em `colunas` (pela
    `chave`), houver ao menos uma linha e sobrar ao menos uma coluna no corpo. Qualquer outro caso
    (ausente, tipo errado, coluna inexistente, lista vazia, chave repetida, todas as colunas) é o
    modo plano, com o mesmo HTML de antes, sem erro.
  - **Grupos consecutivos, nunca reordena:** as linhas são lidas na ordem recebida e um grupo novo
    abre quando a combinação de valores das colunas de agrupamento muda em relação à linha anterior.
    Valores iguais não consecutivos viram grupos separados. O agente manda as linhas já contíguas
    e na ordem desejada; nenhuma camada (tela, PDF, Excel, backend) ordena ou junta.
  - Título do grupo: valores unidos por " · " + " (N unidade)" (N em pt-BR; singular com N = 1,
    plural nos demais; sem `unidade_grupo`, só "(N)"). Valor `null`, `""`, só espaços ou `"—"` (o que
    o agente manda nas colunas quando falta o valor, ex.: especialidade ausente) vira
    "Sem <rótulo da coluna em minúsculas>" (ex.: "Sem especialidade"). Ex.: "Terapia Ocupacional ·
    Maria Silva (12 pacientes)". As colunas de agrupamento saem do corpo (ficam só no título); as
    outras mantêm formato e alinhamento.
  - Tela larga: uma tabela só (colunas alinhadas), um `tbody` por grupo com o título
    (`th scope="rowgroup"`) + a primeira linha, igual às faixas da disponibilidade. Celular: título
    do grupo (`h4`) + um cartão por linha com as colunas restantes.
  - **"Mostrar todas" corta por grupo:** grupos inteiros até somar cerca de 15 linhas (sempre o
    primeiro, mesmo maior que 15; nunca um grupo pela metade); o botão mostra o total de linhas.
  - PDF: todas as linhas, `thead` repetido em cada página, título junto com a primeira linha (nunca
    sozinho no fim da página), linhas sem quebra, fonte de 12 px.
  - O Excel não muda: continua escrevendo `tabelas` ("Pacientes", plana, e "Resumo por
    profissional") como vieram. `agrupar_por`/`unidade_grupo` são só apresentação.
- **Plano de realocação (`tabela_generica`, `dados.relatorio: "plano_realocacao"`, PR #16 do
  agente):** sugestão de como abrir espaço para um atendimento deslocando outros pacientes (só
  pelo chat; nada muda na planilha). **Tem nomes de pacientes** (coluna `paciente`) e
  `contem_dados_pacientes: true`: o backend só entrega a superusuários e ao grupo `coordenacao`
  (lista de `chat/services/sensitive.py`, igualdade exata). `periodo` e `meta` são `null`. Dois
  formatos com o mesmo `relatorio`:
  - **Plano** ("Plano de realocação (grade semanal vigente)"): colunas `opcao` (texto,
    "Opção 1"…), `passo` (inteiro), `paciente` ("Quem"), `terapia`, `profissional`, `de`, `para`,
    `observacao`; até 3 opções, linhas contíguas por opção na ordem de execução, com
    `agrupar_por: ["opcao"]` e `unidade_grupo: {"singular": "passo", "plural": "passos"}`. A tela
    usa o modo agrupado sem nada específico: título **"Opção 1 (3 passos)"**, o formato
    "valor (N unidade)" que a documentação do agente passou a descrever (commit `08245ae`). Excel: abas
    "Passos" e "Resumo por opção". Sem opção: mesmas colunas, `linhas` vazia ou uma linha
    "Fora da janela pedida".
  - **Pergunta** ("Plano de realocação: qual paciente?", nome ambíguo): sem agrupamento, modo
    plano; colunas `candidata`, `paciente` ("Nome"), `terapia`, `profissional`, `dias`. Excel: aba
    "Candidatas".
- **Panorama de enxugamento (`tabela_generica`, `dados.relatorio: "panorama_enxugamento"`, PR #18 e
  PR #20 do agente):** cenários de movimentação que liberam turnos com presença paga na grade
  semanal vigente (tool `planejar_enxugamento`, só pelo chat; nada muda na planilha). Desde
  2026-11-23 a resposta traz **dois blocos `tabela_generica`, nesta ordem**, os dois com o mesmo
  `relatorio`, `contem_dados_pacientes: true`, `periodo`/`meta` `null`, `total` `{}`, e a resposta
  com `resposta_sensivel: true`. A tela desenha um cartão por bloco (duas abas, na ordem recebida),
  cada um com o seu resumo (KPIs). **O bloco de passos tem nomes de pacientes (coluna `paciente`,
  rótulo "Quem") e de profissionais (`turno_liberado`, `de`, `para`): sensível de RH.** A regra em
  `chat/services/sensitive.py` (igualdade exata do `relatorio`) cobre os dois blocos: só
  superusuários e o grupo `coordenacao` recebem; para os outros os dois blocos são cortados e o texto
  vira o texto fixo (também quando o agente responde só com texto e `resposta_sensivel: true`).
  1. **Comparativo** ("Comparativo de cenários"): uma linha por cenário, só números, **sem
     `agrupar_por`** (modo plano). Colunas `cenario` (texto, "Cenário 1 · equilibrado"),
     `turnos_liberados`, `passos`, `profissionais_afetadas`, `pacientes_movidos`,
     `trocam_de_profissional`, `trocam_de_dia`, `passos_iguais_ao_recomendado` (inteiros) e
     `recomendado` (booleano JSON em coluna `"texto"`: "Sim"/"Não"). Excel: aba **"Cenários"**.
     - **Painel** (`PanoramaComparativo.jsx`, só com `relatorio === "panorama_enxugamento"` e as
       colunas `cenario`, `turnos_liberados`, `passos` e `pacientes_movidos`; sem elas, a tabela comum):
       uma linha por cenário com o nome, selo **"Recomendado"** (texto + ícone, só com o booleano JSON
       `true`; `"true"`, `1` ou ausente não contam) e destaque por borda de 2 px e fundo menta (não só
       cor); barras horizontais em CSS puro de "Turnos liberados" e "Pacientes movidos", cada uma na
       escala do maior valor entre os cenários, com o número escrito ao lado e `role="img"`
       (valor ausente/não numérico: "—" e barra vazia; máximo 0: barras vazias); chips com passos,
       profissionais afetadas, trocam de profissional, trocam de dia e, quando as colunas existirem,
       `profissionais_sem_atendimento` e `turnos_sem_profissional`, sempre com o `rotulo` da coluna.
       `passos_iguais_ao_recomendado` fica só na tabela. A tabela completa fica atrás de "Ver tabela
       completa" (`aria-expanded`). No celular as barras empilham na largura toda, sem rolagem lateral.
     - **PDF do painel:** o painel (nome, selo, barras) e, abaixo, a tabela completa. Os chips **não**
       saem no PDF: repetiriam os números da tabela e alongariam o documento. O preenchimento da barra
       é uma borda (`border-top`), que os navegadores imprimem mesmo sem "gráficos de fundo", com
       `print-color-adjust: exact`; o número escrito é o fallback.
     - Error boundary próprio: se o painel quebrar, aparece a tabela comum; se ela também quebrar,
       o "não foi possível mostrar" do cartão. Fixture `tabelaGenericaPanoramaComparativoColunasNovas`
       (colunas opcionais, valores fictícios).
  2. **Passos** ("Passos do cenário recomendado"): agrupamento em **um nível**, `agrupar_por:
     ["cenario"]`, `unidade_grupo: {"singular": "passo", "plural": "passos"}`. Colunas `cenario`
     ("Cenário 1 · equilibrado · libera 3 turnos", sem o código interno), `turno_liberado`, `passo`
     (inteiro), `paciente` ("Quem"), `terapia`, `de`, `para`, `tipo_de_movimento` (antes `alavanca`) e
     `observacao` (`""` no caso padrão: "—" na tela, célula vazia no Excel). Título do grupo
     "Cenário 1 · equilibrado · libera 3 turnos (4 passos)"; a coluna do cenário sai do corpo.
     Excel: aba **"Passos"** (plana, com `cenario`).
     - **Detalhe de outro cenário:** o título do bloco pode vir "Passos do Cenário N (apenas o que
       difere do Cenário 1)" (ou "Passos do Cenário N", com os passos completos) e os números de passo
       podem ter saltos (1, 3, 4): são os do cenário inteiro. A tela mostra como vieram. Fixture fictícia
       `tabelaGenericaPanoramaPassosDetalhe` (cópia no backend).
  - A aba "Resumo dos cenários" deixou de existir (substituída pelo comparativo). Exportando os dois
    blocos juntos, as abas são "Cenários (1)" e "Passos (2)" (sufixo por bloco, como sempre).
- **Listas longas:** no chat, as primeiras linhas e "Mostrar todas"; no PDF, tudo.
- **Verificação:** `npm run check:blocks` valida as fixtures e todos os exemplos oficiais contra o
  schema copiado completo (inclusive `agrupar_por`, `unidade_grupo` e `contem_dados_pacientes`),
  confere que `tabelaGenericaPlanoSemanal` e `tabelaGenericaPacientesNomesAgrupada` têm a forma do
  exemplo oficial correspondente (envelope, colunas, tabelas e campos opcionais; o tamanho pode
  diferir) e que as colunas de agrupamento trazem texto e grupos contíguos (só lê `frontend/`: roda
  no build do Docker); `npm run check:fixtures` confere as cópias do backend (só no monorepo);
  `npm run check:render` renderiza os cartões no Node (SSR do Vite) e confere tipo desconhecido,
  `meta: null`, `parcial`, "+N linhas", console vazio e as invariantes do modo agrupado (soma das
  linhas e dos N dos títulos = total, ordem recebida na tela e no PDF, colunas de agrupamento fora
  do corpo, títulos sem "null", singular/plural, grupos não consecutivos separados, corte só entre
  grupos e `agrupar_por` inválido = HTML do modo plano), na fixture de 800 linhas e nos exemplos
  oficiais de `pacientes_por_profissional_nomes`, `plano_realocacao` e dos passos do panorama (com
  os grupos esperados calculados à parte; o plano também com uma variante de 1 passo para o
  singular e os títulos exatos "Opção N (3 passos)"; o panorama com o título exato "Cenário 1 ·
  equilibrado · libera 3 turnos (4 passos)", a variante de 1 passo e o detalhe de outro cenário);
  a pergunta do plano e o comparativo do panorama saem no modo plano (o comparativo com
  "Sim"/"Não" na tela, no celular, no PDF e no Excel local); a resposta completa do panorama sai em
  duas abas e no PDF com os dois cartões, cada um com o seu resumo, `thead` e sem período. Com DOM
  (`check-render-dom.mjs`), um bloco do panorama quebrado em qualquer posição não derruba o outro.
  `check:blocks` também confere a resposta completa (dois blocos iguais aos exemplos, na ordem, com
  `resposta_sensivel: true`).

### Pendências

- ~~Título do grupo em dois níveis (panorama de enxugamento)~~: resolvido pelo agente (PR #20): os
  passos agrupam em um nível, com o título por cenário "… libera 3 turnos (4 passos)".
- ~~Texto sem bloco do panorama~~: resolvido com o marcador `resposta_sensivel` (ver AGENTS.md).
- ~~Abas com o mesmo rótulo~~ e ~~Recomendado sem rótulo no celular~~: resolvidos (branch
  `fix/panorama-rotulos`; ver "Abas" e "Booleano em coluna de formato `"texto"`").
- **Exportação do panorama:** o contrato do agente pede revisão de como o bloco sai no Excel e no
  PDF antes de liberar. Hoje sai como os outros blocos sensíveis (só coordenação/superusuários; o
  Excel completo com nomes de pacientes e de profissionais). Confirmar com o dono do produto.
- ~~Separador do título do grupo no plano de realocação~~: resolvido; a documentação do agente
  passou a usar "Opção 1 (3 passos)" (commit `08245ae`).

## Regras visuais

- Faixas de ocupação: 80% ou mais (a meta do bloco) em verde, de 60% a 79% em âmbar e abaixo de 60% em vermelho. O selo sempre tem texto e ícone (✓ ou ↓).
- **Pacientes por profissional não tem meta.** Por isso usa uma única cor, com 5 intensidades relativas ao maior valor do bloco, sem selos.
- **Contraste (tokens atuais, tema claro, sobre `--surface`):** `--text` 13,3:1, `--muted` 5,6:1,
  `--brand-text` 5,5:1; `--brand-ink` sobre `--mint` 8,3:1 (selo "Recomendado" e texto do destaque);
  barra `--brand` sobre `--track` 4,6:1 (gráfico: mínimo 3:1). Atenção: `--faint` sobre branco dá
  4,4:1, um pouco abaixo de 4,5:1 (não usar em texto pequeno); `--mint-line` (1,5:1) e `--teal` sobre
  `--track` (2,8:1) não servem como único indicador.
- Os números usam `tabular-nums`, alinhados à direita. As barras têm `role="img"` e um texto como "Terça: 68,4%, abaixo da meta". As tabelas usam `caption`/`th scope`, e o foco é visível em todos os botões.

## PDF

- **Cópia visual do cartão do chat.** `imprimirBlocos(blocos, {texto})` renderiza os mesmos `ReportCard` com `impressao` (sem Expandir, exportação, abas nem setas) num iframe oculto e abre a impressão do navegador. Os `<style>` e `<link rel="stylesheet">` do documento atual são copiados para o iframe, então os CSS Modules, os tokens e a Nunito são os do app. A impressão espera as folhas de estilo, as imagens e os pesos da Nunito.
- **Sempre tema claro:** o `<html>` do iframe tem `data-theme="light"`; o tema escuro do chat não vaza.
- **A4 paisagem**, margem de 10 mm: a área útil (277 mm ≈ 1047 px) ativa o layout largo de tabela (> 600 px), como no Expandir. `print-color-adjust: exact` mantém barras, selos e fundos.
- **Ocupação agregada:** sem as abas Especialidade/Sala, os dois agrupamentos saem um depois do outro. Detalhes recolhidos (salas por dia) não entram.
- **Tipos novos:** tabelas inteiras (fonte menor, texto quebra em vez de cortar coluna), `thead` repetido, linhas, dias da agenda e cartões sem quebra no meio; sem "Mostrar todas".
- **Respostas com abas:** o PDF do cartão leva todos os blocos da resposta (ver "Como funciona").
- Cada bloco começa numa página nova, com o cabeçalho de registro (logo, "Vida Plena · Espaço Multidisciplinar", "Gerado em dd/mm/aaaa às hh:mm"). O texto de destaque da mensagem do assistente (sem o bloco de proposta; nunca a pergunta do usuário) vem uma vez, antes do primeiro bloco. Esse texto fica no navegador: não vai para o backend.
- Bloco maior que uma página continua na seguinte: quebra só entre linhas de tabela (`break-inside: avoid`), com o `thead` repetido.
- O `<title>` do documento é `realocai-<tipo>-<AAAA-MM-DD>` (ou `realocai-relatorios-…`), que os navegadores sugerem como nome do PDF.
- **Limite aceito:** o cabeçalho e o rodapé do navegador (URL, data, numeração) são opções do diálogo de impressão ("Cabeçalhos e rodapés"); o código não os remove.

## Especificação do Excel

Nome do arquivo: `realocai-<tipo>-<AAAA-MM-DD>.xlsx`. Com vários blocos: `realocai-relatorios-<AAAA-MM-DD>.xlsx`.

**Aba "Resumo"**, com uma linha por bloco:

| Coluna | Tipo | Formato |
| --- | --- | --- |
| Relatório | texto (`titulo`) | — |
| Período | texto ("05/10 a 10/10/2026"); vazio com `periodo` null (plano semanal) | — |
| Meta | número (0.8) | `0,0%` |
| Gerado em | data real | `dd/mm/aaaa` |
| Avisos | texto (avisos + "Dados parciais", separados por " \| ") | — |

**Uma aba por item de `tabelas`:**
- O nome da aba é `tabela.nome`, com no máximo 31 caracteres e sem `\ / ? * [ ] :`.
- Se houver vários blocos, o nome ganha o sufixo " (n)". Nomes repetidos ganham numeração.
- As colunas seguem `colunas[]` na ordem: `rotulo` vira o cabeçalho, e `chave` indica onde ler o valor em `linhas[]`.

Formatos por `coluna.formato`:

| formato | Célula | Formato numérico | Largura |
| --- | --- | --- | --- |
| `percentual` | número (fração 0 a 1) | `0,0%` | 10 |
| `inteiro` | número inteiro | `0` | 10 |
| `decimal` | número | `0,0` | 10 |
| `data` | data real (vinda da ISO) | `dd/mm/aaaa` | 12 |
| `texto` | texto | — | 22 a 40 (pelo conteúdo) |

Em todas as abas:
- Cabeçalho em negrito, com fundo `#E6F3EF`.
- **Primeira linha congelada.**
- Larguras ajustadas ao conteúdo.
- Valor vazio vira célula vazia, nunca "—".

O gerador do mock (`localExport.js`) segue esta especificação em formato SpreadsheetML (`.xls`), só para demonstração. A versão final em `.xlsx` deve vir do backend (por exemplo, com openpyxl).

## Tokens

Os tokens ficam em `src/styles/tokens.css`. O tema escuro usa `:root[data-theme='dark']`, alternado pelo botão no cabeçalho, e a preferência fica salva em `localStorage`.

| Papel | Claro | Escuro |
| --- | --- | --- |
| Fundo / superfície | `#F6F4F1` / `#FFFFFF` | `#151C1A` / `#1C2422` |
| Texto / secundário | `#26322F` / `#5F6A67` | `#E6ECEA` / `#A9B4B0` |
| Linha | `#ECE7E3` | `#2D3835` |
| Marca (botões) / marca (texto) | `#287564` / `#287564` | `#2B8571` / `#62C4AC` |
| Trilho das barras | `#EDE9E6` | `#2A3431` |
| Meta atingida (fundo, texto, barra) | `#E3F1EA`, `#1D6542`, `#2E8B57` | `#173426`, `#8FDCB2`, `#45BC7C` |
| Atenção, 60 a 79% | `#FDF1DC`, `#7A4F00`, `#D99A1E` | `#3A2E14`, `#F1C66E`, `#E0A93A` |
| Abaixo de 60% | `#FCE8E4`, `#A3361F`, `#C8492F` | `#3D221D`, `#F4A190`, `#E46D55` |
| Mapa de calor 1→5 | `#EEF6F3` `#D5EDE6` `#A9D8CB` `#6FBCA9` `#287564` | `#1D2C29` `#22433C` `#2B6156` `#3F8D7D` `#7FD3BF` |

- **Tipografia:** Nunito, com pesos de 400 a 900 e `tabular-nums` nos números. O percentual principal usa 46 px/900 (40 px no widget), o título do cartão 18 px/900, o texto 13,5 a 15 px e os rótulos 11 a 12 px/800.
- **Espaçamento e raios:** o padding do cartão é 16 a 18 px (14 px no compacto), o espaço entre linhas é de 8 a 12 px e o raio do cartão é 22 px. Sub-cartões usam 16 px, células do mapa de calor 9 px e selos e botões são em formato de pílula.

## Decisões em aberto

1. **Endpoint de exportação:** proposta de `POST /api/reports/export/ {formato, blocos}` devolvendo o arquivo com `Content-Disposition`. A alternativa é exportar por `message_id` + índice, sem reenviar os blocos.
2. **Onde vêm os blocos:** proposta de um campo `blocos` em `assistant_message`, tanto no `POST messages/` quanto no `GET messages/`, para que o histórico reabra com os cartões.
3. **Dias não lidos:** `parcial` só diz que faltam dados. A proposta é um campo `dias_nao_lidos: [ISO]` para listar os dias na faixa âmbar.
4. **Faixa de cor:** hoje a tela classifica pelas faixas de 80% e 60%. Se o backend mandar `faixa` por item, a tela não precisa decidir nada.
5. **Paginação do PDF:** "Página X de Y" só é possível com geração no servidor (WeasyPrint ou Playwright com cabeçalho e rodapé). A impressão pelo navegador não numera.
6. **Nome da clínica no PDF:** "Vida Plena · Espaço Multidisciplinar" foi assumido. Confirmar.
7. **Excel com vários blocos:** um arquivo com "Resumo" + abas sufixadas (o padrão atual) ou um arquivo por bloco.
8. **Intensidade do mapa de calor:** hoje é relativa ao maior valor do bloco. Outra opção é usar uma escala fixa da clínica, para comparar semanas.
9. **Widget:** o modal Expandir abre sobre o sistema hospedeiro. Precisa confirmar se o widget pode cobrir a página inteira.
