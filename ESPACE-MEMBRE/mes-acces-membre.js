/* MES ACCÈS : filtres contextuels sur la liste de réservations existante.
   Le Worker reste l'autorité métier. Aucun droit n'est calculé ici.
   Chargé après planning-membre.js pour préserver les actions historiques. */
(() => {
  'use strict';

  const config = window.SITE_CONFIG || {};
  const selecteurs = Object.freeze({
    racine: '#lcdp-planning-calendrier-slot',
    liste: '[data-lcdp-liste-card-list]',
    commandes: '[data-lcdp-liste-card-commande]',
    card: '[data-lcdp-box-card-reservation-membre]',
    onglet: '[data-lcdp-planning-periode]',
    parc: '[data-lcdp-card-reservation-parc]',
    departement: '[data-lcdp-card-reservation-departement]'
  });

  const etat = {
    parc: '',
    recues: false,
    envoyees: false,
    statsParFlux: new Map(),
    statsDisponibles: false,
    statsErreur: false,
    liste: null,
    filtres: null,
    observateurListe: null,
    observationInstallation: null,
    raf: null,
    chargementStats: null
  };

  function endpointInvitations() {
    const url = config.workerInviterMembreUrl || config.WORKER_INVITER_MEMBRE_URL ||
      (typeof config.apiUrl === 'function' ? config.apiUrl('inviter-membre-api') : '');
    return String(url || '').replace(/\/+$/, '');
  }

  async function actualiserStatsInvitations() {
    if (etat.chargementStats) return etat.chargementStats;
    const base = endpointInvitations();
    if (!base) {
      etat.statsDisponibles = false;
      etat.statsErreur = true;
      demanderRendu();
      return;
    }
    etat.chargementStats = (async () => {
      try {
        const reponse = await fetch(base + '/reservations-invitables', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        const data = await reponse.json().catch(() => null);
        if (!reponse.ok || !data || (data.ok !== true && data.success !== true) || !Array.isArray(data.reservations)) {
          throw new Error('Statuts des invitations indisponibles.');
        }
        const parFlux = new Map();
        for (const reservation of data.reservations) {
          const idflux = String(reservation?.idflux || '').trim();
          if (!idflux) continue;
          const stats = reservation?.invitationStats || reservation?.invitationsStats || {};
          const nombre = Number(stats.in ?? stats.actifs ?? stats.invites ?? 0);
          parFlux.set(idflux, Number.isFinite(nombre) && nombre > 0 ? nombre : 0);
        }
        etat.statsParFlux = parFlux;
        etat.statsDisponibles = true;
        etat.statsErreur = false;
      } catch (erreur) {
        console.warn('[MES ACCÈS] Impossible de vérifier les invitations envoyées :', erreur);
        etat.statsDisponibles = false;
        etat.statsErreur = true;
      } finally {
        etat.chargementStats = null;
        demanderRendu();
      }
    })();
    return etat.chargementStats;
  }

  function creerFiltres() {
    const racine = document.createElement('section');
    racine.className = 'lcdp-box-liste-card__tools lcdp-mes-acces-filtres';
    racine.setAttribute('aria-label', 'Filtrer les accès à venir');
    racine.innerHTML = `
      <div class="lcdp-mes-acces-filtres__ligne" style="display:flex; flex-wrap:wrap; align-items:center; gap:12px">
        <label class="lcdp-mes-acces-filtres__parc" style="display:flex; flex-direction:column; gap:4px; flex:1 1 180px">
          Parc
          <select data-mes-acces-parc aria-label="Filtrer par parc">
            <option value="">Tous les parcs</option>
          </select>
        </label>
        <div class="lcdp-mes-acces-filtres__types" role="group" aria-label="Type d'accès" style="display:flex; flex-wrap:wrap; gap:8px">
          <button type="button" class="lcdp-button lcdp-button-mini lcdp-button-secondary lcdp-mes-acces-filtres__chip" data-mes-acces-recues aria-pressed="false">INVT reçues</button>
          <button type="button" class="lcdp-button lcdp-button-mini lcdp-button-secondary lcdp-mes-acces-filtres__chip" data-mes-acces-envoyees aria-pressed="false" disabled>Invitations envoyées</button>
        </div>
        <button type="button" class="lcdp-button lcdp-button-mini lcdp-button-secondary lcdp-mes-acces-filtres__effacer" data-mes-acces-effacer disabled>Effacer les filtres</button>
      </div>
      <p class="lcdp-mes-acces-filtres__info" data-mes-acces-info role="status" aria-live="polite"></p>
      <p class="lcdp-mes-acces-filtres__avertissement" data-mes-acces-avertissement role="status"></p>`;

    const select = racine.querySelector('[data-mes-acces-parc]');
    select.style.minHeight = '40px';
    select.style.maxWidth = '100%';
    select.addEventListener('change', (event) => {
      etat.parc = event.currentTarget.value;
      demanderRendu();
    });
    racine.querySelector('[data-mes-acces-recues]').addEventListener('click', () => {
      etat.recues = !etat.recues;
      demanderRendu();
    });
    racine.querySelector('[data-mes-acces-envoyees]').addEventListener('click', () => {
      if (!etat.statsDisponibles) return;
      etat.envoyees = !etat.envoyees;
      demanderRendu();
    });
    racine.querySelector('[data-mes-acces-effacer]').addEventListener('click', () => {
      etat.parc = '';
      etat.recues = false;
      etat.envoyees = false;
      demanderRendu();
    });
    return racine;
  }

  function periodeEstAvenir() {
    const bouton = document.querySelector(`${selecteurs.onglet}[data-lcdp-planning-periode="avenir"]`);
    return !bouton || bouton.getAttribute('aria-pressed') === 'true';
  }

  function identiteParc(card) {
    const nom = String(card.querySelector(selecteurs.parc)?.textContent || '').trim();
    const departement = String(card.querySelector(selecteurs.departement)?.textContent || '').trim();
    const id = String(card.querySelector('[data-action="adresse"]')?.dataset.idparc || '').trim();
    return {
      cle: id ? `id:${id}` : `nom:${nom}|${departement}`,
      libelle: [nom || 'Parc', departement].filter(Boolean).join(' ')
    };
  }

  function cartes() {
    if (!etat.liste) return [];
    return Array.from(etat.liste.children).filter((element) => element.matches(selecteurs.card));
  }

  function synchroniserParcs(listeCartes) {
    const menu = etat.filtres.querySelector('[data-mes-acces-parc]');
    const options = new Map();
    for (const card of listeCartes) {
      const parc = identiteParc(card);
      if (parc.libelle && !options.has(parc.cle)) options.set(parc.cle, parc.libelle);
    }
    const sorted = [...options.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr', { sensitivity: 'base' }));
    const signature = JSON.stringify(sorted);
    if (menu.dataset.optionsSignature !== signature) {
      const fragment = document.createDocumentFragment();
      fragment.appendChild(new Option('Tous les parcs', ''));
      for (const [value, label] of sorted) fragment.appendChild(new Option(label, value));
      menu.replaceChildren(fragment);
      menu.dataset.optionsSignature = signature;
    }
    if (etat.parc && !options.has(etat.parc)) etat.parc = '';
    menu.value = etat.parc;
  }

  function afficherFiltres() {
    if (!etat.filtres || !etat.liste) return;
    const avenir = periodeEstAvenir();
    etat.filtres.hidden = !avenir;
    const listeCartes = cartes();
    const messageVide = document.querySelector('[data-mes-acces-vide]');
    if (!avenir) {
      for (const card of listeCartes) {
        card.hidden = false;
        card.style.display = '';
      }
      if (messageVide) messageVide.hidden = true;
      return;
    }

    synchroniserParcs(listeCartes);
    let visibles = 0;
    for (const card of listeCartes) {
      const parc = identiteParc(card);
      const recues = card.classList.contains('lcdp-box-card-reservation-membre--invitation');
      const idflux = String(card.dataset.idflux || '').trim();
      const envoyees = etat.statsDisponibles && !recues && (etat.statsParFlux.get(idflux) || 0) > 0;
      const typeChoisi = !etat.recues && !etat.envoyees ||
        (etat.recues && recues) || (etat.envoyees && envoyees);
      const garder = (!etat.parc || parc.cle === etat.parc) && typeChoisi;
      card.hidden = !garder;
      // Les cards partagées ont "display: grid" : hidden seul ne suffit pas.
      card.style.display = garder ? '' : 'none';
      if (garder) visibles += 1;
    }

    const boutonRecues = etat.filtres.querySelector('[data-mes-acces-recues]');
    const boutonEnvoyees = etat.filtres.querySelector('[data-mes-acces-envoyees]');
    const effacer = etat.filtres.querySelector('[data-mes-acces-effacer]');
    const info = etat.filtres.querySelector('[data-mes-acces-info]');
    const avertissement = etat.filtres.querySelector('[data-mes-acces-avertissement]');
    const filtreActif = Boolean(etat.parc || etat.recues || etat.envoyees);
    boutonRecues.setAttribute('aria-pressed', String(etat.recues));
    boutonEnvoyees.setAttribute('aria-pressed', String(etat.envoyees));
    boutonRecues.classList.toggle('lcdp-button-primary', etat.recues);
    boutonRecues.classList.toggle('lcdp-button-secondary', !etat.recues);
    boutonEnvoyees.classList.toggle('lcdp-button-primary', etat.envoyees);
    boutonEnvoyees.classList.toggle('lcdp-button-secondary', !etat.envoyees);
    boutonEnvoyees.disabled = !etat.statsDisponibles;
    effacer.disabled = !filtreActif;
    info.textContent = `${visibles} accès affiché${visibles > 1 ? 's' : ''}${filtreActif ? ' avec les filtres sélectionnés' : ' à venir'}.`;
    avertissement.textContent = etat.statsErreur ? 'Le filtre « Invitations envoyées » est momentanément indisponible.' : '';

    if (messageVide) {
      messageVide.hidden = !(filtreActif && listeCartes.length > 0 && visibles === 0);
    }
  }

  function demanderRendu() {
    if (etat.raf !== null) return;
    etat.raf = window.requestAnimationFrame(() => {
      etat.raf = null;
      afficherFiltres();
    });
  }

  function verrouillerVueListe(parent) {
    // Les commandes et classes existantes sont conservées, sans CSS supplémentaire.
    const affichage = parent.querySelector('[data-lcdp-planning-affichage]');
    if (affichage) {
      affichage.hidden = true;
      affichage.style.display = 'none';
      const groupe = affichage.closest('[data-lcdp-commande-bar-actions]');
      if (groupe) groupe.style.gridTemplateColumns = 'minmax(0,1fr)';
    }
    const calendrier = parent.querySelector('[data-lcdp-box-calendrier-mois]');
    if (calendrier) {
      calendrier.hidden = true;
      calendrier.style.display = 'none';
    }
  }

  function installer() {
    const parent = document.querySelector(selecteurs.racine);
    if (!parent) return false;
    const liste = parent.querySelector(selecteurs.liste);
    const commandes = parent.querySelector(selecteurs.commandes);
    if (!liste || !commandes) return false;
    verrouillerVueListe(parent);

    if (!etat.filtres) {
      etat.filtres = creerFiltres();
      commandes.appendChild(etat.filtres);
    }
    if (etat.liste !== liste) {
      etat.liste = liste;
      if (etat.observateurListe) etat.observateurListe.disconnect();
      etat.observateurListe = new MutationObserver((mutations) => {
        verrouillerVueListe(parent);
        const estNouvelleListe = mutations.some((m) => m.target === liste && m.type === 'childList');
        const invitationModifiee = mutations.some((m) =>
          m.type === 'childList' && m.target.nodeType === 1 &&
          (m.target.matches?.('[data-action="invitation"]') ||
           m.target.closest?.('[data-action="invitation"]'))
        );
        if (estNouvelleListe) demanderRendu();
        if (invitationModifiee) void actualiserStatsInvitations();
      });
      etat.observateurListe.observe(liste, { childList: true, subtree: true });
    }
    if (!parent.querySelector('[data-mes-acces-vide]')) {
      const vide = document.createElement('p');
      vide.className = 'lcdp-mes-acces-vide';
      vide.dataset.mesAccesVide = '';
      vide.textContent = 'Aucun accès ne correspond aux filtres sélectionnés.';
      vide.hidden = true;
      liste.insertAdjacentElement('afterend', vide);
    }
    demanderRendu();
    return true;
  }

  function demarrer() {
    const racine = document.querySelector(selecteurs.racine);
    if (!racine) return;
    if (!installer()) {
      etat.observationInstallation = new MutationObserver(() => {
        if (installer()) {
          etat.observationInstallation.disconnect();
          etat.observationInstallation = null;
        }
      });
      etat.observationInstallation.observe(racine, { childList: true, subtree: true });
    }
    // Les périodes restent pilotées par le composant existant.
    document.addEventListener('click', (event) => {
      if (event.target.closest(selecteurs.onglet)) demanderRendu();
    });
    void actualiserStatsInvitations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer, { once: true });
  } else {
    demarrer();
  }
})();
