// Contrato dos blocos de relatório devolvidos junto com a mensagem do assistente.
// Fonte da verdade: os exemplos reais do RealocAI (docs/exemplos-blocos/ no repositório do
// agente, schema bloco_relatorio.schema.json; cópia em ./contrato/). `npm run check:blocks`
// confere as fixtures. Versão 1; tipos novos são aditivos e a tela ignora tipos desconhecidos.

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
 * @property {'ocupacao_profissional'|'pacientes_por_profissional'|'ocupacao_agregada'|'disponibilidade'|'convenio'|'agenda_paciente'|'qualidade_agenda'|'tabela_generica'} tipo
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

/** @typedef {{id: string, nome: string, especialidade: string|null}} Profissional Especialidade em identificador ("terapia_ocupacional"). */

/**
 * Vagas seguidas do mesmo profissional, sala e posto. `slots` de 30 min; `cabem` = quantos
 * atendimentos de `minutos_por_janela` cabem na faixa.
 * @typedef {Object} FaixaVaga
 * @property {string} data
 * @property {string} dia_semana
 * @property {'manha'|'tarde'} periodo
 * @property {Profissional} profissional
 * @property {string} sala_id
 * @property {string} sala_nome
 * @property {number} posto Contado a partir de 1.
 * @property {string} inicio "HH:MM"
 * @property {string} fim "HH:MM"
 * @property {number} slots
 * @property {number} cabem
 */

/**
 * @typedef {BlocoBase & {tipo: 'disponibilidade', dados: {
 *   tipo: 'disponibilidade',
 *   minutos_por_janela: number,
 *   faixas: FaixaVaga[],
 *   por_dia: {data: string, dia_semana: string, periodo: 'manha'|'tarde', vagas_livres: number, horas_livres: number, janelas: number|null}[]
 * }}} BlocoDisponibilidade
 */

/**
 * Somente contagens; nunca traz pacientes.
 * @typedef {BlocoBase & {tipo: 'convenio', dados: {
 *   tipo: 'convenio',
 *   por_convenio: {convenio: string, rotulo: string, sessoes: number, pacientes_distintos: number, slots_ocupados: number, aguardando_autorizacao: number}[],
 *   aguardando: {data: string, dia_semana: string, profissional: Profissional, sessoes: number}[]
 * }}} BlocoConvenio
 */

/**
 * Único bloco com nome de paciente (LGPD): nunca em log, storage, URL ou título de documento.
 * @typedef {BlocoBase & {tipo: 'agenda_paciente', dados: {
 *   tipo: 'agenda_paciente',
 *   paciente: {nome: string, convenio: string|null},
 *   dias: {data: string, dia_semana: string,
 *     sessoes: {inicio: string, fim: string, profissional_nome: string, especialidade: string, sala_nome: string, aguardando_autorizacao: boolean}[],
 *     intervalos: {inicio: string, fim: string, minutos: number, minutos_de_pausa: number}[]}[],
 *   total_sessoes: number,
 *   minutos_em_intervalos: number
 * }}} BlocoAgendaPaciente
 */

/**
 * Valores em slots (1 slot = 30 min). `maior_faixa_livre` também em slots.
 * @typedef {Object} QualidadeProfissional
 * @property {Profissional} profissional
 * @property {number} slots_escalados
 * @property {number} slots_ocupados
 * @property {number} vagas_livres
 * @property {number} buracos
 * @property {number} slots_em_buracos
 * @property {number} slots_isolados
 * @property {number} faixas_livres
 * @property {number} maior_faixa_livre
 */

/**
 * @typedef {BlocoBase & {tipo: 'qualidade_agenda', dados: {
 *   tipo: 'qualidade_agenda',
 *   por_profissional: QualidadeProfissional[],
 *   por_dia: (QualidadeProfissional & {data: string, dia_semana: string})[]
 * }}} BlocoQualidadeAgenda
 */

/**
 * Dimensões x métricas. `total` só tem as métricas; `linhas_omitidas` > 0 → "+N linhas".
 * @typedef {BlocoBase & {tipo: 'tabela_generica', dados: {
 *   tipo: 'tabela_generica',
 *   relatorio: string,
 *   dimensoes: string[],
 *   metricas: string[],
 *   colunas: {chave: string, rotulo: string, formato: Formato}[],
 *   linhas: Record<string, string|number|boolean|null>[],
 *   total: Record<string, string|number|boolean|null>,
 *   linhas_omitidas: number
 * }}} BlocoTabelaGenerica
 */

/**
 * @typedef {BlocoOcupacaoProfissional|BlocoPacientesPorProfissional|BlocoOcupacaoAgregada|BlocoDisponibilidade|BlocoConvenio|BlocoAgendaPaciente|BlocoQualidadeAgenda|BlocoTabelaGenerica} Bloco
 */

/** @typedef {'pdf'|'excel'} FormatoExportacao */

export {};
