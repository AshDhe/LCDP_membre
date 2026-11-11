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
    if (attenteFormules?.isConnected) {
      attenteFormules.setAttribute('aria-label', libelle);
      return;
    }
    const masque = elem('div', 'lcdp-planifier-partage-attente lcdp-attente-plein-ecran');
    masque.setAttribute('role', 'status');
    masque.setAttribute('aria-label', libelle);
    masque.append(creerSpinnerAboReza());
    document.body.append(masque);
    attenteFormules = masque;
  }
  function masquerAttenteFormules() {
    attenteFormules?.remove();
    attenteFormules = null;
  }
  const moisLibelle = cle => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(cle + '-01T12:00:00Z'));
  const dateLibelle = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00Z'));
  const nomFormule = f => ({ '1J': '1 jour', '1M': '1 mois', '3M': '3 mois', '5M': '5 mois', '10M': '10 mois', '11M': '11 mois', '12M': '1 an' }[f] || f);

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
        lireObjet('/HTMLBASE/04-workflow-abonnement.html', '[data-lcdp-box-workflow-abonnement]'),
        lireObjet('/HTMLBASE/02-dialogue-bouton.html', '[data-lcdp-box-dialogue-bouton]'),
        lireObjet('/HTMLBASE/04-calendrier-an.html', '[data-lcdp-box-calendrier-an]'),
        lireObjet('/HTMLBASE/03-champ-formulaire.html', '[data-lcdp-box-champ-formulaire]'),
        lireObjet('/HTMLBASE/04-card-abonnement.html', '[data-lcdp-box-card-abonnement]')
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
    const workflow = composants.workflow.cloneNode(true);
    workflow.classList.add('lcdp-box-workflow-abonnement--' + type);
    workflow.setAttribute('aria-label', titre);
    workflow.tabIndex = -1;
    const contenu = workflow.querySelector('[data-lcdp-workflow-abonnement-content]');
    if (!contenu) throw Error('Emplacement du workflow abonnement manquant.');
    const objet = modele.cloneNode(true);
    // Seule la coque commune porte le rôle modal ; l'objet injecté est son contenu.
    objet.removeAttribute('role');
    objet.removeAttribute('aria-modal');
    objet.classList.add('lcdp-workflow-abonnement-box');
    contenu.append(objet);
    return { workflow, objet };
  }
  function modalComposant(type, titre, installer) {
    return new Promise((resolve, reject) => {
      // Toutes les étapes ABO-RÉZA restent dans le wrapper de PLANIFIER.
      // Le calendrier est masqué, jamais démonté ; header et footer restent visibles.
      const slot = document.getElementById('lcdp-aboreza-workflow-slot');
      const conteneur = slot?.closest('.lcdp-planifier-wrapper .lcdp-page-content');
      if (!slot || !conteneur) {
        reject(new Error('Vue ABO-RÉZA du wrapper PLANIFIER introuvable.'));
        return;
      }
      const modele = type === 'calendrier' ? composants.calendrier : composants.dialogue;
      const { workflow, objet } = monterWorkflow(modele,
        type === 'calendrier' ? 'calendrier-an' : 'confirmation', titre);
      workflow.classList.add('lcdp-aboreza-workflow-interne');
      workflow.setAttribute('role', 'region');
      workflow.removeAttribute('aria-modal');
      const titreElement = objet.querySelector(type === 'calendrier'
        ? '[data-lcdp-calendrier-an-title]' : '[data-lcdp-dialogue-title]');
      const fermeture = objet.querySelector(type === 'calendrier'
        ? '[data-lcdp-calendrier-an-close]' : '[data-lcdp-dialogue-close]');
      if (!titreElement || !fermeture) {
        reject(new Error('Structure du dialogue ABO-RÉZA incomplète.'));
        return;
      }
      titreElement.textContent = titre;
      if (type === 'dialogue') objet.classList.add('lcdp-workflow-abonnement-box--confirmation');
      let clos = false;
      const precedent = document.activeElement;
      const masques = [...conteneur.children].filter(element => element !== slot)
        .map(element => ({ element, hidden: element.hidden }));
      const finir = valeur => {
        if (clos) return;
        clos = true;
        workflow.removeEventListener('keydown', esc);
        slot.replaceChildren();
        slot.hidden = true;
        masques.forEach(({ element, hidden }) => { element.hidden = hidden; });
        if (precedent?.isConnected && typeof precedent.focus === 'function') precedent.focus();
        resolve(valeur);
      };
      const esc = evenement => {
        if (evenement.key === 'Escape') { evenement.preventDefault(); finir(null); }
      };
      fermeture.addEventListener('click', () => finir(null));
      workflow.addEventListener('keydown', esc);
      try {
        installer(objet, finir);
        masques.forEach(({ element }) => { element.hidden = true; });
        slot.hidden = false;
        slot.replaceChildren(workflow);
        // Ne retirer le spinner qu'après installation de la nouvelle étape.
        masquerAttenteFormules();
        conteneur.closest('.lcdp-site-main')?.scrollTo?.({ top: 0 });
        fermeture.focus();
      } catch (erreur) {
        slot.replaceChildren();
        slot.hidden = true;
        masques.forEach(({ element, hidden }) => { element.hidden = hidden; });
        reject(erreur);
      }
    });
  }
  function modal(titre, message, choix) {
    return modalComposant('dialogue', titre, (objet, finir) => {
      const texte = objet.querySelector('[data-lcdp-dialogue-text]');
      const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
      if (!texte || !actions) throw Error('Zones de dialogue absentes.');
      texte.textContent = message;
      ligneActions(choix, finir, actions);
    });
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
      const workflow = objet.closest('[data-lcdp-box-workflow-abonnement]');
      workflow?.classList.add('lcdp-aboreza-catalogue');
      objet.classList.add('lcdp-aboreza-catalogue__dialogue');

      const texte = objet.querySelector('[data-lcdp-dialogue-text]');
      const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
      if (!texte || !actions) throw Error('Structure de sélection ABO-RÉZA incomplète.');
      texte.textContent = 'Toutes les formules sont affichées. Les abonnements non compatibles avec votre planning actuel sont désactivés.';
      actions.replaceChildren();
      actions.classList.add('lcdp-aboreza-catalogue__actions');

      const zoneDefilement = elem('div', 'lcdp-aboreza-catalogue__liste');
      const zoneValidation = elem('div', 'lcdp-aboreza-catalogue__validation');
      const continuer = bouton('Continuer avec cette formule', true);
      continuer.classList.add('lcdp-aboreza-catalogue__continuer');
      continuer.disabled = true;
      let selection = null;

      const disponibles = offres.filter(offre => offre.disponible !== false);
      const indisponibles = offres.filter(offre => offre.disponible === false);

      function section(libelle, classe) {
        const groupe = elem('section', 'lcdp-aboreza-catalogue__section ' + classe);
        groupe.append(elem('h3', 'lcdp-aboreza-catalogue__section-titre', libelle));
        const liste = elem('div', 'lcdp-aboreza-catalogue__options');
        groupe.append(liste);
        zoneDefilement.append(groupe);
        return liste;
      }

      if (disponibles.length) {
        const listeDisponibles = section('Formules disponibles', 'lcdp-aboreza-catalogue__section--disponibles');
        const nomRadio = 'lcdp-aboreza-catalogue-formule';
        disponibles.forEach((offre, index) => {
          const option = elem('label', 'lcdp-aboreza-catalogue__option');
          const radio = elem('input', 'lcdp-aboreza-catalogue__radio');
          radio.type = 'radio';
          radio.name = nomRadio;
          radio.value = offre.formule;
          radio.checked = index === 0;
          const contenu = elem('span', 'lcdp-aboreza-catalogue__option-contenu');
          const ligne = elem('span', 'lcdp-aboreza-catalogue__option-ligne');
          ligne.append(elem('strong', 'lcdp-aboreza-catalogue__nom', nomFormule(offre.formule)));
          ligne.append(elem('span', 'lcdp-aboreza-catalogue__statut lcdp-aboreza-catalogue__statut--disponible', 'Disponible'));
          contenu.append(ligne);
          contenu.append(elem('span', 'lcdp-aboreza-catalogue__description', 'Formule disponible pour votre planning.'));
          const indicateur = elem('span', 'lcdp-aboreza-catalogue__indicateur');
          indicateur.setAttribute('aria-hidden', 'true');
          option.append(radio, contenu, indicateur);
          radio.addEventListener('change', () => {
            if (!radio.checked) return;
            selection = offre.formule;
            continuer.disabled = false;
          });
          listeDisponibles.append(option);
          if (index === 0) selection = offre.formule;
        });
        continuer.disabled = false;
      }

      // Valider la formule disponible avant de présenter les offres non sélectionnables.
      continuer.addEventListener('click', () => {
        if (!selection) return;
        afficherAttenteFormules('Préparation de l’étape suivante…');
        finir(selection);
      });
      zoneValidation.append(continuer);
      zoneDefilement.append(zoneValidation);

      if (indisponibles.length) {
        const listeIndisponibles = section('Formules indisponibles', 'lcdp-aboreza-catalogue__section--indisponibles');
        for (const offre of indisponibles) {
          const option = elem('div', 'lcdp-aboreza-catalogue__option lcdp-aboreza-catalogue__option--indisponible');
          const ligne = elem('div', 'lcdp-aboreza-catalogue__option-ligne');
          ligne.append(elem('strong', 'lcdp-aboreza-catalogue__nom', nomFormule(offre.formule)));
          ligne.append(elem('span', 'lcdp-aboreza-catalogue__statut', 'Indisponible'));
          option.append(ligne);
          option.append(elem('p', 'lcdp-aboreza-catalogue__description',
            offre.motifIndisponibilite || 'Aucune date de démarrage compatible.'));
          listeIndisponibles.append(option);
        }
      }

      if (!offres.length) zoneDefilement.append(elem('p', 'lcdp-aboreza-catalogue__vide', 'Aucune formule disponible.'));
      actions.append(zoneDefilement);
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
        continuer.addEventListener('click', () => {
          if (!entree.validity.valid) { entree.reportValidity(); return; }
          afficherAttenteFormules('Vérification de la date de démarrage…');
          finir(entree.value);
        });
        actions.append(continuer);
        const retour = bouton('Retour aux abonnements');
        retour.addEventListener('click', () => finir(null));
        actions.append(retour);
      });
    }
    return modalComposant('calendrier', 'Début du nouvel abonnement', (objet, finir) => {
      const workflow = objet.closest('[data-lcdp-box-workflow-abonnement]');
      workflow?.classList.add('lcdp-aboreza-demarrage');
      const carte = objet.querySelector('.lcdp-box-calendrier-an__card');
      const entete = objet.querySelector('.lcdp-box-calendrier-an__header');
      const meta = objet.querySelector('[data-lcdp-calendrier-an-meta]');
      const annees = objet.querySelector('[data-lcdp-calendrier-an-years]');
      const message = objet.querySelector('[data-lcdp-calendrier-an-message]');
      const precedent = objet.querySelector('[data-lcdp-calendrier-an-back]');
      const suivant = objet.querySelector('[data-lcdp-calendrier-an-next]');
      if (!carte || !entete || !meta || !annees || !message || !precedent || !suivant) {
        throw Error('Structure du calendrier de démarrage ABO-RÉZA incomplète.');
      }

      const badge = elem('span', 'lcdp-aboreza-demarrage__badge', 'Abonnement ' + nomFormule(offre.formule));
      entete.prepend(badge);
      meta.textContent = 'Sélectionnez le mois à partir duquel votre accès sera actif.';
      const dates = Array.isArray(offre.debuts) ? offre.debuts : [];
      const parAnnee = new Map();
      for (const date of dates) {
        const annee = String(date).slice(0, 4);
        if (!parAnnee.has(annee)) parAnnee.set(annee, []);
        parAnnee.get(annee).push(date);
      }
      let selection = dates[0] || null;
      const boutons = [];
      const recap = elem('div', 'lcdp-aboreza-demarrage__recap');
      recap.setAttribute('aria-live', 'polite');
      const recapTitre = elem('strong', 'lcdp-aboreza-demarrage__recap-titre', 'Période de validité estimée');
      const recapTexte = elem('p', 'lcdp-aboreza-demarrage__recap-texte');
      recap.append(recapTitre, recapTexte);

      const moisDuree = { '1M': 1, '3M': 3, '5M': 5, '10M': 10, '11M': 11, '12M': 12 }[offre.formule];
      function actualiserRecap() {
        if (!selection || !moisDuree || !/^\d{4}-\d{2}-\d{2}$/.test(selection)) {
          recap.hidden = true;
          return;
        }
        const debut = new Date(selection + 'T12:00:00Z');
        if (Number.isNaN(debut.getTime())) { recap.hidden = true; return; }
        const fin = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + moisDuree, 0, 12));
        const formater = date => new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric'
        }).format(date);
        recapTexte.textContent = 'Du ' + formater(debut) + ' au ' + formater(fin);
        recap.hidden = false;
      }

      for (const [annee, debuts] of parAnnee) {
        const bloc = elem('section', 'lcdp-aboreza-demarrage__annee');
        const titreAnnee = elem('h3', 'lcdp-box-calendrier-an__year-title', annee);
        bloc.append(titreAnnee);
        const grille = elem('div', 'lcdp-box-calendrier-an__months');
        for (const date of debuts) {
          const b = elem('button', 'lcdp-box-calendrier-an__month');
          b.type = 'button';
          const nomMois = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long' })
            .format(new Date(date + 'T12:00:00Z'));
          b.append(elem('span', 'lcdp-aboreza-demarrage__mois-nom',
            nomMois.charAt(0).toUpperCase() + nomMois.slice(1)));
          b.append(elem('span', 'lcdp-aboreza-demarrage__mois-annee', annee));
          b.setAttribute('aria-pressed', String(date === selection));
          b.addEventListener('click', () => {
            selection = date;
            for (const ligne of boutons) ligne.bouton.setAttribute('aria-pressed', String(ligne.date === selection));
            actualiserRecap();
          });
          boutons.push({ bouton: b, date });
          grille.append(b);
        }
        bloc.append(grille);
        annees.append(bloc);
      }
      annees.after(recap);
      actualiserRecap();
      if (!dates.length) {
        message.textContent = 'Aucune date de démarrage disponible.';
        message.hidden = false;
        suivant.disabled = true;
      }
      precedent.textContent = 'Retour';
      suivant.textContent = 'Continuer';
      precedent.addEventListener('click', () => finir(null));
      suivant.addEventListener('click', () => {
        if (!selection) return;
        afficherAttenteFormules('Vérification de la date de démarrage…');
        finir(selection);
      });
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
  // K1 conserve son formulaire de qualification (formule et date dans la même fenêtre).
  async function choisirOffre(offres) {
    return modalComposant('dialogue', 'Choisissez votre abonnement', (objet, finir) => {
      const texte = objet.querySelector('[data-lcdp-dialogue-text]');
      texte.textContent = 'Choisissez une formule puis sa date de démarrage.';
      const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
      const choix = elem('select');
      offres.filter(o => o.disponible !== false).forEach(o => {
        const option = elem('option', '', nomFormule(o.formule)); option.value = o.formule; choix.append(option);
      });
      actions.append(champDialogueCentre('Formule', choix));
      const espace = elem('div', 'lcdp-box-dialogue-bouton__actions');
      actions.append(espace);
      const note = elem('p', 'lcdp-box-dialogue-bouton__text');
      actions.append(note);
      const reconstruire = () => {
        espace.replaceChildren();
        const offre = offres.find(o => o.formule === choix.value);
        if (!offre) return;
        let entree;
        if (offre.formule === '1J') {
          entree = elem('input'); entree.type = 'date'; entree.min = offre.dateMin; entree.max = offre.dateMax; entree.value = offre.dateMin;
        } else {
          entree = elem('select');
          for (const date of offre.debuts) {
            const option = elem('option', '', dateLibelle(date)); option.value = date; entree.append(option);
          }
        }
        entree.required = true;
        espace.append(champDialogueCentre('Date de démarrage choisie', entree));
        note.textContent = offre.formule === '1J'
          ? 'Vous devez réserver au moins un accès pour cette formule.'
          : offre.nbAccesRequis + ' accès obligatoires : deux par mois pendant ' + offre.nbMoisGuides + ' mois consécutifs.';
      };
      choix.addEventListener('change', reconstruire); reconstruire();
      const continuer = bouton('Continuer', true);
      continuer.addEventListener('click', () => {
        const entree = espace.querySelector('input,select');
        if (!entree || !entree.value || !entree.validity.valid) { entree?.reportValidity(); return; }
        afficherAttenteFormules('Préparation de vos accès…');
        finir({ formule: choix.value, dateDebut: entree.value });
      });
      actions.append(continuer);
    });
  }
  async function informerContrainte(p) {
    return modalComposant('dialogue', 'Préparez vos accès', (objet, finir) => {
      const workflow = objet.closest('[data-lcdp-box-workflow-abonnement]');
      workflow?.classList.add('lcdp-aboreza-preparation');
      objet.classList.add('lcdp-aboreza-preparation__dialogue');
      const titre = objet.querySelector('[data-lcdp-dialogue-title]');
      const texte = objet.querySelector('[data-lcdp-dialogue-text]');
      const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
      if (!titre || !texte || !actions) throw Error('Zones du dialogue générique absentes.');
      const etiquette = elem('span', 'lcdp-aboreza-preparation__badge', 'Étape de préparation');
      titre.before(etiquette);
      texte.textContent = 'Voici les règles à connaître avant de choisir vos créneaux.';
      texte.hidden = false;
      actions.replaceChildren();
      actions.classList.add('lcdp-aboreza-preparation__contenu');

      // Récapitulatif issu de la sélection effective, sans dates ni formules figées.
      const resume = composants.carte.cloneNode(true);
      const ligne = resume.querySelector('.lcdp-box-card-abonnement__row--main');
      const nom = resume.querySelector('[data-lcdp-card-abonnement-type]');
      const debut = resume.querySelector('[data-lcdp-card-abonnement-debut]');
      if (!ligne || !nom || !debut) throw Error('Carte d’abonnement générique incomplète.');
      resume.replaceChildren(ligne);
      resume.classList.add('lcdp-aboreza-preparation__resume');
      ligne.querySelector('.lcdp-box-card-abonnement__item--name .lcdp-box-card-abonnement__label').textContent = 'Abonnement';
      ligne.querySelector('.lcdp-box-card-abonnement__item--date .lcdp-box-card-abonnement__label').textContent = 'Date de début';
      nom.textContent = nomFormule(p.formule);
      debut.textContent = /^\d{4}-\d{2}-\d{2}$/.test(p.dateDebut)
        ? p.dateDebut.slice(8, 10) + '/' + p.dateDebut.slice(5, 7) + '/' + p.dateDebut.slice(2, 4)
        : dateLibelle(p.dateDebut);
      actions.append(resume);

      const continuer = bouton('Continuer vers PLANIFIER', true);
      continuer.classList.add('lcdp-aboreza-preparation__continuer');
      continuer.addEventListener('click', () => finir(true));
      const fleche = elem('span', 'lcdp-aboreza-preparation__fleche', '→');
      fleche.setAttribute('aria-hidden', 'true');
      continuer.append(fleche);
      actions.append(continuer);

      const regles = elem('section', 'lcdp-aboreza-preparation__regles');
      regles.append(elem('h3', 'lcdp-aboreza-preparation__section-titre', 'Comment préparer vos accès'));
      const icones = {
        parc: '<path d="M12 22s7-4.4 7-11a7 7 0 1 0-14 0c0 6.6 7 11 7 11Z"/><circle cx="12" cy="11" r="2.5"/>',
        calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3"/>',
        temps: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'
      };
      function ajouterRegle(icone, titreRegle, description, alerte = false) {
        const ligneRegle = elem('div', 'lcdp-aboreza-preparation__regle' +
          (alerte ? ' lcdp-aboreza-preparation__regle--alerte' : ''));
        const picto = elem('span', 'lcdp-aboreza-preparation__icone');
        picto.setAttribute('aria-hidden', 'true');
        picto.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
          icones[icone] + '</svg>';
        const paragraphe = elem('p');
        paragraphe.append(elem('strong', '', titreRegle + ' : '), document.createTextNode(description));
        ligneRegle.append(picto, paragraphe);
        regles.append(ligneRegle);
      }
      ajouterRegle('parc', 'Multi-parcs autorisé',
        'si vous planifiez plusieurs accès, vous pouvez changer de parc à chaque retour sur le planning.');
      if (p.formule === '1J') {
        ajouterRegle('calendrier', 'Accès à planifier',
          'vous devez sélectionner au moins un créneau pour votre abonnement d’un jour.');
      } else {
        ajouterRegle('calendrier', '2 accès par mois',
          'planifiez deux créneaux chaque mois (dans la limite de 5 mois consécutifs). Le planning avance automatiquement de mois en mois.');
      }
      ajouterRegle('temps', 'Délai de 15 minutes',
        'à chaque accès planifié, vous disposez de 15 min pour passer à l’étape suivante (nouvel accès ou paiement).', true);
      if (p.nbDejaReserves > 0) {
        regles.append(elem('p', 'lcdp-aboreza-preparation__deja-reserves',
          p.nbSelectionnes + ' accès requis déjà couverts ; il reste ' +
          Math.max(0, p.nbAccesRequis - p.nbSelectionnes) + ' accès à planifier.'));
      }
      actions.append(regles);
    });
  }

  function miseAJourBandeau() {
    const hote = bridge()?.hoteBandeau?.();
    if (!hote) return;
    if (!courant) { bandeau?.remove(); bandeau = null; return; }
    if (!bandeau) {
      bandeau = elem('section', 'lcdp-aboreza-suivi');
      bandeau.setAttribute('aria-live', 'polite');
    }
    bandeau.replaceChildren();

    const details = elem('div', 'lcdp-aboreza-suivi__details');
    const formule = elem('div', 'lcdp-aboreza-suivi__champ');
    formule.append(
      elem('span', 'lcdp-aboreza-suivi__libelle', 'Formule'),
      elem('strong', 'lcdp-aboreza-suivi__valeur', String(courant.formule || '').toUpperCase() === '12M' ? '1A' : String(courant.formule || '').toUpperCase())
    );
    const debut = elem('div', 'lcdp-aboreza-suivi__champ');
    debut.append(
      elem('span', 'lcdp-aboreza-suivi__libelle', 'Début prévu'),
      elem('strong', 'lcdp-aboreza-suivi__valeur', /^\\d{4}-\\d{2}-\\d{2}$/.test(String(courant.dateDebut || ''))
        ? courant.dateDebut.slice(8, 10) + '/' + courant.dateDebut.slice(5, 7) + '/' + courant.dateDebut.slice(2, 4)
        : dateLibelle(courant.dateDebut))
    );
    details.append(formule, debut);
    bandeau.append(details);

    const mois = Array.isArray(courant.mois) ? courant.mois : [];
    const total = Number(courant.nbAccesRequis) || mois.reduce((n, m) => n + Number(m.attendu || 0), 0);
    const planifies = mois.reduce((n, m) => n + Math.min(Number(m.selectionnes || 0), Number(m.attendu || 0)), 0);
    const ligne = elem('div', 'lcdp-aboreza-suivi__progression');
    ligne.append(
      elem('span', 'lcdp-aboreza-suivi__progression-libelle', 'Accès planifiés'),
      elem('strong', 'lcdp-aboreza-suivi__progression-valeur', planifies + ' sur ' + total)
    );
    bandeau.append(ligne);

    const pourcentage = total > 0 ? Math.max(0, Math.min(100, Math.round(planifies / total * 100))) : 0;
    const piste = elem('div', 'lcdp-aboreza-suivi__barre');
    piste.setAttribute('role', 'progressbar');
    piste.setAttribute('aria-label', 'Accès planifiés');
    piste.setAttribute('aria-valuemin', '0');
    piste.setAttribute('aria-valuemax', String(total));
    piste.setAttribute('aria-valuenow', String(planifies));
    piste.setAttribute('aria-valuetext', planifies + ' accès planifiés sur ' + total);
    const remplissage = elem('div', 'lcdp-aboreza-suivi__barre-remplissage');
    remplissage.style.width = pourcentage + '%';
    piste.append(remplissage);
    bandeau.append(piste);

    const groupes = elem('div', 'lcdp-aboreza-suivi__mois');
    groupes.setAttribute('role', 'group');
    groupes.setAttribute('aria-label', 'Progression des accès par mois');
    mois.forEach(m => {
      const groupe = elem('div', 'lcdp-aboreza-suivi__mois-groupe');
      const cases = elem('div', 'lcdp-aboreza-suivi__cases');
      const attendu = Number(m.attendu || 0);
      const selectionnes = Number(m.selectionnes || 0);
      for (let i = 0; i < attendu; i++) {
        const caseAcces = elem('span', 'lcdp-aboreza-suivi__case' +
          (i < selectionnes ? ' lcdp-aboreza-suivi__case--faite' : ''));
        caseAcces.setAttribute('aria-hidden', 'true');
        cases.append(caseAcces);
      }
      const nomMois = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'UTC', month: 'short'
      }).format(new Date(m.mois + '-01T12:00:00Z'));
      const legende = elem('span', 'lcdp-aboreza-suivi__mois-libelle',
        nomMois + ' · ' + Math.min(selectionnes, attendu) + '/' + attendu);
      groupe.append(cases, legende);
      groupes.append(groupe);
    });
    bandeau.append(groupes);

    const fermeture = hote.querySelector('.lcdp-box-calendrier-mois__close');
    if (fermeture) fermeture.after(bandeau);
    else hote.prepend(bandeau);
  }
  async function entrerDansCalendrier(p){
    courant=p;
    bridge()?.changerMode?.(true);
    miseAJourBandeau();
    bridge()?.viderCache?.();
    await bridge()?.allerMois?.(p.moisActif);
  }
  async function quitterTunnel(){
    courant=null;bridge()?.changerMode?.(false);miseAJourBandeau();bridge()?.viderCache?.();
    const parts=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).formatToParts(new Date());
    const v=x=>parts.find(p=>p.type===x)?.value;
    await bridge()?.allerMois?.(v('year')+'-'+v('month'));
  }
  async function reprendreOuRecommencer(p) {
    return modalComposant('dialogue', 'Un panier existe déjà', (objet, finir) => {
      objet.classList.add('lcdp-panier-existant');
      const carte = objet.querySelector('.lcdp-box-dialogue-bouton__card');
      const titre = objet.querySelector('[data-lcdp-dialogue-title]');
      const texte = objet.querySelector('[data-lcdp-dialogue-text]');
      const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
      if (!carte || !titre || !texte || !actions) throw Error('Dialogue de panier incomplet.');
      const style = elem('style');
      style.textContent = `
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__card{box-sizing:border-box;position:relative;width:100%;max-width:480px;margin:auto;padding:32px 30px 29px;border:1px solid #eee;border-radius:28px;background:#fff;box-shadow:0 24px 50px #0002;text-align:center;color:#292524}
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__close{position:absolute;top:20px;right:20px;display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:50%;background:#f5f5f4;color:#a8a29e;font-size:23px;cursor:pointer}
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__close:hover{background:#e7e5e4;color:#44403c}
        .lcdp-panier-existant__icone{display:grid;place-items:center;box-sizing:border-box;width:60px;height:60px;margin:0 auto 22px;border:1px solid #fde68a;border-radius:20px;background:#fffbeb;color:#d97706}
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__title{margin:0;max-width:none;color:#1c1917;font-size:23px;font-weight:900;letter-spacing:-.5px;line-height:1.2}
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__text{margin:7px 0 24px;max-width:none;color:#78716c;font-size:13px;font-weight:600;line-height:1.45}
        .lcdp-panier-existant__recap{box-sizing:border-box;margin-bottom:28px;padding:20px;border:1px solid #e7e5e4;border-radius:20px;background:#fafaf9;text-align:left}
        .lcdp-panier-existant__ligne{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:17px;border-bottom:1px solid #e7e5e4}
        .lcdp-panier-existant__col{min-width:0}.lcdp-panier-existant__col--date{text-align:right}
        .lcdp-panier-existant__legende{display:block;margin-bottom:6px;color:#a8a29e;font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase}
        .lcdp-panier-existant__valeur{display:block;color:#1c1917;font-size:15px;font-weight:850;line-height:1.3}
        .lcdp-panier-existant__col--date .lcdp-panier-existant__valeur{color:#4b6333}
        .lcdp-panier-existant__progres{padding-top:15px}
        .lcdp-panier-existant__progres-ligne{display:flex;justify-content:space-between;gap:10px;font-size:13px;line-height:1.4}
        .lcdp-panier-existant__progres-ligne span{color:#57534e;font-weight:600}
        .lcdp-panier-existant__progres-ligne strong{color:#1c1917;font-weight:850}
        .lcdp-panier-existant__barre{height:10px;margin-top:10px;overflow:hidden;border-radius:999px;background:#e7e5e4}
        .lcdp-panier-existant__remplissage{height:100%;border-radius:inherit;background:#4b6333}
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__actions{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;width:100%}
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__actions .lcdp-button{box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-width:0;max-width:none;margin:0;padding:15px 12px;border-radius:18px;font-family:inherit;line-height:1.3;cursor:pointer}
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__actions .lcdp-button-primary{min-height:58px;border:1px solid #4b6333;background:#4b6333;color:#fff;box-shadow:0 3px 6px #0002;font-size:15px;font-weight:850}
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__actions .lcdp-button-primary:hover{background:#3d5129;border-color:#3d5129}
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__actions .lcdp-button-secondary{min-height:50px;border:1px solid #e7e5e4;background:#fff;color:#57534e;box-shadow:none;font-size:12px;font-weight:750}
        .lcdp-panier-existant .lcdp-box-dialogue-bouton__actions .lcdp-button-secondary:hover{background:#fff1f2;border-color:#fecdd3;color:#be123c}
        .lcdp-panier-existant .lcdp-button:focus-visible,.lcdp-panier-existant .lcdp-box-dialogue-bouton__close:focus-visible{outline:2px solid #4b6333;outline-offset:3px}
        @media(max-width:480px){.lcdp-panier-existant .lcdp-box-dialogue-bouton__card{padding:25px 17px 22px;border-radius:23px}.lcdp-panier-existant__recap{padding:16px 14px}.lcdp-panier-existant__valeur{font-size:13px}.lcdp-panier-existant .lcdp-box-dialogue-bouton__title{font-size:21px}}
      `;
      objet.prepend(style);
      const icone = elem('div', 'lcdp-panier-existant__icone');
      icone.setAttribute('aria-hidden', 'true');
      icone.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 11V7a4 4 0 0 0-8 0v4"/><path d="M5 9h14l1 12H4L5 9z"/></svg>';
      carte.insertBefore(icone, titre);
      texte.textContent = 'Vous avez une sélection en attente de validation.';
      const recap = elem('div', 'lcdp-panier-existant__recap');
      const ligne = elem('div', 'lcdp-panier-existant__ligne');
      const formule = elem('div', 'lcdp-panier-existant__col');
      formule.append(elem('span', 'lcdp-panier-existant__legende', 'Formule'),
        elem('strong', 'lcdp-panier-existant__valeur', 'Abonnement ' + nomFormule(p.formule)));
      const date = elem('div', 'lcdp-panier-existant__col lcdp-panier-existant__col--date');
      date.append(elem('span', 'lcdp-panier-existant__legende', 'Début prévu'),
        elem('strong', 'lcdp-panier-existant__valeur', dateLibelle(p.dateDebut)));
      ligne.append(formule, date);
      const nombre = Math.max(0, Number(p.nbSelectionnes) || 0);
      const total = Math.max(0, Number(p.nbAccesRequis) || 0);
      const progres = elem('div', 'lcdp-panier-existant__progres');
      const nombres = elem('div', 'lcdp-panier-existant__progres-ligne');
      nombres.append(elem('span', '', 'Accès planifiés'), elem('strong', '', nombre + ' sur ' + total));
      const barre = elem('div', 'lcdp-panier-existant__barre');
      barre.setAttribute('role', 'progressbar');
      barre.setAttribute('aria-label', 'Accès planifiés');
      barre.setAttribute('aria-valuemin', '0');
      barre.setAttribute('aria-valuemax', String(total));
      barre.setAttribute('aria-valuenow', String(Math.min(nombre, total)));
      const rempli = elem('div', 'lcdp-panier-existant__remplissage');
      rempli.style.width = (total ? Math.min(100, nombre / total * 100) : 0) + '%';
      barre.append(rempli);
      progres.append(nombres, barre);
      recap.append(ligne, progres);
      carte.insertBefore(recap, actions);
      actions.replaceChildren();
      const reprendre = bouton('Reprendre ce panier', true);
      reprendre.insertAdjacentHTML('beforeend', '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7l5 5-5 5M18 12H6"/></svg>');
      reprendre.addEventListener('click', () => finir('reprendre'));
      const annuler = bouton('Annuler ce panier et recommencer');
      annuler.addEventListener('click', () => finir('recommencer'));
      actions.append(reprendre, annuler);
    });
  }
  async function demarrer(contexte={}){
    if(!['sans_abonnement','jour_hors_couverture','horizon'].includes(contexte.origine)){
      await bridge()?.alerter?.('Cette entrée ABO-RÉZA n’est pas encore raccordée.');return;
    }
    if(occupe)return;
    occupe=true;
    try{
      afficherAttenteFormules();
      await chargerTemplates();
      const enCours=(await api('/panier')).panier;
      if(enCours){
        masquerAttenteFormules();
        const decision=await reprendreOuRecommencer(enCours);
        if(decision==='reprendre'){
          await entrerDansCalendrier(enCours);
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
      // Pendant le POST, le planning ne doit jamais réapparaître entre deux étapes.
      afficherAttenteFormules('Préparation de vos accès…');
      const nouveau=(await api('/panier','POST',{
        ...demande,origine:contexte.origine,inclureExistants,
        ...(contexte.origine==='jour_hors_couverture'?{dateCible:contexte.date}:{}),
        ...(contexte.origine==='horizon'?{moisCible:contexte.moisCible}:{}),
      })).panier;
      const suivant=await informerContrainte(nouveau);
      if(!suivant)return; // Le panier reste récupérable.
      await entrerDansCalendrier(nouveau);
    } catch(e){await bridge()?.alerter?.(e.message||'Erreur ABO-RÉZA.');}
    finally{masquerAttenteFormules();occupe=false;}
  }
  async function selectionnerAcces(choix){
    if(!courant||occupe)return;
    occupe=true;
    afficherAttenteFormules('Enregistrement de votre accès…');
    try{
      const avant=courant.moisActif;
      const reponse=await api('/acces','POST',{idpanier:courant.idpanier,
        idparc:String(choix.parc.idparc||choix.parc.id||''),date:choix.dateIso,plagebookd:choix.plagebookd});
      courant=reponse.panier;
      bridge()?.fermerJour?.();bridge()?.viderCache?.();miseAJourBandeau();
      // L'actualisation peut se faire derrière l'alerte ; elle ne retarde plus le bouton Payer.
      const miseAJour = Promise.resolve().then(() => courant.moisActif!==avant
        ? bridge()?.allerMois?.(courant.moisActif)
        : bridge()?.actualiser?.()
      ).catch(erreur => console.error('Actualisation du planning ABO-RÉZA :', erreur));
      if(courant.complet){
        masquerAttenteFormules();
        const confirmation = await bridge()?.alerter?.(
          'Les accès obligatoires sont sélectionnés. Votre panier est prêt pour paiement.',
          { libelleBouton: 'Payer' }
        );
        // La croix ferme le dialogue et conserve le panier, sans lancer Paiement.
        if(confirmation===true)await afficherRecap(courant);
        await miseAJour;
      }else{
        await miseAJour;
        masquerAttenteFormules();
        const texte=courant.moisActif!==avant
          ? `Les deux accès de ${moisLibelle(avant)} sont sélectionnés. Passage à ${moisLibelle(courant.moisActif)}.`
          : `Accès ajouté. Il vous reste ${courant.restantsMois} accès à réserver pour ${moisLibelle(courant.moisActif)}.`;
        await bridge()?.alerter?.(texte);
      }
    }finally{masquerAttenteFormules();occupe=false;}
  }
  async function afficherRecap(p) {
    if (typeof window.LCDP_PAIEMENT?.ouvrirBonCommande !== 'function') {
      await bridge()?.alerter?.('Le bon de commande n’est pas disponible. Votre panier reste récupérable.');
      return;
    }
    afficherAttenteFormules('Préparation du bon de commande…');
    try {
      // Le picto disparaît lorsque le bon de commande est affiché, pas lorsqu'il est fermé.
      await window.LCDP_PAIEMENT.ouvrirBonCommande(p.idpanier, masquerAttenteFormules);
    } catch (e) {
      masquerAttenteFormules();
      await bridge()?.alerter?.(e.message || 'Bon de commande indisponible.');
    } finally {
      masquerAttenteFormules();
    }
  }
  function datePossible(d){return Boolean(courant && d.slice(0,7)===courant.moisActif && d>=courant.dateDebut&&d<=courant.dateFin);}
  function accesDejaChoisi(date,plage){return courant?.acces?.some(a=>a.dateacces===date&&a.plagebookd===plage);}
  function marquerAccesProvisoires(card,date){
    if(!courant)return;
    const idparc=card.dataset.idparc;
    courant.acces.filter(a=>a.dateacces===date&&a.idparc===idparc).forEach(a=>{
      if(a.origine==='existant')return;
      const slot=card.querySelector('[data-lcdp-card-jour-mois-slot="'+a.plagebookd+'"]');
      if(slot){slot.classList.add('lcdp-planifier-plage--acces-personnel');slot.title+=' · Accès provisoire ABO-RÉZA';}
    });
  }
  window.LCDP_ABOREZA={actif:()=>Boolean(courant),panier:()=>courant,demarrer,selectionnerAcces,datePossible,accesDejaChoisi,marquerAccesProvisoires};
  window.LCDP_ouvrirAboReza=demarrer;

  // Présentation de l'étape 2 : seul le texte défile. Le bouton PLANIFIER et
  // son écouteur restent à leur place dans le DOM, en dehors de cette zone.
  function organiserEtape2Planification() {
    document.querySelectorAll('.lcdp-box-workflow-abonnement').forEach((workflow) => {
      const titre = workflow.querySelector('.lcdp-box-dialogue-bouton__title');
      if (!titre || !/planifiez\s+à\s+la\s+commande/i.test(titre.textContent || '')) return;
      const actions = workflow.querySelector('.lcdp-box-dialogue-bouton__actions');
      if (!actions || actions.classList.contains('lcdp-aboreza-etape2-actions')) return;
      const boutonPlanifier = Array.from(actions.children).find((element) =>
        element.tagName === 'BUTTON' && /planifier/i.test(element.textContent || '')
      );
      if (!boutonPlanifier) return;
      const informations = document.createElement('div');
      informations.className = 'lcdp-aboreza-etape2-informations';
      Array.from(actions.childNodes).forEach((noeud) => {
        if (noeud !== boutonPlanifier) informations.appendChild(noeud);
      });
      actions.insertBefore(informations, boutonPlanifier);
      actions.classList.add('lcdp-aboreza-etape2-actions');
      workflow.classList.add('lcdp-aboreza-etape2');
    });
  }

  // Pendant un panier ABO-RÉZA actif, le calendrier du jour propose une
  // sélection puis une validation explicite, sans ouvrir un deuxième dialogue
  // de confirmation derrière la fenêtre. Hors ABO-RÉZA, le comportement du
  // calendrier et de RÉZABO demeure inchangé.
  function installerValidationPlageAbonnement() {
    if (!window.LCDP_ABOREZA?.actif?.()) return;
    const slot = document.getElementById('lcdp-planifier-jour-overlay-slot');
    const grille = slot?.querySelector('[data-lcdp-calendrier-jour-grid]');
    const carte = slot?.querySelector('.lcdp-box-calendrier-jour__card');
    if (!grille || !carte || grille.dataset.lcdpAboValidation === '1') return;
    grille.dataset.lcdpAboValidation = '1';
    slot.classList.add('lcdp-aboreza-choix-jour');

    const bloc = elem('div', 'lcdp-aboreza-choix-validation');
    const indication = elem('p', 'lcdp-aboreza-choix-validation__aide',
      'Sélectionnez une plage horaire pour continuer.');
    const valider = elem('button', 'lcdp-button lcdp-button-orange lcdp-aboreza-choix-validation__bouton',
      'Valider cette plage');
    valider.type = 'button';
    valider.disabled = true;
    const message = elem('p', 'lcdp-aboreza-choix-validation__message');
    message.setAttribute('role', 'alert');
    message.hidden = true;
    bloc.append(indication, valider, message);
    grille.after(bloc);

    let selection = null;
    let enCours = false;
    // Capture avant le listener du bouton original, pour éviter deux
    // validations concurrentes et le dialogue masqué sous le calendrier.
    grille.addEventListener('click', (event) => {
      if (!window.LCDP_ABOREZA?.actif?.() || enCours) return;
      const cible = event.target instanceof Element
        ? event.target.closest('[data-lcdp-card-heure-jour]') : null;
      if (!cible || !grille.contains(cible) || cible.disabled || cible.dataset.indisponible) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const idparc = String(cible.dataset.idparc || '');
      const dateIso = String(cible.dataset.date || '');
      const plagebookd = String(cible.dataset.plagebookd || '');
      if (!idparc || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || !/^plage[1-5]$/.test(plagebookd)) {
        selection = null;
        valider.disabled = true;
        message.textContent = 'Données de la plage incomplètes. Réouvrez la journée.';
        message.hidden = false;
        return;
      }
      selection = { parc: { idparc }, dateIso, plagebookd };
      grille.querySelectorAll('[data-lcdp-card-heure-jour]').forEach((bouton) => {
        const retenu = bouton === cible;
        bouton.classList.toggle('lcdp-aboreza-choix-validation--retenue', retenu);
        bouton.setAttribute('aria-pressed', String(retenu));
      });
      indication.textContent = 'Plage choisie : ' + (cible.textContent || '').trim();
      message.hidden = true;
      message.textContent = '';
      valider.disabled = false;
    }, true);

    valider.addEventListener('click', async () => {
      if (!selection || enCours || !window.LCDP_ABOREZA?.actif?.()) return;
      enCours = true;
      valider.disabled = true;
      valider.textContent = 'Enregistrement…';
      message.hidden = true;
      try {
        const avant = Number(window.LCDP_ABOREZA?.panier?.()?.nbSelectionnes);
        // Le traitement métier reste dans ABO-RÉZA : /acces, état du panier,
        // actualisation du planning, passage au mois suivant ou paiement.
        await window.LCDP_ABOREZA.selectionnerAcces(selection);
        const apres = Number(window.LCDP_ABOREZA?.panier?.()?.nbSelectionnes);
        if (slot.isConnected && Number.isFinite(avant) && Number.isFinite(apres) && apres <= avant) {
          throw new Error('Cet accès n’a pas été enregistré. Vérifiez les disponibilités.');
        }
      } catch (erreur) {
        if (slot.isConnected) {
          message.textContent = String(erreur?.message || 'Impossible d’enregistrer cet accès.');
          message.hidden = false;
        }
      } finally {
        enCours = false;
        if (slot.isConnected) {
          valider.textContent = 'Valider cette plage';
          valider.disabled = !selection;
        }
      }
    });
  }

  // Un observateur unique pour les deux présentations dynamiques du tunnel.
  function demarrerPresentationAboReza() {
    const actualiser = () => {
      organiserEtape2Planification();
      installerValidationPlageAbonnement();
    };
    actualiser();
    const observateur = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) actualiser();
    });
    observateur.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrerPresentationAboReza, { once: true });
  } else {
    demarrerPresentationAboReza();
  }
})();