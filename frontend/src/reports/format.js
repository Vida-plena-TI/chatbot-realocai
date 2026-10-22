// Formatação apenas. A tela nunca recalcula os números do bloco.

/** Faixas de cor da ocupação (ajustáveis). A meta vem do bloco. */
export const FAIXA_ATENCAO = 0.6;

const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WDL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const halfUp1 = (x) => Math.floor(Number(x.toFixed(9)) * 10 + 0.5) / 10;

/** 0.81481 → "81,5%" (half-up, uma casa, vírgula). */
export const pct = (f) => `${halfUp1(f * 100).toFixed(1).replace('.', ',')}%`;
/** 11.666 → "11,7" */
export const dec1 = (n) => halfUp1(n).toFixed(1).replace('.', ',');
export const int = (n) => new Intl.NumberFormat('pt-BR').format(n);

const toDate = (iso) => new Date(`${iso}T12:00:00`);
export const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const ddmmaaaa = (iso) => `${ddmm(iso)}/${iso.slice(0, 4)}`;
export const diaCurto = (iso) => WD[toDate(iso).getDay()];
export const diaLongo = (iso) => WDL[toDate(iso).getDay()];
export const rotuloDia = (iso) => `${diaCurto(iso)} ${ddmm(iso)}`;

export function periodo({ inicio, fim }) {
  if (inicio === fim) return `${diaLongo(inicio)}, ${ddmmaaaa(inicio)}`;
  return `${ddmm(inicio)} a ${ddmmaaaa(fim)}`;
}

/** @returns {'ok'|'warn'|'low'} */
export function faixa(f, meta = 0.8) {
  if (f >= meta) return 'ok';
  if (f >= FAIXA_ATENCAO) return 'warn';
  return 'low';
}

export function statusMeta(abaixo, faltam, curto = false) {
  if (!abaixo) return 'Meta atingida';
  return !curto && faltam ? `Abaixo da meta · faltam ${faltam}` : 'Abaixo da meta';
}

/** Ocupados sem escala (escalados 0): inconsistência de dados, nunca "Meta atingida". */
export const semEscala = (escalados, ocupados) => escalados === 0 && ocupados > 0;

/** Texto do selo, considerando o caso sem escala. */
export const rotuloStatus = (sem, abaixo, faltam, curto = false) =>
  sem ? 'Sem escala' : statusMeta(abaixo, faltam, curto);

/** Percentual só quando é número finito; senão "—". Não recalcula nada. */
export const pctOuTraco = (f) => (Number.isFinite(f) ? pct(f) : '—');

/** Decimal com uma casa só quando é número finito; senão "—". */
export const dec1OuTraco = (n) => (Number.isFinite(n) ? dec1(n) : '—');

/** Valor ausente nunca vira "undefined" na tela. */
export const ouTraco = (v) => (v == null || v === '' ? '—' : v);

/** Rótulo acessível da barra: "Terça: 68,4%, abaixo da meta". */
export const ariaOcupacao = (rotulo, percentual, sem, abaixo) =>
  `${rotulo}: ${pctOuTraco(percentual)}, ${sem ? 'sem escala' : abaixo ? 'abaixo da meta' : 'meta atingida'}`;

/** Prefere `exibicao` do resumo quando existir. */
export function exibir(bloco, rotulo, fallback) {
  const item = bloco.resumo?.find((r) => r.rotulo === rotulo);
  return item?.exibicao ?? fallback;
}

/** true/false → "Sim"/"Não" (o agente manda booleanos em colunas de formato "texto"). */
export const simNao = (v) => (v ? 'Sim' : 'Não');

/** Valor de célula pelo `formato` da coluna do contrato. Vazio vira "—"; nunca recalcula. */
export function formatarValor(valor, formato) {
  if (valor == null || valor === '') return '—';
  if (typeof valor === 'boolean') return simNao(valor);
  if (typeof valor !== 'number' && ['percentual', 'inteiro', 'decimal'].includes(formato)) return String(valor);
  if (formato === 'percentual') return pct(valor);
  if (formato === 'inteiro') return int(valor);
  if (formato === 'decimal') return dec1(valor);
  if (formato === 'data') return ddmmaaaa(valor);
  return String(valor);
}

/** Cada slot da grade tem 30 minutos (contrato do RealocAI). */
export const MINUTOS_POR_SLOT = 30;
export const slotsEmMinutos = (slots) => slots * MINUTOS_POR_SLOT;

/** 30 → "30 min", 60 → "1 h", 90 → "1 h 30" (mesma grafia dos títulos do agente). */
export function duracao(min) {
  if (!Number.isFinite(min)) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Duração de N slots: "4 slots · 2 h". */
export const slotsDuracao = (slots) =>
  Number.isFinite(slots) ? `${int(slots)} ${slots === 1 ? 'slot' : 'slots'} · ${duracao(slotsEmMinutos(slots))}` : '—';

/** "manha" → "Manhã". */
export const rotuloTurno = (p) => ({ manha: 'Manhã', tarde: 'Tarde' })[p] || ouTraco(p);

/** "Segunda, 28/09/2026". */
export const diaCompleto = (iso) => `${diaLongo(iso)}, ${ddmmaaaa(iso)}`;

/**
 * Especialidade de `dados.*.profissional` vem como identificador ("terapia_ocupacional"); nas
 * tabelas e nos tipos novos já vem rotulada. Só ajusta a grafia do identificador, sem traduzir.
 */
export function rotuloEspecialidade(v) {
  if (v == null || v === '') return '—';
  if (!/^[a-z0-9_]+$/.test(v)) return v;
  return v
    .split('_')
    .map((w, i) => (i && ['de', 'da', 'do', 'e'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const TIPOS = {
  ocupacao_profissional: 'Ocupação da profissional',
  pacientes_por_profissional: 'Pacientes por profissional',
  ocupacao_agregada: 'Ocupação agregada',
  disponibilidade: 'Disponibilidade',
  convenio: 'Convênios',
  agenda_paciente: 'Agenda do paciente',
  qualidade_agenda: 'Qualidade da agenda',
  tabela_generica: 'Relatório',
};
export const rotuloTipo = (tipo) => TIPOS[tipo] || 'Relatório';

// A aba nunca mostra o nome do paciente: em agenda_paciente fica só o tipo.
export function tituloAba(b) {
  if (b.tipo === 'ocupacao_profissional') return `Ocupação · ${b.dados.profissional.nome}`;
  if (b.tipo === 'disponibilidade') return b.dados?.minutos_por_janela > MINUTOS_POR_SLOT ? `Janelas de ${duracao(b.dados.minutos_por_janela)}` : 'Vagas livres';
  return rotuloTipo(b.tipo);
}

const hoje = () => new Date().toISOString().slice(0, 10);
export function nomeArquivo(blocos, formato) {
  const tipo = blocos.length === 1 ? blocos[0].tipo : 'relatorios';
  return `realocai-${tipo}-${hoje()}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`;
}

/** Heurística para mostrar o esqueleto do relatório enquanto o agente responde. */
export const pareceRelatorio = (texto = '') =>
  /ocupa|pacientes por|quantos pacientes|relat[óo]rio|vagas?\b|hor[áa]rios? (vagos|livres)|janelas?|disponibilidade|conv[êe]nio|autoriza[çc]|agenda d[aoe]|buracos?|fragmenta|ranking|capacidade/i.test(texto);
