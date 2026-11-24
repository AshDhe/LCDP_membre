(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "mes-informations";

  const ENDPOINT_MON_COMPTE_MEMBRE = construireEndpointApi(
    "workerMonCompteMembreUrl",
    "WORKER_MON_COMPTE_MEMBRE_URL",
    "mon-compte-membre-api"
  );

  // Source de repli du téléphone enregistré lors de la demande de DA : membres.tel.
  const ENDPOINT_DA_MEMBRE_COMPTE = construireEndpointApi(
    "workerDaMembreUrl",
    "WORKER_DA_MEMBRE_URL",
    "da-membre-api"
  );

  const ENDPOINT_ABONNEMENTS_COMPTE = construireEndpointApi(
    "workerAboMembreUrl", "WORKER_ABO_MEMBRE_URL", "abo-membre-api"
  );

  const ENDPOINT_PLANNING_COMPTE = construireEndpointApi(
    "workerPlanningMembreUrl", "WORKER_PLANNING_MEMBRE_URL", "planning-membre-api"
  );

  const ENDPOINT_INVITER_MEMBRE = construireEndpointApi(
    "workerInviterMembreUrl",
    "WORKER_INVITER_MEMBRE_URL",
    "inviter-membre-api"
  );

  const ENDPOINT_MAJ_EMAIL_MEMBRE = construireEndpointApi(
    "workerMajEmailMembreUrl",
    "WORKER_MAJ_EMAIL_MEMBRE_URL",
    "maj-email-membre-api"
  );

  const ENDPOINT_MAJ_PARRAIN_MEMBRE = construireEndpointApi(
    "workerMajParrainMembreUrl",
    "WORKER_MAJ_PARRAIN_MEMBRE_URL",
    "maj-parrain-membre-api"
  );

  const ENDPOINT_MAJ_DEPARTEMENT_MEMBRE = construireEndpointApi(
    "workerMajDepartementMembreUrl",
    "WORKER_MAJ_DEPARTEMENT_MEMBRE_URL",
    "maj-dptmt-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_PAIEMENT_CB = construireUrlMembre("/ESPACE-MEMBRE/paiement-cb.html");

  let pageInitialisee = false;
  let redirectionCompteEnCours = false;
  let emailMembreActuel = "";

  const PAGE_POINTS_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/mes-points.html");
  // Affichage suspendu pour tous les membres. Les calculs et journaux restent actifs.
  const AFFICHAGE_POINTS_COMPTE_ACTIF = false;

  function autoriserAffichagePointsCompte() {
    return AFFICHAGE_POINTS_COMPTE_ACTIF;
  }
  const PAGE_ABONNEMENT_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/abonnement-membre.html");
  const PAGE_FACTURES_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/mes-factures-membre.html");

  let compteMembreActuel = null;
  let versionChargementAbonnementsCompte = 0;
  let abonnementPermanentCompte = false;
  let promesseChargementDiginumCompte = null;

  // Même texte et même présentation pour les champs bancaires et d'adresse
  // restant à renseigner lors de la demande de DA.
  const CHAMPS_A_RENSEIGNER_AVEC_DA = new Set([
    "iban", "swift", "rib", "adresse1", "adresse2", "adresse3"
  ]);

  const champsCompte = [
    {
      section: "Mon compte",
      id: "champ-nom-membre",
      name: "nom",
      label: "Nom",
      type: "text",
      key: "nom"
    },
    {
      section: "Mon compte",
      id: "champ-prenom-membre",
      name: "prenom",
      label: "Prénom",
      type: "text",
      key: "prenom"
    },
    {
      section: "Mon compte",
      id: "champ-membre-depuis",
      name: "membreDepuisAffichage",
      label: "Inscription",
      type: "text",
      key: "membreDepuisAffichage"
    },
    {
      section: "Mon compte",
      id: "champ-alias-membre",
      name: "alias",
      label: "Alias",
      type: "text",
      key: "alias",
      action: {
        id: "modifier-alias-membre",
        texte: "Modifier l'alias",
        mode: "picto"
      }
    },
    {
      section: "Mon compte",
      id: "champ-majorite-membre",
      name: "majoriteAffichage",
      label: "Majorité",
      type: "text",
      key: "majoriteAffichage",
      action: {
        id: "modifier-majorite-membre",
        texte: "Demander la modification de la majorité à l’administrateur",
        mode: "picto",
        pictoRouge: true,
        securite: true
      }
    },
    {
      section: "Sécurité du compte",
      id: "champ-email-membre",
      name: "email",
      label: "E-mail",
      type: "email",
      key: "email",
      action: {
        id: "modifier-email-membre",
        texte: "Modifier l'e-mail",
        mode: "picto",
        pictoRouge: true
      }
    },
    {
      section: "Sécurité du compte",
      id: "champ-code-a-membre",
      name: "codeAAffichage",
      label: "CODA",
      type: "text",
      key: "codeAAffichage",
      action: {
        id: "modifier-code-a-membre",
        texte: "Modifier le CODA",
        mode: "picto",
        pictoRouge: true
      }
    },
    {
      section: "Sécurité du compte",
      id: "champ-code-r-membre",
      name: "codeRAffichage",
      label: "CODR",
      type: "text",
      key: "codeRAffichage",
      action: {
        id: "modifier-code-r-membre",
        texte: "Demander la modification du CODR",
        mode: "picto",
        pictoRouge: true
      }
    },
    {
      section: "Sécurité du compte",
      id: "champ-geolocalisation-membre",
      name: "geolocalisationAffichage",
      label: "Géolocalisation",
      type: "text",
      key: "geolocalisationAffichage",
      action: {id:"modifier-geolocalisation-membre",texte:"Mettre à jour votre autorisation de géolocalisation",mode:"picto",pictoRouge:true}
    },
    {
      section: "Sécurité du compte",
      id: "champ-telephone-membre",
      name: "telephoneAffichage",
      label: "Numéro de téléphone",
      type: "tel",
      key: "telephoneAffichage",
      action: {
        id: "modifier-telephone-membre",
        texte: "Modifier le numéro de téléphone",
        mode: "picto",
        neutre: true
      }
    },
    {
      section: "Club",
      id: "champ-statut-membre",
      name: "statutAffichage",
      label: "Membre",
      type: "text",
      key: "statutAffichage"
    },
    {
      section: "Club",
      id: "champ-departement-membre",
      name: "departementAffichage",
      label: "Département",
      type: "text",
      key: "departementAffichage",
      action: {
        id: "modifier-departement-membre",
        texte: "Modifier le département",
        mode: "picto"
      }
    },
    {
      section: "Club",
      id: "champ-da-membre",
      name: "daAffichage",
      label: "Droit d’abonnement (DA)",
      type: "text",
      key: "daAffichage"
    },
    {
      section: "Club",
      id: "champ-points-club-membre",
      name: "pointsClubAffichage",
      label: "Points club",
      type: "text",
      key: "pointsClubAffichage",
      action: {
        id: "voir-mes-points",
        texte: "Voir mes points"
      },
      badge: {
        id: "badge-points-club-membre",
        type: "points"
      }
    },
    {
      section: "Règlement",
      id: "champ-reglement-club",
      name: "reglementClubAffichage",
      label: "Règlement du club",
      type: "text",
      key: "reglementClubAffichage",
      lien: {
        texteLien: "Lire",
        href: "/ESPACE-PUBLIC/reglement-club.html"
      }
    },
    {
      section: "Règlement",
      id: "champ-reglement-application",
      name: "reglementApplicationAffichage",
      label: "Règlement de l’application",
      type: "text",
      key: "reglementApplicationAffichage",
      lien: {
        texteLien: "Lire",
        href: "/ESPACE-PUBLIC/reglement-app.html"
      }
    },
    {
      section: "Règlement",
      id: "champ-cgv-membre",
      name: "cgvAffichage",
      label: "CGV en cours d’application",
      type: "text",
      key: "cgvAffichage",
      lien: {
        texteLien: "Lire",
        href: "/ESPACE-MEMBRE/cgv-lcdp.html",
        espace: "membre",
        sansValeur: true
      }
    },
    {
      section: "IBAN",
      id: "champ-iban-membre",
      name: "iban",
      label: "Numéro IBAN",
      type: "text",
      key: "iban",
      action: {
        id: "modifier-iban-membre",
        texte: "Modifier l'IBAN",
        mode: "picto",
        champ: "iban",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "IBAN",
      id: "champ-swift-membre",
      name: "swift",
      label: "Code BIC / SWIFT",
      type: "text",
      key: "swift",
      action: {
        id: "modifier-swift-membre",
        texte: "Modifier le SWIFT",
        mode: "picto",
        champ: "swift",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "IBAN",
      id: "champ-rib-membre",
      name: "rib",
      label: "Titulaire du compte",
      type: "text",
      key: "rib",
      action: {
        id: "modifier-rib-membre",
        texte: "Modifier le nom du titulaire",
        mode: "picto",
        champ: "rib",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "Adresse de facturation",
      id: "champ-adresse1-membre",
      name: "adresse1",
      label: "Adresse 1",
      type: "text",
      key: "adresse1",
      action: {
        id: "modifier-adresse1-membre",
        texte: "Modifier l'adresse de facturation",
        mode: "picto",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "Adresse de facturation",
      id: "champ-adresse2-membre",
      name: "adresse2",
      label: "Adresse 2",
      type: "text",
      key: "adresse2",
      action: {
        id: "modifier-adresse2-membre",
        texte: "Modifier l'adresse de facturation",
        mode: "picto",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "Adresse de facturation",
      id: "champ-adresse3-membre",
      name: "adresse3",
      label: "Adresse 3",
      type: "text",
      key: "adresse3",
      action: {
        id: "modifier-adresse3-membre",
        texte: "Modifier l'adresse de facturation",
        mode: "picto",
        pictoRouge: true,
        affichageDaOui: true
      }
    }
  ];

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    if (pageInitialisee) return;
    pageInitialisee = true;

    try {
      await initialiserBandeau();
      await initialiserFooter();
      await initialiserFormulaireInformations();
      await chargerCompteMembre();
      terminerAttenteCompte();
    } catch (error) {
      console.error("Erreur mes informations membre :", error);
      // L'alerte doit rester accessible en cas d'erreur, sans masque de chargement.
      terminerAttenteCompte();
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function terminerAttenteCompte() {
    if (redirectionCompteEnCours) return;
    document.documentElement.classList.add("lcdp-compte-pret");
    document.body.classList.add("lcdp-compte-pret");
    document.getElementById("lcdp-mon-compte-attente-initiale")?.remove();
  }

  async function initialiserFormulaireInformations() {
    await attendreCreateurFormulaire();

    const form = await window.LCDP_creerFormulaire("lcdp-mes-informations-slot", {
      id: "form-mes-informations-membre",
      ariaLabel: "Informations du compte membre",
      mode: "lecture",
      titre: "",
      sousTitre: "",
      champs: champsCompte.map((champ) => ({
        id: champ.id,
        name: champ.name,
        label: champ.label,
        type: champ.type || "text"
      }))
    });

    if (!form) {
      throw new Error("Formulaire mes informations introuvable.");
    }

    const titreFormulaire = form.querySelector("[data-lcdp-formulaire-title]");
    if (titreFormulaire) {
      titreFormulaire.textContent = "";
      titreFormulaire.hidden = true;
    }

    const sousTitreFormulaire = form.querySelector("[data-lcdp-formulaire-subtitle], [data-lcdp-formulaire-sous-titre]");
    if (sousTitreFormulaire) {
      sousTitreFormulaire.textContent = "";
      sousTitreFormulaire.hidden = true;
    }

    const zoneActions = form.querySelector("[data-lcdp-formulaire-actions]");
    if (zoneActions) {
      zoneActions.hidden = true;
    }

    ajouterTitresSectionsCompte();

    champsCompte.forEach((champ) => {
      const input = document.getElementById(champ.id);

      if (input) {
        if ("readOnly" in input) {
          input.readOnly = true;
        }

        input.value = "Chargement...";
      }

      marquerChampLectureSeuleInfo(champ.id);

      if (champ.action) {
        ajouterBoutonModificationApresChamp(champ.id, champ.action);
      }

      if (champ.badge) {
        ajouterBadgeInformationDansChamp(champ.id, champ.badge);
      }

      if (champ.lien) {
        ajouterLienInformationApresChamp(champ.id, champ.lien);
      }
    });

    ajouterActionsAdresseFacturation();
    initialiserActionsModification();
    initialiserZoneSelfie();
    structurerSectionsCompte(form);
  }

  // Équipements effectivement attribués au membre, jamais de bracelet de démonstration.
  let equipementsPresenceActuels=[];
  function afficherEquipementsPresence(equipements){
    const liste=document.getElementById("lcdp-compte-equipements-temoins");
    if(!liste)return;
    const fragment=document.createDocumentFragment();
    for(const equipement of equipements){
      const id=Number(equipement.idclemembre);
      if(!Number.isSafeInteger(id)||id<1)continue;
      const ligne=document.createElement("div");
      ligne.className="lcdp-box-champ-formulaire lcdp-compte-equipement-temoin";
      ligne.setAttribute("data-lcdp-box-champ-formulaire","");
      const labelZone=document.createElement("div");labelZone.className="lcdp-box-champ-formulaire__label-zone";
      const label=document.createElement("span");label.className="lcdp-box-champ-formulaire__label";
      label.className="lcdp-box-champ-formulaire__lecture";
      label.textContent=equipement.nom || "Témoin La Clé du Parc";labelZone.appendChild(label);
      const control=document.createElement("div");control.className="lcdp-box-champ-formulaire__control";
      control.setAttribute("data-lcdp-champ-control","");
      const input=document.createElement("input");input.type="text";input.readOnly=true;
      input.className="lcdp-box-champ-formulaire__lecture";
      input.setAttribute("aria-label","Wi-Fi de "+(equipement.nom||"ce témoin"));
      input.value=equipement.wifi?.principal?.ssid || "Wi-Fi à configurer";
      control.appendChild(input);ligne.append(labelZone,control);
      const idBouton="modifier-wifi-temoin-"+id;
      ajouterPictoModificationDansChamp(input,ligne,{
        id:idBouton,texte:"Modifier le Wi-Fi de "+(equipement.nom||"ce témoin"),
        mode:"picto",pictoRouge:true
      });
      ligne.querySelector("#"+idBouton)?.addEventListener("click",()=>ouvrirWifiTemoin(equipement,"ajouter"));
      const precedent=equipement.wifi?.secours?.ssid;
      if(precedent){
        const note=document.createElement("p");note.className="lcdp-box-champ-formulaire__aide";
        note.textContent="Wi-Fi précédent : "+precedent;ligne.appendChild(note);
        const commandes=document.createElement("div");commandes.className="lcdp-box-formulaire__actions lcdp-compte-equipements__actions";
        for(const [titre,operation] of [["Réactiver","basculer"],["Supprimer","supprimer_secours"]]){
          const bouton=document.createElement("button");bouton.type="button";
          bouton.className="lcdp-button lcdp-button-secondary";bouton.textContent=titre;
          bouton.setAttribute("aria-label",titre+" le Wi-Fi précédent de "+(equipement.nom||"ce témoin"));
          bouton.addEventListener("click",()=>ouvrirWifiTemoin(equipement,operation));
          commandes.appendChild(bouton);
        }
        ligne.appendChild(commandes);
      }
      fragment.appendChild(ligne);
    }
    const aDesTemoins=fragment.childNodes.length>0;
    const ligne=document.createElement("div");
    ligne.className="lcdp-box-champ-formulaire";
    ligne.setAttribute("data-lcdp-box-champ-formulaire","");
    const labelZone=document.createElement("div");
    labelZone.className="lcdp-box-champ-formulaire__label-zone";
    const label=document.createElement("span");
    label.className="lcdp-box-champ-formulaire__label";
    label.textContent="Témoin La Clé du Parc";
    const acheter=document.createElement("a");
    acheter.className="lcdp-ui-badge lcdp-ui-badge--action lcdp-ui-badge--amber";
    acheter.textContent=aDesTemoins?"Ajouter":"Acheter";
    acheter.href=construireUrlPublic("/ESPACE-PUBLIC/boutique.html#lcdp-boutique-temoins");
    labelZone.append(label,acheter);
    ligne.append(labelZone);
    if(!aDesTemoins){
      const valeur=document.createElement("span");
      valeur.className="lcdp-box-champ-formulaire__lecture";
      valeur.textContent="–";
      ligne.append(valeur);
    }
    if(aDesTemoins){
      const contenu=document.createElement("div");
      contenu.className="lcdp-compte-equipements__liste";
      contenu.append(fragment);
      ligne.append(contenu);
    }
    liste.replaceChildren(ligne);
  }
  async function chargerEquipementsPresence(){
    const liste=document.getElementById("lcdp-compte-equipements-temoins");
    if(!liste)return;
    try{
      const r=await fetch(ENDPOINT_MON_COMPTE_MEMBRE+"/equipements-presence",{credentials:"include",cache:"no-store"});
      const d=await r.json().catch(()=>null);
      if(r.status===401){redirigerConnexionMembre("inactive");return;}
      if(!r.ok||!d?.ok||!Array.isArray(d.equipements))throw Error("Liste indisponible.");
      equipementsPresenceActuels=d.equipements;
      afficherEquipementsPresence(d.equipements);
    }catch{
      equipementsPresenceActuels=[];
      const erreur=document.createElement("p");
      erreur.className="lcdp-box-formulaire__note";erreur.setAttribute("role","status");
      erreur.textContent="Les témoins de présence sont momentanément indisponibles.";
      liste.replaceChildren(erreur);
    }
  }


  let modificationWifiTemoinEnCours=false;
  async function ouvrirWifiTemoin(equipement,operation="ajouter"){
    if(modificationWifiTemoinEnCours)return;
    modificationWifiTemoinEnCours=true;
    try{
      const id=Number(equipement?.idclemembre);
      if(!Number.isSafeInteger(id)||id<1)throw Error("Témoin invalide.");
      const ajouter=operation==="ajouter";
      if(!ajouter && !equipement.wifi?.secours?.ssid)throw Error("Aucun réseau précédent.");
      const champs=ajouter?[
        {id:"wifi-temoin-ssid",name:"ssid",label:"Nom du réseau Wi-Fi",type:"text",
          required:true,maxlength:32,autocomplete:"off",value:equipement.wifi?.principal?.ssid||"",
          nettoyer:v=>v,valider:v=>new TextEncoder().encode(v).length>32?"Nom de réseau trop long (32 octets maximum).":""},
        {id:"wifi-temoin-password",name:"password",label:"Mot de passe Wi-Fi",
          type:"password",required:true,maxlength:64,autocomplete:"new-password",nettoyer:v=>v,
          valider:v=>v.length>=8 && v.length<=64?"":"Mot de passe Wi-Fi invalide."}
      ]:[];
      champs.push({id:"wifi-temoin-coda",name:"coda",label:"Confirmer avec votre CODA",
        type:"coda",required:true,valider:v=>/^[0-9]{4}$/.test(v)?"":"Saisissez les quatre chiffres."});
      const message=ajouter
        ? "Le nouveau Wi-Fi devient principal. Le précédent reste en secours. Le témoin reçoit la mise à jour lorsqu’il possède une connexion."
        : operation==="basculer"
          ? "Le réseau précédent redevient principal. Confirmez avec votre CODA."
          : "Supprimer le réseau précédent du témoin. Confirmez avec votre CODA.";
      await ouvrirDialogueChamp({
        titre:"Wi-Fi — "+(equipement.nom||"Témoin"),libelleValider:"Valider",message,champs,
        onSubmit:async donnees=>{
          const payload={idclemembre:id,operation,coda:donnees.coda};
          if(ajouter){payload.ssid=donnees.ssid;payload.password=donnees.password;}
          const r=await fetch(ENDPOINT_MON_COMPTE_MEMBRE+"/temoin-wifi",{
            method:"POST",credentials:"include",cache:"no-store",
            headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
          const d=await r.json().catch(()=>null);
          if(r.status===401){redirigerConnexionMembre("inactive");return true;}
          if(!d)throw Error("Réponse non confirmée. Vérifiez l’état du témoin avant de réessayer.");
          await afficherAlerteSuperposee(d.message||"Modification non confirmée.",{
            profil:r.ok && d.ok?"information":"erreur"});
          if(r.ok && d.ok)await chargerEquipementsPresence();
          return true;
        }
      });
    }catch(error){
      await afficherAlerte(error?.message||"La modification Wi-Fi n’a pas pu être confirmée.");
    }finally{modificationWifiTemoinEnCours=false;}
  }

  const selfiesCompte = {
    biometrie: {prefixe:"selfie",libelle:"SELFIE BIOMÉTRIQUE",lignes:["SELFIE BIO","MÉTRIQUE"],route:"/selfie",coda:true,url:null},
    duoday: {prefixe:"selfie-duoday",libelle:"SELFIE DUO ACTIF",lignes:["SELFIE","DUO ACTIF"],route:"/selfie-duoday",coda:false,url:null}
  };
  function initialiserZoneSelfie(type="biometrie",apres=null) {
    const config=selfiesCompte[type];
    if(!config)return;
    const codeR = document.getElementById("champ-geolocalisation-membre") || document.getElementById("champ-code-r-membre");
    const bloc = codeR?.closest("[data-lcdp-box-champ-formulaire]");
    const cible=apres||bloc;
    const id=config.prefixe;
    if (!bloc || !cible || document.getElementById("zone-"+id)) return;
    const zone = document.createElement("section");
    zone.id = "zone-"+id;
    zone.setAttribute("aria-label", config.libelle);
    zone.className = bloc.className;
    zone.setAttribute("data-lcdp-box-champ-formulaire", "");
    zone.innerHTML = '<div class="lcdp-box-champ-formulaire__label-zone"><span class="lcdp-box-champ-formulaire__label">'+config.lignes[0]+'<br>'+config.lignes[1]+'</span><span class="lcdp-selfie-texte" id="'+id+'-libelle" hidden><span id="'+id+'-etat" role="status"></span></span></div><div class="lcdp-box-champ-formulaire__control lcdp-selfie-control" data-lcdp-champ-control><div class="lcdp-selfie-contenu"><button type="button" id="'+id+'-badge" aria-label="Aucun selfie enregistré" disabled><svg data-selfie-silhouette width="40" height="40" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="12" cy="7.5" r="4"></circle><path d="M3 21v-2a9 9 0 0 1 18 0v2z"></path></svg><img id="'+id+'-photo" alt="" hidden></button></div></div>';
    const fauxInput = {parentNode:zone.lastElementChild};
    ajouterPictoModificationDansChamp(fauxInput, zone, {id:"modifier-"+id,texte:"Prendre ou remplacer mon "+config.libelle.toLowerCase(),pictoRouge:config.coda,neutre:!config.coda});
    cible.insertAdjacentElement("afterend", zone);
    document.getElementById("modifier-"+id).addEventListener("click", ()=>proposerActionsSelfie(type));
    document.getElementById(id+"-badge").addEventListener("click", ()=>agrandirSelfie(type));
  }
  let choixSelfieEnCours = false;
  async function proposerActionsSelfie(type="biometrie") {
    const config=selfiesCompte[type];if(!config)return;
    if (choixSelfieEnCours || document.getElementById("dialogue-selfie") || document.getElementById("dialogue-selfie-agrandi")) return;
    if (!config.url) return ouvrirSelfie(type);
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return;
    const focusInitial = document.activeElement;
    choixSelfieEnCours = true;
    let choix = null;
    try {
      const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-choix.html");
      slot.replaceChildren(fragment);
      const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="choix"]');
      const titre = slot.querySelector("[data-lcdp-dialogue-titre]");
      const texte = slot.querySelector("[data-lcdp-dialogue-message]");
      const afficher = slot.querySelector('[data-lcdp-dialogue-action="annuler"]');
      const modifier = slot.querySelector('[data-lcdp-dialogue-action="confirmer"]');
      if (!dialogue || !titre || !texte || !afficher || !modifier) throw Error("Structure CHOIX incomplète.");
      titre.textContent = config.libelle;
      texte.textContent = "Consultez ou modifiez votre selfie.";
      afficher.textContent = "Afficher mon selfie";
      modifier.textContent = "Modifier mon selfie";
      choix = await new Promise(resolve => {
        let termine = false;
        function fermer(action) {
          if (termine) return;
          termine = true;
          document.removeEventListener("keydown", clavier);
          slot.replaceChildren();
          focusInitial?.focus();
          resolve(action);
        }
        function clavier(event) { if (event.key === "Escape") { event.preventDefault(); fermer(null); } }
        afficher.addEventListener("click", () => fermer("afficher"), {once:true});
        modifier.addEventListener("click", () => fermer("modifier"), {once:true});
        dialogue.addEventListener("click", event => { if (event.target === dialogue) fermer(null); });
        document.addEventListener("keydown", clavier);
        afficher.focus();
      });
    } catch {
      slot.replaceChildren();
      await afficherAlerte("Les actions du selfie sont momentanément indisponibles.");
    } finally { choixSelfieEnCours = false; }
    if (choix === "afficher") agrandirSelfie(type);
    if (choix === "modifier") await ouvrirSelfie(type);
  }

  async function chargerSelfie(type="biometrie") {
    const config=selfiesCompte[type];if(!config)return;
    const id=config.prefixe;
    const statut = document.getElementById(id+"-etat");
    const photo = document.getElementById(id+"-photo");
    const badge = document.getElementById(id+"-badge");
    if(!statut||!photo||!badge)return;
    function masquerPhoto() {
      photo.hidden = true;
      badge.disabled = true;
      badge.setAttribute("aria-label","Aucun selfie enregistré");
      badge.removeAttribute("title");
      badge.querySelector("[data-selfie-silhouette]").hidden=false;
      photo.removeAttribute("src");
      if (config.url) URL.revokeObjectURL(config.url);
      config.url = null;
    }
    photo.onerror = () => {
      masquerPhoto();
      statut.textContent = "Selfie indisponible.";
      document.getElementById(id+"-libelle")?.removeAttribute("hidden");
    };
    try {
      const r = await fetch(ENDPOINT_MON_COMPTE_MEMBRE+config.route,{credentials:"include",cache:"no-store"});
      if(r.status===401){redirigerConnexionMembre("inactive");return;}
      if(r.status===404){masquerPhoto();statut.textContent="";document.getElementById(id+"-libelle")?.setAttribute("hidden","");return;}
      if(!r.ok)throw Error("Selfie indisponible");
      const blob=await r.blob();
      const image=document.getElementById(id+"-photo");
      const ancienne=config.url;config.url=URL.createObjectURL(blob);image.src=config.url;
      if(typeof image.decode==="function")await image.decode();
      image.hidden=false;badge.disabled=false;badge.setAttribute("aria-label","Agrandir mon selfie");badge.title="Agrandir mon selfie";
      badge.querySelector("[data-selfie-silhouette]").hidden=true;
      document.getElementById(id+"-libelle")?.setAttribute("hidden", "");
      if(ancienne)URL.revokeObjectURL(ancienne);
      statut.textContent="";
    } catch { masquerPhoto();statut.textContent="Selfie indisponible.";document.getElementById(id+"-libelle")?.removeAttribute("hidden"); }
  }
  function agrandirSelfie(type="biometrie") {
    const config=selfiesCompte[type];
    if (!config?.url || document.getElementById("dialogue-selfie-agrandi")) return;
    const retourFocus = document.activeElement;
    const dialogue = document.createElement("dialog");
    dialogue.id = "dialogue-selfie-agrandi";
    dialogue.setAttribute("aria-label", "Selfie agrandi");
    const fermer = document.createElement("button");
    fermer.type = "button";
    fermer.setAttribute("aria-label", "Fermer la photo");
    fermer.textContent = "×";
    const photo = document.createElement("img");
    photo.alt = "Votre selfie agrandi";
    photo.src = config.url;
    dialogue.append(fermer, photo);
    document.body.appendChild(dialogue);
    dialogue.addEventListener("close", () => { dialogue.remove(); retourFocus?.focus(); }, {once:true});
    fermer.addEventListener("click", () => dialogue.close());
    dialogue.addEventListener("click", event => { if (event.target === dialogue) dialogue.close(); });
    dialogue.showModal();
    fermer.focus();
  }

  async function ouvrirSelfie(type="biometrie") {
    const config=selfiesCompte[type];if(!config)return;
    if(document.getElementById("dialogue-selfie"))return;
    const retourFocus=document.activeElement;
    const main=document.querySelector(".lcdp-site-page > .lcdp-site-main");
    if(!main)return;
    const anciens=Array.from(main.children).map(element=>({element,hidden:element.hidden}));
    const ancienScroll=main.scrollTop;
    const section=document.createElement("section");
    section.className="lcdp-page-section";
    section.setAttribute("data-lcdp-selfie-page","");
    section.setAttribute("aria-label","Modifier mon selfie");
    const conteneur=document.createElement("div");conteneur.className="lcdp-page-container";
    const d=document.createElement("div");d.id="dialogue-selfie";d.dataset.etape="permission-camera";
    conteneur.appendChild(d);section.appendChild(conteneur);
    anciens.forEach(({element})=>{element.hidden=true;});
    main.appendChild(section);main.scrollTop=0;
    let stream=null,actif=true,occupe=false,jeton=null,video=null,apercuUrl=null,permissionConfirmee=false,autorisationRefusee=false;
    const peutCapturer=()=>permissionConfirmee&&!autorisationRefusee&&(!config.coda||Boolean(jeton));
    function arreterCamera(){stream?.getTracks().forEach(t=>t.stop());stream=null;if(video)video.srcObject=null;}
    function libererApercu(){if(apercuUrl)URL.revokeObjectURL(apercuUrl);apercuUrl=null;}
    function arreter(){actif=false;jeton=null;arreterCamera();libererApercu();}
    function fermerParcours(){
      arreter();window.removeEventListener("pagehide",quitter);section.remove();
      anciens.forEach(({element,hidden})=>{if(element.isConnected)element.hidden=hidden;});
      main.scrollTop=ancienScroll;retourFocus?.focus();
    }
    const quitter=()=>arreter();
    window.addEventListener("pagehide",quitter,{once:true});
    async function obtenirFluxCamera(){
      if(!navigator.mediaDevices?.getUserMedia)throw Error("La caméra n’est pas accessible. Utilisez un navigateur compatible en HTTPS.");
      return navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"user"},width:{ideal:720},height:{ideal:720}},audio:false});
    }
    function messageErreurCamera(e){
      return e.name==="NotAllowedError"||e.name==="PermissionDeniedError"
        ?"Accès à la caméra refusé. Autorisez la caméra dans les paramètres de ce site (à gauche de la barre d’adresse), puis réessayez."
        :e.name==="NotFoundError"?"Aucune caméra disponible sur cet appareil."
        :e.name==="NotReadableError"?"La caméra est indisponible. Vérifiez qu’elle n’est pas utilisée par une autre application, puis réessayez."
        :e.message||"Caméra indisponible.";
    }

    async function verifierCameraAvantCoda(){
      if(!actif)return;
      d.dataset.etape="permission-camera";
      let permission=null;
      try{permission=await navigator.permissions?.query({name:"camera"});}catch{}
      if(!actif)return;
      let refusInitial=null;
      if(permission?.state==="granted"){
        try{
          const flux=await obtenirFluxCamera();
          flux.getTracks().forEach(t=>t.stop());
          if(!actif)return;
          permissionConfirmee=true;
        }catch(e){refusInitial=e;}
        if(!actif)return;
        if(permissionConfirmee){
          if(config.coda)await ouvrirSaisieCoda();else await ouvrirCameraSelfie();
          return;
        }
      }
      try{
        const fragment=await chargerFragmentObjet("/HTMLBASE/04-dialogue-champ.html");
        if(!actif)return;
        d.replaceChildren(fragment);
        const boite=d.querySelector("[data-lcdp-box-dialogue-champ]");
        boite.setAttribute("role","region");boite.removeAttribute("aria-modal");
        d.querySelector("[data-lcdp-dialogue-champ-title]").textContent="Autorisation de la caméra";
        const form=d.querySelector("[data-lcdp-dialogue-champ-form]");
        const zone=d.querySelector("[data-lcdp-dialogue-champ-content]");
        const valider=d.querySelector("[data-lcdp-dialogue-champ-submit]");
        const annuler=d.querySelector("[data-lcdp-dialogue-champ-cancel]");
        d.querySelector("[data-lcdp-dialogue-champ-close]").hidden=true;
        const message=document.createElement("p");
        message.className="lcdp-cle-dialogue-note";
        message.setAttribute("role","status");message.setAttribute("aria-live","polite");
        message.textContent="Autorisez la caméra sur ce navigateur pour prendre votre selfie.";
        zone.appendChild(message);
        valider.textContent=refusInitial?"Réessayer":"Autoriser la caméra";
        if(refusInitial)message.textContent=messageErreurCamera(refusInitial);
        valider.disabled=false;
        annuler.onclick=()=>fermerParcours();
        let verification=false;
        async function verifier(){
          if(verification||!actif||d.dataset.etape!=="permission-camera")return;
          verification=true;valider.disabled=true;form.setAttribute("aria-busy","true");
          try{
            const flux=await obtenirFluxCamera();
            // La permission est confirmée par le navigateur. Aucun flux ni image
            // n’est conservé pendant la saisie du CODA.
            flux.getTracks().forEach(t=>t.stop());
            if(!actif)return;
            permissionConfirmee=true;
            if(config.coda)await ouvrirSaisieCoda();else await ouvrirCameraSelfie();
          }catch(e){
            if(actif&&d.dataset.etape==="permission-camera"){
              message.textContent=messageErreurCamera(e);
              valider.textContent="Réessayer";
            }
          }finally{
            verification=false;
            if(actif&&d.dataset.etape==="permission-camera"){valider.disabled=false;form.removeAttribute("aria-busy");}
          }
        }
        form.addEventListener("submit",event=>{event.preventDefault();void verifier();});
        if(actif&&d.dataset.etape==="permission-camera"&&!verification)valider.focus();
      }catch(e){if(actif){fermerParcours();await afficherAlerte("Le contrôle de la caméra est indisponible.");}}
    }

    async function ouvrirSaisieCoda(){
    if(!actif)return;
    d.dataset.etape="coda";
    let form,zone,message,valider,annuler,erreur,croix;
    const cases=[];
    try{
      const fragment=await chargerFragmentObjet("/HTMLBASE/04-dialogue-champ.html");
      if(!actif)return;
      d.replaceChildren(fragment);
      const boite=d.querySelector("[data-lcdp-box-dialogue-champ]");
      boite.setAttribute("role","region");boite.removeAttribute("aria-modal");
      d.querySelector("[data-lcdp-dialogue-champ-title]").textContent=config.libelle;
      form=d.querySelector("[data-lcdp-dialogue-champ-form]");
      zone=d.querySelector("[data-lcdp-dialogue-champ-content]");
      erreur=d.querySelector("[data-lcdp-dialogue-champ-error]");
      valider=d.querySelector("[data-lcdp-dialogue-champ-submit]");
      annuler=d.querySelector("[data-lcdp-dialogue-champ-cancel]");
      croix=d.querySelector("[data-lcdp-dialogue-champ-close]");
      croix.hidden=true;
      const champ=await creerChampDialogue({type:"coda",id:"selfie-coda",name:"coda",label:"Saisissez votre CODA."});
      if(!actif)return;
      message=champ.querySelector("[data-lcdp-champ-description]");
      const valeur=champ.querySelector('input[type="hidden"][name="coda"]');
      const controle=champ.querySelector("[data-lcdp-champ-control]");
      if(!message||!valeur||!controle)throw Error("Champ CODA incomplet.");
      message.hidden=false;
      message.setAttribute("role","status");message.setAttribute("aria-live","polite");message.textContent="Deux essais maximum";
      cases.push(...controle.querySelectorAll(".lcdp-box-champ-formulaire__code-cases input"));
      if(cases.length!==4)throw Error("Champ CODA incomplet.");
      cases.forEach((c,i)=>{
        c.addEventListener("input",()=>{erreur.hidden=true;erreur.textContent="";});
        c.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"&&i>0)cases[i-1].focus();if(e.key==="ArrowRight"&&i<3)cases[i+1].focus();});
        c.addEventListener("paste",e=>{const chiffres=(e.clipboardData?.getData("text")||"").replace(/\D/g,"").slice(0,4-i);if(!chiffres)return;e.preventDefault();Array.from(chiffres).forEach((ch,j)=>{cases[i+j].value=ch;});valeur.value=cases.map(ch=>ch.value).join("");erreur.hidden=true;erreur.textContent="";cases[Math.min(3,i+chiffres.length)].focus();});
      });
      zone.appendChild(champ);
      annuler.onclick=()=>{if(!occupe)fermerParcours();};
      cases[0].focus();
    }catch(e){fermerParcours();await afficherAlerte("Le formulaire CODA est indisponible.");return;}
    let bloque=false;
    form.addEventListener("submit",async e=>{
      e.preventDefault();if(occupe||bloque||!actif)return;
      const coda=cases.map(c=>c.value).join("");
      if(!/^\d{4}$/.test(coda)){erreur.textContent="Saisissez les quatre chiffres de votre CODA.";erreur.hidden=false;return;}
      occupe=true;valider.disabled=true;annuler.disabled=true;erreur.hidden=true;cases.forEach(c=>{c.disabled=true;});
      form.setAttribute("aria-busy","true");
      try{
        const r=await fetch(ENDPOINT_MON_COMPTE_MEMBRE+"/selfie/autoriser",{method:"POST",credentials:"include",cache:"no-store",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({coda})});
        const resultat=await r.json().catch(()=>null);
        if(!actif)return;
        if(r.status===401){fermerParcours();redirigerConnexionMembre("inactive");return;}
        if(!r.ok||resultat?.ok!==true||typeof resultat.jeton!=="string"||!/^[a-f0-9]{64}$/.test(resultat.jeton)){
          bloque=r.status===429||resultat?.attemptsRemaining===0||resultat?.reason==="coda_absent";
          message.textContent=resultat?.message||(r.status===404?"Le Worker MON COMPTE ne reconnaît pas la route selfie.":"La vérification CODA est indisponible.");
          return;
        }
        jeton=resultat.jeton;
        occupe=false;
        await ouvrirCameraSelfie();
      }catch(e){if(actif)message.textContent="La vérification CODA est indisponible.";}
      finally{
        cases.forEach(c=>{c.value="";c.disabled=bloque;});
        occupe=false;
        if(actif&&d.dataset.etape==="coda"){form.removeAttribute("aria-busy");valider.disabled=bloque;annuler.disabled=false;if(!bloque)cases[0]?.focus();}
      }
    });
    }

    async function ouvrirCameraSelfie(){
      if(!actif||!peutCapturer())return;
      d.dataset.etape="capture";
      d.innerHTML='<div class="lcdp-box-dialogue-champ" role="region"><div class="lcdp-box-dialogue-champ__card"><h2 id="titre-selfie" class="lcdp-box-dialogue-champ__title">Selfie</h2><video autoplay playsinline muted aria-label="Aperçu de votre selfie" hidden></video><p class="lcdp-cle-dialogue-note" role="status" aria-live="polite" data-selfie-message>Placez votre visage au centre de l’image.</p><div class="lcdp-box-dialogue-champ__actions"><button type="button" class="lcdp-button lcdp-button-secondary" data-selfie-fermer>Annuler</button><button type="button" class="lcdp-button lcdp-button-primary" data-selfie-capture disabled>Prendre la photo</button></div></div></div>';
      video=d.querySelector("video");
      const message=d.querySelector("[data-selfie-message]"),capture=d.querySelector("[data-selfie-capture]"),fermer=d.querySelector("[data-selfie-fermer]");
      fermer.onclick=()=>{if(!occupe)fermerParcours();};
      async function prendrePhoto(){
        if(occupe||!actif||!peutCapturer()||!video.videoWidth)return;
        occupe=true;capture.disabled=true;fermer.disabled=true;
        try{
          const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;
          const cote=Math.min(video.videoWidth,video.videoHeight);
          canvas.getContext("2d").drawImage(video,(video.videoWidth-cote)/2,(video.videoHeight-cote)/2,cote,cote,0,0,512,512);
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.85));
          if(!blob)throw Error("La photo n’a pas pu être créée.");
          if(!actif||!peutCapturer())return;
          afficherApercuSelfie(blob);
        }catch(e){if(actif)message.textContent=e.message||"La photo n’a pas pu être créée.";}
        finally{occupe=false;if(actif&&d.dataset.etape==="capture"){capture.disabled=false;fermer.disabled=false;}}
      }
      let activationEnCours=false;
      async function activerCamera(){
        if(activationEnCours||!actif||!peutCapturer())return;
        activationEnCours=true;capture.disabled=true;
        message.textContent="Placez votre visage au centre de l’image.";
        arreterCamera();
        try{
        const obtenu=await obtenirFluxCamera();
        if(!actif){obtenu.getTracks().forEach(t=>t.stop());return;}
        stream=obtenu;video.srcObject=stream;
        await video.play();if(!actif)return;
        video.hidden=false;
        capture.textContent="Prendre la photo";
        capture.onclick=prendrePhoto;
        message.textContent="Placez votre visage au centre de l’image.";
        }catch(e){
          if(actif){
            arreterCamera();video.hidden=true;
            capture.textContent="Réessayer";
            capture.onclick=activerCamera;
            message.textContent=messageErreurCamera(e);
          }
        }finally{activationEnCours=false;if(actif&&d.dataset.etape==="capture")capture.disabled=false;}
      }
      capture.onclick=activerCamera;
      capture.focus();
      await activerCamera();
    }

    function afficherApercuSelfie(blob){
      if(!actif||!peutCapturer())return;
      libererApercu();
      apercuUrl=URL.createObjectURL(blob);
      arreterCamera();
      d.dataset.etape="apercu";
      d.innerHTML='<div class="lcdp-box-dialogue-champ" role="region"><div class="lcdp-box-dialogue-champ__card"><h2 id="titre-selfie" class="lcdp-box-dialogue-champ__title">Vérifier mon selfie</h2><img data-selfie-apercu alt="Votre selfie avant validation"><p role="status" aria-live="polite" data-selfie-message>Cette photo vous convient-elle ?</p><div class="lcdp-box-dialogue-champ__actions"><button type="button" class="lcdp-button lcdp-button-secondary" data-selfie-reprendre>Reprendre</button><button type="button" class="lcdp-button lcdp-button-primary" data-selfie-valider>Valider</button><button type="button" class="lcdp-button lcdp-button-secondary" data-selfie-fermer data-selfie-annulation-seule>Annuler</button></div></div></div>';
      d.querySelector("[data-selfie-apercu]").src=apercuUrl;
      const message=d.querySelector("[data-selfie-message]"),reprendre=d.querySelector("[data-selfie-reprendre]"),valider=d.querySelector("[data-selfie-valider]"),fermer=d.querySelector("[data-selfie-fermer]");
      fermer.onclick=()=>{if(!occupe)fermerParcours();};
      reprendre.onclick=()=>{if(occupe||!actif||!peutCapturer())return;libererApercu();void ouvrirCameraSelfie();};
      valider.onclick=async()=>{
        if(occupe||!actif||!peutCapturer())return;
        occupe=true;reprendre.disabled=true;valider.disabled=true;fermer.disabled=true;d.setAttribute("aria-busy","true");
        try{
          const r=await fetch(ENDPOINT_MON_COMPTE_MEMBRE+config.route,{method:"PUT",credentials:"include",cache:"no-store",headers:{"Content-Type":"image/jpeg",...(config.coda?{"Authorization":"Bearer "+jeton}:{})},body:blob});
          const resultat=await r.json().catch(()=>null);
          if(!actif)return;
          if(r.status===401){fermerParcours();redirigerConnexionMembre("inactive");return;}
          if(r.status===403){jeton=null;autorisationRefusee=true;message.textContent=resultat?.message||(config.coda?"Authentifiez-vous à nouveau avec votre CODA.":"Modification non autorisée.");return;}
          if(!r.ok||resultat?.ok!==true)throw Error(resultat?.message||"La photo n’a pas pu être enregistrée.");
          arreter();fermerParcours();await chargerSelfie(type);
        }catch(e){if(actif)message.textContent=e.message||"Enregistrement impossible.";}
        finally{occupe=false;if(actif){d.removeAttribute("aria-busy");reprendre.disabled=!peutCapturer();valider.disabled=!peutCapturer();fermer.disabled=false;}}
      };
      valider.focus();
    }

    await verifierCameraAvantCoda();
  }

  function ajouterTitresSectionsCompte() {
    const sectionsAjoutees = new Set();

    champsCompte.forEach((champ) => {
      if (!champ.section || sectionsAjoutees.has(champ.section)) return;

      const input = document.getElementById(champ.id);
      const blocChamp = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

      if (!blocChamp || !blocChamp.parentNode) return;

      const titre = document.createElement("h3");
      titre.className = "lcdp-title-section";
      titre.textContent = champ.section;

      blocChamp.parentNode.insertBefore(titre, blocChamp);
      sectionsAjoutees.add(champ.section);
    });
  }

  // Presentation only: every real field, link and editing control is preserved.
  // Grouping gives each section a stable CSS hook without hardcoded data.
  // État vide, chargement ou erreur : mention commune du compte.
  function afficherSlotService(liste, message) {
    const texte=document.createElement("span");
    texte.className="lcdp-compte-placeholder-da";
    texte.textContent=message;
    liste.replaceChildren(texte);
  }

  function afficherServiceVideAvecAction(liste,message,libelle,action) {
    const ligne=document.createElement("div");
    ligne.className="lcdp-compte-alerte";
    const texte=document.createElement("span");
    texte.className="lcdp-compte-placeholder-da";
    texte.textContent=message;
    const bouton=document.createElement("button");
    bouton.type="button";
    bouton.className="lcdp-ui-badge lcdp-ui-badge--action";
    bouton.textContent=libelle;
    bouton.addEventListener("click",async()=>{
      if(bouton.disabled)return;
      bouton.disabled=true;
      try{await action();}catch(err){await afficherAlerte(err.message||"Service indisponible.");}
      finally{bouton.disabled=false;}
    });
    ligne.append(texte,bouton);
    liste.replaceChildren(ligne);
  }

  async function creerAlerteDepuisCompte(){
    if(!compteMembreActuel){await afficherInformationMembre("Votre compte est en cours de chargement.");return;}
    if(!compteIndiqueAbonne(compteMembreActuel)){await afficherInformationMembre("Un abonnement est nécessaire.");return;}
    if(compteMembreActuel.abonnementSuspendu===true||compteMembreActuel.suspendu===true){await afficherInformationMembre("Votre abonnement est suspendu.");return;}
    if(typeof window.LCDP_ouvrirFormulaireAlertePlanifier!=="function")throw Error("Formulaire ALERTE PLANIFIER indisponible.");
    await window.LCDP_ouvrirFormulaireAlertePlanifier({permanent:abonnementPermanentCompte,onEnregistre:async()=>{
      await chargerAlertesCompte();
      await afficherInformationMembre("L’alerte a été enregistrée.","SERVICE");
    }});
  }

  function structurerSectionsCompte(form) {
    const fields = form.querySelector("[data-lcdp-formulaire-fields]");
    if (!fields || fields.classList.contains("lcdp-mon-compte-sections")) return;

    const noms = [
      "etat-civil", "securite", "participation", "reglements",
      "remboursement", "facturation"
    ];
    let indexSection = -1;
    let section = null;
    const elements = Array.from(fields.children);
    const fragment = document.createDocumentFragment();

    elements.forEach(element => {
      if (element.matches(".lcdp-title-section")) {
        indexSection += 1;
        section = document.createElement("section");
        section.className = "lcdp-mon-compte-section";
        section.dataset.lcdpCompteSection = noms[indexSection] || "autre";
        element.id = "lcdp-mon-compte-titre-" + (noms[indexSection] || indexSection);
        section.setAttribute("aria-labelledby", element.id);
        section.appendChild(element);
        fragment.appendChild(section);
      } else if (section) {
        section.appendChild(element);
      } else {
        fragment.appendChild(element);
      }
    });

    fields.replaceChildren(fragment);
    // L’abonnement est intégré au Club, immédiatement après le droit d’abonnement (DA).
    ajouterBlocAbonnementCompte(fields);
    // Les sous-rubriques reprennent le format existant d’Équipement présence.
    // Déplacer les nœuds préserve leurs identifiants, actions et écouteurs.
    function convertirSousRubrique(rubrique, titre) {
      if (!rubrique) return;
      rubrique.classList.remove("lcdp-mon-compte-section");
      rubrique.classList.add("lcdp-compte-equipements");
      const entete = rubrique.querySelector(":scope > .lcdp-title-section");
      if (entete) {
        entete.classList.add("lcdp-compte-equipements__titre");
        if (titre) entete.textContent = titre;
      }
    }
    const adresse = fields.querySelector('[data-lcdp-compte-section="facturation"]');
    const remboursement = fields.querySelector('[data-lcdp-compte-section="remboursement"]');
    if (adresse && remboursement) {
      adresse.querySelector(":scope > .lcdp-title-section").textContent="Adresse de facturation";
      remboursement.querySelector(":scope > .lcdp-title-section").textContent="IBAN de remboursement";
      remboursement.insertAdjacentElement("beforebegin",adresse);
    }
    // Sécurité du compte : dernière rubrique indépendante.
    const securite = fields.querySelector('[data-lcdp-compte-section="securite"]');
    if (securite) fields.appendChild(securite);

    // Service : liste membre, sans bouton de navigation vers une seconde page.
    const services=document.createElement("section");
    services.className="lcdp-compte-equipements lcdp-compte-service";
    services.dataset.lcdpCompteSection="service";
    services.setAttribute("aria-label","Services");
    const listeAlertes=document.createElement("div");
    listeAlertes.id="lcdp-compte-alertes-liste";
    listeAlertes.className="lcdp-compte-alertes-liste";
    listeAlertes.setAttribute("aria-live","polite");
    afficherSlotService(listeAlertes,"Chargement des alertes…");
    function creerCarteService(libelle, liste) {
      const carte=document.createElement("div");
      carte.className="lcdp-box-champ-formulaire";
      carte.setAttribute("data-lcdp-box-champ-formulaire","");
      const labelZone=document.createElement("div");
      labelZone.className="lcdp-box-champ-formulaire__label-zone";
      const titre=document.createElement("span");
      titre.className="lcdp-box-champ-formulaire__label";
      titre.textContent=libelle;
      labelZone.appendChild(titre);
      const control=document.createElement("div");
      control.className="lcdp-box-champ-formulaire__control";
      control.setAttribute("data-lcdp-champ-control","");
      control.appendChild(liste);
      carte.append(labelZone,control);
      return carte;
    }
    const listeDuoActif=document.createElement("div");
    listeDuoActif.id="lcdp-compte-duoactif-liste";
    listeDuoActif.className="lcdp-compte-alertes-liste";
    listeDuoActif.setAttribute("aria-live","polite");
    afficherSlotService(listeDuoActif,"Chargement des demandes Duo Actif…");
    services.append(creerCarteService("Service d’alerte planifiée",listeAlertes),creerCarteService("Demande DUO ACTIF",listeDuoActif));
    const statutMembre=fields.querySelector('[data-lcdp-compte-section="participation"]');
    if(statutMembre) {
      const abonnement = statutMembre.querySelector("#lcdp-compte-abonnement");
      if (abonnement) abonnement.insertAdjacentElement("afterend",services);
      else statutMembre.appendChild(services);
      ajouterBlocRelationsInvitationsCompte(statutMembre);

      // Points club avant les règlements, même si leur affichage est suspendu.
      const points = statutMembre.querySelector("#champ-points-club-membre")?.closest("[data-lcdp-box-champ-formulaire]");
      const actionsPoints = statutMembre.querySelector("#voir-mes-points")?.closest(".lcdp-compte-actions-adresse");
      if (points) statutMembre.appendChild(points);
      if (actionsPoints) statutMembre.appendChild(actionsPoints);
      const reglements = fields.querySelector('[data-lcdp-compte-section="reglements"]');
      if (reglements) {
        convertirSousRubrique(reglements,"Règlement");
        statutMembre.appendChild(reglements);
      }
    } else {
      services.classList.add("lcdp-mon-compte-section");
      fields.insertBefore(services,securite||null);
    }
    chargerAlertesCompte().catch(err=>{
      console.error("SERVICE : alertes indisponibles",err);
      afficherSlotService(listeAlertes,"Impossible de charger les alertes.");
    });
    chargerDuoActifCompte().catch(err=>{
      console.error("SERVICE : demandes Duo Actif indisponibles",err);
      afficherSlotService(listeDuoActif,"Impossible de charger les demandes Duo Actif.");
    });
    fields.classList.add("lcdp-mon-compte-sections");
  }



  // Petit bloc Club, placé après la demande de droit d’abonnement (DA).
  function ajouterBlocAbonnementCompte(fields) {
    if (fields.querySelector("#lcdp-compte-abonnement")) return;
    const club = fields.querySelector('[data-lcdp-compte-section="participation"]');
    const demandeDa = club?.querySelector("#champ-da-membre")?.closest("[data-lcdp-box-champ-formulaire]");
    if (!demandeDa) return;
    const section = document.createElement("div");
    section.id = "lcdp-compte-abonnement";
    section.className = "lcdp-compte-relations";
    section.setAttribute("aria-label", "Abonnement");
    section.innerHTML =
      '<div class="lcdp-compte-relations__ligne">' +
          '<div class="lcdp-compte-relations__libelle"><span class="lcdp-box-champ-formulaire__label">Abonnement</span><span id="lcdp-compte-abonnement-resume" class="lcdp-compte-placeholder-da"></span></div>' +
          '<button type="button" id="lcdp-compte-abonnement-compteur" ' +
            'class="lcdp-compte-relations__nombre" aria-expanded="false" ' +
            'aria-controls="lcdp-compte-abonnement-liste" ' +
            'aria-label="Afficher la liste des abonnements souscrits" disabled>' +
            '<span id="lcdp-compte-abonnement-nombre">–</span>' +
          '</button>' +
          '<a id="lcdp-compte-abonnement-action" class="lcdp-ui-badge lcdp-ui-badge--action" hidden></a>' +
        '</div>' +
        '<div id="lcdp-compte-abonnement-liste" class="lcdp-compte-relations__liste" ' +
          'aria-live="polite" hidden></div>';
    demandeDa.insertAdjacentElement("afterend", section);
    const bouton = section.querySelector("#lcdp-compte-abonnement-compteur");
    const liste = section.querySelector("#lcdp-compte-abonnement-liste");
    bouton.addEventListener("click", () => {
      if (bouton.disabled) return;
      liste.hidden = !liste.hidden;
      bouton.setAttribute("aria-expanded", String(!liste.hidden));
    });
  }

  function lireDateAbonnementCompte(valeur) {
    const morceaux = String(valeur || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!morceaux) return null;
    const a = Number(morceaux[1]), m = Number(morceaux[2]), j = Number(morceaux[3]);
    const date = new Date(a, m - 1, j);
    return date.getFullYear() === a && date.getMonth() === m - 1 && date.getDate() === j ? date : null;
  }

  function formaterDateAbonnementCompte(valeur) {
    const date = lireDateAbonnementCompte(valeur);
    return date ? date.toLocaleDateString("fr-FR") : "";
  }

  function libelleAbonnementCompte(abo) {
    const brut = String(abo?.typabo || abo?.abonnement || "").trim();
    const match = brut.toUpperCase().match(/^(1J|1M|3M|6M|1A)(?:F(?:4|7|10))?$/);
    return match ? match[1] : brut;
  }

  function abonnementAnnuleCompte(abo) {
    const statut = String(abo?.commande?.statutPaiement ||
      abo?.commande?.statutabo || abo?.statutabo ||
      abo?.statutpaiement || abo?.statutPaiement || "")
      .trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return statut === "cancd" || statut.includes("annul");
  }

  function rangAbonnementCompte(abo, aujourdHui) {
    if (abonnementAnnuleCompte(abo)) return 2;
    const debut = lireDateAbonnementCompte(abo?.debut);
    const fin = lireDateAbonnementCompte(abo?.fin);
    if (debut && fin && debut <= aujourdHui && fin >= aujourdHui) return 0;
    if (debut && debut > aujourdHui) return 1;
    return 2;
  }

  function trierAbonnementsCompte(abonnements) {
    // Un seul ordre pour l'historique : date de début la plus récente d'abord.
    // Aucun regroupement par statut, les abonnements ne se chevauchent pas.
    return abonnements.slice().sort((a, b) => {
      const dateA = lireDateAbonnementCompte(a?.debut)?.getTime() ?? -Infinity;
      const dateB = lireDateAbonnementCompte(b?.debut)?.getTime() ?? -Infinity;
      return dateB - dateA;
    });
  }

  function remplirHistoriqueAbonnementsCompte(conteneur, abonnements) {
    const liste = document.createElement("ul");
    liste.className = "lcdp-compte-relations__personnes";
    abonnements.forEach(abo => {
      const item = document.createElement("li");
      const ligne = document.createElement("span");
      ligne.className = "lcdp-compte-relations__nom";
      const debut = formaterDateAbonnementCompte(abo.debut);
      const fin = formaterDateAbonnementCompte(abo.fin);
      ligne.textContent = [libelleAbonnementCompte(abo),
        debut && fin ? "du " + debut + " au " + fin : ""].filter(Boolean).join(" ");
      item.appendChild(ligne);
      if (abonnementAnnuleCompte(abo)) {
        const statut = document.createElement("span");
        statut.className = "lcdp-compte-relations__detail";
        statut.textContent = "Annulé";
        item.appendChild(statut);
      }
      liste.appendChild(item);
    });
    conteneur.replaceChildren(liste);
  }

  // Présentation uniquement : un compteur vide est représenté par un tiret.
  function libelleCompteurCompte(nombre) {
    return Number.isSafeInteger(nombre) && nombre > 0 ? String(nombre) : "–";
  }

  function afficherAbonnementVideCompte(resume, bouton, action, daValidee) {
    resume.textContent = daValidee
      ? "Aucun abonnement souscrit"
      : "Vous ne pouvez pas encore souscrire d’abonnement";
    resume.classList.add("lcdp-compte-placeholder-da");
    bouton.hidden = true;
    bouton.disabled = true;
    action.textContent = daValidee ? "Souscrire" : "Être invité(e)";
    action.href = construireUrlMembre(daValidee
      ? "/ESPACE-MEMBRE/reserver-membre.html?mode=aboreza"
      : "/ESPACE-MEMBRE/reserver-membre.html");
    action.hidden = false;
  }

  async function actualiserBlocAbonnementCompte(compte) {
    const section = document.getElementById("lcdp-compte-abonnement");
    if (!section) return;
    const version = ++versionChargementAbonnementsCompte;
    abonnementPermanentCompte = false;
    const da = normaliserStatudaCompte(compte?.statuda || compte?.statutDa || compte?.da || "");
    section.hidden = false;
    const resume = section.querySelector("#lcdp-compte-abonnement-resume");
    const nombre = section.querySelector("#lcdp-compte-abonnement-nombre");
    const bouton = section.querySelector("#lcdp-compte-abonnement-compteur");
    const liste = section.querySelector("#lcdp-compte-abonnement-liste");
    const action = section.querySelector("#lcdp-compte-abonnement-action");
    resume.textContent = "Chargement des abonnements…";
    resume.classList.add("lcdp-compte-placeholder-da");
    nombre.textContent = "–";
    bouton.disabled = true;
    bouton.hidden = true;
    action.hidden = true;
    action.removeAttribute("href");
    bouton.setAttribute("aria-expanded", "false");
    liste.hidden = true;
    liste.replaceChildren();
    if (da !== "oui") {
      afficherAbonnementVideCompte(resume, bouton, action, false);
      return;
    }

    try {
      if (!ENDPOINT_ABONNEMENTS_COMPTE) throw new Error("Service non configuré.");
      const reponse = await fetch(ENDPOINT_ABONNEMENTS_COMPTE + "/mes-abonnements", {
        credentials: "include", cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }
      const donnees = await reponse.json().catch(() => null);
      if (!reponse.ok || !donnees || (donnees.ok !== true && donnees.success !== true) ||
          !Array.isArray(donnees.abonnements)) {
        throw new Error(donnees?.message || "Service indisponible.");
      }
      if (version !== versionChargementAbonnementsCompte) return;

      const abonnements = donnees.abonnements;
      if (!abonnements.length) {
        afficherAbonnementVideCompte(resume, bouton, action, true);
        return;
      }
      resume.classList.remove("lcdp-compte-placeholder-da");
      resume.textContent = abonnements.length + (abonnements.length === 1 ? " abonnement souscrit" : " abonnements souscrits");
      nombre.textContent = libelleCompteurCompte(abonnements.length);
      bouton.hidden = false;
      bouton.disabled = false;

      const maintenant = new Date();
      const aujourdHui = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
      const tries = trierAbonnementsCompte(abonnements);
      abonnementPermanentCompte = tries.some(abo => rangAbonnementCompte(abo, aujourdHui) === 0 && ["1A","11M","10M"].includes(String(abo?.typabo || abo?.abonnement || "").trim().toUpperCase()));
      const principal = tries.find(abo => rangAbonnementCompte(abo, aujourdHui) === 0) ||
        tries.find(abo => rangAbonnementCompte(abo, aujourdHui) === 1);
      if (principal) {
        const type = libelleAbonnementCompte(principal);
        const debut = formaterDateAbonnementCompte(principal.debut);
        const fin = formaterDateAbonnementCompte(principal.fin);
        resume.textContent = rangAbonnementCompte(principal, aujourdHui) === 0 && fin
          ? type + " jusqu'au " + fin
          : debut && fin ? type + " du " + debut + " au " + fin : resume.textContent;
      }
      remplirHistoriqueAbonnementsCompte(liste, tries);
    } catch (erreur) {
      if (version !== versionChargementAbonnementsCompte) return;
      console.error("Historique des abonnements indisponible :", erreur);
      resume.textContent = "Impossible de charger les abonnements.";
      nombre.textContent = "–";
      bouton.disabled = true;
      bouton.hidden = true;
      action.hidden = true;
    }
  }

  // Deux raccourcis dans Statut membre, sous le bloc Points club / badges.
  // Les listes proviennent exclusivement du Worker de compte authentifié.
  function ajouterBlocRelationsInvitationsCompte(statut) {
    if (!statut || statut.querySelector("#lcdp-compte-relations")) return;
    const bloc = document.createElement("div");
    bloc.id = "lcdp-compte-relations";
    bloc.className = "lcdp-compte-relations";
    bloc.innerHTML = `
      <div class="lcdp-compte-relations__ligne">
        <span class="lcdp-compte-relations__libelle">Mes invités</span>
        <button type="button" class="lcdp-compte-relations__nombre"
          data-lcdp-relations-ouvrir="invite" aria-expanded="false"
          aria-controls="lcdp-compte-relations-invite"
          aria-label="Afficher la liste des invités">
          <span data-lcdp-relations-nombre="invite">–</span>
        </button>
      </div>
      <div id="lcdp-compte-relations-invite" class="lcdp-compte-relations__liste"
        aria-live="polite" hidden>Chargement des invités…</div>
      <div class="lcdp-compte-relations__ligne">
        <span class="lcdp-compte-relations__libelle">Mes « invitants »</span>
        <button type="button" class="lcdp-compte-relations__nombre"
          data-lcdp-relations-ouvrir="invitant" aria-expanded="false"
          aria-controls="lcdp-compte-relations-invitant"
          aria-label="Afficher la liste des invitants">
          <span data-lcdp-relations-nombre="invitant">–</span>
        </button>
      </div>
      <div id="lcdp-compte-relations-invitant" class="lcdp-compte-relations__liste"
        aria-live="polite" hidden>Chargement des invitants…</div>
      <div class="lcdp-compte-relations__ligne">
        <span class="lcdp-compte-relations__libelle">Mes coachs</span>
        <button type="button" class="lcdp-compte-relations__nombre"
          data-lcdp-relations-ouvrir="coach" aria-expanded="false"
          aria-controls="lcdp-compte-relations-coach"
          aria-label="Afficher la liste de mes coachs">
          <span data-lcdp-relations-nombre="coach">–</span>
        </button>
      </div>
      <div id="lcdp-compte-relations-coach" class="lcdp-compte-relations__liste"
        aria-live="polite" hidden>Chargement des coachs…</div>`;
    statut.appendChild(bloc);
    const equipement=document.createElement("section");
    equipement.id="lcdp-compte-equipements-presence";
    equipement.className="lcdp-compte-equipements";
    equipement.setAttribute("aria-labelledby","lcdp-compte-equipements-titre");
    const titreEquipement=document.createElement("h3");
    titreEquipement.id="lcdp-compte-equipements-titre";
    titreEquipement.className="lcdp-title-section lcdp-compte-equipements__titre";
    titreEquipement.textContent="ÉQUIPEMENT DE PRÉSENCE";
    equipement.appendChild(titreEquipement);
    const telephone=document.getElementById("champ-telephone-membre")?.closest("[data-lcdp-box-champ-formulaire]");
    if(telephone)equipement.appendChild(telephone);
    const temoins=document.createElement("div");
    temoins.id="lcdp-compte-equipements-temoins";
    temoins.className="lcdp-compte-equipements__liste";
    temoins.setAttribute("aria-live","polite");
    equipement.appendChild(temoins);
    initialiserZoneSelfie("duoday",bloc);
    const selfieDuo = statut.querySelector("#zone-selfie-duoday");
    (selfieDuo || bloc).insertAdjacentElement("afterend",equipement);

    bloc.querySelectorAll("[data-lcdp-relations-ouvrir]").forEach(bouton => {
      bouton.addEventListener("click", () => {
        const type = bouton.dataset.lcdpRelationsOuvrir;
        const liste = bloc.querySelector("#lcdp-compte-relations-" + type);
        if (!liste) return;
        const ouvrir = liste.hidden;
        bloc.querySelectorAll("[data-lcdp-relations-ouvrir]").forEach(autre => {
          autre.setAttribute("aria-expanded", String(autre === bouton && ouvrir));
        });
        bloc.querySelectorAll(".lcdp-compte-relations__liste").forEach(autre => {
          autre.hidden = autre !== liste || !ouvrir;
        });
      });
    });
    chargerRelationsInvitationsCompte(bloc);
  }

  function afficherListeRelationsCompte(conteneur, personnes, messageVide, personnesSeules = false) {
    if (!conteneur) return;
    conteneur.replaceChildren();
    if (!personnes.length) {
      const vide = document.createElement("p");
      vide.className = "lcdp-compte-relations__vide";
      vide.textContent = messageVide;
      conteneur.appendChild(vide);
      return;
    }
    const liste = document.createElement("ul");
    liste.className = "lcdp-compte-relations__personnes";
    personnes.forEach(personne => {
      const ligne = document.createElement("li");
      const identite = document.createElement("span");
      identite.className = "lcdp-compte-relations__nom";
      identite.textContent = [personne.prenom, personne.nom].filter(Boolean).join(" ") ||
        String(personne.email || "").trim() || "Membre";
      ligne.appendChild(identite);
      if (personnesSeules) {
        liste.appendChild(ligne);
        return;
      }
      const email = String(personne.email || "").trim();
      if (email && identite.textContent.toLowerCase() !== email.toLowerCase()) {
        const adresse = document.createElement("span");
        adresse.className = "lcdp-compte-relations__detail";
        adresse.textContent = email;
        ligne.appendChild(adresse);
      }
      if (personne.categorie === "duo" || personne.categorie === "famille") {
        const categorie = document.createElement("span");
        categorie.className = "lcdp-compte-relations__detail";
        categorie.textContent = personne.categorie === "duo" ? "Invité DUO" : "Invité FAMILLE";
        ligne.appendChild(categorie);
      }
      const date = personne.date ? new Date(personne.date) : null;
      if (date && !Number.isNaN(date.getTime())) {
        const mention = document.createElement("span");
        mention.className = "lcdp-compte-relations__detail";
        mention.textContent = "Invitation du " + date.toLocaleDateString("fr-FR");
        ligne.appendChild(mention);
      }
      liste.appendChild(ligne);
    });
    conteneur.appendChild(liste);
  }

  // Comptage par abonnement, indépendamment du nombre d'accès auxquels un
  // même contact est invité. Les données sont lues sur les routes authentifiées.
  function jourParisInvitesCompte(valeur) {
    const date = new Date(valeur || "");
    if (Number.isNaN(date.getTime())) return "";
    const parties = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    const valeurPartie = nom => parties.find(partie => partie.type === nom)?.value || "";
    return [valeurPartie("year"),valeurPartie("month"),valeurPartie("day")].join("-");
  }

  function afficherInvitesParAbonnementCompte(conteneur, abonnements) {
    conteneur.replaceChildren();
    if (!abonnements.length) {
      const vide = document.createElement("p");
      vide.className = "lcdp-compte-relations__vide";
      vide.textContent = "Aucun abonnement en cours ou à venir.";
      conteneur.appendChild(vide);
      return;
    }
    for (const abonnement of abonnements) {
      const section = document.createElement("section");
      section.className = "lcdp-compte-relations";
      const entete = document.createElement("div");
      entete.className = "lcdp-compte-relations__ligne";
      const nom = document.createElement("span");
      nom.className = "lcdp-compte-relations__libelle";
      const dateDebut = formaterDateAbonnementCompte(abonnement.debut);
      const dateFin = formaterDateAbonnementCompte(abonnement.fin);
      nom.textContent = [libelleAbonnementCompte(abonnement),
        dateDebut && dateFin ? "du " + dateDebut + " au " + dateFin : ""]
        .filter(Boolean).join(" ");
      const nombre = document.createElement("span");
      nombre.className = "lcdp-compte-relations__precision";
      nombre.textContent = abonnement.personnes.length + " invité" +
        (abonnement.personnes.length > 1 ? "s" : "");
      entete.append(nom,nombre);
      section.appendChild(entete);
      const liste = document.createElement("ul");
      liste.className = "lcdp-compte-relations__personnes";
      if (!abonnement.personnes.length) {
        const vide = document.createElement("li");
        vide.className = "lcdp-compte-relations__vide";
        vide.textContent = "Aucun invité.";
        liste.appendChild(vide);
      } else {
        for (const personne of abonnement.personnes) {
          const item = document.createElement("li");
          const nomComplet = [personne.prenom,personne.nom].filter(Boolean).join(" ").trim();
          const identite = document.createElement("span");
          identite.className = "lcdp-compte-relations__nom";
          identite.textContent = nomComplet || personne.email;
          item.appendChild(identite);
          if (nomComplet && personne.email) {
            const email = document.createElement("span");
            email.className = "lcdp-compte-relations__detail";
            email.textContent = personne.email;
            item.appendChild(email);
          }
          liste.appendChild(item);
        }
      }
      section.appendChild(liste);
      conteneur.appendChild(section);
    }
  }

  async function chargerInvitesParAbonnementCompte(conteneur, compteur, relations) {
    if (!ENDPOINT_ABONNEMENTS_COMPTE || !ENDPOINT_PLANNING_COMPTE ||
        !ENDPOINT_INVITER_MEMBRE) throw new Error("Service non configuré.");

    const charger = async url => {
      const reponse = await fetch(url, {
        credentials: "include", cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        throw new Error("Session membre inactive.");
      }
      const donnees = await reponse.json().catch(() => null);
      if (!reponse.ok || !donnees || (donnees.ok !== true && donnees.success !== true)) {
        throw new Error(donnees?.message || "Service indisponible.");
      }
      return donnees;
    };
    const [donneesAbos, donneesAcces] = await Promise.all([
      charger(ENDPOINT_ABONNEMENTS_COMPTE + "/mes-abonnements"),
      charger(ENDPOINT_PLANNING_COMPTE + "/mes-reservations")
    ]);
    if (!Array.isArray(donneesAbos.abonnements) ||
        !Array.isArray(donneesAcces.reservations)) {
      throw new Error("Liste des abonnements ou des accès invalide.");
    }

    const aujourdHui = jourParisInvitesCompte(new Date());
    const groupes = donneesAbos.abonnements.filter(abo => {
      const statut = String(abo.statutabo || "").trim().toLowerCase();
      const fin = jourParisInvitesCompte(abo.fin);
      return !abonnementAnnuleCompte(abo) && statut === "paye" &&
        fin && fin >= aujourdHui;
    }).map(abo => ({ ...abo, contacts: new Map(), reservations: [] }))
      .sort((a,b) => jourParisInvitesCompte(a.debut).localeCompare(jourParisInvitesCompte(b.debut)));

    const identites = new Map();
    for (const personne of (relations?.invites || [])) {
      const email = String(personne.email || "").trim().toLowerCase();
      if (email) identites.set(email, personne);
    }
    const ajouter = (abo, contact) => {
      const email = String(contact.email || contact.emailmembre || "").trim().toLowerCase();
      if (!email) return;
      const details = identites.get(email) || {};
      const nom = String(contact.nom || contact.nommembre || details.nom || "").trim();
      const prenom = String(contact.prenom || contact.prenommembre || details.prenom || "").trim();
      const personneExistante = abo.contacts.get(email);
      if (!personneExistante || (!personneExistante.nom && nom)) {
        abo.contacts.set(email, { email, nom, prenom });
      }
    };

    for (const reservation of donneesAcces.reservations) {
      if (!reservation?.idflux || reservation.invitation === true ||
          String(reservation.statut || "").toLowerCase() === "cancd") continue;
      const dateReservation = jourParisInvitesCompte(reservation.datebookd);
      if (!dateReservation) continue;
      const correspondances = groupes.filter(abo =>
        jourParisInvitesCompte(abo.debut) <= dateReservation &&
        dateReservation <= jourParisInvitesCompte(abo.fin)
      );
      if (correspondances.length > 1) {
        throw new Error("Rattachement d'abonnement ambigu pour un accès.");
      }
      if (correspondances.length === 1) correspondances[0].reservations.push(reservation);
    }

    // Le carnet inviteabo est par abonnement. Une seule lecture de contexte par
    // abonnement suffit ; la lecture des accès conserve les invitations historiques.
    for (const abonnement of groupes) {
      if (!abonnement.reservations.length) continue;
      const idflux = String(abonnement.reservations[0].idflux);
      const urlContexte = ENDPOINT_INVITER_MEMBRE +
        "/invites-abonnement/contexte?idflux=" + encodeURIComponent(idflux);
      const reponseContexte = await fetch(urlContexte, {
        credentials: "include", cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (reponseContexte.status === 401) {
        redirigerConnexionMembre("inactive");
        throw new Error("Session membre inactive.");
      }
      if (reponseContexte.ok) {
        const contexte = await reponseContexte.json().catch(() => null);
        if (contexte?.ok !== true || !Array.isArray(contexte.contacts?.duo) ||
            !Array.isArray(contexte.contacts?.famille)) {
          throw new Error("Carnet des invités de cet abonnement invalide.");
        }
        [...contexte.contacts.duo,...contexte.contacts.famille].forEach(contact =>
          ajouter(abonnement,contact));
      } else if (reponseContexte.status !== 404) {
        throw new Error("Carnet des invités indisponible pour cet abonnement.");
      }
      for (let debut = 0; debut < abonnement.reservations.length; debut += 4) {
        const lot = abonnement.reservations.slice(debut,debut + 4);
        await Promise.all(lot.map(async reservation => {
          const data = await charger(ENDPOINT_INVITER_MEMBRE +
            "/invites?idflux=" + encodeURIComponent(String(reservation.idflux)));
          if (!Array.isArray(data.invites)) throw new Error("Invités de l'accès invalides.");
          data.invites.forEach(contact => {
            if (String(contact.invit || "true").toLowerCase() !== "cancd") {
              ajouter(abonnement,contact);
            }
          });
        }));
      }
    }

    const resultat = groupes.map(abo => ({
      ...abo,
      personnes: Array.from(abo.contacts.values())
        .sort((a,b) => (a.nom || a.email).localeCompare(b.nom || b.email,"fr"))
    }));
    afficherInvitesParAbonnementCompte(conteneur, resultat);
    compteur.textContent = libelleCompteurCompte(resultat.reduce((somme,abo) => somme + abo.personnes.length,0));
  }

  // Une même personne peut figurer plusieurs fois dans l'historique :
  // le nombre d'invitants est un nombre de membres distincts, pas d'envois.
  function dedoublonnerInvitantsCompte(personnes) {
    const ids = new Set();
    const emails = new Set();
    return personnes.filter(personne => {
      if (!personne || typeof personne !== "object") return false;
      const id = String(personne.idmembre_invitant || personne.idmembreInvitant ||
        personne.idmembre || "").trim().toLowerCase();
      const email = String(personne.email || personne.emailmembre || "").trim().toLowerCase();
      if ((id && ids.has(id)) || (email && emails.has(email))) return false;
      if (id) ids.add(id);
      if (email) emails.add(email);
      return true;
    });
  }

  // Source authentifiée des invitants : les réservations reçues comportent
  // idparrain et l'identité associée, indépendamment de tout abonnement.
  async function chargerInvitantsDepuisPlanningCompte(conteneur, compteur) {
    if (!ENDPOINT_PLANNING_COMPTE) throw new Error("Service de planning non configuré.");
    const reponse = await fetch(ENDPOINT_PLANNING_COMPTE + "/mes-reservations", {
      credentials: "include", cache: "no-store",
      headers: { "Accept": "application/json" }
    });
    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return;
    }
    const donnees = await reponse.json().catch(() => null);
    if (!reponse.ok || !donnees ||
        (donnees.ok !== true && donnees.success !== true) ||
        !Array.isArray(donnees.reservations)) {
      throw new Error(donnees?.message || "Impossible de charger les invitants.");
    }
    const personnes = donnees.reservations.filter(reservation =>
      reservation && (reservation.invitation === true || reservation.invitation === "true")
    ).map(reservation => {
      const parrain = reservation.parrain || {};
      const affichage = reservation.parrainInvitation || {};
      const id = String(reservation.idparrain || parrain.idmembre ||
        affichage.idmembre || "").trim();
      const prenom = String(parrain.prenommembre || parrain.prenom ||
        affichage.prenommembre || "").trim();
      const nom = String(parrain.nommembre || parrain.nom ||
        affichage.nommembre || "").trim();
      const email = String(parrain.emailmembre || parrain.email || "").trim();
      const alias = String(parrain.alias || affichage.alias ||
        affichage.affichage || "").trim();
      if (!id && !email) return null;
      return {
        idmembre_invitant: id,
        prenom: prenom || (!nom && !email ? alias : ""),
        nom,
        email
      };
    }).filter(Boolean);
    const invitantsUniques = dedoublonnerInvitantsCompte(personnes);
    compteur.textContent = libelleCompteurCompte(invitantsUniques.length);
    afficherListeRelationsCompte(conteneur, invitantsUniques,
      "Aucun invitant dans votre historique.");
  }

  // Une inscription doit être reliée au membre connecté ; le catalogue des
  // coachs n'est jamais utilisé pour calculer le nombre d'inscriptions.
  function coachesUniquesCompte(coachs) {
    const ids = new Set(), emails = new Set(), uniques = [];
    for (const coach of coachs) {
      if (!coach || typeof coach !== "object") continue;
      const id = String(coach.idcoach || coach.id || "").trim().toLowerCase();
      const email = String(coach.emailcoach || coach.email || "").trim().toLowerCase();
      if (!id && !email) throw new Error("Coach sans identifiant ni e-mail.");
      if ((id && ids.has(id)) || (email && emails.has(email))) continue;
      if (id) ids.add(id);
      if (email) emails.add(email);
      uniques.push({
        prenom: String(coach.prenomcoach || coach.prenom || "").trim(),
        nom: String(coach.nomcoach || coach.nom || "").trim(),
        email: String(coach.emailcoach || coach.email || "").trim()
      });
    }
    return uniques.sort((a,b) =>
      [a.nom,a.prenom,a.email].join(" ").localeCompare([b.nom,b.prenom,b.email].join(" "), "fr")
    );
  }

  async function chargerCoachsCompte(bloc, compte) {
    const liste = bloc?.querySelector("#lcdp-compte-relations-coach");
    const compteur = bloc?.querySelector('[data-lcdp-relations-nombre="coach"]');
    if (!liste || !compteur) return;
    compteur.textContent = "–";
    try {
      // Le Worker peut inclure les coachs dans /compte, sinon exposer
      // GET /mes-coachs (retour : {ok:true, coachs:[...]}).
      let coachs = compte?.coachs || compte?.mesCoachs;
      if (!Array.isArray(coachs)) {
        if (!ENDPOINT_MON_COMPTE_MEMBRE) throw new Error("Service du compte non configuré.");
        const reponse = await fetch(ENDPOINT_MON_COMPTE_MEMBRE + "/mes-coachs", {
          credentials: "include", cache: "no-store",
          headers: { "Accept": "application/json" }
        });
        if (reponse.status === 401) {
          redirigerConnexionMembre("inactive");
          return;
        }
        const donnees = await reponse.json().catch(() => null);
        if (!reponse.ok || donnees?.ok !== true || !Array.isArray(donnees.coachs)) {
          throw new Error(donnees?.message || "Service des inscriptions aux coachs indisponible.");
        }
        coachs = donnees.coachs;
      }
      const uniques = coachesUniquesCompte(coachs);
      compteur.textContent = libelleCompteurCompte(uniques.length);
      afficherListeRelationsCompte(liste, uniques, "Aucun coach dans vos inscriptions.");
    } catch (erreur) {
      console.error("Inscriptions aux coachs indisponibles :", erreur);
      if (!redirectionCompteEnCours) {
        liste.textContent = "Impossible de charger vos coachs.";
        compteur.textContent = "–";
      }
    }
  }

  async function chargerRelationsInvitationsCompte(bloc) {
    const invites = bloc.querySelector("#lcdp-compte-relations-invite");
    const invitants = bloc.querySelector("#lcdp-compte-relations-invitant");
    const compteurInvites = bloc.querySelector('[data-lcdp-relations-nombre="invite"]');
    const compteurInvitants = bloc.querySelector('[data-lcdp-relations-nombre="invitant"]');
    compteurInvites.textContent = "–";
    compteurInvitants.textContent = "–";
    // Les invitants sont chargés séparément : une route d'invitations absente
    // ne doit pas masquer ceux qui figurent dans les accès reçus.
    void chargerInvitantsDepuisPlanningCompte(invitants, compteurInvitants)
      .catch(erreur => {
        console.error("Invitants depuis le planning indisponibles :", erreur);
        if (!redirectionCompteEnCours) {
          invitants.textContent = "Impossible de charger les invitants.";
          compteurInvitants.textContent = "–";
        }
      });
    let donnees = null;
    try {
      if (!ENDPOINT_INVITER_MEMBRE) throw new Error("Service non configuré.");
      const reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/relations-invitations", {
        credentials: "include", cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }
      donnees = await reponse.json().catch(() => null);
      if (!reponse.ok || donnees?.ok !== true ||
          !Array.isArray(donnees.invites) || !Array.isArray(donnees.invitants)) {
        throw new Error(donnees?.message || "Service indisponible.");
      }

    } catch (erreur) {
      // L'absence de relations historiques ne doit pas masquer les futurs
      // abonnements ni empêcher leur comptage indépendant.
      donnees = null;
      console.error("Relations des invités indisponibles :", erreur);
    }

    void chargerInvitesParAbonnementCompte(invites, compteurInvites, donnees)
      .catch(erreur => {
        console.error("Invités par abonnement indisponibles :", erreur);
        if (!redirectionCompteEnCours) {
          invites.textContent = "Impossible de charger les invités par abonnement.";
          compteurInvites.textContent = "–";
        }
      });
  }

  const ENDPOINT_ALERTES_COMPTE=String(CONFIG_PAGE.workerAlertePlanifierUrl||
    CONFIG_PAGE.WORKER_ALERTE_PLANIFIER_URL||"").replace(/\/+$/,"");

  async function apiAlertesCompte(path,methode="GET") {
    if(!ENDPOINT_ALERTES_COMPTE)throw new Error("Service d'alertes non configuré.");
    const response=await fetch(ENDPOINT_ALERTES_COMPTE+path,{
      method:methode,credentials:"include",cache:"no-store",
      headers:{"Accept":"application/json"}
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||data?.ok!==true)throw new Error(data?.message||"Service d'alertes indisponible.");
    return data;
  }

  async function demanderSuppressionAlerte(titre, options = {}) {
    const slot=document.getElementById("lcdp-lightbox-slot");
    if(!slot)throw new Error("Emplacement du dialogue introuvable.");
    const fragment=await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-suppression.html");
    slot.replaceChildren(fragment);
    const dialogue=slot.querySelector('[data-lcdp-dialogue-reference="suppression"]');
    if(!dialogue)throw new Error("Dialogue de suppression indisponible.");
    dialogue.querySelector("[data-lcdp-dialogue-titre]").textContent=
      options.titre || "Supprimer cette alerte ?";
    dialogue.querySelector("[data-lcdp-dialogue-message]").textContent=
      options.message || ("Supprimer définitivement l’alerte « "+titre+" » ?");
    const conserver=dialogue.querySelector('[data-lcdp-dialogue-action="conserver"]');
    const supprimer=dialogue.querySelector('[data-lcdp-dialogue-action="supprimer"]');
    supprimer.textContent="Supprimer";
    const avant=document.activeElement;
    return new Promise(resolve=>{
      let done=false;
      const terminer=confirmation=>{
        if(done)return;done=true;
        document.removeEventListener("keydown",echap);
        slot.replaceChildren();
        if(avant?.isConnected&&typeof avant.focus==="function")avant.focus();
        resolve(confirmation);
      };
      const echap=e=>{
        if(e.key==="Escape"){e.preventDefault();terminer(false);}
        if(e.key==="Tab"){
          if(e.shiftKey&&document.activeElement===conserver){e.preventDefault();supprimer.focus();}
          else if(!e.shiftKey&&document.activeElement===supprimer){e.preventDefault();conserver.focus();}
        }
      };
      document.addEventListener("keydown",echap);
      conserver.addEventListener("click",()=>terminer(false),{once:true});
      supprimer.addEventListener("click",()=>terminer(true),{once:true});
      dialogue.addEventListener("click",e=>{if(e.target===dialogue)terminer(false);});
      conserver.focus();
    });
  }

  async function chargerAlertesCompte() {
    const liste=document.getElementById("lcdp-compte-alertes-liste");
    if(!liste)return;
    const data=await apiAlertesCompte("/alertes");
    liste.replaceChildren();
    if(!Array.isArray(data.alertes)||!data.alertes.length){
      afficherServiceVideAvecAction(liste,"Aucune alerte planifiée","Créer une alerte",creerAlerteDepuisCompte);
      return;
    }
    for(const alerte of data.alertes){
      const ligne=document.createElement("div");
      ligne.className="lcdp-compte-alerte";
      const ouvrir=document.createElement("button");
      ouvrir.type="button";
      ouvrir.className="lcdp-compte-alerte__nom";
      ouvrir.textContent=alerte.titre;
      ouvrir.setAttribute("aria-label","Modifier l’alerte "+alerte.titre);
      const modifier=document.createElement("button");
      modifier.type="button";
      modifier.className="lcdp-compte-alerte__action lcdp-compte-alerte__modifier";
      modifier.title="Modifier l’alerte";
      modifier.setAttribute("aria-label","Modifier l’alerte "+alerte.titre);
      modifier.innerHTML='<svg class="lcdp-box-champ-formulaire__action-edit-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M4 16.8V20h3.2L17.9 9.3l-3.2-3.2L4 16.8Z"></path><path d="M19.2 8 16 4.8l1.1-1.1a1.7 1.7 0 0 1 2.4 0l.8.8a1.7 1.7 0 0 1 0 2.4L19.2 8Z"></path></svg>';
      const supprimer=document.createElement("button");
      supprimer.type="button";
      supprimer.className="lcdp-compte-alerte__action lcdp-compte-alerte__supprimer";
      supprimer.title="Supprimer l’alerte";
      supprimer.setAttribute("aria-label","Supprimer l’alerte "+alerte.titre);
      supprimer.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg>';
      const edit=async()=>{
        if(typeof window.LCDP_ouvrirFormulaireAlertePlanifier!=="function"){
          await afficherAlerte("Formulaire de modification indisponible.");
          return;
        }
        await window.LCDP_ouvrirFormulaireAlertePlanifier({
          alerte,onEnregistre:async()=>{
            await chargerAlertesCompte();
            await afficherInformationMembre("L’alerte a été modifiée et enregistrée. Pour utiliser cette alerte, ouvrez PLANIFIER depuis l’accueil membre, puis choisissez ALERTE PLANIFIER.","SERVICE");
          }
        });
      };
      ouvrir.addEventListener("click",()=>edit().catch(err=>afficherAlerte(err.message)));
      modifier.addEventListener("click",()=>edit().catch(err=>afficherAlerte(err.message)));
      supprimer.addEventListener("click",async()=>{
        try{
          if(!await demanderSuppressionAlerte(alerte.titre))return;
          await apiAlertesCompte("/alertes/"+encodeURIComponent(alerte.idalerte),"DELETE");
          await chargerAlertesCompte();
        }catch(err){await afficherAlerte(err.message||"Suppression impossible.");}
      });
      const actions=document.createElement("div");
      actions.className="lcdp-compte-alerte__actions";
      actions.append(supprimer,modifier);
      ligne.append(ouvrir,actions);
      liste.append(ligne);
    }
  }

  // Duo Actif : les demandes proviennent de Mon compte, sans accès direct du navigateur à Supabase.
  async function apiDuoActifCompte(path="/duoactif", methode="GET") {
    if(!ENDPOINT_MON_COMPTE_MEMBRE)throw new Error("Service Duo Actif non configuré.");
    const response=await fetch(ENDPOINT_MON_COMPTE_MEMBRE+path,{
      method:methode,credentials:"include",cache:"no-store",
      headers:{"Accept":"application/json"}
    });
    const data=await response.json().catch(()=>null);
    if(response.status===401) {
      redirigerConnexionMembre("inactive");
      throw new Error("Votre session membre doit être renouvelée.");
    }
    if(!response.ok||data?.ok!==true)throw new Error(data?.message||"Service Duo Actif indisponible.");
    return data;
  }

  function dateDuoActifFrancais(valeur) {
    const date=new Date(String(valeur||""));
    if(!Number.isFinite(date.getTime()))return "date indisponible";
    return new Intl.DateTimeFormat("fr-FR",{
      timeZone:"Europe/Paris",day:"2-digit",month:"2-digit",year:"numeric"
    }).format(date);
  }

  async function chargerDuoActifCompte() {
    const liste=document.getElementById("lcdp-compte-duoactif-liste");
    if(!liste)return;
    const data=await apiDuoActifCompte();
    liste.replaceChildren();
    if(!Array.isArray(data.demandes)||!data.demandes.length) {
      afficherServiceVideAvecAction(liste,"Aucune demande enregistrée.","Faire une demande",()=>{window.location.href=construireUrlMembre("/ESPACE-MEMBRE/reserver-membre.html");});
      return;
    }
    for(const demande of data.demandes) {
      const nomParc=String(demande.nomparc||"Parc indisponible");
      const ligne=document.createElement("div");
      ligne.className="lcdp-compte-alerte";
      const description=document.createElement("span");
      description.className="lcdp-compte-alerte__nom";
      const mois = /^\d{4}-\d{2}-01$/.test(String(demande.mois_cible||""))
        ? new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(new Date(demande.mois_cible+"T12:00:00Z"))
        : null;
      description.textContent = mois ? nomParc+" — "+mois : nomParc+" — du "+dateDuoActifFrancais(demande.datecreation)+" au "+dateDuoActifFrancais(demande.dateexpiration);
      const supprimer=document.createElement("button");
      supprimer.type="button";
      supprimer.className="lcdp-compte-alerte__action lcdp-compte-alerte__supprimer";
      supprimer.title="Supprimer la demande Duo Actif";
      supprimer.setAttribute("aria-label","Supprimer la demande Duo Actif pour "+nomParc);
      supprimer.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg>';
      supprimer.addEventListener("click",async()=>{
        try {
          const confirmation=await demanderSuppressionAlerte(nomParc,{
            titre:"Supprimer cette demande Duo Actif ?",
            message:"Supprimer la demande Duo Actif pour le parc « "+nomParc+" » ?"
          });
          if(!confirmation)return;
          supprimer.disabled=true;
          await apiDuoActifCompte("/duoactif/"+encodeURIComponent(demande.idduoactif),"DELETE");
          await chargerDuoActifCompte();
        } catch(err) {
          supprimer.disabled=false;
          await afficherAlerte(err.message||"Suppression Duo Actif impossible.");
        }
      });
      const actions=document.createElement("div");
      actions.className="lcdp-compte-alerte__actions";
      actions.append(supprimer);
      ligne.append(description,actions);
      liste.append(ligne);
    }
  }

  function marquerChampLectureSeuleInfo(champId) {
    const input = document.getElementById(champId);
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

    if (!input || !champ) return;

    champ.classList.add("lcdp-box-champ-formulaire--lecture-seule-info");
    input.setAttribute("aria-readonly", "true");
  }

  function ajouterLienInformationApresChamp(champId, lienConfig) {
    const input = document.getElementById(champId);
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

    if (!champ) return;

    const labelZone=champ.querySelector(".lcdp-box-champ-formulaire__label-zone");
    if(!labelZone)return;
    const lien = document.createElement("a");
    lien.className = "lcdp-link-secondary";
    lien.href = lienConfig.espace === "membre"
      ? construireUrlMembre(lienConfig.href || "#")
      : construireUrlPublic(lienConfig.href || "#");
    lien.textContent = lienConfig.texteLien || "";
    lien.target = "_blank";
    lien.rel = "noopener noreferrer";

    labelZone.appendChild(lien);
    if (lienConfig.sansValeur === true) champ.querySelector("[data-lcdp-champ-control]")?.remove();
  }

  function ajouterActionsAdresseFacturation() {
    const input = document.getElementById("champ-adresse3-membre");
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

    if (!champ || document.getElementById("voir-factures-membre")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "lcdp-box-formulaire__actions lcdp-compte-actions-adresse";

    const boutonFactures = document.createElement("button");
    boutonFactures.id = "voir-factures-membre";
    boutonFactures.type = "button";
    boutonFactures.className = "lcdp-button lcdp-button-secondary";
    boutonFactures.textContent = "Voir mes factures";

    wrapper.appendChild(boutonFactures);
    champ.insertAdjacentElement("afterend", wrapper);
  }

  function ajouterBoutonModificationApresChamp(champId, action) {
    const input = document.getElementById(champId);
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

    if (!champ) return;

    if (action.mode === "picto" || action.id === "modifier-alias-membre" || action.id === "modifier-email-membre") {
      ajouterPictoModificationDansChamp(input, champ, action);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "lcdp-box-formulaire__actions lcdp-compte-actions-adresse";

    const bouton = document.createElement("button");
    bouton.id = action.id;
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-secondary";
    bouton.textContent = action.texte;

    wrapper.appendChild(bouton);
    champ.insertAdjacentElement("afterend", wrapper);
  }

  function ajouterPictoModificationDansChamp(input, champ, action) {
    const zoneControl = champ.querySelector("[data-lcdp-champ-control]") || input.parentNode;

    if (!zoneControl) return;

    champ.classList.add("lcdp-box-champ-formulaire--compte-action", "lcdp-box-champ-formulaire--modifiable");
    zoneControl.classList.add("lcdp-box-champ-formulaire__control--modifiable");

    const bouton = document.createElement("button");
    bouton.id = action.id;
    bouton.type = "button";
    bouton.className = "lcdp-box-champ-formulaire__action-edit";

    if (action.pictoRouge === true) {
      bouton.classList.add("lcdp-box-champ-formulaire__action-edit--rouge");
    }

    if (action.affichageDaOui === true) {
      bouton.dataset.lcdpActionDaProtegee = "true";
      bouton.hidden = true;
      bouton.disabled = true;
      bouton.tabIndex = -1;
      bouton.setAttribute("aria-hidden", "true");
    }

    bouton.setAttribute("aria-label", action.texte || "Modifier l'alias");
    bouton.title = action.texte || "Modifier l'alias";
    if (action.enAttente === true) {
      bouton.disabled = true;
      bouton.setAttribute("aria-disabled", "true");
    }
    const actionSecurite = action.neutre !== true && (action.securite === true || action.id === "modifier-selfie" || champsCompte.some(
      item => item.section === "Sécurité du compte" && item.action?.id === action.id
    ));
    if (actionSecurite) {
      bouton.classList.add("lcdp-compte-action-prioritaire");
      // Pictogramme d'origine fourni dans l'exemple Tailwind.
      bouton.textContent = "🔒";
    } else {
      bouton.innerHTML = `
        <svg class="lcdp-box-champ-formulaire__action-edit-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M4 16.8V20h3.2L17.9 9.3l-3.2-3.2L4 16.8Z"></path>
          <path d="M19.2 8 16 4.8l1.1-1.1a1.7 1.7 0 0 1 2.4 0l.8.8a1.7 1.7 0 0 1 0 2.4L19.2 8Z"></path>
        </svg>`;
    }

    // Champs imbriqués : le contrôle générique fournit le conteneur positionné.
    if (action.id === "modifier-telephone-membre" || champ.classList.contains("lcdp-compte-equipement-temoin")) zoneControl.appendChild(bouton);
    else champ.appendChild(bouton);
  }

  function ajouterBadgeInformationDansChamp(champId, badgeConfig) {
    const input = document.getElementById(champId);
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;
    const zoneControl = champ ? champ.querySelector("[data-lcdp-champ-control]") || input.parentNode : null;

    if (!input || !champ || !zoneControl) return;

    champ.classList.add("lcdp-box-champ-formulaire--badge");
    zoneControl.classList.add("lcdp-box-champ-formulaire__control--badge");

    const badge = document.createElement("span");
    badge.id = badgeConfig.id || champId + "-badge";
    badge.className = "lcdp-box-champ-formulaire__badge";
    badge.hidden = true;
    badge.setAttribute("aria-hidden", "true");

    const image = document.createElement("img");
    image.className = "lcdp-box-champ-formulaire__badge-image";
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";

    badge.appendChild(image);
    zoneControl.appendChild(badge);
  }


  function initialiserActionsModification() {
    document.getElementById("modifier-geolocalisation-membre")?.addEventListener("click",demanderMiseAJourGeolocalisation);
    document.getElementById("modifier-majorite-membre")?.addEventListener("click",demanderModificationMajorite);
    const boutonCodr=document.getElementById("modifier-code-r-membre");
    if (boutonCodr) boutonCodr.addEventListener("click",demanderModificationCodr);
    const boutonCoda = document.getElementById("modifier-code-a-membre");
    if (boutonCoda) boutonCoda.addEventListener("click", ouvrirModificationCoda);
    const boutonAlias = document.getElementById("modifier-alias-membre");
    const boutonEmail = document.getElementById("modifier-email-membre");
    const boutonPoints = document.getElementById("voir-mes-points");
    const boutonParrain = document.getElementById("modifier-parrain-membre");
    const boutonDepartement = document.getElementById("modifier-departement-membre");
    const boutonTelephone = document.getElementById("modifier-telephone-membre");
    const actionsAdresseFacturation = [
      { bouton: document.getElementById("modifier-adresse1-membre"), champ: "adresse1", label: "Adresse 1" },
      { bouton: document.getElementById("modifier-adresse2-membre"), champ: "adresse2", label: "Adresse 2" },
      { bouton: document.getElementById("modifier-adresse3-membre"), champ: "adresse3", label: "Adresse 3" }
    ].filter((action) => action.bouton);
    const boutonFactures = document.getElementById("voir-factures-membre");
    const boutonIban = document.getElementById("modifier-iban-membre");
    const boutonSwift = document.getElementById("modifier-swift-membre");
    const boutonRib = document.getElementById("modifier-rib-membre");

    if (boutonAlias) boutonAlias.addEventListener("click", ouvrirDialogueAliasMembre);
    if (boutonEmail) boutonEmail.addEventListener("click", ouvrirDialogueEmailMembre);
    if (boutonPoints) boutonPoints.addEventListener("click", ouvrirPagePointsMembre);
    if (boutonParrain) boutonParrain.addEventListener("click", ouvrirDialogueParrainMembre);
    if (boutonDepartement) boutonDepartement.addEventListener("click", ouvrirDialogueDepartementMembre);
    if (boutonTelephone) boutonTelephone.addEventListener("click", ouvrirDialogueTelephoneMembre);
    actionsAdresseFacturation.forEach((action) => {
      action.bouton.addEventListener("click", ouvrirDialogueAdresseFacturationMembre);
    });
    if (boutonFactures) boutonFactures.addEventListener("click", ouvrirPageFacturesMembre);
    if (boutonIban) boutonIban.addEventListener("click", () => ouvrirDialogueCoordonneeRemboursementMembre("iban", "IBAN"));
    if (boutonSwift) boutonSwift.addEventListener("click", () => ouvrirDialogueCoordonneeRemboursementMembre("swift", "SWIFT"));
    if (boutonRib) boutonRib.addEventListener("click", () => ouvrirDialogueCoordonneeRemboursementMembre("rib", "Nom du titulaire"));
  }

  async function chargerCompteMembre() {
    if (!ENDPOINT_MON_COMPTE_MEMBRE) {
      await afficherAlerte("Le service du compte membre n’est pas configuré.");
      return;
    }

    const reponse = await fetch(ENDPOINT_MON_COMPTE_MEMBRE + "/compte", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return;
    }

    if (!reponse.ok || !resultat || resultat.ok !== true || !resultat.compte) {
      throw new Error(messageErreurApi(resultat, "Impossible de charger vos informations."));
    }

    const compte = resultat.compte;

    afficherCompteMembre(compte);
    // Si /compte n'expose pas encore membres.tel, le récupérer via la demande de DA.
    void completerTelephoneCompteDepuisDa(compte);
    afficherEtatMembreCompte(compte);
    void chargerCoachsCompte(document.getElementById("lcdp-compte-relations"), compte);
    // Le compte est prêt : les appels optionnels ne retardent plus l'affichage.
    terminerAttenteCompte();
    void Promise.allSettled([
      chargerSelfie(),
      chargerSelfie("duoday"),
      chargerEquipementsPresence(),
      actualiserBurgerMembre(compteIndiqueAbonne(compte))
    ]);
  }

  // La demande de DA enregistre tel dans membres ; /contexte relit cette même colonne
  // pour le membre authentifié. Le complément n'empêche jamais l'ouverture du compte.
  async function completerTelephoneCompteDepuisDa(compte) {
    if (String(compte?.tel || compte?.telephone || "").trim() || !ENDPOINT_DA_MEMBRE_COMPTE) return;

    try {
      const reponse = await fetch(ENDPOINT_DA_MEMBRE_COMPTE + "/contexte", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (!reponse.ok) return;
      const donnees = await reponse.json().catch(() => null);
      if (!donnees || (donnees.ok !== true && donnees.success !== true)) return;

      const membreDa = donnees.membre;
      if (!membreDa) return;
      // Les deux Workers doivent concerner le même membre authentifié.
      if (compte?.idmembre &&
          String(membreDa.idmembre || "").trim().toLowerCase() !==
          String(compte.idmembre).trim().toLowerCase()) return;

      const telephoneDa = String(membreDa.tel || "").trim();
      if (!telephoneDa || compteMembreActuel !== compte) return;
      compteMembreActuel.tel = telephoneDa;
      remplirChamp("champ-telephone-membre", telephoneDa);
    } catch (erreur) {
      console.warn("Téléphone de la demande de DA indisponible dans Mon compte :", erreur);
    }
  }

  async function actualiserBurgerMembre(abonne) {
    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre({
        etatMembre: {
          abonne: abonne === true
        }
      });
    }
  }

  function compteIndiqueAbonne(compte) {
    const statut = String(compte?.statut || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");

    return statut === "abonne";
  }

  function afficherEtatMembreCompte(compte) {
    let mention = document.getElementById("mention-statut-membre");

    if (!mention) {
      const titre = document.querySelector(".lcdp-title-page-center");
      if (!titre || !titre.parentNode) return;

      mention = document.createElement("p");
      mention.id = "mention-statut-membre";
      mention.className = "lcdp-mention-connexion";
      titre.insertAdjacentElement("afterend", mention);
    }

    mention.textContent = compteIndiqueAbonne(compte)
      ? "MEMBRE ABONNÉ"
      : "MEMBRE INVITÉ";

    afficherSuspensionMembre({
      abonnementSuspendu: valeurBooleenneVraie(compte?.abonnementSuspendu || compte?.suspendu),
      paiementSuspension: compte?.paiementSuspension || compte?.paiementRegularisation || null
    });
  }

  function afficherSuspensionMembre(etat) {
    const mention = document.getElementById("mention-statut-membre");
    if (!mention || !mention.parentNode) return;

    let bloc = document.getElementById("mention-suspension-abonnement-membre");

    if (!etat || etat.abonnementSuspendu !== true) {
      if (bloc) bloc.remove();
      return;
    }

    if (!bloc) {
      bloc = document.createElement("div");
      bloc.id = "mention-suspension-abonnement-membre";
      bloc.className = "lcdp-mention-connexion lcdp-mention-suspension-abonnement";
      mention.insertAdjacentElement("afterend", bloc);
    }

    bloc.innerHTML = "";

    const delaiPaiementDepasse = paiementSuspensionDelaiDepasse(etat?.paiementSuspension);

    const texte = document.createElement("span");
    texte.textContent = delaiPaiementDepasse
      ? "[Règlement indisponible]"
      : "[Votre abonnement est suspendu (non payé)]";
    bloc.appendChild(texte);

    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-secondary lcdp-workflow-micro-action";
    bouton.classList.toggle("lcdp-workflow-micro-action--paiement-depasse", delaiPaiementDepasse);
    bouton.setAttribute("aria-disabled", delaiPaiementDepasse ? "true" : "false");
    bouton.textContent = "Payer";
    bouton.addEventListener("click", () => {
      gererPaiementSuspensionMembre(etat).catch(console.error);
    });
    bloc.appendChild(bouton);
  }

  async function gererPaiementSuspensionMembre(etat) {
    await afficherEcheancesPaiementSuspension(etat);
  }

  async function afficherEcheancesPaiementSuspension(etat) {
    const paiement = etat && etat.paiementSuspension ? etat.paiementSuspension : null;
    const orderid = String(paiement?.orderid || "").trim();
    const echeances = echeancesPaiementSuspension(paiement);

    if (paiementSuspensionDelaiDepasse(paiement)) {
      await afficherAlerte(messageDelaiPaiementDepasse());
      return;
    }

    if (!orderid) {
      await afficherAlerte("Paiement introuvable.");
      return;
    }

    if (!echeances.length) {
      await afficherInformationMembre("Aucune échéance non payée.", "Échéances de paiement");
      return;
    }

    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-bouton.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = slot.querySelector("[data-lcdp-dialogue-title]");
    const texte = slot.querySelector("[data-lcdp-dialogue-text]");
    const actions = slot.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      slot.innerHTML = "";
      throw new Error("Structure dialogue bouton incomplète.");
    }

    titre.textContent = "Paiement en attente";
    texte.textContent = "";
    texte.hidden = true;
    actions.innerHTML = "";
    actions.classList.add("lcdp-dialogue-echeances-impayees");

    echeances.forEach((echeance) => {
      const ligne = document.createElement("div");
      ligne.className = "lcdp-dialogue-echeances-impayees__row";

      const description = document.createElement("p");
      description.className = "lcdp-dialogue-echeances-impayees__text";
      description.textContent = "Échéance " + String(echeance.numero) + " du " + formaterDatePaiementSuspension(echeance.date) + " : " + formaterMontantPaiementSuspension(echeance.montant) + " TTC\nNon payée";

      const boutonPayer = creerBoutonPaiementSuspension("Payer", "lcdp-button-secondary lcdp-workflow-micro-action lcdp-workflow-micro-action--alerte-paiement", () => {
        ouvrirPagePaiementSuspension(paiement, echeance.numero).catch(console.error);
      });

      ligne.appendChild(description);
      ligne.appendChild(boutonPayer);
      actions.appendChild(ligne);
    });


    function fermer() {
      slot.innerHTML = "";
    }

    boutonFermer.addEventListener("click", fermer);
    dialogue.addEventListener("click", (event) => {
      if (event.target === dialogue) fermer();
    });

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") fermer();
      },
      { once: true }
    );
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

  function creerBoutonPaiementSuspension(label, style, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button " + (style || "lcdp-button-primary");
    bouton.textContent = label || "OK";
    bouton.addEventListener("click", action);
    return bouton;
  }

  async function ouvrirPagePaiementSuspension(paiement, numeroEcheance) {
    const orderid = String(paiement?.orderid || "").trim();

    if (!orderid) {
      await afficherAlerte("Commande non renseignée.");
      return;
    }

    if (paiementSuspensionDelaiDepasse(paiement)) {
      await afficherAlerte(messageDelaiPaiementDepasse());
      return;
    }

    const ok = await afficherChoixMesInformations("Vous allez être dirigé vers la page de paiement. La régularisation de votre abonnement se fait par carte bancaire uniquement.", { titre: "Régulariser l’abonnement", libelleConfirmer: "Continuer vers le paiement" });
    if (!ok) return;

    const separateur = PAGE_PAIEMENT_CB.includes("?") ? "&" : "?";
    window.location.href = PAGE_PAIEMENT_CB + separateur + "orderid=" + encodeURIComponent(orderid) + "&echeance=" + encodeURIComponent(String(numeroEcheance || 1)) + "&source=suspension";
  }


  function messageDelaiPaiementDepasse() {
    return "Le règlement de cette échéance est indisponible.";
  }

  function paiementSuspensionDelaiDepasse(paiement) {
    if (!paiement || typeof paiement !== "object") return false;

    if (valeurBooleenneVraie(paiement.delaiPaiementDepasse) || valeurBooleenneVraie(paiement.abonnementAnnuleNonPaye)) {
      return true;
    }

    return false; // La fin du contrat ne rend pas les échéances inexigibles.
  }


  function dateIsoPaiementDepuisValeur(value) {
    const texte = String(value || "").trim();
    const match = texte.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      return match[1] + "-" + match[2] + "-" + match[3];
    }

    const date = new Date(texte);

    if (Number.isNaN(date.getTime())) return "";

    return dateHeureParisPaiement(date).dateIso;
  }

  function dateHeureParisPaiement(date) {
    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23"
    }).formatToParts(date);

    const valeur = (type) => morceaux.find((item) => item.type === type)?.value || "";

    return {
      dateIso: valeur("year") + "-" + valeur("month") + "-" + valeur("day"),
      heure: Number(valeur("hour") || 0),
      minute: Number(valeur("minute") || 0)
    };
  }

  function formaterDatePaiementSuspension(value) {
    if (!value) return "Non renseignée";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formaterMontantPaiementSuspension(value) {
    const nombre = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(nombre)) return "Non renseigné";
    return nombre.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  }

  function valeurBooleenneVraie(valeur) {
    return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
  }

  function formaterAliasAffichage(value) {
    const alias = nettoyerTexteSimple(value);
    return alias || "–";
  }

  function formaterMembreDepuis(value) {
    if (!value) return "–";
    const dateAffichee = formaterDate(value);
    const morceaux = dateAffichee.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return morceaux
      ? Number(morceaux[1]) + "-" + Number(morceaux[2]) + "-" + morceaux[3]
      : dateAffichee;
  }

  function formaterParrainAffichage(value) {
    const email = nettoyerEmail(value);
    return email || "Non renseigné";
  }

  // Référentiel des départements français : libellé de présentation seulement.
  // Les codes inconnus sont conservés tels quels, sans inventer de nom.
  const NOMS_DEPARTEMENTS_COMPTE = Object.freeze({
    "01":"Ain","02":"Aisne","03":"Allier","04":"Alpes-de-Haute-Provence",
    "05":"Hautes-Alpes","06":"Alpes-Maritimes","07":"Ardèche","08":"Ardennes",
    "09":"Ariège","10":"Aube","11":"Aude","12":"Aveyron","13":"Bouches-du-Rhône",
    "14":"Calvados","15":"Cantal","16":"Charente","17":"Charente-Maritime",
    "18":"Cher","19":"Corrèze","2A":"Corse-du-Sud","2B":"Haute-Corse",
    "21":"Côte-d'Or","22":"Côtes-d'Armor","23":"Creuse","24":"Dordogne",
    "25":"Doubs","26":"Drôme","27":"Eure","28":"Eure-et-Loir",
    "29":"Finistère","30":"Gard","31":"Haute-Garonne","32":"Gers",
    "33":"Gironde","34":"Hérault","35":"Ille-et-Vilaine","36":"Indre",
    "37":"Indre-et-Loire","38":"Isère","39":"Jura","40":"Landes",
    "41":"Loir-et-Cher","42":"Loire","43":"Haute-Loire","44":"Loire-Atlantique",
    "45":"Loiret","46":"Lot","47":"Lot-et-Garonne","48":"Lozère",
    "49":"Maine-et-Loire","50":"Manche","51":"Marne","52":"Haute-Marne",
    "53":"Mayenne","54":"Meurthe-et-Moselle","55":"Meuse","56":"Morbihan",
    "57":"Moselle","58":"Nièvre","59":"Nord","60":"Oise",
    "61":"Orne","62":"Pas-de-Calais","63":"Puy-de-Dôme","64":"Pyrénées-Atlantiques",
    "65":"Hautes-Pyrénées","66":"Pyrénées-Orientales","67":"Bas-Rhin","68":"Haut-Rhin",
    "69":"Rhône","70":"Haute-Saône","71":"Saône-et-Loire","72":"Sarthe",
    "73":"Savoie","74":"Haute-Savoie","75":"Paris","76":"Seine-Maritime",
    "77":"Seine-et-Marne","78":"Yvelines","79":"Deux-Sèvres","80":"Somme",
    "81":"Tarn","82":"Tarn-et-Garonne","83":"Var","84":"Vaucluse",
    "85":"Vendée","86":"Vienne","87":"Haute-Vienne","88":"Vosges",
    "89":"Yonne","90":"Territoire de Belfort","91":"Essonne","92":"Hauts-de-Seine",
    "93":"Seine-Saint-Denis","94":"Val-de-Marne","95":"Val-d'Oise",
    "971":"Guadeloupe","972":"Martinique","973":"Guyane","974":"La Réunion","976":"Mayotte"
  });

  function formaterDepartementAffichage(value, compte = null) {
    const departement = nettoyerDepartement(value).toUpperCase();
    if (!departement) return "–";
    const code = /^\d$/.test(departement) ? "0" + departement : departement;
    const nomApi = nettoyerTexteSimple(
      compte?.nomDepartement || compte?.nomdepartement || compte?.departementNom || ""
    );
    const nom = nomApi || NOMS_DEPARTEMENTS_COMPTE[code];
    return nom ? nom + " (" + code + ")" : departement;
  }

  function formaterDaCompte(compte) {
    const dateDa = compte?.dateDa || compte?.dateda || "";
    const statuda = nettoyerTexteSimple(compte?.statuda || "");

    const etat = normaliserStatudaCompte(statuda);
    if (etat === "oui") return "DA accordé";
    if (etat === "non") return "DA non accordé";
    if (dateDa || etat) return "Demande de DA" + (dateDa ? " du " + formaterDate(dateDa) : "") + " en cours";
    return "Demande de DA non transmise";
  }


// Ouverture du parcours de demande de DA existant, avec ses contrôles serveur et sans duplication.
let ouvertureDaCompteEnCours = false;
async function ouvrirDemandeDaDepuisCompte() {
  if (ouvertureDaCompteEnCours || document.getElementById("lcdp-da-membre-overlay-slot")) return;
  ouvertureDaCompteEnCours = true;
  try {
    if (typeof window.LCDP_ouvrirPremiereDaMembre !== "function") {
      await chargerScriptMembreUneFois("/ESPACE-MEMBRE/da-membre.js?v=20261124-droit-abonnement");
    }
    if (typeof window.LCDP_ouvrirPremiereDaMembre !== "function") {
      throw new Error("Le formulaire de demande de DA est indisponible.");
    }
    await window.LCDP_ouvrirPremiereDaMembre({
      contexte: {...compteMembreActuel},
      onStatudaChange: donnees => {
        if (!compteMembreActuel) return;
        const avant = normaliserStatudaCompte(compteMembreActuel.statuda || compteMembreActuel.statutDa || compteMembreActuel.da || "");
        Object.assign(compteMembreActuel, donnees, {dateDa: donnees.dateda || null});
        afficherStatutDaCompte(compteMembreActuel);
        if (avant !== normaliserStatudaCompte(donnees.statuda)) {
          void actualiserBlocAbonnementCompte(compteMembreActuel);
        }
      }
    });
  } catch (erreur) {
    await afficherAlerte(erreur.message || "Le formulaire de demande de DA est indisponible.");
  } finally {
    ouvertureDaCompteEnCours = false;
  }
}

// Le champ de lecture d'origine reste dans le DOM pour le formulaire.
function afficherStatutDaCompte(compte) {
  const input = document.getElementById("champ-da-membre");
  const ligne = input?.closest("[data-lcdp-box-champ-formulaire]");
  const label = ligne?.querySelector(".lcdp-box-champ-formulaire__label, .lcdp-box-champ-formulaire__heading");
  const controle = ligne?.querySelector("[data-lcdp-champ-control]") || input?.parentNode;
  if (!input || !ligne || !label || !controle) return;

  const dateBrute = compte?.dateDa || compte?.dateda || "";
  label.textContent = dateBrute ? "Demande de DA du " + formaterDate(dateBrute) : "Droit d’abonnement (DA)";
  const statutBrut = normaliserStatudaCompte(compte?.statuda || compte?.statutDa || compte?.da || "");
  const enCours = ["encours", "en_cours", "attente"].includes(statutBrut);
  const validee = statutBrut === "oui";
  const nonValidee = statutBrut === "non";
  const nonTransmise = !statutBrut && !dateBrute;
  if (nonTransmise) label.textContent = "Demande de DA non transmise";
  else if (enCours) label.textContent = "Demande de DA transmise" + (dateBrute ? " le " + formaterDate(dateBrute) : "");
  const libelle = enCours ? "En cours" : validee ? "DA accordé" : nonValidee ? "DA non accordé"
    : statutBrut ? nettoyerTexteSimple(compte?.statuda || compte?.statutDa || compte?.da) : "Non transmise";

  ligne.classList.add("lcdp-compte-da");
  ligne.classList.toggle("lcdp-compte-da--en-cours", enCours);
  ligne.classList.toggle("lcdp-compte-da--validee", validee);
  ligne.classList.toggle("lcdp-compte-da--non-validee", nonValidee);
  ligne.classList.toggle("lcdp-compte-da--autre", !enCours && !validee && !nonValidee);
  let badge = controle.querySelector(".lcdp-compte-da__statut");
  let action = controle.querySelector("[data-lcdp-compte-da-action]");
  if (nonTransmise) {
    badge?.remove();
    if (!action) {
      action = document.createElement("button");
      action.type = "button";
      action.className = "lcdp-ui-badge lcdp-ui-badge--action";
      action.setAttribute("data-lcdp-compte-da-action", "");
      action.textContent = "Faire ma demande de DA";
      action.addEventListener("click", ouvrirDemandeDaDepuisCompte);
      controle.appendChild(action);
    }
  } else {
    action?.remove();
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "lcdp-compte-da__statut";
      controle.appendChild(badge);
    }
    badge.textContent = libelle;
  }
}

  function formaterStatutCompte(value) {
    const statut = String(value || "").trim().toLowerCase();

    if (statut === "abonné" || statut === "abonne") {
      return "Abonné";
    }

    return "Invité";
  }

  function formaterPointsClub(compte) {
    const pointsObjet = compte?.points || {};
    const points =
      compte?.pointsClub ??
      compte?.pointsclub ??
      pointsObjet.points ??
      null;
    const dateCalcul =
      compte?.dateCalculPointsClub ||
      compte?.datePointsClub ||
      pointsObjet.date ||
      "";
    const prochainReferent =
      compte?.prochainReferentPointsClub ||
      null;

    if (
      points === null ||
      points === undefined ||
      points === ""
    ) {
      return "";
    }

    const libellePoint =
      Number(points) === 1 ? "point passion" : "points passion";
    const dateAffichage = formaterDate(dateCalcul);
    const seuilSuivant =
      nombreOuNullCompte(prochainReferent?.seuil);
    const statutSuivant =
      normaliserBadgePoints(
        prochainReferent?.statut || ""
      );

    let affichage =
      String(points) +
      " " +
      libellePoint +
      " (total à jour le " +
      dateAffichage;

    if (
      statutSuivant &&
      seuilSuivant !== null
    ) {
      const seuilAffiche = Math.max(0, seuilSuivant - 1);
      const libelleSeuil =
        seuilAffiche === 1 ? "point" : "points";

      affichage +=
        " — référent " +
        statutSuivant +
        " au-dessus de " +
        String(seuilAffiche) +
        " " +
        libelleSeuil +
        " le " +
        dateAffichage;
    }

    return affichage + ")";
  }

  function nombreOuNullCompte(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const nombre = Number(value);

    return Number.isFinite(nombre)
      ? nombre
      : null;
  }

  function capitaliserBadgePoints(value) {
    const badge = normaliserBadgePoints(value);

    return badge
      ? badge.charAt(0).toUpperCase() +
        badge.slice(1)
      : "";
  }

  function actualiserBadgePointsClub(compte) {
    const badge = document.getElementById("badge-points-club-membre");
    const image = badge ? badge.querySelector(".lcdp-box-champ-formulaire__badge-image") : null;
    const champ = badge ? badge.closest("[data-lcdp-box-champ-formulaire]") : null;
    const zoneControl = badge ? badge.closest("[data-lcdp-champ-control]") : null;

    if (!badge || !image) return;

    const pointsObjet = compte?.points || {};
    const badgePoints = obtenirNiveauReferentCompte(compte);

    if (!badgePoints) {
      badge.hidden = true;
      image.removeAttribute("src");
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      champ?.classList.remove("lcdp-box-champ-formulaire--badge");
      zoneControl?.classList.remove("lcdp-box-champ-formulaire__control--badge");
      return;
    }

    champ?.classList.add("lcdp-box-champ-formulaire--badge");
    zoneControl?.classList.add("lcdp-box-champ-formulaire__control--badge");

    const cheminBadge = "/IMAG/BADG/badge-" + badgePoints + "-";

    image.src = construireUrlObjet(cheminBadge + "96.webp");
    image.srcset = [
      construireUrlObjet(cheminBadge + "64.webp") + " 64w",
      construireUrlObjet(cheminBadge + "96.webp") + " 96w",
      construireUrlObjet(cheminBadge + "192.webp") + " 192w"
    ].join(", ");
    image.sizes = "(min-width: 768px) 44px, (max-width: 420px) 38px, 40px";
    badge.hidden = false;
  }

  // Un niveau doit être communiqué explicitement par le Worker :
  // le total de points seul ne permet pas d'attribuer un statut Référent.
  function obtenirNiveauReferentCompte(compte) {
    const pointsObjet = compte?.points || {};
    const niveaux = [
      compte?.statutPointsClub,
      compte?.statutReferentPointsClub,
      compte?.niveauReferent,
      pointsObjet.statut,
      pointsObjet.niveau
    ];
    return niveaux.map(normaliserBadgePoints).find(Boolean) || "";
  }

  function normaliserBadgePoints(value) {
    const badge = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "");

    const correspondances = {
      bronze: "bronze", bronse: "bronze",
      referentbronze: "bronze", referentbronse: "bronze",
      argent: "argent", referentargent: "argent",
      or: "or", referentor: "or",
      platine: "platine", referentplatine: "platine"
    };

    return correspondances[badge] || "";
  }

  function formaterReglementCompte(label, value) {
    return "Dernier opt-in : " + (value ? formaterDate(value) : "non renseigné");
  }

  function afficherCompteMembre(compte) {
    compteMembreActuel = compte || {};
    emailMembreActuel = nettoyerEmail(compteMembreActuel.email);
    const pointsVisibles = autoriserAffichagePointsCompte(compteMembreActuel);
    document.getElementById("form-mes-informations-membre")
      ?.classList.toggle("lcdp-compte-points-visibles", pointsVisibles);

    const compteAffiche = {
      ...compteMembreActuel,
      // Masques constants : ils ne révèlent jamais les secrets réels.
      codeAAffichage: "••••",
      codeRAffichage: "•••• - •••• - •••• - ••••",
      telephoneAffichage: String(compteMembreActuel.tel || compteMembreActuel.telephone || "").trim() || "–",
      cgvAffichage: "",
      geolocalisationAffichage: compteMembreActuel.optinGeolocalisation
        ? "Opt-in le " + formaterDate(compteMembreActuel.optinGeolocalisation)
        : "Non enregistré",
      alias: formaterAliasAffichage(compteMembreActuel.alias),
      majoriteAffichage: compteMembreActuel.majorite === "mineur" ? "Mineur"
        : compteMembreActuel.majorite === "majeur" ? "Majeur" : "–",
      membreDepuisAffichage: formaterMembreDepuis(compteMembreActuel.membreDepuis),
      parrainAffichage: formaterParrainAffichage(compteMembreActuel.parrain),
      departementAffichage: formaterDepartementAffichage(compteMembreActuel.departement, compteMembreActuel),
      optinGeolocalisationAffichage: compteMembreActuel.optinGeolocalisation ? formaterDate(compteMembreActuel.optinGeolocalisation) : "Non enregistré",
      daAffichage: formaterDaCompte(compteMembreActuel),
      statutAffichage: formaterStatutCompte(compteMembreActuel.statut),
      pointsClubAffichage: pointsVisibles ? formaterPointsClub(compteMembreActuel) : "",
      reglementClubAffichage: formaterReglementCompte("Club", compteMembreActuel.reglementClub),
      reglementApplicationAffichage: formaterReglementCompte("Application", compteMembreActuel.reglementApplication)
    };

    champsCompte.forEach((champ) => {
      if (!pointsVisibles && champ.id === "champ-points-club-membre") return;
      remplirChamp(
        champ.id,
        compteAffiche[champ.key],
        CHAMPS_A_RENSEIGNER_AVEC_DA.has(champ.key)
          ? "À renseigner lors de votre demande de DA"
          : "Non renseigné"
      );
    });

    afficherStatutDaCompte(compteMembreActuel);
    if (pointsVisibles) {
      actualiserBadgePointsClub(compteMembreActuel);
      afficherResumePointsPassion(compteMembreActuel);
    } else {
      // Supprimer le pavé et le bouton de navigation du DOM, pas les données du Worker.
      document.getElementById("lcdp-mon-compte-points-resume")?.remove();
      document.getElementById("voir-mes-points")
        ?.closest(".lcdp-compte-actions-adresse")?.remove();
      document.getElementById("champ-points-club-membre")
        ?.closest("[data-lcdp-box-champ-formulaire]")?.remove();
    }
    actualiserActionsProtegeesDa(compteMembreActuel);
    void actualiserBlocAbonnementCompte(compteMembreActuel);
  }


// Points passion : valeur, référent et date issus exclusivement du Worker.
// Le bouton existant « Voir mes points » est déplacé DANS la carte, sans
// recréation : son ID et son écouteur de navigation restent inchangés.
function afficherResumePointsPassion(compte) {
  const champ = document.getElementById("champ-points-club-membre")
    ?.closest("[data-lcdp-box-champ-formulaire]");
  if (!champ) return;

  const pointsObjet = compte?.points || {};
  const total = compte?.pointsClub ?? compte?.pointsclub ?? pointsObjet.points ?? null;
  const totalConnu = total !== null && total !== undefined && total !== "";
  const zoneId = "lcdp-mon-compte-points-resume";
  let zone = document.getElementById(zoneId);
  const boutonPoints = document.getElementById("voir-mes-points");
  const actionsPoints = boutonPoints?.closest(".lcdp-compte-actions-adresse");

  if (!zone) {
    zone = document.createElement("div");
    zone.id = zoneId;
    zone.className = "lcdp-mon-compte-points";
    zone.setAttribute("aria-label", "Mes points passion");
    champ.insertAdjacentElement("afterend", zone);
  }
  zone.replaceChildren();
  const ligne = document.createElement("div");
  ligne.className = "lcdp-mon-compte-points__resume";
  const valeur = document.createElement("strong");
  valeur.className = "lcdp-mon-compte-points__valeur";
  if (!totalConnu) valeur.classList.add("lcdp-mon-compte-points__valeur--indisponible");
  valeur.textContent = totalConnu ? String(total) : "Non renseigné";
  ligne.appendChild(valeur);

  const statut = obtenirNiveauReferentCompte(compte);
  if (statut) {
    const etiquette = document.createElement("span");
    etiquette.className = "lcdp-mon-compte-points__badge";
    etiquette.textContent = "Référent " + capitaliserBadgePoints(statut);
    ligne.appendChild(etiquette);
  }
  zone.appendChild(ligne);

  const detail = [];
  const date = compte?.dateCalculPointsClub || compte?.datePointsClub || pointsObjet.date;
  if (date) detail.push("Total à jour le " + formaterDate(date));
  const prochain = compte?.prochainReferentPointsClub;
  const seuil = nombreOuNullCompte(prochain?.seuil);
  const prochainStatut = capitaliserBadgePoints(prochain?.statut);
  if (seuil !== null && prochainStatut) {
    detail.push("Référent " + prochainStatut + " au-dessus de " + Math.max(0, seuil - 1) + " points");
  }
  if (detail.length) {
    const precision = document.createElement("p");
    precision.className = "lcdp-mon-compte-points__detail";
    precision.textContent = detail.join(" — ");
    zone.appendChild(precision);
  }
  if (actionsPoints) zone.appendChild(actionsPoints);
  // Le champ original (avec son badge image) reste accessible au JS,
  // mais sa présentation redondante n'est plus montrée.
  champ.classList.add("lcdp-points-source-masque");
}

  function actualiserActionsProtegeesDa(compte) {
    const afficherActionsProtegees = membreAvecDaOui(compte);

    champsCompte.forEach((champ) => {
      if (!champ.action || champ.action.affichageDaOui !== true || !champ.action.id) return;

      const bouton = document.getElementById(champ.action.id);
      if (!bouton) return;

      if (afficherActionsProtegees) {
        bouton.hidden = false;
        bouton.disabled = false;
        bouton.removeAttribute("aria-hidden");
        bouton.removeAttribute("tabindex");
        return;
      }

      retirerActionProtegeeDa(bouton);
    });
  }

  function retirerActionProtegeeDa(bouton) {
    if (!bouton) return;

    const zoneControl = bouton.closest("[data-lcdp-champ-control]");
    const champ = bouton.closest("[data-lcdp-box-champ-formulaire]");

    bouton.remove();

    if (zoneControl && !zoneControl.querySelector(".lcdp-box-champ-formulaire__action-edit")) {
      zoneControl.classList.remove("lcdp-box-champ-formulaire__control--modifiable");
    }

    if (champ && !champ.querySelector(".lcdp-box-champ-formulaire__action-edit")) {
      champ.classList.remove("lcdp-box-champ-formulaire--compte-action", "lcdp-box-champ-formulaire--modifiable");
    }
  }

  function membreAvecDaOui(compte) {
    return normaliserStatudaCompte(compte?.statuda || compte?.statutDa || compte?.da || "") === "oui";
  }

  function normaliserStatudaCompte(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function ouvrirPagePointsMembre() {
    window.location.href = PAGE_POINTS_MEMBRE;
  }

  function ouvrirPageFacturesMembre() {
    window.location.href = PAGE_FACTURES_MEMBRE;
  }

  async function ouvrirDialogueAdresseFacturationMembre() {
    const champsAdresse = ["adresse1", "adresse2", "adresse3"];

    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier l'adresse de facturation",
      champs: champsAdresse.map((champ) => {
        const label = libelleChampAdresseFacturation(champ);

        return {
          id: "nouvelle-" + champ + "-membre",
          name: champ,
          label,
          type: "text",
          required: champ !== "adresse3",
          value: compteMembreActuel?.[champ] || "",
          nettoyer: nettoyerTexteSimple,
          messageRequis: label + " est obligatoire.",
          valider: (valeur) => messageValidationAdresseFacturation(champ, valeur)
        };
      })
    });

    if (!resultat) return;

    const donnees = {
      adresse1: nettoyerTexteSimple(resultat.adresse1),
      adresse2: nettoyerTexteSimple(resultat.adresse2),
      adresse3: nettoyerTexteSimple(resultat.adresse3)
    };

    const messageValidation = champsAdresse
      .map((champ) => messageValidationAdresseFacturation(champ, donnees[champ]))
      .find(Boolean);

    if (messageValidation) {
      await afficherAlerte(messageValidation);
      return;
    }

    await envoyerModificationAdresseFacturation(donnees);
  }

  function normaliserChampAdresseFacturation(champ) {
    const valeur = String(champ || "").trim().toLowerCase();
    return ["adresse1", "adresse2", "adresse3"].includes(valeur) ? valeur : "";
  }

  function libelleChampAdresseFacturation(champ) {
    if (champ === "adresse1") return "Adresse 1";
    if (champ === "adresse2") return "Adresse 2";
    if (champ === "adresse3") return "Adresse 3";

    return "Adresse";
  }

  function messageValidationAdresseFacturation(champ, valeur) {
    const label = libelleChampAdresseFacturation(champ);
    const texte = nettoyerTexteSimple(valeur);

    if (!texte) {
      return champ === "adresse3" ? "" : label + " est obligatoire.";
    }

    if (!/[0-9A-Za-zÀ-ÿ]/.test(texte)) {
      return label + " doit contenir au moins une lettre ou un chiffre.";
    }

    return "";
  }

  async function envoyerModificationAdresseFacturation(donnees) {
    if (!ENDPOINT_MON_COMPTE_MEMBRE) {
      await afficherAlerte("Le service du compte membre n’est pas configuré.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MON_COMPTE_MEMBRE + "/adresse-facturation", donnees);
      const compte = resultat?.compte || {};

      compteMembreActuel = {
        ...compteMembreActuel,
        adresse1: compte.adresse1 || "",
        adresse2: compte.adresse2 || "",
        adresse3: compte.adresse3 || ""
      };

      remplirChamp("champ-adresse1-membre", compteMembreActuel.adresse1);
      remplirChamp("champ-adresse2-membre", compteMembreActuel.adresse2);
      remplirChamp("champ-adresse3-membre", compteMembreActuel.adresse3);

      await afficherInformationMembre(messageErreurApi(resultat, "Votre adresse de facturation est mise à jour."));
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function ouvrirDialogueCoordonneeRemboursementMembre(champ, label) {
    const champAutorise = normaliserChampRemboursement(champ);

    if (!champAutorise) {
      await afficherAlerte("Champ de remboursement non autorisé.");
      return;
    }

    const resultat = await ouvrirDialogueChamp({
      titre: champAutorise === "rib" ? "Modifier le nom du titulaire" : "Modifier " + label,
      champs: [
        {
          id: "nouvelle-coordonnee-remboursement-membre",
          name: "valeur",
          label,
          type: "text",
          required: true,
          value: compteMembreActuel?.[champAutorise] || "",
          nettoyer: (valeur) => normaliserValeurCoordonneeRemboursement(champAutorise, valeur),
          messageRequis: champAutorise === "rib"
            ? "Le nom du titulaire est obligatoire."
            : label + " est obligatoire.",
          valider: (valeur) => messageValidationCoordonneeRemboursement(champAutorise, valeur)
        }
      ]
    });

    if (!resultat) return;

    const valeur = normaliserValeurCoordonneeRemboursement(champAutorise, resultat.valeur);
    const messageValidation = messageValidationCoordonneeRemboursement(champAutorise, valeur);

    if (messageValidation) {
      await afficherAlerte(messageValidation);
      return;
    }

    await envoyerModificationCoordonneeRemboursement(champAutorise, valeur);
  }

  async function envoyerModificationCoordonneeRemboursement(champ, valeur) {
    if (!ENDPOINT_MON_COMPTE_MEMBRE) {
      await afficherAlerte("Le service du compte membre n’est pas configuré.");
      return;
    }

    const champAutorise = normaliserChampRemboursement(champ);

    if (!champAutorise) {
      await afficherAlerte("Champ de remboursement non autorisé.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MON_COMPTE_MEMBRE + "/coordonnees-remboursement", {
        champ: champAutorise,
        valeur
      });
      const compte = resultat?.compte || {};
      const nouvelleValeur = compte[champAutorise] || "";

      compteMembreActuel = {
        ...compteMembreActuel,
        [champAutorise]: nouvelleValeur
      };

      remplirChamp("champ-" + champAutorise + "-membre", nouvelleValeur);

      await afficherInformationMembre("Vos coordonnées de remboursement sont mises à jour.");
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function normaliserValeurCoordonneeRemboursement(champ, valeur) {
    const texte = nettoyerTexteSimple(valeur);

    if (["iban", "swift"].includes(champ)) {
      return texte.toUpperCase().replace(/\s+/g, "");
    }

    return texte;
  }

  function messageValidationCoordonneeRemboursement(champ, valeur) {
    const champAutorise = normaliserChampRemboursement(champ);
    const texte = normaliserValeurCoordonneeRemboursement(champAutorise, valeur);

    if (!texte) {
      return libelleChampRemboursement(champAutorise) + " est obligatoire.";
    }

    if (champAutorise === "iban") {
      if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(texte) || texte.length < 15 || texte.length > 34) {
        return "L’IBAN saisi doit être un IBAN valide.";
      }

      if (!ibanValideMod97(texte)) {
        return "L’IBAN saisi est invalide.";
      }
    }

    if (champAutorise === "swift" && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(texte)) {
      return "Le SWIFT/BIC saisi doit contenir 8 ou 11 caractères au format bancaire attendu.";
    }

    return "";
  }

  function libelleChampRemboursement(champ) {
    if (champ === "iban") return "IBAN";
    if (champ === "swift") return "SWIFT";
    if (champ === "rib") return "Le nom du titulaire";

    return "Coordonnée de remboursement";
  }

  function ibanValideMod97(iban) {
    const valeur = String(iban || "").toUpperCase();
    const rearrange = valeur.slice(4) + valeur.slice(0, 4);
    let reste = 0;

    for (const caractere of rearrange) {
      const bloc = /[0-9]/.test(caractere)
        ? caractere
        : String(caractere.charCodeAt(0) - 55);

      if (!/^[0-9]+$/.test(bloc)) return false;

      for (const chiffre of bloc) {
        reste = (reste * 10 + Number(chiffre)) % 97;
      }
    }

    return reste === 1;
  }

  function normaliserChampRemboursement(champ) {
    const valeur = String(champ || "").trim().toLowerCase();
    return ["iban", "swift", "rib"].includes(valeur) ? valeur : "";
  }

  let demandeGeoEnCours=false;
  async function demanderMiseAJourGeolocalisation(){
    if(demandeGeoEnCours)return;
    demandeGeoEnCours=true;
    try{
      const confirmer=await afficherChoixMesInformations(
        "Cette opération vous déconnectera.",
        {titre:"Mettre à jour votre autorisation de géolocalisation ?",libelleAnnuler:"Annuler",libelleConfirmer:"Modifier"}
      );
      if(confirmer){
        const cfg=window.SITE_CONFIG||{};
        const endpoint=String(cfg.workerDeconnexionMembreUrl||cfg.WORKER_DECONNEXION_MEMBRE_URL||cfg.W_DECONNEXION_URL||(typeof cfg.apiUrl==="function"?cfg.apiUrl("deconnexion-membre-api"):"https://deconnexion-membre-api.lacleduparc.fr")).replace(/\/+$/,"");
        const reponse=await fetch(endpoint+"/deconnexion",{method:"POST",credentials:"include",cache:"no-store"});
        const resultat=await reponse.json().catch(()=>null);
        if(!reponse.ok||resultat?.success!==true)throw new Error(resultat?.message||"La déconnexion n’a pas été confirmée. Réessayez.");
        location.assign(construireUrlPublic("/ESPACE-PUBLIC/preparer-acces-parc.html?mode=actualisation"));
      }
    }catch(e){await afficherAlerte(e.message||"La mise à jour est indisponible.");}
    finally{demandeGeoEnCours=false;}
  }

  let demandeMajoriteEnCours=false;
  async function demanderModificationMajorite() {
    if (demandeMajoriteEnCours) return;
    demandeMajoriteEnCours=true;
    try {
      const confirmer=await afficherChoixMesInformations(
        "Souhaitez-vous transmettre une demande de modification de votre majorité à l’administrateur de l’application ?",
        {titre:"Modifier votre majorité",libelleAnnuler:"Annuler",libelleConfirmer:"OK"}
      );
      if (!confirmer) return;
      const reponse=await fetch(ENDPOINT_MON_COMPTE_MEMBRE+"/majorite-admin-request",{
        method:"POST",credentials:"include",cache:"no-store",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({})
      });
      const resultat=await reponse.json().catch(()=>null);
      await afficherResultatSecurite(resultat?.message ||
        "La demande de modification de majorité n’a pas pu être confirmée.");
    } catch {
      await afficherAlerte("La demande de modification de majorité n’a pas pu être confirmée.");
    } finally { demandeMajoriteEnCours=false; }
  }

  let demandeCodrEnCours=false;
  async function demanderModificationCodr() {
    if (demandeCodrEnCours) return;
    demandeCodrEnCours=true;
    try {
      const confirmer=await afficherChoixMesInformations(
        "Souhaitez-vous transmettre une demande de modification de votre CODR à l’administrateur de l’application ?",
        {titre:"Modifier votre CODR",libelleAnnuler:"Annuler",libelleConfirmer:"Transmettre"}
      );
      if (!confirmer) return;
      const reponse=await fetch(ENDPOINT_MON_COMPTE_MEMBRE+"/codr-admin-request",{
        method:"POST",credentials:"include",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({})
      });
      const resultat=await reponse.json().catch(()=>null);
      await afficherResultatSecurite(resultat?.message||"La transmission n’a pas pu être confirmée. Vous pouvez réessayer dans une minute.");
    } catch { await afficherAlerte("La transmission n’a pas pu être confirmée. Vous pouvez réessayer dans une minute."); }
    finally {demandeCodrEnCours=false;}
  }

  async function afficherResultatSecurite(message) {
    const conteneur=document.createElement("div");
    const avant=document.activeElement;
    document.body.appendChild(conteneur);
    try {
      conteneur.appendChild(await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-information.html"));
      const dialogue=conteneur.querySelector('[data-lcdp-dialogue-reference="information"]');
      const titre=conteneur.querySelector("[data-lcdp-dialogue-titre]");
      const texte=conteneur.querySelector("[data-lcdp-dialogue-message]");
      const bouton=conteneur.querySelector('[data-lcdp-dialogue-action="compris"]');
      if(!dialogue||!titre||!texte||!bouton)throw new Error("Dialogue INFORMATION sécurité incomplet.");
      titre.textContent="Sécurité du compte";
      texte.textContent=message;
      bouton.textContent="OK";
      await new Promise(resolve=>{
        let termine=false;
        function fermer(){
          if(termine)return;
          termine=true;
          document.removeEventListener("keydown",clavier);
          conteneur.remove();
          if(avant?.isConnected&&typeof avant.focus==="function")avant.focus();
          resolve();
        }
        function clavier(event){if(event.key==="Escape"){event.preventDefault();fermer();}}
        bouton.addEventListener("click",fermer,{once:true});
        dialogue.addEventListener("click",event=>{if(event.target===dialogue)fermer();});
        document.addEventListener("keydown",clavier);
        bouton.focus();
      });
    } catch(erreur) {
      conteneur.remove();
      await afficherAlerteSuperposee(message, { profil: "information" });
    }
  }

  let verificationCodaEnCours = false;
  async function ouvrirModificationCoda() {
    if (verificationCodaEnCours) return;
    verificationCodaEnCours = true;
    try {
      const reponse = await fetch(ENDPOINT_MON_COMPTE_MEMBRE + "/security-status", {credentials:"include",cache:"no-store"});
      const statut = await reponse.json().catch(() => null);
      if (reponse.status === 401) { redirigerConnexionMembre("inactive"); return; }
      if (!reponse.ok || !statut?.ok) { await afficherAlerte(statut?.message || "Le service de sécurité est indisponible."); return; }
      if (statut.desactive) { await afficherAlerte("Le CODR est désactivé. Contactez l’administrateur."); return; }
      const premier=await ouvrirDialogueChamp({
        titre:"Mettre à jour mon CODA", variante:"modification-coda", libelleValider:"Suivant",
        consignes:["Étape 1 sur 2","Saisissez votre nouveau CODA.","Puis vous validerez avec votre CODR.","Saisir mon CODA"],
        champs:[{id:"nouveau-coda-membre",name:"coda",label:"Saisir mon CODA",type:"coda",required:true,
          libelleAfficher:"Afficher mon CODA",valider:validerNouveauCodaDirect}]
      });
      if(!premier)return;
      await ouvrirDialogueChamp({
        titre:"Mettre à jour mon CODA", variante:"modification-coda", libelleValider:"Confirmer",
        consignes:["Étape 2 sur 2","Confirmez avec votre CODR.","Attention : deux essais maximum pour le CODR. Après deux erreurs, le CODR est désactivé."],
        champs:[{id:"codr-modification-membre",name:"codr",label:"Confirmer avec mon CODR",type:"codr",required:true,
          libelleAfficher:"Afficher mon CODR",
          valider:v=>/^[A-Z]{4}(-[A-Z]{4}){3}$/.test(v)?"":"Saisissez les quatre mots de quatre lettres du CODR."}],
        onSubmit:async donnees=>{
          const mots=donnees.codr.split("-");
          let message="La modification n’a pas pu être confirmée.";
          let succes=false, nouvelleTentative=false;
          try {
            const r=await fetch(ENDPOINT_MON_COMPTE_MEMBRE + "/coda-change",{
              method:"POST",credentials:"include",cache:"no-store",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({coda:premier.coda,mots})
            });
            const d=await r.json().catch(()=>null);
            message=d?.message || message;
            succes=r.ok && d?.success===true;
            nouvelleTentative=!succes && r.status!==429 && d?.reason==="codr_incorrect" && d?.desactive!==true && d?.attemptsRemaining!==0;
            if(!d) message="Réponse non confirmée. Vérifiez l’état du compte avant de réessayer.";
          } catch { message="Réponse non confirmée. Vérifiez l’état du compte avant de réessayer."; }
          await afficherAlerteSuperposee(message, { profil: succes ? "information" : "erreur" });
          if(nouvelleTentative){
            const cache=document.getElementById("codr-modification-membre");
            const groupe=cache?.parentNode;
            if(cache) cache.value="";
            groupe?.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])').forEach(champ=>{champ.value="";});
            groupe?.querySelector('input:not([type="hidden"]):not([type="checkbox"])')?.focus();
            return false;
          }
          if(succes) redirigerConnexionMembre("coda_modifie");
          return true;
        }
      });
    } catch { await afficherAlerte("Le service de sécurité est momentanément indisponible."); }
    finally { verificationCodaEnCours=false; }
  }

  function validerNouveauCodaDirect(code) {
    if (!/^[0-9]{4}$/.test(code)) return "Saisissez les quatre chiffres du CODA.";
    if ([...code].some(c => code.split(c).length-1>2)) return "Un même chiffre apparaît au maximum deux fois.";
    if (code.slice(0,2)===code.slice(2,4)) return "La même paire de chiffres ne peut pas être répétée.";
    if ([0,1,2].some(i=>Math.abs(Number(code[i])-Number(code[i+1]))===1)) return "Deux chiffres côte à côte ne doivent pas se suivre.";
    return "";
  }async function ouvrirDialogueAliasMembre() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier l'alias",
      variante: "alias",
      champs: [
        {
          id: "nouvel-alias-membre",
          name: "alias",
          label: "Alias",
          type: "text",
          required: false,
          value: compteMembreActuel?.alias || ""
        }
      ]
    });

    if (!resultat) return;

    await envoyerModificationAlias({
      alias: nettoyerTexteSimple(resultat.alias)
    });
  }

  async function envoyerModificationAlias(donnees) {
    if (!ENDPOINT_MON_COMPTE_MEMBRE) {
      await afficherAlerte("Le service du compte membre n’est pas configuré.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MON_COMPTE_MEMBRE + "/alias", donnees);
      const compte = resultat?.compte || {};

      compteMembreActuel = {
        ...compteMembreActuel,
        alias: compte.alias || ""
      };

      remplirChamp("champ-alias-membre", formaterAliasAffichage(compteMembreActuel.alias));

      await afficherInformationMembre(messageErreurApi(resultat, "Votre alias est mis à jour."), "Alias mis à jour");
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function ouvrirDialogueEmailMembre() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier mon e-mail",
      champs: [
        {
          id: "nouvel-email-membre",
          name: "emailmembre",
          label: "Nouveau mail",
          type: "email",
          autocomplete: "email",
          required: true
        },
        {
          id: "unikuser-nouvel-email-membre",
          name: "unikuser",
          label: "Utilisateur unique de l'adresse e-mail",
          type: "checkbox",
          checkboxLabel: "Je confirme être l'unique utilisateur de l'adresse e-mail.",
          required: true
        }
      ]
    });

    if (!resultat) return;

    const nouveauMail = nettoyerEmail(resultat.emailmembre);

    if (!emailValide(nouveauMail)) {
      await afficherAlerte("L’adresse e-mail saisie est invalide.");
      return;
    }

    if (nouveauMail === emailMembreActuel) {
      await afficherAlerte("Ce mail est déjà celui de votre compte.");
      return;
    }

    if (valeurBooleenneVraie(resultat.unikuser) !== true) {
      await afficherAlerte("Vous devez confirmer être l'unique utilisateur.");
      return;
    }

    await envoyerDemandeModificationEmail(nouveauMail, true);
  }

  async function envoyerDemandeModificationEmail(nouveauMail, unikuser) {
    if (!ENDPOINT_MAJ_EMAIL_MEMBRE) {
      await afficherAlerte("Le service de modification d’e-mail n’est pas configuré.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MAJ_EMAIL_MEMBRE, {
        emailmembre: nouveauMail,
        unikuser: unikuser === true
      });

      const messageWorker = String(resultat?.message || "").trim();

      if (!messageWorker) {
        throw new Error("Aucun message reçu du worker. Ni OK ni KO = KO.");
      }

      await afficherInformationMembre(messageWorker, "Modification de l’e-mail");
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function ouvrirDialogueParrainMembre() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier mon parrain",
      champs: [
        {
          id: "nouvel-email-parrain",
          name: "emailparrain",
          label: "Email du parrain",
          type: "email",
          autocomplete: "email",
          required: false
        }
      ]
    });

    if (!resultat) return;

    const emailparrain = nettoyerEmail(resultat.emailparrain);

    if (emailparrain && !emailValide(emailparrain)) {
      await afficherAlerte("L’adresse e-mail du parrain est invalide.");
      return;
    }

    await envoyerModificationParrain(emailparrain);
  }

  async function envoyerModificationParrain(emailparrain) {
    if (!ENDPOINT_MAJ_PARRAIN_MEMBRE) {
      await afficherAlerte("Le service de modification du parrain n’est pas configuré.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MAJ_PARRAIN_MEMBRE, {
        emailparrain
      });

      compteMembreActuel = {
        ...compteMembreActuel,
        parrain: emailparrain || ""
      };

      remplirChamp("champ-parrain-membre", formaterParrainAffichage(compteMembreActuel.parrain));
      await afficherInformationMembre(messageErreurApi(resultat, "Votre changement de parrain est enregistré."));
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function chargerDiginumCompte() {
    if (typeof window.LCDP_diginum?.ouvrir === "function") return window.LCDP_diginum;
    if (!promesseChargementDiginumCompte) {
      promesseChargementDiginumCompte = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = construireUrlObjet("/JSBASE/07-diginum.js?v=20261113-departement-transition-v2");
        script.onload = () => {
          if (typeof window.LCDP_diginum?.ouvrir === "function") resolve(window.LCDP_diginum);
          else reject(new Error("Le pavé Diginum n'est pas disponible."));
        };
        script.onerror = () => reject(new Error("Impossible de charger le pavé Diginum."));
        document.body.appendChild(script);
      }).catch(error => {
        promesseChargementDiginumCompte = null;
        throw error;
      });
    }
    return promesseChargementDiginumCompte;
  }

  // Même circuit de modification simple que le département, sans CODA/CODR.
  async function ouvrirDialogueTelephoneMembre() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier le numéro de téléphone",
      variante: "telephone",
      champs: [{
        id: "nouveau-telephone-membre",
        name: "tel",
        label: "Nouveau numéro de téléphone",
        type: "tel",
        autocomplete: "tel-national",
        placeholder: "Dix chiffres avec ou sans espaces",
        maxlength: 20,
        required: true,
        value: compteMembreActuel?.tel || compteMembreActuel?.telephone || "",
        nettoyer: valeur => String(valeur || "").replace(/[\s.-]+/g, ""),
        valider: valeur => /^\d{10}$/.test(valeur)
          ? ""
          : "Votre numéro de téléphone doit contenir 10 chiffres."
      }]
    });
    if (!resultat) return;
    if (resultat.tel === String(compteMembreActuel?.tel || compteMembreActuel?.telephone || "")) return;

    if (!ENDPOINT_MAJ_DEPARTEMENT_MEMBRE) {
      await afficherAlerte("Le service de modification du téléphone n’est pas configuré.");
      return;
    }
    try {
      const reponse = await posterJson(
        ENDPOINT_MAJ_DEPARTEMENT_MEMBRE + "/telephone",
        { tel: resultat.tel }
      );
      const tel = String(reponse.tel || resultat.tel);
      compteMembreActuel = { ...compteMembreActuel, tel };
      remplirChamp("champ-telephone-membre", tel);
      await afficherInformationMembre(
        messageErreurApi(reponse, "Votre numéro de téléphone est mis à jour.")
      );
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "La modification du numéro de téléphone a échoué.");
    }
  }

  async function ouvrirDialogueDepartementMembre() {
    let dptmtmembre;
    let confirmation = null;
    try {
      const diginum = await chargerDiginumCompte();
      dptmtmembre = await diginum.ouvrir({
        titre: "Changer de département",
        placeholder: "exemple 08",
        longueurMax: 3,
        codesSpeciaux: ["2A", "2B"],
        autoValider: code => (code.length === 2 && code !== "97") || code.length === 3,
        bloquerFermeturePendantVerification: true,
        verifier: async code => {
          if (!NOMS_DEPARTEMENTS_COMPTE[code]) {
            return "Ce code ne correspond à aucun département.";
          }
          try {
            // Préparer la boîte INFORMATION avant l'envoi : aucun écran intermédiaire
            // après fermeture du Diginum, et aucune sauvegarde si la boîte est absente.
            const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-information.html");
            if (!fragment.querySelector('[data-lcdp-dialogue-reference="information"]')) {
              throw new Error("La confirmation du département est indisponible.");
            }
            const resultat = await envoyerModificationDepartement(code);
            confirmation = { resultat, fragment };
            return null;
          } catch (error) {
            if (error.redirection === true) return "Session membre inactive.";
            return error.message || "Erreur technique. Merci de réessayer.";
          }
        }
      });
    } catch (error) {
      await afficherAlerte(error.message || "Le pavé Diginum est indisponible.");
      return;
    }

    if (!dptmtmembre || !confirmation) return;

    // Le dialogue est déjà en mémoire : il apparaît dès la fermeture du Diginum.
    // La fiche Mon compte ne s'actualise qu'après acquittement de l'information.
    try {
      await afficherInformationMembre(
        messageErreurApi(confirmation.resultat, "Votre changement de département est enregistré."),
        "Information",
        confirmation.fragment
      );
    } catch (error) {
      await afficherAlerte("Le changement de département est enregistré, mais sa confirmation ne peut pas être affichée.");
    } finally {
      compteMembreActuel = {
        ...compteMembreActuel,
        departement: dptmtmembre
      };
      remplirChamp("champ-departement-membre", formaterDepartementAffichage(compteMembreActuel.departement));
    }
  }

  async function envoyerModificationDepartement(dptmtmembre) {
    if (!ENDPOINT_MAJ_DEPARTEMENT_MEMBRE) {
      throw new Error("Le service de modification du département n’est pas configuré.");
    }
    return posterJson(ENDPOINT_MAJ_DEPARTEMENT_MEMBRE, { dptmtmembre });
  }

  async function posterJson(endpoint, payload) {
    const reponse = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      const erreur = new Error("Session membre inactive.");
      erreur.redirection = true;
      throw erreur;
    }

    if (!reponse.ok || !resultat || resultat.ok !== true) {
      throw new Error(messageErreurApi(resultat, "Erreur technique. Merci de réessayer."));
    }

    return resultat;
  }

  async function ouvrirDialogueChamp(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/HTMLBASE/04-dialogue-champ.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-champ]");
    const titre = slot.querySelector("[data-lcdp-dialogue-champ-title]");
    const formulaire = slot.querySelector("[data-lcdp-dialogue-champ-form]");
    const zoneContent = slot.querySelector("[data-lcdp-dialogue-champ-content]");
    const erreur = slot.querySelector("[data-lcdp-dialogue-champ-error]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-champ-close]");
    const boutonAnnuler = slot.querySelector("[data-lcdp-dialogue-champ-cancel]");

    if (!dialogue || !titre || !formulaire || !zoneContent || !erreur || !boutonFermer || !boutonAnnuler) {
      throw new Error("Structure de dialogue champ incomplète.");
    }

    titre.textContent = options.titre || "";
    if (options.variante === "alias") dialogue.classList.add("lcdp-compte-dialogue-alias");
    if (options.variante === "telephone") dialogue.classList.add("lcdp-compte-dialogue-telephone");
    if (options.variante === "modification-coda") {
      dialogue.setAttribute("data-lcdp-modification-coda","");
      boutonFermer.hidden=true;
    }
    const boutonValider = slot.querySelector("[data-lcdp-dialogue-champ-submit]");
    if (options.libelleValider && boutonValider) boutonValider.textContent = options.libelleValider;
    if (options.message) {
      const note=document.createElement("p");
      note.className="lcdp-box-formulaire__note";
      note.textContent=options.message;
      zoneContent.appendChild(note);
    }

    for (const consigne of options.consignes || []) {
      const texte=document.createElement("p");
      texte.className="lcdp-box-dialogue-champ__label";
      texte.textContent=consigne;
      zoneContent.appendChild(texte);
    }
    for (const champ of options.champs || []) {
      zoneContent.appendChild(await creerChampDialogue(champ));
    }

    if (options.noteFin) {
      const note=document.createElement("p");
      note.className="lcdp-box-formulaire__note";
      note.textContent=options.noteFin;
      zoneContent.appendChild(note);
    }

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", () => fermer(null));
      boutonAnnuler.addEventListener("click", () => fermer(null));

      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue && !soumissionEnCours) fermer(null);
      });

      let soumissionEnCours = false;
      formulaire.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (soumissionEnCours) return;

        erreur.hidden = true;
        erreur.textContent = "";

        const data = {};
        let champRequisManquant = false;
        let checkboxRequiseManquante = false;
        let messageValidation = "";

        (options.champs || []).forEach((champ) => {
          const input = formulaire.querySelector(`[name="${champ.name}"]`);
          const estCheckbox = input && input.type === "checkbox";
          let valeur = input
            ? estCheckbox
              ? input.checked
              : String(input.value || "")
            : "";

          if (!estCheckbox) {
            valeur = typeof champ.nettoyer === "function"
              ? champ.nettoyer(valeur)
              : String(valeur || "").trim();

            if (input) {
              input.value = valeur;
            }
          }

          if (champ.required && estCheckbox && input.checked !== true) {
            checkboxRequiseManquante = true;
          } else if (champ.required && !estCheckbox && !valeur) {
            champRequisManquant = true;
            if (!messageValidation) {
              messageValidation = champ.messageRequis || "Merci de renseigner le champ demandé.";
            }
          }

          if (!messageValidation && !estCheckbox && valeur && typeof champ.valider === "function") {
            messageValidation = champ.valider(valeur) || "";
          }

          data[champ.name] = valeur;
        });

        if (checkboxRequiseManquante) {
          await afficherAlerteSuperposee("Vous devez confirmer être l'unique utilisateur.");
          return;
        }

        if (champRequisManquant || messageValidation) {
          await afficherAlerteSuperposee(messageValidation || "Merci de renseigner le champ demandé.");
          return;
        }

        if (typeof options.onSubmit === "function") {
          soumissionEnCours=true;
          if (boutonValider) boutonValider.disabled=true;
          boutonAnnuler.disabled=true;
          boutonFermer.disabled=true;
          try {
            if (!await options.onSubmit(data)) return;
          } catch {
            await afficherAlerteSuperposee("La réponse n’a pas pu être confirmée. Fermez ce dialogue puis vérifiez l’état avant de réessayer.");
            fermer(null);
            return;
          } finally {
            soumissionEnCours=false;
            if (boutonValider) boutonValider.disabled=false;
            boutonAnnuler.disabled=false;
            boutonFermer.disabled=false;
          }
        }
        fermer(data);
      });

      const premierInput = formulaire.querySelector("input:not([type=hidden]), textarea, select");
      if (premierInput) premierInput.focus();
    });
  }

  async function creerChampDialogue(configurationChamp) {
    const fragment = await chargerFragmentObjet("/HTMLBASE/03-champ-formulaire.html");

    const champ = fragment.querySelector("[data-lcdp-box-champ-formulaire]");
    const zoneLabel = fragment.querySelector("[data-lcdp-champ-label-zone]");
    const zoneDescription = fragment.querySelector("[data-lcdp-champ-description]");
    const zoneControl = fragment.querySelector("[data-lcdp-champ-control]");

    if (!champ || !zoneLabel || !zoneDescription || !zoneControl) {
      throw new Error("Structure champ formulaire incomplète.");
    }

    if (["coda","codr"].includes(configurationChamp.type)) {
      const estCoda=configurationChamp.type==="coda";
      const label=document.createElement("p");
      label.className="lcdp-box-champ-formulaire__label";
      label.textContent=configurationChamp.label;
      zoneLabel.appendChild(label);
      const valeur=document.createElement("input");
      valeur.type="hidden"; valeur.name=configurationChamp.name; valeur.id=configurationChamp.id;
      const groupe=document.createElement("div");
      groupe.className="lcdp-box-champ-formulaire__code-cases";
      const elements=[];
      for(let i=0;i<4;i++) {
        const champ=document.createElement("input");
        champ.type="password";
        champ.inputMode=estCoda?"numeric":"text";
        champ.maxLength=estCoda?1:4;
        champ.autocomplete="off";
        champ.autocapitalize=estCoda?"off":"characters";
        champ.spellcheck=false;
        champ.setAttribute("aria-label",(estCoda?"Chiffre ":"Mot ")+(i+1)+" sur 4");
        champ.addEventListener("input",()=>{
          champ.value=estCoda?champ.value.replace(/[^0-9]/g,"").slice(0,1):champ.value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,4);
          valeur.value=elements.map(c=>c.value).join(estCoda?"":"-");
          if(champ.value.length===champ.maxLength && i<3) elements[i+1].focus();
        });
        champ.addEventListener("keydown",e=>{if(e.key==="Backspace"&&!champ.value&&i>0)elements[i-1].focus();});
        elements.push(champ);groupe.appendChild(champ);
      }
      const montrer=document.createElement("label");
      montrer.className="lcdp-box-champ-formulaire__checkbox-line";
      const afficher=document.createElement("input");afficher.type="checkbox";
      const texte=document.createElement("span");texte.textContent=configurationChamp.libelleAfficher || "Afficher la saisie";
      afficher.addEventListener("change",()=>elements.forEach(c=>{c.type=afficher.checked?"text":"password";}));
      montrer.append(afficher,texte);
      zoneControl.append(valeur,groupe,montrer);
      return champ;
    }

    if (configurationChamp.type === "checkbox") {
      const labelCheckbox = document.createElement("label");
      labelCheckbox.className = "lcdp-box-champ-formulaire__checkbox-line";
      labelCheckbox.setAttribute("for", configurationChamp.id);

      const inputCheckbox = document.createElement("input");
      inputCheckbox.id = configurationChamp.id;
      inputCheckbox.name = configurationChamp.name;
      inputCheckbox.type = "checkbox";
      inputCheckbox.required = configurationChamp.required === true;

      const texteCheckbox = document.createElement("span");
      texteCheckbox.textContent = configurationChamp.checkboxLabel || configurationChamp.label || "";

      labelCheckbox.appendChild(inputCheckbox);
      labelCheckbox.appendChild(texteCheckbox);
      zoneControl.appendChild(labelCheckbox);

      return champ;
    }

    const label = document.createElement("label");
    label.className = "lcdp-box-champ-formulaire__label";
    label.setAttribute("for", configurationChamp.id);
    label.textContent = configurationChamp.label || "";

    const input = document.createElement("input");
    input.id = configurationChamp.id;
    input.name = configurationChamp.name;
    input.type = configurationChamp.type || "text";
    input.required = configurationChamp.required === true;
    input.value = configurationChamp.value || "";
    if (configurationChamp.placeholder) input.placeholder = configurationChamp.placeholder;
    if (configurationChamp.autocapitalize) input.setAttribute("autocapitalize",configurationChamp.autocapitalize);
    if (configurationChamp.maxlength) input.maxLength=configurationChamp.maxlength;

    if (configurationChamp.autocomplete) {
      input.autocomplete = configurationChamp.autocomplete;
    }

    zoneLabel.appendChild(label);
    zoneControl.appendChild(input);

    return champ;
  }

  async function afficherInformationMembre(message, titre = "Information", fragmentPrepare = null) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return null;
    const fragment = fragmentPrepare || await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-information.html");
    slot.replaceChildren(fragment);
    const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="information"]');
    const titreElement = slot.querySelector('[data-lcdp-dialogue-titre]');
    const texte = slot.querySelector('[data-lcdp-dialogue-message]');
    const bouton = slot.querySelector('[data-lcdp-dialogue-action="compris"]');
    if (!dialogue || !titreElement || !texte || !bouton) {
      slot.replaceChildren();
      throw new Error("Structure du dialogue INFORMATION incomplète.");
    }
    titreElement.textContent = titre;
    texte.textContent = String(message || "");
    bouton.textContent = "Fermer";
    return new Promise(resolve => {
      let resolu = false;
      const fermer = () => {
        if (resolu) return;
        resolu = true;
        slot.replaceChildren();
        resolve(true);
      };
      bouton.addEventListener("click", fermer, { once: true });
      bouton.focus();
    });
  }

  async function afficherAlerteSuperposee(message, options = {}) {
    const information = options.profil === "information";
    const conteneur = document.createElement("div");
    const focusInitial = document.activeElement;

    try {
      const fragment = await chargerFragmentObjet(information
        ? "/HTMLBASE/02-dialogue-reference-information.html"
        : "/HTMLBASE/02-dialogue-reference-erreur.html");
      conteneur.appendChild(fragment);
      const dialogue = conteneur.querySelector(information
        ? '[data-lcdp-dialogue-reference="information"]'
        : '[data-lcdp-dialogue-reference="erreur"]');
      const titre = conteneur.querySelector("[data-lcdp-dialogue-titre]");
      const texte = conteneur.querySelector("[data-lcdp-dialogue-message]");
      const bouton = conteneur.querySelector(information
        ? '[data-lcdp-dialogue-action="compris"]'
        : '[data-lcdp-dialogue-action="fermer"]');

      if (!dialogue || !titre || !texte || !bouton) {
        throw new Error("Structure du dialogue superposé incomplète.");
      }
      titre.textContent = information ? "Information" : "Erreur";
      texte.textContent = message || "";
      bouton.textContent = "Fermer";
      document.body.appendChild(conteneur);

      await new Promise(resolve => {
        let resolu = false;
        function fermer() {
          if (resolu) return;
          resolu = true;
          document.removeEventListener("keydown", gererClavier);
          conteneur.remove();
          if (focusInitial?.isConnected && typeof focusInitial.focus === "function") {
            focusInitial.focus();
          }
          resolve();
        }
        function gererClavier(event) {
          if (event.key === "Escape") {
            event.preventDefault();
            fermer();
          }
        }
        bouton.addEventListener("click", fermer, { once: true });
        dialogue.addEventListener("click", event => {
          if (event.target === dialogue) fermer();
        });
        document.addEventListener("keydown", gererClavier);
        bouton.focus();
      });
    } catch (error) {
      console.error("Erreur dialogue superposé :", error);
      conteneur.remove();
      alert(message || "");
    }
  }

  async function afficherChoixMesInformations(message, options = {}) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return false;
    slot.replaceChildren();
    try {
      slot.appendChild(await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-choix.html"));
      const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="choix"]');
      const titre = slot.querySelector("[data-lcdp-dialogue-titre]");
      const texte = slot.querySelector("[data-lcdp-dialogue-message]");
      const annuler = slot.querySelector('[data-lcdp-dialogue-action="annuler"]');
      const confirmer = slot.querySelector('[data-lcdp-dialogue-action="confirmer"]');
      if (!dialogue || !titre || !texte || !annuler || !confirmer) throw new Error("Structure CHOIX incomplète.");
      titre.textContent = options.titre || "Confirmation";
      texte.textContent = String(message || "");
      annuler.textContent = options.libelleAnnuler || "Annuler";
      confirmer.textContent = options.libelleConfirmer || "Confirmer";
      return await new Promise(resolve => {
        let termine = false;
        const fermer = valeur => {
          if (termine) return;
          termine = true;
          slot.replaceChildren();
          resolve(valeur);
        };
        annuler.addEventListener("click", () => fermer(false), { once: true });
        confirmer.addEventListener("click", () => fermer(true), { once: true });
        dialogue.addEventListener("click", event => {
          if (event.target === dialogue) fermer(false);
        });
        confirmer.focus();
      });
    } catch (erreur) {
      slot.replaceChildren();
      throw erreur;
    }
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return null;

    slot.replaceChildren();
    const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-erreur.html");
    slot.appendChild(fragment);
    const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="erreur"]');
    const titre = slot.querySelector("[data-lcdp-dialogue-titre]");
    const texte = slot.querySelector("[data-lcdp-dialogue-message]");
    const bouton = slot.querySelector('[data-lcdp-dialogue-action="fermer"]');

    if (!dialogue || !titre || !texte || !bouton) {
      slot.replaceChildren();
      throw new Error("Structure du dialogue ERREUR incomplète.");
    }
    titre.textContent = "Erreur";
    texte.textContent = message || "";
    bouton.textContent = "Fermer";
    const focusInitial = document.activeElement;

    return new Promise(resolve => {
      let resolu = false;
      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererClavier);
        slot.replaceChildren();
        if (focusInitial?.isConnected && typeof focusInitial.focus === "function") {
          focusInitial.focus();
        }
        resolve(valeur);
      }
      function gererClavier(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          fermer(false);
        }
      }
      bouton.addEventListener("click", () => fermer(true), { once: true });
      dialogue.addEventListener("click", event => {
        if (event.target === dialogue) fermer(false);
      });
      document.addEventListener("keydown", gererClavier);
      bouton.focus();
    });
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    if (!slot) return;

    slot.innerHTML = "";

    const bandeau = await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html");
    slot.appendChild(bandeau);
    appliquerRoutesSite(slot);

    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js?v=20261120-presentation-abonnements");

    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre();
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");
    if (!slot) return;

    slot.innerHTML = "";

    const footer = await chargerFragmentObjet("/HTMLBASE/02-footer.html");
    slot.appendChild(footer);
    appliquerRoutesSite(slot);
  }

  function appliquerRoutesSite(racine = document) {
    racine.querySelectorAll("[data-site-href]").forEach((element) => {
      const chemin = element.dataset.siteHref || "";
      const espace = element.dataset.space || "public";

      element.setAttribute(
        "href",
        espace === "membre" ? construireUrlMembre(chemin) : construireUrlPublic(chemin)
      );
    });

    racine.querySelectorAll("[data-site-src]").forEach((element) => {
      const chemin = element.dataset.siteSrc || "";
      const cheminObjet = chemin.replace(/^\/?OBJET\/?/, "/");
      element.setAttribute("src", construireUrlObjet(cheminObjet));
    });
  }

  async function chargerFragmentObjet(chemin) {
    const reponse = await fetch(construireUrlObjet(chemin), {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });

    if (!reponse.ok) {
      throw new Error("Fragment OBJET introuvable : " + chemin);
    }

    const html = await reponse.text();
    const template = document.createElement("template");
    template.innerHTML = html.trim();

    return template.content.cloneNode(true);
  }

  async function chargerFragmentMembre(chemin) {
    const reponse = await fetch(construireUrlMembre(chemin), {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });

    if (!reponse.ok) {
      throw new Error("Fragment membre introuvable : " + chemin);
    }

    const html = await reponse.text();
    const template = document.createElement("template");
    template.innerHTML = html.trim();

    return template.content.cloneNode(true);
  }

  function chargerScriptMembreUneFois(chemin) {
    const src = construireUrlMembre(chemin);

    if (document.querySelector(`script[data-lcdp-script="${chemin}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.lcdpScript = chemin;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Script membre introuvable : " + chemin));
      document.body.appendChild(script);
    });
  }

  function attendreCreateurFormulaire() {
    if (typeof window.LCDP_creerFormulaire === "function") {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let tentatives = 0;

      const timer = window.setInterval(() => {
        tentatives += 1;

        if (typeof window.LCDP_creerFormulaire === "function") {
          window.clearInterval(timer);
          resolve();
          return;
        }

        if (tentatives > 40) {
          window.clearInterval(timer);
          reject(new Error("Le composant formulaire V3 n’est pas disponible."));
        }
      }, 50);
    });
  }

  function construireEndpointApi(cleModerne, cleLegacy, sousDomaineWorker) {
    const depuisConfig =
      CONFIG_PAGE?.[cleModerne] ||
      CONFIG_PAGE?.[cleLegacy] ||
      "";

    if (depuisConfig) return String(depuisConfig).replace(/\/+$/, "");

    if (typeof CONFIG_PAGE.apiUrl === "function") {
      return CONFIG_PAGE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    }

    return "";
  }

  function construireUrlPublic(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlPublic === "function") return window.LCDP_urlPublic(valeur);
    if (typeof CONFIG_PAGE.publicUrl === "function") return CONFIG_PAGE.publicUrl(valeur);

    return buildUrl(CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "", valeur);
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlMembre === "function") return window.LCDP_urlMembre(valeur);
    if (typeof CONFIG_PAGE.membreUrl === "function") return CONFIG_PAGE.membreUrl(valeur);

    return buildUrl(
      CONFIG_PAGE.membreBaseUrl ||
      CONFIG_PAGE.MEMBRE_BASE ||
      CONFIG_PAGE.siteBase ||
      "",
      valeur
    );
  }

  function construireUrlObjet(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlObjet === "function") return window.LCDP_urlObjet(valeur);
    if (typeof CONFIG_PAGE.objetUrl === "function") return CONFIG_PAGE.objetUrl(valeur);

    const objetBase =
      CONFIG_PAGE.objetBaseUrl ||
      CONFIG_PAGE.OBJET_BASE ||
      buildUrl(CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "", "/OBJET");

    return buildUrl(objetBase, valeur);
  }

  function estUrlExterneOuAncre(chemin) {
    return (
      !chemin ||
      chemin.startsWith("#") ||
      chemin.startsWith("mailto:") ||
      chemin.startsWith("tel:") ||
      chemin.startsWith("http://") ||
      chemin.startsWith("https://") ||
      chemin.startsWith("data:")
    );
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }

  function remplirChamp(id, valeur, texteSiVide = "Non renseigné") {
    const element = document.getElementById(id);

    if (!element) return;

    const texte = valeur || texteSiVide;
    element.classList.toggle("lcdp-compte-placeholder-da", !valeur && texteSiVide === "À renseigner lors de votre demande de DA");

    if ("value" in element) {
      element.value = texte;
      return;
    }

    element.textContent = texte;
  }

  function formaterDate(valeur) {
    if (!valeur) return "Non renseigné";

    const date = new Date(valeur);

    if (Number.isNaN(date.getTime())) {
      return valeur;
    }

    return date.toLocaleDateString("fr-FR");
  }

  function nettoyerTexteSimple(valeur) {
    return String(valeur || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function nettoyerEmail(valeur) {
    return String(valeur || "")
      .trim()
      .toLowerCase();
  }

  function nettoyerDepartement(valeur) {
    return String(valeur || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
  }

  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function redirigerConnexionMembre(motif) {
    redirectionCompteEnCours = true;
    const separateur = PAGE_CONNEXION_MEMBRE.includes("?") ? "&" : "?";

    window.location.href =
      PAGE_CONNEXION_MEMBRE +
      separateur +
      "source=" + encodeURIComponent(SOURCE_PAGE) +
      "&session=" +
      encodeURIComponent(motif || "inactive");
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
  }
})();