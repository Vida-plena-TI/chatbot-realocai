// Simula o contexto do build do Docker (Easypanel): copia só frontend/ para um diretório
// temporário fora do repositório, sem o que o .dockerignore exclui (node_modules, dist, .env
// locais...), e roda o mesmo que o Dockerfile: npm ci, check:blocks, build e a busca da
// origem da API no bundle. Qualquer leitura fora de frontend/ (ex.: ../backend) falha aqui.
// Rode antes de qualquer merge que toque em frontend/scripts, package.json ou no Dockerfile.
//
// Uso: npm run check:docker-context [-- --keep]   (--keep mantém o diretório temporário)
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Valores públicos de produção (vão para o bundle; nunca segredos).
const VITE_API_BASE_URL = 'https://api-chat.vidaplenamulti.com.br';
const VITE_USE_MOCK = 'false';

const origem = fileURLToPath(new URL('..', import.meta.url));
const manter = process.argv.includes('--keep');

// .dockerignore com só nomes e "*" (o que o arquivo usa); vale para qualquer nível.
const padroes = readFileSync(join(origem, '.dockerignore'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((p) => new RegExp(`^${p.replace(/^\//, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`));
const ignorado = (caminho) => {
  const rel = relative(origem, caminho);
  return rel !== '' && (padroes.some((re) => re.test(rel)) || rel.split(sep).some((parte) => padroes.some((re) => re.test(parte))));
};

// Diretório novo e vazio em volta da cópia: ../backend, ../docs etc. nunca existem lá.
const base = mkdtempSync(join(tmpdir(), 'frontend-docker-context-'));
const destino = join(base, 'frontend');
const passo = (titulo, cmd, args) => {
  console.log(`\n▶ ${titulo}`);
  execFileSync(cmd, args, {
    cwd: destino,
    stdio: 'inherit',
    // Como no Dockerfile: NODE_ENV=production e as variáveis VITE_* do build.
    env: { ...process.env, NODE_ENV: 'production', VITE_API_BASE_URL, VITE_USE_MOCK },
  });
};

let ok = false;
try {
  cpSync(origem, destino, { recursive: true, filter: (src) => !ignorado(src) });
  console.log(`Contexto copiado para ${destino} (${readdirSync(destino).sort().join(', ')})`);
  passo('npm ci', 'npm', ['ci', '--include=dev', '--no-audit', '--no-fund']);
  passo('npm run check:blocks', 'npm', ['run', 'check:blocks']);
  passo('npm run build', 'npm', ['run', 'build']);
  const assets = join(destino, 'dist', 'assets');
  const achou = readdirSync(assets).some((f) => readFileSync(join(assets, f), 'utf8').includes(VITE_API_BASE_URL));
  if (!achou) throw new Error('origem da API não encontrada no bundle');
  console.log(`\n✓ origem da API (${VITE_API_BASE_URL}) no bundle`);
  ok = true;
} catch (e) {
  console.error(`\n✗ build no contexto do Docker falhou: ${e.message.split('\n')[0]}`);
} finally {
  if (manter) console.log(`Diretório mantido: ${destino}`);
  else rmSync(base, { recursive: true, force: true });
}

if (!ok) process.exit(1);
console.log('Build no contexto do Docker (só frontend/) OK.');
