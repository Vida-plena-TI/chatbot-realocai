// Blocos de exemplo (dados fictícios). Só nomes fictícios de profissionais; nunca pacientes.

const SEMANA = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
const NOMES = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diaSemana = (iso) => NOMES[SEMANA.indexOf(iso)] || '';
const periodoSemana = { inicio: '2026-10-05', fim: '2026-10-10' };

/** @type {import('./types').BlocoOcupacaoProfissional} */
export const ocupacaoProfissional = {
  versao: 1,
  tipo: 'ocupacao_profissional',
  titulo: 'Ocupação de Helena Prado (Terapia Ocupacional)',
  periodo: periodoSemana,
  meta: 0.8,
  parcial: false,
  avisos: ['Os números refletem a grade semanal da planilha, não uma semana específica do calendário.'],
  resumo: [
    { rotulo: 'Semana', valor: 0.8148, formato: 'percentual', exibicao: '81,5%' },
    { rotulo: 'Slots ocupados', valor: 44, formato: 'inteiro', exibicao: '44 de 54' },
  ],
  dados: {
    profissional: { nome: 'Helena Prado', especialidade: 'Terapia Ocupacional' },
    semana: { escalados: 54, ocupados: 44, livres: 10, percentual: 0.8148, abaixo_da_meta: false, slots_para_meta: 0 },
    dias: [
      { data: '2026-10-06', dia_semana: 'terça-feira', escalados: 19, ocupados: 13, livres: 6, percentual: 0.6842, abaixo_da_meta: true, slots_para_meta: 3,
        manha: { escalados: 10, ocupados: 7 }, tarde: { escalados: 9, ocupados: 6 },
        por_sala_posto: [{ sala: 'Sala 12', posto: 1, escalados: 19, ocupados: 13 }] },
      { data: '2026-10-08', dia_semana: 'quinta-feira', escalados: 20, ocupados: 19, livres: 1, percentual: 0.95, abaixo_da_meta: false, slots_para_meta: 0,
        manha: { escalados: 7, ocupados: 6 }, tarde: { escalados: 13, ocupados: 13 },
        por_sala_posto: [{ sala: 'Sala 12', posto: 1, escalados: 14, ocupados: 13 }, { sala: 'Sala 12', posto: 2, escalados: 6, ocupados: 6 }] },
      { data: '2026-10-09', dia_semana: 'sexta-feira', escalados: 15, ocupados: 12, livres: 3, percentual: 0.8, abaixo_da_meta: false, slots_para_meta: 0,
        manha: { escalados: 7, ocupados: 6 }, tarde: { escalados: 8, ocupados: 6 }, por_sala_posto: [] },
    ],
    dias_sem_agenda: ['2026-10-05', '2026-10-07', '2026-10-10'],
    inconsistencia: false,
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
        { data: '2026-10-08', escalados: 20, ocupados: 19, livres: 1, percentual: 0.95, status: 'Meta atingida' },
        { data: '2026-10-09', escalados: 15, ocupados: 12, livres: 3, percentual: 0.8, status: 'Meta atingida' },
      ],
    },
    {
      nome: 'Por sala e posto',
      colunas: [
        { chave: 'data', rotulo: 'Data', formato: 'data' },
        { chave: 'sala', rotulo: 'Sala', formato: 'texto' },
        { chave: 'posto', rotulo: 'Posto', formato: 'inteiro' },
        { chave: 'escalados', rotulo: 'Escalados', formato: 'inteiro' },
        { chave: 'ocupados', rotulo: 'Ocupados', formato: 'inteiro' },
      ],
      linhas: [
        { data: '2026-10-06', sala: 'Sala 12', posto: 1, escalados: 19, ocupados: 13 },
        { data: '2026-10-08', sala: 'Sala 12', posto: 1, escalados: 14, ocupados: 13 },
        { data: '2026-10-08', sala: 'Sala 12', posto: 2, escalados: 6, ocupados: 6 },
      ],
    },
  ],
};

const prof = (nome, especialidade, mapa, media, distintos) => ({
  nome,
  especialidade,
  dias: SEMANA.filter((d) => mapa[d] != null).map((d) => ({ data: d, dia_semana: diaSemana(d), pacientes: mapa[d], sessoes: mapa[d], slots_ocupados: mapa[d] })),
  dias_sem_agenda: SEMANA.filter((d) => mapa[d] == null),
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
const clinica = [47, 44, 45, 45, 46, 13].map((n, i) => ({ data: SEMANA[i], pacientes_distintos: n }));

/** @type {import('./types').BlocoPacientesPorProfissional} */
export const pacientesSemana = {
  versao: 1,
  tipo: 'pacientes_por_profissional',
  titulo: 'Pacientes por profissional',
  periodo: periodoSemana,
  meta: 0.8,
  parcial: false,
  avisos: ['Um mesmo paciente com mais de uma sessão no dia conta uma vez.'],
  resumo: [{ rotulo: 'Pacientes distintos na semana', valor: 154, formato: 'inteiro', exibicao: '154' }],
  dados: { escopo: 'semana', profissionais, clinica_por_dia: clinica },
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
      linhas: clinica,
    },
  ],
};

/** @type {import('./types').BlocoPacientesPorProfissional} */
export const pacientesDia = {
  ...pacientesSemana,
  periodo: { inicio: '2026-10-08', fim: '2026-10-08' },
  avisos: [],
  resumo: [{ rotulo: 'Pacientes distintos no dia', valor: 45, formato: 'inteiro', exibicao: '45' }],
  dados: {
    escopo: 'dia',
    profissionais: profissionais
      .map((p) => ({ ...p, dias: p.dias.filter((d) => d.data === '2026-10-08') }))
      .filter((p) => p.dias.length),
    clinica_por_dia: [{ data: '2026-10-08', pacientes_distintos: 45 }],
  },
  tabelas: [],
};

const ag = (rotulo, escalados, ocupados, percentual) => ({ rotulo, escalados, ocupados, percentual, abaixo_da_meta: percentual < 0.8 });
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
  { chave: 'escalados', rotulo: 'Escalados', formato: 'inteiro' },
  { chave: 'ocupados', rotulo: 'Ocupados', formato: 'inteiro' },
  { chave: 'percentual', rotulo: 'Ocupação', formato: 'percentual' },
];

/** @type {import('./types').BlocoOcupacaoAgregada} */
export const ocupacaoAgregada = {
  versao: 1,
  tipo: 'ocupacao_agregada',
  titulo: 'Ocupação por especialidade e por sala',
  periodo: periodoSemana,
  meta: 0.8,
  parcial: false,
  avisos: [],
  resumo: [{ rotulo: 'Clínica', valor: 0.8165, formato: 'percentual', exibicao: '81,7%' }],
  dados: { por_especialidade: porEspecialidade, por_sala: porSala },
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
