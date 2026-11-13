/* MA CLÉ : parcours dans le wrapper unique de l'espace membre.
   Lecture des accès en défilement vertical, sans navigation ni second dialogue.
   Les droits, captures vidéo, invités et checkout restent gérés par les modules existants. */
(function(global){
  "use strict";

  const NOMS=["Session","Accès au parc","Check-in","Présence","Check-out","Terminé"];
  const ETAPE_2=[
    {cle:"entree",titre:"Entrée",images:["entree1.webp","entree2.webp"]},
    {cle:"checkin",titre:"Check-in",images:["checkin1.webp","checkin2.webp"]}
  ];
  const ETAPE_4=[
    {cle:"chemin1",titre:"Chemin d’accès à la zone réservée 1",images:["chemin1.webp"]},
    {cle:"chemin2",titre:"Chemin d’accès à la zone réservée 2",images:["chemin2.webp"]},
    {cle:"zonereservee1",titre:"Zone réservée 1",images:["zonereservee11.webp","zonereservee12.webp"]},
    {cle:"zonereservee2",titre:"Zone réservée 2",images:["zonereservee21.webp","zonereservee22.webp"]},
    {cle:"presence",titre:"Présence 1",images:["presence11.webp","presence12.webp"]},
    {cle:"presence2",titre:"Présence 2",images:["presence21.webp","presence22.webp"]}
  ];
  const conteneur=document.querySelector(".lcdp-page-cle-du-parc .lcdp-site-page .lcdp-page-container");
  const controle=document.querySelector("[data-lcdp-control-access]");
  const workflow=document.querySelector("[data-lcdp-cle-workflow]");
  if(!conteneur || !controle || !workflow)return;

  function creer(tag,classe,texte){
    const element=document.createElement(tag);
    if(classe)element.className=classe;
    if(texte!==undefined)element.textContent=texte;
    return element;
  }
  function bouton(libelle,classe){
    const element=creer("button","lcdp-button"+(classe?" "+classe:""),libelle);
    element.type="button";
    return element;
  }

  const timeline=creer("nav","lcdp-parcours-timeline");
  timeline.setAttribute("aria-label","Progression dans Ma clé");
  timeline.hidden=true;
  const liste=creer("ol","lcdp-parcours-timeline__liste");
  const jalons=NOMS.map((nom,index)=>{
    const li=creer("li","lcdp-parcours-timeline__jalon");
    li.append(creer("span","lcdp-parcours-timeline__numero",String(index+1)),creer("span","lcdp-parcours-timeline__libelle",nom));
    liste.appendChild(li);
    return li;
  });
  timeline.appendChild(liste);

  const session=creer("section","lcdp-parcours-ecran lcdp-parcours-ecran--session");
  session.setAttribute("aria-label","Étape 1 : session validée");
  session.hidden=true;
  session.append(creer("h1","lcdp-parcours-titre","MA CLÉ"),creer("p","lcdp-parcours-reussite","Session validée"));
  const continuerSession=bouton("Continuer","lcdp-parcours-continuer");
  session.appendChild(continuerSession);

  const entree=creer("section","lcdp-parcours-ecran lcdp-parcours-ecran--entree");
  entree.setAttribute("aria-label","Étape 2 : accès au parc");
  entree.hidden=true;
  entree.appendChild(creer("h1","lcdp-parcours-titre","Accès au parc"));
  const nomParc=creer("p","lcdp-parcours-parc");
  const detailsEntree=bouton("Accès détail","lcdp-parcours-bouton-detail");
  const continuerEntree=bouton("Continuer","lcdp-parcours-continuer");
  entree.append(nomParc,detailsEntree,continuerEntree);

  const detailsPresence=creer("div","lcdp-parcours-detail-action");
  detailsPresence.hidden=true;
  const boutonPresence=bouton("Accès détail","lcdp-parcours-bouton-detail");
  detailsPresence.appendChild(boutonPresence);

  // Il s'agit d'un écran du même wrapper, pas d'une modale ni d'un second wrapper.
  const consultation=creer("section","lcdp-parcours-consultation");
  consultation.setAttribute("aria-label","Détail des accès");
  consultation.hidden=true;
  const entete=creer("header","lcdp-parcours-consultation__entete");
  const titreConsultation=creer("h1","lcdp-parcours-consultation__titre","Accès détail");
  const fermer=bouton("×","lcdp-parcours-consultation__fermer");
  fermer.setAttribute("aria-label","Fermer le détail des accès");
  entete.append(titreConsultation,fermer);
  const contenu=creer("div","lcdp-parcours-consultation__contenu");
  consultation.append(entete,contenu);

  // Toutes les étapes et leur lecture restent dans le même conteneur existant.
  conteneur.insertBefore(timeline,controle);
  conteneur.insertBefore(session,controle);
  conteneur.insertBefore(entree,controle);
  conteneur.insertBefore(detailsPresence,controle);
  conteneur.insertBefore(consultation,controle);

  let demarre=false;
  let etape=0;
  let etatCourant=null;
  let consultationOuverte=false;
  let boutonOrigine=null;
  let donnees={etape2:[],etape4:[]};

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
    timeline.hidden=false;
    consultation.hidden=!consultationOuverte;
    session.hidden=consultationOuverte || numero!==1;
    entree.hidden=consultationOuverte || numero!==2;
    detailsPresence.hidden=consultationOuverte || numero!==4;
    const visibleControle=!consultationOuverte && numero>=3 && !(etatCourant?.screen==="active" && etatCourant?.role==="abonne");
    const visibleWorkflow=!consultationOuverte && numero>=3 && etatCourant?.screen==="active" && etatCourant?.role==="abonne";
    controle.hidden=!visibleControle;
    workflow.hidden=!visibleWorkflow;
    if(numero===2)nomParc.textContent=String(etatCourant?.reservation?.parkName || nomParc.textContent || "");
    jalons.forEach((li,i)=>{
      const rang=i+1;
      li.dataset.etat=rang<numero?"termine":rang===numero?"actif":"avenir";
      if(rang===numero)li.setAttribute("aria-current","step");
      else li.removeAttribute("aria-current");
    });
    conteneur.dataset.lcdpParcoursEtape=String(numero);
  }

  function urlImage(chemin){
    if(typeof chemin!=="string" || !chemin.trim())return null;
    try{
      const url=new URL(chemin,global.location.href);
      return url.protocol==="https:"?url.href:null;
    }catch{return null;}
  }

  function lireRubriques(references,rubriques,photosParFichier){
    return references.map(reference=>{
      const valeur=rubriques[reference.cle];
      const source=valeur && typeof valeur==="object" && !Array.isArray(valeur)?valeur:{};
      const texte=typeof source.texte==="string"?source.texte.trim():"";
      const photos=[
        ...(Array.isArray(source.images)?source.images:[]),
        ...(Array.isArray(source.photos)?source.photos:[]),
        ...reference.images.map(nom=>photosParFichier[nom]).filter(Boolean)
      ];
      const images=[...new Set(photos.map(urlImage).filter(Boolean))];
      return texte || images.length?{titre:reference.titre,texte,images}:null;
    }).filter(Boolean);
  }

  function afficherRubriques(rubriques){
    contenu.replaceChildren();
    if(!rubriques.length){
      contenu.appendChild(creer("p","lcdp-parcours-consultation__vide","Les informations d’accès ne sont pas encore disponibles."));
      return;
    }
    rubriques.forEach(rubrique=>{
      const section=creer("section","lcdp-parcours-consultation__rubrique");
      section.appendChild(creer("h2","lcdp-parcours-consultation__sous-titre",rubrique.titre));
      if(rubrique.texte){
        const texte=creer("div","lcdp-parcours-consultation__texte",rubrique.texte);
        section.appendChild(texte);
      }
      if(rubrique.images.length){
        const galerie=creer("div","lcdp-parcours-consultation__images");
        rubrique.images.forEach((url,index)=>{
          const figure=creer("figure","lcdp-parcours-consultation__image-bloc");
          const image=creer("img","lcdp-parcours-consultation__image");
          image.src=url;
          image.alt=rubrique.titre+" — photo "+(index+1);
          image.loading="lazy";
          image.addEventListener("error",()=>{figure.hidden=true;},{once:true});
          figure.appendChild(image);
          galerie.appendChild(figure);
        });
        section.appendChild(galerie);
      }
      contenu.appendChild(section);
    });
  }

  function ouvrirDetails(numero,boutonSource){
    if(!demarre || consultationOuverte || etape!==numero)return;
    boutonOrigine=boutonSource;
    consultationOuverte=true;
    afficherRubriques(numero===2?donnees.etape2:donnees.etape4);
    afficherEtape(etape);
    fermer.focus();
    consultation.scrollIntoView({block:"start",behavior:"auto"});
  }

  function fermerDetails(){
    if(!consultationOuverte)return;
    consultationOuverte=false;
    afficherEtape(etape);
    boutonOrigine?.focus();
    boutonOrigine=null;
  }

  continuerSession.addEventListener("click",()=>afficherEtape(2));
  continuerEntree.addEventListener("click",()=>afficherEtape(3));
  detailsEntree.addEventListener("click",()=>ouvrirDetails(2,detailsEntree));
  boutonPresence.addEventListener("click",()=>ouvrirDetails(4,boutonPresence));
  fermer.addEventListener("click",fermerDetails);

  // Le raccordement au circuit de publication des données sera fait séparément.
  // Refus systématique d'une fiche ne correspondant pas au parc de la réservation.
  function recevoirAccesDetail(reponse){
    if(!reponse || reponse.success===false)return false;
    const parc=reponse.parc || {};
    const attendu=String(etatCourant?.parkId || etatCourant?.reservation?.parkId || "").trim();
    const recu=String(parc.idparc || parc.parkId || "").trim();
    if(!attendu || !recu || attendu!==recu)return false;
    const rubriques=reponse.rubriques || reponse.accesdetail || parc.accesdetail;
    if(!rubriques || typeof rubriques!=="object" || Array.isArray(rubriques))return false;
    const photos=reponse.photosParFichier && typeof reponse.photosParFichier==="object"
      ?reponse.photosParFichier:{};
    donnees={
      etape2:lireRubriques(ETAPE_2,rubriques,photos),
      etape4:lireRubriques(ETAPE_4,rubriques,photos)
    };
    nomParc.textContent=String(parc.nom || etatCourant?.reservation?.parkName || "");
    if(consultationOuverte)afficherRubriques(etape===2?donnees.etape2:donnees.etape4);
    return true;
  }

  function demarrer(etat){
    etatCourant=etat || etatCourant;
    demarre=true;
    const stade=numeroEtape(etatCourant);
    afficherEtape(stade>=4?stade:1);
  }

  function actualiser(etat){
    etatCourant=etat || etatCourant;
    if(!demarre)return;
    const stade=numeroEtape(etatCourant);
    if(consultationOuverte){
      // Le contrôle existant continue d'évoluer pendant la lecture.
      // En cas de checkout/fin, le détail se ferme pour refléter l'état réel.
      if(stade!==etape){consultationOuverte=false;boutonOrigine=null;}
      else{afficherEtape(etape);return;}
    }
    if((etape<=2 && stade===3) || (etape===4 && stade===3 && etatCourant?.action!=="checkout")){
      afficherEtape(etape);
      return;
    }
    afficherEtape(stade);
  }

  global.LCDP_ParcoursMaCle={demarrer,actualiser,afficherEtape,recevoirAccesDetail};
})(window);
