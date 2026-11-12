/* La Clé du Parc — Paiement, étape 1 : lecture du bon de commande.
 * Composition exclusive de 04-box-workflow-abonnement.html et
 * 04-box-card-recaporder.html (OBJET/BOX).
 * Les prix et la validation proviennent exclusivement de w-paiement.js.
 */
(() => {
  'use strict';
  const config = window.SITE_CONFIG || {};
  const endpoint = String(config.workerAboRezaUrl || config.WORKER_ABOREZA_URL ||
    (typeof config.apiUrl === 'function' ? config.apiUrl('aboreza-api') : 'https://aboreza-api.lacleduparc.fr'))
    .replace(/\/+$/, '');
  const endpointPaiement = String(config.workerPaiementUrl || config.WORKER_PAIEMENT_URL ||
    (typeof config.apiUrl === 'function' ? config.apiUrl('paiement-api') : 'https://paiement-api.lacleduparc.fr'))
    .replace(/\/+$/, '');
  const nomFormule = { '1J': '1 jour', '1M': '1 mois', '3M': '3 mois', '5M': '5 mois',
    '10M': '10 mois', '11M': '11 mois', '12M': '1 an' };
  const plages = { plage1: '6 h – 10 h', plage2: '10 h – 13 h', plage3: '13 h – 17 h',
    plage4: '17 h – 21 h', plage5: '21 h – 2 h' };
  const formatDate = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'
  });
  const formatHeure = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  });
  let composants = null;
  let ouverture = null;
  const EURO = new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'});

  function cheminObjet(chemin) {
    if (typeof window.LCDP_urlObjet === 'function') return window.LCDP_urlObjet(chemin);
    if (typeof config.objetUrl === 'function') return config.objetUrl(chemin);
    const base = String(config.objetBaseUrl || config.OBJET_BASE || '').replace(/\/+$/, '');
    if (!base) throw new Error('Adresse des composants OBJET non configurée.');
    return base + '/' + chemin.replace(/^\/+/, '');
  }

  async function chargerObjet(chemin, selecteur) {
    const reponse = await fetch(cheminObjet(chemin), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!reponse.ok) throw new Error('Composant introuvable : ' + chemin);
    const documentObjet = new DOMParser().parseFromString(await reponse.text(), 'text/html');
    const racine = documentObjet.querySelector(selecteur);
    if (!racine) throw new Error('Structure du composant absente : ' + chemin);
    return racine;
  }

  async function obtenirComposants() {
    if (!composants) {
      composants = Promise.all([
        chargerObjet('/HTMLBASE/04-workflow-abonnement.html', '[data-lcdp-box-workflow-abonnement]'),
        chargerObjet('/HTMLBASE/04-card-recaporder.html', '[data-lcdp-box-card-recaporder]')
      ]).catch(erreur => { composants = null; throw erreur; });
    }
    return composants;
  }

  function dateLisible(iso) {
    const valeur = String(iso || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(valeur)
      ? formatDate.format(new Date(valeur + 'T12:00:00Z')) : valeur || '—';
  }

  function remplir(racine, selecteur, valeur) {
    const champ = racine.querySelector(selecteur);
    if (!champ) throw new Error('Champ manquant dans le composant : ' + selecteur);
    champ.textContent = String(valeur);
    return champ;
  }

  function ajouterLigne(liste, intitule, valeur) {
    // Une ligne clonée du modèle de récapitulatif, pas de style supplémentaire.
    const modele = liste.querySelector('.lcdp-box-card-recaporder__row');
    if (!modele) throw new Error('Lignes du récapitulatif introuvables.');
    const ligne = modele.cloneNode(false);
    const titre = document.createElement('dt');
    titre.textContent = intitule;
    const valeurElement = document.createElement('dd');
    valeurElement.textContent = valeur;
    ligne.append(titre, valeurElement);
    return ligne;
  }

  async function apiPaiement(route, options = {}) {
    const reponse = await fetch(endpointPaiement + route, {
      credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...options
    });
    const donnees = await reponse.json().catch(() => null);
    if (!reponse.ok || !donnees?.ok)
      throw new Error(donnees?.message || 'Le service Paiement est indisponible.');
    return donnees;
  }

  async function lireDevis(idpanier) {
    const reponse = await apiPaiement('/devis?idpanier=' + encodeURIComponent(idpanier));
    return reponse.devis;
  }

  async function lirePanier(idpanier) {
    const reponse = await fetch(endpoint + '/panier', {
      credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' }
    });
    const retour = await reponse.json().catch(() => null);
    if (!reponse.ok || retour?.ok !== true) {
      throw new Error(retour?.message || 'Impossible de relire le panier Aboresa.');
    }
    const panier = retour.panier;
    if (!panier || panier.idpanier !== idpanier) {
      throw new Error('Le panier demandé ne correspond pas au panier actif.');
    }
    // Une commande déjà transmise à Stripe reste reprenable tant que ses
    // retenues sont valides. Le serveur Paiement reste seul juge de l'état
    // de la session et du règlement lors de /valider.
    if (!['pret_paiement', 'transmis_paiement'].includes(panier.statut) ||
        panier.complet !== true ||
        Number(panier.nbSelectionnes) < Number(panier.nbAccesRequis)) {
      throw new Error('Le panier doit être complété avant la synthèse.');
    }
    if (panier.expirationCommande && Date.parse(panier.expirationCommande) <= Date.now()) {
      throw new Error('Les retenues ont expiré. Reprenez le panier Aboresa.');
    }
    return panier;
  }

  // Présentation uniquement : conserve les nœuds portant les valeurs du devis
  // et les boutons déjà raccordés au paiement Stripe.
  function presenterBonCommande(recap, panier, devis, zone, liste, message, boutonPayer) {
    const carte = recap.querySelector('.lcdp-box-card-recaporder__card');
    const titre = recap.querySelector('.lcdp-box-card-recaporder__title');
    const liens = recap.querySelector('.lcdp-box-card-recaporder__links');
    const actions = recap.querySelector('.lcdp-box-card-recaporder__actions');
    if (!carte || !titre || !liens || !actions) throw new Error('Structure du bon de commande incomplète.');
    recap.classList.add('lcdp-paiement-refonte');

    const creer = (tag, classe, texte) => {
      const noeud = document.createElement(tag);
      if (classe) noeud.className = classe;
      if (texte !== undefined) noeud.textContent = String(texte);
      return noeud;
    };
    const entete = creer('header', 'lcdp-paiement-refonte__entete');
    titre.textContent = 'RÉCAPITULATIF';
    const abonnement = creer('div', 'lcdp-paiement-refonte__abonnement');
    abonnement.append(
      creer('span', '', 'Nouvel abonnement'),
      creer('strong', '', panier.formule || '—')
    );
    const nombreAcces = creer('p', 'lcdp-paiement-refonte__nombre-acces',
      String(panier.nbSelectionnes) + ' accès planifiés à la commande');
    entete.append(titre, abonnement, nombreAcces);

    const contenu = creer('div', 'lcdp-paiement-refonte__contenu');
    const resume = creer('section', 'lcdp-paiement-refonte__resume');
    const donnees = [
      ['Début prévu', dateLisible(panier.dateDebut)],
      ['Fin prévue', dateLisible(panier.dateFin)]
    ];
    for (const [intitule, valeur] of donnees) {
      const champ = creer('div', 'lcdp-paiement-refonte__resume-champ');
      champ.append(creer('span', '', intitule), creer('strong', '', valeur));
      resume.append(champ);
    }
    contenu.append(resume);

    const sectionAcces = creer('section', 'lcdp-paiement-refonte__section');
    sectionAcces.append(creer('h3', 'lcdp-paiement-refonte__rubrique', 'Accès planifiés à la commande'));
    const listeAcces = creer('div', 'lcdp-paiement-refonte__acces');
    (Array.isArray(panier.acces) ? panier.acces : []).forEach(acces => {
      const ligne = creer('div', 'lcdp-paiement-refonte__acces-ligne');
      const horaire = plages[acces.plagebookd] || acces.plagebookd || 'Horaire non renseigné';
      const parc = acces.nomparc || ('Parc ' + (acces.idparc || 'non renseigné'));
      ligne.append(
        creer('strong', 'lcdp-paiement-refonte__date', dateLisible(acces.dateacces)),
        creer('span', 'lcdp-paiement-refonte__acces-heure', horaire),
        creer('span', 'lcdp-paiement-refonte__acces-parc', parc)
      );
      listeAcces.append(ligne);
    });
    sectionAcces.append(listeAcces);
    contenu.append(sectionAcces);

    // Les abonnements intégrés sont explicitement conservés lorsqu'ils existent.
    const inclus = [...liste.querySelectorAll('.lcdp-box-card-recaporder__row')].filter(row =>
      row.querySelector('dt')?.textContent?.trim() === 'Abonnement existant inclus');
    if (inclus.length) {
      const sectionInclus = creer('section', 'lcdp-paiement-refonte__section');
      sectionInclus.append(creer('h3', 'lcdp-paiement-refonte__rubrique', 'Abonnements inclus'));
      const listeInclus = creer('div', 'lcdp-paiement-refonte__inclusions');
      inclus.forEach(row => {
        listeInclus.append(creer('p', '', row.querySelector('dd')?.textContent || 'Détails non disponibles'));
      });
      sectionInclus.append(listeInclus);
      contenu.append(sectionInclus);
    }

    const prix = creer('section', 'lcdp-paiement-refonte__prix');
    const masquerDansPrix = row => {
      const intitule = row.querySelector('dt')?.textContent?.trim() || '';
      return intitule === 'Abonnement choisi' || intitule === 'Début' ||
        intitule === 'Fin' || intitule === 'Accès obligatoires' ||
        intitule === 'Abonnement existant inclus' || /^Accès \d+$/.test(intitule);
    };
    [...liste.children].forEach(row => { if (masquerDansPrix(row)) row.remove(); });
    prix.append(liste);
    contenu.append(prix);

    const paiement = creer('section', 'lcdp-paiement-refonte__section lcdp-paiement-refonte__paiement');
    paiement.append(creer('h3', 'lcdp-paiement-refonte__rubrique', 'Mode de règlement'));
    zone.querySelectorAll('.lcdp-workflow-paiement__option').forEach(label => {
      const input = label.querySelector('input');
      const valeur = input?.value;
      const texte = label.querySelector('.lcdp-workflow-paiement__option-text');
      if (!input || !texte) return;
      const details = creer('span', 'lcdp-paiement-refonte__option-details');
      texte.textContent = valeur === 'comptant'
        ? (devis.totalTtc === 0 ? 'Aucun règlement supplémentaire' : 'Règlement en une fois')
        : 'Paiement échelonné';
      details.append(texte);
      if (valeur === 'comptant' && devis.remiseComptantTtc > 0) {
        details.append(creer('small', '', 'Économisez ' + EURO.format(devis.remiseComptantTtc) + ' immédiatement'));
      } else if (valeur === 'echeances' && Array.isArray(devis.echeances) && devis.echeances.length) {
        details.append(creer('small', '', 'Première échéance aujourd’hui'));
      }
      const montant = valeur === 'echeances' && Array.isArray(devis.echeances)
        ? devis.echeances[0] : devis.totalTtc;
      const prixOption = creer('strong', 'lcdp-paiement-refonte__option-prix',
        EURO.format(Number(montant) || 0));
      const boutonRadio = creer('span', 'lcdp-paiement-refonte__radio');
      boutonRadio.setAttribute('aria-hidden', 'true');
      label.replaceChildren(input, boutonRadio, details, prixOption);
      input.addEventListener('change', () => {
        boutonPayer.textContent = (devis.totalTtc === 0 && valeur === 'comptant')
          ? 'Valider la commande'
          : 'Payer ' + EURO.format(valeur === 'echeances' ? devis.echeances[0] : devis.totalTtc);
      });
    });
    if (devis.totalTtc !== 0) boutonPayer.textContent = 'Payer ' + EURO.format(devis.totalTtc);
    paiement.append(zone);
    contenu.append(paiement);
    contenu.append(liens);

    const pied = creer('footer', 'lcdp-paiement-refonte__pied');
    pied.append(actions);
    carte.replaceChildren(entete);
    if (message) {
      message.classList.add('lcdp-paiement-refonte__message');
      entete.after(message);
    }
    carte.append(contenu, pied);
  }

  function monterBon(workflowModele, recapModele, panier, devis, paiement) {
    const workflow = workflowModele.cloneNode(true);
    const recap = recapModele.cloneNode(true);
    workflow.classList.add('lcdp-box-workflow-abonnement--recapitulatif');
    workflow.setAttribute('aria-labelledby', 'lcdp-paiement-recap-titre');
    workflow.tabIndex = -1;
    // La boîte de récapitulatif est une étape dans la boîte de workflow, et non un second dialogue modal.
    recap.removeAttribute('role');
    recap.removeAttribute('aria-modal');
    recap.classList.add('lcdp-workflow-abonnement-box', 'lcdp-workflow-abonnement-box--recapitulatif');
    const titre = recap.querySelector('.lcdp-box-card-recaporder__title');
    if (!titre) throw new Error('Titre du récapitulatif manquant.');
    titre.id = 'lcdp-paiement-recap-titre';
    titre.textContent = 'Bon de commande';

    remplir(recap, '[data-lcdp-recaporder-abonnement]',
      'Abonnement ' + (nomFormule[panier.formule] || panier.formule || '—'));
    remplir(recap, '[data-lcdp-recaporder-debut]', dateLisible(panier.dateDebut));
    remplir(recap, '[data-lcdp-recaporder-fin]', dateLisible(panier.dateFin));
    // La notion d'invité Famille, présente dans l'ancien composant, n'est pas
    // une propriété du panier PLANIFIER actuellement retourné par Aboresa.
    recap.querySelector('[data-lcdp-recaporder-invites-row]')?.remove();

    const liste = recap.querySelector('.lcdp-box-card-recaporder__list');
    const premiereLignePrix = recap.querySelector('[data-lcdp-recaporder-prix-initial]')?.closest('.lcdp-box-card-recaporder__row');
    if (!liste || !premiereLignePrix) throw new Error('Structure de prix du récapitulatif manquante.');
    const lignes = [];
    lignes.push(ajouterLigne(liste, 'Accès obligatoires',
      `${panier.nbSelectionnes} / ${panier.nbAccesRequis}`));

    const inclus = Array.isArray(panier.detailsAbonnementsInclus) ? panier.detailsAbonnementsInclus : [];
    for (const abonnement of inclus) {
      const ligneIncluse = ajouterLigne(liste, 'Abonnement existant inclus',
        `${abonnement.typeAbonnement || 'Abonnement'} : du ${dateLisible(abonnement.debut)} au ${dateLisible(abonnement.fin)}`);
      ligneIncluse.classList.add('lcdp-box-card-recaporder__row--wide');
      lignes.push(ligneIncluse);
    }
    // Si le serveur fournit uniquement les identifiants, ne pas inventer de dates.
    const nbSansDetail = Math.max(0,
      (Array.isArray(panier.abonnementsInclus) ? panier.abonnementsInclus.length : 0) - inclus.length);
    for (let i = 0; i < nbSansDetail; i++) {
      lignes.push(ajouterLigne(liste, 'Abonnement existant inclus', 'Détails non disponibles'));
    }

    const acces = Array.isArray(panier.acces) ? panier.acces : [];
    acces.forEach((accesMembre, index) => {
      const nomParc = accesMembre.nomparc || ('Parc ' + (accesMembre.idparc || 'non renseigné'));
      const periode = plages[accesMembre.plagebookd] || accesMembre.plagebookd || 'plage non renseignée';
      const statut = accesMembre.origine === 'existant' ? 'déjà réservé' : 'provisoire';
      const ligneAcces = ajouterLigne(liste, 'Accès ' + (index + 1),
        `${dateLisible(accesMembre.dateacces)} · ${periode} · ${nomParc} (${statut})`);
      ligneAcces.classList.add('lcdp-box-card-recaporder__row--wide');
      lignes.push(ligneAcces);
    });
    premiereLignePrix.before(...lignes);

    // Ventilation des privilèges issue exclusivement du devis du Worker.
    const optionsDevis = Array.isArray(devis.options) ? devis.options : [];
    if (optionsDevis.length) {
      premiereLignePrix.before(ajouterLigne(liste, 'Abonnement hors privilèges',
        EURO.format(devis.prixAbonnementTtc)));
      for (const option of optionsDevis) {
        premiereLignePrix.before(ajouterLigne(liste,
          option.code + (Number(option.multiplicateur) > 1
            ? ' × ' + option.multiplicateur : ''),
          EURO.format(Number(option.totalTtc))));
      }
    }

    remplir(recap, '[data-lcdp-recaporder-prix-initial]', EURO.format(devis.prixTtc));
    const prixNet=remplir(recap, '[data-lcdp-recaporder-prix-net]', EURO.format(devis.totalTtc));
    let ligneRemise = null;
    if (devis.remiseComptantTtc > 0) {
      ligneRemise=ajouterLigne(liste, 'Remise paiement comptant',
        '− '+EURO.format(devis.remiseComptantTtc));
      premiereLignePrix.after(ligneRemise);
    }
    if (devis.nombreAbonnementsInclus) {
      premiereLignePrix.before(ajouterLigne(liste, 'Engagements des abonnements intégrés',
        EURO.format(devis.engagementsAnterieursTtc)));
      premiereLignePrix.before(ajouterLigne(liste, 'Montant retenu sur le nouvel abonnement',
        '− ' + EURO.format(devis.creditAbonnementsInclus)));
      if (devis.excedentSansRemboursementTtc>0)
        premiereLignePrix.before(ajouterLigne(liste, 'Écart sans remboursement',
          EURO.format(devis.excedentSansRemboursementTtc)));
    }
    remplir(recap, '[data-lcdp-recaporder-tva-label]', '(TVA ' + devis.tauxTva + ' %)');
    remplir(recap, '[data-lcdp-recaporder-tva-net-label]', '(TVA ' + devis.tauxTva + ' %)');
    // Aucun code de remise n’est géré par ce cycle : ne pas afficher de champ inactif.
    recap.querySelector('.lcdp-box-card-recaporder__row--code')?.remove();
    const boutonPayer = recap.querySelector('[data-lcdp-recaporder-pay]');
    if (!boutonPayer) throw new Error('Bouton Payer du récapitulatif manquant.');
    boutonPayer.textContent = devis.totalTtc === 0 ? 'Valider la commande' : 'Payer';
    const zone = document.createElement('div');
    zone.className = 'lcdp-workflow-paiement';
    zone.setAttribute('role', 'radiogroup');
    zone.setAttribute('aria-label', 'Mode de règlement');
    const options = [
      ['comptant', devis.totalTtc === 0 ? 'Aucun règlement supplémentaire' : 'Règlement en une fois'],
      ...(devis.echelonnePossible ? [['echeances', 'Paiement échelonné (première échéance ' + EURO.format(devis.echeances[0]) + ')']] : [])
    ];
    for(const [valeur, titreOption] of options) {
      const label = document.createElement('label');
      label.className = 'lcdp-workflow-paiement__option';
      const input = document.createElement('input');
      input.type='radio'; input.name='lcdp-paiement-echeancier';input.value=valeur;
      input.checked = valeur === 'comptant';
      const span = document.createElement('span');
      span.className = 'lcdp-workflow-paiement__option-text';
      span.textContent = titreOption;
      input.addEventListener('change',()=>{
        const montant=valeur==='echeances'?devis.totalEchelonneTtc:devis.totalTtc;
        prixNet.textContent=EURO.format(montant);
        if(ligneRemise) ligneRemise.hidden=valeur==='echeances';
      });
      label.append(input,span);zone.append(label);
    }
    recap.querySelector('.lcdp-box-card-recaporder__actions')?.before(zone);
    boutonPayer.addEventListener('click',async()=>{
      if (boutonPayer.disabled) return;
      boutonPayer.disabled = true;
      const precedent = boutonPayer.textContent;
      boutonPayer.textContent = 'Validation…';
      try {
        const echeancier = zone.querySelector('input:checked')?.value || 'comptant';
        const retour = await apiPaiement('/valider',{method:'POST',
          body:JSON.stringify({idpanier:panier.idpanier,echeancier})});
        if (retour.termine && retour.commande?.statut === 'paye') {
          paiement.termine = true;
          window.location.assign(urlMembre('/ESPACE-MEMBRE/accueil-membre.html'));
          return;
        }
        if (!/^https:\/\//.test((retour.paymentPageUrl || retour.checkoutUrl) || ''))
          throw new Error('Adresse de paiement sécurisée indisponible.');
        window.location.assign((retour.paymentPageUrl || retour.checkoutUrl));
      } catch(erreur) {
        afficherMessage(recap,erreur.message);
        boutonPayer.disabled = false;
        boutonPayer.textContent = precedent;
      }
    });

    const boutonAnnuler = recap.querySelector('[data-lcdp-recaporder-cancel]');
    if (boutonAnnuler) boutonAnnuler.textContent = 'Retour au planning';
    // Précédent et Retour au planning avaient exactement la même action :
    // conserver une seule sortie, sans annuler la commande ni les retenues.
    recap.querySelector('[data-lcdp-recaporder-back]')?.remove();
    const actions = recap.querySelector('.lcdp-box-card-recaporder__actions');
    if (actions && boutonAnnuler) actions.replaceChildren(boutonAnnuler, boutonPayer);

    const urlPublic = chemin => typeof window.LCDP_urlPublic === 'function'
      ? window.LCDP_urlPublic(chemin)
      : (typeof config.publicUrl === 'function' ? config.publicUrl(chemin)
        : String(config.publicBaseUrl || config.PUBLIC_BASE || '').replace(/\/+$/, '') + chemin);
    const reglementClub = recap.querySelector('[data-lcdp-recaporder-reglement-club]');
    const reglementApp = recap.querySelector('[data-lcdp-recaporder-reglement-application]');
    if (reglementClub) reglementClub.href = urlPublic('/ESPACE-PUBLIC/reglement-club.html');
    if (reglementApp) reglementApp.href = urlPublic('/ESPACE-PUBLIC/reglement-app.html');
    const cgv = recap.querySelector('[data-lcdp-recaporder-cgv]');
    const urlCgv = String(config.cgvUrl || config.CGV_URL || '').trim();
    if (cgv && urlCgv) {
      // Aucun URL de CGV n’est inventé : seul un lien configuré peut être ouvert.
      const a = document.createElement('a');
      a.href = urlCgv;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = cgv.textContent;
      cgv.replaceWith(a);
    }

    const message = recap.querySelector('[data-lcdp-recaporder-message]');
    if (message) {
      let note = 'Paiement à effectuer.';
      if (panier.expirationCommande) {
        const expiration = new Date(panier.expirationCommande);
        if (Number.isFinite(expiration.getTime())) {
          note = `Commande en cours, valable jusqu’au ${formatHeure.format(expiration)}.\nPaiement à effectuer.`;
        }
      }
      message.textContent = note;
      message.hidden = false;
      // Afficher la durée de validité AVANT le détail de la commande.
      liste.before(message);
    }

    presenterBonCommande(recap, panier, devis, zone, liste, message, boutonPayer);

    const emplacement = workflow.querySelector('[data-lcdp-workflow-abonnement-content]');
    if (!emplacement) throw new Error('Emplacement du workflow abonnement manquant.');
    emplacement.append(recap);
    return workflow;
  }

  // Reprise d'une commande déjà transmise à Stripe : ne pas redemander
  // un devis sur un panier en état transmis_paiement.
  // L'API Paiement décide si la session existante est encore utilisable.
  async function reprendrePaiementTransmis(idpanier) {
    const etat = await apiPaiement('/etat?idpanier=' + encodeURIComponent(idpanier));
    if (etat.commande?.statut === 'paye') {
      window.location.assign(urlMembre('/ESPACE-MEMBRE/accueil-membre.html'));
      return 'paye';
    }
    if (etat.commande?.statut === 'annule') {
      throw new Error('Cette commande est annulée. Revenez au parcours abonnement pour recommencer.');
    }
    const retour = await apiPaiement('/valider', {
      method: 'POST',
      body: JSON.stringify({ idpanier, echeancier: 'comptant' })
    });
    if (retour.termine && retour.commande?.statut === 'paye') {
      window.location.assign(urlMembre('/ESPACE-MEMBRE/accueil-membre.html'));
      return 'paye';
    }
    if (!/^https:\/\//.test((retour.paymentPageUrl || retour.checkoutUrl) || '')) {
      throw new Error(retour.message || 'La session Stripe ne peut pas encore être reprise. Votre commande est conservée.');
    }
    window.location.assign((retour.paymentPageUrl || retour.checkoutUrl));
    return 'checkout';
  }

  async function ouvrirBonCommande(idpanier, surOuverture) {
    if (ouverture) {
      if (typeof surOuverture === 'function') surOuverture();
      return ouverture;
    }
    const traitement = (async () => {
      // Les modèles HTML et les lectures serveur sont indépendants : les charger en parallèle.
      const [[modeleWorkflow, modeleRecap], [panier, devis]] = await Promise.all([
        obtenirComposants(), Promise.all([lirePanier(idpanier), lireDevis(idpanier)])
      ]);
      // Une divergence entre les options du panier et le devis interdit le paiement.
      const optionsPanier = Array.isArray(panier.options) ? panier.options : [];
      const optionsDevis = Array.isArray(devis.options) ? devis.options : [];
      const totalOptions = optionsPanier.reduce((n,o)=>n+Math.round(Number(o.totalTtc)*100),0);
      if (optionsPanier.length !== optionsDevis.length ||
          totalOptions !== Math.round(Number(devis.optionsTtc || 0)*100) ||
          optionsPanier.some(o => !optionsDevis.some(d =>
            d.code === o.code && Math.round(Number(d.totalTtc)*100) === Math.round(Number(o.totalTtc)*100)))) {
        throw new Error('Le devis ne reprend pas exactement les privilèges du panier. Paiement bloqué.');
      }
      const paiement = { termine:false };
      const bonPrepare = monterBon(modeleWorkflow, modeleRecap, panier, devis, paiement);
      // ABO-RÉZA peut déjà porter sa coque persistante : réutiliser cette même
      // BOX générique plutôt que superposer une nouvelle fenêtre de paiement.
      const workflow = window.LCDP_ABOREZA_UI?.adopterPaiement?.(bonPrepare) || bonPrepare;
      const reutilise = workflow !== bonPrepare;
      const boutonRetour = workflow.querySelector('[data-lcdp-recaporder-cancel]');
      const boutonPrecedent = workflow.querySelector('[data-lcdp-recaporder-back]');
      const precedent = document.activeElement;
      if (!workflow.isConnected) (document.getElementById('lcdp-planifier-dialogues-slot') || document.querySelector('.lcdp-planifier-wrapper')).append(workflow);
      if (typeof surOuverture === 'function') surOuverture();
      await new Promise(resolve => {
        let ferme = false;
        const terminer = () => {
          if (ferme) return;
          ferme = true;
          workflow.removeEventListener('keydown', touche);
          if (reutilise) window.LCDP_ABOREZA_UI?.fermer?.();
          else workflow.remove();
          if (!reutilise && precedent?.isConnected && typeof precedent.focus === 'function') precedent.focus();
          resolve();
        };
        const touche = event => {
          if (event.key === 'Escape') { event.preventDefault(); return; }
          if (event.key !== 'Tab') return;
          const focusables = [...workflow.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled)')];
          if (!focusables.length) { event.preventDefault(); workflow.focus(); return; }
          const premier = focusables[0], dernier = focusables[focusables.length - 1];
          if (event.shiftKey && document.activeElement === premier) { event.preventDefault(); dernier.focus(); }
          else if (!event.shiftKey && document.activeElement === dernier) { event.preventDefault(); premier.focus(); }
        };
        boutonRetour?.addEventListener('click', terminer);
        boutonPrecedent?.addEventListener('click', terminer);
        workflow.addEventListener('keydown', touche);
        // Le clic hors du récapitulatif ne ferme jamais le tunnel.
        // Commencer en haut du bon, sans déplacer l’affichage sur le dernier bouton.
        workflow.querySelector('.lcdp-box-workflow-abonnement__card')?.scrollTo(0, 0);
        workflow.focus({ preventScroll: true });
      });
    })();
    ouverture = traitement;
    try { return await traitement; } finally { ouverture = null; }
  }

  function urlMembre(chemin) {
    if(typeof window.LCDP_urlMembre === 'function') return window.LCDP_urlMembre(chemin);
    if(typeof config.membreUrl === 'function') return config.membreUrl(chemin);
    return String(config.membreBaseUrl || 'https://membre.lacleduparc.fr').replace(/\/+$/,'')+chemin;
  }
  function afficherMessage(recap, texte){
    const champ=recap.querySelector('[data-lcdp-recaporder-message]');
    if(champ){champ.textContent=String(texte);champ.hidden=false;}
  }
  async function traiterRetourStripe(){
    const q=new URLSearchParams(location.search);
    if(q.get('paiement')!=='retour')return;
    const id=q.get('idpanier');
    if(!id)return;
    if(q.get('retour')==='success') {
      // Rétrocompatibilité : sessions Stripe créées avant le changement d’URL.
      window.location.replace(urlMembre('/ESPACE-MEMBRE/accueil-membre.html') +
        '?paiement=retour&retour=success&idpanier=' + encodeURIComponent(id));
      return;
    }
    if(q.get('retour')==='cancel'){
      afficherRetourEnAttente('Le paiement n’a pas été effectué. Vous pouvez reprendre la session de paiement tant qu’elle est valide.', id);
      return;
    }
    for(let tentative=0;tentative<8;tentative++){
      try{
        const reponse=await apiPaiement('/etat?idpanier='+encodeURIComponent(id));
        if(reponse.commande?.statut==='paye'){
          window.location.replace(urlMembre('/ESPACE-MEMBRE/accueil-membre.html'));return;
        }
      }catch(e){console.error('État Paiement',e);}
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    afficherRetourEnAttente('Paiement en cours de vérification. Ne recommencez pas le règlement.');
  }
  async function afficherRetourEnAttente(message, panierAReprendre=null){
    try {
      // Le retour de paiement conserve sa propre action, mais partage le profil visuel INFORMATION.
      const urlCss = cheminObjet('/CSSBASE/lcdp-lightbox-convergence.css');
      if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(lien => lien.href === urlCss)) {
        const lien = document.createElement('link');
        lien.rel = 'stylesheet';
        lien.href = urlCss;
        document.head.appendChild(lien);
      }
      const racine = await chargerObjet(
        '/HTMLBASE/02-dialogue-reference-information.html',
        '[data-lcdp-dialogue-reference="information"]'
      );
      const titre = racine.querySelector('[data-lcdp-dialogue-titre]');
      const texte = racine.querySelector('[data-lcdp-dialogue-message]');
      const bouton = racine.querySelector('[data-lcdp-dialogue-action="compris"]');
      if (!titre || !texte || !bouton) throw new Error('Structure INFORMATION paiement incomplète.');
      titre.textContent = panierAReprendre ? 'Reprise du paiement' : 'Vérification du paiement';
      texte.textContent = message;
      const fermer = () => {
        racine.remove();
        window.location.replace(urlMembre('/ESPACE-MEMBRE/accueil-membre.html'));
      };
      if (panierAReprendre) {
        bouton.textContent = 'Reprendre le paiement';
        bouton.addEventListener('click', async () => {
          bouton.disabled = true;
          try {
            const reponse = await apiPaiement('/valider', {
              method: 'POST',
              body: JSON.stringify({idpanier:panierAReprendre,echeancier:'comptant'})
            });
            if ((reponse.paymentPageUrl || reponse.checkoutUrl) &&
                /^https:\/\//.test((reponse.paymentPageUrl || reponse.checkoutUrl))) {
              window.location.assign(reponse.paymentPageUrl || reponse.checkoutUrl);
            } else if (reponse.commande?.statut === 'paye') {
              fermer();
            } else {
              throw new Error('Paiement non repris.');
            }
          } catch (e) {
            texte.textContent = e.message;
            bouton.disabled = false;
            bouton.textContent = 'Reprendre le paiement';
          }
        });
      } else {
        bouton.textContent = 'Fermer';
        bouton.addEventListener('click', fermer);
      }
      const hote = document.getElementById('lcdp-planifier-dialogues-slot') ||
        document.querySelector('.lcdp-planifier-wrapper');
      if (!hote) throw new Error('Conteneur du retour paiement absent.');
      hote.append(racine);
      bouton.focus();
    } catch (e) { console.error('Retour Paiement', e); }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',traiterRetourStripe);
  else traiterRetourStripe();
  window.LCDP_PAIEMENT = Object.freeze({ ouvrirBonCommande, reprendrePaiementTransmis });
})();