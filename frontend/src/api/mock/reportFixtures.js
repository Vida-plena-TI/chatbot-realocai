import { ocupacaoAgregada, ocupacaoProfissional, ocupacaoParcial, pacientesDia, pacientesSemana } from '../../reports/sampleBlocks';

/** Resposta do mock para pedidos de relatório: 1 a 3 frases + blocos. */
export function gerarRelatorio(texto) {
  const t = texto.toLowerCase();
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
