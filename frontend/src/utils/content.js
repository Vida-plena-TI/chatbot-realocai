// Leitura do `content` das mensagens do assistente.
// Uma proposta vem como bloco ```proposta {json} ``` (ou ```json```) dentro do texto.
const BLOCK = /```(?:proposta|json)\s*\n?([\s\S]*?)```/i;

const slot = (s = {}) => ({
  horario: s.horario || '—',
  sala: s.sala || '',
  profissional: s.profissional || '',
  dia: s.dia || '',
});

export function parseContent(content = '') {
  const match = content.match(BLOCK);
  if (match) {
    try {
      const p = JSON.parse(match[1]);
      if (p && p.paciente && p.para) {
        return {
          text: content.replace(match[0], '').trim(),
          proposal: { paciente: String(p.paciente), de: slot(p.de), para: slot(p.para), motivo: p.motivo || '' },
        };
      }
    } catch {
      /* bloco inválido: exibe como texto */
    }
  }
  return { text: content.trim(), proposal: null };
}

// Decisões sobre propostas são enviadas como mensagens do usuário com estes prefixos.
export const DECISION = { approve: 'Proposta aprovada', reject: 'Proposta recusada' };

export function decisionOf(content = '') {
  if (content.startsWith(DECISION.approve)) return 'aprovada';
  if (content.startsWith(DECISION.reject)) return 'recusada';
  return null;
}

const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
const clip = (s, max) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export const summarize = (content, max = 90) => clip(oneLine(parseContent(content).text), max);
export const titleFrom = (content, max = 60) => clip(oneLine(content), max);
