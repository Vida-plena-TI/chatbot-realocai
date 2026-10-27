// Blocos de exemplo (dados fictícios). Só nomes fictícios de profissionais; o único paciente é o
// fictício do exemplo real de agenda_paciente. Mesma FORMA dos exemplos reais do RealocAI (ver
// types.js); `npm run check:blocks` confere contra o schema copiado em contrato/.
import disponibilidadeVagas from './contrato/exemplos/disponibilidade_vagas.js';
import disponibilidadeJanelas from './contrato/exemplos/disponibilidade_janelas.js';
import convenio from './contrato/exemplos/convenio.js';
import agendaPaciente from './contrato/exemplos/agenda_paciente.js';
import qualidadeAgenda from './contrato/exemplos/qualidade_agenda.js';
import tabelaGenericaRanking from './contrato/exemplos/tabela_generica_ranking.js';
import tabelaGenericaCapacidade from './contrato/exemplos/tabela_generica_capacidade.js';
import tabelaGenericaPersonalizado from './contrato/exemplos/tabela_generica_personalizado.js';

const SEMANA = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
const NOMES = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaSemana = (iso) => NOMES[SEMANA.indexOf(iso)] || '';
const dataRelatorio = (iso) => ({ data: iso, dia_semana: diaSemana(iso) });
const periodoSemana = { inicio: '2026-10-05', fim: '2026-10-10' };
const sala12 = (posto, escalados, ocupados) => ({ escalados, ocupados, sala_id: 'sala-12', sala_nome: 'Sala 12', posto });

/** @type {import('./types').BlocoOcupacaoProfissional} */
export const ocupacaoProfissional = {
  versao: 1,
  tipo: 'ocupacao_profissional',
  titulo: 'Ocupação de Helena Prado (Terapia Ocupacional)',
  periodo: periodoSemana,
  meta: 0.8,
  parcial: false,
  dias_nao_lidos: [],
  avisos: ['Os números refletem a grade semanal da planilha, não uma semana específica do calendário.'],
  resumo: [
    { rotulo: 'Ocupação da semana', valor: 0.8148, formato: 'percentual', exibicao: '81,5%' },
    { rotulo: 'Slots ocupados / escalados', valor: 44, formato: 'inteiro', exibicao: '44 de 54' },
  ],
  dados: {
    tipo: 'ocupacao_profissional',
    profissional: { id: 'profissional-ficticio-1', nome: 'Helena Prado', especialidade: 'Terapia Ocupacional' },
    semana: { escalados: 54, ocupados: 44, livres: 10, percentual: 0.8148, abaixo_da_meta: false, slots_para_meta: 0 },
    dias: [
      { escalados: 19, ocupados: 13, livres: 6, percentual: 0.6842, abaixo_da_meta: true, slots_para_meta: 3,
        data: '2026-10-06', dia_semana: 'terça-feira',
        manha: { escalados: 10, ocupados: 7 }, tarde: { escalados: 9, ocupados: 6 },
        por_sala_posto: [sala12(1, 19, 13)] },
      // Inconsistência de dados: ocupados sem escala. A tela mostra o selo neutro "Sem escala".
      { escalados: 0, ocupados: 2, livres: 0, percentual: null, abaixo_da_meta: false, slots_para_meta: 0,
        data: '2026-10-07', dia_semana: 'quarta-feira',
        manha: { escalados: 0, ocupados: 2 }, tarde: { escalados: 0, ocupados: 0 },
        por_sala_posto: [sala12(1, 0, 2)] },
      { escalados: 20, ocupados: 19, livres: 1, percentual: 0.95, abaixo_da_meta: false, slots_para_meta: 0,
        data: '2026-10-08', dia_semana: 'quinta-feira',
        manha: { escalados: 7, ocupados: 6 }, tarde: { escalados: 13, ocupados: 13 },
        por_sala_posto: [sala12(1, 14, 13), sala12(2, 6, 6)] },
      { escalados: 15, ocupados: 12, livres: 3, percentual: 0.8, abaixo_da_meta: false, slots_para_meta: 0,
        data: '2026-10-09', dia_semana: 'sexta-feira',
        manha: { escalados: 7, ocupados: 6 }, tarde: { escalados: 8, ocupados: 6 }, por_sala_posto: [] },
    ],
    dias_sem_agenda: [dataRelatorio('2026-10-05'), dataRelatorio('2026-10-10')],
    inconsistencia: true,
  },
  tabelas: [
    {
      nome: 'Por dia',
      colunas: [
        { chave: 'data', rotulo: 'Data', formato: 'data' },
        { chave: 'escalados', rotulo: 'Escalados', formato: 'inteiro' },
        { chave: 'ocupados', rotulo: 'Ocupados', formato: 'inteiro' },
        { chave: 'livres', rotulo: 'Livres', formato: 'inteiro' },
        { chave: 'percentual', rotulo: 'Ocupação', formato: 'percentual' },
        { chave: 'status', rotulo: 'Status', formato: 'texto' },
      ],
      linhas: [
        { data: '2026-10-06', escalados: 19, ocupados: 13, livres: 6, percentual: 0.6842, status: 'Abaixo da meta' },
        { data: '2026-10-07', escalados: 0, ocupados: 2, livres: 0, percentual: null, status: 'Sem escala' },
        { data: '2026-10-08', escalados: 20, ocupados: 19, livres: 1, percentual: 0.95, status: 'Meta atingida' },
        { data: '2026-10-09', escalados: 15, ocupados: 12, livres: 3, percentual: 0.8, status: 'Meta atingida' },
      ],
    },
    {
      nome: 'Por sala e posto',
      colunas: [
        { chave: 'data', rotulo: 'Data', formato: 'data' },
        { chave: 'sala_nome', rotulo: 'Sala', formato: 'texto' },
        { chave: 'posto', rotulo: 'Posto', formato: 'inteiro' },
        { chave: 'escalados', rotulo: 'Escalados', formato: 'inteiro' },
        { chave: 'ocupados', rotulo: 'Ocupados', formato: 'inteiro' },
      ],
      linhas: [
        { data: '2026-10-06', sala_nome: 'Sala 12', posto: 1, escalados: 19, ocupados: 13 },
        { data: '2026-10-07', sala_nome: 'Sala 12', posto: 1, escalados: 0, ocupados: 2 },
        { data: '2026-10-08', sala_nome: 'Sala 12', posto: 1, escalados: 14, ocupados: 13 },
        { data: '2026-10-08', sala_nome: 'Sala 12', posto: 2, escalados: 6, ocupados: 6 },
      ],
    },
  ],
};

let proxId = 1;
const prof = (nome, especialidade, mapa, media, distintos) => ({
  id: `profissional-ficticio-${proxId++}`,
  nome,
  especialidade,
  dias: SEMANA.filter((d) => mapa[d] != null).map((d) => ({ data: d, dia_semana: diaSemana(d), pacientes: mapa[d], sessoes: mapa[d], slots_ocupados: mapa[d] })),
  dias_sem_agenda: SEMANA.filter((d) => mapa[d] == null).map(dataRelatorio),
  media_pacientes_por_dia: media,
  pacientes_distintos_semana: distintos,
});

const profissionais = [
  prof('Helena Prado', 'Terapia Ocupacional', { '2026-10-06': 9, '2026-10-08': 15, '2026-10-09': 11 }, 11.67, 34),
  prof('Lívia Matos', 'Terapia Ocupacional', { '2026-10-05': 12, '2026-10-06': 10, '2026-10-07': 13, '2026-10-09': 8 }, 10.75, 21),
  prof('Sophia Reis', 'Fonoaudiologia', { '2026-10-05': 14, '2026-10-06': 13, '2026-10-07': 15, '2026-10-08': 12, '2026-10-09': 14 }, 13.6, 40),
  prof('Aline Torres', 'Fonoaudiologia', { '2026-10-07': 9, '2026-10-08': 11, '2026-10-10': 13 }, 11, 27),
  prof('Ana Paula Lima', 'Psicologia', { '2026-10-05': 8, '2026-10-06': 9, '2026-10-07': 7, '2026-10-08': 9, '2026-10-09': 8 }, 8.2, 18),
  prof('Tatiana Rocha', 'Psicologia', { '2026-10-05': 6, '2026-10-07': 7, '2026-10-09': 7 }, 6.67, 14),
];
const clinica = [47, 44, 45, 45, 46, 13].map((n, i) => ({ ...dataRelatorio(SEMANA[i]), pacientes_distintos: n }));

/** @type {import('./types').BlocoPacientesPorProfissional} */
export const pacientesSemana = {
  versao: 1,
  tipo: 'pacientes_por_profissional',
  titulo: 'Pacientes por profissional',
  periodo: periodoSemana,
  meta: null, // esta métrica não tem meta
  parcial: false,
  dias_nao_lidos: [],
  avisos: ['Um mesmo paciente com mais de uma sessão no dia conta uma vez.'],
  resumo: [{ rotulo: 'Pacientes distintos na semana', valor: 154, formato: 'inteiro', exibicao: '154' }],
  dados: { tipo: 'pacientes_por_profissional', escopo: 'semana', profissionais, clinica_por_dia: clinica },
  tabelas: [
    {
      nome: 'Por profissional',
      colunas: [
        { chave: 'especialidade', rotulo: 'Especialidade', formato: 'texto' },
        { chave: 'nome', rotulo: 'Profissional', formato: 'texto' },
        ...SEMANA.map((d, i) => ({ chave: d, rotulo: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][i], formato: 'inteiro' })),
        { chave: 'media', rotulo: 'Média por dia', formato: 'decimal' },
        { chave: 'distintos', rotulo: 'Distintos na semana', formato: 'inteiro' },
      ],
      linhas: profissionais.map((p) => ({
        especialidade: p.especialidade,
        nome: p.nome,
        ...Object.fromEntries(p.dias.map((d) => [d.data, d.pacientes])),
        media: p.media_pacientes_por_dia,
        distintos: p.pacientes_distintos_semana,
      })),
    },
    {
      nome: 'Clínica por dia',
      colunas: [
        { chave: 'data', rotulo: 'Data', formato: 'data' },
        { chave: 'pacientes_distintos', rotulo: 'Pacientes distintos', formato: 'inteiro' },
      ],
      linhas: clinica.map(({ data, pacientes_distintos }) => ({ data, pacientes_distintos })),
    },
  ],
};

/** @type {import('./types').BlocoPacientesPorProfissional} */
export const pacientesDia = {
  ...pacientesSemana,
  periodo: { inicio: '2026-10-08', fim: '2026-10-08' },
  avisos: [],
  resumo: [{ rotulo: 'Pacientes distintos na clínica no dia', valor: 45, formato: 'inteiro', exibicao: '45' }],
  dados: {
    tipo: 'pacientes_por_profissional',
    escopo: 'dia',
    profissionais: profissionais
      .map((p) => ({ ...p, dias: p.dias.filter((d) => d.data === '2026-10-08'), dias_sem_agenda: [] }))
      .filter((p) => p.dias.length),
    clinica_por_dia: [{ ...dataRelatorio('2026-10-08'), pacientes_distintos: 45 }],
  },
  tabelas: [],
};

const ag = (rotulo, slots_escalados, slots_ocupados, percentual) => ({
  rotulo,
  slots_escalados,
  slots_ocupados,
  percentual,
  abaixo_da_meta: percentual < 0.8,
});
const porEspecialidade = [
  ag('Fonoaudiologia', 140, 126, 0.9), ag('Psicomotricidade', 37, 20, 0.5405), ag('Psicologia', 60, 50, 0.8333),
  ag('Musicoterapia', 24, 16, 0.6667), ag('Terapia Ocupacional', 110, 95, 0.8636), ag('Psicopedagogia', 40, 30, 0.75),
  ag('Terapia Alimentar', 22, 18, 0.8182),
];
const porSala = [
  ag('Sala 1', 36, 30, 0.8333), ag('Sala 2', 40, 36, 0.9), ag('Sala 3', 40, 31, 0.775), ag('Sala 4', 30, 19, 0.6333),
  ag('Sala 6', 22, 18, 0.8182), ag('Sala 7', 18, 9, 0.5), ag('Sala 8', 38, 35, 0.9211), ag('Sala 11', 28, 20, 0.7143),
  ag('Sala 12', 54, 46, 0.8519),
];
const colsAg = [
  { chave: 'rotulo', rotulo: 'Item', formato: 'texto' },
  { chave: 'slots_escalados', rotulo: 'Escalados', formato: 'inteiro' },
  { chave: 'slots_ocupados', rotulo: 'Ocupados', formato: 'inteiro' },
  { chave: 'percentual', rotulo: 'Ocupação', formato: 'percentual' },
];

/** @type {import('./types').BlocoOcupacaoAgregada} */
export const ocupacaoAgregada = {
  versao: 1,
  tipo: 'ocupacao_agregada',
  titulo: 'Ocupação por especialidade e por sala',
  // No RealocAI a ocupação agregada é de um dia (dados.data).
  periodo: { inicio: '2026-10-08', fim: '2026-10-08' },
  meta: 0.8,
  parcial: false,
  dias_nao_lidos: [],
  avisos: [],
  resumo: [{ rotulo: 'Clínica', valor: 0.8165, formato: 'percentual', exibicao: '81,7%' }],
  dados: {
    data: '2026-10-08',
    dia_semana: 'quinta-feira',
    tipo: 'ocupacao_agregada',
    por_especialidade: porEspecialidade,
    por_sala: porSala,
  },
  tabelas: [
    { nome: 'Por especialidade', colunas: colsAg, linhas: porEspecialidade },
    { nome: 'Por sala', colunas: colsAg, linhas: porSala },
  ],
};

/** Variante parcial para testar o estado âmbar. */
export const ocupacaoParcial = {
  ...ocupacaoProfissional,
  parcial: true,
  dias_nao_lidos: ['2026-10-09'],
  dados: { ...ocupacaoProfissional.dados, dias: ocupacaoProfissional.dados.dias.slice(0, 2) },
};

// --- Tipos novos: os 8 exemplos reais do agente, sem alteração -------------------------------
export {
  disponibilidadeVagas,
  disponibilidadeJanelas,
  convenio,
  agendaPaciente,
  qualidadeAgenda,
  tabelaGenericaRanking,
  tabelaGenericaCapacidade,
  tabelaGenericaPersonalizado,
};

/** Variante parcial: a quarta-feira não pôde ser lida. */
export const disponibilidadeParcial = {
  ...disponibilidadeVagas,
  parcial: true,
  dias_nao_lidos: ['2026-09-30'],
  dados: {
    ...disponibilidadeVagas.dados,
    faixas: disponibilidadeVagas.dados.faixas.filter((f) => f.data !== '2026-09-30'),
    por_dia: disponibilidadeVagas.dados.por_dia.filter((d) => d.data !== '2026-09-30'),
  },
};

/** Variante sem meta (ocupação não pedida): `meta: null` e sem as colunas de ocupação. */
const semOcupacao = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'ocupacao' && k !== 'abaixo_da_meta'));
const colsSemMeta = tabelaGenericaPersonalizado.dados.colunas.filter((c) => c.chave !== 'ocupacao' && c.chave !== 'abaixo_da_meta');
const linhasSemMeta = tabelaGenericaPersonalizado.dados.linhas.map(semOcupacao);
export const tabelaGenericaSemMeta = {
  ...tabelaGenericaPersonalizado,
  titulo: 'Vagas livres e pacientes distintos por dia e especialidade (tarde) de 28/09/2026 a 03/10/2026',
  meta: null,
  resumo: tabelaGenericaPersonalizado.resumo.filter((r) => r.formato !== 'percentual'),
  dados: {
    ...tabelaGenericaPersonalizado.dados,
    metricas: ['vagas_livres', 'pacientes_distintos'],
    colunas: colsSemMeta,
    linhas: linhasSemMeta,
    total: semOcupacao(tabelaGenericaPersonalizado.dados.total),
  },
  tabelas: [
    { nome: 'Resultado', colunas: colsSemMeta, linhas: linhasSemMeta },
    { nome: 'Total', colunas: colsSemMeta.slice(3), linhas: [semOcupacao(tabelaGenericaPersonalizado.dados.total)] },
  ],
};

// Tabela longa (60 linhas exibidas + 14 omitidas) para conferir a quebra de página do PDF.
const SEMANA_LONGA = [
  ['2026-09-28', 'segunda-feira'], ['2026-09-29', 'terça-feira'], ['2026-09-30', 'quarta-feira'],
  ['2026-10-01', 'quinta-feira'], ['2026-10-02', 'sexta-feira'], ['2026-10-03', 'sábado'],
];
const PROFS_LONGA = ['Ana Lima', 'Beto Reis', 'Cau Melo', 'Diva Rocha', 'Edu Faria', 'Fê Nunes', 'Gil Prado', 'Hana Luz', 'Ivo Sales', 'Júlia Paz'];
const colsLonga = [
  { chave: 'data', rotulo: 'Data', formato: 'data' },
  { chave: 'dia_semana', rotulo: 'Dia da semana', formato: 'texto' },
  { chave: 'profissional', rotulo: 'Profissional', formato: 'texto' },
  { chave: 'sala', rotulo: 'Sala', formato: 'texto' },
  { chave: 'ocupacao', rotulo: 'Ocupação', formato: 'percentual' },
  { chave: 'slots_ocupados', rotulo: 'Slots ocupados', formato: 'inteiro' },
  { chave: 'slots_escalados', rotulo: 'Slots escalados', formato: 'inteiro' },
  { chave: 'vagas_livres', rotulo: 'Vagas livres', formato: 'inteiro' },
  { chave: 'abaixo_da_meta', rotulo: 'Abaixo da meta', formato: 'texto' },
];
const linhasLonga = SEMANA_LONGA.flatMap(([data, dia_semana], d) =>
  PROFS_LONGA.map((profissional, p) => {
    const slots_escalados = 10;
    const slots_ocupados = (d * 3 + p * 7) % 11;
    const ocupacao = slots_ocupados / slots_escalados;
    return { data, dia_semana, profissional, sala: `Sala ${(p % 6) + 1}`, ocupacao, slots_ocupados, slots_escalados, vagas_livres: Math.max(0, slots_escalados - slots_ocupados), abaixo_da_meta: ocupacao < 0.8 };
  }),
);
const somaLonga = (k) => linhasLonga.reduce((a, l) => a + l[k], 0);
const totalLonga = {
  ocupacao: somaLonga('slots_ocupados') / somaLonga('slots_escalados'),
  slots_ocupados: somaLonga('slots_ocupados'),
  slots_escalados: somaLonga('slots_escalados'),
  vagas_livres: somaLonga('vagas_livres'),
  abaixo_da_meta: true,
};
export const tabelaGenericaLonga = {
  versao: 1,
  tipo: 'tabela_generica',
  titulo: 'Ocupação por dia, profissional e sala de 28/09/2026 a 03/10/2026',
  periodo: { inicio: '2026-09-28', fim: '2026-10-03' },
  meta: 0.8,
  parcial: false,
  dias_nao_lidos: [],
  avisos: ['Exemplo fictício longo, para conferir a quebra de página.'],
  resumo: [
    { rotulo: 'Ocupação (total)', valor: totalLonga.ocupacao, formato: 'percentual', exibicao: `${(Math.round(totalLonga.ocupacao * 1000) / 10).toFixed(1).replace('.', ',')}%` },
    { rotulo: 'Slots ocupados (total)', valor: totalLonga.slots_ocupados, formato: 'inteiro', exibicao: String(totalLonga.slots_ocupados) },
  ],
  dados: {
    tipo: 'tabela_generica',
    relatorio: 'personalizado',
    dimensoes: ['dia', 'profissional', 'sala'],
    metricas: ['ocupacao', 'slots_ocupados', 'slots_escalados', 'vagas_livres'],
    colunas: colsLonga,
    linhas: linhasLonga,
    total: totalLonga,
    linhas_omitidas: 14,
  },
  tabelas: [
    { nome: 'Resultado', colunas: colsLonga, linhas: linhasLonga },
    { nome: 'Total', colunas: colsLonga.slice(4), linhas: [totalLonga] },
  ],
};

// --- Disponibilidade SINTÉTICA (dados fictícios) ---------------------------------------------
// ~200 faixas, segunda a sábado (sábado só de manhã), 9 especialidades, faixas de 30 a 180 min,
// uma faixa sem especialidade e uma com a especialidade em identificador. Na ordem do agente:
// por dia e horário, com as especialidades intercaladas.
const SEMANA_SINT = [
  ['2026-10-05', 'segunda-feira'], ['2026-10-06', 'terça-feira'], ['2026-10-07', 'quarta-feira'],
  ['2026-10-08', 'quinta-feira'], ['2026-10-09', 'sexta-feira'], ['2026-10-10', 'sábado'],
];
const ESPECIALIDADES_SINT = [
  'Fonoaudiologia', 'Psicologia', 'Psicopedagogia', 'Terapia Alimentar', 'Terapia Ocupacional',
  'Psicomotricidade', 'Musicoterapia', 'Fisioterapia', 'Nutrição',
];
const PROFS_SINT = ESPECIALIDADES_SINT.flatMap((esp, i) =>
  [0, 1].map((k) => {
    const letra = String.fromCharCode(65 + i * 2 + k);
    return { id: `profissional-ficticio-${letra.toLowerCase()}`, nome: `Profissional ${letra}`, especialidade: esp, sala: (i % 6) + 1, posto: k + 1 };
  }),
);
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const faixasSint = SEMANA_SINT.flatMap(([data, dia_semana], d) =>
  ['manha', 'tarde']
    .filter((periodo) => !(d === 5 && periodo === 'tarde'))
    .flatMap((periodo, t) =>
      PROFS_SINT.map((p, i) => {
        const slots = [1, 2, 1, 3, 2, 1, 4, 2, 6][(d * 7 + t * 5 + i * 3) % 9]; // 30 a 180 min
        const base = periodo === 'manha' ? 7 * 60 : 13 * 60;
        const inicio = base + ((d + i * 2 + t) % (10 - slots)) * 30;
        return {
          data, dia_semana, periodo,
          profissional: { id: p.id, nome: p.nome, especialidade: p.especialidade },
          sala_id: `sala-${p.sala}`, sala_nome: `Sala ${p.sala}`, posto: p.posto,
          inicio: hhmm(inicio), fim: hhmm(inicio + slots * 30), slots, cabem: slots,
        };
      }),
    ),
);
// Casos de borda: uma faixa sem especialidade e uma com identificador no lugar do rótulo.
faixasSint[3] = { ...faixasSint[3], profissional: { ...faixasSint[3].profissional, especialidade: null } };
faixasSint[40] = { ...faixasSint[40], profissional: { ...faixasSint[40].profissional, especialidade: 'terapia_ocupacional' } };
faixasSint.sort((a, b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio));

const porDiaSint = SEMANA_SINT.flatMap(([data, dia_semana]) =>
  ['manha', 'tarde'].flatMap((periodo) => {
    const lista = faixasSint.filter((f) => f.data === data && f.periodo === periodo);
    if (!lista.length) return [];
    const vagas_livres = lista.reduce((a, f) => a + f.slots, 0);
    return [{ data, dia_semana, periodo, vagas_livres, horas_livres: vagas_livres / 2, janelas: null }];
  }),
);
const vagasSint = faixasSint.reduce((a, f) => a + f.slots, 0);
const colsDisp = disponibilidadeVagas.tabelas[0].colunas;
const turno = { manha: 'Manhã', tarde: 'Tarde' };
export const disponibilidadeSintetica = {
  ...disponibilidadeVagas,
  titulo: 'Vagas livres de 05/10/2026 a 10/10/2026',
  periodo: { inicio: '2026-10-05', fim: '2026-10-10' },
  avisos: ['Exemplo SINTÉTICO com nomes fictícios, para testar a leitura de relatórios longos.'],
  resumo: [
    { rotulo: 'Vagas livres', valor: vagasSint, formato: 'inteiro', exibicao: String(vagasSint) },
    { rotulo: 'Horas livres', valor: vagasSint / 2, formato: 'decimal', exibicao: `${(vagasSint / 2).toFixed(1).replace('.', ',')} h` },
  ],
  dados: { tipo: 'disponibilidade', minutos_por_janela: 30, faixas: faixasSint, por_dia: porDiaSint },
  tabelas: [
    {
      nome: 'Vagas',
      colunas: colsDisp,
      linhas: faixasSint.map((f) => ({
        data: f.data, dia_semana: f.dia_semana, periodo: turno[f.periodo], profissional: f.profissional.nome,
        especialidade: f.profissional.especialidade, sala: f.sala_nome, posto: f.posto, inicio: f.inicio, fim: f.fim,
        slots: f.slots, cabem: f.cabem,
      })),
    },
    {
      nome: 'Resumo por dia',
      colunas: disponibilidadeVagas.tabelas[1].colunas,
      linhas: porDiaSint.map((d) => ({ data: d.data, dia_semana: d.dia_semana, periodo: turno[d.periodo], vagas_livres: d.vagas_livres, horas_livres: d.horas_livres, janelas: null })),
    },
  ],
};

// --- Plano semanal (tabela_generica, relatorio "plano_semanal"; dados FICTÍCIOS) -------------
// Forma de blocos_gerais.plano_semanal no agente. Na ordem do agente, por dia pedido: o plano
// por horário e, para cada especialidade que não coube, a linha "Não coube" (horario,
// profissional e sala "—", posto null) e as alternativas, com o `dia` em que acontecem (a
// quinta dentro do grupo da quarta e vice-versa). Ordenar por dia ou horário muda a sequência.
// Cópia de backend/chat/tests/fixtures/tabela_generica_plano_semanal.json (check:blocks confere).
const colsPlano = [
  { chave: 'dia', rotulo: 'Dia', formato: 'texto' },
  { chave: 'situacao', rotulo: 'Situação', formato: 'texto' },
  { chave: 'especialidade', rotulo: 'Especialidade', formato: 'texto' },
  { chave: 'horario', rotulo: 'Horário', formato: 'texto' },
  { chave: 'profissional', rotulo: 'Profissional', formato: 'texto' },
  { chave: 'sala', rotulo: 'Sala', formato: 'texto' },
  { chave: 'posto', rotulo: 'Posto', formato: 'inteiro' },
];
const sessao = (dia, situacao, especialidade, horario, profissional, sala, posto) => ({ dia, situacao, especialidade, horario, profissional, sala, posto });
const naoCoube = (dia, especialidade) => sessao(dia, 'Não coube', especialidade, '—', '—', '—', null);
const linhasPlano = [
  sessao('quarta-feira', 'Plano', 'Psicologia', '10:00 às 10:30', 'Ana Lima', 'Sala 3', 1),
  sessao('quarta-feira', 'Plano', 'Fonoaudiologia', '11:00 às 11:30', 'Beto Reis', 'Sala 10', 2),
  naoCoube('quarta-feira', 'Terapia Ocupacional'),
  sessao('quarta-feira', 'Alternativa', 'Terapia Ocupacional', '14:00 às 14:30', 'Cau Melo', 'Sala 2', 1),
  sessao('quinta-feira', 'Alternativa', 'Terapia Ocupacional', '08:00 às 08:30', 'Cau Melo', 'Sala 2', 1),
  sessao('quinta-feira', 'Plano', 'Psicologia', '10:30 às 11:00', 'Ana Lima', 'Sala 3', 1),
  sessao('quinta-feira', 'Plano', 'Terapia Ocupacional', '11:30 às 12:00', 'Cau Melo', 'Sala 2', 2),
  naoCoube('quinta-feira', 'Fonoaudiologia'),
  sessao('quarta-feira', 'Alternativa', 'Fonoaudiologia', '15:00 às 15:30', 'Beto Reis', 'Sala 10', 1),
];
export const tabelaGenericaPlanoSemanal = {
  versao: 1,
  tipo: 'tabela_generica',
  titulo: 'Plano semanal: quarta e quinta, das 10:00 às 12:00 (sessões de 30 min)',
  periodo: { inicio: '2026-09-28', fim: '2026-10-03' },
  meta: null,
  parcial: false,
  dias_nao_lidos: [],
  avisos: ['A recorrência semanal usa a grade semanal da planilha (uma fotografia da semana, sem datas): feriados e exceções do calendário não são vistos.'],
  resumo: [
    { rotulo: 'Quarta-feira', valor: '2 de 3', formato: 'texto', exibicao: '2 de 3 especialidades' },
    { rotulo: 'Quinta-feira', valor: '2 de 3', formato: 'texto', exibicao: '2 de 3 especialidades' },
    { rotulo: 'Não couberam', valor: 2, formato: 'inteiro', exibicao: '2' },
  ],
  dados: {
    tipo: 'tabela_generica',
    relatorio: 'plano_semanal',
    dimensoes: [],
    metricas: [],
    colunas: colsPlano,
    linhas: linhasPlano,
    total: {},
    linhas_omitidas: 0,
  },
  tabelas: [{ nome: 'Plano', colunas: colsPlano, linhas: linhasPlano }],
};
