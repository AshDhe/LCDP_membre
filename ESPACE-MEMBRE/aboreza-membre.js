/* Aboresa — K1, K2, K3. Composants visuels exclusivement chargés depuis OBJET/BOX.
 * Le calendrier de réservation et les droits restent ceux de PLANIFIER/Rezabo.
 */
(() => {
  'use strict';
  const cfg = window.SITE_CONFIG || {};
  const ENDPOINT = String(cfg.workerAboRezaUrl || cfg.WORKER_ABOREZA_URL ||
    (typeof cfg.apiUrl === 'function' ? cfg.apiUrl('aboreza-api') : 'https://aboreza-api.lacleduparc.fr')).replace(/\/+$/, '');
  const bridge = () => window.LCDP_PLANIFIER_ABOREZA;
  let composants = null;
  let courant = null;
  let occupe = false;
  let bandeau = null;
  let attenteFormules = null;
  let conteneurAboreza = null;
  let repriseApresPause = false;
  let contextePanierSuspendu = null;
  let filtresInitialisesPanier = false;
  const SORTIE_FORMULAIRE_ABOREZA = Symbol('sortie-formulaire-aboreza');
  const SORTIE_REPRENDRE_PLUS_TARD = Symbol('sortie-pause-aboreza');

  // Coque persistante commune à toutes les étapes d'ABO-RÉZA.
  // Elle reprend la structure du composant générique 04-box-workflow-abonnement.
  // Aucun écran intermédiaire ne recrée le fond de la fenêtre.
  function obtenirConteneurAboreza() {
    if (conteneurAboreza?.workflow?.isConnected) return conteneurAboreza;
    const workflow = composants?.workflow?.cloneNode(true) || elem('div', 'lcdp-box-workflow-abonnement');
    let carte = workflow.querySelector('[data-lcdp-workflow-abonnement-card]');
    let contenu = workflow.querySelector('[data-lcdp-workflow-abonnement-content]');
    if (!carte || !contenu) {
      // Même structure et mêmes classes que le fragment générique, y compris
      // pendant le tout premier chargement du fragment lui-même.
      workflow.replaceChildren();
      carte = elem('section', 'lcdp-box-workflow-abonnement__card');
      contenu = elem('div', 'lcdp-box-workflow-abonnement__content');
      carte.dataset.lcdpWorkflowAbonnementCard = '';
      contenu.dataset.lcdpWorkflowAbonnementContent = '';
      carte.append(contenu);
      workflow.append(carte);
    }
    workflow.id = 'lcdp-aboreza-workflow-continue';
    workflow.classList.add('lcdp-box-workflow-abonnement--aboreza-continu');
    workflow.setAttribute('role', 'dialog');
    workflow.setAttribute('aria-modal', 'true');
    workflow.setAttribute('aria-label', 'Abonnement La Clé du Parc');
    workflow.tabIndex = -1;
    const focusAvant = document.activeElement;
    document.body.append(workflow);
    conteneurAboreza = { workflow, carte, contenu, focusAvant };
    return conteneurAboreza;
  }

  function fermerConteneurAboreza() {
    masquerAttenteFormules();
    const etape = conteneurAboreza;
    if (!etape) return;
    etape.workflow.remove();
    conteneurAboreza = null;
    if (etape.focusAvant?.isConnected && typeof etape.focusAvant.focus === 'function') {
      etape.focusAvant.focus({ preventScroll: true });
    }
  }

  // Spinner HTML commun à PLANIFIER : aucun fichier GIF/SVG d'attente externe.
  function creerSpinnerAboReza() {
    const roue = elem('div', 'lcdp-loading-spinner');
    roue.setAttribute('aria-hidden', 'true');
    roue.innerHTML = `
      <svg class="lcdp-loading-spinner__track" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"></circle></svg>
      <svg class="lcdp-loading-spinner__arc" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="75"></circle></svg>
      <span class="lcdp-loading-spinner__dot"></span>`;
    return roue;
  }
  function afficherAttenteFormules(libelle = 'Chargement des formules d’abonnement') {
    const { workflow, carte } = obtenirConteneurAboreza();
    workflow.setAttribute('aria-busy', 'true');
    if (attenteFormules?.isConnected) {
      attenteFormules.setAttribute('aria-label', libelle);
      return;
    }
    const masque = elem('div', 'lcdp-box-workflow-abonnement__attente');
    masque.setAttribute('role', 'status');
    masque.setAttribute('aria-live', 'polite');
    masque.setAttribute('aria-label', libelle);
    masque.append(creerSpinnerAboReza());
    carte.append(masque);
    attenteFormules = masque;
  }

  function masquerAttenteFormules() {
    attenteFormules?.remove();
    attenteFormules = null;
    conteneurAboreza?.workflow?.removeAttribute('aria-busy');
  }

  function adopterBonCommandeDansConteneur(workflowPret) {
    const source = workflowPret?.querySelector('[data-lcdp-workflow-abonnement-content]');
    if (!source) return null;
    const { workflow, contenu, carte } = obtenirConteneurAboreza();
    workflow.classList.remove('lcdp-box-workflow-abonnement--calendrier-an', 'lcdp-box-workflow-abonnement--confirmation');
    workflow.classList.add('lcdp-box-workflow-abonnement--recapitulatif');
    workflow.removeAttribute('aria-label');
    workflow.setAttribute('aria-labelledby', 'lcdp-paiement-recap-titre');
    contenu.replaceChildren(...Array.from(source.children));
    carte.scrollTop = 0;
    masquerAttenteFormules();
    return workflow;
  }
  const moisLibelle = cle => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(cle + '-01T12:00:00Z'));
  const dateLibelle = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00Z'));
  const nomFormule = f => ({ '1J': '1 jour', '1M': '1 mois', '3M': '3 mois', '5M': '5 mois', '10M': '10 mois', '11M': '11 mois', '12M': '1 an' }[f] || f);
  const codeFormule = f => ({ '12M': '1A' }[f] || f || '—');
  const heuresPlage = { plage1: '6 h–10 h', plage2: '10 h–13 h', plage3: '13 h–17 h', plage4: '17 h–21 h', plage5: '21 h–2 h' };
  const dureePanierMinutes = 15;

  async function api(path, method = 'GET', body) {
    const res = await fetch(ENDPOINT + path, {
      method, credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const result = await res.json().catch(() => null);
    if (!res.ok || result?.ok !== true) throw new Error(result?.message || 'Le service ABO-RÉZA est indisponible.');
    return result;
  }
  function cheminObjet(chemin) {
    if (typeof window.LCDP_urlObjet === 'function') return window.LCDP_urlObjet(chemin);
    if (typeof cfg.objetUrl === 'function') return cfg.objetUrl(chemin);
    const base = String(cfg.objetBaseUrl || cfg.OBJET_BASE || '').replace(/\/+$/, '');
    if (!base) throw new Error('Adresse des composants OBJET non configurée.');
    return base + '/' + chemin.replace(/^\/+/, '');
  }
  async function lireObjet(chemin, selecteur) {
    const reponse = await fetch(cheminObjet(chemin), { cache: 'no-store' });
    if (!reponse.ok) throw new Error('Composant indisponible : ' + chemin);
    const documentObjet = new DOMParser().parseFromString(await reponse.text(), 'text/html');
    const racine = documentObjet.querySelector(selecteur);
    if (!racine) throw new Error('Structure du composant absente : ' + chemin);
    return racine;
  }
  async function chargerTemplates() {
    if (!composants) {
      composants = Promise.all([
        lireObjet('/BOX/04-box-workflow-abonnement.html', '[data-lcdp-box-workflow-abonnement]'),
        lireObjet('/BOX/02-box-dialogue-bouton.html', '[data-lcdp-box-dialogue-bouton]'),
        lireObjet('/BOX/04-box-calendrier-an.html', '[data-lcdp-box-calendrier-an]'),
        lireObjet('/BOX/03-box-champ-formulaire.html', '[data-lcdp-box-champ-formulaire]'),
        lireObjet('/BOX/04-box-card-abonnement.html', '[data-lcdp-box-card-abonnement]')
      ]).then(([workflow, dialogue, calendrier, champ, carte]) => {
        composants = { workflow, dialogue, calendrier, champ, carte };
        return composants;
      }).catch(erreur => { composants = null; throw erreur; });
    }
    return composants;
  }
  function elem(tag, classe, texte) {
    const x = document.createElement(tag);
    if (classe) x.className = classe;
    if (texte !== undefined) x.textContent = texte;
    return x;
  }
  function bouton(libelle, primaire = false) {
    const b = elem('button', 'lcdp-button ' + (primaire ? 'lcdp-button-primary' : 'lcdp-button-secondary'), libelle);
    b.type = 'button';
    return b;
  }
  function ligneActions(choix, finir, hote) {
    for (const c of choix) {
      const b = bouton(c.texte, Boolean(c.primaire));
      b.addEventListener('click', () => finir(c.valeur));
      hote.append(b);
    }
  }
  function monterWorkflow(modele, type, titre) {
    const { workflow, contenu, carte } = obtenirConteneurAboreza();
    workflow.classList.remove('lcdp-box-workflow-abonnement--calendrier-an', 'lcdp-box-workflow-abonnement--confirmation', 'lcdp-box-workflow-abonnement--recapitulatif');
    workflow.classList.add('lcdp-box-workflow-abonnement--' + type);
    workflow.removeAttribute('aria-labelledby');
    workflow.setAttribute('aria-label', titre);
    const objet = modele.cloneNode(true);
    // Un seul rôle modal, celui de la coque ; les écrans utilisent les BOX génériques.
    objet.removeAttribute('role');
    objet.removeAttribute('aria-modal');
    objet.classList.add('lcdp-workflow-abonnement-box');
    contenu.replaceChildren(objet);
    carte.scrollTop = 0;
    masquerAttenteFormules();
    return { workflow, objet };
  }
  // La croix n'est jamais une fermeture immédiate : la confirmation est
  // superposée DANS le conteneur et n'efface pas les valeurs du formulaire.
  function presenterConfirmationQuitter(carte, confirmer, annuler, options = {}) {
    const calque = elem('div', 'lcdp-aboreza-confirmation-sortie');
    const dialogue = composants.dialogue.cloneNode(true);
    dialogue.removeAttribute('role');
    dialogue.removeAttribute('aria-modal');
    dialogue.classList.add('lcdp-workflow-abonnement-box', 'lcdp-aboreza-dialogue-confirmation');
    const titre = dialogue.querySelector('[data-lcdp-dialogue-title]');
    const texte = dialogue.querySelector('[data-lcdp-dialogue-text]');
    const actions = dialogue.querySelector('[data-lcdp-dialogue-actions]');
    const croix = dialogue.querySelector('[data-lcdp-dialogue-close]');
    if (![titre, texte, actions, croix].every(Boolean)) throw new Error('Confirmation de sortie incomplète.');
    titre.textContent = options.titre || 'Quitter le formulaire d’abonnement ?';
    texte.hidden = true;
    actions.replaceChildren();
    const quitter = bouton(options.bouton || 'Quitter', true);
    quitter.addEventListener('click', confirmer);
    actions.append(quitter);
    croix.setAttribute('aria-label', 'Revenir au formulaire');
    croix.addEventListener('click', annuler);
    calque.append(dialogue);
    carte.append(calque);
    quitter.focus({ preventScroll: true });
    return calque;
  }

  function modalComposant(type, titre, installer, options = {}) {
    return new Promise((resolve, reject) => {
      const modele = type === 'calendrier' ? composants.calendrier : composants.dialogue;
      const { workflow, objet } = monterWorkflow(modele, type === 'calendrier' ? 'calendrier-an' : 'confirmation', titre);
      const titreElement = objet.querySelector(type === 'calendrier' ? '[data-lcdp-calendrier-an-title]' : '[data-lcdp-dialogue-title]');
      const fermeture = objet.querySelector(type === 'calendrier' ? '[data-lcdp-calendrier-an-close]' : '[data-lcdp-dialogue-close]');
      if (!titreElement || !fermeture) throw Error('Structure du dialogue générique incomplète.');
      titreElement.textContent = titre;
      if (type === 'dialogue') objet.classList.add('lcdp-workflow-abonnement-box--confirmation');
      let clos = false;
      let confirmationSortie = null;
      const nettoyer = () => {
        workflow.removeEventListener('keydown', esc);
        confirmationSortie?.remove();
        objet.inert = false;
        confirmationSortie = null;
      };
      const finir = valeur => {
        if (clos || confirmationSortie) return;
        clos = true;
        nettoyer();
        afficherAttenteFormules('Préparation de l’étape suivante…');
        resolve(valeur);
      };
      const sortir = () => {
        if (clos) return;
        clos = true;
        nettoyer();
        reject(options.sortie === 'pause' ? SORTIE_REPRENDRE_PLUS_TARD : SORTIE_FORMULAIRE_ABOREZA);
      };
      const annulerSortie = () => {
        confirmationSortie?.remove();
        confirmationSortie = null;
        objet.inert = false;
        fermeture.focus({ preventScroll: true });
      };
      const demanderSortie = () => {
        if (clos || confirmationSortie) return;
        objet.inert = true;
        try {
          confirmationSortie = presenterConfirmationQuitter(
            obtenirConteneurAboreza().carte, sortir, annulerSortie,
            options.sortie === 'pause'
              ? { titre: 'Reprendre plus tard ? (enregistrement conservé 15 minutes)', bouton: 'Confirmer' }
              : {}
          );
        } catch (erreur) { objet.inert = false; throw erreur; }
      };
      const esc = evenement => {
        if (evenement.key !== 'Escape') return;
        evenement.preventDefault();
        // Le menu déroulant se ferme d'abord, sans proposer de sortir du tunnel.
        const dropdown = objet.querySelector('.lcdp-aboreza-dropdown[open]');
        if (dropdown && !confirmationSortie) {
          dropdown.open = false;
          dropdown.querySelector('summary')?.focus({ preventScroll: true });
          return;
        }
        if (confirmationSortie) annulerSortie();
        else if (options.sortie === 'annuler') finir(null);
        else demanderSortie();
      };
      fermeture.addEventListener('click', () => {
        if (options.sortie === 'annuler') finir(null);
        else demanderSortie();
      });
      // IMPORTANT : ne PAS fermer au clic sur le fond (ni sur le contenu).
      workflow.addEventListener('keydown', esc);
      installer(objet, finir);
      fermeture.focus({ preventScroll: true });
    });
  }
  function afficherEtapeUne(objet) {
    const titre = objet.querySelector('[data-lcdp-dialogue-title]');
    if (!titre) return;
    const etape = elem('span', 'lcdp-aboreza-etape', 'Etape 1');
    titre.prepend(etape);
    objet.classList.add('lcdp-aboreza-premiere-etape');
  }

  // Menu accessible sans l'aspect bleu imposé par la liste native du navigateur.
  // Les formules proviennent toujours exclusivement du catalogue du Worker.
  function creerChoixFormuleAboreza(offres, changement) {
    const disponibles = offres.filter(offre => offre.disponible !== false);
    const racine = elem('details', 'lcdp-aboreza-dropdown');
    const declencheur = elem('summary', 'lcdp-aboreza-dropdown__declencheur');
    declencheur.setAttribute('aria-label', 'Choisissez la formule d’abonnement');
    const liste = elem('div', 'lcdp-aboreza-dropdown__liste');
    liste.setAttribute('role', 'listbox');
    liste.setAttribute('aria-label', 'Formules d’abonnement');
    let valeur = disponibles[0]?.formule || '';
    const boutons = [];
    for (const offre of disponibles) {
      const ligne = elem('button', 'lcdp-aboreza-dropdown__option', nomFormule(offre.formule));
      ligne.type = 'button';
      ligne.setAttribute('role', 'option');
      ligne.addEventListener('click', () => {
        valeur = offre.formule;
        mettreAJour();
        racine.open = false;
        declencheur.focus({ preventScroll: true });
        changement();
      });
      boutons.push({ ligne, formule: offre.formule });
      liste.append(ligne);
    }
    function mettreAJour() {
      declencheur.textContent = nomFormule(valeur) || 'Choisissez une formule';
      for (const option of boutons) option.ligne.setAttribute('aria-selected', String(option.formule === valeur));
    }
    liste.addEventListener('keydown', evenement => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(evenement.key)) return;
      evenement.preventDefault();
      const index = boutons.findIndex(option => option.ligne === document.activeElement);
      let suivant = index;
      if (evenement.key === 'ArrowDown') suivant = (index + 1) % boutons.length;
      else if (evenement.key === 'ArrowUp') suivant = (index - 1 + boutons.length) % boutons.length;
      else if (evenement.key === 'Home') suivant = 0;
      else suivant = boutons.length - 1;
      boutons[suivant]?.ligne.focus({ preventScroll: true });
    });
    declencheur.addEventListener('keydown', evenement => {
      if (!['ArrowDown', 'ArrowUp'].includes(evenement.key)) return;
      evenement.preventDefault();
      racine.open = true;
      (evenement.key === 'ArrowUp' ? boutons.at(-1) : boutons[0])?.ligne.focus({ preventScroll: true });
    });
    racine.addEventListener('focusout', evenement => {
      if (!racine.contains(evenement.relatedTarget)) racine.open = false;
    });
    racine.append(declencheur, liste);
    mettreAJour();
    return { racine, getValeur: () => valeur };
  }

  // Contrôle placé AVANT le chargement des écrans et des choix d'abonnement.
  // Le serveur reste seul décisionnaire de l'horaire et de la dérogation de test.
  async function verifierOuvertureAbonnement() {
    const disponibilite = await api('/disponibilite');
    return { autorise: disponibilite.autorise === true, message: disponibilite.message };
  }

  async function afficherBlocageAbonnement(message) {
    const dialogue = await lireObjet('/BOX/02-box-dialogue-bouton.html', '[data-lcdp-box-dialogue-bouton]');
    const titre = dialogue.querySelector('[data-lcdp-dialogue-title]');
    const texte = dialogue.querySelector('[data-lcdp-dialogue-text]');
    const actions = dialogue.querySelector('[data-lcdp-dialogue-actions]');
    if (![titre, texte, actions].every(Boolean)) throw new Error('Dialogue horaire indisponible.');
    titre.textContent = 'ABO-RÉZA';
    texte.textContent = String(message || 'Vous pouvez vous abonner à partir de 8h demain (heure de Paris).');
    dialogue.querySelector('[data-lcdp-dialogue-close]')?.remove();
    actions.replaceChildren();
    const fermer = bouton('Fermer', true);
    actions.append(fermer);
    const focusAvant = document.activeElement;
    document.body.append(dialogue);
    return new Promise(resolve => {
      fermer.addEventListener('click', () => {
        dialogue.remove();
        if (focusAvant?.isConnected) focusAvant.focus({ preventScroll: true });
        resolve();
      });
      fermer.focus({ preventScroll: true });
    });
  }

  function modal(titre, message, choix, options = {}) {
    return modalComposant('dialogue', titre, (objet, finir) => {
      const texte = objet.querySelector('[data-lcdp-dialogue-text]');
      const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
      if (!texte || !actions) throw Error('Zones de dialogue absentes.');
      texte.textContent = message;
      texte.hidden = !message;
      if (options.compact) objet.classList.add('lcdp-aboreza-modal-compact');
      ligneActions(choix, finir, actions);
    }, options);
  }
  function champGenerique(libelle, controle) {
    const champ = composants.champ.cloneNode(true);
    const nom = elem('label', 'lcdp-box-champ-formulaire__label', libelle);
    const identifiant = 'lcdp-aboreza-' + libelle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    controle.id = identifiant;
    nom.htmlFor = identifiant;
    const zoneLibelle = champ.querySelector('[data-lcdp-champ-label-zone]');
    const zoneControle = champ.querySelector('[data-lcdp-champ-control]');
    if (!zoneLibelle || !zoneControle) throw Error('Structure du champ générique incomplète.');
    // Uniquement les deux emplacements utiles, sans les nœuds de mise en page du modèle.
    // Les blancs du HTML cloné seraient interprétés comme des lignes par le dialogue générique.
    champ.replaceChildren(zoneLibelle, zoneControle);
    zoneLibelle.replaceChildren(nom);
    zoneControle.replaceChildren(controle);
    return champ;
  }
  function champDialogueCentre(libelle, controle) {
    const conteneur = elem('div', 'lcdp-box-dialogue-bouton__text');
    conteneur.append(champGenerique(libelle, controle));
    return conteneur;
  }
  async function choisirFormuleCatalogue(offres) {
    return modalComposant('dialogue', 'Choisissez votre abonnement', (objet, finir) => {
      afficherEtapeUne(objet);
      objet.querySelector('[data-lcdp-dialogue-text]').textContent =
        'Toutes les formules sont affichées. Les abonnements indisponibles sont désactivés.';
      const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
      const zone = elem('div', 'lcdp-workflow-abonnement__choice-zone');
      for (const offre of offres) {
        const actif = offre.disponible !== false;
        const b = bouton(nomFormule(offre.formule) + (actif ? '' : ' — indisponible'));
        b.disabled = !actif;
        b.title = actif ? 'Choisir cette formule' : (offre.motifIndisponibilite || 'Aucune date de démarrage compatible.');
        if (actif) b.addEventListener('click', () => finir(offre.formule));
        else b.append(elem('small', '', ' — ' + b.title));
        zone.append(b);
      }
      actions.append(zone);
    });
  }
  async function choisirDateDemarrage(offre) {
    if (offre.formule === '1J') {
      return modalComposant('dialogue', 'Choisissez votre date de démarrage', (objet, finir) => {
        objet.querySelector('[data-lcdp-dialogue-text]').textContent = 'Abonnement 1 jour';
        const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
        const entree = elem('input');
        entree.type = 'date'; entree.min = offre.dateMin; entree.max = offre.dateMax; entree.value = offre.dateMin;
        entree.required = true;
        actions.append(champDialogueCentre('Date de démarrage choisie', entree));
        const continuer = bouton('Continuer', true);
        continuer.addEventListener('click', () => { if (entree.validity.valid) finir(entree.value); else entree.reportValidity(); });
        actions.append(continuer);
        const retour = bouton('Retour aux abonnements');
        retour.addEventListener('click', () => finir(null));
        actions.append(retour);
      });
    }
    return modalComposant('calendrier', 'Début du nouvel abonnement', (objet, finir) => {
      const meta = objet.querySelector('[data-lcdp-calendrier-an-meta]');
      const annees = objet.querySelector('[data-lcdp-calendrier-an-years]');
      const message = objet.querySelector('[data-lcdp-calendrier-an-message]');
      const precedent = objet.querySelector('[data-lcdp-calendrier-an-back]');
      const suivant = objet.querySelector('[data-lcdp-calendrier-an-next]');
      meta.textContent = 'Abonnement ' + nomFormule(offre.formule) + ' — sélectionnez son mois de démarrage.';
      const dates = Array.isArray(offre.debuts) ? offre.debuts : [];
      const parAnnee = new Map();
      for (const date of dates) {
        const annee = date.slice(0, 4);
        if (!parAnnee.has(annee)) parAnnee.set(annee, []);
        parAnnee.get(annee).push(date);
      }
      let selection = dates[0] || null;
      const boutons = [];
      for (const [annee, debuts] of parAnnee) {
        const bloc = elem('div');
        bloc.append(elem('h3', 'lcdp-box-calendrier-an__year-title', annee));
        const grille = elem('div', 'lcdp-box-calendrier-an__months');
        for (const date of debuts) {
          const b = elem('button', 'lcdp-box-calendrier-an__month', moisLibelle(date.slice(0, 7)));
          b.type = 'button'; b.setAttribute('aria-pressed', String(date === selection));
          b.addEventListener('click', () => {
            selection = date;
            for (const ligne of boutons) ligne.bouton.setAttribute('aria-pressed', String(ligne.date === selection));
          });
          boutons.push({ bouton: b, date });
          grille.append(b);
        }
        bloc.append(grille);
        annees.append(bloc);
      }
      if (!dates.length) { message.textContent = 'Aucune date de démarrage disponible.'; message.hidden = false; suivant.disabled = true; }
      precedent.textContent = 'Retour aux abonnements';
      suivant.textContent = 'Continuer';
      precedent.addEventListener('click', () => finir(null));
      suivant.addEventListener('click', () => { if (selection) finir(selection); });
    });
  }
  async function presenterCompatibilite(verification) {
    const { compatible, inclusions = [], dateDebut, dateFin, message } = verification;
    if (!compatible) {
      await modal('Date non compatible', message || 'Ce début ne permet pas d’inclure les abonnements actuels.', [
        { texte: 'Fermer', valeur: true, primaire: true }
      ]);
      return false;
    }
    if (!inclusions.length) return true;
    return modal('Inclure vos abonnements',
      `Débuter l’abonnement le ${dateLibelle(dateDebut)} et inclure les abonnements actuels sur la période (${moisLibelle(dateDebut.slice(0, 7))} – ${moisLibelle(dateFin.slice(0, 7))}) ?`,
      [{ texte: 'Inclure', valeur: true, primaire: true }]);
  }
  // K1 : formule et date dans la même étape, sans note dynamique de quotas.
  async function choisirOffre(offres) {
    return modalComposant('dialogue', 'Choisissez votre abonnement', (objet, finir) => {
      afficherEtapeUne(objet);
      const texte = objet.querySelector('[data-lcdp-dialogue-text]');
      texte.hidden = true;
      const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
      const espace = elem('div', 'lcdp-box-dialogue-bouton__actions');
      const choix = creerChoixFormuleAboreza(offres, reconstruire);
      actions.append(choix.racine, espace);
      function reconstruire() {
        espace.replaceChildren();
        const offre = offres.find(o => o.formule === choix.getValeur());
        if (!offre) return;
        let entree;
        if (offre.formule === '1J') {
          entree = elem('input');
          entree.type = 'date';
          entree.min = offre.dateMin;
          entree.max = offre.dateMax;
          entree.value = offre.dateMin;
        } else {
          entree = elem('select');
          for (const date of offre.debuts) {
            const option = elem('option', '', dateLibelle(date));
            option.value = date;
            entree.append(option);
          }
        }
        entree.required = true;
        espace.append(champDialogueCentre('Date de démarrage choisie', entree));
      }
      reconstruire();
      const continuer = bouton('Continuer', true);
      continuer.addEventListener('click', () => {
        const entree = espace.querySelector('input,select');
        if (!entree || !entree.value || !entree.validity.valid) { entree?.reportValidity(); return; }
        finir({ formule: choix.getValeur(), dateDebut: entree.value });
      });
      actions.append(continuer);
    });
  }
  function lienCgvAboreza() {
    const chemin = '/ESPACE-MEMBRE/cgv-lcdp.html';
    return typeof window.LCDP_urlMembre === 'function'
      ? window.LCDP_urlMembre(chemin)
      : new URL(chemin, window.location.href).href;
  }

  function carteAbonnementSelectionne(p) {
    // Champs dérivés du panier fourni par le Worker, sans modèle de prix inventé.
    const carte = elem('div', 'lcdp-aboreza-selection');
    for (const [libelle, valeur] of [
      ['Abonnement choisi', codeFormule(p.formule)],
      ['Début choisi', dateLibelle(p.dateDebut)]
    ]) {
      const ligne = elem('div', 'lcdp-aboreza-selection__item');
      ligne.append(elem('span', 'lcdp-aboreza-selection__libelle', libelle));
      ligne.append(elem('span', 'lcdp-aboreza-selection__valeur', valeur));
      carte.append(ligne);
    }
    return carte;
  }

  async function informerContrainte(p) {
    return modalComposant('dialogue', 'Planifiez à la commande', (objet, finir) => {
      objet.classList.add('lcdp-aboreza-deuxieme-etape');
      const titre = objet.querySelector('[data-lcdp-dialogue-title]');
      titre.prepend(elem('span', 'lcdp-aboreza-etape', 'Etape 2'));
      const texte = objet.querySelector('[data-lcdp-dialogue-text]');
      texte.textContent = 'Vous pourrez modifier par la suite';
      const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
      actions.replaceChildren();
      actions.append(carteAbonnementSelectionne(p));

      const corps = elem('div', 'lcdp-aboreza-cgv');
      const titreConditions = elem('p', 'lcdp-aboreza-cgv__intro');
      titreConditions.append(document.createTextNode('Conditions générales de vente des accès planifiés à la commande ('));
      const url = lienCgvAboreza();
      if (url) {
        const lien = elem('a', '', 'voir les CGV');
        lien.href = url;
        lien.target = '_blank';
        lien.rel = 'noopener noreferrer';
        titreConditions.append(lien);
      } else {
        titreConditions.append(elem('span', 'lcdp-aboreza-cgv__lien-absent', 'voir les CGV'));
      }
      titreConditions.append(document.createTextNode(' La Clé du Parc)'));
      corps.append(titreConditions);
      const mentions = [
        ['Accès à planifier à la commande', '2 accès pour le mois de début choisi, puis 2 accès pour chacun des mois consécutifs obligatoires selon la durée de l’abonnement. Pour la formule 1J, les 2 accès sont à planifier sur la journée choisie. La planification guidée s’arrête dès que tous ces accès sont planifiés.'],
        ['', 'Votre panier d’accès planifié reste valable pour une durée de 15 minutes, qui se renouvelle à chaque nouvel accès planifié'],
        ['', 'Vous pouvez annuler vos accès planifiés à la commande une fois votre abonnement souscrit (consulter les CGV La Clé du Parc pour en savoir plus sur la planification et l’utilisation de vos droits d’accès aux parcs dans le cadre de votre abonnement)']
      ];
      for (const [libelle, valeur] of mentions) {
        const ligne = elem('p', 'lcdp-aboreza-cgv__point');
        if (libelle) ligne.append(elem('span', 'lcdp-aboreza-cgv__terme', libelle + ' : '));
        ligne.append(document.createTextNode(valeur));
        corps.append(ligne);
      }
      actions.append(corps);
      const continuer = bouton('PLANIFIER', true);
      continuer.addEventListener('click', () => finir(true));
      actions.append(continuer);
    });
  }

  function miseAJourBandeau() {
    const hote = bridge()?.hoteBandeau?.();
    if (!hote) return;
    if (!courant) { bandeau?.remove(); bandeau = null; return; }
    if (!bandeau) {
      bandeau = elem('section', 'lcdp-aboreza-bandeau');
      bandeau.setAttribute('aria-label', 'Étape 3 – Vos accès à planifier');
      bandeau.setAttribute('aria-live', 'polite');
    }
    bandeau.replaceChildren();
    bandeau.append(elem('div', 'lcdp-aboreza-bandeau__etape', 'Etape 3'));
    bandeau.append(carteAbonnementSelectionne(courant));
    const mois = Array.isArray(courant.mois) ? courant.mois.find(x => x.mois === courant.moisActif) : null;
    const choix = Number(mois?.selectionnes || 0);
    const attendu = Number(mois?.attendu || 2);
    const texte = elem('p', 'lcdp-aboreza-bandeau__progression');
    texte.append(document.createTextNode('À planifier sur ce mois (à la commande) : '));
    texte.append(elem('span', 'lcdp-aboreza-bandeau__nombre', `${choix}/${attendu} accès planifiés`));
    bandeau.append(texte);
    const quitter = bouton('Reprendre plus tard (enregistrement conservé 15 minutes)');
    quitter.classList.add('lcdp-aboreza-bandeau__pause');
    quitter.addEventListener('click', () => demanderPausePanier().catch(e => bridge()?.alerter?.(e.message)));
    bandeau.append(quitter);
    const entete = hote.querySelector('.lcdp-box-calendrier-mois__header');
    if (entete) hote.insertBefore(bandeau, entete);
    else if (!bandeau.isConnected) hote.prepend(bandeau);
  }

  async function entrerDansCalendrier(p, garderConteneurPourRecap = false) {
    courant = p;
    repriseApresPause = false;
    bridge()?.changerMode?.(true);
    // Les quatre catégories ne sont cochées automatiquement qu'au lancement
    // d'une nouvelle phase de planification ; pas à chaque changement de parc.
    if (!filtresInitialisesPanier) {
      bridge()?.afficherTousLesFiltres?.();
      filtresInitialisesPanier = true;
    }
    miseAJourBandeau();
    bridge()?.viderCache?.();
    await bridge()?.allerMois?.(p.moisActif);
    if (!garderConteneurPourRecap) fermerConteneurAboreza();
  }

  async function suspendreTunnel() {
    repriseApresPause = true;
    if (!contextePanierSuspendu) contextePanierSuspendu = { origine: courant?.origine || 'sans_abonnement' };
    courant = null;
    filtresInitialisesPanier = false;
    bridge()?.changerMode?.(false);
    miseAJourBandeau();
    fermerConteneurAboreza();
    bridge()?.viderCache?.();
    await bridge()?.actualiser?.();
    // Le parc et le mois actuellement affichés restent inchangés.
  }

  async function demanderPausePanier() {
    if (!courant || occupe) return;
    const choix = await modalComposant('dialogue',
      'Reprendre plus tard ? (enregistrement conservé 15 minutes)',
      (objet, finir) => {
        const texte = objet.querySelector('[data-lcdp-dialogue-text]');
        texte.hidden = true;
        const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
        actions.replaceChildren();
        const boutonConfirmer = bouton('Confirmer', true);
        boutonConfirmer.addEventListener('click', () => finir(true));
        actions.append(boutonConfirmer);
      }, { sortie: 'annuler' }).catch(e => {
        if (e === SORTIE_FORMULAIRE_ABOREZA) return false;
        throw e;
      });
    if (choix === true) await suspendreTunnel();
    else fermerConteneurAboreza();
  }

  async function quitterTunnel() {
    // Sortie explicite du formulaire non soumis, sans effacer le panier serveur.
    await suspendreTunnel();
  }

  async function reprendreOuRecommencer(p) {
    return modal('Un panier existe déjà',
      `Abonnement ${nomFormule(p.formule)}, début ${dateLibelle(p.dateDebut)}. ${p.nbSelectionnes} accès sélectionné${p.nbSelectionnes > 1 ? 's' : ''} sur ${p.nbAccesRequis}.`, [
        { texte: 'Reprendre', valeur: 'reprendre', primaire: true },
        { texte: 'Annuler ce panier et recommencer', valeur: 'recommencer' }
      ]);
  }
  async function demarrer(contexte={}){
    if(!['sans_abonnement','jour_hors_couverture','horizon'].includes(contexte.origine)){
      await bridge()?.alerter?.('Cette entrée ABO-RÉZA n’est pas encore raccordée.');return;
    }
    if(occupe)return;
    occupe=true;
    // Conserver K2/K3 avec la date ou le mois cible pour une reprise fidèle.
    contextePanierSuspendu = {
      origine: contexte.origine || contextePanierSuspendu?.origine || 'sans_abonnement',
      date: contexte.date || contextePanierSuspendu?.date || null,
      moisCible: contexte.moisCible || contextePanierSuspendu?.moisCible || null
    };
    try{
      afficherAttenteFormules('Vérification des horaires de souscription…');
      const disponibilite = await verifierOuvertureAbonnement();
      if (!disponibilite.autorise) {
        fermerConteneurAboreza();
        await afficherBlocageAbonnement(disponibilite.message);
        return;
      }
      afficherAttenteFormules();
      await chargerTemplates();
      const enCours=(await api('/panier')).panier;
      if(enCours){
        masquerAttenteFormules();
        const decision=contexte.repriseAutomatique === true ? 'reprendre' : await reprendreOuRecommencer(enCours);
        if(decision==='reprendre'){
          await entrerDansCalendrier(enCours, Boolean(enCours.complet));
          if(enCours.complet)await afficherRecap(enCours);
          return;
        }
        if(decision!=='recommencer')return;
        afficherAttenteFormules();
        await api('/annuler','POST',{idpanier:enCours.idpanier});
      }
      const parametres=new URLSearchParams({origine:contexte.origine});
      if(contexte.origine==='jour_hors_couverture')parametres.set('dateCible',contexte.date||'');
      if(contexte.origine==='horizon')parametres.set('moisCible',contexte.moisCible||'');
      const offres=(await api('/catalogue?'+parametres.toString())).offres;
      masquerAttenteFormules();
      let demande=null;
      let inclureExistants=false;
      if(['jour_hors_couverture','horizon'].includes(contexte.origine)){
        // K2/K3 : même catalogue et même écran de démarrage, filtrages distincts.
        while(!demande){
          const formule=await choisirFormuleCatalogue(offres);
          if(!formule)return;
          const offre=offres.find(o=>o.formule===formule);
          while(!demande){
            const dateDebut=await choisirDateDemarrage(offre);
            if(!dateDebut)break;
            const verification=(await api('/verifier-debut','POST',{
              origine:contexte.origine,dateCible:contexte.date||'',moisCible:contexte.moisCible||'',formule,dateDebut
            })).verification;
            if(!verification.compatible){await presenterCompatibilite(verification);continue;}
            const accord=await presenterCompatibilite(verification);
            if(accord!==true)continue;
            demande={formule,dateDebut};inclureExistants=verification.inclusions.length>0;
          }
        }
      }else{
        demande=await choisirOffre(offres,contexte);
        if(!demande)return;
      }
      const nouveau=(await api('/panier','POST',{
        ...demande,origine:contexte.origine,inclureExistants,
        ...(contexte.origine==='jour_hors_couverture'?{dateCible:contexte.date}:{}),
        ...(contexte.origine==='horizon'?{moisCible:contexte.moisCible}:{}),
      })).panier;
      const suivant=await informerContrainte(nouveau);
      if(!suivant)return; // Le panier reste récupérable.
      await entrerDansCalendrier(nouveau);
    } catch(e){
      if (e === SORTIE_REPRENDRE_PLUS_TARD) {
        await suspendreTunnel();
        return;
      }
      if (e === SORTIE_FORMULAIRE_ABOREZA) {
        if (courant) await quitterTunnel();
        return;
      }
      masquerAttenteFormules();
      if (composants?.workflow) {
        await modal('ABO-RÉZA', e.message || 'Erreur ABO-RÉZA.', [
          { texte: 'Fermer', valeur: true, primaire: true }
        ]);
      } else {
        fermerConteneurAboreza();
        await bridge()?.alerter?.(e.message || 'Erreur ABO-RÉZA.');
      }
    }
    finally{fermerConteneurAboreza();occupe=false;}
  }
  async function selectionnerAcces(choix) {
    if (!courant || occupe) return;
    occupe = true;
    afficherAttenteFormules('Enregistrement de votre accès…');
    try {
      const avant = courant.moisActif;
      const reponse = await api('/acces', 'POST', {
        idpanier: courant.idpanier,
        idparc: String(choix.parc.idparc || choix.parc.id || ''),
        date: choix.dateIso,
        plagebookd: choix.plagebookd
      });
      courant = reponse.panier;
      bridge()?.fermerJour?.();
      bridge()?.viderCache?.();
      miseAJourBandeau();
      await Promise.resolve(courant.moisActif !== avant
        ? bridge()?.allerMois?.(courant.moisActif) : bridge()?.actualiser?.());
      masquerAttenteFormules();
      if (courant.complet) {
        await afficherRecap(courant);
      } else {
        await modal('Accès planifié', '', [
          { texte: 'Continuer le planning', valeur: true, primaire: true }
        ], { compact: true, sortie: 'pause' });
      }
    } catch (e) {
      if (e === SORTIE_REPRENDRE_PLUS_TARD || e === SORTIE_FORMULAIRE_ABOREZA) {
        await suspendreTunnel();
        return;
      }
      masquerAttenteFormules();
      await modal('ABO-RÉZA', e.message || 'Impossible d’enregistrer cet accès.', [
        { texte: 'Fermer', valeur: true, primaire: true }
      ], { compact: true, sortie: 'pause' }).catch(async erreur => {
        if (erreur === SORTIE_REPRENDRE_PLUS_TARD) await suspendreTunnel();
        else throw erreur;
      });
    } finally {
      fermerConteneurAboreza();
      occupe = false;
    }
  }

  // Écran de fin d'ABO-RÉZA. Le paiement et les remises sont une étape future :
  // ne jamais démarrer /valider ou ouvrir le bon de commande précédent.
  async function afficherRecap(p) {
    return modalComposant('dialogue', 'Vos accès à la commande sont planifiés',
      (objet, finir) => {
        objet.classList.add('lcdp-aboreza-recap-final');
        const texte = objet.querySelector('[data-lcdp-dialogue-text]');
        texte.hidden = true;
        const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
        actions.replaceChildren();
        actions.append(carteAbonnementSelectionne(p));
        const liste = elem('div', 'lcdp-aboreza-recap-final__liste');
        const acces = Array.isArray(p.acces) ? p.acces : [];
        for (const item of acces) {
          const ligne = elem('div', 'lcdp-aboreza-recap-final__acces');
          const date = dateLibelle(item.dateacces);
          const titre = elem('span', 'lcdp-aboreza-recap-final__date', date);
          const detail = elem('span', 'lcdp-aboreza-recap-final__detail',
            (item.nomparc || 'Parc') + ' · ' + (heuresPlage[item.plagebookd] || item.plagebookd || '—'));
          ligne.append(titre, detail);
          liste.append(ligne);
        }
        actions.append(liste);
        const mAbonner = bouton('M’abonner', true);
        const indisponible = elem('p', 'lcdp-aboreza-recap-final__avenir',
          'Les modalités de paiement et les remises seront proposées dans une prochaine étape. Votre panier reste enregistré pendant sa durée de validité.');
        indisponible.hidden = true;
        mAbonner.addEventListener('click', () => {
          indisponible.hidden = false;
        });
        actions.append(mAbonner, indisponible);
      }, { sortie: 'pause', compact: false });
  }

  async function reprendrePanierAuClicJour() {
    if (!repriseApresPause || occupe) return false;
    await demarrer({ ...(contextePanierSuspendu || { origine: 'sans_abonnement' }), repriseAutomatique: true });
    return true;
  }

  function adopterChoixHoraire(noeud) {
    if (!courant || !noeud) return false;
    const { workflow, contenu, carte } = obtenirConteneurAboreza();
    workflow.classList.remove('lcdp-box-workflow-abonnement--confirmation', 'lcdp-box-workflow-abonnement--recapitulatif');
    workflow.classList.add('lcdp-box-workflow-abonnement--choix-horaire');
    workflow.setAttribute('aria-label', 'Choisir une plage horaire');
    noeud.removeAttribute('role');
    noeud.removeAttribute('aria-modal');
    contenu.replaceChildren(noeud);
    carte.scrollTop = 0;
    return true;
  }

  function datePossible(d){return Boolean(courant && d.slice(0,7)===courant.moisActif && d>=courant.dateDebut&&d<=courant.dateFin);}
  function accesDejaChoisi(date,plage){return courant?.acces?.some(a=>a.dateacces===date&&a.plagebookd===plage);}
  function marquerAccesProvisoires(card,date){
    if(!courant)return;
    const idparc=card.dataset.idparc;
    courant.acces.filter(a=>a.dateacces===date&&String(a.idparc)===idparc).forEach(a=>{
      if(a.origine==='existant')return;
      const slot=card.querySelector('[data-lcdp-card-jour-mois-slot="'+a.plagebookd+'"]');
      if(slot){slot.classList.add('lcdp-planifier-plage--acces-personnel');slot.title+=' · Accès provisoire ABO-RÉZA';}
    });
  }
  window.LCDP_ABOREZA_UI=Object.freeze({ adopterPaiement: adopterBonCommandeDansConteneur, fermer: fermerConteneurAboreza, adopterChoixHoraire });
  window.LCDP_ABOREZA={actif:()=>Boolean(courant),panier:()=>courant,demarrer,selectionnerAcces,datePossible,accesDejaChoisi,marquerAccesProvisoires,reprendrePanierAuClicJour};
  window.LCDP_ouvrirAboReza=demarrer;
})();