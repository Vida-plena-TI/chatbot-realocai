// Dados fictícios. Nunca use nomes, CPFs ou diagnósticos que pareçam reais.
import { summarize } from '../../utils/content';

export const MOCK_USER = {
  id: 1,
  email: 'equipe@clinica.test',
  full_name: 'Equipe de Agendamento',
  is_staff: false,
};
export const MOCK_PASSWORD = 'demo1234';

const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600e3).toISOString();
const bloco = (p) => `\n\n\`\`\`proposta\n${JSON.stringify(p, null, 2)}\n\`\`\``;

function conversa(id, title, hoursAgo, status, turns) {
  const messages = turns.map(([role, content], i) => ({
    id: id * 100 + i + 1,
    seq: i + 1,
    role,
    content,
    created_at: iso(hoursAgo + (turns.length - 1 - i) * 0.02),
  }));
  const last = messages[messages.length - 1];
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  return {
    id,
    title,
    status,
    summary: lastAssistant ? summarize(lastAssistant.content) : '',
    created_at: messages[0]?.created_at ?? iso(hoursAgo),
    updated_at: last?.created_at ?? iso(hoursAgo),
    messages,
  };
}

export function seedConversations() {
  return [
    conversa(1, 'Remarcar fono do Paciente A', 1, 'active', [
      ['user', 'Paciente A precisa sair mais cedo amanhã. Dá para passar a fono das 16:30 para a manhã?'],
      ['assistant', 'Encontrei um horário livre pela manhã com a mesma profissional e na mesma sala.' + bloco({
        paciente: 'Paciente A',
        de: { horario: '16:30', sala: 'Sala 2', profissional: 'Profissional B', dia: 'Amanhã' },
        para: { horario: '09:30', sala: 'Sala 2', profissional: 'Profissional B', dia: 'Amanhã' },
        motivo: 'Mantém a mesma profissional e libera a tarde.',
      })],
      ['user', 'Proposta aprovada: Paciente A, 16:30 → 09:30 (Sala 2, Profissional B).'],
      ['assistant', 'Registrado. Aplique a mudança no sistema de agenda e avise a família.'],
    ]),
    conversa(2, 'Encaixe de avaliação de TO', 3, 'active', [
      ['user', 'Preciso encaixar uma avaliação de terapia ocupacional para o Paciente C hoje à tarde.'],
      ['assistant', 'Há um único horário livre de terapia ocupacional hoje à tarde.' + bloco({
        paciente: 'Paciente C',
        de: { horario: '—', sala: 'Fila de espera', profissional: '—', dia: '' },
        para: { horario: '14:00', sala: 'Sala 3', profissional: 'Profissional C', dia: 'Hoje' },
        motivo: 'Único horário livre de TO depois das 13:00.',
      })],
    ]),
    conversa(3, 'Horários livres de psicomotricidade', 26, 'active', [
      ['user', 'Quais horários de psicomotricidade estão livres amanhã de manhã?'],
      ['assistant', 'Psicomotricidade, amanhã de manhã:\n- 08:00 — Sala 4, Profissional D\n- 10:30 — Sala 4, Profissional D\n- 09:00 — Sala 11, Profissional F\n- 11:30 — Sala 11, Profissional F'],
    ]),
    conversa(4, 'Sala 7 em manutenção', 120, 'archived', [
      ['user', 'A Sala 7 vai ficar fechada na quinta. Para onde vão os atendimentos?'],
      ['assistant', 'Na quinta a Sala 7 tem 3 atendimentos. A Sala 9 está livre das 13:00 às 16:00 e comporta todos:\n- 13:00 Paciente D → Sala 9\n- 14:00 Paciente E → Sala 9\n- 15:30 Paciente F → Sala 9'],
    ]),
  ];
}

export function gerarResposta(content) {
  const t = content.toLowerCase();
  if (t.startsWith('proposta aprovada')) return 'Registrado. Aplique a mudança no sistema de agenda e avise a família.';
  if (t.startsWith('proposta recusada')) return 'Tudo bem, nada foi alterado. Quer que eu procure outra opção?';
  if (/outra op/.test(t)) {
    return 'Tenho mais uma opção, um pouco mais tarde e com a mesma especialidade.' + bloco({
      paciente: 'Paciente A',
      de: { horario: '16:30', sala: 'Sala 2', profissional: 'Profissional B', dia: 'Hoje' },
      para: { horario: '17:00', sala: 'Sala 8', profissional: 'Profissional G', dia: 'Hoje' },
      motivo: 'Mesma especialidade; a Sala 2 está ocupada nesse horário.',
    });
  }
  if (/encaix/.test(t)) {
    return 'Há um horário livre hoje à tarde para o encaixe.' + bloco({
      paciente: 'Paciente novo',
      de: { horario: '—', sala: 'Fila de espera', profissional: '—', dia: '' },
      para: { horario: '15:00', sala: 'Sala 8', profissional: 'Profissional G', dia: 'Hoje' },
      motivo: 'Primeiro horário livre de fonoaudiologia depois das 13:00.',
    });
  }
  if (/remarc|mudar|trocar hor|passar|não pode vir|nao pode vir/.test(t)) {
    return 'Encontrei um horário com a mesma profissional.' + bloco({
      paciente: 'Paciente A',
      de: { horario: '16:30', sala: 'Sala 2', profissional: 'Profissional B', dia: 'Hoje' },
      para: { horario: '10:00', sala: 'Sala 2', profissional: 'Profissional B', dia: 'Hoje' },
      motivo: 'Mantém a continuidade com a mesma profissional.',
    });
  }
  if (/sala/.test(t)) {
    return 'A Sala 3 tem 2 atendimentos à tarde. A Sala 9 está livre no mesmo período.' + bloco({
      paciente: 'Paciente B',
      de: { horario: '14:00', sala: 'Sala 3', profissional: 'Profissional C', dia: 'Hoje' },
      para: { horario: '14:00', sala: 'Sala 9', profissional: 'Profissional C', dia: 'Hoje' },
      motivo: 'Mesmo horário e profissional; só muda a sala.',
    });
  }
  if (/autoriza|confirm/.test(t)) {
    return 'Atendimentos de hoje aguardando autorização:\n- 09:00 — Paciente G, Sala 5\n- 14:30 — Paciente H, Sala 10\n- 16:00 — Paciente I, Sala 1';
  }
  if (/livre|dispon|horári|horari|agenda/.test(t)) {
    return 'Horários livres hoje:\n- 10:30 — Sala 1, Profissional A (Psicologia)\n- 11:00 — Sala 1, Profissional A (Psicologia)\n- 15:00 — Sala 10, Profissional H (Psicologia)\n- 16:30 — Sala 10, Profissional H (Psicologia)';
  }
  return 'Posso consultar a agenda, listar horários livres e sugerir remarcações, encaixes ou troca de sala. Me diga o paciente, a especialidade ou o horário.';
}
