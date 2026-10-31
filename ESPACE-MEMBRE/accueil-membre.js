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
      const promesseMenu = chargerFragmentObjet("/BOX/02-box-menu-bouton.html");
      initialiserFooter().catch((error) => {
        console.warn("Footer indisponible sur l’accueil membre :", error);
      });

      const [etat, fragmentMenu] = await Promise.all([
        promesseEtat,
        promesseMenu
      ]);

      if (!etat) return;

      etatMembre = etat;
      afficherEtatMembre(etatMembre);
      await initialiserMenuCentral(etatMembre, fragmentMenu);
      const contenu = document.getElementById("lcdp-accueil-contenu");
      if (contenu) {
        contenu.hidden = false;
        contenu.setAttribute("aria-busy", "false");
      }
      const attente = document.getElementById("lcdp-accueil-attente");
      if (attente) attente.style.display = "none";

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
    const ok = await afficherAlerte("Votre abonnement est suspendu (non payé). Vous allez être redirigé vers la page d’abonnement.");
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

    const fragment = await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html");
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

    const ok = await afficherAlerte("Vous allez être dirigé vers la page de paiement. La régularisation de votre abonnement se fait par carte bancaire uniquement.");
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

  async function initialiserMenuCentral(etat, fragmentPrecharge) {
    const slot = document.getElementById("lcdp-menu-central-slot");

    if (!slot) return;

    slot.innerHTML = "";
    slot.classList.add("lcdp-stack");

    const messageAccueil = document.getElementById("message-accueil-membre");
    if (messageAccueil) afficherMessageAccueil(messageAccueil, etat.prenommembre);

    const fragment = fragmentPrecharge || await chargerFragmentObjet("/BOX/02-box-menu-bouton.html");
    slot.appendChild(fragment);

    const liste = slot.querySelector("[data-lcdp-menu-bouton-list]");

    if (!liste) {
      throw new Error("Structure du menu bouton incomplète.");
    }

    liste.classList.add("lcdp-accueil-actions");

    const boutons = [
      {
        label: "Planifier",
        style: "lcdp-button-accueil lcdp-button-accueil-orange",
        action: () => gererBoutonAccueilMembre("planifier")
      },
      {
        label: "Mes accès",
        style: "lcdp-button-accueil lcdp-button-accueil-green",
        action: () => gererBoutonAccueilMembre("mes_acces")
      },
      {
        label: "Ma Clé",
        style: "lcdp-button-accueil lcdp-button-accueil-blue",
        action: () => gererBoutonAccueilMembre("ma_cle")
      }
    ];

    boutons.forEach((configuration, index) => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-button " + configuration.style;
      bouton.classList.add("lcdp-accueil-picto");
      const pictos = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="3" y="3" width="18" height="18" rx="4" ry="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="7" y="7" width="2.3" height="2.3" rx="0.4" fill="currentColor"/>
  <rect x="10.85" y="7" width="2.3" height="2.3" rx="0.4" fill="currentColor"/>
  <rect x="14.7" y="7" width="2.3" height="2.3" rx="0.4" fill="currentColor"/>
  <rect x="7" y="10.85" width="2.3" height="2.3" rx="0.4" fill="currentColor"/>
  <rect x="10.85" y="10.85" width="2.3" height="2.3" rx="0.4" fill="currentColor"/>
  <rect x="14.7" y="10.85" width="2.3" height="2.3" rx="0.4" fill="currentColor"/>
  <rect x="7" y="14.7" width="2.3" height="2.3" rx="0.4" fill="currentColor"/>
  <rect x="10.85" y="14.7" width="2.3" height="2.3" rx="0.4" fill="currentColor"/>
  <rect x="14.7" y="14.7" width="2.3" height="2.3" rx="0.4" fill="currentColor"/>
</svg>`,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="3" y="3" width="18" height="18" rx="4" ry="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 8.5h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 15.5h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
        '<img src="data:image/webp;base64,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" alt="" aria-hidden="true">'
      ];
      bouton.innerHTML = pictos[index];
      const libelle = document.createElement("span");
      libelle.textContent = configuration.label;
      bouton.appendChild(libelle);

      bouton.addEventListener("click", async () => {
        if (actionAccueilEnCours) return;
        actionAccueilEnCours = true;
        afficherAttenteNavigationAccueil();

        try {
          const issue = await configuration.action();
          // La page actuelle reste affichée si l'accès est refusé ou si un dialogue s'ouvre.
          if (issue !== "ouvert" && issue !== "non_connecte") {
            masquerAttenteNavigationAccueil();
          }
        } catch (error) {
          masquerAttenteNavigationAccueil();
          console.error(error);
          afficherAlerte(error.message || "Erreur technique. Merci de réessayer.").catch(console.error);
        }
      });

      liste.appendChild(bouton);
    });
  }

  function afficherAttenteNavigationAccueil() {
    const attente = document.getElementById("lcdp-navigation-attente");
    const slot = document.getElementById("lcdp-menu-central-slot");
    if (attente) attente.hidden = false;
    if (!slot) return;
    slot.setAttribute("aria-busy", "true");
    slot.querySelectorAll(".lcdp-accueil-actions > button").forEach((bouton) => {
      bouton.disabled = true;
    });
  }

  function masquerAttenteNavigationAccueil() {
    actionAccueilEnCours = false;
    const attente = document.getElementById("lcdp-navigation-attente");
    const slot = document.getElementById("lcdp-menu-central-slot");
    if (attente) attente.hidden = true;
    if (!slot) return;
    slot.setAttribute("aria-busy", "false");
    slot.querySelectorAll(".lcdp-accueil-actions > button").forEach((bouton) => {
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
    const fragment = await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html");
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
        }
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

    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
    slot.appendChild(fragment);

    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      throw new Error("Structure de l’alerte incomplète.");
    }

    texte.textContent = normaliserPonctuationAlerte(message);
    appliquerVarianteAlerteAccueilMembre(alerte, options.variante);

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", () => fermer(false));
      boutonOk.addEventListener("click", () => fermer(true));

      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) fermer(false);
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") fermer(false);
        },
        { once: true }
      );
    });
  }

  async function ouvrirDialogueBoutons(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html");
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

    const footer = await chargerFragmentObjet("/BOX/02-box-footer.html");
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