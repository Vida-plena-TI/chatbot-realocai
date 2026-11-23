// Exemplo real de resposta do POST /agenda/chat do RealocAI, copiado sem alteração. Dados FICTÍCIOS.
// Origem: Vida-plena-TI/reallocaai-agente @ 610f663303ea5ae1dffcee5d93ce99004e902888 (main)
// Arquivo: docs/api-relatorios.md (bloco json marcado com <!-- exemplo-resposta-panorama -->). Atualize com scripts/sync-contrato.mjs;
// não edite à mão.
export default {
  "conversa_id": "3f1c…",
  "resposta": "Sugiro o Cenário 1, que equilibra turnos liberados e mudanças: libera 3 turnos por semana sem abrir turno novo e muda 4 pacientes de lugar (3 com troca de profissional e 0 com troca de dia). Cada mudança precisa ser confirmada com as famílias e feita manualmente na planilha. O comparativo de 3 cenários e os passos estão no relatório. Quer ver os passos do Cenário 2?",
  "blocos": [
    {
      "versao": 1,
      "tipo": "tabela_generica",
      "titulo": "Comparativo de cenários",
      "periodo": null,
      "meta": null,
      "parcial": false,
      "dias_nao_lidos": [],
      "avisos": [
        "Sugestão: considera apenas os atendimentos presentes na semana lida (terapias quinzenais ou fora desta semana não aparecem).",
        "Não considera a disponibilidade dos pacientes.",
        "Vagas livres na grade podem estar reservadas (reuniões, supervisão); confira antes de mudar.",
        "Cada mudança precisa ser confirmada com a família e feita manualmente na planilha.",
        "Profissionais sem atendimento: ficam sem nenhum paciente na semana. Turnos sem profissional: turnos de uma terapia em que ninguém atenderia, num dia em que hoje há atendimento."
      ],
      "resumo": [
        {
          "rotulo": "Cenários",
          "valor": 3,
          "formato": "inteiro",
          "exibicao": "3"
        },
        {
          "rotulo": "Maior número de turnos liberados",
          "valor": 3,
          "formato": "inteiro",
          "exibicao": "3"
        },
        {
          "rotulo": "Turnos com presença paga na semana",
          "valor": 8,
          "formato": "inteiro",
          "exibicao": "8"
        },
        {
          "rotulo": "Turnos presos por regra",
          "valor": 0,
          "formato": "inteiro",
          "exibicao": "0"
        }
      ],
      "dados": {
        "tipo": "tabela_generica",
        "relatorio": "panorama_enxugamento",
        "dimensoes": [],
        "metricas": [],
        "colunas": [
          {
            "chave": "cenario",
            "rotulo": "Cenário",
            "formato": "texto"
          },
          {
            "chave": "turnos_liberados",
            "rotulo": "Turnos liberados",
            "formato": "inteiro"
          },
          {
            "chave": "passos",
            "rotulo": "Passos",
            "formato": "inteiro"
          },
          {
            "chave": "profissionais_afetadas",
            "rotulo": "Profissionais afetadas",
            "formato": "inteiro"
          },
          {
            "chave": "pacientes_movidos",
            "rotulo": "Pacientes movidos",
            "formato": "inteiro"
          },
          {
            "chave": "trocam_de_profissional",
            "rotulo": "Trocam de profissional",
            "formato": "inteiro"
          },
          {
            "chave": "trocam_de_dia",
            "rotulo": "Trocam de dia",
            "formato": "inteiro"
          },
          {
            "chave": "profissionais_sem_atendimento",
            "rotulo": "Profissionais sem atendimento",
            "formato": "inteiro"
          },
          {
            "chave": "turnos_sem_profissional",
            "rotulo": "Turnos sem profissional",
            "formato": "inteiro"
          },
          {
            "chave": "passos_iguais_ao_recomendado",
            "rotulo": "Passos iguais ao recomendado",
            "formato": "inteiro"
          },
          {
            "chave": "recomendado",
            "rotulo": "Recomendado",
            "formato": "texto"
          }
        ],
        "linhas": [
          {
            "cenario": "Cenário 1 · equilibrado",
            "turnos_liberados": 3,
            "passos": 4,
            "profissionais_afetadas": 2,
            "pacientes_movidos": 4,
            "trocam_de_profissional": 3,
            "trocam_de_dia": 0,
            "profissionais_sem_atendimento": 0,
            "turnos_sem_profissional": 2,
            "passos_iguais_ao_recomendado": 0,
            "recomendado": true
          },
          {
            "cenario": "Cenário 2 · mais turnos",
            "turnos_liberados": 3,
            "passos": 4,
            "profissionais_afetadas": 2,
            "pacientes_movidos": 4,
            "trocam_de_profissional": 3,
            "trocam_de_dia": 0,
            "profissionais_sem_atendimento": 0,
            "turnos_sem_profissional": 2,
            "passos_iguais_ao_recomendado": 3,
            "recomendado": false
          },
          {
            "cenario": "Cenário 3 · menos mudança",
            "turnos_liberados": 2,
            "passos": 3,
            "profissionais_afetadas": 2,
            "pacientes_movidos": 3,
            "trocam_de_profissional": 2,
            "trocam_de_dia": 0,
            "profissionais_sem_atendimento": 0,
            "turnos_sem_profissional": 1,
            "passos_iguais_ao_recomendado": 3,
            "recomendado": false
          }
        ],
        "total": {},
        "linhas_omitidas": 0
      },
      "tabelas": [
        {
          "nome": "Cenários",
          "colunas": [
            {
              "chave": "cenario",
              "rotulo": "Cenário",
              "formato": "texto"
            },
            {
              "chave": "turnos_liberados",
              "rotulo": "Turnos liberados",
              "formato": "inteiro"
            },
            {
              "chave": "passos",
              "rotulo": "Passos",
              "formato": "inteiro"
            },
            {
              "chave": "profissionais_afetadas",
              "rotulo": "Profissionais afetadas",
              "formato": "inteiro"
            },
            {
              "chave": "pacientes_movidos",
              "rotulo": "Pacientes movidos",
              "formato": "inteiro"
            },
            {
              "chave": "trocam_de_profissional",
              "rotulo": "Trocam de profissional",
              "formato": "inteiro"
            },
            {
              "chave": "trocam_de_dia",
              "rotulo": "Trocam de dia",
              "formato": "inteiro"
            },
            {
              "chave": "profissionais_sem_atendimento",
              "rotulo": "Profissionais sem atendimento",
              "formato": "inteiro"
            },
            {
              "chave": "turnos_sem_profissional",
              "rotulo": "Turnos sem profissional",
              "formato": "inteiro"
            },
            {
              "chave": "passos_iguais_ao_recomendado",
              "rotulo": "Passos iguais ao recomendado",
              "formato": "inteiro"
            },
            {
              "chave": "recomendado",
              "rotulo": "Recomendado",
              "formato": "texto"
            }
          ],
          "linhas": [
            {
              "cenario": "Cenário 1 · equilibrado",
              "turnos_liberados": 3,
              "passos": 4,
              "profissionais_afetadas": 2,
              "pacientes_movidos": 4,
              "trocam_de_profissional": 3,
              "trocam_de_dia": 0,
              "profissionais_sem_atendimento": 0,
              "turnos_sem_profissional": 2,
              "passos_iguais_ao_recomendado": 0,
              "recomendado": true
            },
            {
              "cenario": "Cenário 2 · mais turnos",
              "turnos_liberados": 3,
              "passos": 4,
              "profissionais_afetadas": 2,
              "pacientes_movidos": 4,
              "trocam_de_profissional": 3,
              "trocam_de_dia": 0,
              "profissionais_sem_atendimento": 0,
              "turnos_sem_profissional": 2,
              "passos_iguais_ao_recomendado": 3,
              "recomendado": false
            },
            {
              "cenario": "Cenário 3 · menos mudança",
              "turnos_liberados": 2,
              "passos": 3,
              "profissionais_afetadas": 2,
              "pacientes_movidos": 3,
              "trocam_de_profissional": 2,
              "trocam_de_dia": 0,
              "profissionais_sem_atendimento": 0,
              "turnos_sem_profissional": 1,
              "passos_iguais_ao_recomendado": 3,
              "recomendado": false
            }
          ]
        }
      ],
      "contem_dados_pacientes": true
    },
    {
      "versao": 1,
      "tipo": "tabela_generica",
      "titulo": "Passos do cenário recomendado",
      "periodo": null,
      "meta": null,
      "parcial": false,
      "dias_nao_lidos": [],
      "avisos": [
        "Cada mudança precisa ser confirmada com a família e feita manualmente na planilha."
      ],
      "resumo": [
        {
          "rotulo": "Turnos liberados",
          "valor": 3,
          "formato": "inteiro",
          "exibicao": "3"
        },
        {
          "rotulo": "Passos",
          "valor": 4,
          "formato": "inteiro",
          "exibicao": "4"
        },
        {
          "rotulo": "Pacientes movidos",
          "valor": 4,
          "formato": "inteiro",
          "exibicao": "4"
        }
      ],
      "dados": {
        "tipo": "tabela_generica",
        "relatorio": "panorama_enxugamento",
        "dimensoes": [],
        "metricas": [],
        "colunas": [
          {
            "chave": "cenario",
            "rotulo": "Cenário",
            "formato": "texto"
          },
          {
            "chave": "turno_liberado",
            "rotulo": "Turno liberado",
            "formato": "texto"
          },
          {
            "chave": "passo",
            "rotulo": "Passo",
            "formato": "inteiro"
          },
          {
            "chave": "paciente",
            "rotulo": "Quem",
            "formato": "texto"
          },
          {
            "chave": "terapia",
            "rotulo": "Terapia",
            "formato": "texto"
          },
          {
            "chave": "de",
            "rotulo": "De",
            "formato": "texto"
          },
          {
            "chave": "para",
            "rotulo": "Para",
            "formato": "texto"
          },
          {
            "chave": "tipo_de_movimento",
            "rotulo": "Tipo de movimento",
            "formato": "texto"
          },
          {
            "chave": "observacao",
            "rotulo": "Observação",
            "formato": "texto"
          }
        ],
        "linhas": [
          {
            "cenario": "Cenário 1 · equilibrado · libera 3 turnos",
            "turno_liberado": "Ter tarde · Ficticia Acacia · Terapia Alimentar",
            "passo": 1,
            "paciente": "Paciente Ficticio Figueira",
            "terapia": "Terapia Alimentar",
            "de": "Ter 13:00 às 14:00 · Ficticia Acacia · Sala 7",
            "para": "Ter 11:00 às 12:00 · Ficticia Acacia · Sala 7",
            "tipo_de_movimento": "Mesmo profissional · outro turno",
            "observacao": ""
          },
          {
            "cenario": "Cenário 1 · equilibrado · libera 3 turnos",
            "turno_liberado": "Seg manhã · Ficticia Acacia · Terapia Alimentar",
            "passo": 2,
            "paciente": "Paciente Ficticio Aroeira",
            "terapia": "Terapia Alimentar",
            "de": "Seg 08:00 às 09:00 · Ficticia Acacia · Sala 7",
            "para": "Seg 08:00 às 09:00 · Ficticia Bromelia · Sala 8",
            "tipo_de_movimento": "Outra profissional da mesma terapia · mesmo turno",
            "observacao": ""
          },
          {
            "cenario": "Cenário 1 · equilibrado · libera 3 turnos",
            "turno_liberado": "Seg manhã · Ficticia Acacia · Terapia Alimentar",
            "passo": 3,
            "paciente": "Paciente Ficticio Baoba",
            "terapia": "Terapia Alimentar",
            "de": "Seg 10:00 às 11:00 · Ficticia Acacia · Sala 7",
            "para": "Seg 10:00 às 11:00 · Ficticia Bromelia · Sala 8",
            "tipo_de_movimento": "Outra profissional da mesma terapia · mesmo turno",
            "observacao": ""
          },
          {
            "cenario": "Cenário 1 · equilibrado · libera 3 turnos",
            "turno_liberado": "Qua tarde · Ficticia Bromelia · Terapia Alimentar",
            "passo": 4,
            "paciente": "Paciente Ficticio Hortela",
            "terapia": "Terapia Alimentar",
            "de": "Qua 13:00 às 14:00 · Ficticia Bromelia · Sala 8",
            "para": "Qua 11:00 às 12:00 · Ficticia Acacia · Sala 7",
            "tipo_de_movimento": "Outra profissional da mesma terapia · outro turno",
            "observacao": ""
          }
        ],
        "total": {},
        "linhas_omitidas": 0,
        "agrupar_por": [
          "cenario"
        ],
        "unidade_grupo": {
          "singular": "passo",
          "plural": "passos"
        }
      },
      "tabelas": [
        {
          "nome": "Passos",
          "colunas": [
            {
              "chave": "cenario",
              "rotulo": "Cenário",
              "formato": "texto"
            },
            {
              "chave": "turno_liberado",
              "rotulo": "Turno liberado",
              "formato": "texto"
            },
            {
              "chave": "passo",
              "rotulo": "Passo",
              "formato": "inteiro"
            },
            {
              "chave": "paciente",
              "rotulo": "Quem",
              "formato": "texto"
            },
            {
              "chave": "terapia",
              "rotulo": "Terapia",
              "formato": "texto"
            },
            {
              "chave": "de",
              "rotulo": "De",
              "formato": "texto"
            },
            {
              "chave": "para",
              "rotulo": "Para",
              "formato": "texto"
            },
            {
              "chave": "tipo_de_movimento",
              "rotulo": "Tipo de movimento",
              "formato": "texto"
            },
            {
              "chave": "observacao",
              "rotulo": "Observação",
              "formato": "texto"
            }
          ],
          "linhas": [
            {
              "cenario": "Cenário 1 · equilibrado · libera 3 turnos",
              "turno_liberado": "Ter tarde · Ficticia Acacia · Terapia Alimentar",
              "passo": 1,
              "paciente": "Paciente Ficticio Figueira",
              "terapia": "Terapia Alimentar",
              "de": "Ter 13:00 às 14:00 · Ficticia Acacia · Sala 7",
              "para": "Ter 11:00 às 12:00 · Ficticia Acacia · Sala 7",
              "tipo_de_movimento": "Mesmo profissional · outro turno",
              "observacao": ""
            },
            {
              "cenario": "Cenário 1 · equilibrado · libera 3 turnos",
              "turno_liberado": "Seg manhã · Ficticia Acacia · Terapia Alimentar",
              "passo": 2,
              "paciente": "Paciente Ficticio Aroeira",
              "terapia": "Terapia Alimentar",
              "de": "Seg 08:00 às 09:00 · Ficticia Acacia · Sala 7",
              "para": "Seg 08:00 às 09:00 · Ficticia Bromelia · Sala 8",
              "tipo_de_movimento": "Outra profissional da mesma terapia · mesmo turno",
              "observacao": ""
            },
            {
              "cenario": "Cenário 1 · equilibrado · libera 3 turnos",
              "turno_liberado": "Seg manhã · Ficticia Acacia · Terapia Alimentar",
              "passo": 3,
              "paciente": "Paciente Ficticio Baoba",
              "terapia": "Terapia Alimentar",
              "de": "Seg 10:00 às 11:00 · Ficticia Acacia · Sala 7",
              "para": "Seg 10:00 às 11:00 · Ficticia Bromelia · Sala 8",
              "tipo_de_movimento": "Outra profissional da mesma terapia · mesmo turno",
              "observacao": ""
            },
            {
              "cenario": "Cenário 1 · equilibrado · libera 3 turnos",
              "turno_liberado": "Qua tarde · Ficticia Bromelia · Terapia Alimentar",
              "passo": 4,
              "paciente": "Paciente Ficticio Hortela",
              "terapia": "Terapia Alimentar",
              "de": "Qua 13:00 às 14:00 · Ficticia Bromelia · Sala 8",
              "para": "Qua 11:00 às 12:00 · Ficticia Acacia · Sala 7",
              "tipo_de_movimento": "Outra profissional da mesma terapia · outro turno",
              "observacao": ""
            }
          ]
        }
      ],
      "contem_dados_pacientes": true
    }
  ],
  "resposta_sensivel": true
};
