import { Clock } from 'lucide-react';
import s from './reports.module.css';
import { ResumoCards } from './parts';
import { int, ouTraco, rotuloDia, rotuloEspecialidade } from './format';

// Sem meta: uma cor só, largura relativa ao convênio com mais sessões no bloco.
const largura = (v, max) => `${max ? Math.max(2, (v / max) * 100) : 0}%`;

function Aguardando({ n }) {
  if (!n) return <span className={s.muted}>0</span>;
  return (
    <span className={`${s.badge} ${s['badge-warn']}`}>
      <Clock size={12} strokeWidth={3} aria-hidden="true" />
      {int(n)}
    </span>
  );
}

/**
 * Somente contagens: este bloco nunca traz pacientes.
 * @param {{bloco: import('./types').BlocoConvenio}} props
 */
export function Convenio({ bloco }) {
  const { por_convenio: itens = [], aguardando = [] } = bloco.dados;
  const max = Math.max(0, ...itens.map((i) => i.sessoes));

  return (
    <>
      <ResumoCards resumo={bloco.resumo} />

      {itens.length > 0 && (
        <div className={s.block}>
          <h4 className={s.blockTitle}>Por convênio</h4>
          <div className={`${s.tableWrap} ${s.wideOnly}`}>
            <table className={`${s.table} ${s.dense}`}>
              <caption className="sr-only">Sessões por convênio</caption>
              <thead>
                <tr>
                  <th scope="col">Convênio</th>
                  <th scope="col">Sessões</th>
                  <th scope="col" className={s.num}>Pacientes distintos</th>
                  <th scope="col" className={s.num}>Slots ocupados</th>
                  <th scope="col" className={s.num}>Aguardando autorização</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.convenio}>
                    <th scope="row">{ouTraco(i.rotulo)}</th>
                    <td>
                      <div className={s.barCell}>
                        <div className={s.meter} role="img" aria-label={`${i.rotulo}: ${i.sessoes} sessões`}>
                          <div className={`${s.meterFill} ${s.fillBrand}`} style={{ width: largura(i.sessoes, max) }} />
                        </div>
                        <strong>{int(i.sessoes)}</strong>
                      </div>
                    </td>
                    <td className={s.num}>{int(i.pacientes_distintos)}</td>
                    <td className={s.num}>{int(i.slots_ocupados)}</td>
                    <td className={s.num}><Aguardando n={i.aguardando_autorizacao} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`${s.dayList} ${s.compactOnly}`}>
            {itens.map((i) => (
              <div key={i.convenio} className={s.dayCard}>
                <div className={s.row}>
                  <strong className={s.grow}>{ouTraco(i.rotulo)}</strong>
                  <span className={s.dayPct}>{int(i.sessoes)}</span>
                </div>
                <div className={s.meter} role="img" aria-label={`${i.rotulo}: ${i.sessoes} sessões`}>
                  <div className={`${s.meterFill} ${s.fillBrand}`} style={{ width: largura(i.sessoes, max) }} />
                </div>
                <div className={`${s.row} ${s.spread}`} style={{ flexWrap: 'wrap' }}>
                  <span className={s.dayMeta}>
                    <span><b>{int(i.pacientes_distintos)}</b> {i.pacientes_distintos === 1 ? 'paciente distinto' : 'pacientes distintos'}</span>
                    <span><b>{int(i.slots_ocupados)}</b> {i.slots_ocupados === 1 ? 'slot' : 'slots'}</span>
                  </span>
                  {i.aguardando_autorizacao > 0 && (
                    <span className={s.row} style={{ gap: 6, fontSize: 12.5 }}>
                      Aguardando <Aguardando n={i.aguardando_autorizacao} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={s.block}>
        <h4 className={s.blockTitle}>Aguardando autorização</h4>
        {aguardando.length ? (
          <ul className={s.plainList}>
            {aguardando.map((a) => (
              <li key={`${a.data}-${a.profissional.id}`}>
                <span className={s.plainDay}>{rotuloDia(a.data)}</span>
                <span className={s.grow}>
                  <strong>{ouTraco(a.profissional.nome)}</strong>{' '}
                  <span className={s.muted}>· {rotuloEspecialidade(a.profissional.especialidade)}</span>
                </span>
                <Aguardando n={a.sessoes} />
                <span className="sr-only">{a.sessoes === 1 ? 'sessão' : 'sessões'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${s.pad} ${s.muted}`} style={{ margin: 0, fontSize: 13.5 }}>Nenhuma sessão aguardando autorização no período.</p>
        )}
      </div>
    </>
  );
}
