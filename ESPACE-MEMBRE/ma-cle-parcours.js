/* Tunnel Ma clé en six étapes : couche de navigation uniquement.
   Les décisions d'accès, la capture vidéo et les actions restent pilotées par l'existant. */
(function(global){
  "use strict";
  const NOMS = ["Session", "Accès au parc", "Check-in", "Présence", "Check-out", "Terminé"];
  const GUIDES = [
    {cle:"entree",titre:"Entrée du parc",images:["entree1.webp","entree2.webp"]},
    {cle:"checkin",titre:"Point de check-in",images:["checkin1.webp","checkin2.webp"]},
    {cle:"chemin1",titre:"Chemin d’accès à la zone réservée 1",images:["chemin1.webp"]},
    {cle:"chemin2",titre:"Chemin d’accès à la zone réservée 2",images:["chemin2.webp"]},
    {cle:"zonereservee1",titre:"Zone réservée 1",images:["zonereservee11.webp","zonereservee12.webp"]},
    {cle:"zonereservee2",titre:"Zone réservée 2",images:["zonereservee21.webp","zonereservee22.webp"]}
  ];
  const root = document.querySelector("[data-lcdp-control-access]");
  const workflow = document.querySelector("[data-lcdp-cle-workflow]");
  const conteneur = document.querySelector(".lcdp-page-cle-du-parc .lcdp-page-container");
  if(!root || !conteneur) return;

  function noeud(tag,classe,texte){
    const e=document.createElement(tag);
    if(classe)e.className=classe;
    if(texte!==undefined)e.textContent=texte;
    return e;
  }
  const nav=noeud("nav","lcdp-parcours-timeline");
  nav.setAttribute("aria-label","Progression dans Ma clé");
  nav.hidden=true;
  const liste=noeud("ol","lcdp-parcours-timeline__liste");
  const jalons=NOMS.map((titre,i)=>{
    const li=noeud("li","lcdp-parcours-timeline__jalon");
    li.append(noeud("span","lcdp-parcours-timeline__numero",String(i+1)),noeud("span","lcdp-parcours-timeline__libelle",titre));
    liste.appendChild(li);
    return li;
  });
  nav.appendChild(liste);

  const session=noeud("section","lcdp-parcours-ecran lcdp-parcours-ecran--session");
  session.setAttribute("aria-label","Étape 1 : session validée");
  session.hidden=true;
  session.append(noeud("h1","lcdp-parcours-titre","MA CLÉ"),noeud("p","lcdp-parcours-reussite","Session validée"));
  const poursuivreSession=noeud("button","lcdp-button lcdp-parcours-continuer","Continuer");
  poursuivreSession.type="button";
  session.appendChild(poursuivreSession);

  const guide=noeud("section","lcdp-parcours-ecran lcdp-parcours-ecran--guide");
  guide.setAttribute("aria-label","Étape 2 : accès au parc");
  guide.hidden=true;
  guide.appendChild(noeud("h1","lcdp-parcours-titre","Accès au parc"));
  const nomParc=noeud("p","lcdp-parcours-parc");
  const zoneCartes=noeud("div","lcdp-parcours-carrousel");
  zoneCartes.setAttribute("aria-live","polite");
  const navigation=noeud("div","lcdp-parcours-carrousel__navigation");
  const precedent=noeud("button","lcdp-button lcdp-parcours-carrousel__bouton","Précédent");
  const compteur=noeud("span","lcdp-parcours-carrousel__compteur");
  const suivant=noeud("button","lcdp-button lcdp-parcours-carrousel__bouton","Suivant");
  precedent.type=suivant.type="button";
  navigation.append(precedent,compteur,suivant);
  const poursuivreGuide=noeud("button","lcdp-button lcdp-parcours-continuer","Continuer");
  poursuivreGuide.type="button";
  guide.append(nomParc,zoneCartes,navigation,poursuivreGuide);
  conteneur.insertBefore(nav,root);
  conteneur.insertBefore(session,root);
  conteneur.insertBefore(guide,root);

  let demarre=false, etape=0, etatCourant=null, slides=[], indexSlide=0, guideCharge=false;
  let demandeGuide=0;

  function numeroEtape(etat){
    if(!etat || !etat.screen)return 3;
    if(etat.screen==="checkout_done" || etat.screen==="key_closed")return 6;
    if(etat.action==="checkout" || etat.screen==="exit_confirmed")return etat.screen==="exit_confirmed"?6:5;
    if(["active","presence","access_confirmed","guest_list","confirmation_done","expired"].includes(etat.screen))return 4;
    return 3;
  }

  function afficherEtape(numero){
    if(!demarre || !Number.isInteger(numero) || numero<1 || numero>6)return;
    etape=numero;
    nav.hidden=false;
    session.hidden=numero!==1;
    guide.hidden=numero!==2;
    const intermediaire=numero===1 || numero===2;
    // Ne détruit pas les écrans existants : ne modifie que leur visibilité.
    if(intermediaire){root.hidden=true;if(workflow)workflow.hidden=true;}
    else if(etatCourant?.screen==="active" && etatCourant?.role==="abonne"){
      root.hidden=true;
      if(workflow)workflow.hidden=false;
    }else{
      root.hidden=false;
      if(workflow)workflow.hidden=true;
    }
    jalons.forEach((li,i)=>{
      const n=i+1;
      li.dataset.etat=n<numero?"termine":n===numero?"actif":"avenir";
      if(n===numero)li.setAttribute("aria-current","step");
      else li.removeAttribute("aria-current");
    });
    conteneur.dataset.lcdpParcoursEtape=String(numero);
    nav.scrollLeft=0;
  }

  function afficherSlide(){
    zoneCartes.replaceChildren();
    if(!slides.length){
      zoneCartes.appendChild(noeud("p","lcdp-parcours-indisponible","Les indications d’accès de ce parc ne sont pas encore disponibles."));
      navigation.hidden=true;
      return;
    }
    indexSlide=Math.max(0,Math.min(indexSlide,slides.length-1));
    const slide=slides[indexSlide];
    const carte=noeud("article","lcdp-parcours-slide");
    carte.appendChild(noeud("h2","lcdp-parcours-slide__titre",slide.titre));
    if(slide.texte)carte.appendChild(noeud("p","lcdp-parcours-slide__texte",slide.texte));
    if(slide.images?.length){
      const photos=noeud("div","lcdp-parcours-slide__photos");
      slide.images.forEach(src=>{
        const img=noeud("img","lcdp-parcours-slide__image");
        img.src=src;
        img.alt=slide.titre;
        img.loading="lazy";
        img.addEventListener("error",()=>{img.hidden=true;},{once:true});
        photos.appendChild(img);
      });
      carte.appendChild(photos);
    }
    zoneCartes.appendChild(carte);
    navigation.hidden=slides.length<=1;
    precedent.disabled=indexSlide===0;
    suivant.disabled=indexSlide===slides.length-1;
    compteur.textContent=(indexSlide+1)+" / "+slides.length;
  }

  function normaliserGuide(data){
    const rubriques=data?.rubriques || data?.accesdetail || data?.parc?.accesdetail || {};
    const parc=data?.parc || {};
    const departement=String(parc.dptmt || parc.departement || "");
    const nom=String(parc.nom || parc.name || etatCourant?.reservation?.parkName || "");
    const dossier=String(parc.dossier || "").trim();
    nomParc.textContent=nom;
    slides=GUIDES.filter(g=>rubriques[g.cle]?.texte).map(g=>{
      const entree=rubriques[g.cle];
      const images=Array.isArray(entree.images) ? entree.images.filter(url=>typeof url==="string" && /^https:\/\//i.test(url)) : [];
      if(images.length===0 && departement && dossier){
        const base=typeof global.LCDP_urlObjet==="function" ? global.LCDP_urlObjet("/IMAG/ACCESPARC/") : "";
        if(base)g.images.forEach(f=>images.push(base+encodeURIComponent(departement)+"/"+encodeURIComponent(dossier)+"/"+f));
      }
      return {titre:g.titre,texte:String(entree.texte || ""),images};
    });
    indexSlide=0;
    afficherSlide();
  }

  async function chargerGuide(){
    if(guideCharge)return;
    guideCharge=true;
    const numeroDemande=++demandeGuide;
    const parc=etatCourant?.reservation?.parkName || "";
    nomParc.textContent=parc;
    zoneCartes.replaceChildren(noeud("p","lcdp-parcours-indisponible","Chargement des indications d’accès…"));
    // Lecture optionnelle : aucune route administrative ni permission ADMIN utilisée.
    const endpoint=String(global.SITE_CONFIG?.workerLaCleDuParcUrl || global.SITE_CONFIG?.WORKER_LA_CLE_DU_PARC_URL || "").replace(/\/+$/,"");
    if(!endpoint){normaliserGuide({});return;}
    try{
      const reponse=await fetch(endpoint+"/access-guide",{method:"GET",credentials:"include",cache:"no-store",headers:{"Accept":"application/json"}});
      const payload=await reponse.json().catch(()=>null);
      if(numeroDemande!==demandeGuide)return;
      if(!reponse.ok || payload?.success!==true){normaliserGuide({});return;}
      normaliserGuide(payload);
    }catch(error){
      if(numeroDemande===demandeGuide)normaliserGuide({});
    }
  }

  poursuivreSession.addEventListener("click",()=>{afficherEtape(2);chargerGuide();});
  poursuivreGuide.addEventListener("click",()=>afficherEtape(3));
  precedent.addEventListener("click",()=>{indexSlide--;afficherSlide();});
  suivant.addEventListener("click",()=>{indexSlide++;afficherSlide();});

  function demarrer(etat){
    etatCourant=etat || etatCourant;
    demarre=true;
    const n=numeroEtape(etatCourant);
    // Reprise d'une clé déjà active : ne jamais refaire artificiellement le check-in.
    afficherEtape(n>=4?n:1);
  }

  function actualiser(etat){
    etatCourant=etat || etatCourant;
    if(!demarre)return;
    const n=numeroEtape(etatCourant);
    if((etape<=2 && n===3) || (etape===4 && n===3 && etatCourant?.action!=="checkout")){
      afficherEtape(etape);
      return;
    }
    afficherEtape(n);
  }

  global.LCDP_ParcoursMaCle={demarrer,actualiser,afficherEtape};
})(window);
