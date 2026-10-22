import {
  agendaPaciente,
  convenio,
  disponibilidadeJanelas,
  disponibilidadeParcial,
  disponibilidadeVagas,
  ocupacaoAgregada,
  ocupacaoProfissional,
  ocupacaoParcial,
  pacientesDia,
  pacientesSemana,
  qualidadeAgenda,
  tabelaGenericaCapacidade,
  tabelaGenericaLonga,
  tabelaGenericaPersonalizado,
  tabelaGenericaRanking,
  tabelaGenericaSemMeta,
} from '../../reports/sampleBlocks';

// Tipo que esta tela ainda não conhece (agente mais novo): deve ser ignorado sem erro.
const blocoDesconhecido = { ...ocupacaoAgregada, tipo: 'tipo_futuro', titulo: 'Relatório de um tipo futuro' };

// Pedidos dos tipos novos. A ordem importa: o primeiro que casar responde.
const NOVOS = [
  [/relat[óo]rios novos|todos os novos/, 'Separei os oito relatórios novos em abas.', [disponibilidadeVagas, disponibilidadeJanelas, convenio, agendaPaciente, qualidadeAgenda, tabelaGenericaRanking, tabelaGenericaCapacidade, tabelaGenericaPersonalizado]],
  [/bloco desconhecido|tipo futuro/, 'Psicomotricidade (54,1%) e Sala 7 (50,0%) estão mais longe da meta de 80%.', [blocoDesconhecido, ocupacaoAgregada]],
  [/vagas? parcia|disponibilidade parcial/, 'Não consegui ler a quarta-feira. As vagas abaixo consideram os outros dias.', [disponibilidadeParcial]],
  [/janelas?|1 ?h ?30/, 'Cabem 33 atendimentos de 1 h 30 na semana. A tarde de segunda tem 3 janelas.', [disponibilidadeJanelas]],
  [/vagas?|hor[áa]rios? (vagos|livres)|disponibilidade/, 'Há 130 vagas livres de segunda a sexta, 65 horas no total.', [disponibilidadeVagas]],
  [/conv[êe]nio|autoriza/, 'Foram 22 sessões no período; 2 aguardam autorização.', [convenio]],
  [/agenda d[aoe] paciente/, 'A agenda pedida tem 5 sessões na semana. A terça concentra 3, com 3 h 30 de espera entre terapias.', [agendaPaciente]],
  [/buracos?|fragmenta|qualidade/, 'São 6 buracos na semana, com 8 slots presos. Ana Lima concentra 3.', [qualidadeAgenda]],
  [/tabela longa|muitas linhas/, 'Montei a tabela por dia, profissional e sala. Mostro as primeiras linhas; o resto fica no Excel.', [tabelaGenericaLonga]],
  [/sem meta/, 'A tarde de segunda tem 7 vagas livres em cada especialidade.', [tabelaGenericaSemMeta]],
  [/ranking/, 'Diva Rocha lidera com 33,3%. Ninguém chegou à meta de 80%.', [tabelaGenericaRanking]],
  [/capacidade/, 'As três especialidades estão sobrando, abaixo da meta.', [tabelaGenericaCapacidade]],
  [/personalizado|por dia e especialidade/, 'A ocupação das tardes ficou em 23,3%.', [tabelaGenericaPersonalizado]],
];

/** Resposta do mock para pedidos de relatório: 1 a 3 frases + blocos. */
export function gerarRelatorio(texto) {
  const t = texto.toLowerCase();
  const novo = NOVOS.find(([re]) => re.test(t));
  if (novo) return { content: novo[1], blocos: novo[2] };
  if (/todos os relat|relat[óo]rio completo|vis[ãa]o geral/.test(t)) {
    return {
      content: 'Helena Prado fechou a semana com 81,5%, acima da meta, mas a terça ficou em 68,4%. Psicomotricidade e Sala 7 são os pontos mais baixos da clínica.',
      blocos: [ocupacaoProfissional, pacientesSemana, ocupacaoAgregada],
    };
  }
  if (/parcial/.test(t)) {
    return { content: 'Consegui ler só parte da agenda da Helena Prado. Os números abaixo consideram os dias lidos.', blocos: [ocupacaoParcial] };
  }
  if (/pacientes por|quantos pacientes/.test(t)) {
    const dia = /hoje|quinta|\bdia\b/.test(t);
    return dia
      ? { content: 'Na quinta, 45 pacientes distintos passaram pela clínica. Helena Prado atendeu 15.', blocos: [pacientesDia] }
      : { content: 'Sophia Reis tem a maior média da semana: 13,6 pacientes por dia. Sábado é o dia mais vazio, com 13 pacientes na clínica.', blocos: [pacientesSemana] };
  }
  if (/ocupa/.test(t)) {
    if (/especialidade|sala|geral|cl[íi]nica/.test(t)) {
      return { content: 'Psicomotricidade (54,1%) e Sala 7 (50,0%) estão mais longe da meta de 80%.', blocos: [ocupacaoAgregada] };
    }
    return { content: 'Helena Prado fechou a semana com 81,5%, acima da meta. A terça ficou abaixo, com 68,4%.', blocos: [ocupacaoProfissional] };
  }
  return null;
}
