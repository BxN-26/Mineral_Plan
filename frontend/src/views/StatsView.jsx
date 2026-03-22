import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { PageHeader, Btn } from '../components/common';
import AvatarImg from '../components/AvatarImg';
import api from '../api/client';
import { useApp } from '../App';
import { computeFiscalYear } from '../utils/fiscal';

/* ── Helpers date ─────────────────────────────────────────────── */
function toMonday(d) {
  const day = d.getDay() === 0 ? -6 : 1 - d.getDay();
  const m = new Date(d);
  m.setDate(d.getDate() + day);
  const y = m.getFullYear(), mo = String(m.getMonth()+1).padStart(2,'0'), dd = String(m.getDate()).padStart(2,'0');
  return `${y}-${mo}-${dd}`;
}
function addWeeks(w, n) {
  const d = new Date(w + 'T12:00:00');
  d.setDate(d.getDate() + n * 7);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function addMonths(mStr, n) {
  const [y, m] = mStr.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function fmtWeek(w) {
  const d = new Date(w + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtMonth(m) {
  const d = new Date(m + '-01T12:00:00');
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
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

/* ── Tooltip ─────────────────────────────────────────────────── */
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

/* ── Sélecteur de période ───────────────────────────────────── */
const PeriodTab = ({ value, active, onClick, children }) => (
  <button onClick={() => onClick(value)} style={{
    padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 11, fontWeight: active ? 700 : 400,
    background: active ? '#C5753A' : 'transparent',
    color: active ? '#fff' : '#9B9890',
    transition: 'all .15s',
  }}>{children}</button>
);

/* ── Vue principale ───────────────────────────────────────────── */
export default function StatsView() {
  const now = new Date();
  const [period,    setPeriod]    = useState('week');
  const [week,      setWeek]      = useState(toMonday(now));
  const [viewMonth, setViewMonth] = useState(currentMonth());
  const [viewYear,  setViewYear]  = useState(String(now.getFullYear()));
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);

  const { settings } = useApp();
  const [fiscalOffset, setFiscalOffset] = useState(0);
  const fiscalYear = useMemo(() => computeFiscalYear(settings, new Date(), fiscalOffset), [settings, fiscalOffset]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = period === 'week'   ? `week=${week}` :
                period === 'month'  ? `period=month&month=${viewMonth}` :
                period === 'year'   ? `period=year&year=${viewYear}` :
                                     `period=fiscal&start=${fiscalYear.start}&end=${fiscalYear.end}`;
      const r = await api.get(`/stats?${q}`);
      setData(r.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [period, week, viewMonth, viewYear, fiscalYear]);

  useEffect(() => { load(); }, [load]);

  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const periodSub = period === 'week'   ? `Semaine du ${fmtWeek(week)}` :
                    period === 'month'  ? fmtMonth(viewMonth) :
                    period === 'fiscal' ? fiscalYear.label :
                                          `Année ${viewYear}`;
  const avgSub    = period === 'week'   ? 'sur la semaine' :
                    period === 'month'  ? 'sur le mois' :
                    period === 'fiscal' ? "sur l'exercice" :
                                          "sur l'année";

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PageHeader title="Statistiques" sub={periodSub} />

      {/* Toolbar */}
      <div style={{ padding: '8px 24px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Sélecteur de période */}
        <div style={{ display: 'flex', gap: 2, background: '#F5F3EF', borderRadius: 7, padding: 2 }}>
          <PeriodTab value="week"   active={period === 'week'}   onClick={setPeriod}>📅 Semaine</PeriodTab>
          <PeriodTab value="month"  active={period === 'month'}  onClick={setPeriod}>📆 Mois</PeriodTab>
          <PeriodTab value="year"   active={period === 'year'}   onClick={setPeriod}>🗓 Année</PeriodTab>
          <PeriodTab value="fiscal" active={period === 'fiscal'} onClick={setPeriod}>📋 Exercice</PeriodTab>
        </div>

        {/* Navigation selon la période */}
        {period === 'week' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Btn small onClick={() => setWeek(w => addWeeks(w, -1))}>‹</Btn>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1E2235', minWidth: 140, textAlign: 'center' }}>
              {fmtWeek(week)}
            </span>
            <Btn small onClick={() => setWeek(w => addWeeks(w, 1))}>›</Btn>
            <Btn small onClick={() => setWeek(toMonday(new Date()))} variant="ghost">Auj.</Btn>
          </div>
        )}
        {period === 'month' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Btn small onClick={() => setViewMonth(m => addMonths(m, -1))}>‹</Btn>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1E2235', minWidth: 120, textAlign: 'center' }}>
              {fmtMonth(viewMonth)}
            </span>
            <Btn small onClick={() => setViewMonth(m => addMonths(m, 1))}>›</Btn>
            <Btn small onClick={() => setViewMonth(currentMonth())} variant="ghost">Ce mois</Btn>
          </div>
        )}
        {period === 'year' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Btn small onClick={() => setViewYear(y => String(parseInt(y) - 1))}>‹</Btn>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1E2235', minWidth: 60, textAlign: 'center' }}>
              {viewYear}
            </span>
            <Btn small onClick={() => setViewYear(y => String(parseInt(y) + 1))}>›</Btn>
            <Btn small onClick={() => setViewYear(String(new Date().getFullYear()))} variant="ghost">Cette année</Btn>
          </div>
        )}
        {period === 'fiscal' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Btn small onClick={() => setFiscalOffset(o => o - 1)}>‹</Btn>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1E2235', minWidth: 200, textAlign: 'center' }}>
              {fiscalYear.label}
            </span>
            <Btn small onClick={() => setFiscalOffset(o => o + 1)}>›</Btn>
            <Btn small onClick={() => setFiscalOffset(0)} variant="ghost">En cours</Btn>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9B9890' }}>Chargement…</div>}

        {!loading && data && (
          <>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
              <KpiCard icon="⏱️" label="Heures planifiées" value={`${data.kpi.total_hours.toFixed(1)} h`} color="#C5753A" />
              <KpiCard icon="👥" label="Salariés actifs"   value={data.kpi.active_staff} color="#6366F1" />
              <KpiCard icon="📊" label="Moy. par personne" value={`${data.kpi.avg_hours.toFixed(1)} h`} color="#14B8A6" sub={avgSub} />
              <KpiCard icon="🏖️" label="Absences congés"   value={data.kpi.leaves_count ?? 0} color="#F97316" />
            </div>

            {/* Graphique d'évolution (mois/année) */}
            {data.by_period?.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)', marginBottom: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>
                  {period === 'month' ? '📈 Évolution par semaine' : '📈 Évolution par mois'}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.by_period} margin={{ left: 0, right: 10 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="hours" name="Heures" fill="#C5753A" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 2 colonnes charts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>
              {/* Heures par personne */}
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Heures par salarié</div>
                {data.hours_by_staff?.filter(s => s.hours > 0).length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.hours_by_staff.filter(s => s.hours > 0)} layout="vertical" margin={{ left: 0, right: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="hours" name="Heures" radius={[0,4,4,0]}>
                        {data.hours_by_staff.filter(s => s.hours > 0).map((s, i) => <Cell key={i} fill={s.color || '#C5753A'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', padding: 24, color: '#9B9890', fontSize: 13 }}>Aucune donnée</div>}
              </div>

              {/* Couverture par jour (semaine) OU espace vide (mois/année) */}
              {period === 'week' && data.hours_by_day && (
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
              )}

              {/* Répartition par fonction */}
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Répartition par fonction</div>
                {data.hours_by_fn?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.hours_by_fn} dataKey="hours" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={3}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {data.hours_by_fn.map((fn, i) => <Cell key={i} fill={fn.color || '#6366F1'} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v.toFixed(1)} h`]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', padding: 24, color: '#9B9890', fontSize: 13 }}>Aucune donnée</div>}
              </div>

              {/* Congés par type */}
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Congés par type</div>
                {data.leaves_by_type?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.leaves_by_type} dataKey="count" nameKey="label" outerRadius={80} innerRadius={40} paddingAngle={3}>
                        {data.leaves_by_type.map((t, i) => <Cell key={i} fill={t.color || '#E8A06A'} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [v, 'absences']} />
                      <Legend iconSize={10} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', padding: 24, color: '#9B9890', fontSize: 13 }}>Aucune absence sur la période</div>}
              </div>
            </div>

            {/* Par équipe */}
            {data.team_stats?.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)', marginBottom: 20 }}>
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
                          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: t.color, marginRight: 7, verticalAlign: 'middle' }}/>
                          {t.name}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#6B6860' }}>{t.members}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{t.hours.toFixed(1)} h</td>
                        <td style={{ padding: '8px 10px', color: '#6B6860' }}>{t.members ? (t.hours / t.members).toFixed(1) : '—'} h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Détail par salarié */}
            {data.hours_by_staff?.filter(s => s.hours > 0).length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Détail par salarié</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {data.hours_by_staff.filter(s => s.hours > 0).map(s => (
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
          <div style={{ textAlign: 'center', padding: 40, color: '#9B9890' }}>Impossible de charger les statistiques.</div>
        )}
      </div>
    </div>
  );
}

