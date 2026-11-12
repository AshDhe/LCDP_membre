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
    const [rp, rd] = await Promise.all([
      fetch(String(config.workerAboRezaUrl || config.WORKER_ABOREZA_URL ||
        (typeof config.apiUrl === 'function' ? config.apiUrl('aboreza-api') : 'https://aboreza-api.lacleduparc.fr')).replace(/\/+$/, '') +
        '/panier', {credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}),
      fetch(endpoint + '/devis?idpanier=' + encodeURIComponent(idpanier),
        {credentials:'include',cache:'no-store',headers:{Accept:'application/json'}})
    ]);
    const [dp, dd] = await Promise.all([rp.json().catch(()=>null),rd.json().catch(()=>null)]);
    if (!rp.ok || !dp?.ok || dp?.panier?.idpanier !== idpanier || !rd.ok || !dd?.ok || !dd.devis)
      throw new Error('Le détail de cette commande ne peut pas être vérifié.');
    const panier = dp.panier, devis = dd.devis;
    listeDetails.replaceChildren();
    ajouterLigneDetail('Formule', String(panier.formule || 'Non renseignée'));
    if (panier.dateDebut) ajouterLigneDetail('Début', String(panier.dateDebut));
    if (panier.dateFin) ajouterLigneDetail('Fin', String(panier.dateFin));
    if (Number.isFinite(Number(devis.prixAbonnementTtc)))
      ajouterLigneDetail('Abonnement TTC', euros(devis.prixAbonnementTtc));
    for (const option of Array.isArray(devis.options) ? devis.options : [])
      ajouterLigneDetail('Privilège ' + String(option.code || ''), euros(option.totalTtc));
    if (Number(devis.creditAbonnementsInclus) > 0)
      ajouterLigneDetail('Crédit abonnements inclus', '− ' + euros(devis.creditAbonnementsInclus));
    ajouterLigneDetail('Total de la commande TTC', euros(devis.totalTtc), true);
    if (Number(devis.remiseComptantTtc) > 0)
      ajouterLigneDetail('Remise si règlement en une fois', '− ' + euros(devis.remiseComptantTtc));
    if (Array.isArray(devis.echeances) && devis.echeances.length) {
      devis.echeances.forEach((montant, index) => {
        const date = index === 0 ? 'à la commande' :
          (Array.isArray(devis.datesEcheances) && devis.datesEcheances[index]
            ? String(devis.datesEcheances[index]) : 'date non communiquée');
        ajouterLigneDetail('Échéance ' + (index + 1) + ' (' + date + ')', euros(montant));
      });
    }
    statutDetails.textContent = 'Montants et échéances issus du devis de la commande. Le prélèvement Stripe porte sur l’échéance actuellement payable.';
    el('description-commande').textContent = 'Abonnement ' + String(panier.formule || '') +
      ' · Conditions de paiement consultables ci-dessous.';
    return {panier,devis};
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
    if (typeof d?.montantEcheanceTtc === 'number')
      el('montant-commande').textContent = euros(d.montantEcheanceTtc);
    await detailEnCours;
    if (!reponse.ok || !d?.ok) throw new Error(d?.message || 'Impossible de charger la commande.');
    if (!/^pk_(test|live)_[A-Za-z0-9]+$/.test(d.publishableKey || '') ||
        !/^cs_(test|live)_[A-Za-z0-9_]+_secret_[A-Za-z0-9]+$/.test(d.clientSecret || ''))
      throw new Error('Session bancaire sécurisée indisponible.');
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