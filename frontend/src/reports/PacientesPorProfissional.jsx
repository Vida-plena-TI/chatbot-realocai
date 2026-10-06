import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import s from './reports.module.css';
import { dec1OuTraco, ddmm, diaCurto, diaLongo, exibir, ouTraco } from './format';

// Métrica sem meta: uma cor só, intensidade relativa ao maior valor do bloco.
const nivel = (v, max) => (v ? Math.max(1, Math.ceil((v / max) * 5)) : 0);
const agrupar = (lista) =>
  lista.reduce((acc, p) => {
    (acc[ouTraco(p.especialidade)] ||= []).push(p);
    return acc;
  }, {});

/** @param {{bloco: import('./types').BlocoPacientesPorProfissional}} props */
export function PacientesPorProfissional({ bloco }) {
  return bloco.dados.escopo === 'dia' ? <EscopoDia bloco={bloco} /> : <EscopoSemana bloco={bloco} />;
}

function Legenda() {
  return (
    <span className={s.legend} aria-hidden="true">
      Menos <i className={s.h1} /><i className={s.h2} /><i className={s.h3} /><i className={s.h4} /><i className={s.h5} /> Mais
    </span>
  );
}

function EscopoSemana({ bloco }) {
  const { profissionais, clinica_por_dia: clinica } = bloco.dados;
  const datas = clinica.map((c) => c.data);
  const max = useMemo(() => Math.max(1, ...profissionais.flatMap((p) => p.dias.map((d) => d.pacientes))), [profissionais]);
  const grupos = useMemo(() => agrupar(profissionais), [profissionais]);
  const [fechadas, setFechadas] = useState({});

  const celula = (p, data) => {
    const d = p.dias.find((x) => x.data === data);
    return { v: d ? String(d.pacientes) : '—', cls: s[`h${nivel(d?.pacientes, max)}`], aria: `${diaLongo(data)}: ${d ? `${d.pacientes} pacientes` : 'sem agenda'}` };
  };

  return (
    <>
      <div className={`${s.pad} ${s.row} ${s.spread}`} style={{ flexWrap: 'wrap', paddingBottom: 4 }}>
        <span className={s.sub}>Pacientes por dia. Cor mais forte, dia mais cheio. Esta métrica não tem meta.</span>
        <Legenda />
      </div>

      {Object.entries(grupos).map(([esp, profs]) => {
        const aberta = !fechadas[esp];
        return (
          <div key={esp} className={s.section}>
            <button type="button" className={s.sectionBtn} aria-expanded={aberta} onClick={() => setFechadas((f) => ({ ...f, [esp]: !f[esp] }))}>
              <ChevronDown size={16} strokeWidth={2.6} className={`${s.chev} ${aberta ? '' : s.chevClosed}`} aria-hidden="true" />
              <strong>{esp}</strong>
              <span>{profs.length} {profs.length === 1 ? 'profissional' : 'profissionais'}</span>
            </button>
            {aberta && (
              <>
                <div className={`${s.tableWrap} ${s.wideOnly}`}>
                  <table className={s.heatTable}>
                    <caption className="sr-only">Pacientes por dia em {esp}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Profissional</th>
                        {datas.map((d) => (
                          <th key={d} scope="col">{diaCurto(d)} <span style={{ fontWeight: 600 }}>{ddmm(d)}</span></th>
                        ))}
                        <th scope="col">Média/dia</th>
                        <th scope="col">Distintos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profs.map((p) => (
                        <tr key={p.nome}>
                          <th scope="row">{p.nome}</th>
                          {datas.map((d) => {
                            const c = celula(p, d);
                            return <td key={d} className={c.cls} aria-label={c.aria}>{c.v}</td>;
                          })}
                          <td className={s.plain}>
                            <strong>{dec1OuTraco(p.media_pacientes_por_dia)}</strong>{' '}
                            <span className={s.muted} style={{ fontSize: 11.5 }}>em {p.dias.length} dias</span>
                          </td>
                          <td className={s.plain}><strong>{p.pacientes_distintos_semana}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`${s.dayList} ${s.compactOnly}`}>
                  {profs.map((p) => (
                    <div key={p.nome} className={s.profCard}>
                      <div className={`${s.row} ${s.spread}`}>
                        <strong>{p.nome}</strong>
                        <span className={s.muted} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          <b style={{ color: 'var(--text)' }}>{dec1OuTraco(p.media_pacientes_por_dia)}</b>/dia ·{' '}
                          <b style={{ color: 'var(--text)' }}>{p.pacientes_distintos_semana}</b> distintos
                        </span>
                      </div>
                      <div className={s.mini}>
                        {datas.map((d) => {
                          const c = celula(p, d);
                          return (
                            <div key={d} className={c.cls} aria-label={c.aria}>
                              <small>{diaCurto(d)}</small>
                              <b>{c.v}</b>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      <div className={s.clinic}>
        Clínica · pacientes distintos por dia
        <div className={s.mini}>
          {clinica.map((c) => (
            <div key={c.data} aria-label={`${diaLongo(c.data)}: ${c.pacientes_distintos} pacientes distintos`}>
              <small>{diaCurto(c.data)}</small>
              <b>{c.pacientes_distintos}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function EscopoDia({ bloco }) {
  const { profissionais, clinica_por_dia: clinica } = bloco.dados;
  const max = Math.max(1, ...profissionais.map((p) => p.dias[0]?.pacientes ?? 0));
  const total = exibir(bloco, 'Pacientes distintos na clínica no dia', String(clinica[0]?.pacientes_distintos ?? '—'));
  return (
    <>
      <div className={s.dayTotal}>
        <strong>{total}</strong>
        <span className={s.sub}>pacientes distintos na clínica</span>
      </div>
      {Object.entries(agrupar(profissionais)).map(([esp, profs]) => (
        <div key={esp}>
          <div className={s.groupName}>{esp}</div>
          {profs.map((p) => {
            const d = p.dias[0];
            return (
              <div key={p.nome} className={s.dayItem}>
                <span className={s.grow} style={{ fontWeight: 700 }}>{p.nome}</span>
                <span className={s.muted} style={{ fontSize: 12 }}>{d.sessoes} sessões</span>
                <b className={s[`h${nivel(d.pacientes, max)}`]} aria-label={`${d.pacientes} pacientes`}>{d.pacientes}</b>
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ height: 10 }} />
    </>
  );
}
