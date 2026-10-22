// Copia o contrato dos blocos (schema + exemplos com dados FICTÍCIOS) do repositório do agente
// para src/reports/contrato/, com a origem e o commit no cabeçalho. Só lê o outro repositório
// (`git show`); nunca faz checkout, commit ou push nele.
//
// Uso: node scripts/sync-contrato.mjs [caminho-do-clone] [ref]
//      padrão: ~/dev/reallocaai-agente  origin/feature/relatorios-gerais
//      --check: só confere se as cópias batem com o ref (exit 1 se não)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2).filter((a) => a !== '--check');
const check = process.argv.includes('--check');
const repo = args[0] || join(homedir(), 'dev', 'reallocaai-agente');
const ref = args[1] || 'origin/feature/relatorios-gerais';
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'reports', 'contrato');
const PASTA = 'docs/exemplos-blocos';

// Os 8 exemplos dos tipos novos. Os 3 tipos antigos seguem com as fixtures de sampleBlocks.js.
export const EXEMPLOS = [
  'disponibilidade_vagas',
  'disponibilidade_janelas',
  'convenio',
  'agenda_paciente',
  'qualidade_agenda',
  'tabela_generica_ranking',
  'tabela_generica_capacidade',
  'tabela_generica_personalizado',
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
