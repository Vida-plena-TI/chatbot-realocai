// Exemplo real de bloco do RealocAI, copiado sem alteração. Dados FICTÍCIOS.
// Origem: Vida-plena-TI/reallocaai-agente @ 431304065416441b13c735476ae0c53256d34d19 (main)
// Arquivo: docs/exemplos-blocos/tabela_generica_plano_realocacao_pergunta.json. Atualize com scripts/sync-contrato.mjs; não edite à mão.
export default {
  "versao": 1,
  "tipo": "tabela_generica",
  "titulo": "Plano de realocação: qual paciente?",
  "periodo": null,
  "meta": null,
  "parcial": false,
  "dias_nao_lidos": [],
  "avisos": [
    "O paciente é identificado só pelo nome: homônimos aparecem como um só."
  ],
  "resumo": [
    {
      "rotulo": "Candidatas",
      "valor": 2,
      "formato": "inteiro",
      "exibicao": "2"
    }
  ],
  "dados": {
    "tipo": "tabela_generica",
    "relatorio": "plano_realocacao",
    "dimensoes": [],
    "metricas": [],
    "colunas": [
      {
        "chave": "candidata",
        "rotulo": "Candidata",
        "formato": "inteiro"
      },
      {
        "chave": "paciente",
        "rotulo": "Nome",
        "formato": "texto"
      },
      {
        "chave": "terapia",
        "rotulo": "Terapia",
        "formato": "texto"
      },
      {
        "chave": "profissional",
        "rotulo": "Profissional",
        "formato": "texto"
      },
      {
        "chave": "dias",
        "rotulo": "Dias",
        "formato": "texto"
      }
    ],
    "linhas": [
      {
        "candidata": 1,
        "paciente": "Paciente Ficticio Rubi Alva",
        "terapia": "Terapia Ocupacional",
        "profissional": "Assizely",
        "dias": "Qua, Qui"
      },
      {
        "candidata": 2,
        "paciente": "Paciente Ficticio Rubi Estrela",
        "terapia": "Terapia Ocupacional",
        "profissional": "Assizely",
        "dias": "Qui"
      }
    ],
    "total": {},
    "linhas_omitidas": 0
  },
  "tabelas": [
    {
      "nome": "Candidatas",
      "colunas": [
        {
          "chave": "candidata",
          "rotulo": "Candidata",
          "formato": "inteiro"
        },
        {
          "chave": "paciente",
          "rotulo": "Nome",
          "formato": "texto"
        },
        {
          "chave": "terapia",
          "rotulo": "Terapia",
          "formato": "texto"
        },
        {
          "chave": "profissional",
          "rotulo": "Profissional",
          "formato": "texto"
        },
        {
          "chave": "dias",
          "rotulo": "Dias",
          "formato": "texto"
        }
      ],
      "linhas": [
        {
          "candidata": 1,
          "paciente": "Paciente Ficticio Rubi Alva",
          "terapia": "Terapia Ocupacional",
          "profissional": "Assizely",
          "dias": "Qua, Qui"
        },
        {
          "candidata": 2,
          "paciente": "Paciente Ficticio Rubi Estrela",
          "terapia": "Terapia Ocupacional",
          "profissional": "Assizely",
          "dias": "Qui"
        }
      ]
    }
  ],
  "contem_dados_pacientes": true
};
