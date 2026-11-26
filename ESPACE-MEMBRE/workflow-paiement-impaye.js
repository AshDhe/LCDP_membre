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
  // Réutilise le spinner officiel LCDP c085 (arc orange et point vert).
  function attendreBouton(bouton) {
    if (!bouton || bouton.tagName !== "BUTTON") return () => {};
    const dejaDesactive = bouton.disabled;
    const ancienBusy = bouton.getAttribute("aria-busy");
    const avaitClasse = bouton.classList.contains("lcdp-action-attente");
    bouton.classList.add("lcdp-action-attente");
    bouton.disabled = true;
    bouton.setAttribute("aria-busy","true");
    return () => {
      if (!avaitClasse) bouton.classList.remove("lcdp-action-attente");
      bouton.disabled = dejaDesactive;
      if (ancienBusy === null) bouton.removeAttribute("aria-busy");
      else bouton.setAttribute("aria-busy",ancienBusy);
    };
  }
  let chargementCSS, chargementCB;
  function assurerCSS() {
    if (!chargementCSS) {
      const charger = chemin => new Promise((resolve,reject) => {
        const lien = document.createElement("link");
        lien.rel = "stylesheet";
        lien.href = url("objet",chemin);
        lien.onload = resolve;
        lien.onerror = () => {lien.remove();reject(Error("CSS officiel indisponible."));};
        document.head.appendChild(lien);
      });
      chargementCSS = Promise.all([
        charger("/CSSBASE/lcdp-lightbox-convergence.css?v=20261126-impayes-objet-v1"),
        charger("/CSSBASE/lcdp-paiements-en-attente.css?v=20261126-v1")
      ]).catch(erreur=>{chargementCSS=null;throw erreur;});
    }
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
  function ouvrirParcours(id,libelle,options={}) {
    if (document.querySelector("[data-lcdp-paiement-impaye-parcours]")) return null;
    const main = document.querySelector(".lcdp-app-wrapper > #lcdp-accueil-contenu, .lcdp-app-wrapper > .lcdp-site-main, .lcdp-site-page > .lcdp-site-main, .lcdp-app-wrapper > main, .lcdp-site-page > main");
    if (!main) throw Error("Wrapper de l’application introuvable.");
    if (main.querySelector("[data-lcdp-compte-parcours]")) throw Error("Un parcours est déjà ouvert.");
    const focus=document.activeElement, scroll=main.scrollTop;
    const anciens=Array.from(main.children).map(element=>({element,hidden:element.hidden}));
    const section=document.createElement("section");
    section.className="lcdp-impaye-parcours";
    section.setAttribute("data-lcdp-paiement-impaye-parcours","");
    section.setAttribute("data-lcdp-compte-parcours","");
    section.setAttribute("aria-label",libelle);
    const conteneur=document.createElement("div");
    conteneur.className="lcdp-impaye-conteneur";
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
      options.quitter?.();
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
      function fermer(v,action){
        if(fini)return;
        fini=true;
        if(options.transition){
          attendreBouton(action);
          bouton.disabled=true;
          if(annuler)annuler.disabled=true;
        }else slot.replaceChildren();
        resolve(v);
      }
      bouton.addEventListener("click",()=>fermer(true,bouton),{once:true});
      annuler?.addEventListener("click",()=>fermer(false,annuler),{once:true});
      bouton.focus();
    });
  }
  const alerte=(message,slot)=>dialogue(slot,"erreur",message);
  const information=(message,titre,slot)=>dialogue(slot,"information",message,{titre});
  const vraie=v=>v===true||v==="true"||v===1||v==="1";
  function paiementSuspensionDelaiDepasse(p){return vraie(p?.delaiPaiementDepasse)||vraie(p?.abonnementAnnuleNonPaye);}
  function messageDelaiPaiementDepasse(){return "Le règlement de cette échéance est indisponible.";}
  function formaterDatePaiementSuspension(v){if(!v)return "Non renseignée";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"});}
  function formaterMontantPaiementSuspension(v){if(v===null||v===undefined||v==="")return "Montant non renseigné";const n=Number(String(v).replace(",","."));return Number.isFinite(n)?n.toLocaleString("fr-FR",{style:"currency",currency:"EUR"}):"Montant non renseigné";}
  function dateParis(v) {
    if (!v) return "";
    const brut=String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(brut)) return brut;
    const d=new Date(v);
    if (!Number.isFinite(d.getTime())) return "";
    const p=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
    const get=k=>p.find(x=>x.type===k)?.value;
    return get("year")+"-"+get("month")+"-"+get("day");
  }
  function collecterEcheances(paiements,etat) {
    const groupes=new Map();
    const aujourdHui=dateParis(new Date());
    const normaliser=v=>String(v||"").trim().toLowerCase();
    const signal=etat?.paiementSuspension||etat?.paiementRegularisation;
    const signaux=Array.isArray(signal)?signal:[signal].filter(Boolean);
    const annule=p=>["cancd","annule","annulé"].includes(normaliser(p?.statutabo));
    const ajouter=(p,e)=>{
      const orderid=String(p?.orderid||"").trim();
      const numero=Number(e.numero);
      if(!Number.isInteger(numero)||numero<1||numero>3||annule(p))return;
      const cle=orderid||String(p?.idabo||"");
      if(!cle)return;
      if(!groupes.has(cle))groupes.set(cle,{...p,orderid,echeances:[]});
      const g=groupes.get(cle);
      if(!g.echeances.some(x=>x.numero===numero))g.echeances.push({...e,numero});
    };
    for(const p of paiements){
      if(!p||annule(p))continue;
      for(let n=1;n<=Math.min(3,Number(p.ech||1));n++){
        const statut=normaliser(p["etatmois"+n]);
        const date=p["datemois"+n];
        if(!["du","impaye"].includes(statut))continue;
        if(statut==="du"&&dateParis(date)>aujourdHui)continue;
        ajouter(p,{numero:n,date,montant:p["valmois"+n]});
      }
    }
    // Le signal du compte peut désigner une commande non encore présente dans les factures.
    // Ne jamais réintroduire une échéance que le service de facturation indique payée ou annulée.
    for(const p of signaux){
      if(!p?.orderid||annule(p))continue;
      const facture=paiements.find(x=>String(x?.orderid||"")===String(p.orderid));
      if(facture&&annule(facture))continue;
      const es=Array.isArray(p.echeances)?p.echeances:p.echeance?[p]:[];
      for(const e of es){
        const n=Number(e.numero||e.echeance);
        if(facture&&normaliser(facture["etatmois"+n])==="paye")continue;
        ajouter({...facture,...p},{numero:n,date:e.date,montant:e.montant});
      }
      const g=groupes.get(String(p.orderid));
      if(g&&paiementSuspensionDelaiDepasse(p))g.delaiPaiementDepasse=true;
    }
    return [...groupes.values()].map(g=>({...g,echeances:g.echeances.sort((a,b)=>a.numero-b.numero)}));
  }

  async function afficherEcheancesPaiementSuspension(groupes,options={}) {
    const parcours=ouvrirParcours("dialogue-paiement-impaye","Paiements en attente",options);
    if(!parcours)return;
    const slot=parcours.contenu;
    function afficherListe(){
      if(!slot.isConnected)return;
      const liste=document.createElement("section");
      liste.setAttribute("data-lcdp-impaye-liste","");
      liste.setAttribute("aria-label","Paiements en attente");
      const titre=document.createElement("h1");
      titre.className="lcdp-impaye-titre";
      titre.textContent="Paiements en attente";
      const texte=document.createElement("p");
      const nb=groupes.reduce((n,g)=>n+g.echeances.length,0);
      texte.className="lcdp-impaye-intro";
      texte.textContent=nb===0?"Aucune échéance non payée.":nb+" échéance"+(nb>1?"s":"")+" à régulariser. Sélectionnez le paiement souhaité.";
      liste.append(titre,texte);
      for(const paiement of groupes){
        const bloc=document.createElement("section");
        bloc.className="lcdp-impaye-groupe";
        const entete=document.createElement("h2");
        entete.textContent=[paiement.typabo||paiement.formule||"Abonnement",paiement.orderid?"Commande "+paiement.orderid:"Commande non renseignée"].join(" — ");
        bloc.appendChild(entete);
        const lignes=document.createElement("ul");
        lignes.className="lcdp-impaye-lignes";
        for(const echeance of paiement.echeances){
          const ligne=document.createElement("li");
          ligne.className="lcdp-impaye-ligne";
          const infos=document.createElement("div");
          const nom=document.createElement("strong");
          nom.textContent="Échéance "+echeance.numero+" du "+formaterDatePaiementSuspension(echeance.date);
          const montant=document.createElement("span");
          montant.textContent=formaterMontantPaiementSuspension(echeance.montant)+(echeance.montant!==null&&echeance.montant!==undefined&&echeance.montant!==""?" TTC":"");
          infos.append(nom,montant);
          const bouton=document.createElement("button");
          bouton.type="button";
          bouton.className="lcdp-dialogue-ref__bouton lcdp-dialogue-ref__bouton--principal";
          bouton.textContent="Payer";
          bouton.disabled=!paiement.orderid||paiementSuspensionDelaiDepasse(paiement);
          if(bouton.disabled)bouton.textContent="Indisponible";
          bouton.setAttribute("aria-label","Payer l’échéance "+echeance.numero+" de la commande "+paiement.orderid);
          bouton.addEventListener("click",async()=>{
            if(bouton.disabled)return;
            attendreBouton(bouton);
            liste.querySelectorAll("button").forEach(b=>b.disabled=true);
            try{
              await ouvrirPagePaiementSuspension(paiement,echeance.numero,slot,afficherListe);
            }catch(erreur){
              console.error("Régularisation indisponible :",erreur);
              if(slot.isConnected){
                try{await alerte("Impossible de charger le paiement. Veuillez réessayer.",slot);afficherListe();}
                catch{parcours.fermer();}
              }
            }
          });
          ligne.append(infos,bouton);
          lignes.appendChild(ligne);
        }
        bloc.appendChild(lignes);
        liste.appendChild(bloc);
      }
      const fermer=document.createElement("button");
      fermer.type="button";
      fermer.className="lcdp-dialogue-ref__bouton lcdp-dialogue-ref__bouton--secondaire";
      fermer.textContent="Fermer";
      fermer.addEventListener("click",()=>parcours.fermer(),{once:true});
      liste.appendChild(fermer);
      slot.replaceChildren(liste);
      liste.querySelector("button:not(:disabled)")?.focus();
    }
    try{afficherListe();}catch(erreur){parcours.fermer();throw erreur;}
  }

  async function ouvrirPagePaiementSuspension(paiement,numeroEcheance,slot,retourListe) {
    if (!slot?.hasAttribute("data-lcdp-compte-parcours-contenu")) throw Error("Wrapper de Mon compte introuvable.");
    const orderid = String(paiement?.orderid || "").trim();
    if (!orderid || paiementSuspensionDelaiDepasse(paiement)) {
      await alerte(!orderid ? "Commande non renseignée." : messageDelaiPaiementDepasse(),slot);
      await retourListe();
      return;
    }
    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/paiement-cb.js?v=20261126-main-v13");
    if (typeof window.LCDP_monterPaiementCB !== "function") throw Error("Service de paiement indisponible.");
    await window.LCDP_monterPaiementCB(slot,{
      orderid,echeance:numeroEcheance || 1,source:"suspension",retour:"",
      integre:true,quitter:() => Promise.resolve().then(retourListe).catch(console.error)
    });
  }


  async function obtenirPaiements() {
    const endpoint=String(cfg.workerFactuPaiementUrl||cfg.WORKER_FACTUPAIEMENT_URL||(typeof cfg.apiUrl==="function"?cfg.apiUrl("factupaiement-api"):"")).replace(/\/+$/,"");
    if(!endpoint)throw Error("Service de facturation indisponible.");
    const r=await fetch(endpoint+"/mes-factures",{credentials:"include",cache:"no-store",headers:{Accept:"application/json"}});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d||(d.ok!==true&&d.success!==true)||!Array.isArray(d.paiements))throw Error("Impossible de charger la liste des échéances.");
    return d.paiements;
  }
  let ouverture=null;
  function ouvrir(etat={},options={}) {
    if(ouverture)return ouverture;
    ouverture=(async()=>{
      const restaurer=attendreBouton(document.activeElement);
      try{
        const [,paiements]=await Promise.all([assurerCSS(),obtenirPaiements()]);
        return await afficherEcheancesPaiementSuspension(collecterEcheances(paiements,etat),options);
      }catch(erreur){
        await assurerCSS();
        const parcours=ouvrirParcours("dialogue-paiement-impaye","Paiements en attente",options);
        if(!parcours)throw erreur;
        try{await alerte("Impossible de charger la liste complète des échéances. Veuillez réessayer.",parcours.contenu);}
        finally{parcours.fermer();}
      }finally{restaurer();}
    })().finally(()=>{ouverture=null;});
    return ouverture;
  }
  window.LCDP_PaiementImpaye=Object.freeze({ouvrir,attendreBouton});
})();
