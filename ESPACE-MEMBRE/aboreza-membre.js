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

  // Attente : réutilisation du pictowait et du masque générique de PLANIFIER.
  function afficherAttenteFormules() {
    if (attenteFormules?.isConnected) return;
    const masque = elem('div', 'lcdp-planifier-partage-attente');
    masque.setAttribute('role', 'status');
    masque.setAttribute('aria-label', 'Chargement des formules d’abonnement');
    const attente = elem('div', 'lcdp-pictowait');
    attente.dataset.lcdpPictowait = '';
    const image = elem('img', 'lcdp-pictowait__image');
    image.src = cheminObjet('/BOX/pictowait.gif');
    image.alt = '';
    image.width = 56;
    image.height = 56;
    image.setAttribute('aria-hidden', 'true');
    attente.append(image);
    masque.append(attente);
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
    return new Promise(resolve => {
      const modele = type === 'calendrier' ? composants.calendrier : composants.dialogue;
      const { workflow, objet } = monterWorkflow(modele, type === 'calendrier' ? 'calendrier-an' : 'confirmation', titre);
      const titreElement = objet.querySelector(type === 'calendrier' ? '[data-lcdp-calendrier-an-title]' : '[data-lcdp-dialogue-title]');
      const fermeture = objet.querySelector(type === 'calendrier' ? '[data-lcdp-calendrier-an-close]' : '[data-lcdp-dialogue-close]');
      if (!titreElement || !fermeture) throw Error('Structure du dialogue générique incomplète.');
      titreElement.textContent = titre;
      if (type === 'dialogue') objet.classList.add('lcdp-workflow-abonnement-box--confirmation');
      let clos = false;
      const precedent = document.activeElement;
      const finir = valeur => {
        if (clos) return;
        clos = true;
        workflow.removeEventListener('keydown', esc);
        workflow.remove();
        if (precedent?.isConnected && typeof precedent.focus === 'function') precedent.focus();
        resolve(valeur);
      };
      const esc = evenement => { if (evenement.key === 'Escape') { evenement.preventDefault(); finir(null); } };
      fermeture.addEventListener('click', () => finir(null));
      workflow.addEventListener('click', evenement => { if (evenement.target === workflow) finir(null); });
      workflow.addEventListener('keydown', esc);
      installer(objet, finir);
      document.body.append(workflow);
      fermeture.focus();
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
        finir({ formule: choix.value, dateDebut: entree.value });
      });
      actions.append(continuer);
    });
  }
  async function informerContrainte(p) {
    return modalComposant('dialogue', 'Préparez vos accès', (objet, finir) => {
      const texte = objet.querySelector('[data-lcdp-dialogue-text]');
      const actions = objet.querySelector('[data-lcdp-dialogue-actions]');
      if (!texte || !actions) throw Error('Zones du dialogue générique absentes.');
      texte.hidden = true;

      // La carte de présentation d'abonnement fournie sert de récapitulatif compact.
      const resume = composants.carte.cloneNode(true);
      const ligne = resume.querySelector('.lcdp-box-card-abonnement__row--main');
      const nom = resume.querySelector('[data-lcdp-card-abonnement-type]');
      const debut = resume.querySelector('[data-lcdp-card-abonnement-debut]');
      if (!ligne || !nom || !debut) throw Error('Carte d’abonnement générique incomplète.');
      resume.replaceChildren(ligne);
      ligne.querySelector('.lcdp-box-card-abonnement__item--name .lcdp-box-card-abonnement__label').textContent = 'Abonnement choisi : ';
      ligne.querySelector('.lcdp-box-card-abonnement__item--date .lcdp-box-card-abonnement__label').textContent = 'Date de début : ';
      nom.textContent = nomFormule(p.formule);
      debut.textContent = dateLibelle(p.dateDebut);
      actions.append(resume);

      const informations = [
        'Si vous devez planifier plusieurs accès, vous pouvez changer de parc chaque fois que vous revenez sur le planning.',
        'Pour les abonnements supérieurs à un jour, vous devez planifier deux accès par mois, chaque mois, dans la limite de cinq mois consécutifs. Le planning évolue de mois en mois pour vous assister dans cette planification.',
        'À chaque accès planifié, vous disposez de 15 minutes jusqu’à l’étape suivante (nouvel accès ou paiement de l’abonnement).'
      ];
      if (p.nbDejaReserves > 0) informations.push(
        `${p.nbSelectionnes} accès requis déjà couverts ; il reste ${Math.max(0, p.nbAccesRequis - p.nbSelectionnes)} accès à planifier.`
      );
      for (const information of informations) {
        actions.append(elem('p', 'lcdp-box-champ-formulaire__description', information));
      }
      const continuer = bouton('Continuer', true);
      continuer.addEventListener('click', () => finir(true));
      actions.append(continuer);
    });
  }
  function miseAJourBandeau() {
    const hote = bridge()?.hoteBandeau?.();
    if (!hote) return;
    if (!courant) { bandeau?.remove(); bandeau = null; return; }
    if (!bandeau) {
      bandeau = composants.carte.cloneNode(false);
      bandeau.setAttribute('aria-live', 'polite');
      hote.append(bandeau);
    }
    bandeau.replaceChildren();
    const main = elem('div', 'lcdp-box-card-abonnement__row lcdp-box-card-abonnement__row--main');
    const name = elem('div', 'lcdp-box-card-abonnement__item lcdp-box-card-abonnement__item--name');
    name.append(elem('span', 'lcdp-box-card-abonnement__label', 'ABO-RÉZA — '));
    name.append(elem('span', 'lcdp-box-card-abonnement__value', nomFormule(courant.formule)));
    main.append(name);
    bandeau.append(main);
    const prog = elem('div', 'lcdp-box-card-abonnement__row');
    const mention = elem('div', 'lcdp-box-card-abonnement__item');
    const m = courant.mois.find(x => x.mois === courant.moisActif);
    mention.append(elem('span', 'lcdp-box-card-abonnement__mention', courant.complet
      ? `Panier prêt : ${courant.nbSelectionnes} accès sur ${courant.nbAccesRequis}.`
      : `${moisLibelle(courant.moisActif)} : ${m?.selectionnes || 0}/${m?.attendu || 2} accès. Il reste ${m?.restants || 0} accès sur ce mois.`));
    if (courant.expirationCommande) {
      mention.append(elem('span', 'lcdp-box-card-abonnement__mention',
        'Retenues valides jusqu’à ' + new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(courant.expirationCommande)) + '.'));
    }
    prog.append(mention);
    const commandes = elem('div', 'lcdp-box-card-abonnement__actions');
    const quitter = elem('button', 'lcdp-box-card-abonnement__micro-action', 'Quitter ABO-RÉZA sans supprimer le panier');
    quitter.type = 'button';
    quitter.addEventListener('click', () => quitterTunnel().catch(e => bridge()?.alerter?.(e.message)));
    commandes.append(quitter);
    prog.append(commandes);
    bandeau.append(prog);
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
    try{
      const avant=courant.moisActif;
      const reponse=await api('/acces','POST',{idpanier:courant.idpanier,
        idparc:String(choix.parc.idparc||choix.parc.id||''),date:choix.dateIso,plagebookd:choix.plagebookd});
      courant=reponse.panier;
      bridge()?.fermerJour?.();bridge()?.viderCache?.();miseAJourBandeau();
      if(courant.moisActif!==avant)await bridge()?.allerMois?.(courant.moisActif);
      else await bridge()?.actualiser?.();
      if(courant.complet){
        await bridge()?.alerter?.('Les accès obligatoires sont sélectionnés. Votre panier est prêt pour paiement.');
        await afficherRecap(courant);
      }else{
        const texte=courant.moisActif!==avant
          ? `Les deux accès de ${moisLibelle(avant)} sont sélectionnés. Passage à ${moisLibelle(courant.moisActif)}.`
          : `Accès ajouté. Il vous reste ${courant.restantsMois} accès à réserver pour ${moisLibelle(courant.moisActif)}.`;
        await bridge()?.alerter?.(texte);
      }
    }finally{occupe=false;}
  }
  async function afficherRecap(p) {
    if (typeof window.LCDP_PAIEMENT?.ouvrirBonCommande !== 'function') {
      await bridge()?.alerter?.('Le bon de commande n’est pas disponible. Votre panier reste récupérable.');
      return;
    }
    try {
      // La synthèse est exclusivement rendue par les composants génériques du sous-tunnel Paiement.
      await window.LCDP_PAIEMENT.ouvrirBonCommande(p.idpanier);
    } catch (e) {
      await bridge()?.alerter?.(e.message || 'Bon de commande indisponible.');
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
})();
