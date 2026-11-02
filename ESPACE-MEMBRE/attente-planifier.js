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
  const chemin = () => {
    if (typeof window.LCDP_urlObjet === 'function') return window.LCDP_urlObjet('/BOX/pictowait.svg');
    return '/OBJET/BOX/pictowait.svg';
  };
  function actualiser() {
    if (!operations.size) { masque?.remove(); masque = null; return; }
    if (!masque) {
      masque = document.createElement('div');
      masque.className = 'lcdp-planifier-partage-attente'; // CSS existant, aucun style supplémentaire
      masque.setAttribute('role', 'status');
      masque.setAttribute('aria-live', 'polite');
      const attente = document.createElement('div');
      attente.className = 'lcdp-pictowait';
      attente.dataset.lcdpPictowait = '';
      const image = document.createElement('img');
      image.className = 'lcdp-pictowait__image';
      image.src = chemin();
      image.alt = '';
      image.width = 56;
      image.height = 56;
      image.setAttribute('aria-hidden', 'true');
      attente.append(image); masque.append(attente);
      document.body.append(masque);
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
