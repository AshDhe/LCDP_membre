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

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_INVITER_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/inviter-membre.html");

  let pageInitialisee = false;
  let promesseActualisationEtatMembre = null;

  const etat = {
    reservations: [],
    abonnements: [],
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

  async function initialiserPage() {
    if (pageInitialisee) return;
    pageInitialisee = true;

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
      etat.reservationsParDate = indexerReservationsParDate(etat.reservations);
      ajusterMoisCourantSelonReservations();
      afficherCalendrierMois();
    } catch (error) {
      console.error("Erreur chargement planning membre :", error);
      afficherErreurCalendrier(error.message || "Erreur technique. Merci de réessayer.");
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

    const card = creerCardReservation(reservation);
    contenu.appendChild(boutonFermer);
    contenu.appendChild(card);

    function fermer() {
      slot.innerHTML = "";
    }

    boutonFermer.addEventListener("click", fermer);
    workflow.addEventListener("click", (event) => {
      if (event.target === workflow) fermer();
    });

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") fermer();
      },
      { once: true }
    );
  }

  function creerCardReservation(reservation) {
    const card = etat.templateReservation.cloneNode(true);

    const dateReservation = new Date(reservation.datebookd);
    const estPasse = extraireDateFranceReservation(reservation.datebookd) < dateAujourdhuiParis();

    const parc = reservation.parc || {};
    const nomParc = parc.nom || parc.nomparc || reservation.nomparc || "Parc";
    const departement = parc.dptmt || parc.departement || reservation.dptmt || "";
    const idParc = parc.idparc || reservation.idparc || "";
    const idFlux = reservation.idflux || "";
    const imageParc = parc.imageparc || parc.image || reservation.imageparc || reservation.image || "";

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

    if (estPasse || (Number.isFinite(dateReservation.getTime()) && dateReservation < new Date())) {
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

    if (boutonAdresse) boutonAdresse.dataset.idparc = idParc;

    if (boutonInvitation) {
      boutonInvitation.dataset.id = idFlux;
      boutonInvitation.hidden = estPasse || estReservationHorsAbonnement;
    }

    if (badgeInvitation) {
      badgeInvitation.textContent = "invit’";
      badgeInvitation.hidden = !estReservationHorsAbonnement;
      badgeInvitation.setAttribute("aria-label", "Invitation");
    }

    if (boutonAnnuler) {
      boutonAnnuler.dataset.id = idFlux;
      boutonAnnuler.hidden = estPasse;
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
      await afficherAlerte("L’adresse sera raccordée ensuite.");
      return;
    }

    if (boutonInvitation) {
      await ouvrirPageInvitation(String(boutonInvitation.dataset.id || ""));
      return;
    }

    if (boutonAnnuler) {
      await traiterAnnulationReservation(boutonAnnuler);
    }
  }

  async function ouvrirPageInvitation(idflux) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) {
      await afficherAlerte("Réservation manquante.");
      return;
    }

    const acces = await verifierAccesReservationPlanning();
    if (!acces) return;

    const separateur = PAGE_INVITER_MEMBRE.includes("?") ? "&" : "?";
    window.location.href = PAGE_INVITER_MEMBRE + separateur + "idflux=" + encodeURIComponent(idReservation);
  }

  async function traiterAnnulationReservation(boutonAnnuler) {
    const idflux = boutonAnnuler ? String(boutonAnnuler.dataset.id || "").trim() : "";

    if (!idflux) {
      await afficherAlerte("Réservation manquante.");
      return;
    }

    const confirmation = await ouvrirDialogueBoutons({
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
    });

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

        /* Un abonnement cancd reste couvert uniquement le jour d'annulation. */
        if (statutabo === "cancd" && fin && fin > aujourdHui) {
          fin = aujourdHui;
        }

        return { debut, fin, statutabo };
      })
      .filter((abonnement) => abonnement.debut && abonnement.fin && abonnement.fin >= abonnement.debut);
  }

  function reservationHorsAbonnementMembre(reservation) {
    const dateReservation = extraireDateFranceReservation(reservation?.datebookd);
    const aujourdHui = dateAujourdhuiParis();

    if (!dateReservation) return true;

    /* Règle planning : le passé reste seulement vert atténué.
       L'affichage invitation ne concerne que les réservations à venir. */
    if (dateReservation < aujourdHui) return false;

    if (valeurBooleenneVraie(reservation?.invitation)) return true;

    return !dateDansPeriodeAbonnementMembre(dateReservation);
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
