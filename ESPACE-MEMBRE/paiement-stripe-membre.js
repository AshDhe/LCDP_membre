/* LCDP — Stripe Checkout Elements. Le Worker reste seul responsable des montants et de la confirmation. */
(() => {
  'use strict';
  const idpanier = new URLSearchParams(location.search).get('idpanier') || '';
  const config = window.SITE_CONFIG || {};
  const endpoint = String(config.workerPaiementUrl || config.WORKER_PAIEMENT_URL ||
    (typeof config.apiUrl === 'function' ? config.apiUrl('paiement-api') : 'https://paiement-api.lacleduparc.fr')).replace(/\/+$/, '');
  const el = id => document.getElementById(id);
  const bouton = el('bouton-payer');
  const erreur = el('paiement-erreur');
  const fmtEuro = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR'});
  const logoUrl = typeof window.LCDP_urlObjet === 'function'
    ? window.LCDP_urlObjet('/IMAG/LOGO/logo-bouton-navigation-76.webp') : '';
  if (logoUrl) {
    const logo = el('logo-lcdp');
    logo.addEventListener('load', () => { logo.hidden = false; el('logo-attente').hidden = true; }, {once:true});
    logo.src = logoUrl;
  }
  function afficherErreur(message) { erreur.textContent = message || 'Paiement indisponible.'; erreur.hidden = false; }
  function retirerErreur() { erreur.hidden = true; erreur.textContent = ''; }
  const boutonReprise = el('reprendre-paiement');
  async function proposerRepriseSessionExpiree(code) {
    // Seul le serveur décide si la session expirée peut être renouvelée.
    // Aucun diagnostic annexe ne doit masquer le bouton de reprise :
    // /valider vérifie la commande et la preuve d'expiration Stripe.
    if (!['STRIPE_REFERENCES','SESSION_INDISPONIBLE'].includes(String(code || ''))) return false;
    boutonReprise.hidden = false;
    erreur.textContent = 'La session bancaire est indisponible ou expirée. Vous pouvez reprendre le paiement de cette commande ; le serveur vérifiera qu’aucun paiement n’a été réalisé.';
    erreur.hidden = false;
    boutonReprise.addEventListener('click', async () => {
      if (boutonReprise.disabled) return;
      boutonReprise.disabled = true;
      boutonReprise.textContent = 'Reprise du paiement…';
      try {
        const reprise = await fetch(endpoint + '/valider', {
          method:'POST', credentials:'include', cache:'no-store',
          headers:{Accept:'application/json','Content-Type':'application/json'},
          body:JSON.stringify({idpanier,echeancier:'comptant'})
        });
        const data = await reprise.json().catch(() => null);
        if (!reprise.ok || !data?.ok ||
            (data.commande?.idpanier && data.commande.idpanier !== idpanier))
          throw new Error(data?.message || 'Impossible de reprendre la session de paiement.');
        if (data.commande?.statut === 'paye') {
          location.assign('./reserver-membre.html?paiement=retour&retour=verification&idpanier=' + encodeURIComponent(idpanier));
          return;
        }
        const cible = data.paymentPageUrl || data.checkoutUrl;
        if (!cible) throw new Error('La nouvelle session bancaire est indisponible.');
        const destination = new URL(cible, location.href);
        if (destination.origin !== location.origin ||
            destination.pathname !== new URL('./paiement-stripe-membre.html', location.href).pathname ||
            destination.searchParams.get('idpanier') !== idpanier)
          throw new Error('Adresse de reprise inattendue.');
        location.assign(destination.href);
      } catch (e) {
        afficherErreur(e.message || 'Impossible de reprendre le paiement.');
        boutonReprise.disabled = false;
        boutonReprise.textContent = 'Reprendre le paiement';
      }
    }, {once:false});
    return true;
  }
  const details = el('detail-commande');
  const lienDetails = el('voir-detail-commande');
  const listeDetails = el('detail-commande-lignes');
  const statutDetails = el('detail-commande-statut');
  lienDetails.addEventListener('click', () => {
    const afficher = details.hidden;
    details.hidden = !afficher;
    lienDetails.setAttribute('aria-expanded', String(afficher));
    lienDetails.textContent = afficher ? 'Masquer le détail' : 'Voir le détail';
  });
  function ajouterLigneDetail(libelle, valeur, total = false) {
    const ligne = document.createElement('div');
    if (total) ligne.className = 'lcdp-stripe__detail-total';
    const titre = document.createElement('dt');
    titre.textContent = libelle;
    const montant = document.createElement('dd');
    montant.textContent = valeur;
    ligne.append(titre, montant);
    listeDetails.append(ligne);
  }
  function euros(valeur) {
    const nombre = Number(valeur);
    return Number.isFinite(nombre) ? fmtEuro.format(nombre) : 'Non disponible';
  }
  async function chargerDetailCommande() {
    const [rp, rd, re] = await Promise.all([
      fetch(String(config.workerAboRezaUrl || config.WORKER_ABOREZA_URL ||
        (typeof config.apiUrl === 'function' ? config.apiUrl('aboreza-api') : 'https://aboreza-api.lacleduparc.fr')).replace(/\/+$/, '') +
        '/panier', {credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}),
      fetch(endpoint + '/devis?idpanier=' + encodeURIComponent(idpanier),
        {credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}),
      fetch(endpoint + '/etat?idpanier=' + encodeURIComponent(idpanier),
        {credentials:'include',cache:'no-store',headers:{Accept:'application/json'}})
    ]);
    const [dp, dd, de] = await Promise.all([rp.json().catch(()=>null),rd.json().catch(()=>null),re.json().catch(()=>null)]);
    const commande = re.ok && de?.ok && de.commande?.idpanier === idpanier ? de.commande : null;
    if (commande) {
      el('reference-commande').textContent = commande.orderid || '—';
      if (commande.numeroCommande) el('numero-commande').textContent = commande.numeroCommande;
      if (Number.isFinite(Number(commande.premiereEcheanceTtc)))
        el('montant-commande').textContent = euros(commande.premiereEcheanceTtc);
    }
    if (!rp.ok || !dp?.ok || dp?.panier?.idpanier !== idpanier || !rd.ok || !dd?.ok || !dd.devis)
      throw new Error('Le détail de cette commande ne peut pas être vérifié.');
    const panier = dp.panier, devis = dd.devis;
    if (!commande) throw new Error('Référence de commande indisponible.');
    if (!commande.numeroCommande) {
      const rNumero = await fetch(endpoint + '/numero-commande', {
        method:'POST',credentials:'include',cache:'no-store',
        headers:{Accept:'application/json','Content-Type':'application/json'},
        body:JSON.stringify({idpanier})
      });
      const attribue = await rNumero.json().catch(()=>null);
      if (rNumero.ok && attribue?.ok && attribue.numeroCommande)
        el('numero-commande').textContent = attribue.numeroCommande;
    }
    const reglementEchelonne = Number(commande.nbEcheances) > 1;
    listeDetails.replaceChildren();
    const montantValide = valeur => valeur !== null && valeur !== undefined &&
      valeur !== '' && Number.isFinite(Number(valeur));
    const dateFr = iso => /^\\d{4}-\\d{2}-\\d{2}$/.test(String(iso || ''))
      ? new Intl.DateTimeFormat('fr-FR', {timeZone:'UTC',day:'numeric',month:'long',year:'numeric'})
          .format(new Date(String(iso) + 'T12:00:00Z'))
      : String(iso || 'Date non communiquée');
    const remise = montantValide(devis.remiseComptantTtc)
      ? Number(devis.remiseComptantTtc) : 0;
    const echeances = Array.isArray(devis.echeances) ? devis.echeances : [];
    const validEcheances = echeances.length > 0 && echeances.every(montantValide);
    const sommeEcheances = validEcheances
      ? echeances.reduce((total, n) => total + Math.round(Number(n)*100), 0) / 100 : null;
    const montantComptant = montantValide(devis.totalTtc) ? Number(devis.totalTtc) : null;
    const prixAvantRemise = montantComptant !== null && remise > 0
      ? Math.round((montantComptant + remise)*100)/100
      : montantComptant;
    ajouterLigneDetail('Abonnement', String(panier.formule || 'Non renseigné'));
    if (panier.dateDebut) ajouterLigneDetail('Début', dateFr(panier.dateDebut));
    if (panier.dateFin) ajouterLigneDetail('Fin', dateFr(panier.dateFin));
    if (montantValide(devis.prixAbonnementTtc))
      ajouterLigneDetail('Prix de l’abonnement TTC', euros(devis.prixAbonnementTtc));
    for (const option of Array.isArray(devis.options) ? devis.options : [])
      ajouterLigneDetail('Privilège ' + String(option.code || ''), euros(option.totalTtc));
    if (montantValide(devis.creditAbonnementsInclus) && Number(devis.creditAbonnementsInclus)>0)
      ajouterLigneDetail('Crédit abonnements inclus', '− ' + euros(devis.creditAbonnementsInclus));
    if (prixAvantRemise !== null)
      ajouterLigneDetail('Prix avant remise comptant', euros(prixAvantRemise), true);
    if (!reglementEchelonne && montantComptant !== null) {
      if (remise > 0) ajouterLigneDetail('Remise paiement comptant', '− ' + euros(remise));
      ajouterLigneDetail('Montant réglé en une fois', euros(montantComptant), true);
    }
    if (reglementEchelonne && validEcheances && echeances.length > 1) {
      ajouterLigneDetail('Total du règlement échelonné', euros(sommeEcheances), true);
      echeances.forEach((montant, index) => {
        const date = index === 0 ? 'à la commande' :
          (Array.isArray(devis.datesEcheances) && devis.datesEcheances[index]
            ? dateFr(devis.datesEcheances[index]) : 'date non communiquée');
        ajouterLigneDetail('Échéance ' + (index + 1) + ' (' + date + ')', euros(montant));
      });
    }
    statutDetails.textContent = reglementEchelonne
      ? 'Paiement en plusieurs échéances. La remise pour règlement comptant ne s’applique pas.'
      : 'Paiement comptant. La remise pour règlement en une fois est comprise dans le montant dû.';
    el('description-commande').textContent = 'Abonnement ' + String(panier.formule || '') +
      ' · Conditions de paiement consultables ci-dessous.';
    return {panier,devis,commande};
  }
  async function demarrer() {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idpanier))
      throw new Error('Référence de commande invalide. Retournez au planning.');
    // Le détail commercial ne dépend pas de la disponibilité de Stripe.
    const detailEnCours = chargerDetailCommande().catch(e => {
      statutDetails.textContent = e.message || 'Détail de la commande indisponible.';
      return null;
    });
    const reponse = await fetch(endpoint + '/elements-session?idpanier=' + encodeURIComponent(idpanier), {
      method:'GET', cache:'no-store', credentials:'include', headers:{Accept:'application/json'}
    });
    const d = await reponse.json().catch(() => null);
    if (d?.orderid) el('reference-commande').textContent = d.orderid;
    if (d?.numeroCommande) el('numero-commande').textContent = d.numeroCommande;
    if (typeof d?.montantEcheanceTtc === 'number')
      el('montant-commande').textContent = euros(d.montantEcheanceTtc);
    await detailEnCours;
    if (!reponse.ok || !d?.ok) {
      const reprisePossible = await proposerRepriseSessionExpiree(d?.code).catch(() => false);
      if (reprisePossible) return;
      throw new Error(d?.message || 'Impossible de charger la commande.');
    }
    // Ne pas rejeter les identifiants Stripe sur un alphabet supposé.
    // Le Worker a déjà contrôlé le statut, le montant, la devise et les références.
    const clePublique = typeof d.publishableKey === 'string' ? d.publishableKey.trim() : '';
    const secretSession = typeof d.clientSecret === 'string' ? d.clientSecret : '';
    const modeCle = clePublique.startsWith('pk_test_') ? 'test' :
      clePublique.startsWith('pk_live_') ? 'live' : '';
    const modeSession = secretSession.startsWith('cs_test_') ? 'test' :
      secretSession.startsWith('cs_live_') ? 'live' : '';
    if (!modeCle || !modeSession || modeCle !== modeSession ||
        !secretSession.includes('_secret_'))
      throw new Error('Les paramètres Stripe de la session ne correspondent pas au même environnement.');
    if (typeof window.Stripe !== 'function') throw new Error('Le service sécurisé Stripe ne s’est pas chargé.');
    el('environnement-test').hidden = !d.publishableKey.startsWith('pk_test_');
    el('reference-commande').textContent = d.orderid || '—';
    if (!el('description-commande').textContent.includes('Conditions de paiement'))
      el('description-commande').textContent = d.formule ? 'Abonnement ' + d.formule + ' · Échéance à payer' : 'Échéance de votre commande';
    const stripe = window.Stripe(d.publishableKey, {locale:'fr'});
    const checkout = stripe.initCheckoutElementsSdk({
      clientSecret:d.clientSecret,
      elementsOptions:{appearance:{theme:'stripe', variables:{
        colorPrimary:'#4b6333', colorText:'#292524', colorBackground:'#ffffff',
        colorDanger:'#be123c', borderRadius:'12px',
        fontFamily:'system-ui, -apple-system, Segoe UI, sans-serif'
      }}}
    });
    const loaded = await checkout.loadActions();
    if (loaded.type !== 'success') throw new Error(loaded.error?.message || 'Impossible de préparer le paiement.');
    const actions = loaded.actions;
    const montantStripe = actions.getSession()?.total?.total?.amount;
    if (!montantStripe) throw new Error('Montant Stripe indisponible.');
    el('montant-commande').textContent = montantStripe;
    bouton.textContent = 'Payer ' + montantStripe;
    checkout.createPaymentElement({layout:{type:'accordion'}}).mount('#stripe-payment-element');
    const email = el('email-paiement');
    const emailCompte = typeof d.emailMembre === 'string' ? d.emailMembre.trim() : '';
    if (emailCompte) {
      email.value = emailCompte;
      if (email.validity.valid) {
        // L'adresse validée du compte membre est déjà connue : ne pas la ressaisir.
        email.hidden = true;
        email.style.display = 'none';
        const etiquette = document.querySelector('label[for="email-paiement"]');
        if (etiquette) { etiquette.hidden = true; etiquette.style.display = 'none'; }
      }
    }
    const synchroniser = () => { bouton.disabled = !email.validity.valid || !actions.getSession()?.canConfirm; };
    email.addEventListener('input', synchroniser);
    checkout.on('change', synchroniser);
    synchroniser();
    el('paiement-formulaire').addEventListener('submit', async event => {
      event.preventDefault();
      if (bouton.disabled) return;
      retirerErreur(); bouton.disabled = true;
      try {
        const retour = new URL('./reserver-membre.html', location.href);
        retour.search = new URLSearchParams({paiement:'retour',idpanier,retour:'verification'}).toString();
        if (!email.validity.valid) { email.reportValidity(); synchroniser(); return; }
        const emailResultat = await actions.updateEmail(email.value.trim());
        if (emailResultat.type === 'error') {
          afficherErreur(emailResultat.error?.message || 'Adresse e-mail non valide.');
          synchroniser(); return;
        }
        const resultat = await actions.confirm({returnUrl:retour.href, email:email.value.trim()});
        if (resultat.type === 'error') {
          afficherErreur(resultat.error?.message || 'Le paiement a été refusé.');
          synchroniser();
        } else {
          // Le statut définitif provient du webhook, jamais du navigateur.
          location.assign(retour.href);
        }
      } catch (e) { afficherErreur(e.message); synchroniser(); }
    });
  }
  demarrer().catch(e => { afficherErreur(e.message); bouton.disabled = true; });
})();