/**
 * Skeleton.jsx — Composants de placeholder animés par vue
 * Utilisés le temps du chargement initial des données.
 */
import { SkeletonBlock } from './common';

/* ── Skeleton générique liste/tableau ─────────────────────────── */
export const SkeletonList = ({ rows = 5, cols = 3 }) => (
  <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, padding: '12px 16px', background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4' }}>
        {Array.from({ length: cols }).map((__, j) => (
          <SkeletonBlock key={j} height={j === 0 ? 16 : 12} width={j === 0 ? '70%' : '50%'} />
        ))}
      </div>
    ))}
  </div>
);

/* ── Skeleton grille équipe (cartes salarié) ─────────────────── */
export const SkeletonCards = ({ count = 6 }) => (
  <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1px solid #ECEAE4', padding: '14px 14px 12px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
          <SkeletonBlock width={38} height={38} borderRadius={19} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonBlock width="60%" height={14} />
            <SkeletonBlock width="40%" height={11} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <SkeletonBlock width={60} height={18} borderRadius={12} />
          <SkeletonBlock width={70} height={18} borderRadius={12} />
        </div>
        <div style={{ borderTop: '1px solid #F0EDE8', paddingTop: 8, display: 'flex', gap: 12 }}>
          <SkeletonBlock width={40} height={11} />
          <SkeletonBlock width={40} height={11} />
        </div>
      </div>
    ))}
  </div>
);

/* ── Skeleton planning (grille temporelle) ───────────────────── */
export const SkeletonPlanning = ({ days = 7 }) => (
  <div style={{ padding: '8px 0', display: 'flex', gap: 4, overflow: 'hidden' }}>
    {/* Colonne heures */}
    <div style={{ width: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 32, paddingTop: 36 }}>
      {[7,8,9,10,11,12,13,14,15,16,17,18].map(h => (
        <SkeletonBlock key={h} width={28} height={9} />
      ))}
    </div>
    {/* Colonnes jours */}
    {Array.from({ length: days }).map((_, d) => (
      <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <SkeletonBlock height={28} borderRadius={4} />
        <div style={{ flex: 1, position: 'relative', minHeight: 400 }}>
          {[0,1,2].map(i => (
            <SkeletonBlock key={i} height={Math.random() * 60 + 40} borderRadius={5}
              style={{ position: 'absolute', top: 40 + i * 90, left: 2, right: 2 }} />
          ))}
        </div>
      </div>
    ))}
  </div>
);

/* ── Skeleton statistiques ───────────────────────────────────── */
export const SkeletonStats = () => (
  <div style={{ padding: '16px 18px' }}>
    {/* KPI cards */}
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ flex: '1 1 160px', background: '#fff', borderRadius: 12, padding: '16px 20px', borderLeft: '4px solid #ECEAE4' }}>
          <SkeletonBlock width={30} height={22} style={{ marginBottom: 8 }} />
          <SkeletonBlock width={60} height={28} style={{ marginBottom: 6 }} />
          <SkeletonBlock width="80%" height={13} />
        </div>
      ))}
    </div>
    {/* Graph area */}
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <SkeletonBlock width={160} height={16} style={{ marginBottom: 16 }} />
      <SkeletonBlock width="100%" height={180} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 20 }}>
        <SkeletonBlock width={120} height={14} style={{ marginBottom: 12 }} />
        <SkeletonBlock width="100%" height={140} />
      </div>
      <div style={{ background: '#fff', borderRadius: 12, padding: 20 }}>
        <SkeletonBlock width={100} height={14} style={{ marginBottom: 12 }} />
        {[1,2,3,4].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <SkeletonBlock width={24} height={24} borderRadius={12} />
            <SkeletonBlock width="60%" height={12} />
            <SkeletonBlock width={40} height={12} style={{ marginLeft: 'auto' }} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ── Skeleton conges (liste cards) ───────────────────────────── */
export const SkeletonLeaves = ({ rows = 4 }) => (
  <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #ECEAE4', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <SkeletonBlock width={60} height={20} borderRadius={12} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonBlock width="50%" height={13} />
          <SkeletonBlock width="30%" height={10} />
        </div>
        <SkeletonBlock width={70} height={20} borderRadius={12} />
      </div>
    ))}
  </div>
);
