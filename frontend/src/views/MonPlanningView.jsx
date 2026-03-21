import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';

const DAYS    = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_SH = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const HOURS   = Array.from({ length: 14 }, (_, i) => i + 8);

function weekStart(offset) {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  return mon.toISOString().slice(0, 10);
}

const MonPlanningView = () => {
  const { user }                          = useAuth();
  const { staff, functions, schedules, loadWeekSchedules } = useApp();
  const [wk, setWk]                       = useState(0);

  const currentWeek = useMemo(() => weekStart(wk), [wk]);

  const dates = useMemo(() => {
    const mon = new Date(currentWeek + 'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });
  }, [currentWeek]);

  const weekLabel = `${dates[0].getDate()} – ${dates[6].getDate()} ${dates[6].toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`;

  // Charger le planning si besoin
  useEffect(() => { loadWeekSchedules(currentWeek); }, [currentWeek]);

  // Trouver le salarié correspondant à l'utilisateur connecté
  const myStaff = useMemo(() => {
    if (!user?.staff_id) return null;
    return staff.find(s => s.id === user.staff_id) || null;
  }, [user, staff]);

  // Construire le planning personnel (toutes fonctions confondues)
  const mySchedule = useMemo(() => {
    const weekData = schedules[currentWeek] || {};
    const result   = {}; // { day: { hour: [fnSlug] } }
    for (let d = 0; d < 7; d++) for (const h of HOURS) result[`${d}-${h}`] = [];

    if (!myStaff) return result;

    for (const fn of functions) {
      const grid = weekData[fn.slug] || {};
      for (let d = 0; d < 7; d++) {
        for (const h of HOURS) {
          if ((grid[d]?.[h] || []).includes(myStaff.id)) {
            result[`${d}-${h}`].push(fn);
          }
        }
      }
    }
    return result;
  }, [myStaff, functions, schedules, currentWeek]);

  // Total d'heures planifiées cette semaine
  const totalH = useMemo(() => {
    let count = 0;
    for (const fns of Object.values(mySchedule)) if (fns.length > 0) count++;
    return count;
  }, [mySchedule]);

  if (!myStaff) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9B9890', fontSize: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
        <div>Votre compte n'est pas relié à une fiche salarié.</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>Demandez à un administrateur de lier votre compte.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 18px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 130 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1E2235' }}>Mon planning</div>
          <div style={{ fontSize: 11, color: '#8B8880' }}>{weekLabel}</div>
        </div>

        {/* Badge salarié */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: `${myStaff.color}15`, border: `1.5px solid ${myStaff.color}30`, borderRadius: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: myStaff.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
            {myStaff.initials}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E2235' }}>{myStaff.firstname} {myStaff.lastname}</div>
            <div style={{ fontSize: 10, color: '#9B9890' }}>{totalH}h planifiées cette&nbsp;semaine</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          <button onClick={() => setWk(w => w - 1)} style={navBtn}>◀</button>
          <button onClick={() => setWk(0)}           style={navBtn}>Auj.</button>
          <button onClick={() => setWk(w => w + 1)} style={navBtn}>▶</button>
        </div>
      </div>

      {/* Grille */}
      <div style={{ flex: 1, overflow: 'auto', background: '#FAFAF8' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7,1fr)', position: 'sticky', top: 0, zIndex: 10, background: '#F5F3EF', borderBottom: '2px solid #E4E0D8' }}>
          <div />
          {DAYS.map((day, di) => {
            const date    = dates[di];
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <div key={day} style={{ padding: '8px 6px 6px', textAlign: 'center', background: isToday ? '#FFF4EC' : di >= 5 ? '#F9F7F4' : 'transparent', borderLeft: '1px solid #E4E0D8' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: isToday ? '#C5753A' : '#9B9890', textTransform: 'uppercase' }}>{DAYS_SH[di]}</div>
                <div style={{ fontSize: 15, fontWeight: isToday ? 800 : 600, color: isToday ? '#C5753A' : '#1E2235', lineHeight: 1.2, margin: '1px 0' }}>{date.getDate()}</div>
              </div>
            );
          })}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: 44 }} />{DAYS.map((_, i) => <col key={i} />)}</colgroup>
          <tbody>
            {HOURS.map(h => (
              <tr key={h}>
                <td style={{ padding: '0 5px', textAlign: 'right', fontSize: 9, color: '#C0BCB5', verticalAlign: 'top', paddingTop: 4, borderTop: '1px solid #ECEAE4', position: 'sticky', left: 0, background: '#F5F3EF', zIndex: 5 }}>{h}h</td>
                {DAYS.map((_, di) => {
                  const fns = mySchedule[`${di}-${h}`] || [];
                  return (
                    <td key={di} style={{ verticalAlign: 'top', padding: '2px 3px', borderLeft: '1px solid #E4E0D8', borderTop: '1px solid #ECEAE4', background: fns.length > 0 ? `${myStaff.color}0D` : di >= 5 ? '#FDFBF8' : '#fff', minHeight: 26 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {fns.map(fn => (
                          <div key={fn.slug} style={{ display: 'flex', alignItems: 'center', gap: 2, background: fn.bg_color || '#F5F5F5', border: `1px solid ${fn.color}30`, borderRadius: 4, padding: '1px 4px' }}>
                            <span style={{ fontSize: 9 }}>{fn.icon}</span>
                            <span style={{ fontSize: 9, fontWeight: 600, color: fn.color }}>{fn.short_name || fn.name}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const navBtn = {
  padding: '5px 10px', border: '1px solid #E4E0D8', borderRadius: 6,
  background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: '#5B5855',
};

export default MonPlanningView;
