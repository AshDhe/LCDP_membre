(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "planning-membre";

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

  const ENDPOINT_INVITER_MEMBRE = construireEndpointApi(
    "workerInviterMembreUrl",
    "WORKER_INVITER_MEMBRE_URL",
    "inviter-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_RESERVER_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/reserver-membres.html");

  let pageInitialisee = false;
  let promesseActualisationEtatMembre = null;

  const etat = {
    reservations: [],
    abonnements: [],
    reservationsAvecInvites: new Set(),
    maxInvitInvitation: 10,
    reservationsParDate: new Map(),
    moisCourant: debutMois(dateAujourdhuiParis()),
    templateJour: null,
    templateReservation: null,
    workflowPlanning: null,
    contenuWorkflowPlanning: null,
    calendrierMois: null,
    membre: {
      abonne: false,
      abonnementSuspendu: false,
      abonnementAnnuleNonPaye: false,
      paiementSuspension: null
    }
  };

  const PLAGES = ["plage1", "plage2", "plage3"];

  /* Limite provisoire : navigation jusqu'à décembre N+1. */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }


  function injecterStylesCorrectifsPlanningMembre() {
    if (document.querySelector('style[data-lcdp-planning-membre-correctifs="true"]')) return;

    const style = document.createElement("style");
    style.dataset.lcdpPlanningMembreCorrectifs = "true";
    style.textContent = `
      .lcdp-box-card-reservation-membre [data-action="adresse"],
      .lcdp-box-card-reservation-membre .lcdp-box-card-reservation-membre__micro-action--acces {
        border-color: var(--lcdp-color-logo-green) !important;
        background: var(--lcdp-color-logo-green) !important;
        color: #ffffff !important;
        text-decoration: none !important;
      }

      .lcdp-box-card-reservation-membre [data-action="adresse"]:hover,
      .lcdp-box-card-reservation-membre .lcdp-box-card-reservation-membre__micro-action--acces:hover {
        border-color: var(--lcdp-color-primary) !important;
        background: var(--lcdp-color-primary) !important;
        color: #ffffff !important;
      }

      .lcdp-box-card-reservation-membre [data-action="invitation"].lcdp-box-card-reservation-membre__micro-action--invit-recu {
        border-color: #7b4ab8 !important;
        background: #7b4ab8 !important;
        color: #ffffff !important;
        font-weight: 700 !important;
        text-decoration: none !important;
      }

      .lcdp-box-card-reservation-membre [data-action="invitation"].lcdp-box-card-reservation-membre__micro-action--invit-recu:hover,
      .lcdp-box-card-reservation-membre [data-action="invitation"].lcdp-box-card-reservation-membre__micro-action--invit-recu:focus-visible {
        border-color: #6d3fa7 !important;
        background: #6d3fa7 !important;
        color: #ffffff !important;
      }

      .lcdp-box-calendrier-mois--planning-membre .lcdp-planning-membre-reserver-row {
        width: 100% !important;
        margin: 0 0 var(--lcdp-space-2) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
      }

      .lcdp-box-calendrier-mois--planning-membre .lcdp-planning-membre-reserver-button {
        position: static !important;
        transform: none !important;
        width: auto !important;
        min-width: 112px !important;
        max-width: none !important;
        min-height: 38px !important;
        margin: 0 !important;
        padding: 8px 16px !important;
        border: 2px solid var(--lcdp-color-orange) !important;
        border-radius: 999px !important;
        background: #ffffff !important;
        color: var(--lcdp-color-orange) !important;
        font: inherit !important;
        font-size: 0.86rem !important;
        line-height: 1 !important;
        font-weight: 700 !important;
        letter-spacing: 0.045em !important;
        text-align: center !important;
        text-decoration: none !important;
        text-transform: uppercase !important;
        white-space: nowrap !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: none !important;
      }

      .lcdp-box-calendrier-mois--planning-membre .lcdp-planning-membre-reserver-button:visited,
      .lcdp-box-calendrier-mois--planning-membre .lcdp-planning-membre-reserver-button:hover {
        color: var(--lcdp-color-orange) !important;
        text-decoration: none !important;
      }

      .lcdp-box-calendrier-mois--planning-membre .lcdp-planning-membre-reserver-button:hover {
        background: rgba(242, 162, 58, 0.10) !important;
        border-color: var(--lcdp-color-orange) !important;
      }

      .lcdp-box-card-reservation-membre--passe [data-lcdp-card-reservation-annuler] {
        display: inline-flex !important;
      }

      .lcdp-box-card-reservation-membre__micro-action--delai-depasse {
        border-color: var(--lcdp-color-border) !important;
        background: var(--lcdp-color-surface-soft) !important;
        color: var(--lcdp-color-text-muted) !important;
        opacity: 0.58 !important;
        cursor: not-allowed !important;
      }

      .lcdp-box-card-reservation-membre__micro-action--delai-depasse:hover {
        border-color: var(--lcdp-color-border) !important;
        background: var(--lcdp-color-surface-soft) !important;
        color: var(--lcdp-color-text-muted) !important;
      }
    `;

    document.head.appendChild(style);
  }

  async function initialiserPage() {
    if (pageInitialisee) return;
    pageInitialisee = true;

    injecterStylesCorrectifsPlanningMembre();

    try {
      await initialiserBandeau();
      await initialiserFooter();

      etat.membre = creerEtatMembreFallback();
      afficherStatutMembrePlanning(etat.membre);

      await initialiserPlanningCalendrier();
      document.addEventListener("click", gererClicDocument);

      lancerActualisationEtatMembrePlanning();
      await chargerReservations();
    } catch (error) {
      console.error("Erreur planning membre :", error);
      afficherErreurCalendrier(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function creerEtatMembreFallback() {
    return {
      abonne: membreAbonne(),
      abonnementSuspendu: false,
      abonnementAnnuleNonPaye: false,
      paiementSuspension: null,
      sourceApi: false
    };
  }

  function lancerActualisationEtatMembrePlanning() {
    if (!promesseActualisationEtatMembre) {
      promesseActualisationEtatMembre = actualiserEtatMembrePlanningSilencieux()
        .catch((error) => {
          console.warn("Statut membre indisponible sur le planning.", error);
          return false;
        })
        .finally(() => {
          promesseActualisationEtatMembre = null;
        });
    }

    return promesseActualisationEtatMembre;
  }

  async function actualiserEtatMembrePlanningSilencieux() {
    try {
      const membre = await chargerEtatMembrePlanning();

      if (!membre) return false;

      etat.membre = membre;
      afficherStatutMembrePlanning(etat.membre);
      return true;
    } catch (error) {
      console.warn("Statut membre indisponible sur le planning.", error);
      return false;
    }
  }

  async function chargerEtatMembrePlanning() {
    if (!ENDPOINT_INDEX_MEMBRE) {
      return {
        abonne: membreAbonne(),
        abonnementSuspendu: false,
        abonnementAnnuleNonPaye: false,
        paiementSuspension: null,
        sourceApi: false
      };
    }

    const reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
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
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible de vérifier votre statut membre."));
    }

    return {
      abonne: valeurBooleenneVraie(data.abonne),
      abonnementSuspendu: valeurBooleenneVraie(data.abonnementSuspendu || data.suspendu),
      abonnementAnnuleNonPaye: valeurBooleenneVraie(data.abonnementAnnuleNonPaye || data.abonnementAnnule || data.annuleNonPaye),
      paiementSuspension: data.paiementSuspension || data.paiementRegularisation || null,
      sourceApi: true
    };
  }

  function afficherStatutMembrePlanning(membre) {
    const mention = document.getElementById("mention-statut-membre");

    if (!mention) return;

    mention.textContent = membre && membre.abonne
      ? "MEMBRE ABONNÉ"
      : "MEMBRE INVITÉ";
  }

  async function initialiserPlanningCalendrier() {
    const slot = document.getElementById("lcdp-planning-calendrier-slot");

    if (!slot) {
      throw new Error("Slot planning calendrier introuvable.");
    }

    slot.innerHTML = "";

    const fragmentWorkflow = await chargerFragmentObjet("/BOX/04-box-workflow-reservation.html");
    slot.appendChild(fragmentWorkflow);

    const workflow = slot.querySelector("[data-lcdp-box-workflow-reservation]");
    const contenu = slot.querySelector("[data-lcdp-workflow-reservation-content]");

    if (!workflow || !contenu) {
      throw new Error("Structure workflow réservation incomplète.");
    }

    workflow.removeAttribute("role");
    workflow.removeAttribute("aria-modal");
    workflow.classList.add(
      "lcdp-box-workflow-reservation--planning-page",
      "lcdp-box-workflow-reservation--calendrier-mois",
      "lcdp-workflow-reservation-box"
    );

    const fragmentCalendrier = await chargerFragmentObjet("/BOX/04-box-calendrier-mois.html");
    contenu.appendChild(fragmentCalendrier);

    const calendrier = contenu.querySelector("[data-lcdp-box-calendrier-mois]");

    if (!calendrier) {
      throw new Error("Structure calendrier mois incomplète.");
    }

    calendrier.removeAttribute("role");
    calendrier.removeAttribute("aria-modal");

    const boutonFermer = calendrier.querySelector("[data-lcdp-calendrier-mois-close]");
    if (boutonFermer) boutonFermer.hidden = true;

    calendrier.classList.add("lcdp-box-calendrier-mois--planning-membre");

    const titre = calendrier.querySelector("[data-lcdp-calendrier-mois-title]");
    if (titre) {
      titre.textContent = "";
      titre.hidden = true;
    }

    const meta = calendrier.querySelector("[data-lcdp-calendrier-mois-meta]");
    if (meta) {
      meta.textContent = "";
      meta.hidden = true;
    }

    const boutonPrecedent = calendrier.querySelector("[data-lcdp-calendrier-mois-prev]");
    const boutonSuivant = calendrier.querySelector("[data-lcdp-calendrier-mois-next]");

    ajouterBoutonReserverPlanning(calendrier);

    if (boutonPrecedent) {
      boutonPrecedent.addEventListener("click", () => {
        etat.moisCourant = ajouterMois(etat.moisCourant, -1);
        afficherCalendrierMois();
      });
    }

    if (boutonSuivant) {
      boutonSuivant.addEventListener("click", () => {
        const prochainMois = ajouterMois(etat.moisCourant, 1);

        if (!moisDansLimiteMaximumPlanning(prochainMois)) return;

        etat.moisCourant = prochainMois;
        afficherCalendrierMois();
      });
    }

    const fragmentJour = await chargerFragmentObjet("/BOX/04-box-card-jour-in-calendrier-mois.html");
    etat.templateJour = fragmentJour.querySelector("[data-lcdp-card-jour-mois]");

    if (!etat.templateJour) {
      throw new Error("Template jour calendrier mois introuvable.");
    }

    const fragmentReservation = await chargerFragmentObjet("/BOX/04-box-card-reservation-membre.html");
    etat.templateReservation = fragmentReservation.querySelector("[data-lcdp-box-card-reservation-membre]");

    if (!etat.templateReservation) {
      throw new Error("Template card réservation membre introuvable.");
    }

    etat.workflowPlanning = workflow;
    etat.contenuWorkflowPlanning = contenu;
    etat.calendrierMois = calendrier;

    afficherChargementCalendrier("Chargement de votre planning...");
  }

  function ajouterBoutonReserverPlanning(calendrier) {
    const card = calendrier ? calendrier.querySelector(".lcdp-box-calendrier-mois__card") : null;
    const header = calendrier ? calendrier.querySelector(".lcdp-box-calendrier-mois__header") : null;
    const body = calendrier ? calendrier.querySelector(".lcdp-box-calendrier-mois__body") : null;
    const navigation = calendrier ? calendrier.querySelector(".lcdp-box-calendrier-mois__navigation") : null;

    if (!card || !header) return;

    /* Sécurité : la navigation mensuelle doit rester dans le body du calendrier. */
    if (body && navigation && navigation.parentNode !== body) {
      body.insertBefore(navigation, body.firstElementChild);
    }

    let ligneReserver = card.querySelector("[data-lcdp-planning-reserver-row]");

    if (!ligneReserver) {
      ligneReserver = document.createElement("div");
      ligneReserver.className = "lcdp-planning-membre-reserver-row";
      ligneReserver.dataset.lcdpPlanningReserverRow = "true";
    }

    if (ligneReserver.parentNode !== card || ligneReserver.nextElementSibling !== header) {
      card.insertBefore(ligneReserver, header);
    }

    let lien = calendrier.querySelector("[data-lcdp-planning-reserver]");

    if (!lien) {
      lien = document.createElement("a");
      lien.dataset.lcdpPlanningReserver = "true";
      lien.textContent = "RÉSERVER";
      lien.setAttribute("aria-label", "Réserver une nouvelle date");
    }

    lien.className = "lcdp-button lcdp-planning-membre-reserver-button";
    lien.href = PAGE_RESERVER_MEMBRE;

    if (lien.parentNode !== ligneReserver) {
      ligneReserver.appendChild(lien);
    }
  }

  async function chargerReservations() {
    if (!ENDPOINT_PLANNING_MEMBRE) {
      afficherErreurCalendrier("Le service planning membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementCalendrier("Chargement de votre planning...");

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
        throw new Error(messageErreurApi(data, "Impossible de charger votre planning."));
      }

      etat.reservations = Array.isArray(data.reservations) ? data.reservations : [];
      etat.abonnements = normaliserAbonnementsMembre(data.abonnements || data.abos || []);
      await chargerStatutsInvitationsPlanning();
      etat.reservationsParDate = indexerReservationsParDate(etat.reservations);
      ajusterMoisCourantSelonReservations();
      afficherCalendrierMois();
    } catch (error) {
      console.error("Erreur chargement planning membre :", error);
      afficherErreurCalendrier(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function chargerStatutsInvitationsPlanning() {
    if (!ENDPOINT_INVITER_MEMBRE || !etat.reservations.length) return;

    try {
      const reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/reservations-invitables", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || !reponseApiOk(data) || !Array.isArray(data.reservations)) {
        return;
      }

      const maxInvit = Number.parseInt(String(data.maxInvit || "0"), 10);

      if (Number.isFinite(maxInvit) && maxInvit > 0) {
        etat.maxInvitInvitation = Math.min(maxInvit, 10);
      }

      const statsParFlux = new Map();
      etat.reservationsAvecInvites.clear();

      data.reservations.forEach((reservation) => {
        const idflux = String(reservation?.idflux || "").trim();
        if (!idflux) return;
        statsParFlux.set(idflux, reservation.invitationStats || { in: 0, out: 0 });
      });

      etat.reservations.forEach((reservation) => {
        const idflux = String(reservation?.idflux || "").trim();
        if (!idflux || !statsParFlux.has(idflux)) return;

        reservation.invitationStats = statsParFlux.get(idflux);

        if (Number(reservation.invitationStats?.in || 0) > 0) {
          etat.reservationsAvecInvites.add(idflux);
        }
      });
    } catch (error) {
      console.warn("Statuts invitation indisponibles :", error);
    }
  }

  function ajusterMoisCourantSelonReservations() {
    const aujourdHui = dateAujourdhuiParis();
    const reservationsAvenir = etat.reservations
      .filter((reservation) => extraireDateFranceReservation(reservation.datebookd) >= aujourdHui)
      .sort((a, b) => String(a.datebookd || "").localeCompare(String(b.datebookd || "")));

    const reservationReference = reservationsAvenir[0] || etat.reservations[0] || null;
    const dateReference = reservationReference ? extraireDateFranceReservation(reservationReference.datebookd) : aujourdHui;

    etat.moisCourant = limiterMoisMaximumPlanning(debutMois(dateReference || aujourdHui));
  }

  function indexerReservationsParDate(reservations) {
    const index = new Map();

    (Array.isArray(reservations) ? reservations : []).forEach((reservation) => {
      const dateIso = extraireDateFranceReservation(reservation.datebookd);
      if (!dateIso) return;

      const plage = normaliserPlageReservation(reservation);
      if (!plage) return;

      if (!index.has(dateIso)) {
        index.set(dateIso, new Map());
      }

      const reservationsJour = index.get(dateIso);

      if (!reservationsJour.has(plage)) {
        reservationsJour.set(plage, []);
      }

      reservationsJour.get(plage).push(reservation);
    });

    return index;
  }

  function afficherCalendrierMois() {
    const calendrier = etat.calendrierMois;
    if (!calendrier || !etat.templateJour) return;

    const courant = limiterMoisMaximumPlanning(etat.moisCourant || debutMois(dateAujourdhuiParis()));
    etat.moisCourant = courant;
    const titreMois = calendrier.querySelector("[data-lcdp-calendrier-mois-current]");
    const grille = calendrier.querySelector("[data-lcdp-calendrier-mois-grid]");
    const message = calendrier.querySelector("[data-lcdp-calendrier-mois-message]");

    if (titreMois) {
      titreMois.textContent = formaterMoisAnnee(courant);
    }

    if (!grille) return;

    grille.innerHTML = "";
    grille.classList.remove("lcdp-box-calendrier-mois__grid--loading");

    const jours = construireJoursMois(courant);

    if (message) {
      message.hidden = true;
      message.textContent = "";
      delete message.dataset.lcdpMessageType;
    }

    actualiserNavigationMoisPlanning();

    const decalageDebut = obtenirDecalageLundi(jours[0].dateIso);

    for (let i = 0; i < decalageDebut; i += 1) {
      grille.appendChild(creerJourVide());
    }

    jours.forEach((jour) => {
      grille.appendChild(creerJourCalendrier(jour));
    });
  }

  function afficherChargementCalendrier() {
    const calendrier = etat.calendrierMois;
    if (!calendrier) return;

    const grille = calendrier.querySelector("[data-lcdp-calendrier-mois-grid]");
    const message = calendrier.querySelector("[data-lcdp-calendrier-mois-message]");

    if (grille) {
      grille.innerHTML = "";
      grille.classList.add("lcdp-box-calendrier-mois__grid--loading");
    }

    if (message) {
      message.hidden = true;
      message.textContent = "";
      delete message.dataset.lcdpMessageType;
    }
  }

  function afficherErreurCalendrier(messageTexte) {
    const calendrier = etat.calendrierMois;

    if (!calendrier) {
      const slot = document.getElementById("lcdp-planning-calendrier-slot");
      if (slot) slot.textContent = messageTexte || "Erreur technique.";
      return;
    }

    const grille = calendrier.querySelector("[data-lcdp-calendrier-mois-grid]");
    const message = calendrier.querySelector("[data-lcdp-calendrier-mois-message]");

    if (grille) {
      grille.innerHTML = "";
      grille.classList.remove("lcdp-box-calendrier-mois__grid--loading");
    }

    if (message) {
      message.hidden = false;
      message.textContent = messageTexte || "Erreur technique.";
      message.dataset.lcdpMessageType = "erreur";
    }
  }

  function creerJourVide() {
    const jour = etat.templateJour.cloneNode(true);
    jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--empty");
    jour.disabled = true;
    jour.setAttribute("aria-hidden", "true");
    return jour;
  }

  function creerJourCalendrier(jourMois) {
    const jour = etat.templateJour.cloneNode(true);
    const numero = jour.querySelector("[data-lcdp-card-jour-mois-number]");
    const reservationsJour = etat.reservationsParDate.get(jourMois.dateIso) || new Map();
    const aujourdHui = dateAujourdhuiParis();
    const estPasse = jourMois.dateIso < aujourdHui;
    const estAujourdhui = jourMois.dateIso === aujourdHui;
    const estDansAbonnementAvenir = !estPasse && dateDansPeriodeAbonnementMembre(jourMois.dateIso);
    let jourReservable = false;

    if (numero) numero.textContent = String(jourMois.jour);

    jour.dataset.date = jourMois.dateIso;

    if (estPasse) jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--past");
    if (estDansAbonnementAvenir) jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--abonnement-avenir");
    if (estAujourdhui) jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--today");

    PLAGES.forEach((plage) => {
      const slot = jour.querySelector(`[data-lcdp-card-jour-mois-slot="${plage}"]`);
      if (!slot) return;

      slot.className = "lcdp-box-card-jour-in-calendrier-mois__slot lcdp-box-card-jour-in-calendrier-mois__slot--gris-clair";
      slot.removeAttribute("data-idflux");
      slot.removeAttribute("data-plage");

      const reservationsPlage = reservationsJour.get(plage) || [];
      const reservation = reservationsPlage[0] || null;

      if (!reservation) return;

      jourReservable = true;
      jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--reservation-membre");

      const estReservationInvitationPlanning = reservationHorsAbonnementMembre(reservation);

      if (estReservationInvitationPlanning) {
        jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--reservation-invitation");
        slot.classList.add("lcdp-box-card-jour-in-calendrier-mois__slot--reservation-invitation");
      } else if (estPasse) {
        jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--reservation-membre-passee");
        slot.classList.add("lcdp-box-card-jour-in-calendrier-mois__slot--vert-passe");
      } else {
        slot.classList.add("lcdp-box-card-jour-in-calendrier-mois__slot--vert");
      }

      const nomParcSlot = nomParcCourtReservation(reservation);
      const nomParcComplet = nomParcReservation(reservation);

      if (nomParcSlot) {
        const libelleParc = document.createElement("span");
        libelleParc.className = "lcdp-box-card-jour-in-calendrier-mois__slot-label";
        libelleParc.textContent = nomParcSlot;
        libelleParc.setAttribute("aria-hidden", "true");
        slot.appendChild(libelleParc);
      }

      slot.dataset.idflux = String(reservation.idflux || "");
      slot.dataset.plage = plage;
      slot.setAttribute(
        "aria-label",
        "Réservation " +
          (nomParcComplet ? nomParcComplet + " - " : "") +
          libellePlage(plage) +
          " du " +
          formaterDateCourte(reservation.datebookd)
      );
      slot.title = "Réservation " + (nomParcComplet ? nomParcComplet + " - " : "") + libellePlage(plage);
    });

    jour.disabled = !jourReservable;

    if (jourReservable) {
      jour.addEventListener("click", gererClicJourCalendrier);
    }

    return jour;
  }

  function gererClicJourCalendrier(event) {
    const slot = event.target.closest("[data-lcdp-card-jour-mois-slot]");

    if (!slot || !slot.dataset.idflux) return;

    const reservation = etat.reservations.find((item) => String(item.idflux || "") === String(slot.dataset.idflux || ""));

    if (!reservation) {
      afficherAlerte("Réservation introuvable.").catch(console.error);
      return;
    }

    ouvrirReservationPlanning(reservation).catch(console.error);
  }

  async function ouvrirReservationPlanning(reservation) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot || !etat.templateReservation) return;

    slot.innerHTML = "";

    const fragmentWorkflow = await chargerFragmentObjet("/BOX/04-box-workflow-reservation.html");
    slot.appendChild(fragmentWorkflow);

    const workflow = slot.querySelector("[data-lcdp-box-workflow-reservation]");
    const contenu = slot.querySelector("[data-lcdp-workflow-reservation-content]");

    if (!workflow || !contenu) {
      slot.innerHTML = "";
      throw new Error("Structure workflow réservation incomplète.");
    }

    workflow.classList.add(
      "lcdp-box-workflow-reservation--planning-reservation",
      "lcdp-box-workflow-reservation--confirmation",
      "lcdp-workflow-reservation-box"
    );

    const boutonFermer = document.createElement("button");
    boutonFermer.type = "button";
    boutonFermer.className = "lcdp-box-calendrier-mois__close";
    boutonFermer.setAttribute("aria-label", "Fermer");
    boutonFermer.textContent = "×";

    const vues = document.createElement("div");
    vues.className = "lcdp-planning-reservation-vues";
    vues.dataset.lcdpPlanningReservationVues = "true";

    const vueReservation = document.createElement("div");
    vueReservation.className = "lcdp-planning-reservation-vue lcdp-planning-reservation-vue--active";
    vueReservation.dataset.lcdpPlanningVue = "reservation";

    const card = creerCardReservation(reservation);
    vueReservation.appendChild(card);
    vues.appendChild(vueReservation);

    contenu.appendChild(boutonFermer);
    contenu.appendChild(vues);

    function fermer() {
      document.removeEventListener("keydown", gererEchapReservation);
      slot.innerHTML = "";
    }

    function gererEchapReservation(event) {
      if (event.key !== "Escape") return;

      if (workflow.classList.contains("lcdp-box-workflow-reservation--acces-parc-ouvert")) {
        event.preventDefault();
        fermerAccesParcDansReservation(workflow);
        return;
      }

      fermer();
    }

    boutonFermer.addEventListener("click", fermer);
    workflow.addEventListener("click", (event) => {
      if (event.target === workflow) fermer();
    });

    document.addEventListener("keydown", gererEchapReservation);
  }

  function creerCardReservation(reservation) {
    const card = etat.templateReservation.cloneNode(true);

    const estPasse = reservationPasseePlanning(reservation);
    const delaiActionDepasse = reservationDelaiActionDepasse(reservation);

    const parc = reservation.parc || {};
    const nomParc = parc.nom || parc.nomparc || reservation.nomparc || "Parc";
    const departement = parc.dptmt || parc.departement || reservation.dptmt || "";
    const idParc = parc.idparc || reservation.idparc || "";
    const idFlux = reservation.idflux || "";
    const imageParc =
      construireCheminImageParcParDefaut(nomParc, departement) ||
      parc.imageparc ||
      parc.image ||
      reservation.imageparc ||
      reservation.image ||
      "";

    const media = card.querySelector("[data-lcdp-card-reservation-media]");
    const image = card.querySelector("[data-lcdp-card-reservation-image]");
    const invitation = card.querySelector("[data-lcdp-card-reservation-invitation]");
    const badgeInvitation = card.querySelector("[data-lcdp-card-reservation-invitation-badge]");
    const date = card.querySelector("[data-lcdp-card-reservation-date]");
    const heure = card.querySelector("[data-lcdp-card-reservation-heure]");
    const parcElement = card.querySelector("[data-lcdp-card-reservation-parc]");
    const departementElement = card.querySelector("[data-lcdp-card-reservation-departement]");
    const boutonAdresse = card.querySelector("[data-action='adresse']");
    const boutonInvitation = card.querySelector("[data-action='invitation']");
    const boutonAnnuler = card.querySelector("[data-action='annuler']");

    card.dataset.idflux = idFlux;

    if (estPasse) {
      card.classList.add("lcdp-box-card-reservation-membre--passe");
    }

    const estReservationHorsAbonnement = reservationHorsAbonnementMembre(reservation);

    if (estReservationHorsAbonnement) {
      card.classList.add("lcdp-box-card-reservation-membre--invitation");
    }

    if (image && media) {
      const srcImage = construireUrlImageParc(imageParc);

      if (srcImage) {
        image.src = srcImage;
        image.alt = "Parc de " + nomParc;
        media.hidden = false;
        card.classList.add("lcdp-box-card-reservation-membre--avec-image");
      } else {
        image.removeAttribute("src");
        image.alt = "";
        media.hidden = true;
      }
    }

    if (invitation) {
      invitation.textContent = "";
      invitation.hidden = true;
    }

    if (date) date.textContent = formaterDateCourte(reservation.datebookd);
    if (heure) heure.textContent = formaterHeureReservation(reservation.datebookd);
    if (parcElement) parcElement.textContent = "Parc de " + nomParc;

    if (departementElement) {
      departementElement.textContent = departement ? "(" + departement + ")" : "";
      departementElement.hidden = !departement;
    }

    if (boutonAdresse) {
      boutonAdresse.textContent = "Accès";
      boutonAdresse.classList.add("lcdp-box-card-reservation-membre__micro-action--acces");
      boutonAdresse.dataset.idparc = idParc;
      boutonAdresse.dataset.id = idFlux;
    }

    if (boutonInvitation) {
      boutonInvitation.dataset.id = idFlux;
      boutonInvitation.hidden = false;
      boutonInvitation.classList.remove(
        "lcdp-box-card-reservation-membre__micro-action--delai-depasse",
        "lcdp-box-card-reservation-membre__micro-action--invit-recu"
      );

      if (estReservationHorsAbonnement) {
        boutonInvitation.textContent = "Invit’";
        boutonInvitation.classList.add("lcdp-box-card-reservation-membre__micro-action--invit-recu");
        boutonInvitation.setAttribute("aria-disabled", "false");
        boutonInvitation.title = "Afficher le parrain";
      } else {
        boutonInvitation.textContent = reservationAvecInvitesPlanning(reservation) ? "Invité(s)" : "Inviter";
        boutonInvitation.setAttribute("aria-disabled", "false");
        boutonInvitation.removeAttribute("title");
      }
    }

    if (badgeInvitation) {
      badgeInvitation.textContent = "";
      badgeInvitation.hidden = true;
      badgeInvitation.setAttribute("aria-hidden", "true");
    }

    if (boutonAnnuler) {
      boutonAnnuler.dataset.id = idFlux;
      boutonAnnuler.hidden = false;
      boutonAnnuler.classList.toggle("lcdp-box-card-reservation-membre__micro-action--delai-depasse", delaiActionDepasse);
      boutonAnnuler.setAttribute("aria-disabled", delaiActionDepasse ? "true" : "false");

      if (delaiActionDepasse) {
        boutonAnnuler.title = "Délai dépassé";
      } else {
        boutonAnnuler.removeAttribute("title");
      }
    }

    return card;
  }

  function creerLigneInvitation(reservation, estReservationHorsAbonnement) {
    if (estReservationHorsAbonnement !== true) return "";

    const parrain = reservation.parrain || null;

    if (!parrain) return "Invitation";

    const nom = parrain.nommembre || parrain.nom || "";
    const prenom = parrain.prenommembre || parrain.prenom || "";

    const identite = [nom, prenom]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");

    return identite ? "Invitation (" + identite + ")" : "Invitation";
  }

  async function gererClicDocument(event) {
    const boutonAdresse = event.target.closest("[data-action='adresse']");
    const boutonInvitation = event.target.closest("[data-action='invitation']");
    const boutonAnnuler = event.target.closest("[data-action='annuler']");

    if (boutonAdresse) {
      const cardReservation = boutonAdresse.closest("[data-lcdp-box-card-reservation-membre]");
      const idflux = String(boutonAdresse.dataset.id || cardReservation?.dataset.idflux || "").trim();
      await ouvrirAccesParcReservation(idflux, boutonAdresse);
      return;
    }

    if (boutonInvitation) {
      await ouvrirPageInvitation(String(boutonInvitation.dataset.id || ""), boutonInvitation);
      return;
    }

    if (boutonAnnuler) {
      await traiterAnnulationReservation(boutonAnnuler);
    }
  }

  async function ouvrirAccesParcReservation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) {
      await afficherAlerte("Réservation manquante.");
      return;
    }

    const reservation = etat.reservations.find((item) => String(item.idflux || "") === idReservation);

    if (!reservation) {
      await afficherAlerte("Réservation introuvable.");
      return;
    }

    const workflow = declencheur
      ? declencheur.closest("[data-lcdp-box-workflow-reservation]")
      : document.querySelector("#lcdp-lightbox-slot [data-lcdp-box-workflow-reservation]");

    if (!workflow) return;

    const vues = workflow.querySelector("[data-lcdp-planning-reservation-vues]");
    const vueReservation = workflow.querySelector('[data-lcdp-planning-vue="reservation"]');

    if (!vues || !vueReservation) return;

    let vueAcces = workflow.querySelector('[data-lcdp-planning-vue="acces"]');
    let boxAcces = vueAcces ? vueAcces.querySelector("[data-lcdp-box-card-acces-parc]") : null;

    if (!vueAcces || !boxAcces) {
      vueAcces = document.createElement("div");
      vueAcces.className = "lcdp-planning-reservation-vue";
      vueAcces.dataset.lcdpPlanningVue = "acces";
      vueAcces.hidden = true;

      const fragmentAcces = await chargerFragmentObjet("/BOX/04-box-card-acces-parc.html");
      vueAcces.appendChild(fragmentAcces);
      vues.appendChild(vueAcces);

      boxAcces = vueAcces.querySelector("[data-lcdp-box-card-acces-parc]");

      if (!boxAcces) {
        throw new Error("Structure accès parc introuvable.");
      }

      preparerBoxAccesParcInline(boxAcces, workflow);
    }

    await remplirBoxAccesParc(boxAcces, reservation);

    workflow.dataset.lcdpAccesDeclencheurId = declencheur && declencheur.id ? declencheur.id : "";
    workflow._lcdpDernierDeclencheurAcces = declencheur || null;

    vueReservation.hidden = true;
    vueReservation.classList.remove("lcdp-planning-reservation-vue--active");

    vueAcces.hidden = false;
    vueAcces.classList.add("lcdp-planning-reservation-vue--active");
    workflow.classList.add("lcdp-box-workflow-reservation--acces-parc-ouvert");

    const retour = boxAcces.querySelector("[data-lcdp-card-acces-parc-retour]");
    const titre = boxAcces.querySelector("[data-lcdp-card-acces-parc-title]");

    if (retour && typeof retour.focus === "function") {
      retour.focus({ preventScroll: true });
    } else if (titre && typeof titre.focus === "function") {
      titre.focus({ preventScroll: true });
    }
  }

  function preparerBoxAccesParcInline(boxAcces, workflow) {
    boxAcces.classList.add("lcdp-box-card-acces-parc--inline");
    boxAcces.removeAttribute("aria-modal");
    boxAcces.setAttribute("role", "region");

    const boutonRetour = boxAcces.querySelector("[data-lcdp-card-acces-parc-retour]");
    const header = boxAcces.querySelector(".lcdp-box-card-acces-parc__header");
    const titre = boxAcces.querySelector("[data-lcdp-card-acces-parc-title]");

    if (boutonRetour) {
      boutonRetour.addEventListener("click", () => fermerAccesParcDansReservation(workflow));

      if (header) {
        let ligneRetour = boxAcces.querySelector(".lcdp-box-card-acces-parc__retour-row");

        if (!ligneRetour) {
          ligneRetour = document.createElement("div");
          ligneRetour.className = "lcdp-box-card-acces-parc__retour-row";
          header.insertAdjacentElement("beforebegin", ligneRetour);
        }

        if (boutonRetour.parentNode !== ligneRetour) {
          ligneRetour.appendChild(boutonRetour);
        }
      }
    }

    if (titre) {
      titre.tabIndex = -1;
    }
  }

  function fermerAccesParcDansReservation(workflow) {
    const racine = workflow || document.querySelector("#lcdp-lightbox-slot [data-lcdp-box-workflow-reservation]");
    if (!racine) return;

    const vueReservation = racine.querySelector('[data-lcdp-planning-vue="reservation"]');
    const vueAcces = racine.querySelector('[data-lcdp-planning-vue="acces"]');

    if (vueAcces) {
      vueAcces.hidden = true;
      vueAcces.classList.remove("lcdp-planning-reservation-vue--active");
    }

    if (vueReservation) {
      vueReservation.hidden = false;
      vueReservation.classList.add("lcdp-planning-reservation-vue--active");
    }

    racine.classList.remove("lcdp-box-workflow-reservation--acces-parc-ouvert");

    const declencheur = racine._lcdpDernierDeclencheurAcces;
    if (declencheur && typeof declencheur.focus === "function") {
      declencheur.focus({ preventScroll: true });
    }
  }

  async function remplirBoxAccesParc(boxAcces, reservation) {
    const parc = reservation.parc || {};
    const nomParc = parc.nom || parc.nomparc || reservation.nomparc || "Parc";
    const departement = parc.dptmt || parc.departement || reservation.dptmt || "";

    const titre = boxAcces.querySelector("[data-lcdp-card-acces-parc-title]");
    const slotMap = boxAcces.querySelector("[data-lcdp-card-acces-parc-map-slot]");
    const zoneAdresse = boxAcces.querySelector("[data-lcdp-card-acces-parc-adresse]");
    const zoneEntree = boxAcces.querySelector("[data-lcdp-card-acces-parc-entree]");
    const slotGalerie = boxAcces.querySelector("[data-lcdp-card-acces-parc-galerie-slot]");

    if (titre) titre.textContent = "Accès au parc de " + nomParc;

    if (slotMap) {
      await remplirMapParc(slotMap, parc);
    }

    if (zoneAdresse) {
      remplirAdresseParc(zoneAdresse, parc);
    }

    if (zoneEntree) {
      zoneEntree.textContent = String(parc.entreeparc || reservation.entreeparc || "Entrée du parc à renseigner.").trim();
    }

    if (slotGalerie) {
      await remplirGalerieEntreeParc(slotGalerie, {
        nomParc,
        departement
      });
    }
  }

  async function remplirMapParc(slotMap, parc) {
    slotMap.innerHTML = "";

    const fragmentMap = await chargerFragmentObjet("/BOX/04-box-card-map-parc.html");
    slotMap.appendChild(fragmentMap);

    const coords = slotMap.querySelector("[data-lcdp-card-map-parc-coords]");
    const lat = nettoyerCoordonneeParc(parc.latparc);
    const lng = nettoyerCoordonneeParc(parc.lngparc);

    if (coords) {
      coords.textContent = lat && lng
        ? "Lat. " + lat + " · Lng. " + lng
        : "Coordonnées à renseigner.";
    }
  }

  function remplirAdresseParc(zoneAdresse, parc) {
    zoneAdresse.innerHTML = "";

    const lignes = [parc.adresse1, parc.adresse2, parc.adresse3]
      .map((ligne) => String(ligne || "").trim())
      .filter(Boolean);

    if (!lignes.length) {
      const ligneVide = document.createElement("p");
      ligneVide.textContent = "Adresse à renseigner.";
      zoneAdresse.appendChild(ligneVide);
      return;
    }

    lignes.forEach((ligne) => {
      const paragraphe = document.createElement("p");
      paragraphe.textContent = ligne;
      zoneAdresse.appendChild(paragraphe);
    });
  }

  async function remplirGalerieEntreeParc(slotGalerie, data) {
    if (!slotGalerie) return;

    slotGalerie.innerHTML = "";
    slotGalerie.classList.add("lcdp-box-card-acces-parc__photos");

    const liste = document.createElement("div");
    liste.className = "lcdp-box-card-acces-parc__photos-list";

    ["entree1.webp", "entree2.webp"].forEach((fichier, index) => {
      liste.appendChild(creerPhotoEntreeParc({
        chemin: construireCheminImageParcFichier(data.nomParc, data.departement, fichier),
        alt: "Entrée " + String(index + 1) + " du parc de " + data.nomParc
      }));
    });

    slotGalerie.appendChild(liste);
  }

  function creerPhotoEntreeParc(data) {
    const figure = document.createElement("figure");
    figure.className = "lcdp-box-card-acces-parc__photo";

    const image = document.createElement("img");
    image.className = "lcdp-box-card-acces-parc__photo-image";
    image.alt = data.alt || "Entrée du parc";
    image.loading = "eager";
    image.decoding = "async";
    image.src = construireUrlImageParc(data.chemin || "");

    figure.appendChild(image);

    return figure;
  }

  function nettoyerCoordonneeParc(value) {
    const texte = String(value ?? "").trim();
    if (!texte) return "";

    const nombre = Number(texte.replace(",", "."));
    if (!Number.isFinite(nombre)) return texte;

    return String(Math.round(nombre * 1000000) / 1000000);
  }

  async function ouvrirPageInvitation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) {
      await afficherAlerteInvitationReservation("Réservation manquante.", declencheur);
      return;
    }

    const reservation = trouverReservationPlanningParId(idReservation);

    if (!reservation) {
      await afficherAlerteInvitationReservation("Réservation introuvable.", declencheur);
      return;
    }

    if (reservationHorsAbonnementMembre(reservation)) {
      await afficherAlerteInvitationReservation(formaterParrainInvitationRecue(reservation), declencheur);
      return;
    }

    if (reservationAvecInvitesPlanning(reservation)) {
      await ouvrirListeInvitesReservation(idReservation, declencheur);
      return;
    }

    const blocageInvitation = determinerBlocageInvitationReservation(reservation);

    if (blocageInvitation) {
      await afficherAlerteInvitationReservation(blocageInvitation, declencheur);
      return;
    }

    const blocageAcces = determinerBlocageReservationPlanning(etat.membre || creerEtatMembreFallback());

    if (blocageAcces) {
      await afficherAlerteInvitationReservation(blocageAcces, declencheur);
      return;
    }

    const resultat = await ouvrirBoxEmailsInvitationReservation(idReservation, declencheur);

    if (!resultat) return;

    if (invitationReservationCreee(resultat)) {
      marquerReservationAvecInvitesPlanning(idReservation, declencheur);
      await afficherAlerteInvitationReservation(resultat.message || "Invitation envoyée.", declencheur);
    }
  }

  function trouverReservationPlanningParId(idflux) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) return null;

    return etat.reservations.find((item) => String(item.idflux || "") === idReservation) || null;
  }

  function formaterParrainInvitationRecue(reservation) {
    const affichage = nettoyerTexteSimple(reservation?.parrainInvitation?.affichage || "");

    if (affichage) return affichage;

    const parrain = reservation?.parrainInvitation || reservation?.parrain || {};
    const alias = nettoyerTexteSimple(
      parrain.alias ||
      parrain.aliasmembre ||
      reservation?.aliasparrain ||
      reservation?.aliasParrain ||
      ""
    );

    if (alias) return alias;

    const prenom = nettoyerTexteSimple(
      parrain.prenommembre ||
      parrain.prenom ||
      reservation?.prenomparrain ||
      reservation?.prenomParrain ||
      ""
    );
    const nom = nettoyerTexteSimple(
      parrain.nommembre ||
      parrain.nom ||
      reservation?.nomparrain ||
      reservation?.nomParrain ||
      ""
    );
    const initialeNom = nom ? nom.charAt(0).toUpperCase() + "." : "";
    const identite = [prenom, initialeNom].filter(Boolean).join(" ");

    return identite || "Parrain non renseigné";
  }

  function reservationAvecInvitesPlanning(reservation) {
    const idflux = String(reservation?.idflux || "").trim();

    if (!idflux) return false;
    if (etat.reservationsAvecInvites.has(idflux)) return true;
    if (reservationDelaiActionDepasse(reservation)) return true;

    const stats = reservation?.invitationStats || reservation?.invitationsStats || null;
    const invitesActifs = Number(stats?.in || stats?.actifs || stats?.invites || 0);

    return Number.isFinite(invitesActifs) && invitesActifs > 0;
  }

  function invitationReservationCreee(data) {
    if (!data || !reponseApiOk(data)) return false;

    if (Array.isArray(data.invitations) && data.invitations.length > 0) return true;
    if (Array.isArray(data.emailsValides) && data.emailsValides.length > 0) return true;

    return Number(data.nbInvitations || 0) > 0;
  }

  function marquerReservationAvecInvitesPlanning(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) return;

    etat.reservationsAvecInvites.add(idReservation);

    const reservation = trouverReservationPlanningParId(idReservation);

    if (reservation) {
      const statsActuelles = reservation.invitationStats || {};
      const invitesActifs = Number(statsActuelles.in || 0);
      const invitesAnnules = Number(statsActuelles.out || 0);

      reservation.invitationStats = {
        ...statsActuelles,
        in: invitesActifs > 0 ? invitesActifs : (invitesAnnules > 0 ? 0 : 1),
        out: invitesAnnules > 0 ? invitesAnnules : Number(statsActuelles.out || 0)
      };
    }

    actualiserBoutonsInvitationPlanning(idReservation, declencheur);
  }

  function actualiserBoutonsInvitationPlanning(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();
    const reservation = trouverReservationPlanningParId(idReservation);

    if (!idReservation || !reservation) return;

    const boutons = [];

    if (declencheur) boutons.push(declencheur);

    document
      .querySelectorAll('[data-action="invitation"][data-id="' + echapperSelecteurCss(idReservation) + '"]')
      .forEach((bouton) => boutons.push(bouton));

    boutons.forEach((bouton) => {
      if (!bouton) return;

      bouton.hidden = false;
      bouton.classList.remove(
        "lcdp-box-card-reservation-membre__micro-action--delai-depasse",
        "lcdp-box-card-reservation-membre__micro-action--invit-recu"
      );

      if (reservationHorsAbonnementMembre(reservation)) {
        bouton.textContent = "Invit’";
        bouton.classList.add("lcdp-box-card-reservation-membre__micro-action--invit-recu");
        bouton.setAttribute("aria-disabled", "false");
        bouton.title = "Afficher le parrain";
        return;
      }

      bouton.textContent = reservationAvecInvitesPlanning(reservation) ? "Invité(s)" : "Inviter";
      bouton.setAttribute("aria-disabled", "false");
      bouton.removeAttribute("title");
    });
  }

  async function ouvrirListeInvitesReservation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();
    const reservation = trouverReservationPlanningParId(idReservation);
    const invites = await chargerInvitesReservation(idReservation, declencheur);

    if (!invites) return;

    if (reservation && reservationDelaiActionDepasse(reservation)) {
      await ouvrirBoxListeInvitesLectureSeule(idReservation, invites, declencheur);
      return;
    }

    await ouvrirBoxListeInvitesModifiable(idReservation, invites, declencheur);
  }

  async function chargerInvitesReservation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) {
      await afficherAlerteInvitationReservation("Réservation manquante.", declencheur);
      return null;
    }

    if (!ENDPOINT_INVITER_MEMBRE) {
      await afficherAlerteInvitationReservation("Le service invitation membre n’est pas configuré.", declencheur);
      return null;
    }

    const reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/invites?idflux=" + encodeURIComponent(idReservation), {
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
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      await afficherAlerteInvitationReservation(messageErreurApi(data, "Impossible de charger la liste des invités."), declencheur);
      return null;
    }

    return Array.isArray(data.invites) ? data.invites : [];
  }

  async function ouvrirBoxListeInvitesLectureSeule(idflux, invites, declencheur) {
    const workflow = declencheur
      ? declencheur.closest("[data-lcdp-box-workflow-reservation]")
      : document.querySelector("#lcdp-lightbox-slot [data-lcdp-box-workflow-reservation]");

    const slot = document.getElementById("lcdp-lightbox-slot");
    const conteneur = document.createElement("div");
    conteneur.className = "lcdp-box-card-listinvites-oui-non lcdp-box-card-listinvites-oui-non--lecture";
    conteneur.dataset.lcdpInvitationInvitesOverlay = "true";
    conteneur.setAttribute("role", "dialog");
    conteneur.setAttribute("aria-modal", "true");
    conteneur.setAttribute("aria-labelledby", "lcdp-listinvites-lecture-title");

    if (workflow && slot) {
      slot.appendChild(conteneur);
    } else {
      document.body.appendChild(conteneur);
    }

    const card = document.createElement("article");
    card.className = "lcdp-box-card-listinvites-oui-non__card lcdp-box-card-listinvites-oui-non__card--lecture";

    const titre = document.createElement("h2");
    titre.className = "lcdp-box-card-listinvites-oui-non__title";
    titre.id = "lcdp-listinvites-lecture-title";
    titre.textContent = "Invité(s)";

    const liste = document.createElement("ul");
    liste.className = "lcdp-box-card-listinvites-oui-non__list lcdp-box-card-listinvites-oui-non__list--lecture";

    const invitesActifs = Array.isArray(invites) ? invites : [];

    if (!invitesActifs.length) {
      const message = document.createElement("p");
      message.className = "lcdp-box-card-listinvites-oui-non__message";
      message.textContent = "Aucun invité enregistré pour cette réservation.";
      card.appendChild(titre);
      card.appendChild(message);
    } else {
      invitesActifs.forEach((invite) => {
        liste.appendChild(creerLigneInviteLectureSeule(invite));
      });

      card.appendChild(titre);
      card.appendChild(liste);
    }

    const actions = document.createElement("div");
    actions.className = "lcdp-box-card-listinvites-oui-non__actions";

    const boutonOk = document.createElement("button");
    boutonOk.type = "button";
    boutonOk.className = "lcdp-button lcdp-button-primary";
    boutonOk.textContent = "OK";
    actions.appendChild(boutonOk);

    card.appendChild(actions);
    conteneur.appendChild(card);

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        conteneur.remove();
        resolve(true);
      }

      function gererEchap(event) {
        if (event.key === "Escape") fermer();
      }

      boutonOk.addEventListener("click", fermer);
      document.addEventListener("keydown", gererEchap);
    });
  }

  async function ouvrirBoxListeInvitesModifiable(idflux, invites, declencheur) {
    const idReservation = String(idflux || "").trim();
    const workflow = declencheur
      ? declencheur.closest("[data-lcdp-box-workflow-reservation]")
      : document.querySelector("#lcdp-lightbox-slot [data-lcdp-box-workflow-reservation]");

    const slot = document.getElementById("lcdp-lightbox-slot");
    const conteneur = document.createElement("div");
    conteneur.dataset.lcdpInvitationInvitesOverlay = "true";

    if (workflow && slot) {
      slot.appendChild(conteneur);
    } else {
      document.body.appendChild(conteneur);
    }

    const fragment = await chargerFragmentObjet("/BOX/04-box-card-listinvites-oui-non.html");
    conteneur.appendChild(fragment);

    const box = conteneur.querySelector("[data-lcdp-box-card-listinvites-oui-non]");
    const titre = conteneur.querySelector("[data-lcdp-listinvites-title]");
    const message = conteneur.querySelector("[data-lcdp-listinvites-message]");
    const liste = conteneur.querySelector("[data-lcdp-listinvites-list]");
    const zoneAjout = conteneur.querySelector("[data-lcdp-listinvites-ajout]");
    const listeEmails = conteneur.querySelector("[data-lcdp-listinvites-emails]");
    const boutonAjouterEmail = conteneur.querySelector("[data-lcdp-listinvites-add-email]");
    const boutonFermer = conteneur.querySelector("[data-lcdp-listinvites-close]");
    const boutonMettreAJour = conteneur.querySelector("[data-lcdp-listinvites-update]");
    const boutonAnnuler = conteneur.querySelector("[data-lcdp-listinvites-cancel]");

    if (!box || !titre || !message || !liste || !zoneAjout || !listeEmails || !boutonAjouterEmail || !boutonMettreAJour || !boutonAnnuler) {
      conteneur.remove();
      throw new Error("Structure liste invités oui/non incomplète.");
    }

    titre.textContent = "Invité(s)";
    liste.innerHTML = "";
    listeEmails.innerHTML = "";

    const invitesListe = Array.isArray(invites) ? invites : [];
    const limiteTotale = limiteEmailsInvitation();
    const placesDisponibles = Math.max(0, limiteTotale - invitesListe.length);

    function afficherMessage(texte, estErreur = false) {
      message.hidden = !texte;
      message.textContent = texte || "";
      message.classList.toggle("lcdp-box-card-listinvites-oui-non__message--erreur", estErreur === true);
    }

    if (!invitesListe.length) {
      afficherMessage("Aucun invité actif enregistré pour cette réservation.");
    } else {
      afficherMessage("");
      invitesListe.forEach((invite) => {
        liste.appendChild(creerLigneInviteOuiNon(invite));
      });
    }

    if (placesDisponibles <= 0) {
      zoneAjout.hidden = true;
      boutonAjouterEmail.disabled = true;
    } else {
      zoneAjout.hidden = false;
      boutonAjouterEmail.disabled = false;
      boutonAjouterEmail.textContent = "Ajouter un e-mail";
    }

    function ajouterChampEmailInvite() {
      if (listeEmails.querySelectorAll("input[type='email']").length >= placesDisponibles) {
        afficherMessage("Votre droit d'invitation est limité à " + String(limiteTotale) + " invité" + (limiteTotale > 1 ? "s" : "") + ".", true);
        return;
      }

      listeEmails.appendChild(creerChampEmailInviteSupplementaire());
    }

    boutonAjouterEmail.addEventListener("click", ajouterChampEmailInvite);

    return new Promise((resolve) => {
      let resolu = false;
      let enregistrementEnCours = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        conteneur.remove();
        resolve(valeur);
      }

      function gererEchap(event) {
        if (event.key === "Escape") fermer(null);
      }

      async function mettreAJour() {
        if (enregistrementEnCours || !idReservation) return;

        const lignes = Array.from(liste.querySelectorAll("[data-lcdp-listinvites-item]"));
        const majInvites = lignes
          .map((ligne) => {
            const idmembre = String(ligne.dataset.idmembre || "").trim();
            const toggle = ligne.querySelector("[data-lcdp-listinvites-toggle]");

            if (!idmembre || !toggle) return null;

            return {
              idmembre,
              invit: toggle.checked ? "true" : "cancd"
            };
          })
          .filter(Boolean);

        const emails = collecterEmailsSupplementairesInvitation(listeEmails);

        if (emails.erreur) {
          afficherMessage(emails.erreur, true);
          return;
        }

        if (!majInvites.length && !emails.valeurs.length) {
          afficherMessage("Aucun invité à mettre à jour.", true);
          return;
        }

        enregistrementEnCours = true;
        boutonMettreAJour.disabled = true;
        boutonMettreAJour.textContent = "Mise à jour...";
        afficherMessage("");

        const resultat = await enregistrerListeInvitesReservation(idReservation, {
          invites: majInvites,
          emails: emails.valeurs
        }, declencheur);

        enregistrementEnCours = false;
        boutonMettreAJour.disabled = false;
        boutonMettreAJour.textContent = "Mettre à jour";

        if (!resultat) return;

        const reservation = trouverReservationPlanningParId(idReservation);
        const nbActifs = Number(resultat.nbInvitesActifs || 0);
        const nbAnnules = Number(resultat.nbInvitesAnnules || 0);

        if (reservation) {
          reservation.invitationStats = {
            ...(reservation.invitationStats || {}),
            in: Number.isFinite(nbActifs) ? nbActifs : 0,
            out: Number.isFinite(nbAnnules) ? nbAnnules : 0
          };
        }

        if (Number.isFinite(nbActifs) && nbActifs > 0) {
          etat.reservationsAvecInvites.add(idReservation);
        } else {
          etat.reservationsAvecInvites.delete(idReservation);
        }

        actualiserBoutonsInvitationPlanning(idReservation, declencheur);
        await afficherAlerteInvitationReservation(resultat.message || "Liste des invités mise à jour.", declencheur);
        fermer(resultat);
      }

      boutonMettreAJour.addEventListener("click", mettreAJour);
      boutonAnnuler.addEventListener("click", () => fermer(null));

      if (boutonFermer) {
        boutonFermer.addEventListener("click", () => fermer(null));
      }

      box.addEventListener("click", (event) => {
        if (event.target === box) fermer(null);
      });

      document.addEventListener("keydown", gererEchap);
    });
  }

  function creerLigneInviteLectureSeule(invite) {
    const item = document.createElement("li");
    item.className = "lcdp-box-card-listinvites-oui-non__item lcdp-box-card-listinvites-oui-non__item--lecture";

    const identite = document.createElement("span");
    identite.className = "lcdp-box-card-listinvites-oui-non__identite";
    identite.textContent = formaterLigneInviteReservation(invite);

    item.appendChild(identite);
    return item;
  }

  function creerLigneInviteOuiNon(invite) {
    const item = document.createElement("li");
    item.className = "lcdp-box-card-listinvites-oui-non__item";
    item.dataset.lcdpListinvitesItem = "true";
    item.dataset.idmembre = String(invite?.idmembre || "").trim();

    const identite = document.createElement("span");
    identite.className = "lcdp-box-card-listinvites-oui-non__identite";
    identite.textContent = formaterLigneInviteReservation(invite);

    const label = document.createElement("label");
    label.className = "lcdp-box-card-listinvites-oui-non__switch";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "lcdp-box-card-listinvites-oui-non__switch-input";
    input.dataset.lcdpListinvitesToggle = "true";
    input.checked = normaliserStatutInvitationInvite(invite?.invit) !== "cancd";
    input.setAttribute("aria-label", "Invitation active pour " + identite.textContent);

    const curseur = document.createElement("span");
    curseur.className = "lcdp-box-card-listinvites-oui-non__switch-slider";
    curseur.setAttribute("aria-hidden", "true");

    const etatTexte = document.createElement("span");
    etatTexte.className = "lcdp-box-card-listinvites-oui-non__switch-text";
    etatTexte.textContent = input.checked ? "Oui" : "Non";

    item.classList.toggle("lcdp-box-card-listinvites-oui-non__item--cancd", !input.checked);

    input.addEventListener("change", () => {
      etatTexte.textContent = input.checked ? "Oui" : "Non";
      item.classList.toggle("lcdp-box-card-listinvites-oui-non__item--cancd", !input.checked);
    });

    label.appendChild(input);
    label.appendChild(curseur);
    label.appendChild(etatTexte);

    item.appendChild(identite);
    item.appendChild(label);

    return item;
  }

  function creerChampEmailInviteSupplementaire() {
    const item = document.createElement("li");
    item.className = "lcdp-box-card-listinvites-oui-non__email-item";

    const input = document.createElement("input");
    input.type = "email";
    input.placeholder = "Adresse e-mail du membre invité";
    input.autocomplete = "email";
    input.className = "lcdp-box-card-listinvites-oui-non__email-input";

    item.appendChild(input);
    input.focus();
    return item;
  }

  function collecterEmailsSupplementairesInvitation(listeEmails) {
    const saisies = Array.from(listeEmails.querySelectorAll("input[type='email']"))
      .map((input) => nettoyerEmail(input.value))
      .filter(Boolean);

    const valeurs = saisies.filter((email, index, array) => array.indexOf(email) === index);
    const invalide = valeurs.find((email) => !emailValide(email));

    if (invalide) {
      return { valeurs: [], erreur: "Une adresse e-mail est invalide." };
    }

    return { valeurs, erreur: "" };
  }

  function normaliserStatutInvitationInvite(value) {
    const statut = normaliserTexteTechnique(value);
    return statut || "true";
  }

  async function enregistrerListeInvitesReservation(idflux, payload, declencheur) {
    const idReservation = String(idflux || "").trim();
    const donnees = payload || {};
    const invites = Array.isArray(donnees.invites) ? donnees.invites : [];
    const emails = Array.isArray(donnees.emails) ? donnees.emails : [];

    if (!idReservation) {
      await afficherAlerteInvitationReservation("Réservation manquante.", declencheur);
      return null;
    }

    if (!ENDPOINT_INVITER_MEMBRE) {
      await afficherAlerteInvitationReservation("Le service invitation membre n’est pas configuré.", declencheur);
      return null;
    }

    const reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/invites", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        idflux: idReservation,
        invites,
        emails
      })
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      await afficherAlerteInvitationReservation(messageErreurApi(data, "Impossible de mettre à jour la liste des invités."), declencheur);
      return null;
    }

    return data;
  }

  function formaterLigneInviteReservation(invite) {
    const nom = [invite?.prenommembre, invite?.nommembre]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");

    const email = nettoyerEmail(invite?.emailmembre || "");

    if (nom && email) return nom + " — " + email;
    if (nom) return nom;
    if (email) return email;

    return "Membre invité";
  }

  function echapperSelecteurCss(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value || ""));
    }

    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function reservationPasseePlanning(reservation) {
    const date = new Date(reservation?.datebookd || "");

    if (Number.isNaN(date.getTime())) return false;

    const reservationParis = dateHeureParis(date);
    const maintenantParis = dateHeureParis(new Date());

    if (!reservationParis.dateIso || !maintenantParis.dateIso) return false;
    if (reservationParis.dateIso < maintenantParis.dateIso) return true;
    if (reservationParis.dateIso > maintenantParis.dateIso) return false;

    const minutesReservation = (reservationParis.heure * 60) + reservationParis.minute;
    const minutesMaintenant = (maintenantParis.heure * 60) + maintenantParis.minute;

    return minutesMaintenant >= minutesReservation;
  }

  function reservationDelaiActionDepasse(reservation) {
    const date = new Date(reservation?.datebookd || "");

    if (Number.isNaN(date.getTime())) return false;

    return Date.now() >= date.getTime() - (30 * 60 * 1000);
  }

  function determinerBlocageInvitationReservation(reservation) {
    const dateReservation = extraireDateFranceReservation(reservation?.datebookd);

    if (!dateReservation) return "";

    const abonnement = trouverAbonnementPourDateInvitation(dateReservation);
    const statutabo = normaliserTexteTechnique(abonnement?.statutabo || "");

    if (statutabo === "impaye") {
      return "Votre abonnement est suspendu (impayé). Vous devez régulariser votre abonnement avant de pouvoir utiliser la fonction Inviter.";
    }

    if (statutabo === "cancd" && dateReservation > dateAujourdhuiParis()) {
      return "Vous avez annulé votre abonnement. Cette réservation est annulée ce soir à minuit. Vous ne pouvez donc pas utiliser la fonction Inviter pour cette date.";
    }

    return "";
  }

  function trouverAbonnementPourDateInvitation(dateIso) {
    const date = String(dateIso || "").trim().slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

    return (Array.isArray(etat.abonnements) ? etat.abonnements : []).find((abonnement) => {
      const debut = String(abonnement?.debut || "").slice(0, 10);
      const fin = String(abonnement?.finInitiale || abonnement?.fin || "").slice(0, 10);

      return debut && fin && date >= debut && date <= fin;
    }) || null;
  }

  async function afficherAlerteInvitationReservation(message, declencheur) {
    const workflow = declencheur
      ? declencheur.closest("[data-lcdp-box-workflow-reservation]")
      : document.querySelector("#lcdp-lightbox-slot [data-lcdp-box-workflow-reservation]");

    if (workflow) {
      await afficherAlerteOkParDessusLightbox(message);
      return;
    }

    await afficherAlerteOk(message);
  }

  async function ouvrirBoxEmailsInvitationReservation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) {
      await afficherAlerteInvitationReservation("Réservation manquante.", declencheur);
      return null;
    }

    await chargerCssObjetUneFois("/BOX/04-box-listemails.css");

    const conteneur = document.createElement("div");
    conteneur.dataset.lcdpInvitationEmailsOverlay = "true";
    conteneur.style.position = "relative";
    conteneur.style.zIndex = "9000";

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

    titre.textContent = "Inviter";
    message.hidden = true;
    message.textContent = "";

    const limiteEmails = limiteEmailsInvitation();
    let traitementEnCours = false;

    function afficherMessageEmails(texte, estErreur = false) {
      message.hidden = !texte;
      message.textContent = texte || "";
      message.dataset.lcdpMessageType = estErreur ? "erreur" : "information";
      message.classList.toggle("lcdp-box-card-listemails__message--erreur", estErreur === true);
    }

    function definirTraitementEnCours(valeur) {
      traitementEnCours = valeur === true;

      Array.from(liste.querySelectorAll("input[type='email']")).forEach((input) => {
        input.disabled = traitementEnCours;
      });

      Array.from(actions.querySelectorAll("button")).forEach((bouton) => {
        bouton.disabled = traitementEnCours;
      });

      if (boutonFermer) {
        boutonFermer.disabled = traitementEnCours;
        boutonFermer.setAttribute("aria-disabled", traitementEnCours ? "true" : "false");
      }
    }

    function ajouterChamp(valeur = "") {
      if (traitementEnCours) return;

      if (liste.querySelectorAll("input[type='email']").length >= limiteEmails) {
        afficherMessageEmails("Votre droit d'invitation est limité à " + String(limiteEmails) + " e-mail" + (limiteEmails > 1 ? "s" : "") + ".", true);
        return;
      }

      const item = document.createElement("li");
      item.className = "lcdp-box-card-listemails__item";

      const input = document.createElement("input");
      input.type = "email";
      input.value = valeur;
      input.placeholder = "Adresse e-mail du membre invité";
      input.autocomplete = "email";
      input.className = "lcdp-box-card-listemails__input";

      item.appendChild(input);
      liste.appendChild(item);
      input.focus();
    }

    ajouterChamp();

    actions.innerHTML = "";

    const boutonAjouter = creerBoutonInvitationEmails("Ajouter un e-mail", "lcdp-button-secondary", () => ajouterChamp());
    const boutonInviter = creerBoutonInvitationEmails("Inviter", "lcdp-button-primary", async () => {
      if (traitementEnCours) return;

      afficherMessageEmails("");

      const emailsSaisis = Array.from(liste.querySelectorAll("input[type='email']"))
        .map((input) => nettoyerEmail(input.value))
        .filter(Boolean);

      const emails = emailsSaisis.filter((email, index, array) => array.indexOf(email) === index);
      const emailInvalide = emails.find((email) => !emailValide(email));

      if (!emails.length) {
        afficherMessageEmails("Renseignez au moins une adresse e-mail.", true);
        return;
      }

      if (emailInvalide) {
        afficherMessageEmails("Une adresse e-mail est invalide.", true);
        return;
      }

      if (emails.length > limiteEmails) {
        afficherMessageEmails("Votre droit d'invitation est limité à " + String(limiteEmails) + " e-mail" + (limiteEmails > 1 ? "s" : "") + ".", true);
        return;
      }

      definirTraitementEnCours(true);
      boutonInviter.textContent = "Envoi en cours...";
      afficherMessageEmails("Patientez, l’invitation est en cours d’enregistrement...");

      try {
        console.info("[LCDP invitation] POST /inviter-reservation", {
          idflux: idReservation,
          nbEmails: emails.length
        });

        const resultat = await posterInvitationReservation(idReservation, emails);

        console.info("[LCDP invitation] invitation enregistrée", resultat);
        fermer(resultat);
      } catch (error) {
        console.error("[LCDP invitation] échec invitation", error);
        definirTraitementEnCours(false);
        boutonInviter.textContent = "Inviter";
        afficherMessageEmails(error.message || "Impossible d’envoyer l’invitation.", true);
      }
    });
    const boutonAnnuler = creerBoutonInvitationEmails("Annuler", "lcdp-button-secondary", () => fermer(null));

    actions.appendChild(boutonAjouter);
    actions.appendChild(boutonInviter);
    actions.appendChild(boutonAnnuler);

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (traitementEnCours && !valeur) return;
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        conteneur.remove();
        resolve(valeur || null);
      }

      function gererEchap(event) {
        if (event.key === "Escape") fermer(null);
      }

      if (boutonFermer) {
        boutonFermer.addEventListener("click", () => fermer(null));
      }

      box.addEventListener("click", (event) => {
        if (event.target === box) fermer(null);
      });

      document.addEventListener("keydown", gererEchap);
    });
  }

  function creerBoutonInvitationEmails(label, style, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button " + (style || "lcdp-button-primary");
    bouton.textContent = label;
    bouton.addEventListener("click", action);
    return bouton;
  }

  function limiteEmailsInvitation() {
    const maxInvit = Number.parseInt(String(etat.maxInvitInvitation || "0"), 10);

    if (Number.isFinite(maxInvit) && maxInvit > 0) {
      return Math.min(maxInvit, 10);
    }

    return 10;
  }

  async function posterInvitationReservation(idflux, emails) {
    if (!ENDPOINT_INVITER_MEMBRE) {
      throw new Error("Le service invitation membre n’est pas configuré.");
    }

    const controleur = new AbortController();
    const delai = window.setTimeout(() => controleur.abort(), 20000);
    let reponse = null;

    try {
      reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/inviter-reservation", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        signal: controleur.signal,
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          idflux,
          emails
        })
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("Le service invitation ne répond pas. Merci de réessayer.");
      }

      throw new Error("Le service invitation membre est indisponible.");
    } finally {
      window.clearTimeout(delai);
    }

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      throw new Error("Session membre inactive.");
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible d’envoyer l’invitation."));
    }

    return data;
  }

  async function envoyerInvitationReservation(idflux, emails, declencheur) {
    try {
      const data = await posterInvitationReservation(idflux, emails);
      await afficherAlerteInvitationReservation(data.message || "Invitation envoyée.", declencheur);
      return data;
    } catch (error) {
      await afficherAlerteInvitationReservation(error.message || "Impossible d’envoyer l’invitation.", declencheur);
      return null;
    }
  }

  async function traiterAnnulationReservation(boutonAnnuler) {
    const idflux = boutonAnnuler ? String(boutonAnnuler.dataset.id || "").trim() : "";

    if (!idflux) {
      await afficherAlerte("Réservation manquante.");
      return;
    }

    const workflowReservation = boutonAnnuler
      ? boutonAnnuler.closest("[data-lcdp-box-workflow-reservation]")
      : null;

    const reservation = trouverReservationPlanningParId(idflux);

    if (!reservation) {
      if (workflowReservation) {
        await afficherAlerteOkParDessusLightbox("Réservation introuvable.");
      } else {
        await afficherAlerteOk("Réservation introuvable.");
      }
      return;
    }

    if (reservationDelaiActionDepasse(reservation)) {
      if (workflowReservation) {
        await afficherAlerteOkParDessusLightbox("Vous ne pouvez plus utiliser la fonction annuler (délai dépassé).");
      } else {
        await afficherAlerteOk("Vous ne pouvez plus utiliser la fonction annuler (délai dépassé).");
      }
      return;
    }

    const optionsDialogue = {
      titre: "Confirmer l’annulation",
      texte: "Voulez-vous vraiment annuler cette date ?",
      boutons: [
        {
          label: "Non",
          valeur: "non",
          style: "lcdp-button-secondary"
        },
        {
          label: "Oui",
          valeur: "oui",
          style: "lcdp-button-primary"
        }
      ]
    };

    const confirmation = workflowReservation
      ? await ouvrirDialogueBoutonsParDessusLightbox(optionsDialogue)
      : await ouvrirDialogueBoutons(optionsDialogue);

    if (confirmation !== "oui") return;

    const texteInitial = boutonAnnuler.textContent;
    boutonAnnuler.disabled = true;
    boutonAnnuler.textContent = "Annulation...";

    try {
      await annulerReservation(idflux);
      await afficherAlerte("Votre annulation est enregistrée.");
      const slot = document.getElementById("lcdp-lightbox-slot");
      if (slot) slot.innerHTML = "";
      await chargerReservations();
    } catch (error) {
      boutonAnnuler.disabled = false;
      boutonAnnuler.textContent = texteInitial;
      await afficherAlerte(error.message || "Impossible d’annuler cette réservation.");
    }
  }

  async function annulerReservation(idflux) {
    if (!ENDPOINT_PLANNING_MEMBRE) {
      throw new Error("Le service planning membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_PLANNING_MEMBRE + "/annuler-reservation", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ idflux })
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible d’annuler cette réservation."));
    }

    return data.reservation || null;
  }

  async function verifierAccesReservationPlanning() {
    const blocage = determinerBlocageReservationPlanning(etat.membre || creerEtatMembreFallback());

    if (!blocage) return true;

    await afficherAlerte(blocage);
    return false;
  }

  function determinerBlocageReservationPlanning(membre) {
    const donnees = membre || {};

    if (
      donnees.abonnementAnnuleNonPaye === true ||
      paiementSuspensionDelaiDepasse(donnees.paiementSuspension)
    ) {
      return "Votre abonnement est annulé (non payé).";
    }

    if (donnees.abonnementSuspendu === true) {
      return "Votre abonnement est suspendu (non payé).";
    }

    const estAbonne = donnees.sourceApi === true
      ? donnees.abonne === true
      : donnees.abonne === true || membreAbonne();

    if (!estAbonne) {
      return "Vous devez être membre abonné.";
    }

    return "";
  }

  function paiementSuspensionDelaiDepasse(paiement) {
    if (!paiement || typeof paiement !== "object") return false;

    if (
      valeurBooleenneVraie(paiement.delaiPaiementDepasse) ||
      valeurBooleenneVraie(paiement.abonnementAnnuleNonPaye)
    ) {
      return true;
    }

    return delaiPaiementDepasseDepuisFin(paiement.fin || paiement.dateFin || paiement.finabo || "");
  }

  function delaiPaiementDepasseDepuisFin(value) {
    const fin = dateIsoDepuisValeur(value);

    if (!fin) return false;

    const maintenantParis = dateHeureParis(new Date());

    if (maintenantParis.dateIso > fin) return true;
    if (maintenantParis.dateIso < fin) return false;

    return maintenantParis.heure >= 14;
  }

  function dateIsoDepuisValeur(value) {
    const texte = String(value || "").trim();
    const match = texte.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      return match[1] + "-" + match[2] + "-" + match[3];
    }

    const date = new Date(texte);

    if (Number.isNaN(date.getTime())) return "";

    return dateHeureParis(date).dateIso;
  }

  function dateHeureParis(date) {
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

  function construireJoursMois(moisIso) {
    const match = String(moisIso || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
    const maintenant = dateAujourdhuiParis();

    if (!match) {
      return construireJoursMois(debutMois(maintenant));
    }

    const annee = Number(match[1]);
    const mois = Number(match[2]);
    const nombreJours = new Date(annee, mois, 0).getDate();
    const jours = [];

    for (let jour = 1; jour <= nombreJours; jour += 1) {
      jours.push({
        dateIso: annee + "-" + String(mois).padStart(2, "0") + "-" + String(jour).padStart(2, "0"),
        jour
      });
    }

    return jours;
  }

  function obtenirDecalageLundi(dateIso) {
    const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return 0;

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
    const jour = date.getDay();

    return jour === 0 ? 6 : jour - 1;
  }

  function debutMois(dateIso) {
    const texte = String(dateIso || dateAujourdhuiParis()).slice(0, 10);
    const match = texte.match(/^(\d{4})-(\d{2})/);

    if (!match) return debutMois(dateAujourdhuiParis());

    return match[1] + "-" + match[2] + "-01";
  }

  function ajouterMois(dateIso, delta) {
    const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-\d{2}$/);

    if (!match) return debutMois(dateAujourdhuiParis());

    const date = new Date(Number(match[1]), Number(match[2]) - 1 + Number(delta || 0), 1, 12, 0, 0);

    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-01";
  }

  function formaterMoisAnnee(dateIso) {
    const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-\d{2}$/);

    if (!match) return "";

    const date = new Date(Number(match[1]), Number(match[2]) - 1, 1, 12, 0, 0);

    return date.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric"
    });
  }


  function normaliserAbonnementsMembre(source) {
    const aujourdHui = dateAujourdhuiParis();

    return (Array.isArray(source) ? source : [])
      .map((abonnement) => {
        const statutabo = normaliserTexteTechnique(abonnement?.statutabo || abonnement?.statut || "");
        const debut = dateIsoDepuisValeur(abonnement?.debut || abonnement?.debutabo || abonnement?.dateDebut || "");
        let fin = dateIsoDepuisValeur(abonnement?.fin || abonnement?.finabo || abonnement?.dateFin || "");
        const finInitiale = fin;

        /* Un abonnement cancd reste couvert uniquement le jour d'annulation. */
        if (statutabo === "cancd" && fin && fin > aujourdHui) {
          fin = aujourdHui;
        }

        return { debut, fin, finInitiale, statutabo };
      })
      .filter((abonnement) => abonnement.debut && abonnement.fin && abonnement.fin >= abonnement.debut);
  }

  function reservationHorsAbonnementMembre(reservation) {
    return valeurBooleenneVraie(reservation?.invitation);
  }

  function dateDansPeriodeAbonnementMembre(dateIso) {
    const date = String(dateIso || "").trim().slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

    return etat.abonnements.some((abonnement) => {
      return date >= abonnement.debut && date <= abonnement.fin;
    });
  }

  function normaliserTexteTechnique(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "");
  }

  function moisMaximumPlanning() {
    const annee = Number(String(dateAujourdhuiParis()).slice(0, 4));

    if (!Number.isFinite(annee) || annee < 2000) {
      return "2027-12-01";
    }

    return String(annee + 1) + "-12-01";
  }

  function moisDansLimiteMaximumPlanning(moisIso) {
    return String(debutMois(moisIso || dateAujourdhuiParis())) <= moisMaximumPlanning();
  }

  function limiterMoisMaximumPlanning(moisIso) {
    const mois = debutMois(moisIso || dateAujourdhuiParis());
    const maximum = moisMaximumPlanning();

    return mois > maximum ? maximum : mois;
  }

  function actualiserNavigationMoisPlanning() {
    const calendrier = etat.calendrierMois;
    if (!calendrier) return;

    const boutonSuivant = calendrier.querySelector("[data-lcdp-calendrier-mois-next]");
    if (!boutonSuivant) return;

    const prochainMois = ajouterMois(etat.moisCourant || dateAujourdhuiParis(), 1);
    const autorise = moisDansLimiteMaximumPlanning(prochainMois);

    boutonSuivant.disabled = !autorise;
    boutonSuivant.setAttribute("aria-disabled", autorise ? "false" : "true");
  }

  function normaliserPlageReservation(reservation) {
    const brut = String(reservation?.plagebookd || reservation?.plage || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_-]+/g, "");

    if (brut.includes("plage1") || brut === "1" || brut.includes("matin")) return "plage1";
    if (brut.includes("plage2") || brut === "2" || brut.includes("midi") || brut.includes("apres")) return "plage2";
    if (brut.includes("plage3") || brut === "3" || brut.includes("soir") || brut.includes("fin")) return "plage3";

    const date = new Date(reservation?.datebookd || "");

    if (!Number.isNaN(date.getTime())) {
      const heure = Number(new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "2-digit",
        hour12: false,
        hourCycle: "h23"
      }).format(date));

      if (heure < 12) return "plage1";
      if (heure < 18) return "plage2";
      return "plage3";
    }

    return "plage1";
  }

  function libellePlage(plage) {
    if (plage === "plage1") return "plage 1";
    if (plage === "plage2") return "plage 2";
    if (plage === "plage3") return "plage 3";
    return "plage";
  }

  function nomParcReservation(reservation) {
    const parc = reservation?.parc || {};

    return String(parc.nom || parc.nomparc || reservation?.nomparc || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function nomParcCourtReservation(reservation) {
    const nom = nomParcReservation(reservation);

    if (!nom) return "";

    return nom.slice(0, 15);
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

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") fermer(false);
        },
        { once: true }
      );
    });
  }

  async function afficherAlerteOk(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
    slot.appendChild(fragment);

    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonOk) {
      throw new Error("Structure de l’alerte incomplète.");
    }

    texte.textContent = message || "";

    if (boutonFermer) boutonFermer.hidden = true;

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(true);
      }

      boutonOk.addEventListener("click", fermer);
    });
  }

  async function afficherAlerteOkParDessusLightbox(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    const coucheExistante = slot.querySelector("[data-lcdp-alerte-ok-overlay]");
    if (coucheExistante) coucheExistante.remove();

    const couche = document.createElement("div");
    couche.dataset.lcdpAlerteOkOverlay = "true";
    slot.appendChild(couche);

    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
    couche.appendChild(fragment);

    const alerte = couche.querySelector("[data-lcdp-box-alerte]");
    const texte = couche.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = couche.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = couche.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonOk) {
      couche.remove();
      throw new Error("Structure de l’alerte incomplète.");
    }

    texte.textContent = message || "";

    if (boutonFermer) boutonFermer.hidden = true;

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) return;
        resolu = true;
        couche.remove();
        resolve(true);
      }

      boutonOk.addEventListener("click", fermer);
    });
  }

  async function ouvrirDialogueBoutonsParDessusLightbox(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    const coucheExistante = slot.querySelector("[data-lcdp-dialogue-bouton-overlay]");
    if (coucheExistante) coucheExistante.remove();

    const couche = document.createElement("div");
    couche.dataset.lcdpDialogueBoutonOverlay = "true";
    slot.appendChild(couche);

    const fragment = await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html");
    couche.appendChild(fragment);

    const dialogue = couche.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = couche.querySelector("[data-lcdp-dialogue-title]");
    const texte = couche.querySelector("[data-lcdp-dialogue-text]");
    const actions = couche.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = couche.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      couche.remove();
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
        document.removeEventListener("keydown", gererEchap);
        couche.remove();
        resolve(valeur || null);
      }

      function gererEchap(event) {
        if (event.key === "Escape") fermer(null);
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

      document.addEventListener("keydown", gererEchap);
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

  function chargerCssObjetUneFois(chemin) {
    const valeur = String(chemin || "").trim();

    if (!valeur) return Promise.resolve();

    const href = construireUrlObjet(valeur);

    if (document.querySelector('link[data-lcdp-css-objet="' + valeur + '"]')) {
      return Promise.resolve();
    }

    if (Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((link) => link.href === href)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.lcdpCssObjet = valeur;
      link.onload = resolve;
      link.onerror = () => reject(new Error("CSS OBJET introuvable : " + valeur));
      document.head.appendChild(link);
    });
  }

  async function chargerFragmentObjet(chemin) {
    const reponse = await fetch(construireUrlObjet(chemin), {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });

    if (!reponse.ok) throw new Error("Fragment OBJET introuvable : " + chemin);

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

    if (!reponse.ok) throw new Error("Fragment membre introuvable : " + chemin);

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

  function construireCheminImageParcParDefaut(nomParc, departement) {
    return construireCheminImageParcFichier(nomParc, departement, "card1.webp");
  }

  function construireCheminImageParcFichier(nomParc, departement, fichier) {
    const nom = normaliserSegmentCheminImageParc(nomParc);
    const dptmt = normaliserDepartementCheminImageParc(departement);
    const nomFichier = String(fichier || "").trim();

    if (!nom || !dptmt || !nomFichier) return "";

    return "/OBJET/IMAG/PARC/" + dptmt + "/" + nom + "/" + nomFichier;
  }

  function normaliserSegmentCheminImageParc(value) {
    return String(value || "")
      .trim()
      .replace(/^parc\s+d[’']\s*/i, "")
      .replace(/^parc\s+(?:de|du|des)\s+/i, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normaliserDepartementCheminImageParc(value) {
    const texte = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

    const corse = texte.match(/(?:^|\b)(2A|2B)(?:$|\b)/);

    if (corse) return corse[1];

    const matchDepartement = texte.match(/\d{1,3}/);
    const departement = matchDepartement ? matchDepartement[0] : "";

    if (/^[1-9]$/.test(departement)) return "0" + departement;

    return departement;
  }

  function construireUrlImageParc(value) {
    const chemin = String(value || "").trim();

    if (!chemin) return "";
    if (estUrlExterneOuAncre(chemin)) return chemin;

    const cheminObjet = chemin.replace(/^\/?OBJET\/?/, "/");

    return construireUrlObjet(cheminObjet);
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

  function valeurBooleenneVraie(valeur) {
    return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }

  function formaterDateCourte(dateIso) {
    const date = new Date(dateIso);

    if (Number.isNaN(date.getTime())) return "Date non renseignée";

    const dateFranceIso = extraireDateFranceReservation(dateIso);
    const aujourdHui = dateAujourdhuiParis();
    const demain = ajouterJoursDateIso(aujourdHui, 1);
    const apresDemain = ajouterJoursDateIso(aujourdHui, 2);

    if (dateFranceIso && dateFranceIso === aujourdHui) {
      return "Aujourd’hui " + formaterJourMoisDateIso(dateFranceIso);
    }

    if (dateFranceIso && dateFranceIso === demain) {
      return "Demain " + formaterJourMoisDateIso(dateFranceIso);
    }

    if (dateFranceIso && dateFranceIso === apresDemain) {
      return "Après-demain " + formaterJourMoisDateIso(dateFranceIso);
    }

    const dateFormatee = date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "long",
      day: "numeric",
      month: "long"
    });

    return majusculePremiereLettre(dateFormatee);
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

  function dateAujourdhuiParis() {
    return extraireDateFranceReservation(new Date().toISOString());
  }

  function ajouterJoursDateIso(dateIso, nombreJours) {
    const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return "";

    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(nombreJours || 0)));

    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function formaterJourMoisDateIso(dateIso) {
    const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return "";

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);

    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long"
    });
  }

  function formaterHeureReservation(dateIso) {
    const date = new Date(dateIso);

    if (Number.isNaN(date.getTime())) return "";

    const heure = date.toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit"
    });

    return heure.replace(":", "h").replace("h00", "h");
  }

  function majusculePremiereLettre(texte) {
    const valeur = String(texte || "");
    return valeur ? valeur.charAt(0).toUpperCase() + valeur.slice(1) : "";
  }
})();
