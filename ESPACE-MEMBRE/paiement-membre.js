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
    const reponse = await fetch(cheminObjet(chemin), { cache: 'no-store' });
    if (!reponse.ok) throw new Error('Composant introuvable : ' + chemin);
    const documentObjet = new DOMParser().parseFromString(await reponse.text(), 'text/html');
    const racine = documentObjet.querySelector(selecteur);
    if (!racine) throw new Error('Structure du composant absente : ' + chemin);
    return racine;
  }

  async function obtenirComposants() {
    if (!composants) {
      composants = Promise.all([
        chargerObjet('/BOX/04-box-workflow-abonnement.html', '[data-lcdp-box-workflow-abonnement]'),
        chargerObjet('/BOX/04-box-card-recaporder.html', '[data-lcdp-box-card-recaporder]')
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
      credentials: 'include', cache: 'no-store',
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
      credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' }
    });
    const retour = await reponse.json().catch(() => null);
    if (!reponse.ok || retour?.ok !== true) {
      throw new Error(retour?.message || 'Impossible de relire le panier Aboresa.');
    }
    const panier = retour.panier;
    if (!panier || panier.idpanier !== idpanier) {
      throw new Error('Le panier demandé ne correspond pas au panier actif.');
    }
    if (panier.statut !== 'pret_paiement' || panier.complet !== true ||
        Number(panier.nbSelectionnes) < Number(panier.nbAccesRequis)) {
      throw new Error('Le panier doit être complété avant la synthèse.');
    }
    if (panier.expirationCommande && Date.parse(panier.expirationCommande) <= Date.now()) {
      throw new Error('Les retenues ont expiré. Reprenez le panier Aboresa.');
    }
    return panier;
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
    lignes.push(ajouterLigne(liste, 'Référence du panier', panier.idpanier));
    lignes.push(ajouterLigne(liste, 'Accès obligatoires',
      `${panier.nbSelectionnes} / ${panier.nbAccesRequis}`));

    const inclus = Array.isArray(panier.detailsAbonnementsInclus) ? panier.detailsAbonnementsInclus : [];
    for (const abonnement of inclus) {
      lignes.push(ajouterLigne(liste, 'Abonnement existant inclus',
        `${abonnement.typeAbonnement || 'Abonnement'} : du ${dateLisible(abonnement.debut)} au ${dateLisible(abonnement.fin)}`));
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
      lignes.push(ajouterLigne(liste, 'Accès ' + (index + 1),
        `${dateLisible(accesMembre.dateacces)} · ${periode} · ${nomParc} (${statut})`));
    });
    premiereLignePrix.before(...lignes);

    remplir(recap, '[data-lcdp-recaporder-prix-initial]', EURO.format(devis.prixTtc));
    const prixNet=remplir(recap, '[data-lcdp-recaporder-prix-net]', EURO.format(devis.totalTtc));
    let ligneRemise = null;
    if (devis.remiseComptantTtc > 0) {
      ligneRemise=ajouterLigne(liste, 'Remise paiement comptant',
        '− '+EURO.format(devis.remiseComptantTtc));
      premiereLignePrix.before(ligneRemise);
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
    const code = recap.querySelector('[data-lcdp-recaporder-code-remise]');
    if (code) {
      code.disabled = true;
      code.setAttribute('aria-label', 'Code remise — calcul tarifaire non disponible');
    }
    const validerCode = recap.querySelector('[data-lcdp-recaporder-valider-code]');
    if (validerCode) { validerCode.disabled = true; validerCode.setAttribute('aria-disabled', 'true'); }
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
        if (!/^https:\/\//.test(retour.checkoutUrl || ''))
          throw new Error('Adresse de paiement sécurisée indisponible.');
        window.location.assign(retour.checkoutUrl);
      } catch(erreur) {
        afficherMessage(recap,erreur.message);
        boutonPayer.disabled = false;
        boutonPayer.textContent = precedent;
      }
    });

    const boutonAnnuler = recap.querySelector('[data-lcdp-recaporder-cancel]');
    if (boutonAnnuler) boutonAnnuler.textContent = 'Retour au planning';
    // Le bouton Précédent retourne au panier, sans annuler la commande.
    const precedent = recap.querySelector('[data-lcdp-recaporder-back]');
    if (precedent) precedent.textContent = 'Précédent';

    const urlPublic = chemin => typeof window.LCDP_urlPublic === 'function'
      ? window.LCDP_urlPublic(chemin)
      : (typeof config.publicUrl === 'function' ? config.publicUrl(chemin)
        : String(config.publicBaseUrl || config.PUBLIC_BASE || '').replace(/\/+$/, '') + chemin);
    const reglementClub = recap.querySelector('[data-lcdp-recaporder-reglement-club]');
    const reglementApp = recap.querySelector('[data-lcdp-recaporder-reglement-application]');
    if (reglementClub) reglementClub.href = urlPublic('/ESPACE-PUBLIC/reglement-club.html');
    if (reglementApp) reglementApp.href = urlPublic('/ESPACE-PUBLIC/reglement-app.html');

    const message = recap.querySelector('[data-lcdp-recaporder-message]');
    if (message) {
      let note = 'Les droits seront activés après confirmation du règlement.';
      if (panier.expirationCommande) {
        const expiration = new Date(panier.expirationCommande);
        if (Number.isFinite(expiration.getTime())) {
          note = `Les retenues provisoires expirent le ${formatHeure.format(expiration)}. ` + note;
        }
      }
      message.textContent = note;
      message.hidden = false;
    }

    const emplacement = workflow.querySelector('[data-lcdp-workflow-abonnement-content]');
    if (!emplacement) throw new Error('Emplacement du workflow abonnement manquant.');
    emplacement.append(recap);
    return workflow;
  }

  async function ouvrirBonCommande(idpanier) {
    if (ouverture) return ouverture;
    const traitement = (async () => {
      const [modeleWorkflow, modeleRecap] = await obtenirComposants();
      const [panier, devis] = await Promise.all([lirePanier(idpanier),lireDevis(idpanier)]);
      const paiement = { termine:false };
      const workflow = monterBon(modeleWorkflow, modeleRecap, panier, devis, paiement);
      const boutonRetour = workflow.querySelector('[data-lcdp-recaporder-cancel]');
      const boutonPrecedent = workflow.querySelector('[data-lcdp-recaporder-back]');
      const precedent = document.activeElement;
      document.body.append(workflow);
      await new Promise(resolve => {
        let ferme = false;
        const terminer = () => {
          if (ferme) return;
          ferme = true;
          workflow.removeEventListener('keydown', touche);
          workflow.remove();
          if (precedent?.isConnected && typeof precedent.focus === 'function') precedent.focus();
          resolve();
        };
        const touche = event => {
          if (event.key === 'Escape') { event.preventDefault(); terminer(); return; }
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
        workflow.addEventListener('click', event => { if (event.target === workflow) terminer(); });
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
      const racine=await chargerObjet('/BOX/02-box-alerte.html','[data-lcdp-box-alerte]');
      racine.querySelector('[data-lcdp-alerte-message]').textContent=message;
      const fermer=()=>{racine.remove();window.location.replace(urlMembre('/ESPACE-MEMBRE/accueil-membre.html'));};
      const bouton=racine.querySelector('[data-lcdp-alerte-ok]');
      if (panierAReprendre) {
        if(bouton) bouton.textContent='Reprendre le paiement';
        bouton?.addEventListener('click',async()=>{
          bouton.disabled=true;
          try{
            const reponse=await apiPaiement('/valider',{method:'POST',
              body:JSON.stringify({idpanier:panierAReprendre,echeancier:'comptant'})});
            if(reponse.checkoutUrl && /^https:\/\//.test(reponse.checkoutUrl))
              window.location.assign(reponse.checkoutUrl);
            else if(reponse.commande?.statut==='paye')fermer();
            else throw new Error('Paiement non repris.');
          }catch(e){
            racine.querySelector('[data-lcdp-alerte-message]').textContent=e.message;
            bouton.disabled=false;
            bouton.textContent='Reprendre le paiement';
          }
        });
      } else bouton?.addEventListener('click',fermer);
      racine.querySelector('[data-lcdp-alerte-close]')?.addEventListener('click',fermer);
      document.body.append(racine);
    }catch(e){console.error('Retour Paiement',e);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',traiterRetourStripe);
  else traiterRetourStripe();
  window.LCDP_PAIEMENT = Object.freeze({ ouvrirBonCommande });
})();
