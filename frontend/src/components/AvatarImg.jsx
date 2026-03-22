import { useState, useEffect } from 'react';
import api from '../api/client';

/**
 * Affiche la photo de profil du salarié si elle existe,
 * sinon les initiales colorées.
 *
 * Props:
 *  s         — objet staff (id, initials, color, avatar_url)
 *  size      — taille en px (défaut 30)
 *  editable  — si true, survol → bouton 📷 pour uploader
 *  onUpdate  — callback(updatedStaff) après upload
 *  className — classe CSS optionnelle
 */
const AvatarImg = ({ s, size = 30, editable = false, onUpdate, className }) => {
  const [hover,    setHover]    = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [imgError, setImgError] = useState(false);

  // Réinitialiser l'erreur d'image quand l'URL change (nouvel upload)
  useEffect(() => { setImgError(false); }, [s?.avatar_url]);

  const showImg = s?.avatar_url && !imgError;
  const radius  = size >= 60 ? 14 : '50%';

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      // Content-Type: null annule le défaut 'application/json' de l'instance axios.
      // Le navigateur/XHR peut alors définir automatiquement
      // 'multipart/form-data; boundary=...' requis par multer.
      const res = await api.post(`/staff/${s.id}/avatar`, fd, {
        headers: { 'Content-Type': null },
      });
      onUpdate?.(res.data);
    } catch (err) {
      console.error('Erreur upload avatar', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={className}
      style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}
      onMouseEnter={() => editable && setHover(true)}
      onMouseLeave={() => editable && setHover(false)}
    >
      {showImg ? (
        <img
          src={s.avatar_url}
          alt={s.initials}
          onError={() => setImgError(true)}
          style={{
            width: size, height: size, borderRadius: radius,
            objectFit: 'cover', display: 'block',
          }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: radius,
          background: s?.color || '#6366F1', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.32, fontWeight: 700, flexShrink: 0,
          userSelect: 'none',
        }}>
          {s?.initials || '?'}
        </div>
      )}

      {/* Overlay édition — toujours dans le DOM (opacité contrôlée),
          sinon mouseleave détruit le label avant que onChange se déclenche */}
      {editable && (
        <label style={{
          position: 'absolute', inset: 0, borderRadius: radius,
          background: 'rgba(0,0,0,.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: size * 0.3,
          opacity: (hover || loading) ? 1 : 0,
          transition: 'opacity .15s',
          pointerEvents: (hover || loading) ? 'auto' : 'none',
        }}>
          {loading ? '⏳' : '📷'}
          <input
            type="file" accept="image/*" style={{ display: 'none' }}
            onChange={handleUpload}
            disabled={loading}
          />
        </label>
      )}
    </div>
  );
};

export default AvatarImg;
