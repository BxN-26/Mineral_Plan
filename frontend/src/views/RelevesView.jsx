import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Btn } from '../components/common';
import AvatarImg from '../components/AvatarImg';
import api from '../api/client';
import { computeFiscalYear } from '../utils/fiscal';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Formate des heures décimales → "2h30" */
const fmtH = (h) => {
  if (!h) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
};

function useIsMobile() {
  const [v, set] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => set(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return v;
}

/* ── Helpers date ──────────────────────────────────────────────── */
function weekStart(offset) {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  const y = mon.getFullYear(), m = String(mon.getMonth()+1).padStart(2,'0'), d = String(mon.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function currentMonthStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}

function addMonths(mStr, n) {
  const [y, m] = mStr.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function fmtMonthLabel(mStr) {
  return new Date(mStr + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/* ── Comptage heures depuis le context (mode semaine) ─────────── */
function countHours(staffId, weekData) {
  let total = 0;
  for (const fnSpans of Object.values(weekData))
    for (let d = 0; d < 7; d++)
      for (const sp of (fnSpans[d] || []))
        if (sp.staffId === staffId) total += sp.end - sp.start;
  return +total.toFixed(2);
}

function countByFn(staffId, weekData) {
  const res = {};
  for (const [slug, fnSpans] of Object.entries(weekData)) {
    let h = 0;
    for (let d = 0; d < 7; d++)
      for (const sp of (fnSpans[d] || []))
        if (sp.staffId === staffId) h += sp.end - sp.start;
    if (h > 0) res[slug] = +h.toFixed(2);
  }
  return res;
}

/* ── Composant ─────────────────────────────────────────────────── */
const RelevesView = () => {
  const { staff, functions, schedules, leaves, leaveTypes, settings } = useApp();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isStaffRole = user?.role === 'staff';

  const [wk,            setWk]           = useState(0);
  const [mode,          setMode]         = useState(isStaffRole ? 'balance' : 'heures');
  const [search,        setSearch]       = useState('');
  const [period,        setPeriod]       = useState('week');
  const [viewMonth,     setViewMonth]    = useState(currentMonthStr);
  const [viewYear,      setViewYear]     = useState(() => String(new Date().getFullYear()));
  const [fiscalOffset,  setFiscalOffset] = useState(0);
  const [aggData,       setAggData]      = useState(null);
  const [aggLoading,    setAggLoading]   = useState(false);
  const [balanceData,   setBalanceData]  = useState(null);
  const [balanceLoading,setBalanceLoading] = useState(false);
  const [balFiscalOff,  setBalFiscalOff] = useState(0);

  const fiscalYear    = useMemo(() => computeFiscalYear(settings, new Date(), fiscalOffset),  [settings, fiscalOffset]);
  const balFiscalYear = useMemo(() => computeFiscalYear(settings, new Date(), balFiscalOff),  [settings, balFiscalOff]);

  const currentWeek = useMemo(() => weekStart(wk), [wk]);
  const weekData    = schedules[currentWeek] || {};

  /* Chargement données agrégées mois/année/exercice */
  useEffect(() => {
    if (period === 'week' || mode === 'balance') { setAggData(null); return; }
    let q;
    if (period === 'month')  q = `period=month&month=${viewMonth}`;
    else if (period === 'year')   q = `period=year&year=${viewYear}`;
    else if (period === 'fiscal') q = `period=fiscal&start=${fiscalYear.start}&end=${fiscalYear.end}`;
    setAggLoading(true);
    api.get(`/stats?${q}`)
      .then(r => setAggData(r.data))
      .catch(console.error)
      .finally(() => setAggLoading(false));
  }, [period, viewMonth, viewYear, fiscalYear, mode]);

  /* Chargement balance */
  useEffect(() => {
    if (mode !== 'balance') return;
    setBalanceLoading(true);
    api.get(`/stats/balance?start=${balFiscalYear.start}&end=${balFiscalYear.end}`)
      .then(r => setBalanceData(r.data))
      .catch(console.error)
      .finally(() => setBalanceLoading(false));
  }, [mode, balFiscalYear]);

  const leaveTypesMap = useMemo(
    () => Object.fromEntries(leaveTypes.map(lt => [lt.slug, lt])),
    [leaveTypes]
  );

  const dates = useMemo(() => {
    const mon = new Date(currentWeek + 'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });
  }, [currentWeek]);

  const weekLabel  = `${dates[0].getDate()} – ${dates[6].getDate()} ${dates[6].toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`;
  const periodLabel =
    period === 'week'   ? weekLabel :
    period === 'month'  ? fmtMonthLabel(viewMonth) :
    period === 'fiscal' ? fiscalYear.label :
                          `Année ${viewYear}`;

  const filteredStaff = useMemo(() => {
    if (isStaffRole) {
      // Un staff ne voit que sa propre fiche
      const own = staff.find(s => s.id === user?.staff_id);
      return own ? [own] : [];
    }
    const q = search.toLowerCase();
    return staff.filter(s => s.active && (!q || (`${s.firstname} ${s.lastname}`).toLowerCase().includes(q)));
  }, [staff, search, isStaffRole, user?.staff_id]);

  /* ─── Congés filtrés selon la période ─────────────────── */
  const periodLeaves = useMemo(() => {
    if (period === 'week') {
      const start = new Date(currentWeek + 'T00:00:00');
      const end   = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59);
      return leaves.filter(l => {
        const ls = new Date(l.start_date + 'T00:00:00');
        const le = new Date(l.end_date   + 'T23:59:59');
        return ls <= end && le >= start;
      });
    }
    if (period === 'month') {
      const [y, m] = viewMonth.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end   = new Date(y, m, 0, 23, 59, 59);
      return leaves.filter(l => {
        const ls = new Date(l.start_date + 'T00:00:00');
        const le = new Date(l.end_date   + 'T23:59:59');
        return ls <= end && le >= start;
      });
    }
    if (period === 'fiscal') {
      const start = new Date(fiscalYear.start + 'T00:00:00');
      const end   = new Date(fiscalYear.end   + 'T23:59:59');
      return leaves.filter(l => {
        const ls = new Date(l.start_date + 'T00:00:00');
        const le = new Date(l.end_date   + 'T23:59:59');
        return ls <= end && le >= start;
      });
    }
    // year
    const start = new Date(viewYear + '-01-01T00:00:00');
    const end   = new Date(viewYear + '-12-31T23:59:59');
    return leaves.filter(l => {
      const ls = new Date(l.start_date + 'T00:00:00');
      const le = new Date(l.end_date   + 'T23:59:59');
      return ls <= end && le >= start;
    });
  }, [period, leaves, currentWeek, viewMonth, viewYear, fiscalYear]);

  /* ─── Export CSV ───────────────────────────────────────── */
  const exportCSV = () => {
    let rows, filename;
    if (period === 'week') {
      rows = [['Salarié', 'Heures totales', ...functions.map(f => f.name)]];
      for (const s of filteredStaff) {
        const tot  = countHours(s.id, weekData);
        const byfn = countByFn(s.id, weekData);
        rows.push([`${s.firstname} ${s.lastname}`, fmtH(tot), ...functions.map(f => fmtH(byfn[f.slug] || 0))]);
      }
      filename = `releves_${currentWeek}.csv`;
    } else if (period === 'month' && aggData) {
      const cols = aggData.weeks_in_period || [];
      rows = [['Salarié', 'Total mois', ...cols.map(w => { const d = new Date(w+'T12:00:00'); return `S ${d.getDate()}/${d.getMonth()+1}`; })]];
      for (const s of filteredStaff) {
        const sbp = aggData.staff_by_period?.[s.id] || {};
        const tot = Object.values(sbp).reduce((a, h) => a + h, 0);
        rows.push([`${s.firstname} ${s.lastname}`, fmtH(tot), ...cols.map(w => fmtH(sbp[w] || 0))]);
      }
      filename = `releves_${viewMonth}.csv`;
    } else if ((period === 'year' || period === 'fiscal') && aggData) {
      const cols = aggData.by_period || [];
      const label = period === 'fiscal' ? fiscalYear.label : `Année ${viewYear}`;
      rows = [['Salarié', `Total (${label})`, ...cols.map(p => p.label)]];
      for (const s of filteredStaff) {
        const sbp = aggData.staff_by_period?.[s.id] || {};
        const tot = Object.values(sbp).reduce((a, h) => a + h, 0);
        rows.push([`${s.firstname} ${s.lastname}`, fmtH(tot), ...cols.map(p => fmtH(sbp[p.key] || 0))]);
      }
      filename = period === 'fiscal'
        ? `releves_exercice_${fiscalYear.start.slice(0,4)}_${fiscalYear.end.slice(0,4)}.csv`
        : `releves_${viewYear}.csv`;
    } else {
      return;
    }
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ─── Rendu ────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <PageHeader title="Relevés" subtitle={periodLabel}>
        {!isMobile && <Btn onClick={exportCSV} small>⬇️ CSV</Btn>}
      </PageHeader>

      {/* Toolbar */}
      <div style={{ padding: isMobile ? '6px 10px' : '8px 18px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Mode heures/congés/balance */}
        <div style={{ display: 'flex', gap: 2, background: '#F5F3EF', borderRadius: 7, padding: 2 }}>
          {[['heures', isMobile ? '⏱' : '⏱ Heures'], ['conges', isMobile ? '🌴' : '🌴 Congés'], ['balance', isMobile ? '⚖️' : '⚖️ Balance']]
            .map(([v, l]) => (
              <button key={v} onClick={() => setMode(v)}
                style={{ padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: mode === v ? '#fff' : 'transparent', color: mode === v ? (v === 'balance' ? '#C5753A' : '#1E2235') : '#9B9890', fontWeight: mode === v ? 600 : 400, fontSize: 11, boxShadow: mode === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>{l}</button>
          ))}
        </div>

        {/* Sélecteur de période — caché en mode balance */}
        {mode !== 'balance' && (
          <div style={{ display: 'flex', gap: 2, background: '#F5F3EF', borderRadius: 7, padding: 2 }}>
            {[['week','Sem.'],['month','Mois'],['year','Année'],['fiscal','Exercice']].map(([v, l]) => (
              <button key={v} onClick={() => setPeriod(v)}
                style={{ padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: period === v ? '#C5753A' : 'transparent', color: period === v ? '#fff' : '#9B9890', fontWeight: period === v ? 700 : 400, fontSize: 11, transition: 'all .15s' }}>{l}</button>
            ))}
          </div>
        )}

        {/* Barre de recherche — masquée pour staff */}
        {!isStaffRole && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Filtrer…"
            style={{ padding: '5px 10px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, outline: 'none', flex: isMobile ? 1 : undefined, minWidth: isMobile ? 0 : 150 }} />
        )}

        {/* Navigation selon la période */}
        {period === 'week' && (
          <div style={{ display: 'flex', gap: 3, marginLeft: isMobile ? undefined : 'auto' }}>
            <button onClick={() => setWk(w => w - 1)} style={navBtn}>◀</button>
            <button onClick={() => setWk(0)}           style={navBtn}>{isMobile ? '●' : 'Auj.'}</button>
            <button onClick={() => setWk(w => w + 1)} style={navBtn}>▶</button>
          </div>
        )}
        {period === 'month' && (
          <div style={{ display: 'flex', gap: 3, marginLeft: isMobile ? undefined : 'auto' }}>
            <button onClick={() => setViewMonth(m => addMonths(m, -1))} style={navBtn}>◀</button>
            <button onClick={() => setViewMonth(currentMonthStr())}     style={navBtn}>{isMobile ? '●' : 'Auj.'}</button>
            <button onClick={() => setViewMonth(m => addMonths(m, 1))}  style={navBtn}>▶</button>
          </div>
        )}
        {period === 'year' && mode !== 'balance' && (
          <div style={{ display: 'flex', gap: 3, marginLeft: isMobile ? undefined : 'auto' }}>
            <button onClick={() => setViewYear(y => String(parseInt(y) - 1))} style={navBtn}>◄</button>
            <button onClick={() => setViewYear(String(new Date().getFullYear()))} style={navBtn}>{isMobile ? '●' : 'Auj.'}</button>
            <button onClick={() => setViewYear(y => String(parseInt(y) + 1))}  style={navBtn}>►</button>
          </div>
        )}
        {period === 'fiscal' && mode !== 'balance' && (
          <div style={{ display: 'flex', gap: 3, marginLeft: isMobile ? undefined : 'auto' }}>
            <button onClick={() => setFiscalOffset(o => o - 1)} style={navBtn}>◄</button>
            <button onClick={() => setFiscalOffset(0)}          style={navBtn}>{isMobile ? '●' : 'En cours'}</button>
            <button onClick={() => setFiscalOffset(o => o + 1)} style={navBtn}>►</button>
          </div>
        )}

        {isMobile && <button onClick={exportCSV} style={{ ...navBtn, marginLeft: 'auto' }}>⬇️</button>}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '10px' : '16px 18px' }}>

        {/* ── MODE HEURES — SEMAINE ── */}
        {mode === 'heures' && period === 'week' && !isMobile && (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 70px repeat(7,1fr)', background: '#F5F3EF', borderBottom: '2px solid #E4E0D8' }}>
              <div style={th}>Salarié</div>
              <div style={{ ...th, textAlign: 'center', fontWeight: 700 }}>Total</div>
              {DAYS.map((d, i) => (
                <div key={d} style={{ ...th, textAlign: 'center', background: i >= 5 ? '#F0EDE8' : undefined }}>
                  <div style={{ fontSize: 9 }}>{d}</div>
                  <div style={{ fontSize: 10, fontWeight: 700 }}>{dates[i]?.getDate()}</div>
                </div>
              ))}
            </div>
            {filteredStaff.map(s => {
              const tot = countHours(s.id, weekData);
              const dh  = DAYS.map((_, di) => {
                let h = 0;
                for (const fnSpans of Object.values(weekData))
                  for (const sp of (fnSpans[di] || []))
                    if (sp.staffId === s.id) h += sp.end - sp.start;
                return +h.toFixed(2);
              });
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '180px 70px repeat(7,1fr)', borderBottom: '1px solid #F0EDE8' }}>
                  <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AvatarImg s={s} size={20} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1E2235' }}>{s.firstname}</span>
                  </div>
                  <div style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: tot > 0 ? '#1E2235' : '#C0BCB5' }}>{fmtH(tot)}</div>
                  {dh.map((h, di) => (
                    <div key={di} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, color: h > 0 ? s.color : '#E4E0D8', fontWeight: h > 0 ? 700 : 400, background: di >= 5 ? '#FDFBF8' : undefined }}>
                      {h > 0 ? fmtH(h) : '—'}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ── MODE HEURES — SEMAINE MOBILE ── */}
        {mode === 'heures' && period === 'week' && isMobile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredStaff.length === 0 && (
              <div style={{ textAlign: 'center', color: '#9B9890', padding: 32, fontSize: 13 }}>Aucun salarié</div>
            )}
            {filteredStaff.map(s => {
              const tot = countHours(s.id, weekData);
              const dh  = DAYS.map((_, di) => {
                let h = 0;
                for (const fnSpans of Object.values(weekData))
                  for (const sp of (fnSpans[di] || []))
                    if (sp.staffId === s.id) h += sp.end - sp.start;
                return +h.toFixed(2);
              });
              return (
                <div key={s.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <AvatarImg s={s} size={28} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', flex: 1 }}>{s.firstname} {s.lastname}</span>
                    <span style={{ fontWeight: 800, fontSize: 16, color: tot > 0 ? s.color : '#C0BCB5' }}>{fmtH(tot)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                    {dh.map((h, di) => (
                      <div key={di} style={{ textAlign: 'center', padding: '4px 0', borderRadius: 6, background: h > 0 ? `${s.color}14` : '#F5F3EF' }}>
                        <div style={{ fontSize: 8, color: '#9B9890', marginBottom: 1 }}>{DAYS[di]}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: h > 0 ? s.color : '#C0BCB5' }}>{h > 0 ? fmtH(h) : '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── MODE HEURES — MOIS (tableau semaines) ── */}
        {mode === 'heures' && period === 'month' && (
          aggLoading
            ? <div style={{ textAlign: 'center', padding: 48, color: '#9B9890' }}>Chargement…</div>
            : aggData && (
              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4', overflow: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `180px 70px repeat(${(aggData.weeks_in_period||[]).length},1fr)`, background: '#F5F3EF', borderBottom: '2px solid #E4E0D8', minWidth: 500 }}>
                  <div style={th}>Salarié</div>
                  <div style={{ ...th, textAlign: 'center' }}>Total</div>
                  {(aggData.weeks_in_period || []).map(w => {
                    const d = new Date(w + 'T12:00:00');
                    return (
                      <div key={w} style={{ ...th, textAlign: 'center' }}>
                        <div>S {d.getDate()}/{d.getMonth()+1}</div>
                      </div>
                    );
                  })}
                </div>
                {filteredStaff.map(s => {
                  const sbp = aggData.staff_by_period?.[s.id] || {};
                  const tot = Object.values(sbp).reduce((a, h) => a + h, 0);
                  return (
                    <div key={s.id} style={{ display: 'grid', gridTemplateColumns: `180px 70px repeat(${(aggData.weeks_in_period||[]).length},1fr)`, borderBottom: '1px solid #F0EDE8', minWidth: 500 }}>
                      <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AvatarImg s={s} size={20} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1E2235' }}>{s.firstname}</span>
                      </div>
                      <div style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: tot > 0 ? '#1E2235' : '#C0BCB5' }}>{fmtH(tot)}</div>
                      {(aggData.weeks_in_period || []).map(w => {
                        const h = sbp[w] || 0;
                        return (
                          <div key={w} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, color: h > 0 ? s.color : '#E4E0D8', fontWeight: h > 0 ? 700 : 400 }}>
                            {h > 0 ? fmtH(h) : '—'}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )
        )}

        {/* ── MODE HEURES — ANNÉE / EXERCICE (tableau par mois) ── */}
        {mode === 'heures' && (period === 'year' || period === 'fiscal') && (
          aggLoading
            ? <div style={{ textAlign: 'center', padding: 48, color: '#9B9890' }}>Chargement…</div>
            : aggData && (
              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4', overflow: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `180px 70px repeat(${(aggData.by_period||[]).length},1fr)`, background: '#F5F3EF', borderBottom: '2px solid #E4E0D8', minWidth: 700 }}>
                  <div style={th}>Salarié</div>
                  <div style={{ ...th, textAlign: 'center' }}>Total</div>
                  {(aggData.by_period || []).map(p => (
                    <div key={p.key} style={{ ...th, textAlign: 'center' }}>{p.label}</div>
                  ))}
                </div>
                {filteredStaff.map(s => {
                  const sbp = aggData.staff_by_period?.[s.id] || {};
                  const tot = Object.values(sbp).reduce((a, h) => a + h, 0);
                  return (
                    <div key={s.id} style={{ display: 'grid', gridTemplateColumns: `180px 70px repeat(${(aggData.by_period||[]).length},1fr)`, borderBottom: '1px solid #F0EDE8', minWidth: 700 }}>
                      <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AvatarImg s={s} size={20} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1E2235' }}>{s.firstname}</span>
                      </div>
                      <div style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: tot > 0 ? '#1E2235' : '#C0BCB5' }}>{fmtH(tot)}</div>
                      {(aggData.by_period || []).map(p => {
                        const h = sbp[p.key] || 0;
                        return (
                          <div key={p.key} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, color: h > 0 ? s.color : '#E4E0D8', fontWeight: h > 0 ? 700 : 400 }}>
                            {h > 0 ? fmtH(h) : '—'}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )
        )}

        {/* ── MODE BALANCE ── */}
        {mode === 'balance' && (
          <div>
            {/* Navigateur exercice balance */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button onClick={() => setBalFiscalOff(o => o - 1)} style={navBtn}>◀</button>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#1E2235' }}>⚖️ {balFiscalYear.label}</span>
              <button onClick={() => setBalFiscalOff(o => o + 1)} style={navBtn}>▶</button>
              <button onClick={() => setBalFiscalOff(0)} style={{ ...navBtn, fontSize: 10 }}>En cours</button>
              {balanceData && (
                <span style={{ fontSize: 11, color: '#9B9890', marginLeft: 8 }}>{balanceData.weeks_count} semaines</span>
              )}
            </div>

            {balanceLoading && <div style={{ textAlign: 'center', padding: 40, color: '#9B9890' }}>Chargement…</div>}

            {!balanceLoading && balanceData && (() => {
              const q = search.toLowerCase();
              const matchSearch = s => !q || `${s.firstname} ${s.lastname}`.toLowerCase().includes(q);
              const withContract    = balanceData.staff.filter(s => s.contract_base !== 'aucune' && matchSearch(s));
              const withoutContract = balanceData.staff.filter(s => s.contract_base === 'aucune' && s.planned_h > 0 && matchSearch(s));
              const total_contracted = withContract.reduce((a, s) => a + (s.contracted_h || 0), 0);
              const total_planned    = withContract.reduce((a, s) => a + s.planned_h, 0);
              const total_balance    = +(total_planned - total_contracted).toFixed(1);
              const underCount       = withContract.filter(s => s.balance < 0).length;
              return (
                <>
                  {/* KPIs */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #ECEAE4', flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 11, color: '#9B9890', textTransform: 'uppercase', letterSpacing: '.4px' }}>Heures théoriques</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#1E2235', marginTop: 2 }}>{fmtH(total_contracted)}</div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #ECEAE4', flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 11, color: '#9B9890', textTransform: 'uppercase', letterSpacing: '.4px' }}>Heures planifiées</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#C5753A', marginTop: 2 }}>{fmtH(total_planned)}</div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: `1px solid ${total_balance >= 0 ? '#A7F3D0' : '#FCA5A5'}`, flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 11, color: '#9B9890', textTransform: 'uppercase', letterSpacing: '.4px' }}>Balance globale</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: total_balance >= 0 ? '#16A34A' : '#DC2626', marginTop: 2 }}>
                        {total_balance > 0 ? '+' : ''}{fmtH(Math.abs(total_balance))}
                      </div>
                    </div>
                    {underCount > 0 && (
                      <div style={{ background: '#FFF7ED', borderRadius: 10, padding: '12px 16px', border: '1px solid #FED7AA', flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 11, color: '#92400E', textTransform: 'uppercase', letterSpacing: '.4px' }}>Sous-planifiés</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#C5753A', marginTop: 2 }}>{underCount} pers.</div>
                      </div>
                    )}
                  </div>

                  {/* Tableau principal */}
                  <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4', overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ padding: '10px 14px', background: '#F5F3EF', borderBottom: '2px solid #E4E0D8', fontSize: 11, fontWeight: 700, color: '#9B9890', textTransform: 'uppercase' }}>
                      Personnel avec base horaire contractuelle
                    </div>
                    {withContract.length === 0 && (
                      <div style={{ padding: 24, textAlign: 'center', color: '#9B9890', fontSize: 13 }}>Aucun salarié avec base horaire contractuelle</div>
                    )}
                    {withContract.map(s => {
                      const pct      = s.contracted_h > 0 ? Math.min(100, (s.planned_h / s.contracted_h) * 100) : 0;
                      const balColor = s.balance > 0 ? '#16A34A' : s.balance < 0 ? '#DC2626' : '#6366F1';
                      return (
                        <div key={s.id} style={{ padding: '12px 14px', borderBottom: '1px solid #F0EDE8', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <AvatarImg s={s} size={32} />
                          <div style={{ flex: 1, minWidth: 120 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235' }}>{s.firstname} {s.lastname}</div>
                            <div style={{ fontSize: 11, color: '#9B9890' }}>
                              {s.contract_base === 'hebdomadaire'
                                ? `${s.contract_h}h/sem × ${balanceData.weeks_count} sem.`
                                : `${s.contract_h}h/an`}
                            </div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: 80 }}>
                            <div style={{ fontSize: 11, color: '#9B9890', marginBottom: 2 }}>Théorique</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E2235' }}>{fmtH(s.contracted_h)}</div>
                          </div>
                          <div style={{ textAlign: 'center', minWidth: 80 }}>
                            <div style={{ fontSize: 11, color: '#9B9890', marginBottom: 2 }}>Planifié</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: s.planned_h > 0 ? s.color : '#C0BCB5' }}>{s.planned_h > 0 ? fmtH(s.planned_h) : '—'}</div>
                          </div>
                          <div style={{ minWidth: 140 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: balColor }}>
                                {s.balance > 0 ? '+' : ''}{fmtH(Math.abs(s.balance))}
                                <span style={{ fontSize: 11, marginLeft: 4, fontWeight: 400 }}>
                                  {s.balance > 0 ? '↑ surplus' : s.balance < 0 ? '↓ manque' : '= OK'}
                                </span>
                              </div>
                            </div>
                            <div style={{ height: 6, background: '#F0EDE8', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 3, background: balColor, width: `${pct}%`, transition: 'width .4s' }} />
                            </div>
                            <div style={{ fontSize: 10, color: '#9B9890', marginTop: 2 }}>{pct.toFixed(0)}% planifié</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Renforts / sans contrat */}
                  {withoutContract.length > 0 && (
                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4', overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', background: '#F5F3EF', borderBottom: '2px solid #E4E0D8', fontSize: 11, fontWeight: 700, color: '#9B9890', textTransform: 'uppercase' }}>
                        Renforts / bénévoles / vacataires planifiés
                      </div>
                      {withoutContract.map(s => (
                        <div key={s.id} style={{ padding: '10px 14px', borderBottom: '1px solid #F0EDE8', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.color, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.initials}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235' }}>{s.firstname} {s.lastname}</div>
                            <div style={{ fontSize: 11, color: '#9B9890' }}>Sans base horaire contractuelle</div>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{fmtH(s.planned_h)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ── MODE CONGÉS ── */}
        {mode === 'conges' && (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#F5F3EF', borderBottom: '2px solid #E4E0D8', fontSize: 11, fontWeight: 700, color: '#9B9890', textTransform: 'uppercase' }}>
              Congés & absences — {periodLabel}
            </div>
            {periodLeaves.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#9B9890', fontSize: 12 }}>Aucun congé sur la période</div>
            )}
            {periodLeaves.map(l => {
              const s  = staff.find(x => x.id === l.staff_id);
              const lt = leaveTypesMap[l.type_slug] || {};
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #F0EDE8', flexWrap: isMobile ? 'wrap' : undefined }}>
                  {s && <AvatarImg s={s} size={26} />}
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#1E2235', minWidth: isMobile ? 120 : undefined }}>
                    {s ? `${s.firstname} ${s.lastname}` : `salarié #${l.staff_id}`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ padding: '2px 8px', borderRadius: 12, background: lt.bg_color || '#F5F5F5', color: lt.color || '#9B9890', fontSize: 10, fontWeight: 700 }}>{lt.short_label || lt.slug || '?'}</div>
                    <div style={{ fontSize: 11, color: '#9B9890' }}>{formatDate(l.start_date)} → {formatDate(l.end_date)}</div>
                    <div style={{ padding: '2px 7px', borderRadius: 8, background: l.status === 'approved' ? '#DCFCE7' : l.status === 'refused' ? '#FEE2E2' : '#FEF9C3', color: l.status === 'approved' ? '#15803D' : l.status === 'refused' ? '#DC2626' : '#A16207', fontSize: 9, fontWeight: 700 }}>
                      {l.status === 'approved' ? '✓ Approuvé' : l.status === 'refused' ? '✕ Refusé' : '⏳ En attente'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

function formatDate(str) {
  if (!str) return '—';
  return new Date(str + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const th = {
  padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#9B9890', textTransform: 'uppercase',
};

const navBtn = {
  padding: '5px 10px', border: '1px solid #E4E0D8', borderRadius: 6,
  background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: '#5B5855',
};

export default RelevesView;
