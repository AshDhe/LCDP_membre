(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "reserver-membre";
  const DOSSIER_IMAGES_PARC_OBJET = "/IMAG/PARC";
  const NOM_IMAGE_CARD_PARC = "card1.webp";

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
    "partage-page-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_PLANNING_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/planning-membre.html");
  const PAGE_PAIEMENT_CB = construireUrlMembre("/ESPACE-MEMBRE/paiement-cb.html");
  const PAGE_PLANNING_PARC_PUBLIC = construireUrlPublic("/ESPACE-PUBLIC/planning-parc.html");

  let pageInitialisee = false;
  let etatMembre = { abonne: false, abonnementSuspendu: false, abonnementAnnuleNonPaye: false, paiementSuspension: null, statudaConnue: false, statuda: null, datenext: null };

  const etatPage = {
    departement: "",
    parcs: [],
    reservationsMembre: [],
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

    try {
      await initialiserBandeau();
      await initialiserFooter();
      etatMembre = await chargerEtatMembre();
      afficherEtatMembre(etatMembre);
      await actualiserBurgerMembre(etatMembre.abonne);
      await initialiserListeParcs();
      initialiserBoutonDepartementPrincipal();
      initialiserActionsPersistantesReserver();
      initialiserActionsListeParcs();
      document.addEventListener("click", gererClicDocument);
      await chargerReservationsMembrePourBlocages();
      await chargerParcsDepartementMembre();
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

    const fragmentListe = await chargerFragmentObjet("/BOX/04-box-liste-card.html");
    slot.innerHTML = "";
    slot.appendChild(fragmentListe);

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

    if (!etatPage.templateCardParc || !etatPage.templateFicheParc || !etatPage.templateMapParc || !etatPage.templateShiftDetailParc || !etatPage.templateJourMois || !etatPage.templateHeureJour) {
      throw new Error("Templates parc, fiche parc, carte parc, shift détail parc, jour ou heure introuvables.");
    }
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
    if (document.getElementById("lcdp-actions-persistantes-reserver")) return;

    injecterStylesActionsPersistantesReserver();

    const barre = document.createElement("div");
    barre.id = "lcdp-actions-persistantes-reserver";
    barre.className = "lcdp-actions-persistantes-reserver";
    barre.hidden = true;
    barre.setAttribute("aria-hidden", "true");

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
    boutonStickyIa.textContent = "Rechercher";
    boutonStickyIa.setAttribute("aria-label", "Rechercher avec l’IA");
    boutonStickyIa.title = "Rechercher avec l’IA";
    boutonStickyIa.addEventListener("click", (event) => {
      event.preventDefault();
      boutonIa.click();
    });

    contenu.appendChild(boutonStickyDepartement);
    contenu.appendChild(boutonStickyIa);
    barre.appendChild(contenu);
    document.body.appendChild(barre);

    const cible = trouverBlocActionsInitialesReserver(boutonDepartement, boutonIa);
    let actionsInitialesVisibles = true;

    function lightboxOuverte() {
      const slotLightbox = document.getElementById("lcdp-lightbox-slot");
      return Boolean(slotLightbox && slotLightbox.children.length > 0);
    }

    function actualiserAffichageBarre() {
      const afficher = actionsInitialesVisibles !== true && !lightboxOuverte();

      barre.hidden = !afficher;
      barre.setAttribute("aria-hidden", afficher ? "false" : "true");
      document.body.classList.toggle("lcdp-actions-persistantes-reserver-actives", afficher);
    }

    if ("IntersectionObserver" in window && cible) {
      const observateurActions = new IntersectionObserver((entries) => {
        actionsInitialesVisibles = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
        actualiserAffichageBarre();
      }, {
        threshold: [0, 0.01, 0.1, 0.5, 1]
      });

      observateurActions.observe(cible);
    } else if (cible) {
      const actualiserDepuisScroll = () => {
        const rect = cible.getBoundingClientRect();
        actionsInitialesVisibles = rect.bottom > 0 && rect.top < window.innerHeight;
        actualiserAffichageBarre();
      };

      window.addEventListener("scroll", actualiserDepuisScroll, { passive: true });
      window.addEventListener("resize", actualiserDepuisScroll);
      actualiserDepuisScroll();
    }

    const slotLightbox = document.getElementById("lcdp-lightbox-slot");

    if (slotLightbox && "MutationObserver" in window) {
      const observateurLightbox = new MutationObserver(actualiserAffichageBarre);
      observateurLightbox.observe(slotLightbox, { childList: true });
    }

    actualiserAffichageBarre();
  }

  function trouverBlocActionsInitialesReserver(boutonDepartement, boutonIa) {
    const candidats = [
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
      .lcdp-actions-persistantes-reserver[hidden] {
        display: none !important;
      }

      .lcdp-actions-persistantes-reserver {
        position: fixed;
        left: 0;
        right: 0;
        bottom: max(10px, env(safe-area-inset-bottom));
        z-index: 2200;
        padding: 0 var(--lcdp-space-2);
        pointer-events: none;
      }

      .lcdp-actions-persistantes-reserver__inner {
        width: min(100%, 520px);
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--lcdp-space-2);
        padding: 8px;
        border: 1px solid var(--lcdp-color-border);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 10px 30px rgba(31, 42, 36, 0.18);
        pointer-events: auto;
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

      body.lcdp-actions-persistantes-reserver-actives .lcdp-site-main {
        padding-bottom: 88px;
      }

      @media (min-width: 768px) {
        .lcdp-actions-persistantes-reserver {
          top: calc(var(--lcdp-bandeau-height, 72px) + 10px);
          bottom: auto;
          padding: 0 var(--lcdp-space-3);
        }

        .lcdp-actions-persistantes-reserver__inner {
          width: min(520px, calc(100vw - 48px));
        }

        .lcdp-actions-persistantes-reserver__button.lcdp-button {
          flex: 1 1 0;
          max-width: 230px;
          min-height: 42px;
          padding: 0.6rem 1rem;
          font-size: 0.95rem;
        }

        body.lcdp-actions-persistantes-reserver-actives .lcdp-site-main {
          padding-bottom: 0;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function initialiserActionsListeParcs() {
    const zoneActions = document.querySelector("[data-lcdp-liste-card-actions]");

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

  async function chargerParcsDepartementMembre() {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      afficherErreurListe("Le service de réservation membre n’est pas configuré.");
      return;
    }

    try {
      masquerMessageListe();

      const zoneListe = obtenirZoneListe();
      if (zoneListe) zoneListe.innerHTML = "";

      const reponse = await fetch(ENDPOINT_NOUVELLE_DATE_MEMBRE + "/autour-de-moi", {
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
        throw new Error(messageErreurApi(data, "Impossible de charger les parcs du département."));
      }

      etatPage.departement = String(data.departement || "");
      etatPage.parcs = Array.isArray(data.parcs) ? data.parcs : [];

      afficherTitreListe();
      afficherParcs(etatPage.parcs);
    } catch (error) {
      console.error("Erreur chargement parcs du département membre :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function chargerParcsDepartement(departement) {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      afficherErreurListe("Le service de réservation membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementListe("Chargement des parcs du département...");

      const reponse = await fetch(
        ENDPOINT_NOUVELLE_DATE_MEMBRE + "/departement?dptmt=" + encodeURIComponent(departement),
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
        throw new Error(messageErreurApi(data, "Impossible de charger les parcs de ce département."));
      }

      etatPage.departement = String(data.departement || departement);
      etatPage.parcs = Array.isArray(data.parcs) ? data.parcs : [];

      afficherTitreListe();
      afficherParcs(etatPage.parcs);
    } catch (error) {
      console.error("Erreur chargement parcs département :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
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

  async function ouvrirFicheParc(parc) {
    await ouvrirShiftDetailParc(parc, "fiche");
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

    if (detail.alerteSlot) {
      detail.alerteSlot.innerHTML = "";
    }

    const vue = vueDemandee || "fiche";
    etatPage.shiftDetailParc = { parc, vue };
    detail.racine.dataset.lcdpShiftVue = vue;

    await preparerTransitionShiftDetailParc(detail.contenu);

    if (vue === "planning") {
      await afficherPlanningMoisParcDansConteneur(detail.contenu, parc);
      return;
    }

    if (vue === "reservation") {
      await afficherReservationMoisParcDansConteneur(detail.contenu, parc, true);
      return;
    }

    await afficherFicheParcDansConteneur(detail.contenu, parc);
  }

  async function preparerTransitionShiftDetailParc(contenu) {
    if (!contenu) return;

    contenu.classList.add("lcdp-box-shift-detail-parc__content--transition");
    await attendre(90);
    contenu.innerHTML = "";
    contenu.classList.remove("lcdp-box-shift-detail-parc__content--transition");
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
      afficherGalerieParcDansSlot(galerieSlot, parc);
    }

    if (mapSlot) {
      afficherCarteParcDansSlot(mapSlot, parc);
    }

    if (contact) {
      remplirBlocTexteFiche(contact, construireTexteContactParc(parc));
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
      conteneur.appendChild(paragraphe);
    });
  }

  function afficherGalerieParcDansSlot(slot, parc) {
    if (!slot) return;

    slot.innerHTML = "";

    const galerie = document.createElement("section");
    galerie.className = "lcdp-component lcdp-box-galerie lcdp-box-fiche-parc__galerie-box";
    galerie.setAttribute("aria-label", "Galerie photo du parc");

    const liste = document.createElement("div");
    liste.className = "lcdp-box-galerie__list";

    const nom = String(parc.nom || parc.nomparc || "Parc").trim() || "Parc";

    for (let index = 1; index <= 6; index += 1) {
      const numero = String(index).padStart(2, "0");
      const card = document.createElement("article");
      card.className = "lcdp-box-galerie__card lcdp-box-fiche-parc__galerie-card";

      const image = document.createElement("img");
      image.className = "lcdp-box-galerie__image lcdp-box-fiche-parc__galerie-image";
      image.src = construireUrlImageParcFichier(parc, numero + ".webp");
      image.alt = "Photo " + numero + " du parc de " + nom;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => {
        card.hidden = true;
      });

      card.appendChild(image);
      liste.appendChild(card);
    }

    galerie.appendChild(liste);
    slot.appendChild(galerie);
  }

  function afficherCarteParcDansSlot(slot, parc) {
    if (!slot) return;

    slot.innerHTML = "";

    const carte = etatPage.templateMapParc
      ? etatPage.templateMapParc.cloneNode(true)
      : null;

    if (!carte) return;

    const coords = carte.querySelector("[data-lcdp-card-map-parc-coords]");
    const latitude = nettoyerTexteFiche(parc.latparc || parc.latitude || "");
    const longitude = nettoyerTexteFiche(parc.lngparc || parc.longitude || "");

    if (coords) {
      coords.textContent = latitude && longitude
        ? latitude + ", " + longitude
        : "Coordonnées GPS non renseignées";
    }

    slot.appendChild(carte);
  }

  function construireTexteContactParc(parc) {
    const lignes = [
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
      afficherPlanningMoisLecture(etatPlanning).catch(console.error);
    });

    boutonSuivant.addEventListener("click", () => {
      if (moisPlanningIdentique(etatPlanning, etatPlanning.moisMaximum)) return;

      changerMois(etatPlanning, 1);
      actualiserNavigationPlanning();
      afficherPlanningMoisLecture(etatPlanning).catch(console.error);
    });

    actualiserNavigationPlanning();

    await afficherPlanningMoisLecture(etatPlanning);
  }

async function afficherPlanningMoisLecture(etatPlanning) {
  const racine = document.querySelector("[data-lcdp-planning-parc-lecture='true']");
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

  async function ouvrirPartagePlanningParc(parc) {
    const emails = await ouvrirDialoguePartageEmails();

    if (!emails) return;

    await envoyerPartagePlanningParc(parc, emails);
    await afficherAlerteSuperposee("La page a été partagée avec les membres.");
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
        const emails = Array.from(liste.querySelectorAll("input[type='email']"))
          .map((input) => nettoyerEmail(input.value))
          .filter(Boolean)
          .filter((email, index, array) => array.indexOf(email) === index);

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
      ouvrirPartagePlanningParc(parc).catch(console.error);
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
    boutonFiche.addEventListener("click", () => {
      afficherVueShiftDetailParc(parc, "fiche").catch(console.error);
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
      ouvrirPartagePlanningParc(parc).catch(console.error);
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

  async function envoyerPartagePlanningParc(parc, emails) {
    if (!ENDPOINT_PARTAGE_PAGE) {
      return;
    }

    const pageUrl = construireUrlPlanningParcPublic(parc);
    const nomParc = String(parc.nom || parc.nomparc || "").trim() || "La Clé du Parc";
    const titre = "Planning du parc de " + nomParc;

    await fetch(ENDPOINT_PARTAGE_PAGE, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pageUrl,
        titre,
        emails
      })
    }).catch((error) => {
      console.warn("Partage page indisponible.", error);
    });
  }

  function construireUrlPlanningParcPublic(parc) {
    const url = new URL(PAGE_PLANNING_PARC_PUBLIC, window.location.href);
    const idparc = String(parc.idparc || parc.id || "").trim();
    const nom = String(parc.nom || parc.nomparc || "").trim();
    const dptmt = String(parc.dptmt || parc.departement || "").trim();

    if (idparc) url.searchParams.set("idparc", idparc);
    if (nom) url.searchParams.set("nom", nom);
    if (dptmt) url.searchParams.set("dptmt", dptmt);

    return url.toString();
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
      planning: []
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
      afficherCalendrierMois(etatCalendrier).catch(console.error);
    });

    boutonSuivant.addEventListener("click", () => {
      changerMois(etatCalendrier, 1);
      afficherCalendrierMois(etatCalendrier).catch(console.error);
    });

    await afficherCalendrierMois(etatCalendrier);
  }

  async function afficherCalendrierMois(etatCalendrier) {
    const moisCourant = document.querySelector("[data-lcdp-calendrier-mois-current]");
    const message = document.querySelector("[data-lcdp-calendrier-mois-message]");
    const grille = document.querySelector("[data-lcdp-calendrier-mois-grid]");

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

    const ouvert = Boolean(planningJour && planningJour.ouvert);
    const estPasse = dateIso < dateAujourdhuiIso();
    const estAujourdhui = dateIso === dateAujourdhuiIso();

    card.dataset.date = dateIso;
    card.dataset.idparc = String(etatCalendrier.parc.idparc || etatCalendrier.parc.id || "");
    card.setAttribute("aria-label", construireLibelleJour(dateIso, ouvert));

    if (numero) {
      numero.textContent = String(numeroJour);
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

    remplirPlagesJour(card, planningJour);

    return card;
  }

  function remplirPlagesJour(card, planningJour) {
    ["plage1", "plage2", "plage3"].forEach((nomPlage) => {
      const slot = card.querySelector('[data-lcdp-card-jour-mois-slot="' + nomPlage + '"]');

      if (!slot) return;

      const plage = planningJour && planningJour.plages ? planningJour.plages[nomPlage] : null;
      const couleur = normaliserCouleurClasse(plage && plage.ouverte ? plage.couleur : "gris_clair");

      slot.className = "lcdp-box-card-jour-in-calendrier-mois__slot lcdp-box-card-jour-in-calendrier-mois__slot--" + couleur;
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
    const cheminImageExplicite = String(parc?.imageparc || "").trim();

    if (cheminImageExplicite && cheminImageExplicite.includes("/")) {
      return construireUrlObjet("/" + cheminImageExplicite.replace(/^\/+/, ""));
    }

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
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
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

  function normaliserCouleurClasse(couleur) {
    const valeur = String(couleur || "gris_clair").trim().toLowerCase();

    if (valeur === "vert") return "vert";
    if (valeur === "rouge_clair" || valeur === "rouge-clair") return "rouge-clair";
    if (valeur === "rouge") return "rouge";
    if (valeur === "orange") return "orange";
    if (valeur === "gris_fonce" || valeur === "gris-fonce" || valeur === "fonce") return "gris-fonce";

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
