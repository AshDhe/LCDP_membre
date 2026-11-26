/* Formulaire Stripe Elements LCDP — présentation identique à la DFA. */
(() => {
  "use strict";
  if(window.LCDP_monterElementsImpaye) return;
  let chargement;
  function objet(chemin) {
    const cfg=window.SITE_CONFIG||{};
    if(typeof window.LCDP_urlObjet==="function")return window.LCDP_urlObjet(chemin);
    if(typeof cfg.objetUrl==="function")return cfg.objetUrl(chemin);
    throw Error("Objets LCDP indisponibles.");
  }
  function ressource(type,url) {
    return new Promise((resolve,reject)=>{
      const element=document.createElement(type);
      if(type==="link"){element.rel="stylesheet";element.href=url;}else element.src=url;
      element.onload=resolve;
      element.onerror=()=>{element.remove();reject(Error("Formulaire bancaire indisponible."));};
      document.head.appendChild(element);
    });
  }
  function preparer() {
    if(!chargement)chargement=Promise.all([
      ressource("link",objet("/CSSBASE/lcdp-paiement-elements.css?v=20261126-bouton-officiel-v4")),
      ressource("link",objet("/CSSBASE/lcdp-attente.css?v=20261126-v1")),
      typeof window.Stripe==="function"?Promise.resolve():ressource("script","https://js.stripe.com/endive/stripe.js")
    ]).catch(e=>{chargement=null;throw e;});
    return chargement;
  }
  async function monter(slot,d,options={}) {
    const cle=String(d.publishableKey||"").trim(),secret=String(d.clientSecret||"");
    const mode=cle.startsWith("pk_test_")?"test":cle.startsWith("pk_live_")?"live":"";
    if(!mode||!d.id||!secret.startsWith(String(d.id)+"_secret_")||!secret.startsWith("cs_"+mode+"_"))
      throw Error("Les paramètres Stripe de la session ne correspondent pas au même environnement.");
    const [,reponse]=await Promise.all([preparer(),fetch(objet("/HTMLBASE/04-paiement-elements-impaye.html?v=20261126-bouton-officiel-v4"),{cache:"no-cache",credentials:"omit"})]);
    if(!reponse.ok)throw Error("Formulaire bancaire indisponible.");
    const template=document.createElement("template");
    template.innerHTML=(await reponse.text()).trim();
    if(!slot.isConnected)return;
    const racine=template.content.querySelector("[data-lcdp-paiement-elements]");
    if(!racine)throw Error("Gabarit bancaire indisponible.");
    const el=id=>racine.querySelector("#"+id);
    const bouton=el("bouton-payer"),erreur=el("paiement-erreur"),abandon=el("dfa-abandon"),email=el("email-paiement");
    const afficherErreur=message=>{erreur.textContent=message||"Paiement indisponible.";erreur.hidden=false;};
    el("numero-commande").textContent=String(options.orderid||"—");
    el("description-commande").textContent="Abonnement — Échéance "+String(options.echeance||"1");
    el("environnement-test").hidden=mode!=="test";
    const logo=el("logo-lcdp");
    logo.addEventListener("load",()=>{logo.hidden=false;el("logo-attente").hidden=true;},{once:true});
    logo.src=objet("/IMAG/LOGO/logo-bouton-navigation-76.webp");
    // Le formulaire bancaire remplace temporairement le main appelant,
    // sans hériter de ses règles de centrage, de hauteur ni de défilement.
    const mainOrigine=slot.closest("main, .lcdp-site-main");
    const wrapper=mainOrigine?.parentElement;
    if(!wrapper?.matches(".lcdp-app-wrapper,.lcdp-site-page") ||
       wrapper.querySelector(":scope > [data-lcdp-paiement-elements-main]"))
      throw Error("Wrapper de paiement indisponible.");
    const main=document.createElement("main");
    main.className="lcdp-site-main";
    main.setAttribute("data-lcdp-paiement-elements-main","");
    main.setAttribute("aria-label","Paiement sécurisé");
    main.tabIndex=-1;
    main.appendChild(template.content);
    const ancienHidden=mainOrigine.hidden;
    const ancienScroll=mainOrigine.scrollTop;
    let elementPaiement=null,enCours=false,ferme=false;
    function restaurerWrapper(){
      main.remove();
      wrapper.classList.remove("lcdp-paiement-elements-actif");
      mainOrigine.removeAttribute("data-lcdp-paiement-elements-masque");
      mainOrigine.hidden=ancienHidden;
      mainOrigine.scrollTop=ancienScroll;
    }
    abandon.addEventListener("click",()=>{
      if(enCours||ferme)return;
      ferme=true;
      try{elementPaiement?.destroy();}catch{}
      restaurerWrapper();
      options.quitter?.();
    });
    mainOrigine.after(main);
    wrapper.classList.add("lcdp-paiement-elements-actif");
    mainOrigine.setAttribute("data-lcdp-paiement-elements-masque","");
    mainOrigine.hidden=true;
    main.scrollTop=0;
    main.focus({preventScroll:true});
    try {
      if(typeof window.Stripe!=="function")throw Error("Le service sécurisé Stripe ne s’est pas chargé.");
      const stripe=window.Stripe(cle,{locale:"fr"});
      const checkout=stripe.initCheckoutElementsSdk({
        clientSecret:secret,
        elementsOptions:{appearance:{theme:"stripe",variables:{
          colorPrimary:"#4b6333",colorText:"#292524",colorBackground:"#ffffff",
          colorDanger:"#be123c",borderRadius:"12px",
          fontFamily:"system-ui, -apple-system, Segoe UI, sans-serif"
        }}}
      });
      const loaded=await checkout.loadActions();
      if(ferme||!racine.isConnected)return;
      if(loaded.type!=="success")throw Error(loaded.error?.message||"Impossible de préparer le paiement.");
      const actions=loaded.actions;
      const montantStripe=actions.getSession()?.total?.total?.amount;
      if(!montantStripe)throw Error("Montant Stripe indisponible.");
      const montantAffiche=montantStripe.replace(/([0-9]),00(?=\s*€(?:\s|$))/u,"$1");
      el("montant-commande").textContent=montantAffiche;
      bouton.textContent="Payer "+montantAffiche;
      elementPaiement=checkout.createPaymentElement({layout:{type:"accordion"}});
      elementPaiement.mount(el("stripe-payment-element"));
      const emailSession=()=>String(actions.getSession()?.email||"").trim();
      email.value=emailSession()||String(d.emailMembre||"").trim();
      if(!email.validity.valid)throw Error("Adresse du compte membre invalide.");
      let emailPret=Boolean(emailSession());
      const synchroniser=()=>{bouton.disabled=enCours||ferme||!emailPret||!actions.getSession()?.canConfirm;};
      checkout.on("change",synchroniser);
      if(!emailPret){
        const r=await actions.updateEmail(email.value.trim());
        if(r.type==="error"&&!emailSession())throw Error(r.error?.message||"Adresse du compte indisponible.");
        emailPret=true;
      }
      synchroniser();
      el("paiement-formulaire").addEventListener("submit",async event=>{
        event.preventDefault();
        if(bouton.disabled||enCours||ferme)return;
        enCours=true;bouton.disabled=true;abandon.disabled=true;erreur.hidden=true;
        bouton.classList.add("lcdp-action-attente");bouton.setAttribute("aria-busy","true");
        try {
          const resultat=await actions.confirm();
          if(resultat.type==="error")afficherErreur(resultat.error?.message||"Le paiement est refusé.");
          else {options.confirmer?.();return;}
        }catch(e){afficherErreur(e.message);}
        enCours=false;abandon.disabled=false;bouton.classList.remove("lcdp-action-attente");bouton.removeAttribute("aria-busy");synchroniser();
      });
    }catch(e){if(!ferme){afficherErreur(e.message);bouton.disabled=true;}}
  }
  window.LCDP_monterElementsImpaye=monter;
})();
