import axios from 'axios';

const api = axios.create({
  baseURL:        '/api',
  withCredentials: true,   // envoie les cookies httpOnly
  headers: { 'Content-Type': 'application/json' },
});

// ── Intercepteur de réponse ───────────────────────────────────
// Si le serveur retourne 401 avec code TOKEN_EXPIRED :
//   → appelle /api/auth/refresh (cookie spirit_refresh envoyé automatiquement)
//   → si succès, réessaie la requête originale
//   → sinon, redirige vers /login via un événement custom

let isRefreshing = false;
let refreshQueue = [];

function flushQueue(error) {
  refreshQueue.forEach(cb => cb(error));
  refreshQueue = [];
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    const status   = err.response?.status;
    const code     = err.response?.data?.code;

    // Eviter la boucle infinie sur les routes auth elles-mêmes
    if (original._retry || original.url?.includes('/auth/')) {
      return Promise.reject(err);
    }

    // Tenter un refresh pour tout 401 (cookie expiré/absent OU TOKEN_EXPIRED)
    if (status === 401 && (code === 'TOKEN_EXPIRED' || !code)) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push(error => error ? reject(error) : resolve(api(original)));
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        await api.post('/auth/refresh');
        flushQueue(null);
        return api(original);
      } catch (refreshErr) {
        flushQueue(refreshErr);
        // Signaler à l'app que la session est expirée
        window.dispatchEvent(new CustomEvent('spirit:session-expired'));
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

export default api;
