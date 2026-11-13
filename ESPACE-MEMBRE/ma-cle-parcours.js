/* Tunnel Ma clé en six étapes : couche de navigation uniquement.
   Les décisions d'accès, la capture vidéo et les actions restent pilotées par l'existant. */
(function(global){
  "use strict";
  const NOMS = ["Session", "Accès au parc", "Check-in", "Présence", "Check-out", "Terminé"];
  // Rubriques et noms d'images confirmés par AccesDetail.js (administration).
  // Le circuit de diffusion des données reste à définir : aucune lecture ADMIN
  // n'est déclenchée ici depuis le navigateur membre.
  const ENTREES = [
    {cle:"entree",titre:"Entrée du parc",images:["entree1.webp","entree2.webp"]},
    {cle:"checkin",titre:"Point de check-in",images:["checkin1.webp","checkin2.webp"]}
  ];
  const ZONES_PRESENCE = [
    {cle:"chemin1",titre:"Chemin d’accès à la zone réservée 1",images:["chemin1.webp"]},
    {cle:"chemin2",titre:"Chemin d’accès à la zone réservée 2",images:["chemin2.webp"]},
    {cle:"zonereservee1",titre:"Zone réservée 1",images:["zonereservee11.webp","zonereservee12.webp"]},
    {cle:"zonereservee2",titre:"Zone réservée 2",images:["zonereservee21.webp","zonereservee22.webp"]},
    {cle:"presence",titre:"Présence 1",images:["presence11.webp","presence12.webp"]},
    {cle:"presence2",titre:"Présence 2",images:["presence21.webp","presence22.webp"]}
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

  // Consultation à l'étape 4 sans sortir du contrôle de présence existant.
  const detailsPresence=noeud("details","lcdp-parcours-details-presence");
  detailsPresence.hidden=true;
  detailsPresence.appendChild(noeud("summary","lcdp-parcours-details-presence__entete","Voir le détail des accès et de la présence"));
  const contenuPresence=noeud("div","lcdp-parcours-details-presence__contenu");
  const zonePresence=noeud("div","lcdp-parcours-carrousel");
  zonePresence.setAttribute("aria-live","polite");
  const navigationPresence=noeud("div","lcdp-parcours-carrousel__navigation");
  const precedentPresence=noeud("button","lcdp-button lcdp-button-secondary lcdp-parcours-carrousel__bouton","Précédent");
  const compteurPresence=noeud("span","lcdp-parcours-carrousel__compteur");
  const suivantPresence=noeud("button","lcdp-button lcdp-button-secondary lcdp-parcours-carrousel__bouton","Suivant");
  precedentPresence.type=suivantPresence.type="button";
  navigationPresence.append(precedentPresence,compteurPresence,suivantPresence);
  contenuPresence.append(zonePresence,navigationPresence);
  detailsPresence.appendChild(contenuPresence);
  conteneur.insertBefore(detailsPresence,root);

  let demarre=false, etape=0, etatCourant=null;
  const carrouselEntree={zone:zoneCartes,navigation,precedent,suivant,compteur,slides:[],index:0};
  const carrouselPresence={zone:zonePresence,navigation:navigationPresence,precedent:precedentPresence,suivant:suivantPresence,compteur:compteurPresence,slides:[],index:0};

  function numeroEtape(etat){
    if(!etat || !etat.screen)return 3;
    if(etat.screen==="checkout_done" || etat.screen==="key_closed")return 6;
    if(etat.action==="checkout" || etat.screen==="exit_confirmed")return etat.screen==="exit_confirmed"?6:5;
    if(etat.screen==="access_confirmed")return etat.parcoursEntre===true?4:3;
    if(["active","presence","guest_list","confirmation_done","expired"].includes(etat.screen))return 4;
    return 3;
  }

  function afficherEtape(numero){
    if(!demarre || !Number.isInteger(numero) || numero<1 || numero>6)return;
    etape=numero;
    nav.hidden=false;
    session.hidden=numero!==1;
    guide.hidden=numero!==2;
    detailsPresence.hidden=numero!==4;
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

  function afficherSlide(carrousel){
    carrousel.zone.replaceChildren();
    if(!carrousel.slides.length){
      carrousel.zone.appendChild(noeud("p","lcdp-parcours-indisponible","Les détails de ce parc ne sont pas encore disponibles."));
      carrousel.navigation.hidden=true;
      return;
    }
    carrousel.index=Math.max(0,Math.min(carrousel.index,carrousel.slides.length-1));
    const slide=carrousel.slides[carrousel.index];
    const carte=noeud("article","lcdp-parcours-slide");
    carte.appendChild(noeud("h2","lcdp-parcours-slide__titre",slide.titre));
    if(slide.texte)carte.appendChild(noeud("p","lcdp-parcours-slide__texte",slide.texte));
    if(slide.images.length){
      const photos=noeud("div","lcdp-parcours-slide__photos");
      slide.images.forEach((src,index)=>{
        const img=noeud("img","lcdp-parcours-slide__image");
        img.src=src;
        img.alt=slide.titre+" — photo "+(index+1);
        img.loading="lazy";
        img.addEventListener("error",()=>{img.hidden=true;},{once:true});
        photos.appendChild(img);
      });
      carte.appendChild(photos);
    }
    carrousel.zone.appendChild(carte);
    carrousel.navigation.hidden=carrousel.slides.length<=1;
    carrousel.precedent.disabled=carrousel.index===0;
    carrousel.suivant.disabled=carrousel.index===carrousel.slides.length-1;
    carrousel.compteur.textContent=(carrousel.index+1)+" / "+carrousel.slides.length;
  }

  function urlPhotoSure(chemin){
    if(typeof chemin!=="string" || !chemin.trim())return null;
    try{
      const url=new URL(chemin,global.location.href);
      return url.protocol==="https:" ? url.href : null;
    }catch{return null;}
  }

  function preparerSlides(liste,rubriques,photosParFichier){
    return liste.map(g=>{
      const valeur=rubriques[g.cle];
      const item=valeur && typeof valeur==="object" && !Array.isArray(valeur) ? valeur : {};
      const texte=typeof item.texte==="string" ? item.texte.trim() : "";
      const imagesBrutes=[
        ...(Array.isArray(item.images)?item.images:[]),
        ...(Array.isArray(item.photos)?item.photos:[]),
        ...g.images.map(f=>photosParFichier[f]).filter(Boolean)
      ];
      const images=[...new Set(imagesBrutes.map(urlPhotoSure).filter(Boolean))];
      return texte || images.length ? {titre:g.titre,texte,images} : null;
    }).filter(Boolean);
  }

  // Point d'entrée réservé au futur canal membre autorisé.
  // Aucune URL/autorisation de l'administration n'est supposée ici.
  function recevoirAccesDetail(donnees){
    if(!donnees || donnees.success===false)return false;
    const parc=donnees.parc || {};
    const attendu=String(etatCourant?.parkId || etatCourant?.reservation?.parkId || "").trim();
    const recu=String(parc.idparc || parc.parkId || "").trim();
    // Ne jamais afficher les informations d'un autre parc.
    if(!attendu || !recu || attendu!==recu)return false;
    const rubriques=donnees.rubriques || donnees.accesdetail || parc.accesdetail;
    if(!rubriques || typeof rubriques!=="object" || Array.isArray(rubriques))return false;
    const photosParFichier=donnees.photosParFichier && typeof donnees.photosParFichier==="object"
      ? donnees.photosParFichier : {};
    nomParc.textContent=String(parc.nom || etatCourant?.reservation?.parkName || "");
    carrouselEntree.slides=preparerSlides(ENTREES,rubriques,photosParFichier);
    carrouselPresence.slides=preparerSlides(ZONES_PRESENCE,rubriques,photosParFichier);
    carrouselEntree.index=0;
    carrouselPresence.index=0;
    afficherSlide(carrouselEntree);
    afficherSlide(carrouselPresence);
    return true;
  }

  poursuivreSession.addEventListener("click",()=>{
    nomParc.textContent=String(etatCourant?.reservation?.parkName || "");
    afficherSlide(carrouselEntree);
    afficherEtape(2);
  });
  poursuivreGuide.addEventListener("click",()=>afficherEtape(3));
  precedent.addEventListener("click",()=>{carrouselEntree.index--;afficherSlide(carrouselEntree);});
  suivant.addEventListener("click",()=>{carrouselEntree.index++;afficherSlide(carrouselEntree);});
  precedentPresence.addEventListener("click",()=>{carrouselPresence.index--;afficherSlide(carrouselPresence);});
  suivantPresence.addEventListener("click",()=>{carrouselPresence.index++;afficherSlide(carrouselPresence);});
  afficherSlide(carrouselPresence);

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

  global.LCDP_ParcoursMaCle={demarrer,actualiser,afficherEtape,recevoirAccesDetail};
})(window);
