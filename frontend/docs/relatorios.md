# Relatórios no chat

Mockups para revisão: `Relatorios realocAI.dc.html`, no projeto de design. O código fica em `src/reports/`.

## Como funciona

- A mensagem do assistente pode trazer `blocos` (de 1 a 10) além do `content`. O `content` deve ter de 1 a 3 frases de destaque; o cartão mostra o resto.
- Com 1 bloco, o cartão aparece direto. Com 2 ou mais, os cartões ficam em **abas** (as setas ← → do teclado trocam a aba), e uma barra abaixo oferece **Exportar os N relatórios juntos**.
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
| `OcupacaoProfissional.jsx`, `PacientesPorProfissional.jsx`, `OcupacaoAgregada.jsx` | Corpo de cada tipo |
| `ExportBar.jsx` | "Deseja exportar este relatório?" com os estados ocioso, gerando, concluído e erro |
| `PrintReport.jsx` + `print.css` | Documento de impressão do PDF: cabeçalho de registro + os mesmos `ReportCard` (`impressao`), A4 paisagem |
| `localExport.js` | PDF pela impressão do navegador num iframe (mock e API real) e planilha Excel do mock |
| `sampleBlocks.js` | Dados fictícios dos três tipos |

No mock, experimente:
- "ocupação da Helena"
- "ocupação por especialidade"
- "pacientes por profissional"
- "quantos pacientes hoje"
- "relatório completo" (traz os 3 blocos, em abas)
- "ocupação parcial" (estado âmbar; exportar em Excel simula o erro)

## Regras visuais

- Faixas de ocupação: 80% ou mais (a meta do bloco) em verde, de 60% a 79% em âmbar e abaixo de 60% em vermelho. O selo sempre tem texto e ícone (✓ ou ↓).
- **Pacientes por profissional não tem meta.** Por isso usa uma única cor, com 5 intensidades relativas ao maior valor do bloco, sem selos.
- Os números usam `tabular-nums`, alinhados à direita. As barras têm `role="img"` e um texto como "Terça: 68,4%, abaixo da meta". As tabelas usam `caption`/`th scope`, e o foco é visível em todos os botões.

## PDF

- **Cópia visual do cartão do chat.** `imprimirBlocos(blocos, {texto})` renderiza os mesmos `ReportCard` com `impressao` (sem Expandir, exportação, abas nem setas) num iframe oculto e abre a impressão do navegador. Os `<style>` e `<link rel="stylesheet">` do documento atual são copiados para o iframe, então os CSS Modules, os tokens e a Nunito são os do app. A impressão espera as folhas de estilo, as imagens e os pesos da Nunito.
- **Sempre tema claro:** o `<html>` do iframe tem `data-theme="light"`; o tema escuro do chat não vaza.
- **A4 paisagem**, margem de 10 mm: a área útil (277 mm ≈ 1047 px) ativa o layout largo de tabela (> 600 px), como no Expandir. `print-color-adjust: exact` mantém barras, selos e fundos.
- **Ocupação agregada:** sem as abas Especialidade/Sala, os dois agrupamentos saem um depois do outro. Detalhes recolhidos (salas por dia) não entram.
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
| Período | texto ("05/10 a 10/10/2026") | — |
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
