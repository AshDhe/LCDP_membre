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

  const PAGE_PAIEMENT_CB = construireUrlMembre("/ESPACE-MEMBRE/paiement-cb.html");
  const PAGE_ABONNEMENT_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/abonnement-membre.html");

  let pageInitialisee = false;
  let actionAccueilEnCours = false;
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
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) masquerAttenteNavigationAccueil();
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
      traiterRetourPaiementAccueil().catch((error) => {
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
    await afficherAlerte(message);
  }

  async function chargerEtatMembre() {
    if (!ENDPOINT_INDEX_MEMBRE) {
      throw new Error("Le service d’accueil membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
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
        ? "[Votre abonnement est annulé (non payé)]"
        : "[Votre abonnement est suspendu (non payé)]")
      : "";

    return {
      prenommembre: nettoyerPrenom(resultat.prenommembre),
      abonne: valeurBooleenneVraie(resultat.abonne),
      emailparrain: nettoyerEmail(resultat.emailparrain),
      parrainRenseigne: valeurBooleenneVraie(resultat.parrainRenseigne),
      aReservationEnCours: valeurBooleenneVraie(resultat.aReservationEnCours || resultat.aReservationValidable),
      reservationEnCours: resultat.reservationEnCours || resultat.reservationValidable || null,
      statutabo: abonnementEnCours?.statutabo || "",
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
    const premiereLigne = document.createTextNode("Votre compte La Clé du Parc");
    const sautLigne = document.createElement("br");
    const deuxiemeLigne = document.createElement("span");
    deuxiemeLigne.textContent = prenom ? "Bonjour " + prenom : "Bonjour";
    deuxiemeLigne.style.fontWeight = "400";
    element.replaceChildren(premiereLigne, sautLigne, deuxiemeLigne);
  }

  function afficherMentionAbonnementMembre(etat) {
    const mention = document.getElementById("mention-statut-membre");
    if (!mention || !mention.parentNode) return;

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
      mention.insertAdjacentElement("afterend", bloc);
    }

    bloc.textContent = texteMention;
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

  async function redirigerVersAbonnementPourRegularisation() {
    const ok = await afficherAlerte("Votre abonnement est suspendu (non payé). Vous allez être redirigé vers la page d’abonnement.", { mode: "confirmation" });
    if (!ok) return;

    window.location.href = PAGE_ABONNEMENT_MEMBRE;
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
      await afficherAlerte("Aucune échéance non payée.");
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

    const ok = await afficherAlerte("Vous allez être dirigé vers la page de paiement. La régularisation de votre abonnement se fait par carte bancaire uniquement.", { mode: "confirmation" });
    if (!ok) return;

    const separateur = PAGE_PAIEMENT_CB.includes("?") ? "&" : "?";
    window.location.href = PAGE_PAIEMENT_CB + separateur + "orderid=" + encodeURIComponent(orderid) + "&echeance=" + encodeURIComponent(String(numeroEcheance || 1)) + "&source=suspension";
  }


  function messageDelaiPaiementDepasse() {
    return "Le délai de paiement est dépassé. Cet abonnement est annulé.";
  }

  function paiementSuspensionDelaiDepasse(paiement) {
    if (!paiement || typeof paiement !== "object") return false;

    if (valeurBooleenneVraie(paiement.delaiPaiementDepasse) || valeurBooleenneVraie(paiement.abonnementAnnuleNonPaye)) {
      return true;
    }

    return delaiPaiementDepasseDepuisFin(paiement.fin || paiement.dateFin || paiement.finabo || "");
  }

  function delaiPaiementDepasseDepuisFin(value) {
    const fin = dateIsoPaiementDepuisValeur(value);

    if (!fin) return false;

    const maintenantParis = dateHeureParisPaiement(new Date());

    if (maintenantParis.dateIso > fin) return true;
    if (maintenantParis.dateIso < fin) return false;

    return maintenantParis.heure >= 14;
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

    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js");
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
      const styles = {
        position: "fixed", inset: "0", width: "100%", height: "100dvh",
        minHeight: "100vh", zIndex: "2147483647", boxSizing: "border-box",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", background: "var(--lcdp-color-surface, #fff)",
        padding: "16px"
      };
      for (const [propriete, valeur] of Object.entries(styles)) {
        attente.style.setProperty(propriete.replace(/[A-Z]/g, lettre => "-" + lettre.toLowerCase()), valeur, "important");
      }
      attente.hidden = false;
    }
    if (!slot) return;
    slot.setAttribute("aria-busy", "true");
    slot.querySelectorAll(":scope > button[data-lcdp-member-action]").forEach((bouton) => {
      bouton.disabled = true;
    });
  }

  function masquerAttenteNavigationAccueil() {
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

  async function gererBoutonAccueilMembre(action) {
    const issue = await window.LCDP_AccueilDroits.executer(action, {
      avantMaCle: preparerIdentiteNavigateurCle,
      surNavigateurNonProprietaire: proposerTransfertNavigateur
    });
    if (issue === "non_connecte") redirigerConnexionMembre("inactive");
    return issue;
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
    const choix = await ouvrirDialogueBoutons({
      titre: "Navigateur propriétaire",
      texte: "Ce navigateur n’est pas votre navigateur propriétaire. Le changement retirera l’autorisation de Ma clé à l’ancien navigateur.",
      boutons: [{ label: "Utiliser ce navigateur à la place", valeur: "transferer" }]
    });
    if (choix !== "transferer") return;
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
        await afficherAlerte(resultat?.message || "La réponse n’a pas pu être confirmée. Réessayez plus tard.");
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
      await afficherAlerte("Vous devez être membre abonné pour utiliser la fonction " + fonction);
      return;
    }

    if (suspensionPourNonPaiement(etat)) {
      await redirigerVersAbonnementPourRegularisation();
      return;
    }

    if (etat.abonnementSuspendu === true) {
      await afficherAlerte("Votre abonnement est suspendu.");
      return;
    }

    redirigerMembre(chemin);
  }

  async function gererEtreInvite(etat) {
    if (!etat.parrainRenseigne) {
      await afficherAlerte('Renseignez votre parrain dans la rubrique "Mes informations"');
      return;
    }

    await afficherAlerte("Votre parrain peut vous inviter depuis son espace.");
  }

  async function gererDeconnexion() {
    const confirmation = await ouvrirDialogueBoutons({
      titre: "Confirmer la déconnexion",
      texte: "Voulez-vous vous déconnecter de votre espace membre ?",
      boutons: [
        {
          label: "Confirmer",
          valeur: "confirmer",
          style: "lcdp-button-primary"
        },
        { label: "Annuler", valeur: "annuler", style: "lcdp-button-secondary" }
      ]
    });

    if (confirmation !== "confirmer") return;

    if (!ENDPOINT_DECONNEXION_MEMBRE) {
      throw new Error("Le service de déconnexion membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_DECONNEXION_MEMBRE + "/deconnexion", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const resultat = await reponse.json().catch(() => null);

    if (!reponse.ok || !resultat || resultat.success !== true) {
      throw new Error(messageErreurApi(resultat, "Impossible de fermer la session membre."));
    }

    redirigerPublic("/ESPACE-PUBLIC/accueil-public.html");
  }


  function normaliserPonctuationAlerte(message) {
    const texte = String(message || "").trim();

    if (!texte) return "";
    if (/[.!?…]$/.test(texte)) return texte;

    return texte + ".";
  }

  function appliquerVarianteAlerteAccueilMembre(alerte, variante) {
    if (variante === "ouvrir") alerte.classList.add("lcdp-alerte-accueil-ouvrir");
  }

  async function afficherAlerte(message, options = {}) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return false;
    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-alerte.html");
    slot.appendChild(fragment);
    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");
    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      throw new Error("Structure de l’alerte incomplète.");
    }

    const confirmation = options.mode === "confirmation";
    texte.textContent = normaliserPonctuationAlerte(message);
    alerte.dataset.lcdpDialogueType = confirmation ? "confirmation" : "information";
    boutonOk.textContent = confirmation ? "Confirmer" : "Fermer";
    // Information = une seule action « Fermer », sans croix.
    boutonFermer.hidden = !confirmation || options.sansCroix === true;
    const actions = document.createElement("div");
    actions.className = "lcdp-dialogue-actions";
    boutonOk.before(actions);
    actions.appendChild(boutonOk);

    if (confirmation) {
      const annuler = document.createElement("button");
      annuler.type = "button";
      annuler.className = "lcdp-button lcdp-button-secondary";
      annuler.textContent = "Annuler";
      actions.prepend(annuler);
      annuler.dataset.lcdpActionAnnuler = "true";
    }

    return new Promise((resolve) => {
      let resolu = false;
      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur);
      }
      actions.querySelector('[data-lcdp-action-annuler="true"]')?.addEventListener("click", () => fermer(false));
      boutonFermer.addEventListener("click", () => fermer(false));
      boutonOk.addEventListener("click", () => fermer(true));
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte && confirmation && !boutonFermer.hidden) fermer(false);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && confirmation && !boutonFermer.hidden) fermer(false);
      }, { once: true });
    });
  }

  async function ouvrirDialogueBoutons(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-bouton.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = slot.querySelector("[data-lcdp-dialogue-title]");
    const texte = slot.querySelector("[data-lcdp-dialogue-text]");
    const actions = slot.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      throw new Error("Structure de dialogue bouton incomplète.");
    }

    titre.textContent = options.titre || "";
    texte.textContent = options.texte || "";
    actions.innerHTML = "";

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur || null);
      }

      (options.boutons || []).forEach((configuration) => {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-button " + (configuration.style || "lcdp-button-primary");
        bouton.textContent = configuration.label || "Valider";

        bouton.addEventListener("click", () => {
          fermer(configuration.valeur || configuration.label || true);
        });

        actions.appendChild(bouton);
      });

      boutonFermer.addEventListener("click", () => fermer(null));

      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) fermer(null);
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") fermer(null);
        },
        { once: true }
      );
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