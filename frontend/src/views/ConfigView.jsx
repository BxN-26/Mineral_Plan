import { useState, useMemo } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Btn, Modal, Field, PageHeader, inputSt } from '../components/common';
import api from '../api/client';

/* ─── Onglets disponibles ── */
const TABS = [
  { id: 'equipes',   label: '🏠 Équipes' },
  { id: 'fonctions', label: '🔧 Fonctions' },
  { id: 'conges',    label: '🏖️ Congés' },
  { id: 'planning',  label: '📅 Planning' },
  { id: 'rh',        label: '👥 RH & Coûts' },
  { id: 'systeme',   label: '⚙️ Système' },
];

const ConfigView = () => {
  const { user }                                      = useAuth();
  const { teams, functions, settings, setSettings, reloadTeams, reloadFunctions } = useApp();
  const [tab, setTab]                                  = useState('equipes');
  const isAdmin = ['admin', 'superadmin'].includes(user?.role);

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9B9890', fontSize: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        Accès réservé aux administrateurs.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <PageHeader title="Configuration" subtitle="Paramètres de l'application" />

      {/* Onglets */}
      <div style={{ padding: '0 18px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 2, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? '#1E2235' : '#9B9890', borderBottom: tab === t.id ? '2px solid #C5753A' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 18px' }}>
        {tab === 'equipes'   && <TeamsConfig    teams={teams}     reload={reloadTeams} />}
        {tab === 'fonctions' && <FunctionsConfig functions={functions} reload={reloadFunctions} />}
        {tab === 'conges'    && <CongesConfig    settings={settings} setSettings={setSettings} />}
        {tab === 'planning'  && <PlanningConfig  settings={settings} setSettings={setSettings} />}
        {tab === 'rh'        && <RhConfig        settings={settings} setSettings={setSettings} />}
        {tab === 'systeme'   && <SystemeConfig   settings={settings} setSettings={setSettings} />}
      </div>
    </div>
  );
};

/* ─── Composant partagé ─────────────────────────────────────── */
// Hook simplifié pour lire/écrire un setting
function useSettings(settings, setSettings) {
  const map = useMemo(
    () => Object.fromEntries((Array.isArray(settings) ? settings : []).map(s => [s.key, s.value])),
    [settings]
  );
  const save = async (key, value) => {
    await api.put(`/settings/${key}`, { value: String(value) });
    setSettings(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      const exists = arr.some(s => s.key === key);
      if (exists) return arr.map(s => s.key === key ? { ...s, value: String(value) } : s);
      return [...arr, { key, value: String(value), type: 'string', description: '', group_name: 'general' }];
    });
  };
  return { map, save };
}

function SettingCard({ icon, title, desc, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ECEAE4', borderRadius: 10, padding: '16px 18px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {icon && <div style={{ fontSize: 24, lineHeight: 1.2, flexShrink: 0, marginTop: 2 }}>{icon}</div>}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235', marginBottom: 3 }}>{title}</div>
          {desc && <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 12, lineHeight: 1.5 }}>{desc}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button onClick={() => onChange(!on)} aria-label={label}
      style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: on ? '#C5753A' : '#D1D0CE', position: 'relative', flexShrink: 0,
        transition: 'background .2s' }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: on ? 23 : 3, transition: 'left .2s',
        pointerEvents: 'none' }} />
    </button>
  );
}

function NumInput({ value, onChange, min = 0, max = 9999, step = 1, unit = '' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onChange(e.target.value)} // commit on blur
        style={{ ...inputSt, width: 90 }} />
      {unit && <span style={{ fontSize: 12, color: '#6B6860' }}>{unit}</span>}
    </div>
  );
}

const SectionTitle = ({ children }) => (
  <div style={{ fontWeight: 700, fontSize: 11, color: '#6B6860', marginBottom: 12, marginTop: 4,
    textTransform: 'uppercase', letterSpacing: '.6px' }}>
    {children}
  </div>
);

/* ─── Onglet Congés & Absences ──────────────────────────── */
const CongesConfig = ({ settings, setSettings }) => {
  const { map, save } = useSettings(settings, setSettings);

  const noticeEnabled    = map['leave_min_notice_enabled'] === 'true';
  const noticeDays       = map['leave_min_notice_days']    || '2';
  const cpDefault        = map['leave_default_cp_balance'] || '25';
  const rttDefault       = map['leave_default_rtt_balance']|| '5';
  const countMethod      = map['leave_count_method']       || 'working_days';
  const fiscalType       = map['fiscal_year_type']         || 'calendar';
  const fiscalStartMonth = map['fiscal_year_start_month']  || '9';
  const fiscalStartDay   = map['fiscal_year_start_day']    || '1';

  // Aperçu de l'exercice personnalisé
  const fiscalPreview = (() => {
    if (fiscalType !== 'custom') return null;
    const sm = parseInt(fiscalStartMonth, 10);
    const sd = parseInt(fiscalStartDay,   10);
    const y  = new Date().getFullYear();
    const startStr = `${y}-${String(sm).padStart(2,'0')}-${String(sd).padStart(2,'0')}`;
    // Veille du début de l'exercice suivant — calcul en heure locale
    const endDt = new Date(y + 1, sm - 1, sd);
    endDt.setDate(endDt.getDate() - 1);
    const pad = n => String(n).padStart(2, '0');
    const endStr = `${endDt.getFullYear()}-${pad(endDt.getMonth()+1)}-${pad(endDt.getDate())}`;
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    return `${fmt(startStr)} → ${fmt(endStr)}`;
  })();

  return (
    <div style={{ maxWidth: 620 }}>
      <SectionTitle>Règles de demande de congés</SectionTitle>

      <SettingCard icon="📅" title="Délai minimum de préavis"
        desc="Oblige les salariés à soumettre leur demande un certain nombre de jours à l'avance. Les managers, RH et direction sont exemptés de cette règle.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: noticeEnabled ? 10 : 0 }}>
          <Toggle on={noticeEnabled} onChange={v => save('leave_min_notice_enabled', v)} />
          <span style={{ fontSize: 12, color: noticeEnabled ? '#16A34A' : '#9B9890' }}>
            {noticeEnabled ? 'Activé' : 'Désactivé'}
          </span>
        </div>
        {noticeEnabled && (
          <div>
            <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 4 }}>Nombre de jours minimum :</div>
            <NumInput value={noticeDays} min={1} max={90} unit="jours"
              onChange={v => save('leave_min_notice_days', parseInt(v, 10) || 1)} />
          </div>
        )}
      </SettingCard>

      <SettingCard icon="🧮" title="Méthode de décompte des congés"
        desc="Détermine si les congés sont comptés en jours ouvrés (hors week-end) ou en jours calendaires (tous les jours).">
        <select value={countMethod} onChange={e => save('leave_count_method', e.target.value)} style={{ ...inputSt, width: 'auto' }}>
          <option value="working_days">Jours ouvrés (hors samedi et dimanche)</option>
          <option value="calendar_days">Jours calendaires (tous les jours)</option>
        </select>
      </SettingCard>

      <SectionTitle>Exercice comptable</SectionTitle>

      <SettingCard icon="📆" title="Bornes de l'année comptable"
        desc="Définit les dates de début et fin de l'exercice. Utilisé dans les relevés annuels, les statistiques et le calcul de la balance d'heures de chaque salarié.">
        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          {[
            { v: 'calendar', l: '📆 Année calendaire', d: '1 janv. → 31 déc.' },
            { v: 'custom',   l: '🗓 Exercice personnalisé', d: 'ex : 1 sept. → 31 août' },
          ].map(opt => (
            <button key={opt.v} onClick={() => save('fiscal_year_type', opt.v)} style={{
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', background: '#F5F3EF', color: '#1E2235',
              border: fiscalType === opt.v ? '2px solid #C5753A' : '2px solid transparent',
              boxShadow: fiscalType === opt.v ? '0 0 0 1px #C5753A' : 'none',
              transition: 'border .15s',
            }}>
              <div>{opt.l}</div>
              <div style={{ fontSize: 10, fontWeight: 400, color: '#6B6860', marginTop: 1 }}>{opt.d}</div>
            </button>
          ))}
        </div>
      </SettingCard>

      {fiscalType === 'custom' && (
        <SettingCard icon="🗓" title="Jour et mois de début de l'exercice"
          desc="L'exercice commence à la date indiquée et se termine la veille du même jour l'année suivante.">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
            <div>
              <div style={{ fontSize: 11, color: '#6B6860', marginBottom: 3 }}>Mois de début</div>
              <select value={fiscalStartMonth} onChange={e => save('fiscal_year_start_month', e.target.value)} style={{ ...inputSt, width: 'auto' }}>
                {['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'].map((m, i) => (
                  <option key={i+1} value={i+1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6B6860', marginBottom: 3 }}>Jour</div>
              <NumInput value={fiscalStartDay} min={1} max={28}
                onChange={v => save('fiscal_year_start_day', parseInt(v,10) || 1)} />
            </div>
          </div>
          {fiscalPreview && (
            <div style={{ marginTop: 12, background: '#EBF5F0', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#047857' }}>
              ✅ Exercice en cours : <strong>{fiscalPreview}</strong>
            </div>
          )}
        </SettingCard>
      )}

      <SectionTitle>Soldes attribués aux nouveaux salariés</SectionTitle>

      <SettingCard icon="🏖️" title="Solde CP par défaut"
        desc="Nombre de jours de congés payés pré-rempli lors de la création d'un nouveau salarié. Modifiable individuellement ensuite.">
        <NumInput value={cpDefault} min={0} max={60} unit="jours"
          onChange={v => save('leave_default_cp_balance', parseInt(v, 10) || 0)} />
      </SettingCard>

      <SettingCard icon="🗓️" title="Solde RTT par défaut"
        desc="Nombre de jours de RTT pré-rempli lors de la création d'un nouveau salarié.">
        <NumInput value={rttDefault} min={0} max={30} unit="jours"
          onChange={v => save('leave_default_rtt_balance', parseInt(v, 10) || 0)} />
      </SettingCard>
    </div>
  );
};


/* ─── Onglet Planning ────────────────────────────────── */
const PlanningConfig = ({ settings, setSettings }) => {
  const { map, save } = useSettings(settings, setSettings);

  const dayStart = map['planning_day_start'] || '7';
  const dayEnd   = map['planning_day_end']   || '22';

  const maxAmpEnabled = map['planning_max_amplitude_enabled'] === 'true';
  const maxAmpHours   = map['planning_max_amplitude_hours']   || '12';
  const minRestEnabled= map['planning_min_rest_enabled']       === 'true';
  const minRestHours  = map['planning_min_rest_hours']         || '11';

  return (
    <div style={{ maxWidth: 620 }}>
      <SectionTitle>Amplitude horaire d'affichage</SectionTitle>

      <SettingCard icon="🌅" title="Heure de début du planning"
        desc="Première heure visible dans la grille de planning. En-dessous de cette heure, les créneaux ne sont pas affichés.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <input type="range" min={0} max={12} step={1} value={dayStart}
            onChange={e => save('planning_day_start', e.target.value)}
            style={{ width: 160 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1E2235', minWidth: 40 }}>{dayStart}h00</span>
        </div>
        <div style={{ fontSize: 11, color: '#9B9890', marginTop: 4 }}>
          Valeur actuelle : {dayStart}h00 — min 0h, max 12h
        </div>
      </SettingCard>

      <SettingCard icon="🌙" title="Heure de fin du planning"
        desc="Dernière heure visible dans la grille de planning. Au-delà, les créneaux ne sont pas affichés.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <input type="range" min={13} max={24} step={1} value={dayEnd}
            onChange={e => save('planning_day_end', e.target.value)}
            style={{ width: 160 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1E2235', minWidth: 40 }}>{dayEnd}h00</span>
        </div>
        <div style={{ fontSize: 11, color: '#9B9890', marginTop: 4 }}>
          Valeur actuelle : {dayEnd}h00 — min 13h, max 24h
        </div>
      </SettingCard>

      <div style={{ background: '#EBF5F0', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#047857' }}>
        ℹ️ L'amplitude actuelle est de <strong>{Number(dayEnd) - Number(dayStart)} heures</strong> ({dayStart}h → {dayEnd}h). Rechargez le planning pour voir les changements.
      </div>

      <SectionTitle style={{ marginTop: 20 }}>Contraintes horaires des salariés</SectionTitle>

      <SettingCard icon="⏱️" title="Amplitude journalière maximale"
        desc="Limite le nombre d'heures entre la première et la dernière minute travaillée dans la même journée. Exemple : un poste 8h–10h suivi d'un poste 18h–20h donne une amplitude de 12h, pas 4h cumulées.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: maxAmpEnabled ? 10 : 0 }}>
          <Toggle on={maxAmpEnabled} onChange={v => save('planning_max_amplitude_enabled', v)} />
          <span style={{ fontSize: 12, color: maxAmpEnabled ? '#16A34A' : '#9B9890' }}>
            {maxAmpEnabled ? 'Activé — vérification à chaque assignation' : 'Désactivé'}
          </span>
        </div>
        {maxAmpEnabled && (
          <div>
            <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 4 }}>Amplitude maximale autorisée :</div>
            <NumInput value={maxAmpHours} min={1} max={24} unit="heures / jour"
              onChange={v => save('planning_max_amplitude_hours', parseInt(v, 10) || 12)} />
            <div style={{ fontSize: 11, color: '#9B9890', marginTop: 6 }}>
              Référence légale France : <strong>13h maximum</strong> (Code du travail, hors dérogation)
            </div>
          </div>
        )}
      </SettingCard>

      <SettingCard icon="💤" title="Repos minimum entre deux prises de poste"
        desc="Vérifie qu'un salarié a bien bénéficié d'un temps de repos suffisant depuis la fin de son dernier poste (toutes fonctions confondues, sur la semaine en cours).">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: minRestEnabled ? 10 : 0 }}>
          <Toggle on={minRestEnabled} onChange={v => save('planning_min_rest_enabled', v)} />
          <span style={{ fontSize: 12, color: minRestEnabled ? '#16A34A' : '#9B9890' }}>
            {minRestEnabled ? 'Activé — vérification à chaque assignation' : 'Désactivé'}
          </span>
        </div>
        {minRestEnabled && (
          <div>
            <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 4 }}>Durée minimale de repos :</div>
            <NumInput value={minRestHours} min={1} max={24} unit="heures consécutives"
              onChange={v => save('planning_min_rest_hours', parseInt(v, 10) || 11)} />
            <div style={{ fontSize: 11, color: '#9B9890', marginTop: 6 }}>
              Repos quotidien légal France : <strong>11h minimum</strong> (directive européenne 2003/88/CE)
            </div>
          </div>
        )}
      </SettingCard>
    </div>
  );
};

/* ─── Onglet RH & Coûts ─────────────────────────────── */
const RhConfig = ({ settings, setSettings }) => {
  const { map, save } = useSettings(settings, setSettings);

  const chargeRate = map['rh_default_charge_rate'] || '45';
  const contractH  = map['rh_default_contract_h']  || '35';

  // Bases horaires configurables
  const CONTRACT_BASES = [
    {
      key: 'hebdo',
      icon: '📅',
      defaultLabel: 'Horaire hebdomadaire',
      desc: 'Contrat défini en heures par semaine (ex: 35h/sem). Principalement utilisé pour les salariés CDI/CDD. Le champ "Heures/sem" sera affiché dans la fiche du salarié.',
    },
    {
      key: 'annuel',
      icon: '📆',
      defaultLabel: 'Annualisé',
      desc: 'Volume horaire défini sur l\'année entière. Les heures peuvent être réparties inégalement selon les périodes (pic d\'activité, basse saison…). Le champ "Heures/an" sera affiché dans la fiche.',
    },
    {
      key: 'aucune',
      icon: '🔓',
      defaultLabel: 'Sans base horaire',
      desc: 'Aucune base contractuelle. Aucun champ d\'heures n\'est affiché. Utilisé pour les bénévoles, renforts, et les indépendants sans contrat d\'heures défini.',
    },
  ];

  return (
    <div style={{ maxWidth: 620 }}>
      <SectionTitle>Bases horaires de contrat</SectionTitle>

      <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 14, lineHeight: 1.6 }}>
        Définissez les modes de base horaire disponibles lors de la création ou modification d'un membre du personnel.
        Désactiver une option la retire des menus de sélection. Vous pouvez personnaliser les libellés selon votre convention collective.
      </div>

      {CONTRACT_BASES.map(({ key, icon, defaultLabel, desc }) => {
        const enabled = map[`contract_base_${key}_enabled`] !== 'false';
        const label   = map[`contract_base_${key}_label`]   || defaultLabel;
        return (
          <div key={key} style={{
            background: '#fff', border: `1px solid ${enabled ? '#ECEAE4' : '#F0EDE8'}`,
            borderRadius: 10, padding: '14px 16px', marginBottom: 10,
            opacity: enabled ? 1 : 0.65,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 22, lineHeight: 1.2, flexShrink: 0, marginTop: 2 }}>{icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235' }}>{label}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: enabled ? '#DCFCE7' : '#F1F0EE',
                    color:      enabled ? '#16A34A' : '#9B9890',
                  }}>{enabled ? 'ACTIF' : 'DÉSACTIVÉ'}</span>
                </div>
                <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 12, lineHeight: 1.5 }}>{desc}</div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Toggle activer/désactiver */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Toggle on={enabled} onChange={v => save(`contract_base_${key}_enabled`, v)} />
                    <span style={{ fontSize: 12, color: enabled ? '#16A34A' : '#9B9890' }}>
                      {enabled ? 'Activé' : 'Désactivé'}
                    </span>
                  </div>
                  {/* Édition du libellé */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
                    <span style={{ fontSize: 11, color: '#6B6860', flexShrink: 0 }}>Libellé :</span>
                    <input
                      value={label}
                      onChange={e => save(`contract_base_${key}_label`, e.target.value)}
                      style={{ ...inputSt, flex: 1, fontSize: 12, padding: '5px 8px' }}
                      placeholder={defaultLabel} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div style={{ background: '#EBF5F0', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#047857', marginBottom: 20 }}>
        ℹ️ La valeur <strong>"Sans base horaire"</strong> est automatiquement assignée aux <em>bénévoles</em> et <em>renforts</em>.
        Pour les <strong>indépendants</strong>, la base est paramétrable individuellement et peut être modifiée ici dès que votre besoin évolue.
      </div>

      <SectionTitle>Valeurs par défaut — nouveaux salariés horaires</SectionTitle>

      <SettingCard icon="⏱️" title="Heures hebdomadaires par défaut"
        desc="Nombre d'heures pré-rempli lors de la création d'un salarié en base 'Horaire hebdomadaire'. Modifiable individuellement.">
        <NumInput value={contractH} min={1} max={60} unit="h / semaine"
          onChange={v => save('rh_default_contract_h', parseInt(v, 10) || 35)} />
      </SettingCard>

      <SectionTitle>Charges & coûts</SectionTitle>

      <SettingCard icon="💶" title="Taux de charges patronales par défaut"
        desc="Taux utilisé dans le calcul du coût réel d'un salarié (coût brut × (1 + taux charges)). Applicable à la création de nouveau personnel. Correspond au taux global charges patronales (URSSAF, retraite, prévoyance…).">
        <NumInput value={chargeRate} min={0} max={100} step={1} unit="%"
          onChange={v => save('rh_default_charge_rate', parseInt(v, 10) || 45)} />
        <div style={{ fontSize: 11, color: '#9B9890', marginTop: 6 }}>
          Exemple : salaire brut 2 000€ × (1 + {chargeRate}%) = coût employeur ≈ {Math.round(2000 * (1 + Number(chargeRate)/100))} €
        </div>
      </SettingCard>

      <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400E' }}>
        ⚠️ Ces valeurs sont des <strong>défauts à la création</strong> uniquement. Chaque salarié peut avoir son propre taux configuré individuellement dans sa fiche.
      </div>
    </div>
  );
};

/* ─── Paramètres système ─────────────────────────────── */
const SystemeConfig = ({ settings, setSettings }) => {
  const { map, save } = useSettings(settings, setSettings);
  const { isDark, setTheme } = useTheme();

  const pushEnabled = map['push_notifications_enabled'] === 'true';

  const handleThemeToggle = async (dark) => {
    const val = dark ? 'dark' : 'light';
    setTheme(val); // local immédiat
    try { await api.put('/settings/ui_theme', { value: val }); } catch (_) {}
  };

  const TOGGLE_STYLE = (on) => ({
    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
    background: on ? '#C5753A' : '#D1D0CE', position: 'relative', flexShrink: 0,
    transition: 'background .2s',
  });
  const KNOB_STYLE = (on) => ({
    width: 18, height: 18, borderRadius: '50%', background: '#fff',
    position: 'absolute', top: 3, left: on ? 23 : 3, transition: 'left .2s',
    pointerEvents: 'none',
  });

  return (
    <div style={{ maxWidth: 620 }}>
      <SectionTitle>Apparence</SectionTitle>

      <div style={{ background: '#fff', border: '1px solid #ECEAE4', borderRadius: 10, padding: '16px 18px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ fontSize: 24, lineHeight: 1.2, flexShrink: 0, marginTop: 2 }}>
          {isDark ? '🌙' : '☀️'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235', marginBottom: 3 }}>Thème de l'interface</div>
          <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 12, lineHeight: 1.5 }}>
            Basculez entre le thème <strong>Clair</strong> (fond crème, texte sombre) et le thème <strong>Sombre</strong> (fond nuit, texte clair).
            La préférence est enregistrée sur cet appareil.
          </div>
          {/* Sélecteur visuel */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ val: false, label: '☀️ Clair', bg: '#F5F3EF', fg: '#1E2235' },
              { val: true,  label: '🌙 Sombre', bg: '#1A1F2E', fg: '#E8E6E0' }].map(opt => (
              <button key={opt.label} onClick={() => handleThemeToggle(opt.val)}
                style={{
                  padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  fontFamily: 'inherit', background: opt.bg, color: opt.fg,
                  border: isDark === opt.val ? '2px solid #C5753A' : '2px solid transparent',
                  boxShadow: isDark === opt.val ? '0 0 0 1px #C5753A' : 'none',
                  transition: 'border .15s',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SectionTitle>Fonctionnalités</SectionTitle>

      {/* Notifications push */}
      <div style={{ background: '#fff', border: '1px solid #ECEAE4', borderRadius: 10, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ fontSize: 24, lineHeight: 1.2, flexShrink: 0, marginTop: 2 }}>🔔</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235', marginBottom: 3 }}>Notifications push</div>
          <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 8, lineHeight: 1.5 }}>
            Permet aux salariés de recevoir des notifications instantanées sur leur téléphone ou ordinateur
            (congé validé, refusé, modifications planning…).<br />
            Compatible Android, iPhone (iOS 16.4+) et desktop Chrome/Edge.
          </div>
          <div style={{ fontSize: 11, color: pushEnabled ? '#16A34A' : '#9B9890' }}>
            {pushEnabled
              ? '✅ Activé — les utilisateurs seront invités à s\'abonner à leur prochaine connexion'
              : '⭕ Désactivé'}
          </div>
        </div>
        <button onClick={async () => {
          try {
            const v = !pushEnabled;
            await api.put('/settings/push_notifications_enabled', { value: String(v) });
            setSettings(prev => (Array.isArray(prev) ? prev : []).map(s =>
              s.key === 'push_notifications_enabled' ? { ...s, value: String(v) } : s));
          } catch (e) { window.alert(e.response?.data?.error || 'Erreur'); }
        }}
          style={TOGGLE_STYLE(pushEnabled)} aria-label="Toggle push notifications">
          <div style={KNOB_STYLE(pushEnabled)} />
        </button>
      </div>
    </div>
  );
};

/* ─── Gestion des équipes ──────────────────────────────── */
const TeamsConfig = ({ teams, reload }) => {
  const [edit,    setEdit]    = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [err,     setErr]     = useState('');

  const handleSave = async (data) => {
    try {
      if (edit) await api.put(`/teams/${edit.id}`, data);
      else      await api.post('/teams', data);
      await reload();
      setShowForm(false);
      setEdit(null);
    } catch (e) {
      setErr(e.response?.data?.error || 'Erreur de sauvegarde');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette équipe ?')) return;
    try {
      await api.delete(`/teams/${id}`);
      await reload();
    } catch (e) {
      window.alert(e.response?.data?.error || 'Erreur de suppression');
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#1E2235' }}>Équipes ({teams.length})</span>
        <Btn variant="primary" onClick={() => { setEdit(null); setShowForm(true); setErr(''); }}>+ Nouvelle équipe</Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {teams.map(t => (
          <div key={t.id} style={{ background: '#fff', border: '1px solid #ECEAE4', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235' }}>{t.name}</div>
              <div style={{ fontSize: 10, color: '#9B9890' }}>{t.slug}</div>
            </div>
            <button onClick={() => { setEdit(t); setShowForm(true); setErr(''); }}
              style={{ padding: '4px 8px', border: '1px solid #E4E0D8', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11 }}>✏️</button>
            <button onClick={() => handleDelete(t.id)}
              style={{ padding: '4px 8px', border: '1px solid #FECACA', borderRadius: 5, background: '#FEF2F2', cursor: 'pointer', fontSize: 11, color: '#DC2626' }}>🗑</button>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={edit ? 'Modifier l\'équipe' : 'Nouvelle équipe'}>
          <TeamForm initial={edit} err={err} onSave={handleSave} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
};

const TeamForm = ({ initial, err, onSave, onCancel }) => {
  const [form, setForm] = useState({ name: initial?.name || '', slug: initial?.slug || '' });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {err && <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: 6, color: '#DC2626', fontSize: 12 }}>{err}</div>}
      <Field label="Nom"><input value={form.name} onChange={e => set('name', e.target.value)} style={inp} /></Field>
      <Field label="Slug (identifiant)"><input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/\s/g, '_'))} style={inp} /></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Annuler</Btn>
        <Btn variant="primary" onClick={() => onSave(form)}>Enregistrer</Btn>
      </div>
    </div>
  );
};

/* ─── Gestion des fonctions ─────────────────────────── */
const FunctionsConfig = ({ functions, reload }) => {
  const [edit,     setEdit]     = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [err,      setErr]      = useState('');

  const handleSave = async (data) => {
    try {
      if (edit) await api.put(`/functions/${edit.id}`, data);
      else      await api.post('/functions', data);
      await reload();
      setShowForm(false);
      setEdit(null);
    } catch (e) {
      setErr(e.response?.data?.error || 'Erreur de sauvegarde');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette fonction ?')) return;
    try {
      await api.delete(`/functions/${id}`);
      await reload();
    } catch (e) {
      window.alert(e.response?.data?.error || 'Erreur de suppression');
    }
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#1E2235' }}>Fonctions ({functions.length})</span>
        <Btn variant="primary" onClick={() => { setEdit(null); setShowForm(true); setErr(''); }}>+ Nouvelle fonction</Btn>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 8 }}>
        {functions.map(f => (
          <div key={f.id} style={{ background: '#fff', border: `1px solid ${f.color}30`, borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{f.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: f.color }}>{f.name}</div>
              <div style={{ fontSize: 10, color: '#9B9890' }}>{f.slug}</div>
            </div>
            <button onClick={() => { setEdit(f); setShowForm(true); setErr(''); }}
              style={{ padding: '4px 8px', border: '1px solid #E4E0D8', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11 }}>✏️</button>
            <button onClick={() => handleDelete(f.id)}
              style={{ padding: '4px 8px', border: '1px solid #FECACA', borderRadius: 5, background: '#FEF2F2', cursor: 'pointer', fontSize: 11, color: '#DC2626' }}>🗑</button>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={edit ? 'Modifier la fonction' : 'Nouvelle fonction'}>
          <FunctionForm initial={edit} err={err} onSave={handleSave} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
};

const FunctionForm = ({ initial, err, onSave, onCancel }) => {
  const [form, setForm] = useState({
    name:     initial?.name     || '',
    slug:     initial?.slug     || '',
    icon:     initial?.icon     || '⚙️',
    color:    initial?.color    || '#6B7280',
    bg_color: initial?.bg_color || '#F9FAFB',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {err && <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: 6, color: '#DC2626', fontSize: 12 }}>{err}</div>}
      <Field label="Nom"><input value={form.name} onChange={e => set('name', e.target.value)} style={inp} /></Field>
      <Field label="Slug"><input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/\s/g, '_'))} style={inp} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Icône (emoji)"><input value={form.icon} onChange={e => set('icon', e.target.value)} style={inp} /></Field>
        <Field label="Couleur"><input type="color" value={form.color} onChange={e => set('color', e.target.value)} style={{ ...inp, padding: 2, height: 36 }} /></Field>
        <Field label="Fond"><input type="color" value={form.bg_color} onChange={e => set('bg_color', e.target.value)} style={{ ...inp, padding: 2, height: 36 }} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Annuler</Btn>
        <Btn variant="primary" onClick={() => onSave(form)}>Enregistrer</Btn>
      </div>
    </div>
  );
};

const inp = { padding: '6px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, width: '100%' };

export default ConfigView;
