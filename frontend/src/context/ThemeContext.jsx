import { createContext, useContext, useEffect, useState } from 'react';

/* ── Palettes ─────────────────────────────────────────────────── */
export const LIGHT = {
  bgPage:        '#F5F3EF',
  bgSurface:     '#FFFFFF',
  bgSurfaceAlt:  '#FAFAF7',
  bgBorder:      '#ECEAE4',
  bgBorderLight: '#F0EDE8',
  textPrimary:   '#1E2235',
  textSecondary: '#6B6860',
  textMuted:     '#9B9890',
  sidebar:       '#181C2E',
  sidebarBorder: 'rgba(255,255,255,.07)',
  sidebarText:   'rgba(255,255,255,.6)',
  sidebarActive: 'rgba(255,255,255,.08)',
  brand:         '#C5753A',
  brandLight:    '#FFF7ED',
  isDark: false,
};

export const DARK = {
  bgPage:        '#0F1117',
  bgSurface:     '#1A1F2E',
  bgSurfaceAlt:  '#1E2235',
  bgBorder:      '#2A3045',
  bgBorderLight: '#252B3D',
  textPrimary:   '#E8E6E0',
  textSecondary: '#9B97A0',
  textMuted:     '#5C5A6A',
  sidebar:       '#0D1020',
  sidebarBorder: 'rgba(255,255,255,.05)',
  sidebarText:   'rgba(255,255,255,.45)',
  sidebarActive: 'rgba(255,255,255,.06)',
  brand:         '#C5753A',
  brandLight:    '#2A1F10',
  isDark: true,
};

/* ── Contexte ─────────────────────────────────────────────────── */
const ThemeCtx = createContext({ colors: LIGHT, toggleTheme: () => {} });
export const useTheme = () => useContext(ThemeCtx);

/* ── Provider ─────────────────────────────────────────────────── */
export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('spirit_theme') === 'dark'; } catch { return false; }
  });

  const colors = isDark ? DARK : LIGHT;

  // Injecte les variables CSS sur <html> pour les rares cas de CSS global
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.style.setProperty('--bg-page',      colors.bgPage);
    root.style.setProperty('--bg-surface',   colors.bgSurface);
    root.style.setProperty('--text-primary', colors.textPrimary);
    root.style.setProperty('--text-muted',   colors.textMuted);
    root.style.setProperty('--border',       colors.bgBorder);
    document.body.style.background = colors.bgPage;
    document.body.style.color      = colors.textPrimary;
  }, [isDark, colors]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    try { localStorage.setItem('spirit_theme', next ? 'dark' : 'light'); } catch {}
  };

  // Permet une synchronisation depuis un paramètre DB (appelé par le toggle admin)
  const setTheme = (value) => {
    const dark = value === 'dark';
    setIsDark(dark);
    try { localStorage.setItem('spirit_theme', value); } catch {}
  };

  return (
    <ThemeCtx.Provider value={{ colors, isDark, toggleTheme, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}
