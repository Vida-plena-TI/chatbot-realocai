// Confere se as fixtures de relatório (src/reports/sampleBlocks.js) têm a mesma forma dos
// blocos reais do RealocAI. Campos derivados de bloco_relatorio.schema.json e dos exemplos
// reais (docs/exemplos-blocos/ no repositório do agente). Sem dependências.
// Também valida contra o JSON Schema copiado em src/reports/contrato/ (tipos, obrigatórios,
// enum, padrões, mínimos e campos extras).
//
// Roda no build do Docker (contexto: só frontend/), então lê apenas arquivos de frontend/. A
// comparação com as cópias do backend fica em check-fixtures.mjs (só no monorepo).
//
// Uso: npm run check:blocks   (exit code 1 se faltar campo ou sobrar campo que o real não tem)
import { readdirSync, readFileSync } from 'node:fs';
import * as amostras from '../src/reports/sampleBlocks.js';
import planoOficial from '../src/reports/contrato/exemplos/tabela_generica_plano_semanal.js';
import nomesOficial from '../src/reports/contrato/exemplos/tabela_generica_pacientes_por_profissional_nomes.js';

const SCHEMA = JSON.parse(readFileSync(new URL('../src/reports/contrato/bloco_relatorio.schema.json', import.meta.url), 'utf8'));
// ocupacao_profissional fica só com a conferência de forma: a fixture tem de propósito o dia
// "Sem escala" com percentual null (inconsistência de dados), que o schema não aceita.
const SO_FORMA = new Set(['ocupacao_profissional']);

// Notação: true = campo obrigatório (qualquer valor); {..} = objeto; [{..}] = lista de objetos;
// [] = lista de qualquer coisa; OPCIONAL = pode faltar (aditivo na versao 1; o schema confere o
// tipo). Os objetos do schema não aceitam campos extras.
const OPCIONAL = Symbol('opcional');
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
  // No nível do bloco, só nos blocos com nomes de pacientes (sempre true).
  contem_dados_pacientes: OPCIONAL,
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
    // Exibição agrupada (hoje só em pacientes_por_profissional_nomes); sempre juntos.
    agrupar_por: OPCIONAL,
    unidade_grupo: OPCIONAL,
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
  if (sch.minItems != null && v.length < sch.minItems) erros.push(`${caminho}: menos de ${sch.minItems} item(ns)`);
  if (sch.minLength != null && v.length < sch.minLength) erros.push(`${caminho}: texto com menos de ${sch.minLength} caractere(s)`);
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
  if (spec === true || spec === OPCIONAL) return;
  if (Array.isArray(spec)) {
    if (!Array.isArray(valor)) return erros.push(`${caminho}: esperada uma lista`);
    if (spec.length) valor.forEach((item, i) => conferir(item, spec[0], `${caminho}[${i}]`, erros));
    return;
  }
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return erros.push(`${caminho}: esperado um objeto`);
  }
  for (const [chave, sub] of Object.entries(spec)) {
    if (!(chave in valor)) {
      if (sub !== OPCIONAL) erros.push(`${caminho}.${chave}: falta (obrigatório no RealocAI)`);
    } else conferir(valor[chave], sub, `${caminho}.${chave}`, erros);
  }
  for (const chave of Object.keys(valor)) {
    if (!(chave in spec)) erros.push(`${caminho}.${chave}: campo que o RealocAI não envia`);
  }
}

let falhas = 0;
const relatar = (nome, tipo, erros, extra = '') => {
  if (erros.length) {
    falhas += erros.length;
    console.error(`✗ ${nome} (${tipo})`);
    erros.forEach((e) => console.error(`    ${e}`));
  } else {
    console.log(`✓ ${nome} (${tipo}${extra})`);
  }
};
// Forma (campos obrigatórios e opcionais conhecidos) e, fora de SO_FORMA, o schema completo,
// inclusive agrupar_por, unidade_grupo e contem_dados_pacientes. Nunca imprime linhas.
const conferirBloco = (nome, bloco) => {
  const dados = DADOS[bloco?.tipo];
  const erros = [];
  if (!dados) erros.push(`tipo desconhecido: ${JSON.stringify(bloco?.tipo)}`);
  else {
    // periodo pode ser null (bloco sem datas, como o plano semanal); o schema confere o resto.
    conferir(bloco, { ...BASE, ...(bloco.periodo === null && { periodo: true }), dados }, nome, erros);
    if (!SO_FORMA.has(bloco.tipo)) validar(bloco, SCHEMA, nome, erros);
  }
  relatar(nome, bloco?.tipo, erros, dados && !SO_FORMA.has(bloco.tipo) ? ', schema' : '');
};

for (const [nome, bloco] of Object.entries(amostras)) conferirBloco(nome, bloco);

// Os exemplos oficiais sincronizados (src/reports/contrato/exemplos/) também seguem o schema
// que veio com eles: um campo desconhecido ou de tipo errado num exemplo falha aqui.
const PASTA_EXEMPLOS = new URL('../src/reports/contrato/exemplos/', import.meta.url);
for (const arquivo of readdirSync(PASTA_EXEMPLOS).filter((f) => f.endsWith('.js')).sort()) {
  const { default: bloco } = await import(new URL(arquivo, PASTA_EXEMPLOS));
  conferirBloco(`oficial:${arquivo.replace(/\.js$/, '')}`, bloco);
}

// Fixtures com a FORMA do exemplo oficial correspondente (cópia sincronizada): mesmo envelope,
// mesmas colunas e tabelas, mesmos tipos nos campos opcionais. Os valores e o tamanho das linhas
// podem diferir (a fixture do plano é menor; a de nomes tem 800 linhas). A igualdade com a cópia
// do backend é do check:fixtures.
const tipoDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const forma = (b) =>
  JSON.stringify({
    envelope: Object.keys(b),
    dados: Object.keys(b.dados),
    periodo: b.periodo,
    meta: b.meta,
    resumo: (b.resumo || []).map((r) => [r.rotulo, r.formato]),
    relatorio: b.dados.relatorio,
    colunas: b.dados.colunas,
    tabelas: b.tabelas.map((t) => ({ nome: t.nome, colunas: t.colunas })),
    // Campos opcionais: presença, tipo e valor (agrupar_por e unidade_grupo são pequenos).
    contem_dados_pacientes: ['contem_dados_pacientes' in b, b.contem_dados_pacientes],
    contem_em_dados: 'contem_dados_pacientes' in b.dados,
    agrupar_por: [tipoDe(b.dados.agrupar_por), b.dados.agrupar_por],
    unidade_grupo: [tipoDe(b.dados.unidade_grupo), b.dados.unidade_grupo],
  });
const PARES_FORMA = [
  ['tabelaGenericaPlanoSemanal', planoOficial, 'tabela_generica_plano_semanal'],
  ['tabelaGenericaPacientesNomesAgrupada', nomesOficial, 'tabela_generica_pacientes_por_profissional_nomes'],
];
for (const [nome, oficial, arquivo] of PARES_FORMA) {
  const fixture = amostras[nome];
  const erros = [];
  if (forma(oficial) !== forma(fixture)) erros.push(`forma diferente de contrato/exemplos/${arquivo}.js (envelope, colunas, tabelas ou campos opcionais)`);
  if (oficial.periodo !== null) erros.push('o exemplo oficial deixou de ter periodo null');
  relatar(`${nome} ~ oficial:${arquivo}`, 'forma', erros);
}

if (falhas) {
  console.error(`\n${falhas} problema(s) de contrato nas fixtures.`);
  process.exit(1);
}
console.log('\nFixtures de relatório seguem o contrato do RealocAI.');
