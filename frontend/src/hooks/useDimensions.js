/**
 * hooks/useDimensions.js — Hooks partagés de détection viewport
 * Remplace les copies locales dans PlanningView, MonPlanningView,
 * TeamPlanningView, RelevesView, etc.
 */
import { useState, useEffect } from 'react';

/** true si la largeur de fenêtre est < 768px */
export function useIsMobile() {
  const [v, set] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => set(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return v;
}

/** true si la largeur de fenêtre est < 1024px (écrans tactiles / tablettes) */
export function useIsTouch() {
  const [v, set] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const h = () => set(window.innerWidth < 1024);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return v;
}
