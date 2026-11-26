(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "accueil-membre";

  const ENDPOINT_INDEX_MEMBRE = construireEndpointApi(
    "workerIndexMembreUrl",
    "WORKER_INDEX_MEMBRE_URL",
    "W_INDEX_MEMBRE_URL",
    "index-membre-api"
  );

  const ENDPOINT_LA_CLE_DU_PARC = construireEndpointApi(
    "workerLaCleDuParcUrl",
    "WORKER_LA_CLE_DU_PARC_URL",
    "W_LA_CLE_DU_PARC_URL",
    "la-cle-du-parc-api"
  );

  const ENDPOINT_DECONNEXION_MEMBRE = construireEndpointApi(
    "",
    "W_DECONNEXION_URL",
    "",
    "deconnexion-membre-api"
  );

  const ENDPOINT_PAIEMENT = construireEndpointApi(
    "workerPaiementUrl", "WORKER_PAIEMENT_URL", "", "paiement-api"
  );

  const ENDPOINT_OPTIN_MEMBRE = construireEndpointApi("workerMonCompteMembreUrl","WORKER_MON_COMPTE_MEMBRE_URL","","mon-compte-membre-api");
  const ENDPOINT_REGLEMENT_PUBLICATION = construireEndpointApi("workerFormInscriptionMembreUrl","WORKER_FORM_INSCRIPTION_MEMBRE_URL","","form-inscription-membre-api");


  let pageInitialisee = false;
  let actionAccueilEnCours = false;
  let delaiAttenteNavigation = null;
  let etatMembre = {
    prenommembre: "",
    abonne: false,
    emailparrain: "",
    parrainRenseigne: false,
    aReservationEnCours: false,
    statutabo: "",
    debut: "",
    fin: "",
    abonnementSuspendu: false,
    paiementSuspension: null,
    statuda: null,
    dateda: null,
    datenext: null
  };

  window.LCDP_gererEtreInviteMembre = function LCDP_gererEtreInviteMembre() {
    return gererEtreInvite(etatMembre);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }

  // En cas de retour par l'historique, ne pas conserver un accueil en attente.
  window.addEventListener("pageshow", () => {
    // Retour navigateur, même sans restauration bfcache : jamais de spinner orphelin.
    masquerAttenteNavigationAccueil();
  });

  async function initialiserPage() {
    if (pageInitialisee) return;
    pageInitialisee = true;

    try {
      // Lancer les opérations indépendantes en parallèle.
      // Le footer et l’initialisation finale du burger ne bloquent pas l’accueil.
      // Le bandeau et le burger ne doivent pas empêcher l’accueil de s’ouvrir.
      const promesseBandeau = initialiserBandeau().then(() => true).catch((error) => {
        console.warn("Bandeau ou burger membre indisponible :", error);
        return false;
      });
      const promesseEtat = chargerEtatMembre();
      initialiserFooter().catch((error) => {
        console.warn("Footer indisponible sur l’accueil membre :", error);
      });

      const etat = await promesseEtat;

      if (!etat) return;

      etatMembre = etat;
      afficherEtatMembre(etatMembre);
      initialiserMenuCentral(etatMembre);
      const contenu = document.getElementById("lcdp-accueil-contenu");
      if (contenu) {
        contenu.hidden = false;
        contenu.setAttribute("aria-busy", "false");
      }
      if (window.LCDP_delaiAccueilMembre) window.clearTimeout(window.LCDP_delaiAccueilMembre);
      const erreurAccueil = document.getElementById("lcdp-accueil-erreur");
      if (erreurAccueil) erreurAccueil.hidden = true;
      const attente = document.getElementById("lcdp-accueil-attente");
      if (attente) attente.style.display = "none";
      document.body.classList.remove("public-home--loading");

      // Après Stripe, l'accueil s'affiche immédiatement : confirmation en arrière-plan.
      traiterOptinAccueil().catch(async error => {
        console.error("Opt-in règlement indisponible :", error);
        await afficherAlerte("La demande d'accord n'a pas pu être chargée. Actualisez la page pour réessayer.");
      }).then(() => traiterRetourPaiementAccueil()).catch((error) => {
        console.warn("Vérification du règlement indisponible :", error);
      });

      // Le burger est initialisé seulement après le chargement de son script.
      // Son indisponibilité ne bloque pas le contenu de l’accueil.
      promesseBandeau.then((bandeauCharge) => {
        if (!bandeauCharge) return;
        return initialiserBurgerMembre(etatMembre);
      }).catch((error) => {
        console.warn("Menu burger membre indisponible :", error);
      });
    } catch (error) {
      console.error("Erreur accueil membre :", error);
      if (typeof window.LCDP_echecAccueilMembre === "function") {
        window.LCDP_echecAccueilMembre();
      }
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  // Une boîte CHOIX officielle par événement de publication non accepté.
  async function traiterOptinAccueil() {
    if (!etatMembre.causesSuspension?.some(c => c === "optin_reglement_app" || c === "optin_reglement_club")) return;
    if (!ENDPOINT_OPTIN_MEMBRE || !ENDPOINT_REGLEMENT_PUBLICATION) throw Error("Service non configuré.");
    const endpoint = ENDPOINT_OPTIN_MEMBRE + "/optin-reglements";
    const reponse = await fetch(endpoint, {credentials:"include",cache:"no-store",headers:{Accept:"application/json"}});
    const r = await reponse.json().catch(()=>null);
    if (!reponse.ok || r?.ok !== true || !Array.isArray(r.demandes)) throw Error("Demandes indisponibles.");
    for (const demande of r.demandes) {
      await afficherDemandeOptin(demande, endpoint);
    }
    const actualise = await chargerEtatMembre();
    if (actualise) {
      etatMembre = actualise;
      afficherEtatMembre(etatMembre);
    }
  }

  async function afficherDemandeOptin(demande, endpoint) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(demande?.idpublication || "") ||
        !["reglement-app","reglement-club"].includes(demande.document) || !String(demande.version||"").trim()) throw Error("Publication invalide.");
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) throw Error("Emplacement dialogue indisponible.");
    const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-choix.html");
    // Ne jamais remplacer un dialogue déjà ouvert.
    if (slot.childElementCount) await new Promise(resolve => {
      const observation = new MutationObserver(() => { if (!slot.childElementCount) { observation.disconnect(); resolve(); } });
      observation.observe(slot, {childList:true});
      if (!slot.childElementCount) { observation.disconnect(); resolve(); }
    });
    const avant = document.activeElement;
    slot.replaceChildren(fragment);
    const titre=slot.querySelector("[data-lcdp-dialogue-titre]");
    const texte=slot.querySelector("[data-lcdp-dialogue-message]");
    const refuser=slot.querySelector('[data-lcdp-dialogue-action="annuler"]');
    const accepter=slot.querySelector('[data-lcdp-dialogue-action="confirmer"]');
    if (!titre||!texte||!refuser||!accepter) { slot.replaceChildren(); throw Error("Dialogue CHOIX incomplet."); }
    const type=demande.document==="reglement-club"?"du club":"de l’application";
    const version=String(demande.version).trim();
    titre.textContent="Mise à jour du règlement";
    const lien=document.createElement("a");
    lien.href=ENDPOINT_REGLEMENT_PUBLICATION+"/reglement-publication?id="+encodeURIComponent(demande.idpublication);
    lien.target="_blank";lien.rel="noopener noreferrer";
    lien.textContent="Voir le nouveau règlement "+type;
    texte.replaceChildren("Le règlement "+type+" a été mis à jour (passage à "+(/^version\b/i.test(version)?"la "+version.charAt(0).toLowerCase()+version.slice(1):"la version "+version)+").",document.createElement("br"),"Votre accord est nécessaire.",document.createElement("br"),lien);
    refuser.textContent="Refuser";
    accepter.textContent="Accepter";
    return new Promise(resolve=>{
      let occupe=false;
      const erreur=document.createElement("span");
      erreur.setAttribute("role","alert");
      const clavier=event=>{
        if(event.key==="Escape"){event.preventDefault();return;}
        if(event.key==="Tab"){
          const cibles=[lien,refuser,accepter].filter(el=>!el.disabled);
          if(event.shiftKey&&document.activeElement===cibles[0]){event.preventDefault();cibles.at(-1).focus();}
          else if(!event.shiftKey&&document.activeElement===cibles.at(-1)){event.preventDefault();cibles[0].focus();}
        }
      };
      const decider=async valeur=>{
        if(occupe)return;occupe=true;refuser.disabled=true;accepter.disabled=true;erreur.remove();
        try{
          const reponse=await fetch(endpoint,{method:"POST",credentials:"include",cache:"no-store",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({idpublication:demande.idpublication,accepter:valeur})});
          const r=await reponse.json().catch(()=>null);
          if(!reponse.ok||r?.ok!==true)throw Error(r?.message||"La décision n'a pas pu être enregistrée.");
          document.removeEventListener("keydown",clavier);
          slot.replaceChildren();if(avant?.isConnected)avant.focus();
          resolve();
        }catch(e){
          erreur.textContent=" "+(e.message||"Réessayez.");texte.appendChild(erreur);
          occupe=false;refuser.disabled=false;accepter.disabled=false;refuser.focus();
        }
      };
      refuser.addEventListener("click",()=>decider(false));accepter.addEventListener("click",()=>decider(true));
      document.addEventListener("keydown",clavier);refuser.focus();
    });
  }

  async function traiterRetourPaiementAccueil() {
    const parametres = new URLSearchParams(window.location.search);
    if (parametres.get("paiement") !== "retour" || parametres.get("retour") !== "success") return;
    const idpanier = String(parametres.get("idpanier") || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idpanier)) return;

    // Nettoyer l’URL sans recharger l’accueil : le contrôle ne se rejoue pas au retour.
    const url = new URL(window.location.href);
    ["paiement", "retour", "idpanier"].forEach((cle) => url.searchParams.delete(cle));
    window.history.replaceState(window.history.state, "", url.toString());

    let statut = "";
    for (let tentative = 0; tentative < 8; tentative += 1) {
      try {
        if (!ENDPOINT_PAIEMENT) break;
        const reponse = await fetch(ENDPOINT_PAIEMENT + "/etat?idpanier=" + encodeURIComponent(idpanier), {
          method: "GET", credentials: "include", cache: "no-store",
          headers: { Accept: "application/json" }
        });
        const etat = await reponse.json().catch(() => null);
        if (!reponse.ok || etat?.ok !== true) break;
        statut = String(etat.commande?.statut || "");
        if (statut === "paye" || statut === "incident" || statut === "annule") break;
      } catch (error) {
        console.warn("État du paiement indisponible :", error);
        break;
      }
      if (tentative < 7) await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Ne jamais présenter une réservation comme confirmée avant le Worker.
    const message = statut === "paye"
      ? "Paiement confirmé. Vos accès sont réservés."
      : statut === "incident" || statut === "annule"
        ? "La confirmation de la commande a rencontré un problème. Votre paiement doit être vérifié avant toute nouvelle tentative."
        : "Votre paiement est en cours de vérification. Ne recommencez pas le règlement. Votre commande et vos accès seront confirmés après vérification.";
    // Ne pas recouvrir une autre fenêtre que le membre aurait ouverte entre-temps.
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot || slot.childElementCount) return;
    await afficherAlerte(message, { profil: statut === "incident" || statut === "annule" ? "erreur" : "information" });
  }

  async function chargerEtatMembre() {
    if (!ENDPOINT_INDEX_MEMBRE) {
      throw new Error("Le service d’accueil membre n’est pas configuré.");
    }

    const controleur = new AbortController();
    const delai = window.setTimeout(() => controleur.abort(), 12000);
    let reponse;
    try {
      reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controleur.signal,
        headers: { "Accept": "application/json" }
      });
    } catch (erreur) {
      if (erreur?.name === "AbortError") {
        throw new Error("Le chargement du compte a expiré. Réessayez.");
      }
      throw erreur;
    } finally {
      window.clearTimeout(delai);
    }

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !resultat || resultat.success !== true || resultat.connected !== true) {
      throw new Error(messageErreurApi(resultat, "Impossible de vérifier votre session membre."));
    }

    // Le statut de membre vient uniquement du Worker : abonnement en cours et non annulé.
    const abonnementEnCours = resultat.abonnementEnCours || null;
    const abonnementSuspendu = valeurBooleenneVraie(resultat.abonnementSuspendu || resultat.suspendu);
    const paiementSuspension = resultat.paiementSuspension || resultat.paiementRegularisation || null;
    const mentionAbonnement = abonnementSuspendu
      ? (paiementSuspensionDelaiDepasse(paiementSuspension)
        ? "[Règlement indisponible]"
        : "[Votre abonnement est suspendu (non payé)]")
      : (paiementSuspension ? "[Échéance(s) d’abonnement non payée(s)]" : "");

    return {
      causesSuspension: Array.isArray(resultat.causesSuspension) ? resultat.causesSuspension : [],
      prenommembre: nettoyerPrenom(resultat.prenommembre),
      abonne: valeurBooleenneVraie(resultat.abonne),
      emailparrain: nettoyerEmail(resultat.emailparrain),
      parrainRenseigne: valeurBooleenneVraie(resultat.parrainRenseigne),
      aReservationEnCours: valeurBooleenneVraie(resultat.aReservationEnCours || resultat.aReservationValidable),
      reservationEnCours: resultat.reservationEnCours || resultat.reservationValidable || null,
      abonnementInvitable: resultat.abonnementInvitable || null,
      statutabo: abonnementEnCours?.statutabo || "",
      typeabo: abonnementEnCours?.typeabo || abonnementEnCours?.typeaboPrix || "",
      debut: abonnementEnCours?.debut || "",
      fin: abonnementEnCours?.fin || "",
      abonnementSuspendu,
      mentionAbonnement,
      paiementSuspension,
      statuda: resultat.statuda || null,
      dateda: resultat.dateda || null,
      datenext: resultat.datenext || null
    };
  }

  function afficherEtatMembre(etat) {
    const mention = document.getElementById("mention-statut-membre");
    const message = document.getElementById("message-accueil-membre");

    if (mention) {
      mention.textContent = etat.abonne
        ? "MEMBRE ABONNÉ"
        : "MEMBRE INVITÉ";
    }

    if (message) afficherMessageAccueil(message, etat.prenommembre);

    afficherMentionAbonnementMembre(etat);
  }

  function afficherMessageAccueil(element, prenom) {
    element.textContent = prenom ? "Bonjour " + prenom : "Bonjour";
  }

  function afficherMentionAbonnementMembre(etat) {
    const accueil = document.getElementById("message-accueil-membre");
    if (!accueil || !accueil.parentNode) return;

    let bloc = document.getElementById("mention-suspension-abonnement-membre");
    const texteMention = etat?.mentionAbonnement || "";

    if (!texteMention) {
      if (bloc) bloc.remove();
      return;
    }

    if (!bloc) {
      bloc = document.createElement("div");
      bloc.id = "mention-suspension-abonnement-membre";
      bloc.className = "lcdp-mention-connexion lcdp-mention-suspension-abonnement";
      accueil.insertAdjacentElement("afterend", bloc);
    }

    const texte = document.createElement("span");
    texte.textContent = texteMention;
    bloc.replaceChildren(texte);
    if (etat?.paiementSuspension?.orderid) {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-button lcdp-button-secondary lcdp-workflow-micro-action";
      bouton.textContent = "Payer";
      bouton.addEventListener("click", async () => {
        if (bouton.disabled) return;
        bouton.disabled = true;
        try {
          await gererPaiementSuspensionMembre(etat);
        } catch (error) {
          console.error("Ouverture du paiement :", error);
          await afficherAlerte("Impossible d’ouvrir le paiement. Merci de réessayer.", { profil: "erreur" });
        } finally {
          bouton.disabled = false;
        }
      });
      bloc.appendChild(bouton);
    }
  }

  async function gererPaiementSuspensionMembre(etat) {
    await afficherEcheancesPaiementSuspension(etat);
  }

  function suspensionPourNonPaiement(etat) {
    return Boolean(
      etat &&
      etat.abonnementSuspendu === true &&
      etat.paiementSuspension
    );
  }

  // Parcours intégré dans la zone principale de l'accueil : bandeau et footer restent visibles.
  function ouvrirParcoursCompte(id,libelle) {
    const main = document.querySelector(".lcdp-app-wrapper > #lcdp-accueil-contenu");
    if (!main || main.querySelector("[data-lcdp-compte-parcours]")) return null;
    masquerAttenteNavigationAccueil();
    document.getElementById("lcdp-lightbox-slot")?.replaceChildren();
    const retourFocus = document.activeElement;
    const anciens = Array.from(main.children).map(element => ({element,hidden:element.hidden}));
    const ancienScroll = main.scrollTop;
    const section = document.createElement("section");
    section.className = "lcdp-page-section";
    section.setAttribute("data-lcdp-compte-parcours","");
    section.setAttribute("aria-label",libelle);
    const conteneur = document.createElement("div");
    conteneur.className = "lcdp-page-container";
    const contenu = document.createElement("div");
    contenu.id = id;
    contenu.setAttribute("data-lcdp-compte-parcours-contenu","");
    conteneur.appendChild(contenu);
    section.appendChild(conteneur);
    anciens.forEach(({element}) => {element.hidden = true;});
    main.appendChild(section);
    main.scrollTop = 0;
    let ferme = false;
    return {contenu,fermer() {
      if (ferme) return;
      ferme = true;
      section.remove();
      anciens.forEach(({element,hidden}) => {if (element.isConnected) element.hidden = hidden;});
      main.scrollTop = ancienScroll;
      if (retourFocus?.isConnected) retourFocus.focus();
    }};
  }

  function afficherAlertePaiementAccueil(message,slot) {
    return afficherAlerte(message,{profil:"erreur",slotParcours:slot});
  }
  function afficherInformationPaiementAccueil(message,titre,slot) {
    return afficherAlerte(message,{profil:"information",titre,slotParcours:slot});
  }
  function afficherChoixPaiementAccueil(message,options,slot) {
    return afficherAlerte(message,{...options,mode:"confirmation",slotParcours:slot});
  }

  async function afficherEcheancesPaiementSuspension(etat) {
    const parcours = ouvrirParcoursCompte("dialogue-paiement-impaye","Régulariser mon abonnement");
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
              try { await afficherAlertePaiementAccueil("Impossible de charger le paiement. Veuillez réessayer.",slot); await afficherListe(); }
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
        await afficherAlertePaiementAccueil(messageDelaiPaiementDepasse(),slot);
        parcours.fermer();
      } else if (!orderid) {
        await afficherAlertePaiementAccueil("Paiement introuvable.",slot);
        parcours.fermer();
      } else if (!echeances.length) {
        await afficherInformationPaiementAccueil("Aucune échéance non payée.","Échéances de paiement",slot);
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
      await afficherAlertePaiementAccueil(!orderid ? "Commande non renseignée." : messageDelaiPaiementDepasse(),slot);
      await retourListe();
      return;
    }
    const ok = await afficherChoixPaiementAccueil(
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

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const bandeau = await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html");
    slot.appendChild(bandeau);

    appliquerRoutesSite(slot);

    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js?v=20261123-boutique-cadre");
  }

  async function initialiserBurgerMembre(etat) {
    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre({ etatMembre: etat });
    }
  }

  function initialiserMenuCentral(etat) {
    const slot = document.getElementById("lcdp-menu-central-slot");
    if (!slot) throw new Error("Boutons de l'accueil membre introuvables.");

    const messageAccueil = document.getElementById("message-accueil-membre");
    if (messageAccueil) afficherMessageAccueil(messageAccueil, etat.prenommembre);

    const actions = ["planifier", "mes_acces", "ma_cle"];
    const boutons = Array.from(slot.querySelectorAll("button[data-lcdp-member-action]"));
    if (boutons.length !== actions.length ||
        actions.some(action => !boutons.some(b => b.dataset.lcdpMemberAction === action))) {
      throw new Error("Structure des boutons de l'accueil membre incomplète.");
    }

    boutons.forEach((bouton) => {
      if (bouton.dataset.lcdpActionInitialisee === "true") return;
      bouton.dataset.lcdpActionInitialisee = "true";
      bouton.addEventListener("click", async () => {
        if (actionAccueilEnCours) return;
        actionAccueilEnCours = true;
        afficherAttenteNavigationAccueil();

        try {
          const issue = await gererBoutonAccueilMembre(bouton.dataset.lcdpMemberAction);
          // Ne pas afficher l'attente si l'accès a été refusé ou si un dialogue est ouvert.
          if (issue !== "ouvert" && issue !== "non_connecte") {
            masquerAttenteNavigationAccueil();
          }
        } catch (error) {
          masquerAttenteNavigationAccueil();
          console.error(error);
          afficherAlerte(error.message || "Erreur technique. Merci de réessayer.").catch(console.error);
        }
      });
    });
  }

  function afficherAttenteNavigationAccueil() {
    const attente = document.getElementById("lcdp-navigation-attente");
    const slot = document.getElementById("lcdp-menu-central-slot");
    if (attente) {
      // L'attente doit couvrir le viewport, jamais rester dans la grille de l'accueil.
      // Le déplacement hors du conteneur protège aussi des parents transformés.
      if (attente.parentElement !== document.body) document.body.appendChild(attente);
      attente.hidden = false;
    }
    // Un service sans réponse ne doit jamais immobiliser l'accueil.
    if (delaiAttenteNavigation !== null) window.clearTimeout(delaiAttenteNavigation);
    delaiAttenteNavigation = window.setTimeout(() => {
      delaiAttenteNavigation = null;
      masquerAttenteNavigationAccueil();
    }, 15000);
    if (!slot) return;
    slot.setAttribute("aria-busy", "true");
    slot.querySelectorAll(":scope > button[data-lcdp-member-action]").forEach((bouton) => {
      bouton.disabled = true;
    });
  }

  function masquerAttenteNavigationAccueil() {
    if (delaiAttenteNavigation !== null) {
      window.clearTimeout(delaiAttenteNavigation);
      delaiAttenteNavigation = null;
    }
    actionAccueilEnCours = false;
    const attente = document.getElementById("lcdp-navigation-attente");
    const slot = document.getElementById("lcdp-menu-central-slot");
    if (attente) {
      attente.hidden = true;
      attente.style.removeProperty("display");
    }
    if (!slot) return;
    slot.setAttribute("aria-busy", "false");
    slot.querySelectorAll(":scope > button[data-lcdp-member-action]").forEach((bouton) => {
      bouton.disabled = false;
    });
  }

  // PLANIFIER : choix d'action avant l'ouverture du planning existant.
  async function gererBoutonAccueilMembre(action) {
    if (action === "planifier") {
      masquerAttenteNavigationAccueil();
      const permanent = etatMembre.abonne === true &&
        etatMembre.abonnementSuspendu !== true &&
        ["1A", "11M", "10M"].includes(String(etatMembre.typeabo || "").trim().toUpperCase());
      const choix = await ouvrirChoixPlanifier(permanent);
      if (!choix) return "annule";
      if (choix === "express") {
        try {
          await window.LCDP_ouvrirFormulaireAlertePlanifier({express:true});
        } catch(err) {
          await afficherAlerte(err.message||"Recherche express indisponible.");
        }
        return "dialogue";
      }
      if (choix === "alerte") {
        try {
          await window.LCDP_alerteNavigation.accueil({
            permanent,creer:()=>ouvrirFormulaireAlertePlanning()
          });
        } catch(err) {
          await afficherAlerte(err.message||"Recherche enregistrée indisponible.");
        }
        return "dialogue";
      }
      if (choix === "ia") {
        if (!permanent) return "refuse";
        // Le contrôle serveur de session et de suspension reste celui de PLANIFIER.
        const issue = await window.LCDP_AccueilDroits.executer("planifier", { planifierMode: "ia" });
        if (issue === "non_connecte") redirigerConnexionMembre("inactive");
        // Le dialogue IA existant s'ouvre dans le tunnel PLANIFIER.
        if (issue === "ouvert") return issue;
        return issue;
      }
      action = "planifier";
      afficherAttenteNavigationAccueil();
    }
    const issue = await window.LCDP_AccueilDroits.executer(action, {
      avantMaCle: preparerIdentiteNavigateurCle,
      surNavigateurNonProprietaire: proposerTransfertNavigateur
    });
    if (issue === "non_connecte") redirigerConnexionMembre("inactive");
    return issue;
  }

  async function ouvrirChoixPlanifier(permanent) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) throw new Error("Emplacement de lightbox introuvable.");
    const fragment = await chargerFragmentMembre("/ESPACE-MEMBRE/box-choix-planifier.html");
    slot.replaceChildren(fragment);
    const dialogue = slot.querySelector("[data-lcdp-choix-planifier]");
    const fermerBouton = slot.querySelector("[data-lcdp-choix-fermer]");
    const choixIa = slot.querySelector('[data-lcdp-choix-action="ia"]');
    if (!dialogue || !fermerBouton || !choixIa) throw new Error("Structure du choix PLANIFIER incomplète.");
    if (permanent) {
      choixIa.disabled = false;
      choixIa.removeAttribute("aria-disabled");
      choixIa.classList.remove("lcdp-planifier-choix__option--disabled");
      choixIa.classList.add("lcdp-planifier-choix__option--alerte");
      slot.querySelector("[data-lcdp-choix-bientot]")?.remove();
    }
    return new Promise(resolve => {
      let termine = false;
      const precedent = document.activeElement;
      const controle = new AbortController();
      function fermer(valeur) {
        if (termine) return;
        termine = true;
        controle.abort();
        slot.replaceChildren();
        if (precedent?.isConnected) precedent.focus({ preventScroll: true });
        resolve(valeur);
      }
      fermerBouton.addEventListener("click", () => fermer(null), { signal: controle.signal });
      dialogue.addEventListener("click", event => {
        if (event.target === dialogue) fermer(null);
      }, { signal: controle.signal });
      dialogue.querySelectorAll("[data-lcdp-choix-action]:not(:disabled)").forEach(bouton => {
        bouton.addEventListener("click", () => fermer(bouton.dataset.lcdpChoixAction), { signal: controle.signal });
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") { fermer(null); return; }
        if (event.key !== "Tab") return;
        const focus = Array.from(dialogue.querySelectorAll("button:not(:disabled)"));
        const premier = focus[0], dernier = focus[focus.length - 1];
        if (event.shiftKey && document.activeElement === premier) {
          event.preventDefault(); dernier.focus();
        } else if (!event.shiftKey && document.activeElement === dernier) {
          event.preventDefault(); premier.focus();
        }
      }, { signal: controle.signal });
      fermerBouton.focus({ preventScroll: true });
    });
  }

  async function ouvrirFormulaireAlertePlanning() {
    if(typeof window.LCDP_ouvrirFormulaireAlertePlanifier!=="function")
      throw new Error("Formulaire ALERTE PLANIFIER indisponible.");
    const permanent=etatMembre.abonne===true && etatMembre.abonnementSuspendu!==true &&
      ["1A","11M","10M"].includes(String(etatMembre.typeabo||"").trim().toUpperCase());
    return window.LCDP_ouvrirFormulaireAlertePlanifier({permanent});
  }

  function preparerIdentiteNavigateurCle() {
    if (!/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent || "")) return;
    const nom = "lcdp_navigateur_proprietaire";
    const lire = () => (document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(nom + "=")) || "").slice(nom.length + 1);
    let secret = lire();
    if (!/^[a-f0-9]{64}$/.test(secret)) {
      secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), v => v.toString(16).padStart(2, "0")).join("");
    }
    const domaine = /(^|\.)lacleduparc\.fr$/i.test(window.location.hostname) ? "; Domain=.lacleduparc.fr" : "";
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = nom + "=" + secret + "; Path=/; Max-Age=34560000; SameSite=Lax" + domaine + secure;
    if (lire() !== secret) throw new Error("Autorisez les cookies de l’application pour utiliser Ma clé.");
  }

  async function proposerTransfertNavigateur() {
    const choix = await afficherConfirmationChoixMembre({
      titre: "Navigateur propriétaire",
      texte: "Ce navigateur n’est pas votre navigateur propriétaire. Le changement retirera l’autorisation de Ma clé à l’ancien navigateur.",
      confirmer: "Utiliser ce navigateur à la place"
    });
    if (choix !== true) return;
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return;
    const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-bouton.html");
    slot.innerHTML = "";
    slot.appendChild(fragment);
    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = slot.querySelector("[data-lcdp-dialogue-title]");
    const texte = slot.querySelector("[data-lcdp-dialogue-text]");
    const actions = slot.querySelector("[data-lcdp-dialogue-actions]");
    const fermer = slot.querySelector("[data-lcdp-dialogue-close]");
    if (!dialogue || !titre || !texte || !actions || !fermer) throw new Error("Dialogue de transfert incomplet.");
    titre.textContent = "Changer de navigateur propriétaire";
    texte.textContent = "Saisissez votre code d’accès (CODA) pour autoriser le changement. Vous disposez d’un essai ; une erreur impose un délai de 30 minutes.";
    actions.innerHTML = "";
    const formulaire = document.createElement("form");
    const cases = document.createElement("div");
    cases.className = "lcdp-transfert-coda-cases";
    const champs = Array.from({ length: 4 }, (_, i) => {
      const champ = document.createElement("input");
      champ.type = "password";
      champ.inputMode = "numeric";
      champ.autocomplete = "off";
      champ.maxLength = 1;
      champ.required = true;
      champ.pattern = "[0-9]";
      champ.setAttribute("aria-label", "Chiffre " + (i + 1) + " du CODA");
      champ.addEventListener("input", () => {
        champ.value = champ.value.replace(/[^0-9]/g, "").slice(-1);
        if (champ.value && i < 3) champs[i + 1].focus();
      });
      champ.addEventListener("keydown", event => {
        if (event.key === "Backspace" && !champ.value && i > 0) champs[i - 1].focus();
      });
      cases.appendChild(champ);
      return champ;
    });
    const valider = document.createElement("button");
    valider.type = "submit";
    valider.className = "lcdp-button lcdp-button-primary";
    valider.textContent = "Valider le changement";
    formulaire.append(cases, valider);
    actions.appendChild(formulaire);
    fermer.addEventListener("click", () => { slot.innerHTML = ""; }, { once: true });
    dialogue.addEventListener("click", event => { if (event.target === dialogue) slot.innerHTML = ""; });
    let envoiTransfert = false;
    formulaire.addEventListener("submit", async event => {
      event.preventDefault();
      if (envoiTransfert) return;
      const coda = champs.map(champ => champ.value).join("");
      if (!/^[0-9]{4}$/.test(coda)) return;
      envoiTransfert = true;
      valider.disabled = true;
      champs.forEach(champ => { champ.value = ""; champ.disabled = true; });
      try {
        const reponse = await fetch(ENDPOINT_LA_CLE_DU_PARC + "/browser-transfer", {
          method: "POST", credentials: "include", cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ coda })
        });
        const resultat = await reponse.json().catch(() => null);
        slot.innerHTML = "";
        if (reponse.status === 401) { redirigerConnexionMembre("inactive"); return; }
        await afficherAlerte(resultat?.message || "La réponse n’a pas pu être confirmée. Réessayez plus tard.", { profil: reponse.ok && resultat?.success === true ? "information" : "erreur" });
        if (reponse.ok && resultat?.success === true) await gererBoutonAccueilMembre("ma_cle");
      } catch {
        slot.innerHTML = "";
        await afficherAlerte("La réponse n’a pas pu être confirmée. Réessayez plus tard.");
      }
    });
    champs[0].focus();
  }

  async function ouvrirPageAbonne(etat, fonction, chemin) {
    if (!etat.abonne && !membreAbonne()) {
      await afficherAlerte("Vous devez être membre abonné pour utiliser la fonction " + fonction, { profil: "information" });
      return;
    }

    if (suspensionPourNonPaiement(etat)) {
      await gererPaiementSuspensionMembre(etat);
      return;
    }

    if (etat.abonnementSuspendu === true) {
      await afficherAlerte("Votre abonnement est suspendu.", { profil: "information", titre: "Abonnement suspendu" });
      return;
    }

    redirigerMembre(chemin);
  }

  async function gererEtreInvite(etat) {
    if (!etat.parrainRenseigne) {
      await afficherAlerte('Renseignez votre parrain dans la rubrique "Mes informations"', { profil: "information" });
      return;
    }

    await afficherAlerte("Votre parrain peut vous inviter depuis son espace.", { profil: "information" });
  }

  async function afficherConfirmationChoixMembre(options = {}) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return false;
    const avant = document.activeElement;
    try {
      slot.replaceChildren(await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-choix.html"));
      const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="choix"]');
      const titre = slot.querySelector("[data-lcdp-dialogue-titre]");
      const texte = slot.querySelector("[data-lcdp-dialogue-message]");
      const annuler = slot.querySelector('[data-lcdp-dialogue-action="annuler"]');
      const confirmer = slot.querySelector('[data-lcdp-dialogue-action="confirmer"]');
      if (!dialogue || !titre || !texte || !annuler || !confirmer) throw new Error("Dialogue CHOIX incomplet.");
      titre.textContent = options.titre || "Confirmer la déconnexion";
      texte.textContent = options.texte || "Voulez-vous vous déconnecter de votre espace membre ?";
      annuler.textContent = "Annuler";
      confirmer.textContent = options.confirmer || "Confirmer";
      return await new Promise(resolve => {
        let termine = false;
        function fermer(valeur) {
          if (termine) return;
          termine = true;
          document.removeEventListener("keydown", clavier);
          slot.replaceChildren();
          if (avant?.isConnected && typeof avant.focus === "function") avant.focus();
          resolve(valeur);
        }
        function clavier(event) {
          if (event.key === "Escape") { event.preventDefault(); fermer(false); }
          if (event.key === "Tab") {
            if (event.shiftKey && document.activeElement === annuler) { event.preventDefault(); confirmer.focus(); }
            else if (!event.shiftKey && document.activeElement === confirmer) { event.preventDefault(); annuler.focus(); }
          }
        }
        annuler.addEventListener("click", () => fermer(false), { once: true });
        confirmer.addEventListener("click", () => fermer(true), { once: true });
        dialogue.addEventListener("click", event => { if (event.target === dialogue) fermer(false); });
        document.addEventListener("keydown", clavier);
        annuler.focus();
      });
    } catch (erreur) {
      slot.replaceChildren();
      if (avant?.isConnected && typeof avant.focus === "function") avant.focus();
      console.error("Confirmation CHOIX membre indisponible :", erreur);
      return false;
    }
  }

  async function gererDeconnexion() {
    const confirmation = await afficherConfirmationChoixMembre();
    if (!confirmation) return;

    if (!ENDPOINT_DECONNEXION_MEMBRE) {
      throw new Error("Le service de déconnexion membre n’est pas configuré.");
    }

    if (!ENDPOINT_INDEX_MEMBRE) throw new Error("Le service de vérification de session n’est pas configuré.");
    try {
      await window.LCDP_suspendreRenouvellementPourDeconnexion?.();
      const reponse = await fetch(ENDPOINT_DECONNEXION_MEMBRE + "/deconnexion", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      const resultat = await reponse.json().catch(() => null);
      if (!reponse.ok || !resultat || resultat.success !== true) {
        throw new Error(messageErreurApi(resultat, "Impossible de fermer la session membre."));
      }

      // Ne pas confondre une réponse de succès avec une session réellement fermée.
      const controle = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
        method: "GET", credentials: "include", cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      const etat = await controle.json().catch(() => null);
      if (!((controle.status === 401 && etat?.connected === false) ||
            (controle.ok && etat?.success === true && etat?.connected === false))) {
        throw new Error("La fermeture de la session membre n’a pas pu être confirmée. Merci de réessayer.");
      }
      window.LCDP_effacerEcheanceRenouvellementMembre?.();
      window.location.replace(construireUrlPublic("/ESPACE-PUBLIC/accueil-public.html"));
    } catch (erreur) {
      window.LCDP_reprendreRenouvellementApresEchecDeconnexion?.();
      throw erreur;
    }
  }


  function normaliserPonctuationAlerte(message) {
    const texte = String(message || "").trim();

    if (!texte) return "";
    if (/[.!?…]$/.test(texte)) return texte;

    return texte + ".";
  }

  async function afficherAlerte(message, options = {}) {
    const slot = options.slotParcours || document.getElementById("lcdp-lightbox-slot");
    if (!slot) return false;
    slot.replaceChildren();
    const integrer = dialogue => {
      if (options.slotParcours) { dialogue.setAttribute("role","region"); dialogue.removeAttribute("aria-modal"); }
    };

    // Les profils INFORMATION et CHOIX partagent les dialogues de référence.
    if (options.mode !== "confirmation" && options.profil === "information") {
      const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-information.html");
      slot.appendChild(fragment);
      const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="information"]');
      const titre = slot.querySelector('[data-lcdp-dialogue-titre]');
      const texte = slot.querySelector('[data-lcdp-dialogue-message]');
      const fermer = slot.querySelector('[data-lcdp-dialogue-action="compris"]');
      if (!dialogue || !titre || !texte || !fermer) {
        slot.replaceChildren();
        throw new Error("Structure du dialogue INFORMATION incomplète.");
      }
      integrer(dialogue);
      titre.textContent = options.titre || "Information";
      texte.textContent = normaliserPonctuationAlerte(message);
      fermer.textContent = "Fermer";
      return new Promise(resolve => {
        let resolu = false;
        fermer.addEventListener("click", () => {
          if (resolu) return;
          resolu = true;
          slot.replaceChildren();
          resolve(true);
        }, { once: true });
        fermer.focus();
      });
    }

    if (options.mode === "confirmation") {
      try {
        const fragmentChoix = await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-choix.html");
        slot.appendChild(fragmentChoix);
        const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="choix"]');
        const titre = slot.querySelector("[data-lcdp-dialogue-titre]");
        const texte = slot.querySelector("[data-lcdp-dialogue-message]");
        const annuler = slot.querySelector('[data-lcdp-dialogue-action="annuler"]');
        const confirmer = slot.querySelector('[data-lcdp-dialogue-action="confirmer"]');
        if (!dialogue || !titre || !texte || !annuler || !confirmer) throw new Error("Structure CHOIX incomplète.");
        integrer(dialogue);
        titre.textContent = options.titre || "Confirmation";
        texte.textContent = normaliserPonctuationAlerte(message);
        annuler.textContent = options.libelleAnnuler || "Annuler";
        confirmer.textContent = options.libelleConfirmer || "Confirmer";
        return await new Promise(resolve => {
          let resolu = false;
          const fermer = valeur => {
            if (resolu) return;
            resolu = true;
            slot.replaceChildren();
            resolve(valeur);
          };
          annuler.addEventListener("click", () => fermer(false), { once: true });
          confirmer.addEventListener("click", () => fermer(true), { once: true });
          if (options.sansCroix !== true) {
            dialogue.addEventListener("click", event => {
              if (!options.slotParcours && event.target === dialogue) fermer(false);
            });
          }
          confirmer.focus();
        });
      } catch (erreur) {
        slot.replaceChildren();
        throw erreur;
      }
    }

    // Les confirmations binaires utilisent CHOIX plus haut ; cette branche est ERREUR.
    slot.appendChild(await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-erreur.html"));
    const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="erreur"]');
    const titre = slot.querySelector("[data-lcdp-dialogue-titre]");
    const texte = slot.querySelector("[data-lcdp-dialogue-message]");
    const bouton = slot.querySelector('[data-lcdp-dialogue-action="fermer"]');
    if (!dialogue || !titre || !texte || !bouton) {
      slot.replaceChildren();
      throw new Error("Structure du dialogue ERREUR incomplète.");
    }
    const focusInitial = document.activeElement;
    integrer(dialogue);
    titre.textContent = options.titre || "Erreur";
    texte.textContent = normaliserPonctuationAlerte(message);
    bouton.textContent = "Fermer";
    return new Promise(resolve => {
      let resolu = false;
      const fermer = valeur => {
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererClavier);
        slot.replaceChildren();
        if (focusInitial?.isConnected && typeof focusInitial.focus === "function") {
          focusInitial.focus();
        }
        resolve(valeur);
      };
      const gererClavier = event => {
        if (event.key === "Escape") {
          event.preventDefault();
          fermer(false);
        }
      };
      bouton.addEventListener("click", () => fermer(true), { once: true });
      dialogue.addEventListener("click", event => {
        if (!options.slotParcours && event.target === dialogue) fermer(false);
      });
      document.addEventListener("keydown", gererClavier);
      bouton.focus();
    });
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const footer = await chargerFragmentObjet("/HTMLBASE/02-footer.html");
    slot.appendChild(footer);
    appliquerRoutesSite(slot);
    window.LCDP_initialiserFooterMentionsLegales?.();
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

  function construireEndpointApi(cleModerne, cleLegacy, cleCourte, sousDomaineWorker) {
    const depuisConfig =
      (cleModerne ? CONFIG_PAGE?.[cleModerne] : "") ||
      (cleLegacy ? CONFIG_PAGE?.[cleLegacy] : "") ||
      (cleCourte ? CONFIG_PAGE?.[cleCourte] : "") ||
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

  function redirigerMembre(chemin) {
    window.location.href = construireUrlMembre(chemin);
  }

  function redirigerPublic(chemin) {
    window.location.href = construireUrlPublic(chemin);
  }

  function redirigerConnexionMembre(motif) {
    const chemin =
      "/ESPACE-PUBLIC/connexion-membre.html" +
      "?source=" + encodeURIComponent(SOURCE_PAGE) +
      "&session=" + encodeURIComponent(motif || "inactive");

    redirigerPublic(chemin);
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }

  function nettoyerPrenom(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60);
  }

  function nettoyerEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function lireCookie(nom) {
    return document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(nom + "="))
      ?.split("=")
      .slice(1)
      .join("=") || "";
  }

  function membreAbonne() {
    return Boolean(lireCookie("abonne"));
  }

  function valeurBooleenneVraie(valeur) {
    return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
  }
})();