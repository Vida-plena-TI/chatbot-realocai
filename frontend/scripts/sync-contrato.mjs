// Copia o contrato dos blocos (schema + exemplos com dados FICTÍCIOS + respostas completas de
// exemplo da documentação) do repositório do agente para src/reports/contrato/, com a origem e o commit no cabeçalho. Só lê o outro repositório
// (`git show`); nunca faz checkout, commit ou push nele.
//
// Uso: node scripts/sync-contrato.mjs [--check] [caminho-do-clone] [ref]
//      padrão: ~/dev/reallocaai-agente  origin/main
//
// Conferir (não escreve nada; exit 1 e lista os arquivos que diferem):
//      git -C ~/dev/reallocaai-agente fetch origin
//      npm run sync:contrato -- --check
// Sincronizar (sobrescreve src/reports/contrato/ com o ref; revise o diff e commite):
//      git -C ~/dev/reallocaai-agente fetch origin
//      npm run sync:contrato
//      npm run check:blocks && npm run check:render
// Para outro ref (ex.: uma branch do agente ainda não mesclada):
//      npm run sync:contrato -- --check ~/dev/reallocaai-agente origin/<branch>
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2).filter((a) => a !== '--check');
const check = process.argv.includes('--check');
const repo = args[0] || join(homedir(), 'dev', 'reallocaai-agente');
const ref = args[1] || 'origin/main';
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'reports', 'contrato');
const PASTA = 'docs/exemplos-blocos';

// Os exemplos dos tipos novos (o plano semanal, os pacientes por plano, os nomes de pacientes
// por profissional, o plano de realocação e o panorama de enxugamento vêm com periodo null; os
// quatro últimos com contem_dados_pacientes; o de nomes, o plano de realocação e os passos do
// panorama (um nível, por cenário) com agrupar_por/unidade_grupo; a pergunta do plano de realocação e o
// quadro comparativo do panorama sem eles). Os 3 tipos antigos seguem com as fixtures de sampleBlocks.js.
export const EXEMPLOS = [
  'disponibilidade_vagas',
  'disponibilidade_janelas',
  'convenio',
  'agenda_paciente',
  'qualidade_agenda',
  'tabela_generica_ranking',
  'tabela_generica_capacidade',
  'tabela_generica_personalizado',
  'tabela_generica_plano_semanal',
  'tabela_generica_pacientes_por_plano',
  'tabela_generica_pacientes_por_profissional_nomes',
  'tabela_generica_plano_realocacao',
  'tabela_generica_plano_realocacao_pergunta',
  'tabela_generica_panorama_enxugamento_comparativo',
  'tabela_generica_panorama_enxugamento',
];

const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const commit = git('rev-parse', ref).trim();
const origem = `Vida-plena-TI/reallocaai-agente @ ${commit} (${ref.replace(/^origin\//, '')})`;

const arquivos = {};
const schema = JSON.parse(git('show', `${commit}:${PASTA}/bloco_relatorio.schema.json`));
arquivos['bloco_relatorio.schema.json'] = `${JSON.stringify(
  { $comment: `Cópia sem alteração de ${PASTA}/bloco_relatorio.schema.json em ${origem}. Atualize com scripts/sync-contrato.mjs.`, ...schema },
  null,
  2,
)}\n`;
for (const nome of EXEMPLOS) {
  const bloco = JSON.parse(git('show', `${commit}:${PASTA}/${nome}.json`));
  arquivos[`exemplos/${nome}.js`] = `// Exemplo real de bloco do RealocAI, copiado sem alteração. Dados FICTÍCIOS.
// Origem: ${origem}
// Arquivo: ${PASTA}/${nome}.json. Atualize com scripts/sync-contrato.mjs; não edite à mão.
export default ${JSON.stringify(bloco, null, 2)};
`;
}

// Respostas completas do POST /agenda/chat (texto + blocos + resposta_sensivel), tiradas dos blocos
// ```json marcados com <!-- marcador --> na documentação do agente. Dados FICTÍCIOS.
export const RESPOSTAS = [['panorama_enxugamento', 'docs/api-relatorios.md', 'exemplo-resposta-panorama']];
for (const [nome, doc, marcador] of RESPOSTAS) {
  const md = git('show', `${commit}:${doc}`);
  const inicio = md.indexOf(`<!-- ${marcador} -->`);
  const bloco = inicio < 0 ? null : md.slice(inicio).match(/```json\n([\s\S]*?)\n```/);
  if (!bloco) throw new Error(`${doc}: exemplo <!-- ${marcador} --> não encontrado em ${ref}`);
  arquivos[`respostas/${nome}.js`] = `// Exemplo real de resposta do POST /agenda/chat do RealocAI, copiado sem alteração. Dados FICTÍCIOS.
// Origem: ${origem}
// Arquivo: ${doc} (bloco json marcado com <!-- ${marcador} -->). Atualize com scripts/sync-contrato.mjs;
// não edite à mão.
export default ${JSON.stringify(JSON.parse(bloco[1]), null, 2)};
`;
}

let diferentes = 0;
for (const [rel, conteudo] of Object.entries(arquivos)) {
  const alvo = join(destino, rel);
  if (check) {
    let atual = '';
    try { atual = readFileSync(alvo, 'utf8'); } catch { /* ausente */ }
    if (atual !== conteudo) {
      diferentes++;
      console.error(`✗ ${rel} difere de ${ref}`);
    }
  } else {
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
    console.log(`✓ ${rel}`);
  }
}
if (check && diferentes) process.exit(1);
console.log(check ? `Contrato em dia com ${origem}.` : `Contrato copiado de ${origem}.`);
