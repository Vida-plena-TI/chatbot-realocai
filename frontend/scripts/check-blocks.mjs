// Confere se as fixtures de relatório (src/reports/sampleBlocks.js) têm a mesma forma dos
// blocos reais do RealocAI. Campos derivados de bloco_relatorio.schema.json e dos exemplos
// reais (docs/exemplos-blocos/ no repositório do agente). Sem dependências.
// Também valida contra o JSON Schema copiado em src/reports/contrato/ (tipos, obrigatórios,
// enum, padrões, mínimos e campos extras).
//
// Uso: npm run check:blocks   (exit code 1 se faltar campo ou sobrar campo que o real não tem)
import { readFileSync } from 'node:fs';
import * as amostras from '../src/reports/sampleBlocks.js';
import planoOficial from '../src/reports/contrato/exemplos/tabela_generica_plano_semanal.js';

const SCHEMA = JSON.parse(readFileSync(new URL('../src/reports/contrato/bloco_relatorio.schema.json', import.meta.url), 'utf8'));
// ocupacao_profissional fica só com a conferência de forma: a fixture tem de propósito o dia
// "Sem escala" com percentual null (inconsistência de dados), que o schema não aceita.
const SO_FORMA = new Set(['ocupacao_profissional']);

// Notação: true = campo obrigatório (qualquer valor); {..} = objeto; [{..}] = lista de objetos;
// [] = lista de qualquer coisa. Os objetos do schema não aceitam campos extras.
const DATA_RELATORIO = { data: true, dia_semana: true };
const CONTAGEM = { escalados: true, ocupados: true };
const METRICAS = { ...CONTAGEM, livres: true, percentual: true, abaixo_da_meta: true, slots_para_meta: true };
const ITEM_AGREGADO = { rotulo: true, slots_escalados: true, slots_ocupados: true, percentual: true, abaixo_da_meta: true };
const PROFISSIONAL = { id: true, nome: true, especialidade: true };
const QUALIDADE = {
  profissional: PROFISSIONAL,
  slots_escalados: true,
  slots_ocupados: true,
  vagas_livres: true,
  buracos: true,
  slots_em_buracos: true,
  slots_isolados: true,
  faixas_livres: true,
  maior_faixa_livre: true,
};

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
  disponibilidade: {
    tipo: true,
    minutos_por_janela: true,
    faixas: [
      {
        ...DATA_RELATORIO,
        periodo: true,
        profissional: PROFISSIONAL,
        sala_id: true,
        sala_nome: true,
        posto: true,
        inicio: true,
        fim: true,
        slots: true,
        cabem: true,
      },
    ],
    por_dia: [{ ...DATA_RELATORIO, periodo: true, vagas_livres: true, horas_livres: true, janelas: true }],
  },
  convenio: {
    tipo: true,
    por_convenio: [{ convenio: true, rotulo: true, sessoes: true, pacientes_distintos: true, slots_ocupados: true, aguardando_autorizacao: true }],
    aguardando: [{ ...DATA_RELATORIO, profissional: PROFISSIONAL, sessoes: true }],
  },
  agenda_paciente: {
    tipo: true,
    paciente: { nome: true, convenio: true },
    dias: [
      {
        ...DATA_RELATORIO,
        sessoes: [{ inicio: true, fim: true, profissional_nome: true, especialidade: true, sala_nome: true, aguardando_autorizacao: true }],
        intervalos: [{ inicio: true, fim: true, minutos: true, minutos_de_pausa: true }],
      },
    ],
    total_sessoes: true,
    minutos_em_intervalos: true,
  },
  qualidade_agenda: {
    tipo: true,
    por_profissional: [QUALIDADE],
    por_dia: [{ ...QUALIDADE, ...DATA_RELATORIO }],
  },
  tabela_generica: {
    tipo: true,
    relatorio: true,
    dimensoes: [],
    metricas: [],
    colunas: [{ chave: true, rotulo: true, formato: true }],
    linhas: [],
    total: true,
    linhas_omitidas: true,
  },
};

// --- Validador mínimo de JSON Schema (só as palavras-chave usadas por bloco_relatorio) -------
const resolver = (ref) => ref.replace(/^#\//, '').split('/').reduce((o, k) => o[k], SCHEMA);
const TIPO = {
  string: (v) => typeof v === 'string',
  integer: (v) => Number.isInteger(v),
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  boolean: (v) => typeof v === 'boolean',
  null: (v) => v === null,
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: (v) => Array.isArray(v),
};
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function validar(v, sch, caminho, erros) {
  if (sch.$ref) return validar(v, resolver(sch.$ref), caminho, erros);
  if (sch.anyOf) {
    if (!sch.anyOf.some((alt) => !validar(v, alt, caminho, []).length)) erros.push(`${caminho}: não corresponde a nenhuma alternativa`);
    return erros;
  }
  if (sch.oneOf) {
    const chave = sch.discriminator?.propertyName;
    const mapa = sch.discriminator?.mapping || {};
    if (chave && v && mapa[v[chave]]) return validar(v, { $ref: mapa[v[chave]] }, caminho, erros);
    const ok = sch.oneOf.filter((alt) => !validar(v, alt, caminho, []).length).length;
    if (ok !== 1) erros.push(`${caminho}: corresponde a ${ok} alternativas de oneOf (esperado 1)`);
    return erros;
  }
  if (sch.type && !TIPO[sch.type](v)) {
    erros.push(`${caminho}: esperado ${sch.type}, veio ${JSON.stringify(v)?.slice(0, 40)}`);
    return erros;
  }
  if ('const' in sch && v !== sch.const) erros.push(`${caminho}: esperado ${JSON.stringify(sch.const)}`);
  if (sch.enum && !sch.enum.includes(v)) erros.push(`${caminho}: ${JSON.stringify(v)} fora de ${sch.enum.join('|')}`);
  if (sch.format === 'date' && !DATA_ISO.test(v)) erros.push(`${caminho}: data ISO inválida`);
  if (sch.pattern && !new RegExp(sch.pattern).test(v)) erros.push(`${caminho}: não segue ${sch.pattern}`);
  if (sch.minimum != null && v < sch.minimum) erros.push(`${caminho}: menor que ${sch.minimum}`);
  if (sch.maximum != null && v > sch.maximum) erros.push(`${caminho}: maior que ${sch.maximum}`);
  if (sch.items && Array.isArray(v)) v.forEach((item, i) => validar(item, sch.items, `${caminho}[${i}]`, erros));
  if (TIPO.object(v) && (sch.properties || sch.additionalProperties !== undefined)) {
    const props = sch.properties || {};
    for (const k of sch.required || []) if (!(k in v)) erros.push(`${caminho}.${k}: obrigatório no schema`);
    for (const [k, valor] of Object.entries(v)) {
      if (props[k]) validar(valor, props[k], `${caminho}.${k}`, erros);
      else if (sch.additionalProperties === false) erros.push(`${caminho}.${k}: campo fora do schema`);
      else if (typeof sch.additionalProperties === 'object') validar(valor, sch.additionalProperties, `${caminho}.${k}`, erros);
    }
  }
  return erros;
}

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
  else {
    // periodo pode ser null (bloco sem datas, como o plano semanal); o schema confere o resto.
    conferir(bloco, { ...BASE, ...(bloco.periodo === null && { periodo: true }), dados }, nome, erros);
    if (!SO_FORMA.has(bloco.tipo)) validar(bloco, SCHEMA, nome, erros);
  }
  if (erros.length) {
    falhas += erros.length;
    console.error(`✗ ${nome} (${bloco?.tipo})`);
    erros.forEach((e) => console.error(`    ${e}`));
  } else {
    console.log(`✓ ${nome} (${bloco.tipo}${SO_FORMA.has(bloco.tipo) ? '' : ', schema'})`);
  }
}

// O plano semanal também é exemplo dos testes do backend: as duas cópias precisam ser iguais.
const PLANO_BACKEND = new URL('../../backend/chat/tests/fixtures/tabela_generica_plano_semanal.json', import.meta.url);
const planoIgual = JSON.stringify(JSON.parse(readFileSync(PLANO_BACKEND, 'utf8'))) === JSON.stringify(amostras.tabelaGenericaPlanoSemanal);
if (planoIgual) console.log('✓ tabelaGenericaPlanoSemanal igual à fixture do backend');
else {
  falhas++;
  console.error('✗ tabelaGenericaPlanoSemanal difere de backend/chat/tests/fixtures/tabela_generica_plano_semanal.json');
}

// E tem a forma do exemplo oficial do agente (cópia sincronizada): mesmo envelope, mesmas
// colunas e periodo null. Os valores das linhas podem diferir (a fixture é menor).
const forma = (b) =>
  JSON.stringify({
    envelope: Object.keys(b),
    dados: Object.keys(b.dados),
    periodo: b.periodo,
    colunas: b.dados.colunas,
    tabelas: b.tabelas.map((t) => ({ nome: t.nome, colunas: t.colunas })),
  });
const errosOficial = validar(planoOficial, SCHEMA, 'planoOficial', []);
if (forma(planoOficial) === forma(amostras.tabelaGenericaPlanoSemanal) && planoOficial.periodo === null && !errosOficial.length) {
  console.log('✓ tabelaGenericaPlanoSemanal com a forma do exemplo oficial (envelope, colunas, periodo null)');
} else {
  falhas++;
  console.error('✗ tabelaGenericaPlanoSemanal difere da forma de contrato/exemplos/tabela_generica_plano_semanal.js');
  errosOficial.forEach((e) => console.error(`    ${e}`));
}

if (falhas) {
  console.error(`\n${falhas} problema(s) de contrato nas fixtures.`);
  process.exit(1);
}
console.log('\nFixtures de relatório seguem o contrato do RealocAI.');
