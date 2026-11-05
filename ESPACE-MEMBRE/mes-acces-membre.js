/* MES ACCÈS — vue liste/diaporama sur la structure membre déjà validée.
   Les données, droits, annulations et notifications restent du ressort des Workers.
   Aucun calendrier, aucune carte et aucun nouveau composant CSS. */
(() => {
  'use strict';

  const config = window.SITE_CONFIG || {};
  const root = document.getElementById('lcdp-mes-acces-conteneur');
  if (!root) return;

  const ui = {
    liste: document.getElementById('lcdp-mes-acces-liste'),
    message: document.getElementById('lcdp-mes-acces-message'),
    resultat: document.getElementById('lcdp-mes-acces-resultat'),
    filtres: document.getElementById('lcdp-mes-acces-filtres'),
    date: document.getElementById('lcdp-mes-acces-date'),
    parc: document.getElementById('lcdp-mes-acces-parc'),
    departement: document.getElementById('lcdp-mes-acces-departement'),
    recues: document.getElementById('lcdp-mes-acces-recues'),
    envoyees: document.getElementById('lcdp-mes-acces-envoyees'),
    effacer: document.getElementById('lcdp-mes-acces-effacer'),
    onglets: Array.from(root.querySelectorAll('[data-lcdp-periode]'))
  };
  if (!ui.liste || !ui.message || !ui.filtres || ui.onglets.length !== 2) return;

  const etat = {
    periode: 'avenir',
    reservations: [],
    filtre: { date: '', parc: '', departement: '', recues: false, envoyees: false },
    donneesInvitations: new Map(),
    disponibiliteStats: false,
    erreurStats: false,
    cardModele: null,
    annulationEnCours: false
  };

  function endpoint(cle, ancienne, service) {
    const value = config[cle] || config[ancienne] ||
      (typeof config.apiUrl === 'function' ? config.apiUrl(service) : '');
    return String(value || '').replace(/\/+$/, '');
  }
  const planningApi = endpoint('workerPlanningMembreUrl', 'WORKER_PLANNING_MEMBRE_URL', 'planning-membre-api');
  const invitationsApi = endpoint('workerInviterMembreUrl', 'WORKER_INVITER_MEMBRE_URL', 'inviter-membre-api');

  function dateValide(r) {
    const timestamp = Date.parse(String(r?.datebookd || ''));
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  function dateIsoParis(value) {
    const timestamp = typeof value === 'number' ? value : dateValide(value);
    if (timestamp === null || !Number.isFinite(timestamp)) return '';
    const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
    const valeurs = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return [valeurs.year, valeurs.month, valeurs.day].join('-');
  }
  function formatDate(value) {
    const timestamp = dateValide(value);
    if (timestamp === null) return 'Date indisponible';
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(timestamp));
  }
  function formatHeure(value) {
    const timestamp = dateValide(value);
    if (timestamp === null) return '';
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)).replace(':', ' h ');
  }
  function vrai(value) {
    return value === true || value === 1 || value === 'true' || value === '1';
  }
  function nomParc(r) {
    const p = r.parc || {};
    return String(p.nom || p.nomparc || r.nomparc || 'Parc').trim();
  }
  function departement(r) {
    const p = r.parc || {};
    return String(p.dptmt || p.departement || r.dptmt || '').trim();
  }
  function idParc(r) {
    return String(r.parc?.idparc || r.idparc || nomParc(r) + '|' + departement(r));
  }
  function statutAnnule(r) {
    return String(r?.statut || '').toLowerCase() === 'cancd';
  }
  function estPasse(r) {
    const d = dateValide(r);
    return statutAnnule(r) || (d !== null && d <= Date.now());
  }
  function estRecue(r) {
    return vrai(r?.invitation);
  }
  function statsActifs(r) {
    const stat = etat.donneesInvitations.get(String(r?.idflux || '')) ||
      r.invitationStats || r.invitationsStats || {};
    const n = Number(stat.in ?? stat.actifs ?? stat.invites ?? 0);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  function estEnvoyee(r) {
    return !estRecue(r) && statsActifs(r) > 0;
  }
  function nomDossier(nom) {
    return String(nom || '').trim().replace(/[ -]/g, '_');
  }
  function codeDepartement(raw) {
    const s = String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const corse = s.match(/\b2[AB]\b/);
    if (corse) return corse[0];
    const d = s.match(/\d{1,3}/);
    return d ? d[0].padStart(2, '0') : '';
  }
  function photoParc(r) {
    const n = nomDossier(nomParc(r));
    const d = codeDepartement(departement(r));
    if (!n || !d) return '';
    return window.LCDP_urlObjet('/IMAG/PARC/' + d + '/' + encodeURIComponent(n) + '/card1.webp');
  }
  function textEl(tag, classe, texte) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    el.textContent = String(texte ?? '');
    return el;
  }
  function msg(value, erreur = false) {
    ui.message.hidden = false;
    ui.message.textContent = value;
    ui.message.dataset.lcdpMessageType = erreur ? 'erreur' : 'information';
  }
  function masqueMsg() {
    ui.message.hidden = true;
    ui.message.textContent = '';
  }
  async function getJson(url, options = {}) {
    if (!url) throw new Error('Service non configuré.');
    const r = await fetch(url, {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {Accept: 'application/json', ...(options.body ? {'Content-Type': 'application/json'} : {})},
      ...(options.body ? {body: JSON.stringify(options.body)} : {})
    });
    if (r.status === 401) {
      const cible = typeof window.LCDP_urlPublic === 'function'
        ? window.LCDP_urlPublic('/ESPACE-PUBLIC/connexion-membre.html?source=planning-membre')
        : '../ESPACE-PUBLIC/connexion-membre.html?source=planning-membre';
      window.location.assign(cible);
      throw new Error('Session expirée. Reconnectez-vous.');
    }
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || (data.ok !== true && data.success !== true)) {
      throw new Error(String(data?.message || data?.error || 'Opération indisponible.'));
    }
    return data;
  }

  function periodeReservations() {
    return etat.reservations.filter(r => etat.periode === 'avenir' ? !estPasse(r) : estPasse(r))
      .sort((a, b) => etat.periode === 'avenir'
        ? dateValide(a) - dateValide(b)
        : dateValide(b) - dateValide(a));
  }
  function toutesFutures() {
    return etat.reservations.filter(r => !estPasse(r));
  }
  function optionsSelect(el, entries, firstLabel, selection) {
    const frag = document.createDocumentFragment();
    frag.appendChild(new Option(firstLabel, ''));
    for (const [value, label] of entries) frag.appendChild(new Option(label, value));
    el.replaceChildren(frag);
    el.value = entries.some(e => e[0] === selection) ? selection : '';
    return el.value;
  }
  function synchroniserFiltres() {
    const futures = toutesFutures();
    const parcs = new Map();
    const dpts = new Map();
    for (const r of futures) {
      const id = idParc(r);
      const dep = departement(r);
      if (!parcs.has(id)) parcs.set(id, [nomParc(r), dep].filter(Boolean).join(' — '));
      if (dep && !dpts.has(dep)) dpts.set(dep, dep);
    }
    etat.filtre.parc = optionsSelect(ui.parc,
      Array.from(parcs).sort((a,b) => a[1].localeCompare(b[1], 'fr')),
      'Tous les parcs', etat.filtre.parc);
    etat.filtre.departement = optionsSelect(ui.departement,
      Array.from(dpts).sort((a,b) => a[0].localeCompare(b[0], 'fr')),
      'Tous les départements', etat.filtre.departement);
  }
  function actifsFiltres() {
    return Boolean(etat.filtre.date || etat.filtre.parc || etat.filtre.departement || etat.filtre.recues || etat.filtre.envoyees);
  }
  function passeFiltres(r) {
    const f = etat.filtre;
    if (f.date && dateIsoParis(r) !== f.date) return false;
    if (f.parc && idParc(r) !== f.parc) return false;
    if (f.departement && departement(r) !== f.departement) return false;
    if ((f.recues || f.envoyees) && !((f.recues && estRecue(r)) || (f.envoyees && estEnvoyee(r)))) return false;
    return true;
  }
  function majOngletsEtFiltres() {
    for (const b of ui.onglets) {
      const actif = b.dataset.lcdpPeriode === etat.periode;
      b.setAttribute('aria-selected', String(actif));
      b.setAttribute('aria-pressed', String(actif));
      b.classList.toggle('lcdp-button-primary', actif);
      b.classList.toggle('lcdp-button-secondary', !actif);
    }
    const avenir = etat.periode === 'avenir';
    ui.filtres.setAttribute('aria-disabled', String(!avenir));
    ui.filtres.querySelectorAll('input, select, button').forEach(el => {
      if (el === ui.envoyees) el.disabled = !avenir || !etat.disponibiliteStats;
      else if (el === ui.effacer) el.disabled = !avenir || !actifsFiltres();
      else el.disabled = !avenir;
    });
    ui.recues.setAttribute('aria-pressed', String(etat.filtre.recues));
    ui.envoyees.setAttribute('aria-pressed', String(etat.filtre.envoyees));
    ui.recues.classList.toggle('lcdp-button-primary', etat.filtre.recues);
    ui.recues.classList.toggle('lcdp-button-secondary', !etat.filtre.recues);
    ui.envoyees.classList.toggle('lcdp-button-primary', etat.filtre.envoyees);
    ui.envoyees.classList.toggle('lcdp-button-secondary', !etat.filtre.envoyees);
  }

  function imageErreur(img) {
    img.hidden = true;
    // Le nom du parc est toujours affiché, même si le fichier photo est absent.
    img.alt = '';
  }

  // Les mêmes balises que BOX/04-box-card-parc-diaporama.html et son CSS.
  function creerCarte(r) {
    const article = etat.cardModele.cloneNode(true);
    const recto = article.querySelector('[data-lcdp-diaporama-retourner]');
    const fermer = article.querySelector('[data-lcdp-diaporama-fermer]');
    const img = article.querySelector('[data-lcdp-diaporama-image]');
    const nom = article.querySelector('[data-lcdp-diaporama-nom]');
    const titre = article.querySelector('[data-lcdp-diaporama-nom-dos]');
    const actions = article.querySelector('[data-lcdp-diaporama-actions]');
    const description = article.querySelector('[data-lcdp-diaporama-description]');
    const verso = article.querySelector('[data-lcdp-diaporama-dos]');
    article.dataset.idflux = String(r.idflux || '');
    const lieu = 'Parc de ' + nomParc(r);
    const dat = formatDate(r);
    const h = formatHeure(r);
    const dept = departement(r);
    const labelType = statutAnnule(r) ? 'Accès annulé' : estRecue(r) ? 'Invitation reçue' : estEnvoyee(r) ? 'Avec invités' : 'Réservation';

    img.src = photoParc(r);
    img.alt = lieu;
    img.addEventListener('error', () => imageErreur(img), {once: true});
    nom.replaceChildren(textEl('span', '', lieu), textEl('span', '', ' — ' + dat + (h ? ' à ' + h : '')));
    titre.textContent = lieu;
    recto.setAttribute('aria-label', 'Détails de votre accès au ' + lieu + ', le ' + dat);
    description.textContent = [dat + (h ? ' à ' + h : ''), dept ? 'Département ' + dept : '', labelType]
      .filter(Boolean).join(' · ');

    if (r.parc?.adresse1 || r.parc?.entreeparc) {
      const infos = [r.parc?.adresse1, r.parc?.adresse2, r.parc?.adresse3, r.parc?.entreeparc]
        .map(v => String(v || '').trim()).filter(Boolean).join(' — ');
      if (infos) verso.appendChild(textEl('p', 'lcdp-box-card-parc-diaporama__description', infos));
    }
    const ajouterBouton = (libelle, action, style='lcdp-button-secondary') => {
      const b = textEl('button', 'lcdp-button ' + style, libelle);
      b.type = 'button';
      b.addEventListener('click', action);
      actions.appendChild(b);
    };

    // Invitations déjà enregistrées : consultation via le Worker existant.
    if (estRecue(r)) {
      ajouterBouton('Invitation reçue', () => montrerParrain(r));
    } else if (estEnvoyee(r)) {
      ajouterBouton('Voir les invités', () => montrerInvites(r));
    }
    if (etat.periode === 'avenir' && !statutAnnule(r)) {
      const delaiDepasse = dateValide(r) !== null && Date.now() >= dateValide(r) - 30 * 60 * 1000;
      const annuler = textEl('button', 'lcdp-button lcdp-button-orange', estRecue(r) ? 'Annuler mon invitation' : 'Annuler cet accès');
      annuler.type = 'button';
      annuler.disabled = delaiDepasse;
      if (delaiDepasse) annuler.title = 'Délai d’annulation dépassé';
      annuler.addEventListener('click', () => void demanderAnnulation(r));
      actions.appendChild(annuler);
    }
    function retourner(ouvert) {
      article.classList.toggle('is-retourne', ouvert);
      recto.setAttribute('aria-expanded', String(ouvert));
      verso.setAttribute('aria-hidden', String(!ouvert));
      fermer.tabIndex = ouvert ? 0 : -1;
      actions.querySelectorAll('button').forEach(b => { b.tabIndex = ouvert ? 0 : -1; });
      if (ouvert) fermer.focus({preventScroll: true});
      else recto.focus({preventScroll: true});
    }
    recto.addEventListener('click', () => retourner(true));
    fermer.addEventListener('click', () => retourner(false));
    retournerSansFocus();
    function retournerSansFocus() {
      article.classList.remove('is-retourne');
      recto.setAttribute('aria-expanded', 'false');
      verso.setAttribute('aria-hidden', 'true');
      fermer.tabIndex = -1;
      actions.querySelectorAll('button').forEach(b => {b.tabIndex = -1;});
    }
    return article;
  }

  function afficher() {
    majOngletsEtFiltres();
    const periode = periodeReservations();
    const visibles = etat.periode === 'avenir' ? periode.filter(passeFiltres) : periode;
    const fragment = document.createDocumentFragment();
    visibles.forEach(r => fragment.appendChild(creerCarte(r)));
    ui.liste.replaceChildren(fragment);
    ui.resultat.textContent = visibles.length + ' accès affiché' + (visibles.length > 1 ? 's' : '');
    if (etat.erreurStats && etat.periode === 'avenir') {
      ui.resultat.textContent += ' · Le filtre « Invitations envoyées » est indisponible.';
    }
    if (!visibles.length) {
      msg(periode.length > 0 && etat.periode === 'avenir' && actifsFiltres()
        ? 'Aucun accès ne correspond aux filtres sélectionnés.'
        : etat.periode === 'avenir' ? 'Vous n’avez aucun accès à venir.' : 'Vous n’avez aucun accès passé.');
    } else masqueMsg();
  }

  function montrerParrain(r) {
    const parrain = r.parrainInvitation || r.parrain || {};
    const alias = String(parrain.affichage || parrain.alias || parrain.aliasmembre || '').trim();
    const prenom = String(parrain.prenommembre || parrain.prenom || '').trim();
    const nom = String(parrain.nommembre || parrain.nom || '').trim();
    const identite = alias || [prenom, nom ? nom[0].toUpperCase() + '.' : ''].filter(Boolean).join(' ');
    window.alert('Invitation par : ' + (identite || 'Information indisponible'));
  }
  async function montrerInvites(r) {
    if (!invitationsApi) return window.alert('Le service des invitations est indisponible.');
    try {
      const data = await getJson(invitationsApi + '/invites?idflux=' + encodeURIComponent(String(r.idflux)));
      const invites = Array.isArray(data.invites) ? data.invites : [];
      if (!invites.length) return window.alert('Aucun invité enregistré pour cet accès.');
      const lignes = invites.map(i => {
        const label = [i.prenom || i.prenommembre, i.nom || i.nommembre].filter(Boolean).join(' ');
        return label || i.email || i.emailinvite || 'Invité';
      });
      window.alert('Invités :\n' + lignes.join('\n'));
    } catch (e) { window.alert(e.message || 'Impossible de consulter les invités.'); }
  }
  async function demanderAnnulation(r) {
    if (etat.annulationEnCours || etat.periode !== 'avenir') return;
    if (!r.idflux) return window.alert('Identifiant de réservation manquant.');
    const question = estRecue(r)
      ? 'Annuler cette invitation reçue ? L’invitant sera informé selon les règles du service.'
      : 'Annuler cet accès ? Les invitations associées seront traitées par le service de réservation.';
    if (!window.confirm(question)) return;
    etat.annulationEnCours = true;
    try {
      await getJson(planningApi + '/annuler-reservation', {method:'POST', body: {idflux: r.idflux}});
      await recharger();
      window.alert('Annulation enregistrée.');
    } catch (e) {
      window.alert(e.message || 'Annulation impossible.');
    } finally { etat.annulationEnCours = false; }
  }

  async function chargerModeleCarte() {
    const url = window.LCDP_urlObjet('/BOX/04-box-card-parc-diaporama.html');
    try {
      const r = await fetch(url, {credentials:'omit', cache:'no-cache'});
      if (!r.ok) throw new Error('Composant indisponible.');
      const t = document.createElement('template');
      t.innerHTML = (await r.text()).trim();
      const a = t.content.querySelector('[data-lcdp-card-parc-diaporama]');
      if (!a) throw new Error('Composant diaporama incomplet.');
      return a;
    } catch (e) {
      // Même structure que le composant partagé, sans créer un autre modèle visuel.
      const t = document.createElement('template');
      t.innerHTML = `<article class="lcdp-box-card-parc-diaporama" data-lcdp-card-parc-diaporama>
        <div class="lcdp-box-card-parc-diaporama__scene"><div class="lcdp-box-card-parc-diaporama__faces">
        <div class="lcdp-box-card-parc-diaporama__face lcdp-box-card-parc-diaporama__face--recto">
        <button type="button" class="lcdp-box-card-parc-diaporama__ouvrir" data-lcdp-diaporama-retourner aria-expanded="false">
        <img class="lcdp-box-card-parc-diaporama__image" data-lcdp-diaporama-image alt="" loading="lazy">
        <span class="lcdp-box-card-parc-diaporama__nom" data-lcdp-diaporama-nom></span></button></div>
        <div class="lcdp-box-card-parc-diaporama__face lcdp-box-card-parc-diaporama__face--verso" data-lcdp-diaporama-dos aria-hidden="true">
        <button type="button" class="lcdp-box-card-parc-diaporama__fermer" data-lcdp-diaporama-fermer>×</button>
        <h3 class="lcdp-box-card-parc-diaporama__nom-dos" data-lcdp-diaporama-nom-dos></h3>
        <div class="lcdp-box-card-parc-diaporama__actions" data-lcdp-diaporama-actions></div>
        <p class="lcdp-box-card-parc-diaporama__description" data-lcdp-diaporama-description></p>
        </div></div></div></article>`;
      return t.content.firstElementChild;
    }
  }
  async function recharger() {
    if (!planningApi) {
      msg('Le service des accès n’est pas configuré.', true);
      return;
    }
    msg('Chargement de vos accès…');
    ui.liste.replaceChildren();
    try {
      const data = await getJson(planningApi + '/mes-reservations');
      if (!Array.isArray(data.reservations)) throw new Error('Liste des accès indisponible.');
      etat.reservations = data.reservations.filter(r => dateValide(r) !== null);
      synchroniserFiltres();
      afficher();
    } catch (e) {
      ui.resultat.textContent = '';
      msg(e.message || 'Impossible de charger vos accès.', true);
    }
  }
  async function chargerStatutsInvitations() {
    if (!invitationsApi) {
      etat.disponibiliteStats = false;
      etat.erreurStats = true;
      afficher();
      return;
    }
    try {
      const data = await getJson(invitationsApi + '/reservations-invitables');
      if (!Array.isArray(data.reservations)) throw new Error('Statuts des invitations indisponibles.');
      etat.donneesInvitations = new Map();
      for (const r of data.reservations) {
        if (r.idflux) etat.donneesInvitations.set(String(r.idflux), r.invitationStats || r.invitationsStats || {});
      }
      etat.disponibiliteStats = true;
      etat.erreurStats = false;
    } catch (e) {
      console.warn('[MES ACCÈS] Statuts des invitations indisponibles :', e);
      etat.erreurStats = true;
      etat.disponibiliteStats = false;
      etat.filtre.envoyees = false;
    }
    afficher();
  }

  function brancher() {
    ui.onglets.forEach(button => button.addEventListener('click', () => {
      etat.periode = button.dataset.lcdpPeriode === 'passe' ? 'passe' : 'avenir';
      afficher();
    }));
    ui.date.addEventListener('change', () => { etat.filtre.date = ui.date.value; afficher(); });
    ui.parc.addEventListener('change', () => { etat.filtre.parc = ui.parc.value; afficher(); });
    ui.departement.addEventListener('change', () => { etat.filtre.departement = ui.departement.value; afficher(); });
    ui.recues.addEventListener('click', () => { etat.filtre.recues = !etat.filtre.recues; afficher(); });
    ui.envoyees.addEventListener('click', () => {
      if (!etat.disponibiliteStats) return;
      etat.filtre.envoyees = !etat.filtre.envoyees;
      afficher();
    });
    ui.effacer.addEventListener('click', () => {
      etat.filtre = { date:'', parc:'', departement:'', recues:false, envoyees:false };
      ui.date.value = '';
      ui.parc.value = '';
      ui.departement.value = '';
      afficher();
    });
  }

  async function initialiser() {
    brancher();
    etat.cardModele = await chargerModeleCarte();
    majOngletsEtFiltres();
    await recharger();
    // Une erreur de ce second appel n’empêche pas l’affichage des accès.
    await chargerStatutsInvitations();
  }
  initialiser().catch(e => { console.error('[MES ACCÈS]', e); msg('Impossible d’initialiser la liste des accès.', true); });
})();
