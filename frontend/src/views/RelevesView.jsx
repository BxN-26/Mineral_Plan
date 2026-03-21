import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../App';
import { PageHeader, Btn } from '../components/common';

const DAYS  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);

function useIsMobile() {
  const [v, set] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => set(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return v;
}

function weekStart(offset) {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  return mon.toISOString().slice(0, 10);
}

/** Compte les heures d'un staff dans une semaine */
function countHours(staffId, weekData) {
  let total = 0;
  for (const grid of Object.values(weekData)) {
    for (let d = 0; d < 7; d++) {
      for (const h of HOURS) {
        if ((grid[d]?.[h] || []).includes(staffId)) total++;
      }
    }
  }
  return total;
}

/** Compte les heures par fonction */
function countByFn(staffId, weekData) {
  const res = {};
  for (const [slug, grid] of Object.entries(weekData)) {
    let h = 0;
    for (let d = 0; d < 7; d++)
      for (const hr of HOURS)
        if ((grid[d]?.[hr] || []).includes(staffId)) h++;
    if (h > 0) res[slug] = h;
  }
  return res;
}

const RelevesView = () => {
  const { staff, functions, schedules, leaves, leaveTypes } = useApp();
  const isMobile = useIsMobile();
  const [wk,    setWk]    = useState(0);
  const [mode,  setMode]  = useState('heures'); // 'heures' | 'conges'
  const [search, setSearch] = useState('');

  const currentWeek = useMemo(() => weekStart(wk), [wk]);
  const weekData    = schedules[currentWeek] || {};

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

  const weekLabel = `${dates[0].getDate()} – ${dates[6].getDate()} ${dates[6].toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`;

  const filteredStaff = useMemo(() => {
    const q = search.toLowerCase();
    return staff.filter(s => s.active && (!q || (`${s.firstname} ${s.lastname}`).toLowerCase().includes(q)));
  }, [staff, search]);

  /* ─── Export CSV ─────────────────────────────────────── */
  const exportCSV = () => {
    const rows = [['Salarié', 'Heures totales', ...functions.map(f => f.name)]];
    for (const s of filteredStaff) {
      const tot  = countHours(s.id, weekData);
      const byfn = countByFn(s.id, weekData);
      rows.push([
        `${s.firstname} ${s.lastname}`,
        tot,
        ...functions.map(f => byfn[f.slug] || 0),
      ]);
    }
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `releves_${currentWeek}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ─── Congés de la semaine ─────────────────────────── */
  const weekLeaves = useMemo(() => {
    const start = new Date(currentWeek + 'T00:00:00');
    const end   = new Date(start); end.setDate(end.getDate() + 6);
    return leaves.filter(l => {
      const ls = new Date(l.start_date + 'T00:00:00');
      const le = new Date(l.end_date   + 'T23:59:59');
      return ls <= end && le >= start;
    });
  }, [leaves, currentWeek]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <PageHeader title="Relevés" subtitle={weekLabel}>
        {!isMobile && <Btn onClick={exportCSV} small>⬇️ CSV</Btn>}
      </PageHeader>

      {/* Toolbar */}
      <div style={{ padding: isMobile ? '6px 10px' : '8px 18px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2, background: '#F5F3EF', borderRadius: 7, padding: 2 }}>
          {[['heures', isMobile ? '⏱' : '⏱ Heures'], ['conges', isMobile ? '🌴' : '🌴 Congés']].map(([v, l]) => (
            <button key={v} onClick={() => setMode(v)}
              style={{ padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: mode === v ? '#fff' : 'transparent', color: mode === v ? '#1E2235' : '#9B9890', fontWeight: mode === v ? 600 : 400, fontSize: 11, boxShadow: mode === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>{l}</button>
          ))}
        </div>

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Filtrer…"
          style={{ padding: '5px 10px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, outline: 'none', flex: isMobile ? 1 : undefined, minWidth: isMobile ? 0 : 150 }} />

        <div style={{ display: 'flex', gap: 3, marginLeft: isMobile ? undefined : 'auto' }}>
          <button onClick={() => setWk(w => w - 1)} style={navBtn}>◀</button>
          <button onClick={() => setWk(0)}           style={navBtn}>{isMobile ? '●' : 'Auj.'}</button>
          <button onClick={() => setWk(w => w + 1)} style={navBtn}>▶</button>
        </div>
        {isMobile && <button onClick={exportCSV} style={{ ...navBtn, marginLeft: 'auto' }}>⬇️</button>}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '10px' : '16px 18px' }}>

        {/* ── MODE HEURES ── */}
        {mode === 'heures' && !isMobile && (
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
                for (const grid of Object.values(weekData))
                  h += HOURS.filter(hr => (grid[di]?.[hr] || []).includes(s.id)).length;
                return h;
              });
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '180px 70px repeat(7,1fr)', borderBottom: '1px solid #F0EDE8' }}>
                  <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: s.color, color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.initials[0]}</div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1E2235' }}>{s.firstname}</span>
                  </div>
                  <div style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: tot > 0 ? '#1E2235' : '#C0BCB5' }}>{tot}h</div>
                  {dh.map((h, di) => (
                    <div key={di} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, color: h > 0 ? s.color : '#E4E0D8', fontWeight: h > 0 ? 700 : 400, background: di >= 5 ? '#FDFBF8' : undefined }}>
                      {h > 0 ? `${h}h` : '—'}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ── MODE HEURES MOBILE : cartes ── */}
        {mode === 'heures' && isMobile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredStaff.length === 0 && (
              <div style={{ textAlign: 'center', color: '#9B9890', padding: 32, fontSize: 13 }}>Aucun salarié</div>
            )}
            {filteredStaff.map(s => {
              const tot = countHours(s.id, weekData);
              const dh  = DAYS.map((_, di) => {
                let h = 0;
                for (const grid of Object.values(weekData))
                  h += HOURS.filter(hr => (grid[di]?.[hr] || []).includes(s.id)).length;
                return h;
              });
              return (
                <div key={s.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4', padding: '10px 12px' }}>
                  {/* En-tête carte */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.color, color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.initials}</div>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', flex: 1 }}>{s.firstname} {s.lastname}</span>
                    <span style={{ fontWeight: 800, fontSize: 16, color: tot > 0 ? s.color : '#C0BCB5' }}>{tot}h</span>
                  </div>
                  {/* Détail par jour */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                    {dh.map((h, di) => (
                      <div key={di} style={{ textAlign: 'center', padding: '4px 0', borderRadius: 6, background: h > 0 ? `${s.color}14` : '#F5F3EF' }}>
                        <div style={{ fontSize: 8, color: '#9B9890', marginBottom: 1 }}>{DAYS[di]}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: h > 0 ? s.color : '#C0BCB5' }}>{h > 0 ? `${h}h` : '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── MODE CONGÉS (identique desktop/mobile, scroll naturel) ── */}
        {mode === 'conges' && (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#F5F3EF', borderBottom: '2px solid #E4E0D8', fontSize: 11, fontWeight: 700, color: '#9B9890', textTransform: 'uppercase' }}>
              Congés & absences de la semaine
            </div>
            {weekLeaves.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#9B9890', fontSize: 12 }}>Aucun congé cette semaine</div>
            )}
            {weekLeaves.map(l => {
              const s  = staff.find(x => x.id === l.staff_id);
              const lt = leaveTypesMap[l.type_slug] || {};
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #F0EDE8', flexWrap: isMobile ? 'wrap' : undefined }}>
                  {s && (
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: s.color, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.initials}</div>
                  )}
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
