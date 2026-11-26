/* DFA — même Checkout Elements et même apparence que paiement-stripe-membre.js. */
(() => {
  'use strict';
  const iddfa=new URLSearchParams(location.search).get('iddfa')||'';
  const config=window.SITE_CONFIG||{};
  const endpoint=String(config.workerDfaUrl||config.WORKER_DFA_URL||(typeof config.apiUrl==='function'?config.apiUrl('dfa-api'):'')).replace(/\/+$/,'');
  const el=id=>document.getElementById(id),bouton=el('bouton-payer'),erreur=el('paiement-erreur');
  const retour=()=>location.assign('./dfa-membre.html?iddfa='+encodeURIComponent(iddfa)+'&retour=verification');
  const logoUrl=typeof window.LCDP_urlObjet==='function'?window.LCDP_urlObjet('/IMAG/LOGO/logo-bouton-navigation-76.webp'):'';
  if(logoUrl){const logo=el('logo-lcdp');logo.addEventListener('load',()=>{logo.hidden=false;el('logo-attente').hidden=true;},{once:true});logo.src=logoUrl;}
  function afficherErreur(message){erreur.textContent=message||'Paiement indisponible.';erreur.hidden=false;}
  el('dfa-abandon').addEventListener('click',()=>location.assign('./dfa-membre.html'));
  async function demarrer(){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(iddfa)||!endpoint)throw Error('Référence DFA indisponible.');
    const r=await fetch(endpoint+'/elements-session?iddfa='+encodeURIComponent(iddfa),{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
    const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok||d.operation?.iddfa!==iddfa)throw Error(d?.message||'Impossible de charger le règlement.');
    el('numero-commande').textContent=d.operation.reference;
    el('description-commande').textContent='Dotation financière annuelle — La Clé du Parc';
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

    const email=el('email-paiement');email.value=String(d.emailMembre||'');
    if(!email.validity.valid)throw Error('Adresse du compte membre invalide.');
    const synchroniser=()=>{bouton.disabled=!email.validity.valid||!actions.getSession()?.canConfirm;};
    checkout.on('change',synchroniser);
    const emailResultat=await actions.updateEmail(email.value.trim());
    if(emailResultat.type==='error')throw Error(emailResultat.error?.message||'Adresse du compte indisponible.');
    synchroniser();
    el('paiement-formulaire').addEventListener('submit',async event=>{
      event.preventDefault();if(bouton.disabled)return;bouton.disabled=true;erreur.hidden=true;
      try{const resultat=await actions.confirm({email:email.value.trim()});if(resultat.type==='error'){afficherErreur(resultat.error?.message||'Le paiement est refusé.');synchroniser();}else retour();}
      catch(e){afficherErreur(e.message);synchroniser();}
    });
  }
  demarrer().catch(e=>{afficherErreur(e.message);bouton.disabled=true;});
})();