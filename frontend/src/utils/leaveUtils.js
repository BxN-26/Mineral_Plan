/**
 * utils/leaveUtils.js — Logique métier congés partagée
 * Centralise isMyApproval (utilisé dans CongesView et Sidebar).
 */

/**
 * Retourne true si l'utilisateur `user` est l'approbateur actif du congé `leave`.
 * @param {object} leave  - objet congé (avec n1/n2/n3 approver_id et _status)
 * @param {object|null} user  - utilisateur connecté (avec id)
 */
export function isMyApproval(leave, user) {
  if (!user?.id) return false;
  return (
    (leave.n1_approver_id === user.id && leave.n1_status === 'pending') ||
    (leave.n2_approver_id === user.id && leave.n2_status === 'pending') ||
    (leave.n3_approver_id === user.id && leave.n3_status === 'pending')
  );
}
