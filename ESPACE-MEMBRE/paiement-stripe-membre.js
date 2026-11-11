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
  async function demarrer() {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idpanier))
      throw new Error('Référence de commande invalide. Retournez au planning.');
    const reponse = await fetch(endpoint + '/elements-session?idpanier=' + encodeURIComponent(idpanier), {
      method:'GET', cache:'no-store', credentials:'include', headers:{Accept:'application/json'}
    });
    const d = await reponse.json().catch(() => null);
    if (!reponse.ok || !d?.ok) throw new Error(d?.message || 'Impossible de charger la commande.');
    if (!/^pk_(test|live)_[A-Za-z0-9]+$/.test(d.publishableKey || '') ||
        !/^cs_(test|live)_[A-Za-z0-9_]+_secret_[A-Za-z0-9]+$/.test(d.clientSecret || ''))
      throw new Error('Session bancaire sécurisée indisponible.');
    if (typeof window.Stripe !== 'function') throw new Error('Le service sécurisé Stripe ne s’est pas chargé.');
    el('environnement-test').hidden = !d.publishableKey.startsWith('pk_test_');
    el('reference-commande').textContent = d.orderid || '—';
    el('description-commande').textContent = d.formule ? 'Abonnement ' + d.formule + ' · Première échéance' : 'Première échéance de votre abonnement';
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