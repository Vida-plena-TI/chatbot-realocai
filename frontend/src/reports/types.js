// Contrato dos blocos de relatório devolvidos junto com a mensagem do assistente.
// Fonte da verdade: os exemplos reais do RealocAI (docs/exemplos-blocos/ no repositório do
// agente, schema bloco_relatorio.schema.json). `npm run check:blocks` confere as fixtures.

/** @typedef {'percentual'|'inteiro'|'decimal'|'data'|'texto'} Formato */

/**
 * @typedef {Object} ItemResumo
 * @property {string} rotulo
 * @property {number|string|boolean|null} valor
 * @property {Formato} formato
 * @property {string} exibicao Texto pronto para exibir; tem prioridade sobre `valor`.
 */

/**
 * @typedef {Object} Tabela
 * @property {string} nome
 * @property {{chave: string, rotulo: string, formato: Formato}[]} colunas
 * @property {Record<string, string|number|boolean|null>[]} linhas
 */

/**
 * @typedef {Object} BlocoBase
 * @property {number} versao
 * @property {'ocupacao_profissional'|'pacientes_por_profissional'|'ocupacao_agregada'} tipo
 * @property {string} titulo
 * @property {{inicio: string, fim: string}} periodo Datas ISO AAAA-MM-DD.
 * @property {number|null} meta Fração de 0 a 1 (ex.: 0.8); null quando a métrica não tem meta.
 * @property {boolean} parcial
 * @property {string[]} dias_nao_lidos Datas ISO que não puderam ser lidas (quando `parcial`).
 * @property {string[]} avisos
 * @property {ItemResumo[]} resumo
 * @property {Tabela[]} tabelas
 */

/** @typedef {{data: string, dia_semana: string}} DataRelatorio */

/**
 * @typedef {Object} Contagem
 * @property {number} escalados
 * @property {number} ocupados
 */

/**
 * @typedef {Object} SalaPosto
 * @property {string} sala_id
 * @property {string} sala_nome
 * @property {number} posto
 * @property {number} escalados
 * @property {number} ocupados
 */

/**
 * @typedef {Object} DiaOcupacao
 * @property {string} data
 * @property {string} dia_semana
 * @property {number} escalados
 * @property {number} ocupados
 * @property {number} livres
 * @property {number} percentual
 * @property {boolean} abaixo_da_meta
 * @property {number} slots_para_meta
 * @property {Contagem} manha
 * @property {Contagem} tarde
 * @property {SalaPosto[]} por_sala_posto
 */

/**
 * @typedef {BlocoBase & {tipo: 'ocupacao_profissional', dados: {
 *   tipo: 'ocupacao_profissional',
 *   profissional: {id: string, nome: string, especialidade: string|null},
 *   semana: {escalados: number, ocupados: number, livres: number, percentual: number, abaixo_da_meta: boolean, slots_para_meta: number},
 *   dias: DiaOcupacao[],
 *   dias_sem_agenda: DataRelatorio[],
 *   inconsistencia: boolean
 * }}} BlocoOcupacaoProfissional
 */

/**
 * @typedef {Object} ProfissionalPacientes
 * @property {string} id
 * @property {string} nome
 * @property {string|null} especialidade
 * @property {{data: string, dia_semana: string, pacientes: number, sessoes: number, slots_ocupados: number}[]} dias
 * @property {DataRelatorio[]} dias_sem_agenda
 * @property {number|null} media_pacientes_por_dia
 * @property {number} pacientes_distintos_semana
 */

/**
 * @typedef {BlocoBase & {tipo: 'pacientes_por_profissional', dados: {
 *   tipo: 'pacientes_por_profissional',
 *   escopo: 'semana'|'dia',
 *   profissionais: ProfissionalPacientes[],
 *   clinica_por_dia: {data: string, dia_semana: string, pacientes_distintos: number}[]
 * }}} BlocoPacientesPorProfissional
 */

/**
 * @typedef {Object} ItemAgregado
 * @property {string} rotulo
 * @property {number} slots_escalados
 * @property {number} slots_ocupados
 * @property {number} percentual
 * @property {boolean} abaixo_da_meta
 */

/**
 * @typedef {BlocoBase & {tipo: 'ocupacao_agregada', dados: {
 *   tipo: 'ocupacao_agregada',
 *   data: string,
 *   dia_semana: string,
 *   por_especialidade: ItemAgregado[],
 *   por_sala: ItemAgregado[]
 * }}} BlocoOcupacaoAgregada
 */

/** @typedef {BlocoOcupacaoProfissional|BlocoPacientesPorProfissional|BlocoOcupacaoAgregada} Bloco */

/** @typedef {'pdf'|'excel'} FormatoExportacao */

export {};
