(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "reserver-membre";
  const DOSSIER_IMAGES_PARC_OBJET = "/IMAG/PARC";
  const NOM_IMAGE_CARD_PARC = "card1.webp";
  const CHEMIN_PICTOWAIT = "/BOX/pictowait.gif";

  const CLES_PLAGES_AFFICHAGE = [
    "plage1",
    "plage2",
    "plage3",
    "plage4",
    "plage5"
  ];

  const CLES_PLAGES_RESERVATION_ACTUELLES = [
    "plage1",
    "plage2",
    "plage3"
  ];

  const COULEURS_CSS_PLANNING = {
    "gris-moyen": "#9ca09e",
    "bleu-clair": "#cfe3f7",
    "bleu-fonce": "#2f6fb3",
    "violet": "#7b5aa6",
    "orange-clair": "#ffd8a8",
    "orange-fonce": "#f2a23a"
  };

  const ENDPOINT_NOUVELLE_DATE_MEMBRE = construireEndpointApi(
    "workerNouvelleDateMembreUrl",
    "WORKER_NOUVELLE_DATE_MEMBRE_URL",
    "nouvelle-date-membre-api"
  );

  const ENDPOINT_FLUXM = construireEndpointApi(
    "workerFluxmUrl",
    "WORKER_FLUXM_URL",
    "fluxm-api"
  );

  const ENDPOINT_PLANNING_MEMBRE = construireEndpointApi(
    "workerPlanningMembreUrl",
    "WORKER_PLANNING_MEMBRE_URL",
    "planning-membre-api"
  );

  const ENDPOINT_INDEX_MEMBRE = construireEndpointApi(
    "workerIndexMembreUrl",
    "WORKER_INDEX_MEMBRE_URL",
    "index-membre-api"
  );

  const ENDPOINT_PLANNING_PARC = construireEndpointApi(
    "workerPlanningParcUrl",
    "WORKER_PLANNING_PARC_URL",
    "planning-parc-api"
  );

  const ENDPOINT_PARTAGE_PAGE = construireEndpointApi(
    "workerPartagePageUrl",
    "WORKER_PARTAGE_PAGE_URL",
    "partage-pages-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_PLANNING_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/planning-membre.html");
  const PAGE_PAIEMENT_CB = construireUrlMembre("/ESPACE-MEMBRE/paiement-cb.html");

  let pageInitialisee = false;
  let etatMembre = { abonne: false, abonnementSuspendu: false, abonnementAnnuleNonPaye: false, paiementSuspension: null, statudaConnue: false, statuda: null, datenext: null };

  const etatPage = {
    departement: "",
    parcs: [],
    reservationsMembre: [],
    templateListeParcs: null,
    templateCardParc: null,
    templateJourMois: null,
    templateHeureJour: null,
    templateFicheParc: null,
    templateMapParc: null,
    templateShiftDetailParc: null,
    calendrierMoisActif: null,
    shiftDetailParc: null
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    if (pageInitialisee) return;
    pageInitialisee = true;

    document.body.classList.add("lcdp-page-reserver");
    afficherPictowaitListeParcs(
      "Construction de la liste des parcs…",
      false
    );

    try {
      const promesseFooter = initialiserFooter()
        .catch((error) => {
          console.warn(
            "Footer indisponible sur la page Réserver.",
            error
          );
        });

      await initialiserBandeau();
      etatMembre = await chargerEtatMembre();
      afficherEtatMembre(etatMembre);
      await actualiserBurgerMembre(etatMembre.abonne);
      await initialiserListeParcs();
      await initialiserCommandeBarReserver();
      initialiserBoutonDepartementPrincipal();
      initialiserActionsListeParcs();
      document.addEventListener("click", gererClicDocument);
      await chargerReservationsMembrePourBlocages();
      await chargerParcsDepartementMembre();
      await promesseFooter;

      initialiserActionsPersistantesReserver();
      actualiserEspaceFooterReserver();
    } catch (error) {
      console.error("Erreur réserver membre :", error);
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function chargerEtatMembre() {
    if (!ENDPOINT_INDEX_MEMBRE) {
      throw new Error("Le service d’état membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return { abonne: false, abonnementSuspendu: false, abonnementAnnuleNonPaye: false, paiementSuspension: null, statudaConnue: false, statuda: null, datenext: null };
    }

    if (!reponse.ok || !resultat || !reponseApiOk(resultat)) {
      throw new Error(messageErreurApi(resultat, "Impossible de vérifier l’état membre."));
    }

    return {
      abonne: valeurBooleenneVraie(resultat.abonne),
      abonnementSuspendu: valeurBooleenneVraie(resultat.abonnementSuspendu || resultat.suspendu),
      abonnementAnnuleNonPaye: valeurBooleenneVraie(resultat.abonnementAnnuleNonPaye || resultat.abonnementAnnule || resultat.annuleNonPaye),
      paiementSuspension: resultat.paiementSuspension || resultat.paiementRegularisation || null,
      statudaConnue: Object.prototype.hasOwnProperty.call(resultat, "statuda"),
      statuda: normaliserStatudaReservation(resultat.statuda),
      datenext: resultat.datenext || null
    };
  }

  function afficherEtatMembre(etat) {
    let mention = document.getElementById("mention-statut-membre");

    if (!mention) {
      const titre = document.querySelector(".lcdp-title-page-center");
      if (!titre || !titre.parentNode) return;

      mention = document.createElement("p");
      mention.id = "mention-statut-membre";
      mention.className = "lcdp-mention-connexion";
      titre.insertAdjacentElement("afterend", mention);
    }

    mention.textContent = etat && etat.abonne ? "MEMBRE ABONNÉ" : "MEMBRE INVITÉ";
    afficherSuspensionMembre(etat);
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
      ? "[Votre abonnement est annulé (non payé)]"
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

  function messageBlocageNouvelleDate(etat) {
    if (abonnementAnnuleNonPaye(etat)) {
      return "Votre abonnement est annulé (non payé).";
    }

    if (etat && etat.abonnementSuspendu === true) {
      return "Votre abonnement est suspendu (non payé).";
    }

    if (!etat || (etat.abonne !== true && !membreAbonne())) {
      const statuda = normaliserStatudaReservation(etat?.statuda);

      if (statuda === "encours") {
        return "Vous devez être membre abonné pour réserver. Votre DA est en cours.";
      }

      if (statuda === "non") {
        return "Vous devez être membre abonné pour réserver. Vous pouvez transmettre votre DA à partir du " + formaterDateDaReservation(etat?.datenext) + ".";
      }

      if (!statuda) {
        return `Vous devez être membre abonné pour réserver. Cliquez sur le lien Abonnement du "burger" menu de votre espace membre pour devenir membre abonné. Sous réserve de la validation préalable de votre première demande d'abonnement (DA) par le Club.`;
      }

      return "Vous devez être membre abonné pour réserver une date.";
    }

    return "";
  }

  function normaliserStatudaReservation(value) {
    const statut = String(value || "").trim().toLowerCase();

    return ["encours", "oui", "non"].includes(statut) ? statut : null;
  }

  function formaterDateDaReservation(value) {
    if (!value) return "une date communiquée par le club";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

    return date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function abonnementAnnuleNonPaye(etat) {
    if (!etat) return false;

    if (etat.abonnementAnnuleNonPaye === true) {
      return true;
    }

    return paiementSuspensionDelaiDepasse(etat.paiementSuspension);
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

  function valeurBooleenneVraie(valeur) {
    return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
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

  async function initialiserListeParcs() {
    const slot = document.getElementById("lcdp-liste-card-parcs-slot");

    if (!slot) {
      throw new Error("Slot liste des parcs introuvable.");
    }

    afficherPictowaitListeParcs(
      "Construction de la liste des parcs…",
      false
    );

    const fragmentListe = await chargerFragmentObjet(
      "/BOX/04-box-liste-card.html"
    );
    const listeCard = fragmentListe.querySelector(
      "[data-lcdp-box-liste-card]"
    );

    if (!listeCard) {
      throw new Error("Structure List Card parcs incomplète.");
    }

    listeCard.classList.add("lcdp-box-liste-card--encadree");
    etatPage.templateListeParcs = listeCard;

    const fragmentCard = await chargerFragmentObjet("/BOX/04-box-card-parc.html");
    etatPage.templateCardParc = fragmentCard.querySelector("[data-lcdp-box-card-parc]");

    const fragmentFicheParc = await chargerFragmentObjet("/BOX/04-box-fiche-parc.html");
    etatPage.templateFicheParc = fragmentFicheParc.querySelector("[data-lcdp-box-fiche-parc]");

    const fragmentMapParc = await chargerFragmentObjet("/BOX/04-box-card-map-parc.html");
    etatPage.templateMapParc = fragmentMapParc.querySelector("[data-lcdp-box-card-map-parc]");

    const fragmentShiftDetailParc = await chargerFragmentObjet("/BOX/04-box-shift-detail-parc.html");
    etatPage.templateShiftDetailParc = fragmentShiftDetailParc.querySelector("[data-lcdp-box-shift-detail-parc]");

    const fragmentJour = await chargerFragmentObjet("/BOX/04-box-card-jour-in-calendrier-mois.html");
    etatPage.templateJourMois = fragmentJour.querySelector("[data-lcdp-card-jour-mois]");

    const fragmentHeure = await chargerFragmentObjet("/BOX/04-box-card-heure-in-calendrier-jour.html");
    etatPage.templateHeureJour = fragmentHeure.querySelector("[data-lcdp-card-heure-jour]");

    if (
      !etatPage.templateListeParcs ||
      !etatPage.templateCardParc ||
      !etatPage.templateFicheParc ||
      !etatPage.templateMapParc ||
      !etatPage.templateShiftDetailParc ||
      !etatPage.templateJourMois ||
      !etatPage.templateHeureJour
    ) {
      throw new Error(
        "Templates liste, parc, fiche parc, carte parc, " +
        "shift détail parc, jour ou heure introuvables."
      );
    }
  }

  async function initialiserCommandeBarReserver() {
    const slot = document.getElementById("lcdp-commande-bar-reserver-slot");
    const boutonDepartement = document.getElementById("bouton-changer-departement");
    const boutonIa = document.getElementById("bouton-demander-ia");

    if (!slot || !boutonDepartement || !boutonIa) {
      throw new Error("Structure Command Bar réserver incomplète.");
    }

    const fragment = await chargerFragmentObjet("/BOX/04-box-commande-bar.html");
    const commandeBar = fragment.querySelector("[data-lcdp-box-commande-bar]");
    const actions = fragment.querySelector("[data-lcdp-commande-bar-actions]");

    if (!commandeBar || !actions) {
      throw new Error("Objet Command Bar incomplet.");
    }

    commandeBar.classList.add("lcdp-box-commande-bar--encadree");

    actions.appendChild(boutonDepartement);
    actions.appendChild(boutonIa);

    slot.replaceChildren(commandeBar);
    slot.hidden = true;
    slot.setAttribute("aria-hidden", "true");
  }

  function afficherCommandeBarReserver() {
    const slot = document.getElementById(
      "lcdp-commande-bar-reserver-slot"
    );

    if (
      !slot ||
      !slot.querySelector("[data-lcdp-box-commande-bar]")
    ) {
      return;
    }

    slot.hidden = false;
    slot.setAttribute("aria-hidden", "false");
  }

  function initialiserBoutonDepartementPrincipal() {
    const boutonDepartement = document.getElementById("bouton-changer-departement");
    const boutonIa = document.getElementById("bouton-demander-ia");

    if (boutonDepartement) {
      boutonDepartement.addEventListener("click", () => {
        ouvrirChoixDepartement().catch(console.error);
      });
    }

    if (boutonIa) {
      boutonIa.addEventListener("click", () => {
        afficherAlerte("La recherche avec l’IA sera traitée après la réservation classique.").catch(console.error);
      });
    }
  }

  function initialiserActionsPersistantesReserver() {
    const boutonDepartement = document.getElementById("bouton-changer-departement");
    const boutonIa = document.getElementById("bouton-demander-ia");

    if (!boutonDepartement || !boutonIa) return;
    if (document.getElementById("lcdp-actions-footer-reserver")) return;

    injecterStylesActionsPersistantesReserver();

    const slotActionsFooter = obtenirOuCreerSlotActionsFooterReserver();

    if (!slotActionsFooter) return;

    slotActionsFooter.innerHTML = "";
    slotActionsFooter.hidden = true;
    slotActionsFooter.setAttribute("aria-hidden", "true");

    const barreFooter = document.createElement("div");
    barreFooter.id = "lcdp-actions-footer-reserver";
    barreFooter.className = "lcdp-actions-footer-reserver";
    barreFooter.hidden = true;
    barreFooter.setAttribute("aria-hidden", "true");
    barreFooter.appendChild(creerContenuActionsPersistantesReserver(boutonDepartement, boutonIa));
    slotActionsFooter.appendChild(barreFooter);

    const cible = trouverBlocActionsInitialesReserver(boutonDepartement, boutonIa);
    let actionsInitialesVisibles = true;

    function lightboxOuverte() {
      const slotLightbox = document.getElementById("lcdp-lightbox-slot");
      return Boolean(slotLightbox && slotLightbox.children.length > 0);
    }

    function actualiserAffichageBarre() {
      const afficher = actionsInitialesVisibles !== true && !lightboxOuverte();

      barreFooter.hidden = !afficher;
      barreFooter.setAttribute("aria-hidden", afficher ? "false" : "true");

      slotActionsFooter.hidden = !afficher;
      slotActionsFooter.setAttribute("aria-hidden", afficher ? "false" : "true");
      document.body.classList.toggle("lcdp-reserver-actions-footer-active", afficher);
      window.requestAnimationFrame(actualiserEspaceFooterReserver);
    }

    function actualiserDepuisPositionBoutons() {
      if (!cible) {
        actionsInitialesVisibles = true;
        actualiserAffichageBarre();
        return;
      }

      const rect = cible.getBoundingClientRect();
      const hauteurFenetre = window.innerHeight || document.documentElement.clientHeight || 0;
      const marge = 4;

      actionsInitialesVisibles = rect.bottom > marge && rect.top < (hauteurFenetre - marge);
      actualiserAffichageBarre();
    }

    window.addEventListener("scroll", actualiserDepuisPositionBoutons, { passive: true });
    window.addEventListener("resize", () => {
      actualiserDepuisPositionBoutons();
      actualiserEspaceFooterReserver();
    });
    window.addEventListener("orientationchange", () => {
      window.setTimeout(actualiserDepuisPositionBoutons, 180);
    });

    const slotLightbox = document.getElementById("lcdp-lightbox-slot");

    if (slotLightbox && "MutationObserver" in window) {
      const observateurLightbox = new MutationObserver(actualiserDepuisPositionBoutons);
      observateurLightbox.observe(slotLightbox, { childList: true });
    }

    actualiserDepuisPositionBoutons();
    actualiserEspaceFooterReserver();
    window.setTimeout(() => {
      actualiserDepuisPositionBoutons();
      actualiserEspaceFooterReserver();
    }, 250);
  }

  function actualiserEspaceFooterReserver() {
    const footer = document.querySelector("#lcdp-footer-slot .lcdp-box-footer");
    const barre = document.getElementById("lcdp-actions-footer-reserver");

    const hauteurFooter = Math.ceil(footer?.getBoundingClientRect?.().height || 56);

    document.documentElement.style.setProperty(
      "--lcdp-reserver-footer-height",
      hauteurFooter + "px"
    );

    if (barre && barre.hidden !== true) {
      const hauteurActions = Math.ceil(barre.getBoundingClientRect().height || 0);

      if (hauteurActions > 0) {
        document.documentElement.style.setProperty(
          "--lcdp-reserver-actions-footer-height",
          hauteurActions + "px"
        );
      }
    }
  }

  function obtenirOuCreerSlotActionsFooterReserver() {
    const slotPageFooter = document.getElementById("lcdp-footer-slot");

    if (!slotPageFooter) return null;

    let slot = slotPageFooter.querySelector("[data-lcdp-wraper-footer-actions]");

    if (slot) return slot;

    slot = document.createElement("div");
    slot.className = "lcdp-box-wraper-footer__actions";
    slot.dataset.lcdpWraperFooterActions = "";
    slot.setAttribute("aria-hidden", "true");
    slot.hidden = true;

    slotPageFooter.insertBefore(slot, slotPageFooter.firstChild);

    return slot;
  }

  function creerContenuActionsPersistantesReserver(boutonDepartement, boutonIa) {
    const contenu = document.createElement("div");
    contenu.className = "lcdp-actions-persistantes-reserver__inner";

    const boutonStickyDepartement = document.createElement("button");
    boutonStickyDepartement.type = "button";
    boutonStickyDepartement.className = "lcdp-button lcdp-button-primary lcdp-actions-persistantes-reserver__button";
    boutonStickyDepartement.textContent = "Département";
    boutonStickyDepartement.setAttribute("aria-label", "Changer de département");
    boutonStickyDepartement.title = "Changer de département";
    boutonStickyDepartement.addEventListener("click", (event) => {
      event.preventDefault();
      boutonDepartement.click();
    });

    const boutonStickyIa = document.createElement("button");
    boutonStickyIa.type = "button";
    boutonStickyIa.className = "lcdp-button lcdp-button-orange lcdp-actions-persistantes-reserver__button";
    boutonStickyIa.textContent = "Recherche IA";
    boutonStickyIa.setAttribute("aria-label", "Rechercher avec l’IA");
    boutonStickyIa.title = "Rechercher avec l’IA";
    boutonStickyIa.addEventListener("click", (event) => {
      event.preventDefault();
      boutonIa.click();
    });

    contenu.appendChild(boutonStickyDepartement);
    contenu.appendChild(boutonStickyIa);

    return contenu;
  }

  function trouverBlocActionsInitialesReserver(boutonDepartement, boutonIa) {
    const candidats = [
      boutonDepartement.closest(".lcdp-box-menu-bouton__list"),
      boutonDepartement.parentElement,
      boutonDepartement.parentElement ? boutonDepartement.parentElement.parentElement : null,
      boutonDepartement.closest("[data-lcdp-actions-reserver]"),
      boutonDepartement.closest(".lcdp-page-actions"),
      boutonDepartement.closest(".lcdp-box-formulaire__actions"),
      boutonDepartement.closest(".lcdp-stack-medium"),
      boutonDepartement.closest(".lcdp-stack-large")
    ].filter(Boolean);

    const blocDirect = candidats.find((element) => element.contains(boutonDepartement) && element.contains(boutonIa));

    if (blocDirect) return blocDirect;

    let noeud = boutonDepartement;

    while (noeud && noeud !== document.body) {
      if (noeud.contains(boutonIa)) return noeud;
      noeud = noeud.parentElement;
    }

    return boutonDepartement;
  }

  function injecterStylesActionsPersistantesReserver() {
    if (document.querySelector('style[data-lcdp-actions-persistantes-reserver="true"]')) return;

    const style = document.createElement("style");
    style.dataset.lcdpActionsPersistantesReserver = "true";
    style.textContent = `
      .lcdp-actions-footer-reserver[hidden] {
        display: none !important;
      }

      .lcdp-actions-footer-reserver {
        width: 100%;
        box-sizing: border-box;
      }

      .lcdp-actions-footer-reserver .lcdp-actions-persistantes-reserver__inner {
        width: min(620px, calc(100vw - 32px));
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--lcdp-space-2);
        padding: 8px;
        border: 1px solid var(--lcdp-color-border);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 10px 30px rgba(31, 42, 36, 0.14);
        box-sizing: border-box;
      }

      .lcdp-actions-persistantes-reserver__button.lcdp-button {
        flex: 1 1 0;
        min-width: 0;
        min-height: 40px;
        margin: 0;
        padding: 0.55rem 0.75rem;
        border-radius: 999px;
        font-size: 0.9rem;
        line-height: 1.1;
        white-space: nowrap;
      }

      .lcdp-actions-persistantes-reserver__button.lcdp-button-orange {
        background: var(--lcdp-color-orange);
        border-color: var(--lcdp-color-orange);
        color: var(--lcdp-color-text);
      }

      .lcdp-actions-persistantes-reserver__button.lcdp-button-orange:hover {
        background: var(--lcdp-color-orange-hover);
        border-color: var(--lcdp-color-orange-hover);
        color: var(--lcdp-color-text);
      }

      @media (max-width: 767px) {
        .lcdp-actions-footer-reserver .lcdp-actions-persistantes-reserver__inner {
          width: min(calc(100vw - 20px), 520px);
        }
      }

      @media (min-width: 768px) {
        .lcdp-actions-persistantes-reserver__button.lcdp-button {
          max-width: 260px;
          min-height: 42px;
          padding: 0.6rem 1rem;
          font-size: 0.95rem;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function initialiserActionsListeParcs() {
    const zoneActions = etatPage.templateListeParcs?.querySelector(
      "[data-lcdp-liste-card-actions]"
    );

    if (!zoneActions) return;

    zoneActions.innerHTML = "";
  }

  async function chargerReservationsMembrePourBlocages() {
    if (!ENDPOINT_PLANNING_MEMBRE) {
      etatPage.reservationsMembre = [];
      return;
    }

    try {
      const reponse = await fetch(ENDPOINT_PLANNING_MEMBRE + "/mes-reservations", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        etatPage.reservationsMembre = [];
        console.warn("Réservations membre indisponibles pour le blocage front.", data);
        return;
      }

      etatPage.reservationsMembre = Array.isArray(data.reservations) ? data.reservations : [];
    } catch (error) {
      etatPage.reservationsMembre = [];
      console.warn("Réservations membre indisponibles pour le blocage front.", error);
    }
  }

  async function ouvrirChoixDepartement() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Changer de département",
      champs: [
        {
          id: "departement-recherche-parc",
          name: "dptmt",
          label: "Département",
          type: "text",
          inputmode: "numeric",
          autocomplete: "off",
          required: true
        }
      ]
    });

    if (!resultat) return;

    const departement = nettoyerDepartement(resultat.dptmt);

    if (!departement) {
      await afficherAlerte("Le département est obligatoire.");
      return;
    }

    await chargerParcsDepartement(departement);
  }

  function afficherPictowaitListeParcs(
    message,
    conserverListe
  ) {
    const slot = document.getElementById(
      "lcdp-liste-card-parcs-slot"
    );

    if (!slot) return;

    const attenteExistante = slot.querySelector(
      "[data-lcdp-pictowait]"
    );

    if (attenteExistante) {
      attenteExistante.remove();
    }

    const attente = document.createElement("div");
    attente.className = "lcdp-pictowait";
    attente.dataset.lcdpPictowait = "";
    attente.setAttribute("role", "status");
    attente.setAttribute("aria-live", "polite");

    if (conserverListe === true) {
      attente.classList.add("lcdp-pictowait--avec-liste");
    }

    const image = document.createElement("img");
    image.className = "lcdp-pictowait__image";
    image.src = construireUrlObjet(CHEMIN_PICTOWAIT);
    image.alt = "";
    image.width = 56;
    image.height = 56;
    image.decoding = "async";
    image.setAttribute("aria-hidden", "true");

    attente.setAttribute(
      "aria-label",
      message || "Chargement en cours"
    );

    attente.appendChild(image);

    if (conserverListe === true && slot.children.length > 0) {
      slot.prepend(attente);
    } else {
      slot.replaceChildren(attente);
    }

    slot.hidden = false;
    slot.setAttribute("aria-hidden", "false");
  }

  function masquerPictowaitListeParcs() {
    const attente = document.querySelector(
      "#lcdp-liste-card-parcs-slot [data-lcdp-pictowait]"
    );

    if (attente) {
      attente.remove();
    }
  }

  function construireListeParcsPreparee(parcs, departement) {
    if (!etatPage.templateListeParcs) {
      throw new Error("Template de liste des parcs indisponible.");
    }

    const listeCard = etatPage.templateListeParcs.cloneNode(true);
    const titre = listeCard.querySelector(
      "[data-lcdp-liste-card-title]"
    );
    const zoneListe = listeCard.querySelector(
      "[data-lcdp-liste-card-list]"
    );
    const zoneMessage = listeCard.querySelector(
      "[data-lcdp-liste-card-message]"
    );
    const zoneActions = listeCard.querySelector(
      "[data-lcdp-liste-card-actions]"
    );

    if (!titre || !zoneListe || !zoneMessage) {
      throw new Error("Structure de la liste des parcs incomplète.");
    }

    titre.textContent =
      "Parcs dans le " + (departement || "département");
    zoneListe.innerHTML = "";

    if (zoneActions) {
      zoneActions.innerHTML = "";
    }

    if (!Array.isArray(parcs) || parcs.length < 1) {
      zoneMessage.hidden = false;
      zoneMessage.textContent =
        "Aucun parc trouvé pour ce département";
      zoneMessage.dataset.lcdpMessageType = "information";
      return listeCard;
    }

    zoneMessage.hidden = true;
    zoneMessage.textContent = "";
    delete zoneMessage.dataset.lcdpMessageType;

    parcs.forEach((parc) => {
      zoneListe.appendChild(creerCardParc(parc));
    });

    return listeCard;
  }

  function construireListeParcsErreur(message) {
    const listeCard = construireListeParcsPreparee(
      [],
      etatPage.departement
    );
    const zoneMessage = listeCard.querySelector(
      "[data-lcdp-liste-card-message]"
    );

    if (zoneMessage) {
      zoneMessage.hidden = false;
      zoneMessage.textContent = String(message || "").trim();
      zoneMessage.dataset.lcdpMessageType = "erreur";
    }

    return listeCard;
  }

  function publierListeParcs(listeCard) {
    const slot = document.getElementById(
      "lcdp-liste-card-parcs-slot"
    );

    if (!slot || !listeCard) {
      return;
    }

    slot.replaceChildren(listeCard);
    slot.hidden = false;
    slot.setAttribute("aria-hidden", "false");

    afficherCommandeBarReserver();
  }

  function listeParcsDejaVisible() {
    const slot = document.getElementById(
      "lcdp-liste-card-parcs-slot"
    );

    return Boolean(
      slot &&
      slot.hidden !== true &&
      slot.querySelector("[data-lcdp-box-liste-card]")
    );
  }

  async function chargerParcsDepartementMembre() {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      publierListeParcs(
        construireListeParcsErreur(
          "Le service de réservation membre n’est pas configuré."
        )
      );
      return;
    }

    try {
      const reponse = await fetch(
        ENDPOINT_NOUVELLE_DATE_MEMBRE + "/autour-de-moi",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Accept": "application/json"
          }
        }
      );

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(
          messageErreurApi(
            data,
            "Impossible de charger les parcs du département."
          )
        );
      }

      const departement = String(data.departement || "");
      const parcs = Array.isArray(data.parcs) ? data.parcs : [];
      const listePreparee = construireListeParcsPreparee(
        parcs,
        departement
      );

      etatPage.departement = departement;
      etatPage.parcs = parcs;

      publierListeParcs(listePreparee);
    } catch (error) {
      console.error(
        "Erreur chargement parcs du département membre :",
        error
      );

      publierListeParcs(
        construireListeParcsErreur(
          error.message ||
          "Erreur technique. Merci de réessayer."
        )
      );
    }
  }

  async function chargerParcsDepartement(departement) {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      await afficherAlerte(
        "Le service de réservation membre n’est pas configuré."
      );
      return;
    }

    afficherPictowaitListeParcs(
      "Construction de la liste des parcs…",
      listeParcsDejaVisible()
    );

    try {
      const reponse = await fetch(
        ENDPOINT_NOUVELLE_DATE_MEMBRE +
        "/departement?dptmt=" +
        encodeURIComponent(departement),
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Accept": "application/json"
          }
        }
      );

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(
          messageErreurApi(
            data,
            "Impossible de charger les parcs de ce département."
          )
        );
      }

      const departementRecu = String(
        data.departement || departement
      );
      const parcs = Array.isArray(data.parcs) ? data.parcs : [];
      const listePreparee = construireListeParcsPreparee(
        parcs,
        departementRecu
      );

      etatPage.departement = departementRecu;
      etatPage.parcs = parcs;

      publierListeParcs(listePreparee);
    } catch (error) {
      console.error(
        "Erreur chargement parcs département :",
        error
      );

      const message =
        error.message ||
        "Erreur technique. Merci de réessayer.";

      if (listeParcsDejaVisible()) {
        masquerPictowaitListeParcs();
        await afficherAlerte(message);
        return;
      }

      publierListeParcs(
        construireListeParcsErreur(message)
      );
    }
  }

  function afficherTitreListe() {
    const titre = document.querySelector("[data-lcdp-liste-card-title]");

    if (!titre) return;

    titre.textContent = "Parcs dans le " + (etatPage.departement || "département");
  }

  function afficherParcs(parcs) {
    const zoneListe = obtenirZoneListe();

    if (!zoneListe) return;

    zoneListe.innerHTML = "";

    if (!Array.isArray(parcs) || !parcs.length) {
      afficherMessageListe("Aucun parc trouvé pour ce département", "information");
      return;
    }

    masquerMessageListe();

    parcs.forEach((parc) => {
      zoneListe.appendChild(creerCardParc(parc));
    });
  }

  function creerCardParc(parc) {
    const card = etatPage.templateCardParc.cloneNode(true);

    const idparc = String(parc.idparc || parc.id || "");
    const nom = String(parc.nom || parc.nomparc || "Parc").trim() || "Parc";
    const departement = String(parc.dptmt || parc.departement || "").trim();
    const description = nettoyerTexteCourt(parc.prez || parc.presentation || "", 190);

    const image = card.querySelector("[data-lcdp-card-parc-image]");
    const badgePrepa = card.querySelector("[data-lcdp-card-parc-badge-prepa]");
    const titre = card.querySelector("[data-lcdp-card-parc-title]");
    const meta = card.querySelector("[data-lcdp-card-parc-meta]");
    const texte = card.querySelector("[data-lcdp-card-parc-description]");
    const boutonFiche = card.querySelector("[data-action='ouvrir-fiche-parc']");
    const boutonPlanning = card.querySelector("[data-action='voir-planning-parc']");
    const boutonReserver = card.querySelector("[data-action='nouvelle-date-parc']");

    card.dataset.idparc = idparc;

    if (image) {
      image.src = construireUrlImageParc(parc);
      image.alt = "Image du parc " + nom;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => {
        image.src = construireUrlObjet(DOSSIER_IMAGES_PARC_OBJET + "/cardlogo.webp");
      }, { once: true });
    }

    if (badgePrepa) {
      badgePrepa.hidden = String(parc.statut || "").trim().toLowerCase() !== "prepa";
    }

    if (titre) titre.textContent = nom;

    if (meta) {
      meta.textContent = departement ? "Département " + departement : "Département non renseigné";
    }

    if (texte) {
      texte.textContent = description;
      texte.hidden = !description;
    }

    if (boutonFiche) {
      boutonFiche.dataset.idparc = idparc;
    }

    if (boutonPlanning) {
      boutonPlanning.dataset.idparc = idparc;
      boutonPlanning.textContent = "Planning Parc";
    }

    if (boutonReserver) {
      boutonReserver.dataset.idparc = idparc;
      boutonReserver.textContent = "Réserver";
    }

    return card;
  }

  async function gererClicDocument(event) {
    const boutonFiche = event.target.closest("[data-action='ouvrir-fiche-parc']");
    const boutonPlanning = event.target.closest("[data-action='voir-planning-parc']");
    const boutonReserver = event.target.closest("[data-action='nouvelle-date-parc']");
    const jourCalendrier = event.target.closest("[data-lcdp-card-jour-mois]");
    const boutonHeure = event.target.closest("[data-action='choisir-heure-arrivee']");

    if (boutonFiche) {
      event.preventDefault();

      const parc = trouverParcParId(boutonFiche.dataset.idparc);

      if (!parc) {
        await afficherAlerte("Parc introuvable.");
        return;
      }

      await ouvrirFicheParc(parc);
      return;
    }

    if (boutonPlanning) {
      event.preventDefault();

      const parc = trouverParcParId(boutonPlanning.dataset.idparc);

      if (!parc) {
        await afficherAlerte("Parc introuvable.");
        return;
      }

      await ouvrirPlanningMoisParc(parc);
      return;
    }

    if (boutonReserver) {
      event.preventDefault();

      const parc = trouverParcParId(boutonReserver.dataset.idparc);
      await demarrerReservationParc(parc);
      return;
    }

    if (jourCalendrier && !jourCalendrier.disabled) {
      event.preventDefault();

      if (jourCalendrier.closest("[data-lcdp-planning-parc-lecture='true']")) {
        return;
      }

      await ouvrirCalendrierJourDepuisCard(jourCalendrier);
      return;
    }

    if (boutonHeure && !boutonHeure.disabled) {
      event.preventDefault();
      await traiterChoixHeure(boutonHeure);
    }
  }

  async function demarrerReservationParc(parc) {
    const messageBlocage = messageBlocageNouvelleDate(etatMembre);

    if (messageBlocage) {
      await afficherAlerteDetailParcOuPage(messageBlocage);
      return;
    }

    if (!parc) {
      await afficherAlerteDetailParcOuPage("Parc introuvable.");
      return;
    }

    await ouvrirCalendrierMoisParc(parc);
  }

  async function chargerFicheParcComplete(parcSource) {
    const idparc = String(parcSource?.idparc || parcSource?.id || "").trim();

    if (!idparc) {
      throw new Error("Identifiant du parc manquant.");
    }

    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      throw new Error("Le service de fiche parc n’est pas configuré.");
    }

    const reponse = await fetch(
      ENDPOINT_NOUVELLE_DATE_MEMBRE +
      "/fiche-parc?idparc=" +
      encodeURIComponent(idparc),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      }
    );

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      throw new Error("Session membre inactive.");
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(
        messageErreurApi(data, "Impossible de charger la fiche du parc.")
      );
    }

    return {
      ...parcSource,
      ...(data.parc || {}),
      resparc: data.resparc || null,
      parcsDepartement: Array.isArray(data.parcs) ? data.parcs : [],
      localitesCarte: Array.isArray(data.localites) ? data.localites : []
    };
  }

  async function ouvrirFicheParc(parc) {
    const parcComplet = await chargerFicheParcComplete(parc);
    await ouvrirShiftDetailParc(parcComplet, "fiche");
  }

  async function ouvrirShiftDetailParc(parc, vueDemandee) {
    if (!parc) {
      await afficherAlerte("Parc introuvable.");
      return;
    }

    const detail = await obtenirOuCreerShiftDetailParc();

    if (!detail || !detail.contenu) {
      throw new Error("Structure shift détail parc incomplète.");
    }

    etatPage.shiftDetailParc = {
      parc,
      vue: vueDemandee || "fiche"
    };

    await afficherVueShiftDetailParc(parc, vueDemandee || "fiche");
  }

  async function obtenirOuCreerShiftDetailParc() {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    let racine = slot.querySelector("[data-lcdp-box-shift-detail-parc]");

    if (!racine) {
      slot.innerHTML = "";

      const shift = etatPage.templateShiftDetailParc
        ? etatPage.templateShiftDetailParc.cloneNode(true)
        : (await chargerFragmentObjet("/BOX/04-box-shift-detail-parc.html")).querySelector("[data-lcdp-box-shift-detail-parc]");

      if (!shift) {
        throw new Error("Template shift détail parc introuvable.");
      }

      shift.hidden = true;
      shift.classList.add("lcdp-box-shift-detail-parc--preparation");
      slot.appendChild(shift);
      racine = shift;

      const boutonFermer = racine.querySelector("[data-lcdp-shift-detail-parc-close]");

      if (boutonFermer) {
        boutonFermer.addEventListener("click", fermerShiftDetailParc);
      }

      racine.addEventListener("click", (event) => {
        if (event.target === racine) {
          fermerShiftDetailParc();
        }
      });

      const gererEscape = (event) => {
        if (event.key === "Escape" && document.body.contains(racine)) {
          fermerShiftDetailParc();
        }
      };

      racine._lcdpShiftDetailParcEscape = gererEscape;
      document.addEventListener("keydown", gererEscape);
    }

    return {
      racine,
      contenu: racine.querySelector("[data-lcdp-shift-detail-parc-content]"),
      alerteSlot: racine.querySelector("[data-lcdp-shift-detail-parc-alerte-slot]")
    };
  }

  function obtenirShiftDetailParcActif() {
    const racine = document.querySelector("#lcdp-lightbox-slot [data-lcdp-box-shift-detail-parc]");

    if (!racine) return null;

    return {
      racine,
      contenu: racine.querySelector("[data-lcdp-shift-detail-parc-content]"),
      alerteSlot: racine.querySelector("[data-lcdp-shift-detail-parc-alerte-slot]")
    };
  }

  function fermerShiftDetailParc() {
    const slot = document.getElementById("lcdp-lightbox-slot");
    const racine = slot ? slot.querySelector("[data-lcdp-box-shift-detail-parc]") : null;

    if (racine && racine._lcdpShiftDetailParcEscape) {
      document.removeEventListener("keydown", racine._lcdpShiftDetailParcEscape);
    }

    etatPage.shiftDetailParc = null;

    if (slot) {
      slot.innerHTML = "";
    }
  }

  async function afficherVueShiftDetailParc(parc, vueDemandee) {
    const detail = await obtenirOuCreerShiftDetailParc();

    if (!detail || !detail.contenu) {
      throw new Error("Zone contenu shift détail parc introuvable.");
    }

    const vue = vueDemandee || "fiche";
    const premiereOuverture =
      detail.racine.hidden === true ||
      detail.racine.classList.contains("lcdp-box-shift-detail-parc--preparation");

    const contenuPrepare = document.createElement("div");
    contenuPrepare.className = "lcdp-box-shift-detail-parc__content-preparation";

    try {
      await rendreVueShiftDetailParcDansConteneur(contenuPrepare, parc, vue);
    } catch (error) {
      if (premiereOuverture) {
        fermerShiftDetailParc();
      }

      throw error;
    }

    if (detail.alerteSlot) {
      detail.alerteSlot.innerHTML = "";
    }

    etatPage.shiftDetailParc = { parc, vue };
    detail.racine.dataset.lcdpShiftVue = vue;

    if (premiereOuverture) {
      detail.contenu.replaceChildren(...Array.from(contenuPrepare.childNodes));
      detail.racine.hidden = false;
      detail.racine.classList.remove("lcdp-box-shift-detail-parc--preparation");
      detail.racine.classList.add("lcdp-box-shift-detail-parc--apparition");

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          detail.racine.classList.remove("lcdp-box-shift-detail-parc--apparition");
        });
      });

      return;
    }

    await remplacerContenuShiftDetailParc(detail.contenu, contenuPrepare);
  }

  async function rendreVueShiftDetailParcDansConteneur(contenu, parc, vue) {
    if (vue === "planning") {
      await afficherPlanningMoisParcDansConteneur(contenu, parc);
      return;
    }

    if (vue === "reservation") {
      await afficherReservationMoisParcDansConteneur(contenu, parc, true);
      return;
    }

    await afficherFicheParcDansConteneur(contenu, parc);
  }

  async function remplacerContenuShiftDetailParc(contenu, contenuPrepare) {
    if (!contenu || !contenuPrepare) return;

    const hauteurCourante = Math.ceil(contenu.getBoundingClientRect().height || 0);

    if (hauteurCourante > 0) {
      contenu.style.minHeight = hauteurCourante + "px";
    }

    contenu.classList.add("lcdp-box-shift-detail-parc__content--transition");
    await attendre(150);

    contenu.replaceChildren(...Array.from(contenuPrepare.childNodes));
    void contenu.offsetHeight;
    contenu.classList.remove("lcdp-box-shift-detail-parc__content--transition");

    await attendre(170);
    contenu.style.removeProperty("min-height");
  }

  async function afficherAlerteDetailParcOuPage(message) {
    const detail = obtenirShiftDetailParcActif();

    if (detail && detail.alerteSlot) {
      await afficherAlerteShiftDetailParc(message);
      return;
    }

    await afficherAlerte(message);
  }

  async function afficherAlerteShiftDetailParc(message) {
    const detail = obtenirShiftDetailParcActif();

    if (!detail || !detail.alerteSlot) {
      await afficherAlerte(message);
      return;
    }

    detail.alerteSlot.innerHTML = "";

    const box = document.createElement("div");
    box.className = "lcdp-box-shift-detail-parc__alerte-box";
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");

    const boutonFermer = document.createElement("button");
    boutonFermer.type = "button";
    boutonFermer.className = "lcdp-box-shift-detail-parc__alerte-close";
    boutonFermer.setAttribute("aria-label", "Fermer");
    boutonFermer.textContent = "×";

    const texte = document.createElement("p");
    texte.className = "lcdp-box-shift-detail-parc__alerte-message";
    texte.textContent = message || "";

    const boutonOk = document.createElement("button");
    boutonOk.type = "button";
    boutonOk.className = "lcdp-button lcdp-button-primary lcdp-box-shift-detail-parc__alerte-ok";
    boutonOk.textContent = "OK";

    box.appendChild(boutonFermer);
    box.appendChild(texte);
    box.appendChild(boutonOk);
    detail.alerteSlot.appendChild(box);

    return new Promise((resolve) => {
      let resolu = false;

      function fermerDepuisFond(event) {
        if (event.target === detail.alerteSlot) fermer(false);
      }

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        detail.alerteSlot.removeEventListener("click", fermerDepuisFond);
        detail.alerteSlot.innerHTML = "";
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", () => fermer(false));
      boutonOk.addEventListener("click", () => fermer(true));
      detail.alerteSlot.addEventListener("click", fermerDepuisFond);
    });
  }

  async function afficherFicheParcDansConteneur(slot, parc) {
    if (!slot) return;

    slot.innerHTML = "";

    const fiche = etatPage.templateFicheParc
      ? etatPage.templateFicheParc.cloneNode(true)
      : (await chargerFragmentObjet("/BOX/04-box-fiche-parc.html")).querySelector("[data-lcdp-box-fiche-parc]");

    if (!fiche) {
      throw new Error("Template fiche parc introuvable.");
    }

    fiche.classList.add("lcdp-box-fiche-parc--shift-detail");

    const nom = String(parc.nom || parc.nomparc || "Parc").trim() || "Parc";
    const titre = fiche.querySelector("[data-lcdp-fiche-parc-title]");
    const actionsSlot = fiche.querySelector("[data-lcdp-fiche-parc-actions]");
    const presentation = fiche.querySelector("[data-lcdp-fiche-parc-presentation]");
    const galerieSlot = fiche.querySelector("[data-lcdp-fiche-parc-galerie-slot]");
    const mapSlot = fiche.querySelector("[data-lcdp-fiche-parc-map-slot]");
    const contact = fiche.querySelector("[data-lcdp-fiche-parc-contact]");
    const acces = fiche.querySelector("[data-lcdp-fiche-parc-acces]");
    const boutonFermer = fiche.querySelector("[data-lcdp-fiche-parc-close]");

    if (titre) {
      titre.textContent = "Parc de " + nom;
    }

    if (actionsSlot) {
      actionsSlot.innerHTML = "";
      actionsSlot.appendChild(creerActionsFicheParc(parc));
    }

    if (presentation) {
      remplirBlocTexteFiche(
        presentation,
        nettoyerTexteFiche(parc.prez || parc.presentation || parc.description || "") || "Présentation non renseignée."
      );
    }

    if (galerieSlot) {
      await afficherGalerieParcDansSlot(galerieSlot, parc);
    }

    if (mapSlot) {
      await afficherCarteParcDansSlot(mapSlot, parc);
    }

    if (contact) {
      remplirBlocTexteFiche(contact, construireTexteContactParc(parc));
    }

    if (acces) {
      remplirBlocTexteFiche(
        acces,
        construireTexteAccesParc(parc)
      );
    }

    if (boutonFermer) {
      boutonFermer.addEventListener("click", fermerShiftDetailParc);
    }

    slot.appendChild(fiche);
  }

  function remplirBlocTexteFiche(conteneur, texte) {
    if (!conteneur) return;

    conteneur.innerHTML = "";

    const lignes = String(texte || "")
      .split("\n")
      .map(nettoyerTexteFiche)
      .filter(Boolean);

    if (!lignes.length) {
      const paragraphe = document.createElement("p");
      paragraphe.textContent = "Non renseigné.";
      conteneur.appendChild(paragraphe);
      return;
    }

    lignes.forEach((ligne) => {
      const paragraphe = document.createElement("p");
      paragraphe.textContent = ligne;

      if (ligne.startsWith("Actualisation :")) {
        paragraphe.classList.add(
          "lcdp-box-fiche-parc__actualisation"
        );
      }

      conteneur.appendChild(paragraphe);
    });
  }

  async function afficherGalerieParcDansSlot(slot, parc) {
    if (!slot) return;

    slot.innerHTML = "";

    if (typeof window.LCDP_ajouterGalerie !== "function") {
      throw new Error("Objet galerie V3 introuvable.");
    }

    const nom = String(parc.nom || parc.nomparc || "Parc").trim() || "Parc";
    const cartes = [];

    for (let index = 1; index <= 6; index += 1) {
      const numero = String(index).padStart(2, "0");

      cartes.push({
        titre: "",
        imageSrc: construireUrlImageParcFichier(parc, numero + ".jpg"),
        imageAlt: "Photo " + numero + " du parc de " + nom,
        imageLegende: "",
        texte: ""
      });
    }

    await window.LCDP_ajouterGalerie(slot, {
      titre: "",
      ariaLabel: "Galerie photo du parc",
      cartes
    });
  }

  async function afficherCarteParcDansSlot(slot, parc) {
    if (!slot) return;

    slot.innerHTML = "";

    const [fragment, reponseGeojson] = await Promise.all([
      chargerFragmentObjet("/BOX/04-carte-dynamique.html"),
      fetch(construireUrlObjet("/BOX/04-carte-dynamique.geojson"), {
        method: "GET",
        credentials: "omit",
        cache: "no-cache",
        headers: {
          "Accept": "application/geo+json, application/json"
        }
      })
    ]);

    if (!reponseGeojson.ok) {
      throw new Error("GeoJSON de la carte introuvable.");
    }

    const geojson = await reponseGeojson.json();
    const carte = fragment.querySelector("[data-lcdp-carte-dynamique]");

    if (!carte) {
      throw new Error("Structure de la carte dynamique incomplète.");
    }

    carte.classList.add("lcdp-carte-dynamique--fiche-parc");
    slot.appendChild(carte);

    const entete = carte.querySelector(".lcdp-carte-dynamique__header");
    const filtres = carte.querySelector("[data-lcdp-carte-filters]");
    const statut = carte.querySelector("[data-lcdp-carte-status]");
    const svg = carte.querySelector("[data-lcdp-carte-svg]");
    const coucheDepartements = carte.querySelector("[data-lcdp-carte-departements-layer]");
    const coucheSelection = carte.querySelector("[data-lcdp-carte-selection-layer]");
    const coucheLocalites = carte.querySelector("[data-lcdp-carte-localites-layer]");
    const coucheParcs = carte.querySelector("[data-lcdp-carte-parcs-layer]");
    const boutonZoomPlus = carte.querySelector("[data-lcdp-carte-zoom-plus]");
    const boutonZoomMoins = carte.querySelector("[data-lcdp-carte-zoom-moins]");
    const cardSlot = carte.querySelector("[data-lcdp-carte-card-slot]");

    if (
      !svg ||
      !coucheDepartements ||
      !coucheSelection ||
      !coucheLocalites ||
      !coucheParcs ||
      !boutonZoomPlus ||
      !boutonZoomMoins ||
      !cardSlot
    ) {
      throw new Error("Structure SVG de la carte dynamique incomplète.");
    }

    if (entete) entete.hidden = true;
    if (filtres) filtres.hidden = true;
    if (statut) statut.hidden = true;
    cardSlot.hidden = true;

    svg.setAttribute("focusable", "false");
    svg.setAttribute("tabindex", "-1");

    const codeDepartement = nettoyerDepartement(parc.dptmt || parc.departement);
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    const traces = [];

    features.forEach((feature) => {
      const code = nettoyerDepartement(feature?.properties?.code);
      const trace = construireTraceGeometrieFicheParc(feature?.geometry);

      if (code && trace) {
        traces.push({ code, trace });
      }
    });

    if (!traces.length) {
      throw new Error("Données cartographiques incomplètes.");
    }

    coucheDepartements.innerHTML = "";
    coucheSelection.innerHTML = "";
    coucheLocalites.innerHTML = "";
    coucheParcs.innerHTML = "";

    traces.forEach(({ code, trace }) => {
      const path = creerElementSvgFicheParc("path");
      path.setAttribute("d", trace.d);
      path.setAttribute("class", "lcdp-carte-dynamique__departement");
      path.dataset.code = code;
      coucheDepartements.appendChild(path);

      if (code === codeDepartement) {
        const selection = creerElementSvgFicheParc("path");
        selection.setAttribute("d", trace.d);
        selection.setAttribute(
          "class",
          "lcdp-carte-dynamique__departement-selection"
        );
        coucheSelection.appendChild(selection);
      }
    });

    const traceSelectionnee = traces.find((item) => item.code === codeDepartement);
    const bboxFrance = fusionnerBboxFicheParc(traces.map((item) => item.trace.bbox));
    const bboxCible = traceSelectionnee?.trace?.bbox || bboxFrance;
    const viewBoxInitiale = bboxVersViewBoxFicheParc(
      bboxCible,
      traceSelectionnee ? 0.24 : 0.045
    );

    if (!viewBoxInitiale) {
      throw new Error("Emprise cartographique inexploitable.");
    }

    let viewBoxCourante = [...viewBoxInitiale];
    const viewBoxLimite = bboxVersViewBoxFicheParc(bboxFrance, 0.045) || [...viewBoxInitiale];

    function appliquerViewBox() {
      svg.setAttribute("viewBox", viewBoxCourante.join(" "));
      actualiserTailleElementsCarte();
    }

    function actualiserTailleElementsCarte() {
      const largeurMesuree = svg.getBoundingClientRect().width || svg.clientWidth || 800;
      const largeurEcran = Math.max(320, largeurMesuree);
      const uniteEcran = viewBoxCourante[2] / largeurEcran;
      const rayonParc = Math.max(0.04, uniteEcran * 6);
      const rayonLocalite = Math.max(0.035, uniteEcran * 4.2);
      const carteMobile = largeurMesuree <= 520;
      const tailleLibelle = Math.max(0.12, uniteEcran * (carteMobile ? 12.5 : 11));
      const decalageLibelle = Math.max(0.08, uniteEcran * (carteMobile ? 10 : 7));

      coucheParcs
        .querySelectorAll(".lcdp-carte-dynamique__marker")
        .forEach((marker) => marker.setAttribute("r", String(rayonParc)));

      coucheLocalites
        .querySelectorAll(".lcdp-carte-dynamique__localite-marker")
        .forEach((marker) => marker.setAttribute("r", String(rayonLocalite)));

      coucheLocalites
        .querySelectorAll(".lcdp-carte-dynamique__localite-label")
        .forEach((libelle) => {
          const x = Number(libelle.dataset.pointX);
          const y = Number(libelle.dataset.pointY);

          libelle.setAttribute("font-size", String(tailleLibelle));

          if (carteMobile) {
            libelle.setAttribute("x", String(x));
            libelle.setAttribute("y", String(y - decalageLibelle));
            libelle.setAttribute("text-anchor", "middle");
          } else {
            libelle.setAttribute("x", String(x + decalageLibelle));
            libelle.setAttribute("y", String(y));
            libelle.setAttribute("text-anchor", "start");
          }
        });
    }

    function zoomer(facteur) {
      const [x, y, largeur, hauteur] = viewBoxCourante;
      const centreX = x + largeur / 2;
      const centreY = y + hauteur / 2;
      const largeurMin = Math.max(0.25, viewBoxInitiale[2] / 12);
      const hauteurMin = Math.max(0.25, viewBoxInitiale[3] / 12);
      const largeurFinale = Math.min(
        viewBoxLimite[2],
        Math.max(largeurMin, largeur * facteur)
      );
      const hauteurFinale = Math.min(
        viewBoxLimite[3],
        Math.max(hauteurMin, hauteur * facteur)
      );

      viewBoxCourante = [
        centreX - largeurFinale / 2,
        centreY - hauteurFinale / 2,
        largeurFinale,
        hauteurFinale
      ];
      appliquerViewBox();
    }

    boutonZoomPlus.addEventListener("click", () => zoomer(0.82));
    boutonZoomMoins.addEventListener("click", () => zoomer(1.22));

    let glissement = null;
    let pincementTactile = null;

    function distanceEntrePointeurs(a, b) {
      return Math.hypot(b.x - a.x, b.y - a.y);
    }

    function centreEntrePointeurs(a, b) {
      return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
      };
    }

    function bornerDimensionsViewBox(largeur, hauteur) {
      const largeurMin = Math.max(0.25, viewBoxInitiale[2] / 12);
      const hauteurMin = Math.max(0.25, viewBoxInitiale[3] / 12);

      return {
        largeur: Math.min(viewBoxLimite[2], Math.max(largeurMin, largeur)),
        hauteur: Math.min(viewBoxLimite[3], Math.max(hauteurMin, hauteur))
      };
    }

    function convertirTouchEnPoint(touch) {
      return {
        x: touch.clientX,
        y: touch.clientY
      };
    }

    function demarrerPincementTactile(touches) {
      if (!touches || touches.length < 2) {
        pincementTactile = null;
        return;
      }

      const premier = convertirTouchEnPoint(touches[0]);
      const second = convertirTouchEnPoint(touches[1]);
      const distance = distanceEntrePointeurs(premier, second);

      if (!(distance > 0)) {
        pincementTactile = null;
        return;
      }

      const centre = centreEntrePointeurs(premier, second);
      const rect = svg.getBoundingClientRect();
      const largeurEcran = Math.max(1, rect.width);
      const hauteurEcran = Math.max(1, rect.height);

      pincementTactile = {
        distance,
        viewBox: [...viewBoxCourante],
        ancreX:
          viewBoxCourante[0] +
          ((centre.x - rect.left) / largeurEcran) * viewBoxCourante[2],
        ancreY:
          viewBoxCourante[1] +
          ((centre.y - rect.top) / hauteurEcran) * viewBoxCourante[3]
      };
    }

    svg.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        return;
      }

      const cible = event.target instanceof Element ? event.target : null;

      if (cible?.closest(".lcdp-carte-dynamique__marker")) {
        return;
      }

      svg.setPointerCapture(event.pointerId);
      glissement = {
        x: event.clientX,
        y: event.clientY,
        viewBox: [...viewBoxCourante]
      };
      svg.classList.add("is-dragging");
    });

    svg.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" || !glissement) {
        return;
      }

      const largeurEcran = Math.max(1, svg.getBoundingClientRect().width);
      const hauteurEcran = Math.max(1, svg.getBoundingClientRect().height);
      const dx = (event.clientX - glissement.x) * glissement.viewBox[2] / largeurEcran;
      const dy = (event.clientY - glissement.y) * glissement.viewBox[3] / hauteurEcran;

      viewBoxCourante = [
        glissement.viewBox[0] - dx,
        glissement.viewBox[1] - dy,
        glissement.viewBox[2],
        glissement.viewBox[3]
      ];
      appliquerViewBox();
    });

    function terminerInteractionPointeur(event) {
      if (event?.pointerType === "touch") {
        return;
      }

      if (
        glissement &&
        event?.pointerId !== undefined &&
        svg.hasPointerCapture(event.pointerId)
      ) {
        svg.releasePointerCapture(event.pointerId);
      }

      glissement = null;
      svg.classList.remove("is-dragging");
    }

    svg.addEventListener("pointerup", terminerInteractionPointeur);
    svg.addEventListener("pointercancel", terminerInteractionPointeur);

    svg.addEventListener("touchstart", (event) => {
      if (event.touches.length < 2) {
        pincementTactile = null;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      demarrerPincementTactile(event.touches);
    }, { passive: false });

    svg.addEventListener("touchmove", (event) => {
      if (event.touches.length < 2) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (!pincementTactile) {
        demarrerPincementTactile(event.touches);
      }

      if (!pincementTactile) {
        return;
      }

      const premier = convertirTouchEnPoint(event.touches[0]);
      const second = convertirTouchEnPoint(event.touches[1]);
      const distance = distanceEntrePointeurs(premier, second);
      const centre = centreEntrePointeurs(premier, second);

      if (!(distance > 0)) {
        return;
      }

      const facteur = pincementTactile.distance / distance;
      const dimensions = bornerDimensionsViewBox(
        pincementTactile.viewBox[2] * facteur,
        pincementTactile.viewBox[3] * facteur
      );

      const rect = svg.getBoundingClientRect();
      const largeurEcran = Math.max(1, rect.width);
      const hauteurEcran = Math.max(1, rect.height);

      viewBoxCourante = [
        pincementTactile.ancreX -
          ((centre.x - rect.left) / largeurEcran) * dimensions.largeur,
        pincementTactile.ancreY -
          ((centre.y - rect.top) / hauteurEcran) * dimensions.hauteur,
        dimensions.largeur,
        dimensions.hauteur
      ];

      appliquerViewBox();
    }, { passive: false });

    svg.addEventListener("touchend", (event) => {
      if (event.touches.length >= 2) {
        demarrerPincementTactile(event.touches);
      } else {
        pincementTactile = null;
      }
    }, { passive: true });

    svg.addEventListener("touchcancel", () => {
      pincementTactile = null;
    }, { passive: true });

    const bloquerZoomNavigateurDansCarte = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    svg.addEventListener("gesturestart", bloquerZoomNavigateurDansCarte, {
      passive: false
    });
    svg.addEventListener("gesturechange", bloquerZoomNavigateurDansCarte, {
      passive: false
    });
    svg.addEventListener("gestureend", bloquerZoomNavigateurDansCarte, {
      passive: false
    });

    window.addEventListener("resize", actualiserTailleElementsCarte);

    (Array.isArray(parc.localitesCarte) ? parc.localitesCarte : [])
      .forEach((localite) => {
        const point = projeterCoordonneeFicheParc(
          localite.longitude,
          localite.latitude
        );

        if (!point) return;

        const groupe = creerElementSvgFicheParc("g");
        groupe.setAttribute("aria-hidden", "true");

        const marker = creerElementSvgFicheParc("circle");
        marker.setAttribute("cx", String(point.x));
        marker.setAttribute("cy", String(point.y));
        marker.setAttribute("r", "0.1");
        marker.setAttribute(
          "class",
          "lcdp-carte-dynamique__localite-marker"
        );

        const libelle = creerElementSvgFicheParc("text");
        libelle.setAttribute("x", String(point.x));
        libelle.setAttribute("y", String(point.y));
        libelle.setAttribute("dominant-baseline", "middle");
        libelle.setAttribute(
          "class",
          "lcdp-carte-dynamique__localite-label"
        );
        libelle.dataset.pointX = String(point.x);
        libelle.dataset.pointY = String(point.y);
        libelle.textContent = String(localite.nom || "")
          .trim()
          .toLocaleUpperCase("fr");

        groupe.appendChild(marker);
        groupe.appendChild(libelle);
        coucheLocalites.appendChild(groupe);
      });

    function fermerCardParc() {
      cardSlot.innerHTML = "";
      cardSlot.hidden = true;
      cardSlot.classList.remove("is-open");
      cardSlot.style.removeProperty("display");
    }

    async function ouvrirCardParc(parcCarte) {
      const card = etatPage.templateCardParc.cloneNode(true);
      const image = card.querySelector("[data-lcdp-card-parc-image]");
      const media = card.querySelector(".lcdp-box-card-parc__media");
      const titre = card.querySelector("[data-lcdp-card-parc-title]");
      const meta = card.querySelector("[data-lcdp-card-parc-meta]");
      const description = card.querySelector("[data-lcdp-card-parc-description]");
      const badgePrepa = card.querySelector("[data-lcdp-card-parc-badge-prepa]");
      const boutonFiche = card.querySelector("[data-action='ouvrir-fiche-parc']");
      const boutonPlanning = card.querySelector("[data-action='voir-planning-parc']");
      const boutonReserver = card.querySelector("[data-action='nouvelle-date-parc']");

      if (titre) {
        titre.textContent = nettoyerTexteFiche(parcCarte?.nom) || "Parc";
      }

      if (meta) {
        const departement = nettoyerDepartement(
          parcCarte?.dptmt || parcCarte?.departement
        );
        meta.textContent = departement ? "Département " + departement : "";
      }

      if (description) {
        description.hidden = true;
        description.textContent = "";
      }

      if (badgePrepa) {
        badgePrepa.hidden =
          nettoyerTexteFiche(parcCarte?.statut).toLowerCase() !== "prepa";
      }

      if (image) {
        const src = construireUrlImageParc(parcCarte);

        image.src = src;
        image.alt = "Image du parc " + (nettoyerTexteFiche(parcCarte?.nom) || "");
        image.addEventListener(
          "error",
          () => {
            if (media) media.hidden = true;
          },
          { once: true }
        );
      }

      if (boutonFiche) {
        boutonFiche.textContent = "Le parc";
        boutonFiche.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          fermerCardParc();
          const parcComplet = await chargerFicheParcComplete(parcCarte);
          await afficherVueShiftDetailParc(parcComplet, "fiche");
        });
      }

      if (boutonPlanning) {
        boutonPlanning.textContent = "Planning Parc";
        boutonPlanning.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          fermerCardParc();
          await afficherVueShiftDetailParc(parcCarte, "planning");
        });
      }

      if (boutonReserver) {
        boutonReserver.textContent = "Réserver";
        boutonReserver.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          fermerCardParc();
          await demarrerReservationParc(parcCarte);
        });
      }

      const boutonFermerCard = document.createElement("button");
      boutonFermerCard.type = "button";
      boutonFermerCard.className = "lcdp-carte-dynamique__card-close";
      boutonFermerCard.textContent = "×";
      boutonFermerCard.setAttribute("aria-label", "Fermer la Card Parc");
      boutonFermerCard.addEventListener("click", fermerCardParc);

      cardSlot.replaceChildren(boutonFermerCard, card);
      cardSlot.hidden = false;
      cardSlot.removeAttribute("hidden");
      cardSlot.classList.add("is-open");
      cardSlot.style.display = "block";
    }

    const idParcActif = nettoyerTexteFiche(parc.idparc || parc.id);
    const parcsDepartement = Array.isArray(parc.parcsDepartement) && parc.parcsDepartement.length
      ? parc.parcsDepartement
      : [parc];
    const parcsCarteParId = new Map();

    parcsDepartement.forEach((parcCarte) => {
      const idparc = nettoyerTexteFiche(parcCarte?.idparc || parcCarte?.id);

      if (idparc) {
        parcsCarteParId.set(idparc, parcCarte);
      }
    });

    function ajouterMarqueurParc(parcCarte, estParcActif) {
      const longitude = parcCarte.lngparc ?? parcCarte.longitude ?? parcCarte.lngloc;
      const latitude = parcCarte.latparc ?? parcCarte.latitude ?? parcCarte.latloc;
      const point = projeterCoordonneeFicheParc(longitude, latitude);

      if (!point) return;

      const idparc = nettoyerTexteFiche(parcCarte.idparc || parcCarte.id);
      const groupe = creerElementSvgFicheParc("g");
      groupe.dataset.idparc = idparc;

      const marker = creerElementSvgFicheParc("circle");
      marker.setAttribute("cx", String(point.x));
      marker.setAttribute("cy", String(point.y));
      marker.setAttribute("r", "0.1");
      marker.setAttribute("class", "lcdp-carte-dynamique__marker");
      marker.style.pointerEvents = "all";
      marker.style.cursor = "pointer";
      marker.dataset.idparc = idparc;
      marker.dataset.statut = nettoyerTexteFiche(parcCarte.statut).toLowerCase();
      marker.classList.toggle("is-validcarte", parcCarte.validcarte === true);
      marker.classList.toggle(
        "lcdp-carte-dynamique__marker--parc-actif",
        estParcActif
      );
      marker.setAttribute("focusable", "false");
      marker.setAttribute("tabindex", "-1");
      marker.setAttribute("aria-hidden", "true");

      groupe.appendChild(marker);
      coucheParcs.appendChild(groupe);
    }

    const parcsSecondaires = [];
    let parcCourant = null;

    parcsDepartement.forEach((parcCarte) => {
      const idparc = nettoyerTexteFiche(parcCarte.idparc || parcCarte.id);

      if (idparc && idparc === idParcActif) {
        parcCourant = parcCarte;
        return;
      }

      parcsSecondaires.push(parcCarte);
    });

    parcsSecondaires.forEach((parcCarte) => {
      ajouterMarqueurParc(parcCarte, false);
    });

    ajouterMarqueurParc(parcCourant || parc, true);

    svg.addEventListener("click", (event) => {
      const cible = event.target instanceof Element ? event.target : null;
      const marker = cible?.closest(".lcdp-carte-dynamique__marker");

      if (!marker) return;

      event.preventDefault();
      event.stopPropagation();

      const parcCarte = parcsCarteParId.get(
        nettoyerTexteFiche(marker.dataset.idparc)
      );

      if (parcCarte) {
        ouvrirCardParc(parcCarte).catch(console.error);
      }
    });

    svg.setAttribute(
      "aria-label",
      "Carte du département " + (codeDepartement || "du parc")
    );

    appliquerViewBox();
  }

  function projeterCoordonneeFicheParc(longitude, latitude) {
    const lon = Number(longitude);
    const lat = Number(latitude);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return null;
    }

    const latitudeBornee = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const latitudeRadians = latitudeBornee * Math.PI / 180;
    const sinus = Math.sin(latitudeRadians);

    return {
      x: ((lon + 180) / 360) * 1000,
      y: (0.5 - Math.log((1 + sinus) / (1 - sinus)) / (4 * Math.PI)) * 1000
    };
  }

  function construireTraceGeometrieFicheParc(geometry) {
    const type = String(geometry?.type || "");
    const coordinates = geometry?.coordinates;
    const parties = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    function ajouterAnneau(anneau) {
      if (!Array.isArray(anneau) || anneau.length < 3) return;

      const points = anneau
        .map((coord) => projeterCoordonneeFicheParc(coord?.[0], coord?.[1]))
        .filter(Boolean);

      if (points.length < 3) return;

      points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });

      parties.push(
        "M " + points
          .map((point) => point.x.toFixed(4) + " " + point.y.toFixed(4))
          .join(" L ") +
        " Z"
      );
    }

    if (type === "Polygon" && Array.isArray(coordinates)) {
      coordinates.forEach(ajouterAnneau);
    } else if (type === "MultiPolygon" && Array.isArray(coordinates)) {
      coordinates.forEach((polygone) => {
        if (Array.isArray(polygone)) polygone.forEach(ajouterAnneau);
      });
    }

    if (!parties.length || ![minX, minY, maxX, maxY].every(Number.isFinite)) {
      return null;
    }

    return {
      d: parties.join(" "),
      bbox: [minX, minY, maxX, maxY]
    };
  }

  function fusionnerBboxFicheParc(boxes) {
    const valides = boxes.filter(
      (bbox) => Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite)
    );

    if (!valides.length) return null;

    return [
      Math.min(...valides.map((bbox) => bbox[0])),
      Math.min(...valides.map((bbox) => bbox[1])),
      Math.max(...valides.map((bbox) => bbox[2])),
      Math.max(...valides.map((bbox) => bbox[3]))
    ];
  }

  function bboxVersViewBoxFicheParc(bbox, ratioMarge = 0.12) {
    if (!bbox) return null;

    const largeur = Math.max(0.5, bbox[2] - bbox[0]);
    const hauteur = Math.max(0.5, bbox[3] - bbox[1]);
    const marge = Math.max(0.35, Math.max(largeur, hauteur) * ratioMarge);

    return [
      bbox[0] - marge,
      bbox[1] - marge,
      largeur + marge * 2,
      hauteur + marge * 2
    ];
  }

  function creerElementSvgFicheParc(nom) {
    return document.createElementNS("http://www.w3.org/2000/svg", nom);
  }

  function construireTexteAccesParc(parc) {
    const horaire = String(parc?.horaire || "").trim() ||
      "Horaires d’accès non renseignés.";
    const dateActualisation = formaterDateMajHoraire(
      parc?.datemajhoraire
    );
    const mentionActualisation = dateActualisation
      ? "Actualisation : " + dateActualisation + "."
      : "Actualisation : date non disponible.";

    return horaire + "\n" + mentionActualisation;
  }

  function formaterDateMajHoraire(value) {
    const date = new Date(value || "");

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const morceaux = new Intl.DateTimeFormat(
      "fr-FR",
      {
        timeZone: "Europe/Paris",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }
    ).formatToParts(date);
    const lire = (type) =>
      morceaux.find((item) => item.type === type)?.value || "";

    return (
      lire("day") +
      " " +
      lire("month") +
      " " +
      lire("year") +
      " à " +
      lire("hour") +
      " h " +
      lire("minute")
    );
  }

  function construireTexteContactParc(parc) {
    const responsable = parc && parc.resparc ? parc.resparc : null;
    const nomResponsable = [
      nettoyerTexteFiche(responsable?.prenomresp),
      nettoyerTexteFiche(responsable?.nomresp)
    ]
      .filter(Boolean)
      .join(" ");

    const lignes = [
      nomResponsable,
      parc.contact,
      parc.contactparc,
      parc.emailparc,
      parc.email,
      parc.telephone,
      parc.telparc,
      parc.tel
    ]
      .map(nettoyerTexteFiche)
      .filter(Boolean)
      .filter((valeur, index, liste) => liste.indexOf(valeur) === index);

    return lignes.length ? lignes.join("\n") : "Contact non renseigné.";
  }

  function construireUrlImageParcFichier(parc, fichier) {
    const departement = nettoyerDepartement(parc?.dptmt || parc?.departement || "");
    const dossierParc = normaliserNomParcPourChemin(parc?.nom || parc?.nomparc || "");
    const nomFichier = String(fichier || "").replace(/^\/+/, "");

    if (!departement || !dossierParc || !nomFichier) {
      return construireUrlObjet(DOSSIER_IMAGES_PARC_OBJET + "/parc-defaut.webp");
    }

    return construireUrlObjet(
      DOSSIER_IMAGES_PARC_OBJET +
      "/" + encodeURIComponent(departement) +
      "/" + encodeURIComponent(dossierParc) +
      "/" + encodeURIComponent(nomFichier)
    );
  }

  function nettoyerTexteFiche(valeur) {
    return String(valeur || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function trouverParcParId(idparc) {
    const id = String(idparc || "");

    return etatPage.parcs.find((parc) => String(parc.idparc || parc.id || "") === id) || null;
  }

  async function ouvrirPlanningMoisParc(parc) {
    await ouvrirShiftDetailParc(parc, "planning");
  }

  async function afficherPlanningMoisParcDansConteneur(slot, parc) {
    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-calendrier-mois.html");
    slot.appendChild(fragment);

    const calendrier = slot.querySelector("[data-lcdp-box-calendrier-mois]");
    const titre = slot.querySelector("[data-lcdp-calendrier-mois-title]");
    const meta = slot.querySelector("[data-lcdp-calendrier-mois-meta]");
    const boutonFermer = slot.querySelector("[data-lcdp-calendrier-mois-close]");
    const boutonPrecedent = slot.querySelector("[data-lcdp-calendrier-mois-prev]");
    const boutonSuivant = slot.querySelector("[data-lcdp-calendrier-mois-next]");

    if (!calendrier || !titre || !meta || !boutonFermer || !boutonPrecedent || !boutonSuivant) {
      throw new Error("Structure calendrier mois incomplète.");
    }

    calendrier.dataset.lcdpPlanningParcLecture = "true";
    calendrier.classList.add("lcdp-box-calendrier-mois--shift-detail");
    appliquerClasseCoquePlanningParc(calendrier, "calendrier-mois");

    const nomParc = String(parc.nom || parc.nomparc || "Parc").trim() || "Parc";
    const departement = String(parc.dptmt || parc.departement || "").trim();

    titre.textContent = "Parc de " + nomParc + (departement ? " - " + departement : "");
    meta.textContent = "";
    meta.classList.add("lcdp-box-calendrier-mois__meta--partage");

    meta.appendChild(creerActionsPlanningParc(parc));

    const maintenant = new Date();
    const moisMinimumPlanning = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const moisMaximumPlanning = new Date(maintenant.getFullYear(), maintenant.getMonth() + 3, 1);

    const etatPlanning = {
      parc,
      annee: moisMinimumPlanning.getFullYear(),
      mois: moisMinimumPlanning.getMonth() + 1,
      planning: [],
      modePlanning: "lecture",
      moisMinimum: {
        annee: moisMinimumPlanning.getFullYear(),
        mois: moisMinimumPlanning.getMonth() + 1
      },
      moisMaximum: {
        annee: moisMaximumPlanning.getFullYear(),
        mois: moisMaximumPlanning.getMonth() + 1
      }
    };

    boutonFermer.addEventListener("click", fermerShiftDetailParc);

    function actualiserNavigationPlanning() {
      const auMoisMinimum = moisPlanningIdentique(etatPlanning, etatPlanning.moisMinimum);
      const auMoisMaximum = moisPlanningIdentique(etatPlanning, etatPlanning.moisMaximum);

      boutonPrecedent.disabled = auMoisMinimum;
      boutonPrecedent.setAttribute("aria-disabled", auMoisMinimum ? "true" : "false");

      boutonSuivant.disabled = auMoisMaximum;
      boutonSuivant.setAttribute("aria-disabled", auMoisMaximum ? "true" : "false");
    }

    boutonPrecedent.addEventListener("click", () => {
      if (moisPlanningIdentique(etatPlanning, etatPlanning.moisMinimum)) return;

      changerMois(etatPlanning, -1);
      actualiserNavigationPlanning();
      afficherPlanningMoisLecture(etatPlanning, calendrier).catch(console.error);
    });

    boutonSuivant.addEventListener("click", () => {
      if (moisPlanningIdentique(etatPlanning, etatPlanning.moisMaximum)) return;

      changerMois(etatPlanning, 1);
      actualiserNavigationPlanning();
      afficherPlanningMoisLecture(etatPlanning, calendrier).catch(console.error);
    });

    actualiserNavigationPlanning();

    await afficherPlanningMoisLecture(etatPlanning, calendrier);
  }

async function afficherPlanningMoisLecture(etatPlanning, calendrierRacine) {
  const racine = calendrierRacine || document.querySelector("[data-lcdp-planning-parc-lecture='true']");
  const moisCourant = racine?.querySelector("[data-lcdp-calendrier-mois-current]");
  const message = racine?.querySelector("[data-lcdp-calendrier-mois-message]");
  const grille = racine?.querySelector("[data-lcdp-calendrier-mois-grid]");

  if (!moisCourant || !message || !grille) return;

  moisCourant.textContent = formaterMoisAnnee(etatPlanning.annee, etatPlanning.mois);

  message.hidden = true;
  message.textContent = "";

  grille.classList.add("lcdp-box-calendrier-mois__grid--loading");
  grille.setAttribute("aria-busy", "true");

  try {
    const planning = await chargerPlanningParcMoisLecture(etatPlanning);
    etatPlanning.planning = planning;

    const grilleTemp = document.createElement("div");
    remplirGrilleCalendrier(grilleTemp, etatPlanning, planning);

    grilleTemp.querySelectorAll("[data-lcdp-card-jour-mois]").forEach((jour) => {
      jour.dataset.lcdpPlanningLecture = "true";
      jour.setAttribute(
        "aria-label",
        (jour.getAttribute("aria-label") || "") + " — consultation uniquement"
      );
    });

    grille.replaceChildren(...Array.from(grilleTemp.childNodes));
  } catch (error) {
    console.error("Erreur planning parc lecture :", error);

    if (!grille.children.length) {
      message.hidden = false;
      message.textContent = error.message || "Impossible de charger le planning du parc.";
    }
  } finally {
    grille.classList.remove("lcdp-box-calendrier-mois__grid--loading");
    grille.removeAttribute("aria-busy");
  }
}  

  async function chargerPlanningParcMoisLecture(etatPlanning) {
    if (!ENDPOINT_PLANNING_PARC) {
      throw new Error("Le service planning parc n’est pas configuré.");
    }

    const idparc = String(etatPlanning.parc.idparc || etatPlanning.parc.id || "").trim();

    if (!idparc) {
      throw new Error("Parc manquant.");
    }

    const url =
      ENDPOINT_PLANNING_PARC +
      "/planning-parc-mois?idparc=" + encodeURIComponent(idparc) +
      "&annee=" + encodeURIComponent(etatPlanning.annee) +
      "&mois=" + encodeURIComponent(etatPlanning.mois);

    const reponse = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      await afficherAlerteDetailParcOuPage("Cette page est réservée aux membres invités ou abonnés.");
      return [];
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible de charger le planning du parc."));
    }

    return Array.isArray(data.planning) ? data.planning : [];
  }

  async function ouvrirPartagePlanningParc(parc, typepartage = "planning") {
    const emails = await ouvrirDialoguePartageEmails();

    if (!emails) return;

    try {
      const resultat = await envoyerPartagePlanningParc(parc, emails, typepartage);
      await afficherAlerteSuperposee(resultat.message || "La page a été partagée.");
    } catch (error) {
      await afficherAlerteSuperposee(
        normaliserMessageErreurPartage(error?.message)
      );
    }
  }

  async function ouvrirDialoguePartageEmails() {
    const conteneur = document.createElement("div");
    document.body.appendChild(conteneur);

    const fragment = await chargerFragmentObjet("/BOX/04-box-listemails.html");
    conteneur.appendChild(fragment);

    const box = conteneur.querySelector("[data-lcdp-box-card-listemails]");
    const titre = conteneur.querySelector("[data-lcdp-listemails-title]");
    const message = conteneur.querySelector("[data-lcdp-listemails-message]");
    const liste = conteneur.querySelector("[data-lcdp-listemails-list]");
    const actions = conteneur.querySelector("[data-lcdp-listemails-actions]");
    const boutonFermer = conteneur.querySelector("[data-lcdp-listemails-close]");

    if (!box || !titre || !message || !liste || !actions) {
      conteneur.remove();
      throw new Error("Structure liste e-mails incomplète.");
    }

    titre.textContent = "Partager la page";
    message.hidden = true;
    message.textContent = "";

    const ajouterChamp = (valeur = "") => {
      const item = document.createElement("li");
      item.className = "lcdp-box-card-listemails__item";

      const input = document.createElement("input");
      input.type = "email";
      input.value = valeur;
      input.placeholder = "Adresse e-mail";
      input.autocomplete = "email";
      input.className = "lcdp-box-card-listemails__input";

      item.appendChild(input);
      liste.appendChild(item);
      input.focus();
    };

    ajouterChamp();

    actions.innerHTML = "";
    actions.appendChild(creerBoutonPartage("Ajouter un e-mail", "lcdp-button-secondary", () => ajouterChamp()));

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        conteneur.remove();
        resolve(valeur);
      }

      actions.appendChild(creerBoutonPartage("Envoyer", "lcdp-button-primary", () => {
        const emailsSaisis = Array.from(liste.querySelectorAll("input[type='email']"))
          .map((input) => nettoyerEmail(input.value))
          .filter(Boolean);

        const emailsInvalides = emailsSaisis.filter((email) => !emailValide(email));

        if (!emailsSaisis.length) {
          message.hidden = false;
          message.textContent = "Renseignez au moins une adresse e-mail.";
          return;
        }

        if (emailsInvalides.length) {
          message.hidden = false;
          message.textContent = "Une adresse e-mail est invalide.";
          return;
        }

        const emails = emailsSaisis.filter((email, index, array) => array.indexOf(email) === index);

        if (emails.length > 10) {
          message.hidden = false;
          message.textContent = "Le partage est limité à 10 adresses e-mail.";
          return;
        }

        fermer(emails);
      }));

      actions.appendChild(creerBoutonPartage("Annuler", "lcdp-button-secondary", () => fermer(null)));

      if (boutonFermer) {
        boutonFermer.addEventListener("click", () => fermer(null));
      }

      box.addEventListener("click", (event) => {
        if (event.target === box) fermer(null);
      });
    });
  }

  function creerBoutonPartage(label, style, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button " + (style || "lcdp-button-primary");
    bouton.textContent = label;
    bouton.addEventListener("click", action);
    return bouton;
  }

  function creerActionsFicheParc(parc) {
    const actions = document.createElement("div");
    actions.className = "lcdp-box-fiche-parc__actions-list";

    const boutonReserver = document.createElement("button");
    boutonReserver.type = "button";
    boutonReserver.className = "lcdp-button lcdp-box-calendrier-mois__action-reserver lcdp-box-fiche-parc__action-reserver";
    boutonReserver.textContent = "RÉSERVER";
    boutonReserver.addEventListener("click", () => {
      demarrerReservationParc(parc).catch(console.error);
    });

    const boutonPlanning = document.createElement("button");
    boutonPlanning.type = "button";
    boutonPlanning.className = "lcdp-button lcdp-button-primary lcdp-box-fiche-parc__action-planning";
    boutonPlanning.textContent = "Planning parc";
    boutonPlanning.addEventListener("click", () => {
      afficherVueShiftDetailParc(parc, "planning").catch(console.error);
    });

    const actionPartager = creerActionPartagerFicheParc();
    actionPartager.addEventListener("click", () => {
      ouvrirPartagePlanningParc(parc, "fiche").catch(console.error);
    });

    actions.appendChild(boutonReserver);
    actions.appendChild(boutonPlanning);
    actions.appendChild(actionPartager);

    return actions;
  }

  function creerActionPartagerFicheParc() {
    const action = document.createElement("span");
    action.className = "lcdp-box-fiche-parc__partage";
    action.setAttribute("role", "button");
    action.setAttribute("tabindex", "0");
    action.setAttribute("aria-label", "Partager la page par e-mail");

    const bouton = document.createElement("span");
    bouton.className = "lcdp-box-fiche-parc__partage-icone";
    bouton.setAttribute("aria-hidden", "true");

    const icone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icone.setAttribute("viewBox", "0 0 24 24");
    icone.setAttribute("width", "20");
    icone.setAttribute("height", "20");
    icone.setAttribute("aria-hidden", "true");
    icone.setAttribute("focusable", "false");
    icone.setAttribute("fill", "none");
    icone.setAttribute("stroke", "currentColor");
    icone.setAttribute("stroke-width", "2");
    icone.setAttribute("stroke-linecap", "round");
    icone.setAttribute("stroke-linejoin", "round");

    const trace = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trace.setAttribute("d", "M22 2 11 13");

    const trace2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trace2.setAttribute("d", "M22 2 15 22 11 13 2 9 22 2Z");

    icone.appendChild(trace);
    icone.appendChild(trace2);
    bouton.appendChild(icone);

    const libelle = document.createElement("span");
    libelle.className = "lcdp-box-fiche-parc__partage-libelle";
    libelle.textContent = "Partager la page";

    action.appendChild(bouton);
    action.appendChild(libelle);

    action.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        action.click();
      }
    });

    return action;
  }

  function creerActionsPlanningParc(parc) {
    const actions = document.createElement("div");
    actions.className = "lcdp-box-calendrier-mois__actions-parc";

    const boutonFiche = document.createElement("button");
    boutonFiche.type = "button";
    boutonFiche.className = "lcdp-button lcdp-button-secondary lcdp-box-calendrier-mois__action-fiche";
    boutonFiche.textContent = "Fiche parc";
    boutonFiche.addEventListener("click", async () => {
      const parcComplet = await chargerFicheParcComplete(parc);
      await afficherVueShiftDetailParc(parcComplet, "fiche");
    });

    const boutonReserver = document.createElement("button");
    boutonReserver.type = "button";
    boutonReserver.className = "lcdp-button lcdp-box-calendrier-mois__action-reserver";
    boutonReserver.textContent = "RÉSERVER";
    boutonReserver.addEventListener("click", () => {
      demarrerReservationParc(parc).catch(console.error);
    });

    const actionPartager = creerActionPartagerPage();
    actionPartager.addEventListener("click", () => {
      ouvrirPartagePlanningParc(parc, "planning").catch(console.error);
    });

    actions.appendChild(boutonReserver);
    actions.appendChild(actionPartager);
    actions.appendChild(boutonFiche);

    return actions;
  }

  function creerActionPartagerPage() {
    const action = document.createElement("span");
    action.className = "lcdp-box-calendrier-mois__partage";
    action.setAttribute("role", "button");
    action.setAttribute("tabindex", "0");
    action.setAttribute("aria-label", "Partager la page par e-mail");

    const bouton = document.createElement("span");
    bouton.className = "lcdp-box-calendrier-mois__partage-icone";
    bouton.setAttribute("aria-hidden", "true");

    const icone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icone.setAttribute("viewBox", "0 0 24 24");
    icone.setAttribute("width", "20");
    icone.setAttribute("height", "20");
    icone.setAttribute("aria-hidden", "true");
    icone.setAttribute("focusable", "false");
    icone.setAttribute("fill", "none");
    icone.setAttribute("stroke", "currentColor");
    icone.setAttribute("stroke-width", "2");
    icone.setAttribute("stroke-linecap", "round");
    icone.setAttribute("stroke-linejoin", "round");

    const trace = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trace.setAttribute("d", "M22 2 11 13");

    const trace2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trace2.setAttribute("d", "M22 2 15 22 11 13 2 9 22 2Z");

    icone.appendChild(trace);
    icone.appendChild(trace2);
    bouton.appendChild(icone);

    const libelle = document.createElement("span");
    libelle.className = "lcdp-box-calendrier-mois__partage-libelle";
    libelle.textContent = "Partager la page";

    action.appendChild(bouton);
    action.appendChild(libelle);

    action.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        action.click();
      }
    });

    return action;
  }

  async function envoyerPartagePlanningParc(parc, emails, typepartage) {
    if (!ENDPOINT_PARTAGE_PAGE) {
      throw new Error("Le service de partage est temporairement indisponible.");
    }

    const typeNormalise = typepartage === "fiche" ? "fiche" : "planning";
    const idparc = String(parc.idparc || parc.id || "").trim();
    const nomparc = String(parc.nom || parc.nomparc || "").trim();
    const dptmt = String(parc.dptmt || parc.departement || "").trim();

    if (!idparc || !nomparc) {
      throw new Error("Le parc à partager est incomplet.");
    }

    const reponse = await fetch(ENDPOINT_PARTAGE_PAGE, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        typepartage: typeNormalise,
        idparc,
        nomparc,
        dptmt,
        emails
      })
    });

    const data = await reponse.json().catch(() => null);

    if (!reponse.ok || !reponseApiOk(data)) {
      throw new Error(
        normaliserMessageErreurPartage(
          messageErreurApi(data, "Le partage n’a pas pu être envoyé pour le moment. Merci de réessayer dans quelques instants.")
        )
      );
    }

    return data;
  }

  function normaliserMessageErreurPartage(message) {
    const texte = String(message || "").trim();

    if (!texte) {
      return "Le partage n’a pas pu être envoyé pour le moment. Merci de réessayer dans quelques instants.";
    }

    if (
      texte.includes("Session membre") ||
      texte.includes("Compte membre invalide") ||
      texte.includes("session membre")
    ) {
      return "Votre session membre a expiré. Merci de vous reconnecter pour partager cette page.";
    }

    if (
      texte.includes("service de partage") ||
      texte.includes("Variables manquantes") ||
      texte.includes("configuration")
    ) {
      return "Le service de partage est temporairement indisponible.";
    }

    if (
      texte.includes("Supabase") ||
      texte.includes("Resend") ||
      texte.includes("Failed to fetch") ||
      texte.includes("NetworkError")
    ) {
      return "Le partage n’a pas pu être envoyé pour le moment. Merci de réessayer dans quelques instants.";
    }

    if (texte === "Le partage n’a pas pu être envoyé.") {
      return "Le partage n’a pas pu être envoyé pour le moment. Merci de réessayer dans quelques instants.";
    }

    return texte;
  }


  async function obtenirCoquePlanningParcContenu() {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      throw new Error("Slot lightbox introuvable.");
    }

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-workflow-reservation.html");
    slot.appendChild(fragment);

    const coque = slot.querySelector("[data-lcdp-box-workflow-reservation]");

    if (!coque) {
      throw new Error("Structure de coque planning incomplète.");
    }

    const contenu = coque.querySelector("[data-lcdp-workflow-reservation-content]");

    if (!contenu) {
      throw new Error("Zone contenu planning introuvable.");
    }

    return contenu;
  }

  async function preparerTransitionCoquePlanningParc(slot) {
    if (!slot) return;

    slot.classList.add("lcdp-box-workflow-reservation__content--transition");
    await attendre(70);
    slot.innerHTML = "";
    slot.classList.remove("lcdp-box-workflow-reservation__content--transition");
  }

  function appliquerClasseCoquePlanningParc(box, variante) {
    if (!box) return;

    box.classList.add("lcdp-workflow-reservation-box");

    const coque = box.closest("[data-lcdp-box-workflow-reservation]");

    if (!coque) return;

    Array.from(coque.classList).forEach((nomClasse) => {
      if (nomClasse.startsWith("lcdp-box-workflow-reservation--")) {
        coque.classList.remove(nomClasse);
      }
    });

    if (variante) {
      coque.classList.add("lcdp-box-workflow-reservation--" + variante);
    }
  }

  function attendre(delaiMs) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, delaiMs);
    });
  }

  async function ouvrirCalendrierMoisParc(parc) {
    const detail = obtenirShiftDetailParcActif();

    if (detail && detail.contenu) {
      await afficherVueShiftDetailParc(parc, "reservation");
      return;
    }

    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return;

    slot.innerHTML = "";
    await afficherReservationMoisParcDansConteneur(slot, parc, false);
  }

  async function afficherReservationMoisParcDansConteneur(slot, parc, dansShiftDetail) {
    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-calendrier-mois.html");
    slot.appendChild(fragment);

    const calendrier = slot.querySelector("[data-lcdp-box-calendrier-mois]");
    const titre = slot.querySelector("[data-lcdp-calendrier-mois-title]");
    const meta = slot.querySelector("[data-lcdp-calendrier-mois-meta]");
    const boutonFermer = slot.querySelector("[data-lcdp-calendrier-mois-close]");
    const boutonPrecedent = slot.querySelector("[data-lcdp-calendrier-mois-prev]");
    const boutonSuivant = slot.querySelector("[data-lcdp-calendrier-mois-next]");

    if (!calendrier || !titre || !meta || !boutonFermer || !boutonPrecedent || !boutonSuivant) {
      throw new Error("Structure calendrier mois incomplète.");
    }

    if (dansShiftDetail) {
      calendrier.classList.add("lcdp-box-calendrier-mois--shift-detail");
    }

    const nomParc = String(parc.nom || parc.nomparc || "Parc").trim() || "Parc";
    const departement = String(parc.dptmt || parc.departement || "").trim();

    titre.textContent = "Planning du parc";
    meta.textContent = nomParc + (departement ? " · " + departement : "");

    const maintenant = new Date();
    const etatCalendrier = {
      parc,
      annee: maintenant.getFullYear(),
      mois: maintenant.getMonth() + 1,
      planning: [],
      modePlanning: "reservation"
    };

    etatPage.calendrierMoisActif = etatCalendrier;

    function fermer() {
      if (dansShiftDetail) {
        fermerShiftDetailParc();
        return;
      }

      const lightbox = document.getElementById("lcdp-lightbox-slot");
      if (lightbox) lightbox.innerHTML = "";
    }

    boutonFermer.addEventListener("click", fermer);

    if (!dansShiftDetail) {
      calendrier.addEventListener("click", (event) => {
        if (event.target === calendrier) fermer();
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") fermer();
        },
        { once: true }
      );
    }

    boutonPrecedent.addEventListener("click", () => {
      changerMois(etatCalendrier, -1);
      afficherCalendrierMois(etatCalendrier, calendrier).catch(console.error);
    });

    boutonSuivant.addEventListener("click", () => {
      changerMois(etatCalendrier, 1);
      afficherCalendrierMois(etatCalendrier, calendrier).catch(console.error);
    });

    await afficherCalendrierMois(etatCalendrier, calendrier);
  }

  async function afficherCalendrierMois(etatCalendrier, calendrierRacine) {
    const racineCalendrier = calendrierRacine || document;
    const moisCourant = racineCalendrier.querySelector("[data-lcdp-calendrier-mois-current]");
    const message = racineCalendrier.querySelector("[data-lcdp-calendrier-mois-message]");
    const grille = racineCalendrier.querySelector("[data-lcdp-calendrier-mois-grid]");

    if (!moisCourant || !message || !grille) return;

    moisCourant.textContent = formaterMoisAnnee(etatCalendrier.annee, etatCalendrier.mois);
    grille.innerHTML = "";
    message.hidden = false;
    message.textContent = "Chargement du planning...";

    try {
      const planning = await chargerPlanningParcMois(etatCalendrier);
      etatCalendrier.planning = planning;
      message.hidden = true;
      message.textContent = "";
      remplirGrilleCalendrier(grille, etatCalendrier, planning);
    } catch (error) {
      console.error("Erreur planning parc mois :", error);
      message.hidden = false;
      message.textContent = error.message || "Impossible de charger le planning du parc.";
    }
  }

  async function chargerPlanningParcMois(etatCalendrier) {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      throw new Error("Le service de réservation membre n’est pas configuré.");
    }

    const idparc = String(etatCalendrier.parc.idparc || etatCalendrier.parc.id || "").trim();

    if (!idparc) {
      throw new Error("Parc manquant.");
    }

    const url =
      ENDPOINT_NOUVELLE_DATE_MEMBRE +
      "/planning-parc-mois?idparc=" + encodeURIComponent(idparc) +
      "&annee=" + encodeURIComponent(etatCalendrier.annee) +
      "&mois=" + encodeURIComponent(etatCalendrier.mois);

    const reponse = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return [];
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible de charger le planning du parc."));
    }

    return Array.isArray(data.planning) ? data.planning : [];
  }

  function remplirGrilleCalendrier(grille, etatCalendrier, planning) {
    grille.innerHTML = "";

    const planningParDate = new Map(
      (Array.isArray(planning) ? planning : []).map((jour) => [String(jour.date || ""), jour])
    );

    const premierJour = new Date(etatCalendrier.annee, etatCalendrier.mois - 1, 1);
    const nombreJours = new Date(etatCalendrier.annee, etatCalendrier.mois, 0).getDate();
    const decalageLundi = (premierJour.getDay() + 6) % 7;

    for (let i = 0; i < decalageLundi; i += 1) {
      grille.appendChild(creerCardJourVide());
    }

    for (let jour = 1; jour <= nombreJours; jour += 1) {
      const dateIso = construireDateIso(etatCalendrier.annee, etatCalendrier.mois, jour);
      grille.appendChild(creerCardJourCalendrier(etatCalendrier, dateIso, jour, planningParDate.get(dateIso)));
    }
  }

  function creerCardJourVide() {
    const card = etatPage.templateJourMois.cloneNode(true);
    card.classList.add("lcdp-box-card-jour-in-calendrier-mois--empty");
    card.disabled = true;
    card.setAttribute("aria-hidden", "true");
    return card;
  }

  function creerCardJourCalendrier(etatCalendrier, dateIso, numeroJour, planningJour) {
    const card = etatPage.templateJourMois.cloneNode(true);
    const numero = card.querySelector("[data-lcdp-card-jour-mois-number]");
    const modeLecture = etatCalendrier.modePlanning === "lecture";
    const ouvert = Boolean(planningJour && planningJour.ouvert);
    const estPasse = dateIso < dateAujourdhuiIso();
    const estAujourdhui = dateIso === dateAujourdhuiIso();

    card.dataset.date = dateIso;
    card.dataset.idparc = String(
      etatCalendrier.parc.idparc ||
      etatCalendrier.parc.id ||
      ""
    );
    card.setAttribute(
      "aria-label",
      construireLibelleJour(dateIso, ouvert)
    );

    if (numero) {
      numero.textContent = String(numeroJour);
    }

    if (modeLecture) {
      card.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois--planning-lecture"
      );
    } else {
      card.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois--reservation-trois-plages"
      );
    }

    if (estAujourdhui) {
      card.classList.add("lcdp-box-card-jour-in-calendrier-mois--today");
    }

    if (estPasse) {
      card.classList.add("lcdp-box-card-jour-in-calendrier-mois--past");
      card.disabled = true;
    }

    if (!ouvert) {
      card.classList.add("lcdp-box-card-jour-in-calendrier-mois--closed");
      card.disabled = true;
    }

    if (modeLecture) {
      card.disabled = true;
      card.setAttribute("aria-disabled", "true");
    }

    remplirPlagesJour(
      card,
      planningJour,
      modeLecture ? "lecture" : "reservation"
    );

    return card;
  }

  function remplirPlagesJour(card, planningJour, mode) {
    const clesActives = mode === "lecture"
      ? CLES_PLAGES_AFFICHAGE
      : CLES_PLAGES_RESERVATION_ACTUELLES;

    CLES_PLAGES_AFFICHAGE.forEach((nomPlage) => {
      const slot = card.querySelector(
        '[data-lcdp-card-jour-mois-slot="' + nomPlage + '"]'
      );

      if (!slot) return;

      slot.hidden = !clesActives.includes(nomPlage);
      slot.className = "lcdp-box-card-jour-in-calendrier-mois__slot";
      slot.removeAttribute("style");
      slot.removeAttribute("title");

      if (slot.hidden) {
        return;
      }

      const plage = planningJour?.plages?.[nomPlage] || null;

      if (mode === "lecture") {
        appliquerRenduPlageLecture(slot, nomPlage, plage);
        return;
      }

      const couleur = normaliserCouleurClasse(
        plage && plage.ouverte
          ? plage.couleur
          : "gris_clair"
      );

      slot.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois__slot--" + couleur
      );
    });
  }

  async function ouvrirCalendrierJourDepuisCard(cardJour) {
    const dateIso = String(cardJour.dataset.date || "").trim();
    const etatCalendrier = etatPage.calendrierMoisActif;

    if (!dateIso || !etatCalendrier || !etatCalendrier.parc) {
      await afficherAlerte("Date ou parc manquant.");
      return;
    }

    const planningJour = (etatCalendrier.planning || [])
      .find((jour) => String(jour.date || "") === dateIso);

    if (!planningJour || planningJour.ouvert !== true) {
      await afficherAlerte("Aucun horaire disponible pour cette date.");
      return;
    }

    await ouvrirCalendrierJourParc({
      parc: etatCalendrier.parc,
      dateIso,
      planningJour
    });
  }

  async function ouvrirCalendrierJourParc(contexte) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-calendrier-jour.html");
    slot.appendChild(fragment);

    const calendrier = slot.querySelector("[data-lcdp-box-calendrier-jour]");
    const titre = slot.querySelector("[data-lcdp-calendrier-jour-title]");
    const meta = slot.querySelector("[data-lcdp-calendrier-jour-meta]");
    const message = slot.querySelector("[data-lcdp-calendrier-jour-message]");
    const grille = slot.querySelector("[data-lcdp-calendrier-jour-grid]");
    const boutonFermer = slot.querySelector("[data-lcdp-calendrier-jour-close]");

    if (!calendrier || !titre || !meta || !message || !grille || !boutonFermer) {
      throw new Error("Structure calendrier jour incomplète.");
    }

    const nomParc = String(contexte.parc.nom || contexte.parc.nomparc || "Parc").trim() || "Parc";
    const departement = String(contexte.parc.dptmt || contexte.parc.departement || "").trim();

    titre.textContent = "Votre heure d'arrivée";
    meta.textContent = formaterDateFr(contexte.dateIso) + " · " + nomParc + (departement ? " · " + departement : "");

    boutonFermer.addEventListener("click", () => {
      slot.innerHTML = "";
    });

    calendrier.addEventListener("click", (event) => {
      if (event.target === calendrier) slot.innerHTML = "";
    });

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") slot.innerHTML = "";
      },
      { once: true }
    );

    remplirGrilleHoraires(grille, message, contexte);
  }

  function remplirGrilleHoraires(grille, message, contexte) {
    grille.innerHTML = "";

    const plages = construirePlagesJour(contexte.planningJour);
    const heures = genererHeuresDisponibles();
    const messagesBlocage = [];

    plages.forEach((plage) => {
      const reservationPlage = trouverReservationActiveDatePlage(contexte.dateIso, plage.nom);

      if (reservationPlage) {
        messagesBlocage.push(
          "Vous avez déjà une réservation à " +
          formaterHeurePhrase(extraireHeureFranceReservation(reservationPlage.datebookd)) +
          " sur " +
          libellePlageReservation(plage.nom) +
          "."
        );
      }
    });

    heures.forEach((heure) => {
      const plage = trouverPlagePourHeure(plages, heure);

      if (!plage) return;

      const reservationPlage = trouverReservationActiveDatePlage(contexte.dateIso, plage.nom);
      grille.appendChild(creerCardHeure(contexte, heure, plage, reservationPlage));
    });

    if (!grille.children.length) {
      message.hidden = false;
      message.textContent = "Aucun horaire d'arrivée n'est disponible pour cette date.";
      return;
    }

    if (messagesBlocage.length) {
      message.hidden = false;
      message.textContent = messagesBlocage.join(" ");
      return;
    }

    message.hidden = true;
    message.textContent = "";
  }

  function construirePlagesJour(planningJour) {
    if (!planningJour || !planningJour.plages) {
      return [];
    }

    const plages = [];

    ajouterPlageSiOuverte(plages, "plage1", planningJour.plages.plage1, {
      debut: "06:00",
      fin: "13:00"
    });

    ajouterPlageSiOuverte(plages, "plage2", planningJour.plages.plage2, {
      debut: "13:00",
      fin: "19:00"
    });

    ajouterPlageSiOuverte(plages, "plage3", planningJour.plages.plage3, {
      debut: "19:00",
      fin: "21:30"
    });

    return plages;
  }

  function ajouterPlageSiOuverte(plages, nomPlage, plage, defaut) {
    if (!plage || plage.ouverte !== true) {
      return;
    }

    plages.push({
      nom: nomPlage,
      debut: plage.debut || defaut.debut,
      fin: plage.fin || defaut.fin,
      couleur: normaliserCouleurClasse(plage.couleur)
    });
  }

  function genererHeuresDisponibles() {
    const heures = [];

    for (let totalMinutes = 6 * 60; totalMinutes <= 21 * 60; totalMinutes += 30) {
      const heure = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      heures.push(
        String(heure).padStart(2, "0") + ":" + String(minutes).padStart(2, "0")
      );
    }

    return heures;
  }

  function trouverPlagePourHeure(plages, heure) {
    const totalMinutes = convertirHeureEnMinutes(heure);

    return plages.find((plage) => {
      const debut = convertirHeureEnMinutes(plage.debut);
      const fin = convertirHeureEnMinutes(plage.fin);

      return totalMinutes >= debut && totalMinutes < fin;
    }) || null;
  }

  function convertirHeureEnMinutes(heure) {
    const [heures, minutes] = String(heure || "00:00").split(":").map(Number);

    if (!Number.isFinite(heures) || !Number.isFinite(minutes)) {
      return 0;
    }

    return heures * 60 + minutes;
  }

  function creerCardHeure(contexte, heure, plage, reservationPlage) {
    const card = etatPage.templateHeureJour.cloneNode(true);
    const label = card.querySelector("[data-lcdp-card-heure-jour-label]");
    const couleur = normaliserCouleurClasse(plage.couleur);
    const heureReservee = reservationPlage
      ? extraireHeureFranceReservation(reservationPlage.datebookd)
      : "";
    const estHeureReservee = reservationPlage && heureReservee === heure;

    card.classList.add("lcdp-box-card-heure-in-calendrier-jour--" + couleur);
    card.dataset.idparc = String(contexte.parc.idparc || contexte.parc.id || "");
    card.dataset.date = contexte.dateIso;
    card.dataset.heure = heure;
    card.dataset.plagebookd = plage.nom;

    if (reservationPlage) {
      card.disabled = true;
      card.dataset.indisponible = estHeureReservee ? "deja-reserve" : "plage-deja-reservee";

      if (estHeureReservee) {
        card.classList.add("lcdp-box-card-heure-in-calendrier-jour--deja-reserve");
        card.setAttribute("aria-label", formaterHeureAffichee(heure) + " déjà réservé");
      } else {
        card.classList.add("lcdp-box-card-heure-in-calendrier-jour--plage-bloquee");
        card.setAttribute("aria-label", formaterHeureAffichee(heure) + " indisponible car une réservation existe déjà sur cette plage");
      }
    }

    if (label) {
      label.textContent = formaterHeureAffichee(heure);
    }

    return card;
  }

  function trouverReservationActiveDatePlage(dateIso, plagebookd) {
    return (Array.isArray(etatPage.reservationsMembre) ? etatPage.reservationsMembre : [])
      .find((reservation) => {
        if (!reservation || reservation.statut === "cancd") return false;

        return (
          extraireDateFranceReservation(reservation.datebookd) === dateIso &&
          String(reservation.plagebookd || "") === String(plagebookd || "")
        );
      }) || null;
  }

  function extraireDateFranceReservation(timestampIso) {
    const date = new Date(timestampIso);

    if (Number.isNaN(date.getTime())) return "";

    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const annee = morceaux.find((item) => item.type === "year")?.value || "";
    const mois = morceaux.find((item) => item.type === "month")?.value || "";
    const jour = morceaux.find((item) => item.type === "day")?.value || "";

    return annee && mois && jour ? annee + "-" + mois + "-" + jour : "";
  }

  function extraireHeureFranceReservation(timestampIso) {
    const date = new Date(timestampIso);

    if (Number.isNaN(date.getTime())) return "";

    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);

    const heure = morceaux.find((item) => item.type === "hour")?.value || "";
    const minute = morceaux.find((item) => item.type === "minute")?.value || "";

    return heure && minute ? heure + ":" + minute : "";
  }

  function formaterHeurePhrase(heure) {
    const valeur = String(heure || "");
    const match = valeur.match(/^(\d{2}):(\d{2})$/);

    if (!match) return formaterHeureAffichee(valeur);

    return String(Number(match[1])) + "h" + match[2];
  }

  function libellePlageReservation(plagebookd) {
    if (plagebookd === "plage1") return "la matinée";
    if (plagebookd === "plage2") return "l'après-midi";
    if (plagebookd === "plage3") return "la soirée";

    return "cette plage";
  }

  async function traiterChoixHeure(boutonHeure) {
    const messageBlocage = messageBlocageNouvelleDate(etatMembre);

    if (messageBlocage) {
      await afficherAlerteSuperposee(messageBlocage);
      return;
    }

    const heure = String(boutonHeure.dataset.heure || "").trim();
    const dateIso = String(boutonHeure.dataset.date || "").trim();
    const idparc = String(boutonHeure.dataset.idparc || "").trim();
    const plagebookd = String(boutonHeure.dataset.plagebookd || "").trim();

    if (!heure || !dateIso || !idparc || !plagebookd) {
      await afficherAlerteSuperposee("Heure, date ou parc manquant.");
      return;
    }

    const confirmation = await ouvrirDialogueBoutonsSuperpose({
      titre: "Confirmer l'heure d'arrivée",
      texte: "Vous avez choisi le " + formaterDateFr(dateIso) + " à " + formaterHeureAffichee(heure) + ".",
      boutons: [
        {
          label: "Annuler",
          valeur: "annuler",
          style: "lcdp-button-secondary"
        },
        {
          label: "Confirmer",
          valeur: "confirmer",
          style: "lcdp-button-primary"
        }
      ]
    });

    if (confirmation !== "confirmer") return;

    boutonHeure.disabled = true;

    try {
      await enregistrerReservation({
        idparc,
        datebookd: construireDateBookd(dateIso, heure),
        plagebookd
      });

      const slot = document.getElementById("lcdp-lightbox-slot");
      if (slot) slot.innerHTML = "";

      await afficherAlerte("Votre nouvelle date a bien été enregistrée.");
      window.location.href = PAGE_PLANNING_MEMBRE;
    } catch (error) {
      boutonHeure.disabled = false;
      await afficherAlerteSuperposee(error.message || "Impossible d'enregistrer la réservation.");
    }
  }

  async function enregistrerReservation(payload) {
    if (!ENDPOINT_FLUXM) {
      throw new Error("Le service du planning membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_FLUXM + "/creer-reservation", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible d'enregistrer la réservation."));
    }

    return data.reservation || null;
  }

  function construireDateBookd(dateIso, heure) {
    const dateLocale = new Date(dateIso + "T" + heure + ":00");

    return dateLocale.toISOString();
  }

  async function ouvrirDialogueBoutonsSuperpose(options) {
    const conteneur = document.createElement("div");
    document.body.appendChild(conteneur);

    const fragment = await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html");
    conteneur.appendChild(fragment);

    const dialogue = conteneur.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = conteneur.querySelector("[data-lcdp-dialogue-title]");
    const texte = conteneur.querySelector("[data-lcdp-dialogue-text]");
    const actions = conteneur.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = conteneur.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      conteneur.remove();
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
        conteneur.remove();
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
    });
  }

  async function afficherAlerteSuperposee(message) {
    const conteneur = document.createElement("div");
    document.body.appendChild(conteneur);

    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
    conteneur.appendChild(fragment);

    const alerte = conteneur.querySelector("[data-lcdp-box-alerte]");
    const texte = conteneur.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = conteneur.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = conteneur.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      conteneur.remove();
      throw new Error("Structure de l’alerte incomplète.");
    }

    texte.textContent = message || "";

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        conteneur.remove();
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", () => fermer(false));
      boutonOk.addEventListener("click", () => fermer(true));
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) fermer(false);
      });
    });
  }

  function changerMois(etatCalendrier, delta) {
    const date = new Date(etatCalendrier.annee, etatCalendrier.mois - 1 + delta, 1);
    etatCalendrier.annee = date.getFullYear();
    etatCalendrier.mois = date.getMonth() + 1;
  }

  function moisPlanningIdentique(etatPlanning, borne) {
  if (!etatPlanning || !borne) return false;

    return (
      Number(etatPlanning.annee) === Number(borne.annee) &&
      Number(etatPlanning.mois) === Number(borne.mois)
    );
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

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

    texte.textContent = message || "";

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
    });
  }

  async function ouvrirDialogueChamp(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-dialogue-champ.html");
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

    for (const champ of options.champs || []) {
      zoneContent.appendChild(await creerChampDialogue(champ));
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
        if (event.target === dialogue) fermer(null);
      });

      formulaire.addEventListener("submit", (event) => {
        event.preventDefault();

        erreur.hidden = true;
        erreur.textContent = "";

        const data = {};
        let champRequisManquant = false;

        (options.champs || []).forEach((champ) => {
          const input = formulaire.querySelector('[name="' + champ.name + '"]');
          const valeur = input ? String(input.value || "").trim() : "";

          if (champ.required && !valeur) {
            champRequisManquant = true;
          }

          data[champ.name] = valeur;
        });

        if (champRequisManquant) {
          erreur.textContent = "Merci de renseigner le champ demandé.";
          erreur.hidden = false;
          return;
        }

        fermer(data);
      });

      const premierInput = formulaire.querySelector("input, textarea, select");
      if (premierInput) premierInput.focus();
    });
  }

  async function creerChampDialogue(configurationChamp) {
    const fragment = await chargerFragmentObjet("/BOX/03-box-champ-formulaire.html");

    const champ = fragment.querySelector("[data-lcdp-box-champ-formulaire]");
    const zoneLabel = fragment.querySelector("[data-lcdp-champ-label-zone]");
    const zoneControl = fragment.querySelector("[data-lcdp-champ-control]");

    if (!champ || !zoneLabel || !zoneControl) {
      throw new Error("Structure champ formulaire incomplète.");
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

    if (configurationChamp.inputmode) {
      input.inputMode = configurationChamp.inputmode;
    }

    if (configurationChamp.autocomplete) {
      input.autocomplete = configurationChamp.autocomplete;
    }

    zoneLabel.appendChild(label);
    zoneControl.appendChild(input);

    return champ;
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const bandeau = await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html");
    slot.appendChild(bandeau);
    appliquerRoutesSite(slot);

    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js");

    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre({
        etatMembre: {
          abonne: membreAbonne()
        }
      });
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const footer = await chargerFragmentObjet("/BOX/02-box-footer.html");
    slot.appendChild(footer);
    appliquerRoutesSite(slot);
    actualiserEspaceFooterReserver();
    window.setTimeout(actualiserEspaceFooterReserver, 250);
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

    if (document.querySelector('script[data-lcdp-script="' + chemin + '"]')) {
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

  function obtenirZoneListe() {
    return document.querySelector("[data-lcdp-liste-card-list]");
  }

  function obtenirZoneMessageListe() {
    return document.querySelector("[data-lcdp-liste-card-message]");
  }

  function afficherChargementListe(message) {
    const zoneListe = obtenirZoneListe();

    if (zoneListe) zoneListe.innerHTML = "";

    afficherMessageListe(message || "Chargement...", "information");
  }

  function afficherErreurListe(message) {
    const zoneListe = obtenirZoneListe();

    if (zoneListe) zoneListe.innerHTML = "";

    afficherMessageListe(message, "erreur");
  }

  function afficherMessageListe(message, type) {
    const zoneMessage = obtenirZoneMessageListe();

    if (!zoneMessage) return;

    zoneMessage.hidden = false;
    zoneMessage.textContent = message || "";
    zoneMessage.dataset.lcdpMessageType = type || "information";
  }

  function masquerMessageListe() {
    const zoneMessage = obtenirZoneMessageListe();

    if (!zoneMessage) return;

    zoneMessage.hidden = true;
    zoneMessage.textContent = "";
    delete zoneMessage.dataset.lcdpMessageType;
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

  function construireUrlImageParc(parc) {
    const departement = nettoyerDepartement(parc?.dptmt || parc?.departement || "");
    const dossierParc = normaliserNomParcPourChemin(parc?.nom || parc?.nomparc || "");

    if (!departement || !dossierParc) {
      return construireUrlObjet(DOSSIER_IMAGES_PARC_OBJET + "/parc-defaut.webp");
    }

    return construireUrlObjet(
      DOSSIER_IMAGES_PARC_OBJET +
      "/" + encodeURIComponent(departement) +
      "/" + encodeURIComponent(dossierParc) +
      "/" + NOM_IMAGE_CARD_PARC
    );
  }

  function normaliserNomParcPourChemin(valeur) {
    return String(valeur || "")
      .trim()
      .replace(/[ -]/g, "_");
  }

  function redirigerConnexionMembre(motif) {
    const separateur = PAGE_CONNEXION_MEMBRE.includes("?") ? "&" : "?";

    window.location.href =
      PAGE_CONNEXION_MEMBRE +
      separateur +
      "source=" +
      encodeURIComponent(SOURCE_PAGE) +
      "&session=" +
      encodeURIComponent(motif || "inactive");
  }

  function nettoyerEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
  }

  function nettoyerDepartement(valeur) {
    const departement = String(valeur || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (/^[1-9]$/.test(departement)) {
      return "0" + departement;
    }

    return departement;
  }

  function nettoyerTexteCourt(valeur, longueurMax) {
    const texte = String(valeur || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!texte) return "";

    if (texte.length <= longueurMax) return texte;

    return texte.slice(0, Math.max(0, longueurMax - 1)).trim() + "…";
  }

  function construireDateIso(annee, mois, jour) {
    return [
      String(annee).padStart(4, "0"),
      String(mois).padStart(2, "0"),
      String(jour).padStart(2, "0")
    ].join("-");
  }

  function dateAujourdhuiIso() {
    const maintenant = new Date();
    return construireDateIso(
      maintenant.getFullYear(),
      maintenant.getMonth() + 1,
      maintenant.getDate()
    );
  }

  function formaterMoisAnnee(annee, mois) {
    const date = new Date(annee, mois - 1, 1);

    return date.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric"
    });
  }

  function formaterDateFr(dateIso) {
    if (!dateIso) return "";

    const date = new Date(dateIso + "T12:00:00");

    if (Number.isNaN(date.getTime())) return dateIso;

    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function formaterHeureAffichee(heure) {
    return String(heure || "").replace(":", "h");
  }

  function construireLibelleJour(dateIso, ouvert) {
    const date = new Date(dateIso + "T00:00:00");
    const libelleDate = Number.isNaN(date.getTime())
      ? dateIso
      : date.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        });

    return libelleDate + (ouvert ? " disponible" : " indisponible");
  }


  function appliquerRenduPlageLecture(slot, nomPlage, plage) {
    const plageOuverte = plage && plage.ouverte === true;

    if (!plageOuverte) {
      slot.style.visibility = "hidden";
      slot.title = construireTitrePlagePlanning(
        nomPlage,
        null
      );
      return;
    }

    slot.style.removeProperty("visibility");

    const couleurs = normaliserListeCouleursPlanning(plage);

    if (couleurs.length > 1) {
      slot.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois__slot--multicolore"
      );
      slot.style.setProperty(
        "--lcdp-plage-fond",
        construireDegradeCouleursPlanning(couleurs)
      );
    } else {
      slot.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois__slot--" +
        (couleurs[0] || "bleu-clair")
      );
    }

    const largeurJauge = normaliserLargeurJauge(plage?.jauge);

    if (largeurJauge > 0 && plageOuverte) {
      slot.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois__slot--avec-jauge"
      );
      slot.style.setProperty(
        "--lcdp-jauge-largeur",
        largeurJauge + "%"
      );
    }

    slot.title = construireTitrePlagePlanning(
      nomPlage,
      plageOuverte ? plage : null
    );
  }

  function normaliserListeCouleursPlanning(plage) {
    const valeurs = Array.isArray(plage?.couleurs)
      ? plage.couleurs
      : [plage?.couleur];

    const couleursAutorisees = new Set([
      "bleu-clair",
      "bleu-fonce",
      "violet",
      "orange-clair",
      "orange-fonce"
    ]);

    const couleurs = valeurs
      .map(normaliserCouleurClasse)
      .filter((couleur) => couleursAutorisees.has(couleur));

    return couleurs.length ? couleurs : ["bleu-clair"];
  }

  function construireDegradeCouleursPlanning(couleurs) {
    const nombre = couleurs.length;
    const segments = [];

    couleurs.forEach((couleur, index) => {
      const debut = (index * 100) / nombre;
      const fin = ((index + 1) * 100) / nombre;
      const valeurCss = COULEURS_CSS_PLANNING[couleur] ||
        COULEURS_CSS_PLANNING["bleu-clair"];

      segments.push(
        valeurCss + " " + debut + "%",
        valeurCss + " " + fin + "%"
      );
    });

    return "linear-gradient(to right, " + segments.join(", ") + ")";
  }

  function normaliserLargeurJauge(value) {
    const largeur = Number(value);

    if (![0, 60, 80, 100].includes(largeur)) {
      return 0;
    }

    return largeur;
  }

  function construireTitrePlagePlanning(nomPlage, plage) {
    const numero = String(nomPlage || "").replace("plage", "");

    if (!plage || plage.ouverte !== true) {
      return "Plage " + numero + " fermée";
    }

    const categories = Array.isArray(plage.categories)
      ? plage.categories
      : [];

    const libellesCategories = categories.map((categorie) => {
      if (categorie === "DUO") return "Duo";
      if (categorie === "COACH") return "Coach";
      if (categorie === "FAMILLE") return "Famille";
      return String(categorie || "");
    }).filter(Boolean);

    const morceaux = [
      "Plage " + numero,
      plage.debut && plage.fin
        ? plage.debut + "–" + plage.fin
        : "horaire ouvert",
      libellesCategories.length
        ? libellesCategories.join(" + ")
        : "ouverte"
    ];

    if (plage.privatisation) {
      morceaux.push("privatisation");
    }

    const ratio = Number(plage.ratio);

    if (Number.isFinite(ratio) && ratio >= 0) {
      morceaux.push(
        "occupation " + Math.round(ratio * 100) + " %"
      );
    }

    return morceaux.join(" · ");
  }

  function normaliserCouleurClasse(couleur) {
    const valeur = String(couleur || "gris_clair")
      .trim()
      .toLowerCase()
      .replaceAll("_", "-");

    if (
      [
        "gris-moyen",
        "bleu-clair",
        "bleu-fonce",
        "violet",
        "orange-clair",
        "orange-fonce",
        "vert",
        "orange",
        "rouge-clair",
        "rouge",
        "gris-fonce",
        "gris-clair"
      ].includes(valeur)
    ) {
      return valeur;
    }

    if (valeur === "fonce") return "gris-fonce";
    return "gris-clair";
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

  function reponseApiOk(data) {
    return data && (data.ok === true || data.success === true);
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
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
})();
