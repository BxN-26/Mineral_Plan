import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { PageHeader, Btn } from '../components/common';
import AvatarImg from '../components/AvatarImg';
import { useApp } from '../App';
import api from '../api/client';
import { computeFiscalYear } from '../utils/fiscal';

/* ── Helpers ─────────────────────────────────────────────────── */
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
function fmtPeriodLabel(data) {
  return data?.period?.label || '…';
}
function fmtEur(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v ?? 0);
}

const PERIODS = [
  { id: 'week',   label: 'Semaine'  },
  { id: 'month',  label: 'Mois'     },
  { id: 'year',   label: 'Année'    },
  { id: 'fiscal', label: 'Exercice' },
];

const PERIOD_COLORS = {
  salarie:     '#6366F1',
  renfort:     '#F97316',
  independant: '#14B8A6',
  benevole:    '#8B5CF6',
};

export default function CostsView() {
  const { reloadStaff, settings } = useApp();
  const [week,         setWeek]         = useState(toMonday(new Date()));
  const [period,       setPeriod]        = useState('week');
  const [fiscalOffset, setFiscalOffset]  = useState(0);
  const [data,         setData]          = useState(null);
  const [loading,      setLoading]       = useState(false);

  const fiscalYear = useMemo(() => computeFiscalYear(settings, new Date(), fiscalOffset), [settings, fiscalOffset]);

  const load = useCallback(async (w, p) => {
    setLoading(true);
    try {
      const fiscal = p === 'fiscal' ? `&start=${fiscalYear.start}&end=${fiscalYear.end}` : '';
      const r = await api.get(`/costs?week=${w}&period=${p}${fiscal}`);
      setData(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [fiscalYear]);

  useEffect(() => { load(week, period); }, [week, period, load]);

  const nav = (delta) => {
    if (period === 'week') setWeek(w => addWeeks(w, delta));
    else if (period === 'month') {
      const d = new Date(week + 'T12:00:00');
      d.setMonth(d.getMonth() + delta);
      setWeek(toMonday(d));
    } else if (period === 'year') {
      const d = new Date(week + 'T12:00:00');
      d.setFullYear(d.getFullYear() + delta);
      setWeek(toMonday(d));
    } else if (period === 'fiscal') {
      setFiscalOffset(o => o + delta);
    }
  };

  /* Mise à jour du charge_rate directement depuis le tableau */
  const updateRate = async (id, value) => {
    try {
      await api.put(`/staff/${id}`, { charge_rate: value });
      await reloadStaff?.();
      load(week, period);
    } catch (e) {
      console.error(e);
    }
  };

  const rows = data?.rows || [];
  const summary = data?.summary || {};

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PageHeader
        title="Coûts"
        sub="Analyse financière de la masse salariale"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Sélecteur de période */}
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #E4E0D8' }}>
              {PERIODS.map(p => (
                <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                  padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
                  background: period === p.id ? '#C5753A' : '#fff',
                  color: period === p.id ? '#fff' : '#6B6860',
                  fontFamily: 'inherit', fontWeight: period === p.id ? 700 : 400,
                }}>{p.label}</button>
              ))}
            </div>
            <Btn small onClick={() => nav(-1)}>‹</Btn>
            <span style={{ fontWeight: 600, fontSize: 13, minWidth: 160, textAlign: 'center' }}>
              {fmtPeriodLabel(data)}
            </span>
            <Btn small onClick={() => nav(1)}>›</Btn>
          </div>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9B9890' }}>Chargement…</div>}

        {!loading && data && (
          <>
            {/* Résumé */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
              {[
                { label: 'Salaires bruts', value: fmtEur(summary.gross),   color: '#6366F1', icon: '💶' },
                { label: 'Charges',        value: fmtEur(summary.charges), color: '#F97316', icon: '📑' },
                { label: 'Coût total',     value: fmtEur(summary.total),   color: '#C5753A', icon: '🏦' },
              ].map(c => (
                <div key={c.label} style={{
                  background: '#fff', borderRadius: 12, padding: '16px 20px',
                  boxShadow: '0 1px 6px rgba(0,0,0,.06)', flex: 1, minWidth: 180,
                  borderLeft: `4px solid ${c.color}`,
                }}>
                  <div style={{ fontSize: 22 }}>{c.icon}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: c.color, marginTop: 4 }}>{c.value}</div>
                  <div style={{ fontSize: 13, color: '#6B6860', marginTop: 2 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            {rows.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)', marginBottom: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', marginBottom: 12 }}>Coût total par salarié</div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={rows.slice(0, 20)} layout="vertical" margin={{ left: 80, right: 20 }}>
                    <XAxis type="number" tickFormatter={v => `${v.toFixed(0)} €`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v, k) => [fmtEur(v), k === 'gross' ? 'Brut' : k === 'charges' ? 'Charges' : 'Total']} />
                    <Bar dataKey="gross" name="gross" stackId="a" radius={[0,0,0,0]}>
                      {rows.map((r, i) => <Cell key={i} fill={PERIOD_COLORS[r.type] || '#6366F1'} />)}
                    </Bar>
                    <Bar dataKey="charges" name="charges" stackId="a" radius={[0,4,4,0]}>
                      {rows.map((r, i) => <Cell key={i} fill={(PERIOD_COLORS[r.type] || '#6366F1') + '77'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tableau détaillé */}
            {rows.length > 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,.06)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#FAFAF8', borderBottom: '2px solid #F0EDE8' }}>
                        {['Salarié','Heures','Taux/h','Charges %','Brut','Charges','Total'].map(h => (
                          <th key={h} style={{
                            padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#6B6860',
                            fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #F7F4F0' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <AvatarImg s={r} size={28} />
                              <span style={{ fontWeight: 500 }}>{r.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', color: '#6B6860' }}>{r.hours.toFixed(1)} h</td>
                          <td style={{ padding: '10px 14px', color: '#6B6860' }}>{fmtEur(r.hourly_rate)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {/* Champ éditable */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input
                                type="number" min="0" max="100" step="1"
                                defaultValue={Math.round(r.charge_rate * 100)}
                                onBlur={e => {
                                  const v = (+e.target.value) / 100;
                                  if (v !== r.charge_rate) updateRate(r.id, v);
                                }}
                                style={{
                                  width: 50, padding: '3px 6px', border: '1px solid #E4E0D8',
                                  borderRadius: 5, fontSize: 12, fontFamily: 'inherit',
                                }}
                              />
                              <span style={{ fontSize: 11, color: '#9B9890' }}>%</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 500 }}>{fmtEur(r.gross)}</td>
                          <td style={{ padding: '10px 14px', color: '#F97316' }}>{fmtEur(r.charges)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#C5753A' }}>{fmtEur(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#F9F7F4', fontWeight: 700, borderTop: '2px solid #E4E0D8' }}>
                        <td style={{ padding: '10px 14px' }} colSpan={4}>Total</td>
                        <td style={{ padding: '10px 14px' }}>{fmtEur(summary.gross)}</td>
                        <td style={{ padding: '10px 14px', color: '#F97316' }}>{fmtEur(summary.charges)}</td>
                        <td style={{ padding: '10px 14px', color: '#C5753A' }}>{fmtEur(summary.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#9B9890', background: '#fff', borderRadius: 12 }}>
                Aucune donnée de planning pour cette période.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
