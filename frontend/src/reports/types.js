// Contrato dos blocos de relatório devolvidos junto com a mensagem do assistente.
// Os nomes exatos dos campos serão confirmados com o backend.

/** @typedef {'percentual'|'inteiro'|'decimal'|'data'|'texto'} Formato */

/**
 * @typedef {Object} ItemResumo
 * @property {string} rotulo
 * @property {number|string} valor
 * @property {Formato} formato
 * @property {string} [exibicao] Texto pronto para exibir; tem prioridade sobre `valor`.
 */

/**
 * @typedef {Object} Tabela
 * @property {string} nome
 * @property {{chave: string, rotulo: string, formato: Formato}[]} colunas
 * @property {Record<string, any>[]} linhas
 */

/**
 * @typedef {Object} BlocoBase
 * @property {number} versao
 * @property {'ocupacao_profissional'|'pacientes_por_profissional'|'ocupacao_agregada'} tipo
 * @property {string} titulo
 * @property {{inicio: string, fim: string}} periodo Datas ISO AAAA-MM-DD.
 * @property {number} meta Fração de 0 a 1 (ex.: 0.8).
 * @property {boolean} parcial
 * @property {string[]} [dias_nao_lidos] Proposta: datas que não puderam ser lidas quando `parcial`.
 * @property {string[]} avisos
 * @property {ItemResumo[]} resumo
 * @property {Tabela[]} tabelas
 */

/**
 * @typedef {Object} Contagem
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
 * @property {{sala: string, posto: number, escalados: number, ocupados: number}[]} por_sala_posto
 */

/**
 * @typedef {BlocoBase & {tipo: 'ocupacao_profissional', dados: {
 *   profissional: {nome: string, especialidade: string},
 *   semana: {escalados: number, ocupados: number, livres: number, percentual: number, abaixo_da_meta: boolean, slots_para_meta: number},
 *   dias: DiaOcupacao[],
 *   dias_sem_agenda: string[],
 *   inconsistencia: boolean
 * }}} BlocoOcupacaoProfissional
 */

/**
 * @typedef {Object} ProfissionalPacientes
 * @property {string} nome
 * @property {string} especialidade
 * @property {{data: string, dia_semana: string, pacientes: number, sessoes: number, slots_ocupados: number}[]} dias
 * @property {string[]} dias_sem_agenda
 * @property {number} media_pacientes_por_dia
 * @property {number} pacientes_distintos_semana
 */

/**
 * @typedef {BlocoBase & {tipo: 'pacientes_por_profissional', dados: {
 *   escopo: 'semana'|'dia',
 *   profissionais: ProfissionalPacientes[],
 *   clinica_por_dia: {data: string, pacientes_distintos: number}[]
 * }}} BlocoPacientesPorProfissional
 */

/**
 * @typedef {Object} ItemAgregado
 * @property {string} rotulo
 * @property {number} escalados
 * @property {number} ocupados
 * @property {number} percentual
 * @property {boolean} abaixo_da_meta
 */

/**
 * @typedef {BlocoBase & {tipo: 'ocupacao_agregada', dados: {
 *   por_especialidade: ItemAgregado[],
 *   por_sala: ItemAgregado[]
 * }}} BlocoOcupacaoAgregada
 */

/** @typedef {BlocoOcupacaoProfissional|BlocoPacientesPorProfissional|BlocoOcupacaoAgregada} Bloco */

/** @typedef {'pdf'|'excel'} FormatoExportacao */

export {};
