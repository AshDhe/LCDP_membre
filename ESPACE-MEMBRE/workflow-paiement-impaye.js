/* Objet unique : règlement des échéances impayées, indépendant de la page appelante. */
(() => {
  "use strict";
  if (window.LCDP_PaiementImpaye) return;
  const cfg = window.SITE_CONFIG || {};
  function url(espace,path) {
    const fn = espace === "membre" ? window.LCDP_urlMembre || cfg.membreUrl : window.LCDP_urlObjet || cfg.objetUrl;
    if (typeof fn === "function") return fn(path);
    const base = espace === "membre" ? cfg.membreBaseUrl || cfg.MEMBRE_BASE || cfg.siteBase : cfg.objetBaseUrl || cfg.OBJET_BASE || String(cfg.publicBaseUrl || cfg.PUBLIC_BASE || "").replace(/\/+$/,"")+"/OBJET";
    return String(base || "").replace(/\/+$/,"")+"/"+path.replace(/^\/+/,"");
  }
  let chargementCSS, chargementCB;
  function assurerCSS() {
    if (!chargementCSS) chargementCSS = new Promise((resolve,reject) => {
      const lien = document.createElement("link");
      lien.rel = "stylesheet";
      lien.href = url("objet","/CSSBASE/lcdp-lightbox-convergence.css?v=20261126-workflow-impaye-v2");
      lien.onload = resolve;
      lien.onerror = () => {lien.remove();chargementCSS=null;reject(Error("CSS officiel indisponible."));};
      document.head.appendChild(lien);
    });
    return chargementCSS;
  }
  function chargerScriptMembreUneFois(path) {
    if (window.LCDP_monterPaiementCB) return Promise.resolve();
    if (!chargementCB) chargementCB = new Promise((resolve,reject) => {
      const script = document.createElement("script");
      script.src = url("membre",path);
      script.onload = resolve;
      script.onerror = () => {script.remove();chargementCB=null;reject(Error("Service de paiement indisponible."));};
      document.head.appendChild(script);
    });
    return chargementCB;
  }
  async function chargerFragmentObjet(path) {
    const r = await fetch(url("objet",path),{credentials:"omit",cache:"no-cache"});
    if (!r.ok) throw Error("Boîte officielle indisponible.");
    const template=document.createElement("template");
    template.innerHTML=(await r.text()).trim();
    return template.content;
  }
  function ouvrirParcours(id,libelle) {
    if (document.querySelector("[data-lcdp-paiement-impaye-parcours]")) return null;
    const main = document.querySelector(".lcdp-app-wrapper > #lcdp-accueil-contenu, .lcdp-app-wrapper > .lcdp-site-main, .lcdp-site-page > .lcdp-site-main, .lcdp-app-wrapper > main, .lcdp-site-page > main");
    if (!main) throw Error("Wrapper de l’application introuvable.");
    if (main.querySelector("[data-lcdp-compte-parcours]")) throw Error("Un parcours est déjà ouvert.");
    const focus=document.activeElement, scroll=main.scrollTop;
    const anciens=Array.from(main.children).map(element=>({element,hidden:element.hidden}));
    const section=document.createElement("section");
    section.className="lcdp-page-section";
    section.setAttribute("data-lcdp-paiement-impaye-parcours","");
    section.setAttribute("data-lcdp-compte-parcours","");
    section.setAttribute("aria-label",libelle);
    const conteneur=document.createElement("div");
    conteneur.className="lcdp-page-container";
    const contenu=document.createElement("div");
    contenu.id=id;
    contenu.setAttribute("data-lcdp-compte-parcours-contenu","");
    conteneur.appendChild(contenu);section.appendChild(conteneur);
    anciens.forEach(({element})=>{element.hidden=true;});
    main.appendChild(section);main.scrollTop=0;
    let ferme=false;
    return {contenu,fermer(){
      if(ferme)return;
      ferme=true;section.remove();
      anciens.forEach(({element,hidden})=>{if(element.isConnected)element.hidden=hidden;});
      main.scrollTop=scroll;if(focus?.isConnected)focus.focus();
    }};
  }
  async function dialogue(slot,profil,message,options={}) {
    const fragment=await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-"+profil+".html");
    if(!slot.isConnected)return false;
    const boite=fragment.querySelector('[data-lcdp-dialogue-reference="'+profil+'"]');
    const titre=boite?.querySelector("[data-lcdp-dialogue-titre]");
    const texte=boite?.querySelector("[data-lcdp-dialogue-message]");
    const bouton=boite?.querySelector('[data-lcdp-dialogue-action="'+(profil==="choix"?"confirmer":profil==="erreur"?"fermer":"compris")+'"]');
    const annuler=boite?.querySelector('[data-lcdp-dialogue-action="annuler"]');
    if(!boite||!titre||!texte||!bouton||(profil==="choix"&&!annuler))throw Error("Boîte officielle incomplète.");
    boite.setAttribute("role","region");boite.removeAttribute("aria-modal");
    titre.textContent=options.titre || (profil==="erreur"?"Erreur":"Information");
    texte.textContent=message;
    bouton.textContent=options.libelleConfirmer || "Fermer";
    if(annuler)annuler.textContent=options.libelleAnnuler || "Retour";
    slot.replaceChildren(fragment);
    return new Promise(resolve=>{
      let fini=false;
      function fermer(v){if(fini)return;fini=true;slot.replaceChildren();resolve(v);}
      bouton.addEventListener("click",()=>fermer(true),{once:true});
      annuler?.addEventListener("click",()=>fermer(false),{once:true});
      bouton.focus();
    });
  }
  const alerte=(message,slot)=>dialogue(slot,"erreur",message);
  const information=(message,titre,slot)=>dialogue(slot,"information",message,{titre});
  const choix=(message,options,slot)=>dialogue(slot,"choix",message,options);
  const vraie=v=>v===true||v==="true"||v===1||v==="1";
  function paiementSuspensionDelaiDepasse(p){return vraie(p?.delaiPaiementDepasse)||vraie(p?.abonnementAnnuleNonPaye);}
  function messageDelaiPaiementDepasse(){return "Le règlement de cette échéance est indisponible.";}
  function formaterDatePaiementSuspension(v){if(!v)return "Non renseignée";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"});}
  function formaterMontantPaiementSuspension(v){if(v===null||v===undefined||v==="")return "Montant non renseigné";const n=Number(String(v).replace(",","."));return Number.isFinite(n)?n.toLocaleString("fr-FR",{style:"currency",currency:"EUR"}):"Montant non renseigné";}
  async function afficherEcheancesPaiementSuspension(etat) {
    const parcours = ouvrirParcours("dialogue-paiement-impaye","Régulariser mon abonnement");
    if (!parcours) return;
    const slot = parcours.contenu;
    const paiement = etat?.paiementSuspension || null;
    const orderid = String(paiement?.orderid || "").trim();
    const echeances = echeancesPaiementSuspension(paiement);
    async function afficherListe() {
      if (!slot.isConnected) return;
      const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-information.html");
      if (!slot.isConnected) return;
      const dialogue = fragment.querySelector('[data-lcdp-dialogue-reference="information"]');
      const titre = dialogue?.querySelector("[data-lcdp-dialogue-titre]");
      const texte = dialogue?.querySelector("[data-lcdp-dialogue-message]");
      const actions = dialogue?.querySelector(".lcdp-dialogue-ref__actions");
      const fermer = dialogue?.querySelector('[data-lcdp-dialogue-action="compris"]');
      if (!dialogue || !titre || !texte || !actions || !fermer) throw Error("Boîte d’échéances incomplète.");
      dialogue.setAttribute("role","region");
      dialogue.removeAttribute("aria-modal");
      titre.textContent = "Paiement en attente";
      texte.textContent = "Sélectionnez l’échéance à régulariser.";
      fermer.textContent = "Fermer";
      fermer.className = "lcdp-dialogue-ref__bouton lcdp-dialogue-ref__bouton--secondaire";
      fermer.addEventListener("click",() => parcours.fermer(),{once:true});
      for (const echeance of echeances) {
        const description = document.createElement("p");
        description.className = "lcdp-dialogue-ref__message";
        description.textContent = "Échéance " + echeance.numero + " du " + formaterDatePaiementSuspension(echeance.date) + "\n" + formaterMontantPaiementSuspension(echeance.montant) + " TTC — Non payée";
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-dialogue-ref__bouton lcdp-dialogue-ref__bouton--principal";
        bouton.textContent = "Payer";
        bouton.setAttribute("aria-label","Payer l’échéance " + echeance.numero);
        bouton.addEventListener("click",async () => {
          if (bouton.disabled) return;
          actions.querySelectorAll("button").forEach(b => b.disabled = true);
          try {
            await ouvrirPagePaiementSuspension(paiement,echeance.numero,slot,afficherListe);
          } catch (erreur) {
            console.error("Régularisation indisponible :",erreur);
            if (slot.isConnected) {
              try { await alerte("Impossible de charger le paiement. Veuillez réessayer.",slot); await afficherListe(); }
              catch { parcours.fermer(); }
            }
          }
        });
        actions.insertBefore(description,fermer);
        actions.insertBefore(bouton,fermer);
      }
      slot.replaceChildren(fragment);
      actions.querySelector("button")?.focus();
    }
    try {
      if (paiementSuspensionDelaiDepasse(paiement)) {
        await alerte(messageDelaiPaiementDepasse(),slot);
        parcours.fermer();
      } else if (!orderid) {
        await alerte("Paiement introuvable.",slot);
        parcours.fermer();
      } else if (!echeances.length) {
        await information("Aucune échéance non payée.","Échéances de paiement",slot);
        parcours.fermer();
      } else {
        await afficherListe();
      }
    } catch (erreur) {
      parcours.fermer();
      throw erreur;
    }
  }

  function echeancesPaiementSuspension(paiement) {
    const source = Array.isArray(paiement?.echeances) ? paiement.echeances : [];
    const echeances = source
      .map((echeance) => ({
        numero: Number(echeance?.numero || echeance?.echeance || 0),
        date: echeance?.date || "",
        montant: echeance?.montant ?? ""
      }))
      .filter((echeance) => echeance.numero >= 1);

    if (!echeances.length && paiement?.echeance) {
      echeances.push({
        numero: Number(paiement.echeance || 1),
        date: paiement.date || "",
        montant: paiement.montant ?? ""
      });
    }

    return echeances;
  }

  async function ouvrirPagePaiementSuspension(paiement,numeroEcheance,slot,retourListe) {
    if (!slot?.hasAttribute("data-lcdp-compte-parcours-contenu")) throw Error("Wrapper de Mon compte introuvable.");
    const orderid = String(paiement?.orderid || "").trim();
    if (!orderid || paiementSuspensionDelaiDepasse(paiement)) {
      await alerte(!orderid ? "Commande non renseignée." : messageDelaiPaiementDepasse(),slot);
      await retourListe();
      return;
    }
    const ok = await choix(
      "La régularisation de votre abonnement se fait par carte bancaire uniquement.",
      {titre:"Régulariser l’abonnement",libelleConfirmer:"Continuer vers le paiement",libelleAnnuler:"Retour"},slot
    );
    if (!ok) { await retourListe(); return; }
    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/paiement-cb.js?v=20261126-impayes-wrapper-v1");
    if (typeof window.LCDP_monterPaiementCB !== "function") throw Error("Service de paiement indisponible.");
    await window.LCDP_monterPaiementCB(slot,{
      orderid,echeance:numeroEcheance || 1,source:"suspension",retour:"",
      integre:true,quitter:() => retourListe().catch(console.error)
    });
  }


  async function obtenirPaiement() {
    const endpoint=String(cfg.workerIndexMembreUrl||cfg.WORKER_INDEX_MEMBRE_URL||cfg.W_INDEX_MEMBRE_URL||(typeof cfg.apiUrl==="function"?cfg.apiUrl("index-membre-api"):"")).replace(/\/+$/,"");
    if(!endpoint)throw Error("Service de vérification indisponible.");
    const r=await fetch(endpoint+"/index",{credentials:"include",cache:"no-store",headers:{Accept:"application/json"}});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d||d.success!==true||d.connected!==true)throw Error("Impossible de vérifier les échéances.");
    return d.paiementSuspension||d.paiementRegularisation||null;
  }
  let ouverture=null;
  function ouvrir(etat={}) {
    if(ouverture)return ouverture;
    ouverture=(async()=>{
      await assurerCSS();
      let paiement=etat.paiementSuspension||etat.paiementRegularisation||null;
      if(!paiement?.orderid || !echeancesPaiementSuspension(paiement).length) {
        const actuel=await obtenirPaiement();
        if(actuel?.orderid) paiement=actuel;
      }
      return afficherEcheancesPaiementSuspension({paiementSuspension:paiement});
    })().finally(()=>{ouverture=null;});
    return ouverture;
  }
  window.LCDP_PaiementImpaye=Object.freeze({ouvrir});
})();
