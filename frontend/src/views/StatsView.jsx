import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { PageHeader, Btn } from '../components/common';
import AvatarImg from '../components/AvatarImg';
import api from '../api/client';

/* ── Helpers date ─────────────────────────────────────────────── */
function toMonday(d) {
  const day = d.getDay() === 0 ? -6 : 1 - d.getDay();
  const m = new Date(d);
  m.setDate(d.getDate() + day);
  return m.toISOString().slice(0, 10);
}
function addWeeks(w, n) {
  const d = new Date(w + 'T12:00:00');
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}
function fmtWeek(w) {
  const d = new Date(w + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── KPI card ─────────────────────────────────────────────────── */
const KpiCard = ({ label, value, sub, color = '#C5753A', icon }) => (
  <div style={{
    background: '#fff', borderRadius: 12, padding: '16px 20px',
    boxShadow: '0 1px 6px rgba(0,0,0,.06)', flex: 1, minWidth: 160,
    borderLeft: `4px solid ${color}`,
  }}>
    <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
    <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E2235', marginTop: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: '#9B9890', marginTop: 2 }}>{sub}</div>}
  </div>
);

/* ── Tooltip personnalisé ─────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1E2235', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name}>
          <span style={{ color: p.fill || p.color }}>{p.name}: </span>
          <span>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value} h</span>
        </div>
      ))}
    </div>
  );
};

/* ── Vue principale ───────────────────────────────────────────── */
export default function StatsView() {
  const [week, setWeek]   = useState(toMonday(new Date()));
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (w) => {
    setLoading(true);
    try {
      const r = await api.get(`/stats?week=${w}`);
      setData(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(week); }, [week, load]);

  const nav = (delta) => setWeek(w => addWeeks(w, delta));

  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PageHeader
        title="Statistiques"
        sub="Analyse des plannings et présences"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Btn small onClick={() => nav(-1)}>‹ Préc.</Btn>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1E2235', minWidth: 160, textAlign: 'center' }}>
              Sem. du {fmtWeek(week)}
            </span>
            <Btn small onClick={() => nav(1)}>Suiv. ›</Btn>
            <Btn small onClick={() => setWeek(toMonday(new Date()))} variant="ghost">Aujourd'hui</Btn>
          </div>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9B9890' }}>Chargement…</div>
        )}

        {!loading && data && (
          <>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
              <KpiCard icon="⏱️" label="Heures planifiées" value={`${data.kpi.total_hours.toFixed(1)} h`} color="#C5753A" />
              <KpiCard icon="👥" label="Salariés actifs" value={data.kpi.active_staff} color="#6366F1" />
              <KpiCard icon="📊" label="Moy. par personne" value={`${data.kpi.avg_hours.toFixed(1)} h`} color="#14B8A6" sub="sur la semaine" />
              <KpiCard icon="🏖️" label="Absences congés" value={data.kpi.leaves_count ?? 0} color="#F97316" />
            </div>

            {/* 2 colonnes charts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>

              {/* Heures par personne */}
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Heures par salarié</div>
                {data.hours_by_staff?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.hours_by_staff} layout="vertical" margin={{ left: 0, right: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="hours" name="Heures" radius={[0,4,4,0]}>
                        {data.hours_by_staff.map((s, i) => (
                          <Cell key={i} fill={s.color || '#C5753A'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: 'center', padding: 24, color: '#9B9890', fontSize: 13 }}>Aucune donnée</div>
                )}
              </div>

              {/* Heures par jour */}
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Couverture par jour</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={(data.hours_by_day || []).map((h, i) => ({ day: DAYS[i], hours: h }))}>
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="hours" name="Heures" fill="#C5753A" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Répartition par fonction */}
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Répartition par fonction</div>
                {data.hours_by_fn?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.hours_by_fn} dataKey="hours" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {data.hours_by_fn.map((fn, i) => (
                          <Cell key={i} fill={fn.color || '#6366F1'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v.toFixed(1)} h`]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: 'center', padding: 24, color: '#9B9890', fontSize: 13 }}>Aucune donnée</div>
                )}
              </div>

              {/* Congés par type */}
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Congés par type</div>
                {data.leaves_by_type?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.leaves_by_type} dataKey="count" nameKey="label" outerRadius={80} innerRadius={40} paddingAngle={3}>
                        {data.leaves_by_type.map((t, i) => (
                          <Cell key={i} fill={t.color || '#E8A06A'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [v, 'absences']} />
                      <Legend iconSize={10} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: 'center', padding: 24, color: '#9B9890', fontSize: 13 }}>Aucune absence cette semaine</div>
                )}
              </div>
            </div>

            {/* Tableau équipes */}
            {data.team_stats?.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Par équipe</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #F0EDE8' }}>
                      {['Équipe','Membres','Heures totales','Moy/personne'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#6B6860', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.team_stats.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid #F7F4F0' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            display: 'inline-block', width: 10, height: 10, borderRadius: 3,
                            background: t.color, marginRight: 7, verticalAlign: 'middle',
                          }}/>
                          {t.name}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#6B6860' }}>{t.members}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{t.hours.toFixed(1)} h</td>
                        <td style={{ padding: '8px 10px', color: '#6B6860' }}>
                          {t.members ? (t.hours / t.members).toFixed(1) : '—'} h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top salariés */}
            {data.hours_by_staff?.length > 0 && (
              <div style={{ marginTop: 20, background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Détail par salarié</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {data.hours_by_staff.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: '#F9F7F4' }}>
                      <AvatarImg s={s} size={36} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235' }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: '#6B6860' }}>{s.hours.toFixed(1)} h · {s.team || 'Aucune équipe'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !data && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9B9890' }}>
            Impossible de charger les statistiques.
          </div>
        )}
      </div>
    </div>
  );
}
