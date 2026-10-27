// Confere que as fixtures de relatório compartilhadas com o backend são iguais nos dois lados
// (os testes do backend usam a cópia JSON; o front, sampleBlocks.js). Lê fora de frontend/,
// então só roda no monorepo: nunca no build do Docker, cujo contexto é só frontend/.
//
// Uso: npm run check:fixtures   (exit code 1 se alguma cópia diferir ou o backend não estiver acessível)
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as amostras from '../src/reports/sampleBlocks.js';

const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));
// export de sampleBlocks.js → arquivo em backend/chat/tests/fixtures/
const PARES = {
  tabelaGenericaPlanoSemanal: 'chat/tests/fixtures/tabela_generica_plano_semanal.json',
};

if (!existsSync(BACKEND)) {
  console.error(`✗ backend não encontrado em ${BACKEND}: check:fixtures só roda no monorepo (não no build do Docker).`);
  process.exit(1);
}

let falhas = 0;
for (const [nome, rel] of Object.entries(PARES)) {
  const arquivo = `${BACKEND}${rel}`;
  if (!existsSync(arquivo)) {
    falhas++;
    console.error(`✗ ${nome}: backend/${rel} não existe`);
    continue;
  }
  // Compara só a igualdade; nunca imprime o conteúdo das fixtures.
  if (JSON.stringify(JSON.parse(readFileSync(arquivo, 'utf8'))) === JSON.stringify(amostras[nome])) {
    console.log(`✓ ${nome} igual a backend/${rel}`);
  } else {
    falhas++;
    console.error(`✗ ${nome} difere de backend/${rel} (copie a mesma fixture nos dois lados)`);
  }
}

if (falhas) {
  console.error(`\n${falhas} fixture(s) diferente(s) entre front e backend.`);
  process.exit(1);
}
console.log('\nFixtures do front e do backend iguais.');
