// Confere se as fixtures de relatório (src/reports/sampleBlocks.js) têm a mesma forma dos
// blocos reais do RealocAI. Campos derivados de bloco_relatorio.schema.json e dos exemplos
// reais (docs/exemplos-blocos/ no repositório do agente). Sem dependências.
//
// Uso: npm run check:blocks   (exit code 1 se faltar campo ou sobrar campo que o real não tem)
import * as amostras from '../src/reports/sampleBlocks.js';

// Notação: true = campo obrigatório (qualquer valor); {..} = objeto; [{..}] = lista de objetos;
// [] = lista de qualquer coisa. Os objetos do schema não aceitam campos extras.
const DATA_RELATORIO = { data: true, dia_semana: true };
const CONTAGEM = { escalados: true, ocupados: true };
const METRICAS = { ...CONTAGEM, livres: true, percentual: true, abaixo_da_meta: true, slots_para_meta: true };
const ITEM_AGREGADO = { rotulo: true, slots_escalados: true, slots_ocupados: true, percentual: true, abaixo_da_meta: true };

const BASE = {
  versao: true,
  tipo: true,
  titulo: true,
  periodo: { inicio: true, fim: true },
  meta: true,
  parcial: true,
  dias_nao_lidos: [],
  avisos: [],
  resumo: [{ rotulo: true, valor: true, formato: true, exibicao: true }],
  tabelas: [{ nome: true, colunas: [{ chave: true, rotulo: true, formato: true }], linhas: [] }],
};

const DADOS = {
  ocupacao_profissional: {
    tipo: true,
    profissional: { id: true, nome: true, especialidade: true },
    semana: METRICAS,
    dias: [
      {
        ...METRICAS,
        ...DATA_RELATORIO,
        manha: CONTAGEM,
        tarde: CONTAGEM,
        por_sala_posto: [{ ...CONTAGEM, sala_id: true, sala_nome: true, posto: true }],
      },
    ],
    dias_sem_agenda: [DATA_RELATORIO],
    inconsistencia: true,
  },
  pacientes_por_profissional: {
    tipo: true,
    escopo: true,
    profissionais: [
      {
        id: true,
        nome: true,
        especialidade: true,
        dias: [{ ...DATA_RELATORIO, pacientes: true, sessoes: true, slots_ocupados: true }],
        dias_sem_agenda: [DATA_RELATORIO],
        media_pacientes_por_dia: true,
        pacientes_distintos_semana: true,
      },
    ],
    clinica_por_dia: [{ ...DATA_RELATORIO, pacientes_distintos: true }],
  },
  ocupacao_agregada: {
    tipo: true,
    data: true,
    dia_semana: true,
    por_especialidade: [ITEM_AGREGADO],
    por_sala: [ITEM_AGREGADO],
  },
};

function conferir(valor, spec, caminho, erros) {
  if (spec === true) return;
  if (Array.isArray(spec)) {
    if (!Array.isArray(valor)) return erros.push(`${caminho}: esperada uma lista`);
    if (spec.length) valor.forEach((item, i) => conferir(item, spec[0], `${caminho}[${i}]`, erros));
    return;
  }
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return erros.push(`${caminho}: esperado um objeto`);
  }
  for (const [chave, sub] of Object.entries(spec)) {
    if (!(chave in valor)) erros.push(`${caminho}.${chave}: falta (obrigatório no RealocAI)`);
    else conferir(valor[chave], sub, `${caminho}.${chave}`, erros);
  }
  for (const chave of Object.keys(valor)) {
    if (!(chave in spec)) erros.push(`${caminho}.${chave}: campo que o RealocAI não envia`);
  }
}

let falhas = 0;
for (const [nome, bloco] of Object.entries(amostras)) {
  const dados = DADOS[bloco?.tipo];
  const erros = [];
  if (!dados) erros.push(`tipo desconhecido: ${JSON.stringify(bloco?.tipo)}`);
  else conferir(bloco, { ...BASE, dados }, nome, erros);
  if (erros.length) {
    falhas += erros.length;
    console.error(`✗ ${nome} (${bloco?.tipo})`);
    erros.forEach((e) => console.error(`    ${e}`));
  } else {
    console.log(`✓ ${nome} (${bloco.tipo})`);
  }
}

if (falhas) {
  console.error(`\n${falhas} problema(s) de contrato nas fixtures.`);
  process.exit(1);
}
console.log('\nFixtures de relatório seguem o contrato do RealocAI.');
