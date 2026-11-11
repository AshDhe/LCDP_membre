/* PLANIFIER — gestionnaire unique d'attente pour les traitements asynchrones.
 * Les opérations métier et les dialogues restent propriétaires de leur cycle de vie.
 */
(() => {
  'use strict';
  if (window.LCDP_ATTENTE_PLANIFIER) return;
  const operations = new Map();
  let masque = null;
  let numero = 0;
  const MINIMUM_MS = 500;
  function actualiser() {
    if (!operations.size) { masque?.remove(); masque = null; return; }
    if (!masque) {
      masque = document.createElement('div');
      masque.className = 'lcdp-planifier-partage-attente lcdp-attente-plein-ecran';
      masque.setAttribute('role', 'status');
      masque.setAttribute('aria-live', 'polite');
      const roue = document.createElement('div');
      roue.className = 'lcdp-loading-spinner';
      roue.setAttribute('aria-hidden', 'true');
      roue.innerHTML = `<svg class="lcdp-loading-spinner__track" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"></circle></svg><svg class="lcdp-loading-spinner__arc" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="75"></circle></svg><span class="lcdp-loading-spinner__dot"></span>`;
      masque.append(roue);
      const hote = document.getElementById('lcdp-planifier-dialogues-slot');
      if (!hote) throw new Error('Emplacement des attentes PLANIFIER introuvable.');
      hote.append(masque);
    }
    masque.setAttribute('aria-label', [...operations.values()].at(-1).libelle);
  }
  function commencer(libelle = 'Chargement en cours') {
    const id = ++numero;
    const depart = performance.now();
    operations.set(id, { libelle });
    actualiser();
    let fin = null;
    return function terminer() {
      if (fin) return fin;
      fin = new Promise(resolve => {
        const delai = Math.max(0, MINIMUM_MS - (performance.now() - depart));
        window.setTimeout(() => {
          operations.delete(id);
          actualiser();
          resolve();
        }, delai);
      });
      return fin;
    };
  }
  async function pendant(operation, libelle) {
    const terminer = commencer(libelle);
    try { return await operation(); }
    finally { await terminer(); }
  }
  window.LCDP_ATTENTE_PLANIFIER = Object.freeze({ commencer, pendant });
})();
