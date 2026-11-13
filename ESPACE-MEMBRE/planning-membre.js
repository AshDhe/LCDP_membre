(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "planning-membre";

  const ENDPOINT_PLANNING_MEMBRE = construireEndpointApi(
    "workerPlanningMembreUrl",
    "WORKER_PLANNING_MEMBRE_URL",
    "planning-membre-api"
  );

  const ENDPOINT_PLANNING_PARC = construireEndpointApi(
    "workerPlanningParcUrl",
    "WORKER_PLANNING_PARC_URL",
    "planning-parc-api"
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
    templateCardParcDiaporama: null,
    templateListeParcsDiaporama: null,
    workflowPlanning: null,
    contenuWorkflowPlanning: null,
    calendrierMois: null,
    wrapperPlanning: null,
    slotPlanning: null,
    slotCommandeListe: null,
    slotCommandeAgenda: null,
    commandeBar: null,
    modeAffichage: "liste",
    periodeAffichage: "avenir",
    filtres: {mois: "", parc: "", departement: "", recues: true, envoyees: true},
    filtresInitialises: false,
    formulaireFiltres: null,
    membre: {
      abonne: false,
      abonnementSuspendu: false,
      abonnementAnnuleNonPaye: false,
      paiementSuspension: null
    }
  };

  const PLAGES = [
    "plage1",
    "plage2",
    "plage3",
    "plage4",
    "plage5"
  ];
  const cacheHorairesParcMois = new Map();

  const LEGENDE_AGENDA_MEMBRE = [
    {
      libelle: "Réservation",
      classeCouleur:
        "lcdp-box-card-jour-in-calendrier-mois__slot--vert"
    },
    {
      libelle: "Invitation",
      classeCouleur:
        "lcdp-box-card-jour-in-calendrier-mois__slot--orange-fonce"
    },
    {
      libelle: "Invite",
      classeCouleur:
        "lcdp-box-card-jour-in-calendrier-mois__slot--reservation-invitation"
    }
  ];

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

      // Un seul affichage du statut, après vérification : pas de badge provisoire.
      etat.membre = creerEtatMembreFallback();
      await initialiserPlanningCalendrier();
      document.addEventListener("click", gererClicDocument);

      await Promise.all([
        chargerReservations(),
        lancerActualisationEtatMembrePlanning()
      ]);
      afficherStatutMembrePlanning(etat.membre);
    } catch (error) {
      console.error("Erreur planning membre :", error);
      afficherErreurCalendrier(error.message || "Erreur technique. Merci de réessayer.");
    } finally {
      // Aucun fragment ou cartouche ne doit apparaître isolément pendant l'initialisation.
      document.documentElement.classList.add("lcdp-planning-membre-ready");
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
    mention.hidden = false;
  }

  async function initialiserPlanningCalendrier() {
    const slot = document.getElementById("lcdp-planning-calendrier-slot");

    if (!slot) {
      throw new Error("Slot planning calendrier introuvable.");
    }

    slot.innerHTML = "";

    const fragmentWorkflow = await chargerFragmentObjet("/HTMLBASE/04-workflow-reservation.html");
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
    const fragmentWrapper = await chargerFragmentObjet("/HTMLBASE/04-liste-card.html");
    contenu.appendChild(fragmentWrapper);

    const wrapperPlanning = contenu.querySelector("[data-lcdp-box-liste-card]");
    const titreWrapper = contenu.querySelector("[data-lcdp-liste-card-title]");
    const slotCommande = contenu.querySelector("[data-lcdp-liste-card-commande]");
    const slotPlanning = contenu.querySelector("[data-lcdp-liste-card-list]");

    if (!wrapperPlanning || !slotCommande || !slotPlanning) {
      throw new Error("Structure wrapper planning membre incomplète.");
    }

    wrapperPlanning.classList.add("lcdp-box-liste-card--planning-membre");

    if (titreWrapper) {
      titreWrapper.textContent = "Mes accès";
      // Style éditorial discret existant dans le CSS central (module c085).
      titreWrapper.classList.add("lcdp-editorial-eyebrow");
      titreWrapper.hidden = false;
    }
    const fragmentCalendrier = await chargerFragmentObjet("/HTMLBASE/04-calendrier-mois.html");
    slotPlanning.appendChild(fragmentCalendrier);

    // Même hôte CSS que le calendrier permanent de PLANIFIER.
    slotPlanning.id = "lcdp-planifier-calendrier-slot";
    const calendrier = slotPlanning.querySelector("[data-lcdp-box-calendrier-mois]");

    if (!calendrier) {
      throw new Error("Structure calendrier mois incomplète.");
    }

    const slotCommandeAgenda = calendrier.querySelector(
      "[data-lcdp-calendrier-mois-commande]"
    );

    if (!slotCommandeAgenda) {
      throw new Error("Slot commande du calendrier mensuel introuvable.");
    }

    const fragmentCommande = await chargerFragmentObjet("/HTMLBASE/04-commande-bar.html");
    slotCommandeAgenda.appendChild(fragmentCommande);

    const commandeBar = slotCommandeAgenda.querySelector("[data-lcdp-box-commande-bar]");
    const actionsCommande = slotCommandeAgenda.querySelector("[data-lcdp-commande-bar-actions]");

    if (!commandeBar || !actionsCommande) {
      throw new Error("Structure commande bar incomplète.");
    }

    ajouterActionsPlanningMembre(actionsCommande);
    actualiserBoutonsPeriodePlanningMembre();

    calendrier.removeAttribute("role");
    calendrier.removeAttribute("aria-modal");

    const boutonFermer = calendrier.querySelector("[data-lcdp-calendrier-mois-close]");
    if (boutonFermer) boutonFermer.hidden = true;

    calendrier.classList.add(
      "lcdp-box-calendrier-mois--planning-membre",
      "lcdp-box-calendrier-mois--inline"
    );

    const titre = calendrier.querySelector("[data-lcdp-calendrier-mois-title]");
    if (titre) {
      titre.textContent = "";
      titre.hidden = true;
    }

    const meta = calendrier.querySelector("[data-lcdp-calendrier-mois-meta]");
    if (meta) {
      await installerLegendeAgendaMembre(meta);
    }

    const boutonPrecedent = calendrier.querySelector("[data-lcdp-calendrier-mois-prev]");
    const boutonSuivant = calendrier.querySelector("[data-lcdp-calendrier-mois-next]");

    if (boutonPrecedent) {
      boutonPrecedent.addEventListener("click", () => {
        const mois = moisAdjacentAvecAccesPlanning(-1);
        if (!mois) return;
        etat.moisCourant = mois;
        afficherCalendrierMois();
      });
    }
    if (boutonSuivant) {
      boutonSuivant.addEventListener("click", () => {
        const mois = moisAdjacentAvecAccesPlanning(1);
        if (!mois) return;
        etat.moisCourant = mois;
        afficherCalendrierMois();
      });
    }

    const fragmentJour = await chargerFragmentObjet("/HTMLBASE/04-card-jour-in-calendrier-mois.html");
    etat.templateJour = fragmentJour.querySelector("[data-lcdp-card-jour-mois]");

    if (!etat.templateJour) {
      throw new Error("Template jour calendrier mois introuvable.");
    }

    const [fragmentCardParc, fragmentListeParcs, fragmentReservation] = await Promise.all([
      chargerFragmentObjet("/HTMLBASE/04-card-parc-diaporama.html"),
      chargerFragmentObjet("/HTMLBASE/04-liste-card-diaporama.html"),
      chargerFragmentObjet("/HTMLBASE/04-card-reservation-membre.html")
    ]);
    etat.templateCardParcDiaporama = fragmentCardParc.querySelector("[data-lcdp-card-parc-diaporama]");
    etat.templateListeParcsDiaporama = fragmentListeParcs.querySelector("[data-lcdp-liste-card-diaporama]");
    if (!etat.templateCardParcDiaporama || !etat.templateListeParcsDiaporama) throw new Error("Gabarits diaporama Parc indisponibles.");
    etat.templateReservation = fragmentReservation.querySelector("[data-lcdp-box-card-reservation-membre]");

    if (!etat.templateReservation) {
      throw new Error("Template card réservation membre introuvable.");
    }

    etat.workflowPlanning = workflow;
    etat.contenuWorkflowPlanning = contenu;
    etat.calendrierMois = calendrier;
    etat.wrapperPlanning = wrapperPlanning;
    etat.slotPlanning = slotPlanning;
    etat.slotCommandeListe = slotCommande;
    etat.slotCommandeAgenda = slotCommandeAgenda;
    etat.commandeBar = commandeBar;

    // Barre de navigation permanente : hors du calendrier et de la zone interchangeable.
    slotCommande.appendChild(commandeBar);
    installerFiltresPlanningMembre();
    actualiserModeWrapperPlanning();
    actualiserBoutonAffichagePlanningMembre();
    actualiserBoutonsPeriodePlanningMembre();
    afficherChargementCalendrier("Chargement de votre planning...");
  }

  async function installerLegendeAgendaMembre(meta) {
    if (!meta) return;
    const fragment = await chargerFragmentObjet("/HTMLBASE/04-legende.html");
    const legende = fragment.querySelector("[data-lcdp-box-legende]");
    const contenu = fragment.querySelector("[data-lcdp-legende-contenu]");
    if (!legende || !contenu) throw new Error("Structure Box Légende incomplète.");

    // Libellés et classes de la légende du planning général dans PLANIFIER.
    legende.className = "lcdp-box-legende lcdp-planifier-legende-planning";
    legende.setAttribute("role","group");
    legende.setAttribute("aria-label","Légende du planning");
    contenu.replaceChildren();
    const ligne = document.createElement("div");
    ligne.className = "lcdp-box-legende__ligne";
    for (const [libelle, classe] of [
      ["abonnement en cours", "lcdp-planifier-jour--abonnement-couvert"],
      ["accès planifié dans un parc", "lcdp-box-legende__carre--bleu-fonce"],
      ["invitation reçue pour un parc", "lcdp-box-legende__carre--bleu-clair"]
    ]) {
      const item = document.createElement("span");
      item.className = "lcdp-box-legende__item";
      const carre = document.createElement("span");
      carre.className = "lcdp-box-legende__carre " + classe;
      carre.setAttribute("aria-hidden","true");
      const texte = document.createElement("span");
      texte.className = "lcdp-box-legende__libelle";
      texte.textContent = libelle;
      item.append(carre,document.createTextNode(" "),texte);
      ligne.appendChild(item);
    }
    contenu.appendChild(ligne);
    const corps = meta.closest("[data-lcdp-box-calendrier-mois]")?.querySelector(".lcdp-box-calendrier-mois__body");
    if (!corps) throw new Error("Corps du calendrier introuvable.");
    corps.querySelector(".lcdp-planifier-legende-planning")?.remove();
    corps.appendChild(legende);
    meta.replaceChildren();
    meta.hidden = true;
  }

  function ajouterActionsPlanningMembre(actionsWrapper) {
    if (!actionsWrapper) return;

    actionsWrapper.innerHTML = "";

    const groupePeriodes =
      document.createElement("nav");
    groupePeriodes.className =
      "lcdp-navigation-onglets";
    groupePeriodes.setAttribute(
      "role",
      "group"
    );
    groupePeriodes.setAttribute(
      "aria-label",
      "Vues de Mes accès"
    );

    groupePeriodes.appendChild(
      creerBoutonPeriodePlanningMembre(
        "avenir",
        "Liste"
      )
    );

    const boutonAffichage = document.createElement("button");
    boutonAffichage.type = "button";
    boutonAffichage.className = "lcdp-navigation-onglets__onglet lcdp-planning-membre-affichage-button";
    boutonAffichage.dataset.lcdpPlanningAffichage = "true";
    definirContenuBoutonVue(boutonAffichage, "Planning", 0);
    boutonAffichage.setAttribute("aria-pressed","false");
    boutonAffichage.addEventListener("click", () => {
      if (etat.modeAffichage === "agenda") fermerReservationsJourPlanning();
      else afficherPlanningMembreEnAgenda();
    });
    groupePeriodes.appendChild(boutonAffichage);
    groupePeriodes.appendChild(
      creerBoutonPeriodePlanningMembre(
        "passe",
        "Récent"
      )
    );
    actionsWrapper.appendChild(groupePeriodes);

    actualiserBoutonsPeriodePlanningMembre();
  }

  function creerBoutonPeriodePlanningMembre(
    periode,
    libelle
  ) {
    const bouton =
      document.createElement("button");

    bouton.type = "button";
    bouton.className = "lcdp-navigation-onglets__onglet";
    bouton.dataset.lcdpPlanningPeriode =
      periode;
    definirContenuBoutonVue(bouton, libelle, 0);
    bouton.addEventListener(
      "click",
      () => changerPeriodePlanningMembre(
        periode
      )
    );

    return bouton;
  }

  // Récent : dix derniers accès passés ou annulés, uniquement sur M et M-1.
  function reservationsRecentesPlanningMembre() {
    const moisCourant = debutMois(dateAujourdhuiParis());
    const moisPrecedent = ajouterMois(moisCourant, -1);
    const aujourdHui = dateAujourdhuiParis();
    return filtrerEtTrierReservationsAgenda(etat.reservations, "passe")
      .filter(reservation => {
        const date = extraireDateFranceReservation(reservation.datebookd);
        return date && date >= moisPrecedent && date <= aujourdHui;
      })
      .slice(0, 10);
  }

  function changerPeriodePlanningMembre(periode) {
    const prochainePeriode = periode === "passe" ? "passe" : "avenir";
    const changementPeriode = etat.periodeAffichage !== prochainePeriode;
    const retourDepuisPlanning = etat.modeAffichage === "agenda";

    // Le bouton À venir doit aussi quitter Planning quand la période est déjà avenir.
    if (!changementPeriode && !retourDepuisPlanning) return;

    etat.periodeAffichage = prochainePeriode;
    if (changementPeriode) ajusterMoisCourantSelonPeriode();

    // AfficherPlanningMembreEnListe actualise seul les trois boutons et les filtres.
    afficherPlanningMembreEnListe();
  }

  function definirContenuBoutonVue(bouton, libelle, compte) {
    const texte = document.createElement("span");
    texte.textContent = libelle;
    const valeur = document.createElement("span");
    valeur.className = "lcdp-navigation-onglets__compteur";
    valeur.textContent = String(compte);
    bouton.replaceChildren(texte, valeur);
  }

  function actualiserBoutonsPeriodePlanningMembre() {
    if (!etat.commandeBar) return;

    etat.commandeBar
      .querySelectorAll(
        "[data-lcdp-planning-periode]"
      )
      .forEach((bouton) => {
        const periode = bouton.dataset.lcdpPlanningPeriode;
        const actif = etat.modeAffichage === "liste" && periode === etat.periodeAffichage;
        const compte = periode === "avenir"
          ? etat.reservations.filter(r => reservationDansPeriodeAgenda(r, "avenir")).length
          : reservationsRecentesPlanningMembre().length;
        definirContenuBoutonVue(bouton, periode === "avenir" ? "Liste" : "Récent", compte);

        bouton.setAttribute(
          "aria-pressed",
          actif ? "true" : "false"
        );
      });
  }

  function basculerAffichagePlanningMembre() {
    if (etat.modeAffichage === "agenda") {
      afficherPlanningMembreEnListe();
      return;
    }

    afficherPlanningMembreEnAgenda();
  }

  function afficherPlanningMembreEnAgenda() {
    const slotPlanning = etat.slotPlanning;
    const calendrier = etat.calendrierMois;

    if (!slotPlanning || !calendrier) return;

    // Planning est la représentation calendaire de Liste : accès à venir uniquement.
    etat.periodeAffichage = "avenir";
    ajusterMoisCourantSelonPeriode();
    afficherCalendrierMois();

    slotPlanning.classList.add(
      "lcdp-box-liste-card__list--transition"
    );

    window.requestAnimationFrame(() => {
      slotPlanning.replaceChildren(
        calendrier
      );

      // Le calendrier remplace uniquement le contenu, jamais la barre de navigation.
      etat.modeAffichage = "agenda";
      actualiserModeWrapperPlanning();
      actualiserBoutonAffichagePlanningMembre();
      actualiserBoutonsPeriodePlanningMembre();
      actualiserEtatFiltresPlanningMembre();

      window.requestAnimationFrame(() => {
        slotPlanning.classList.remove(
          "lcdp-box-liste-card__list--transition"
        );
      });
    });
  }

  function afficherPlanningMembreEnListe() {
    const slotPlanning = etat.slotPlanning;

    if (
      !slotPlanning ||
      !etat.templateReservation
    ) {
      return;
    }

    const fragment = etat.templateListeParcsDiaporama
      ? etat.templateListeParcsDiaporama.cloneNode(true)
      : document.createDocumentFragment();
    const zoneCartes = fragment.querySelector?.("[data-lcdp-liste-card-diaporama-list]") || fragment;
    const reservations = etat.periodeAffichage === "passe"
      ? reservationsRecentesPlanningMembre()
      : filtrerReservationsPlanningMembre(
          filtrerEtTrierReservationsAgenda(etat.reservations, "avenir")
        );
    const resultats = etat.formulaireFiltres?.querySelector("[data-lcdp-filtres-resultat]");
    if(resultats)resultats.textContent=reservations.length+" accès affiché"+(reservations.length>1?"s":"");
    actualiserEtatFiltresPlanningMembre();

    if (!reservations.length) {
      const message =
        document.createElement("p");
      message.className =
        "lcdp-box-liste-card__message";
      message.textContent =
        etat.periodeAffichage === "avenir"
          ? (filtresPlanningActifs() ? "Aucun accès ne correspond aux filtres sélectionnés." : "Vous n’avez aucun accès à venir.")
          : "Aucun accès récent sur le mois en cours ou le mois précédent.";
      zoneCartes.appendChild(message);
    } else {
      reservations.forEach(
        (reservation, index) => {
          const card = creerCardReservation(
            reservation,
            {
              contexte: "liste",
              prochaine:
                etat.periodeAffichage ===
                  "avenir" &&
                index === 0
            }
          );

          card.classList.add("lcdp-box-card-reservation-membre--liste");
          zoneCartes.appendChild(creerCarteVisiteDiaporama(card, reservation));
        }
      );
    }

    slotPlanning.classList.add(
      "lcdp-box-liste-card__list--transition"
    );

    window.requestAnimationFrame(() => {
      slotPlanning.replaceChildren(
        fragment
      );
      etat.modeAffichage = "liste";
      actualiserModeWrapperPlanning();
      actualiserBoutonAffichagePlanningMembre();
      actualiserBoutonsPeriodePlanningMembre();
      actualiserEtatFiltresPlanningMembre();

      window.requestAnimationFrame(() => {
        slotPlanning.classList.remove(
          "lcdp-box-liste-card__list--transition"
        );
      });
    });
  }

  function creerCarteVisiteDiaporama(cardReservation, reservation) {
    if (!etat.templateCardParcDiaporama) return cardReservation;
    const carte = etat.templateCardParcDiaporama.cloneNode(true);
    carte.classList.add("lcdp-box-card-parc--reserver", "lcdp-planning-carte-visite", "lcdp-carte-acces-visuel");
    carte.dataset.idflux = String(reservation.idflux || "");
    const ouvrir = carte.querySelector("[data-lcdp-diaporama-retourner]");
    const fermer = carte.querySelector("[data-lcdp-diaporama-fermer]");
    const dos = carte.querySelector("[data-lcdp-diaporama-dos]");
    const contenu = carte.querySelector("[data-lcdp-diaporama-dos-contenu]");
    const parc = reservation.parc || {};
    const nom = String(parc.nom || parc.nomparc || reservation.nomparc || "Parc").trim();
    const departement = String(parc.dptmt || parc.departement || reservation.dptmt || "").trim();
    // Certains noms contiennent déjà le département en suffixe « - 45 ».
    // Le retirer uniquement s'il correspond au département de la réservation.
    const suffixeDepartement = departement ? " - " + departement : "";
    const nomAffiche = suffixeDepartement && nom.endsWith(suffixeDepartement)
      ? nom.slice(0, -suffixeDepartement.length).trim()
      : nom;
    const nomAvecDepartement = "Parc de " + nomAffiche + (departement ? " (" + departement + ")" : "");
    const date = formaterDateCourte(reservation.datebookd);
    const heure = formaterPlageAccesReservation(reservation);
    const media = cardReservation.querySelector("[data-lcdp-card-reservation-media]");
    if (media && !media.hidden) {
      const img = media.querySelector("img");
      if (img) {
        const image = document.createElement("img");
        image.src = img.src;
        image.alt = img.alt;
        image.loading = "lazy";
        image.decoding = "async";
        image.className = "lcdp-planning-carte-visite__image lcdp-carte-acces-visuel__image";
        image.addEventListener("error", () => {
          const secours = construireUrlObjet("/IMAG/PARC/cardlogo.webp");
          if (image.src !== secours) image.src = secours;
        }, { once: true });
        ouvrir.appendChild(image);
      }
    }
    if (!ouvrir.querySelector("img")) {
      const imageAbsente = document.createElement("span");
      imageAbsente.className = "lcdp-planning-carte-visite__sans-image";
      imageAbsente.textContent = nomAvecDepartement;
      ouvrir.appendChild(imageAbsente);
    }

    const degrade = document.createElement("span");
    degrade.className = "lcdp-carte-acces-visuel__degrade";
    degrade.setAttribute("aria-hidden", "true");

    const titreParc = document.createElement("span");
    titreParc.className = "lcdp-carte-acces-visuel__titre";
    titreParc.textContent = nomAvecDepartement;

    const blocHoraire = document.createElement("span");
    blocHoraire.className = "lcdp-carte-acces-visuel__bloc-horaire";
    const ligneDate = document.createElement("span");
    ligneDate.className = "lcdp-carte-acces-visuel__date";
    ligneDate.textContent = date;
    const ligneHoraire = document.createElement("span");
    ligneHoraire.className = "lcdp-carte-acces-visuel__horaire";
    ligneHoraire.textContent = heure;
    blocHoraire.append(ligneDate, ligneHoraire);

    ouvrir.append(degrade, titreParc, blocHoraire);
    actualiserHoraireEffectifReservation(reservation, horaire => {
      ligneHoraire.textContent = horaire;
    });
    ouvrir.setAttribute("aria-label",
      "Voir les détails de la visite au " + nomAvecDepartement + " le " + date +
      (heure ? ", de " + heure : ""));
    // Conserver intégralement le gabarit et sa hauteur : seuls les enfants sont réordonnés.
    const detailVerso = cardReservation.querySelector(".lcdp-box-card-reservation-membre__content");
    const parcVerso = cardReservation.querySelector(".lcdp-box-card-reservation-membre__place");
    const dateVerso = cardReservation.querySelector(".lcdp-box-card-reservation-membre__date");
    const actionsVerso = cardReservation.querySelector(".lcdp-box-card-reservation-membre__actions");
    const annulerVerso = cardReservation.querySelector("[data-action='annuler']");
    const inviterVerso = cardReservation.querySelector("[data-action='invitation']");
    const accesVerso = cardReservation.querySelector("[data-action='adresse']");
    if (detailVerso && parcVerso && dateVerso) {
      detailVerso.prepend(parcVerso);
      // La croix partage réellement la ligne du nom du parc.
      fermer.classList.add("lcdp-planning-verso-fermer-inline");
      parcVerso.appendChild(fermer);
      parcVerso.style.marginBottom = "0";
      dateVerso.style.marginTop = "0";
      if (accesVerso) {
        accesVerso.classList.add("lcdp-planning-verso-acces");
        dateVerso.appendChild(accesVerso);
      }
      if (reservationHorsAbonnementMembre(reservation)) {
        const rond = document.createElement("span");
        rond.title = "Invitation reçue";
        rond.setAttribute("aria-label", "Invitation reçue");
        rond.style.cssText = "display:inline-block;width:1em;height:1em;flex:0 0 1em;border-radius:50%;background:#e78db3;";
        dateVerso.prepend(rond);
      }
    }
    if (actionsVerso) {
      actionsVerso.classList.add("lcdp-planning-verso-actions");
      if (inviterVerso) {
        actionsVerso.prepend(inviterVerso);
        habillerBoutonInvitesVerso(inviterVerso, reservation);
      }
      if (annulerVerso) {
        actionsVerso.prepend(annulerVerso);
        annulerVerso.textContent = "Annuler";
        annulerVerso.classList.add("lcdp-planning-verso-action");
        const bloque = annulationAccesImpossibleParis(reservation);
        annulerVerso.setAttribute("aria-disabled", String(bloque));
        annulerVerso.title = bloque ? "Annulation impossible après 14h" : "";
      }
    }
    // MES ACCÈS : Fiche et Carte sont deux vues du même wrapper membre.
    // Aucune URL publique, aucun nouvel onglet ni rechargement de réservation.
    // L'identifiant de la réservation (fluxm.idparc) est la référence
    // autoritative pour le parc réservé. Le parc joint est une donnée
    // descriptive et ne doit pas prendre la priorité sur cette clé.
    const idParc = String(reservation.idparc || parc.idparc || parc.id || "").trim();
    if (idParc) {
      const liensParc = document.createElement("div");
      liensParc.className = "lcdp-box-card-parc__actions lcdp-box-card-parc__actions--reserver lcdp-planning-verso-liens";
      liensParc.setAttribute("aria-label", "Consulter le parc");
      for (const [libelle, vue, icone, variante] of [
        ["Fiche parc", "fiche", "presentation", "vert-plein"],
        ["Carte", "carte", "localiser", "vert-plein"]
      ]) {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-button lcdp-box-card-parc__action lcdp-box-card-parc__action--" + variante;
        bouton.setAttribute("aria-label", libelle + " : " + nomAvecDepartement);
        const img = document.createElement("img");
        img.className = "lcdp-box-card-parc__action-icone lcdp-box-card-parc__action-icone--" + icone;
        img.src = construireUrlObjet("/IMAG/PICTO/picto-" + icone + ".svg");
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        const texte = document.createElement("span");
        texte.className = "lcdp-box-card-parc__action-libelle";
        texte.textContent = libelle;
        bouton.append(img, texte);
        bouton.addEventListener("click", () => {
          void ouvrirVueFicheDansMesAcces({
            ...parc,
            idparc: idParc,
            dptmt: departement,
            nom: parc.nom || parc.nomparc || reservation.nomparc || ""
          }, vue, bouton)
            .catch(error => {
              console.error("MES ACCÈS : Fiche/Carte du parc indisponible", error);
              fermerVueFicheDansMesAcces();
              void afficherAlerte(error.message || "Impossible d'ouvrir la fiche du parc.");
            });
        });
        liensParc.appendChild(bouton);
      }
      cardReservation.querySelector(".lcdp-box-card-reservation-membre__body")?.appendChild(liensParc);
    }
    contenu.appendChild(cardReservation);
    const basculer = ouvert => {
      // Éviter de conserver un décalage vertical du recto dans le verso.
      if (ouvert) {
        dos.scrollTop = 0;
        contenu.scrollTop = 0;
      }
      carte.classList.toggle("is-retourne", ouvert);
      ouvrir.setAttribute("aria-expanded", String(ouvert));
      dos.setAttribute("aria-hidden", String(!ouvert));
      fermer.tabIndex = ouvert ? 0 : -1;
      contenu.querySelectorAll("button").forEach(bouton => { bouton.tabIndex = ouvert ? 0 : -1; });
    };
    ouvrir.addEventListener("click", () => basculer(true));
    fermer.addEventListener("click", () => { basculer(false); ouvrir.focus(); });
    basculer(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (carte.isConnected) carte.classList.add("is-ready");
    }));
    return carte;
  }

  // Deux surfaces du même tunnel MES ACCÈS : la liste est conservée
  // montée en mémoire lorsque la Fiche ou la Carte est consultée.
  let controleurFicheMesAcces = null;
  let ouvertureFicheMesAcces = 0;
  let declencheurFicheMesAcces = null;
  // Un calque propre à Fiche/Carte, distinct des vues secondaires
  // de MES ACCÈS (réservations, invitations, etc.).
  let surfaceFicheMesAcces = null;

  function ouvrirCalqueFicheMesAcces(hote) {
    const main = document.querySelector("body.lcdp-mes-acces-page > .lcdp-app-wrapper > .lcdp-site-main");
    if (!main || !hote) throw new Error("Surface du wrapper membre indisponible.");
    const parent = hote.parentNode;
    const suivant = hote.nextSibling;
    if (!parent) throw new Error("Emplacement initial de la fiche manquant.");

    const scrollInitial = main.scrollTop;
    const contenuInitial = main.querySelector(":scope > .lcdp-page-section");
    const inertInitial = contenuInitial?.inert === true;
    main.appendChild(hote);
    document.body.classList.add("lcdp-mes-acces-calque-fiche-actif");
    if (contenuInitial) contenuInitial.inert = true;
    // Le calque démarre en haut même si MES ACCÈS était déjà défilé.
    main.scrollTop = 0;
    let ferme = false;
    return {
      fermer() {
        if (ferme) return;
        ferme = true;
        document.body.classList.remove("lcdp-mes-acces-calque-fiche-actif");
        if (contenuInitial) contenuInitial.inert = inertInitial;
        if (parent.isConnected) {
          parent.insertBefore(hote, suivant?.parentNode === parent ? suivant : null);
        }
        main.scrollTop = scrollInitial;
      }
    };
  }

  function fermerVueFicheDansMesAcces() {
    ouvertureFicheMesAcces += 1;
    controleurFicheMesAcces?.detruire?.();
    controleurFicheMesAcces = null;
    const fiche = document.getElementById("lcdp-mes-acces-fiche-slot");
    fiche?.replaceChildren();
    if (fiche) fiche.hidden = true;
    surfaceFicheMesAcces?.fermer();
    surfaceFicheMesAcces = null;
    declencheurFicheMesAcces?.focus?.({ preventScroll: true });
    declencheurFicheMesAcces = null;
  }

  let chargementMoteurFicheMesAcces = null;
  function obtenirMoteurFicheMesAcces() {
    if (typeof window.LCDP_FicheParc?.monterDansConteneur === "function") {
      return Promise.resolve(window.LCDP_FicheParc);
    }
    if (!chargementMoteurFicheMesAcces) {
      chargementMoteurFicheMesAcces = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = construireUrlPublic("/ESPACE-PUBLIC/fiche-parc.js?v=20261113-wrapper-unique-v9");
        script.onload = () => {
          if (typeof window.LCDP_FicheParc?.monterDansConteneur === "function") {
            resolve(window.LCDP_FicheParc);
          } else {
            reject(new Error("Moteur de Fiche Parc introuvable."));
          }
        };
        script.onerror = () => reject(new Error("Chargement de la Fiche Parc impossible."));
        document.body.appendChild(script);
      }).catch(error => {
        chargementMoteurFicheMesAcces = null;
        throw error;
      });
    }
    return chargementMoteurFicheMesAcces;
  }

  async function ouvrirVueFicheDansMesAcces(parc, vue = "fiche", declencheur = null) {
    const hote = document.getElementById("lcdp-mes-acces-fiche-slot");
    if (!hote || !etat.slotPlanning) throw new Error("Wrapper MES ACCÈS introuvable.");
    const idparc = String(parc?.idparc || parc?.id || "").trim();
    if (!idparc) throw new Error("Identifiant du parc manquant.");

    // Le wrapper reste visible : un seul calque, un seul défilement.
    // On affiche le spinner AVANT les chargements asynchrones, puis la vue
    // entièrement montée d'un seul coup. Le DOM caché reste mesurable.
    if (surfaceFicheMesAcces) fermerVueFicheDansMesAcces();
    const generation = ++ouvertureFicheMesAcces;
    const surface = ouvrirCalqueFicheMesAcces(hote);
    surfaceFicheMesAcces = surface;
    declencheurFicheMesAcces = declencheur;

    const attente = document.createElement("div");
    attente.className = "lcdp-mes-acces-calque-attente";
    attente.setAttribute("role", "status");
    attente.setAttribute("aria-label", "Chargement du parc");
    const spinnerOriginal = document.querySelector("#lcdp-planning-attente .lcdp-loading-spinner");
    if (spinnerOriginal) {
      attente.appendChild(spinnerOriginal.cloneNode(true));
    } else {
      attente.textContent = "Chargement du parc…";
    }
    hote.replaceChildren(attente);
    hote.hidden = false;

    try {
      const [moteur, fragment] = await Promise.all([
        obtenirMoteurFicheMesAcces(),
        chargerFragmentObjet("/HTMLBASE/04-shift-detail-parc.html")
      ]);
      if (generation !== ouvertureFicheMesAcces) return;

      const shift = fragment.querySelector("[data-lcdp-box-shift-detail-parc]");
      const contenu = shift?.querySelector("[data-lcdp-shift-detail-parc-content]");
      const fermer = shift?.querySelector("[data-lcdp-shift-detail-parc-close]");
      if (!shift || !contenu || !fermer) {
        throw new Error("Structure de la Fiche Parc incomplète.");
      }
      shift.classList.add("lcdp-box-shift-detail-parc--page");
      shift.dataset.lcdpShiftVue = vue;
      shift.removeAttribute("role");
      shift.removeAttribute("aria-modal");
      fermer.addEventListener("click", fermerVueFicheDansMesAcces);
      shift.style.visibility = "hidden";
      shift.setAttribute("aria-hidden", "true");
      shift.inert = true;
      hote.appendChild(shift);

      const controleur = await moteur.monterDansConteneur(contenu, parc, {
        vueInitiale: vue,
        modeUsage: "reservation-membre",
        // Le contrôleur utilise le même Worker que PLANIFIER. On valide
        // la cohérence de son résultat avec l'identifiant du fluxm,
        // sans jamais afficher un autre parc pour masquer une erreur.
        chargerFicheParc: async (idRecherche) => {
          const identifiant = String(idRecherche || "").trim();
          if (identifiant !== idparc) {
            throw new Error("Identifiant du parc incohérent avec la réservation.");
          }
          const fiche = await moteur.chargerFicheParc(identifiant);
          const idRetour = String(fiche?.parc?.idparc || "").trim();
          if (!fiche?.parc || (idRetour && idRetour !== idparc)) {
            throw new Error("La fiche retournée ne correspond pas au parc réservé.");
          }
          return fiche;
        },
        chargerFragmentObjet,
        construireUrlObjet,
        appliquerRoutes: appliquerRoutesSite,
        onVueChange: (vueActuelle) => {
          shift.dataset.lcdpShiftVue = vueActuelle;
        }
      });
      if (generation !== ouvertureFicheMesAcces) {
        controleur?.detruire?.();
        return;
      }

      controleurFicheMesAcces = controleur;
      shift.dataset.lcdpShiftVue = controleur.getVue();
      // Le changement de visibilité est atomique pour éviter l'effet
      // « wrapper qui se construit » observé sur Fiche et Carte.
      shift.classList.add("lcdp-box-shift-detail-parc--visible");
      shift.style.removeProperty("visibility");
      shift.removeAttribute("aria-hidden");
      shift.inert = false;
      attente.remove();
      const main = hote.closest(".lcdp-site-main");
      if (main) main.scrollTop = 0;
    } catch (error) {
      if (generation === ouvertureFicheMesAcces) fermerVueFicheDansMesAcces();
      throw error;
    }
  }

  function habillerBoutonInvitesVerso(bouton, reservation) {
    if (!bouton) return;
    const estInviteRecu = reservationHorsAbonnementMembre(reservation);
    bouton.classList.add("lcdp-planning-verso-action");
    bouton.classList.toggle("lcdp-planning-verso-action--consulter", estInviteRecu);
    bouton.classList.remove("lcdp-box-card-reservation-membre__micro-action--invit-recu");
    const icone = document.createElement("span");
    icone.setAttribute("aria-hidden", "true");
    icone.style.cssText = "display:inline-flex;width:16px;height:16px;";
    icone.innerHTML = estInviteRecu
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m7-10a4 4 0 100-8 4 4 0 000 8zm8 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>';
    if (estInviteRecu) {
      bouton.replaceChildren(icone, document.createTextNode("Invités"));
      bouton.setAttribute("aria-label", "Consulter les invités");
      bouton.title = "Consulter la liste des invités";
    } else {
      const nombre = nombreInvitesEnvoyesPlanning(reservation);
      const compteur = document.createElement("span");
      compteur.className = "lcdp-planning-verso-compteur";
      compteur.textContent = nombre > 0 ? String(nombre) : "−";
      bouton.replaceChildren(icone, document.createTextNode("Inviter"), compteur);
      bouton.setAttribute("aria-label", "Gérer ou ajouter des invités (" + nombre + " actifs)");
      bouton.title = "Gérer les invités";
    }
  }

  function rafraichirListeFiltreePlanningMembre() {
    if (etat.modeAffichage === "liste") afficherPlanningMembreEnListe();
    else afficherCalendrierMois();
  }

  function moisReservationPlanningMembre(reservation) {
    return extraireDateFranceReservation(reservation.datebookd).slice(0,7);
  }

  function futursPourFiltresPlanningMembre() {
    return filtrerEtTrierReservationsAgenda(etat.reservations,"avenir");
  }

  function premierMoisRendezVousPlanningMembre() {
    const prochain = futursPourFiltresPlanningMembre()[0];
    return prochain ? moisReservationPlanningMembre(prochain) : "";
  }

  function installerFiltresPlanningMembre() {
    const tools = etat.wrapperPlanning?.querySelector("[data-lcdp-liste-card-tools]");
    if (!tools) return;
    const formulaire = document.createElement("form");
    formulaire.className = "lcdp-planning-filtres";
    formulaire.setAttribute("aria-label","Filtres des accès à venir");
    formulaire.addEventListener("submit", event => event.preventDefault());

    const champs = document.createElement("div");
    champs.className = "lcdp-planning-filtres__champs";
    for (const [cle, nom] of [["mois","Période"],["departement","Département"],["parc","Parc"]]) {
      const champ = document.createElement("div");
      champ.className = "lcdp-planning-filtres__champ";
      champ.dataset.lcdpFiltreChamp = cle;
      const etiquette = document.createElement("label");
      etiquette.className = "lcdp-planning-filtres__label";
      etiquette.htmlFor = "lcdp-planning-filtre-" + cle;
      etiquette.textContent = nom;
      const select = document.createElement("select");
      select.id = "lcdp-planning-filtre-" + cle;
      select.className = "lcdp-planning-filtres__select";
      select.dataset.lcdpFiltre = cle;
      select.setAttribute("aria-label","Filtrer par " + nom.toLowerCase());
      select.appendChild(new Option("Tous",""));
      select.addEventListener("change", () => {
        etat.filtres[cle] = select.value;
        if (cle === "departement" || cle === "mois") actualiserOptionsFiltresPlanningMembre();
        actualiserEtatFiltresPlanningMembre();
        rafraichirListeFiltreePlanningMembre();
      });
      champ.append(etiquette, select);
      champs.appendChild(champ);
    }
    formulaire.appendChild(champs);

    const groupe = document.createElement("div");
    groupe.className = "lcdp-planning-filtres__invitations";
    for (const [cle, libelle] of [["recues","Invitations"],["envoyees","Invités"]]) {
      const label = document.createElement("label");
      label.className = "lcdp-planning-filtres__option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;
      input.dataset.lcdpFiltreInvitation = cle;
      input.setAttribute("aria-label",libelle);
      const texte = document.createElement("span");
      texte.textContent = libelle;
      label.append(input,texte);
      input.addEventListener("change", () => {
        etat.filtres[cle] = input.checked;
        actualiserEtatFiltresPlanningMembre();
        rafraichirListeFiltreePlanningMembre();
      });
      groupe.appendChild(label);
    }
    formulaire.appendChild(groupe);

    const pied = document.createElement("div");
    pied.className = "lcdp-planning-filtres__actions";
    const resultat = document.createElement("span");
    resultat.className = "lcdp-planning-filtres__resultat";
    resultat.dataset.lcdpFiltresResultat = "true";
    resultat.setAttribute("role","status");
    resultat.setAttribute("aria-live","polite");
    const effacer = document.createElement("button");
    effacer.type = "button";
    effacer.className = "lcdp-planning-filtres__effacer";
    effacer.dataset.lcdpEffacerFiltres = "true";
    effacer.textContent = "Effacer";
    effacer.addEventListener("click", () => {
      etat.filtres = {
        mois: premierMoisRendezVousPlanningMembre(),
        departement: "", parc: "", recues: true, envoyees: true
      };
      actualiserOptionsFiltresPlanningMembre();
      actualiserEtatFiltresPlanningMembre();
      rafraichirListeFiltreePlanningMembre();
    });
    pied.append(resultat,effacer);
    formulaire.appendChild(pied);
    // Commande de divulgation compacte : le filtrage reste actif même replié.
    const commandeFiltres = document.createElement("button");
    commandeFiltres.type = "button";
    commandeFiltres.className = "lcdp-planning-filtres__bascule";
    commandeFiltres.setAttribute("aria-controls", "lcdp-planning-filtres-contenu");
    commandeFiltres.setAttribute("aria-expanded", "false");
    commandeFiltres.setAttribute("aria-label", "Afficher les filtres");
    commandeFiltres.style.cssText = "display:flex;align-items:center;justify-content:space-between;width:100%;padding:8px 12px;border:1px solid #d7ddd5;border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer;";
    const libelleFiltres = document.createElement("span");
    libelleFiltres.textContent = "Filtres";
    const signeFiltres = document.createElement("span");
    signeFiltres.textContent = "+";
    signeFiltres.setAttribute("aria-hidden", "true");
    signeFiltres.style.cssText = "font-size:22px;line-height:1;font-weight:500;";
    commandeFiltres.append(libelleFiltres, signeFiltres);
    formulaire.id = "lcdp-planning-filtres-contenu";
    formulaire.hidden = true;
    formulaire.style.display = "none";
    commandeFiltres.addEventListener("click", () => {
      const ouvert = commandeFiltres.getAttribute("aria-expanded") !== "true";
      commandeFiltres.setAttribute("aria-expanded", String(ouvert));
      commandeFiltres.setAttribute("aria-label", ouvert ? "Masquer les filtres" : "Afficher les filtres");
      signeFiltres.textContent = ouvert ? "−" : "+";
      formulaire.hidden = !ouvert;
      formulaire.style.display = ouvert ? "" : "none";
    });
    tools.replaceChildren(commandeFiltres, formulaire);
    tools.hidden = false;
    etat.formulaireFiltres = formulaire;
    actualiserOptionsFiltresPlanningMembre();
    actualiserEtatFiltresPlanningMembre();
  }

  function actualiserOptionsFiltresPlanningMembre() {
    const formulaire = etat.formulaireFiltres;
    if(!formulaire) return;
    const futures = futursPourFiltresPlanningMembre();
    const mois = [...new Set(futures.map(moisReservationPlanningMembre).filter(Boolean))].sort();
    if(!etat.filtresInitialises && futures.length) {
      etat.filtres.mois = mois[0] || "";
      etat.filtresInitialises = true;
    }

    const selectMois = formulaire.querySelector('[data-lcdp-filtre="mois"]');
    const selectionMois = etat.filtres.mois;
    selectMois.replaceChildren(new Option("Tous",""));
    for(const valeur of mois) {
      const [annee,numMois] = valeur.split("-").map(Number);
      const libelle = new Intl.DateTimeFormat("fr-FR", {month:"long",year:"numeric"})
        .format(new Date(annee,numMois-1,1));
      selectMois.add(new Option(libelle.charAt(0).toUpperCase()+libelle.slice(1),valeur));
    }
    if(selectionMois && !mois.includes(selectionMois)) etat.filtres.mois = "";
    selectMois.value = etat.filtres.mois;

    const dansMois = futures.filter(r => !etat.filtres.mois ||
      moisReservationPlanningMembre(r) === etat.filtres.mois);
    const dpts = [...new Set(dansMois.map(r=>
      String(r.parc?.dptmt||r.parc?.departement||r.dptmt||"").trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
    const selectDpt = formulaire.querySelector('[data-lcdp-filtre="departement"]');
    selectDpt.replaceChildren(new Option("Tous",""));
    dpts.forEach(value=>selectDpt.add(new Option(value,value)));
    if(etat.filtres.departement && !dpts.includes(etat.filtres.departement)) etat.filtres.departement="";
    selectDpt.value = etat.filtres.departement;

    const dansDpt = dansMois.filter(r => !etat.filtres.departement ||
      String(r.parc?.dptmt||r.parc?.departement||r.dptmt||"").trim()===etat.filtres.departement);
    const parcs = [...new Set(dansDpt.map(r=>
      String(r.parc?.nom||r.parc?.nomparc||r.nomparc||"").trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
    const selectParc = formulaire.querySelector('[data-lcdp-filtre="parc"]');
    selectParc.replaceChildren(new Option("Tous",""));
    parcs.forEach(value=>selectParc.add(new Option(value,value)));
    if(etat.filtres.parc && !parcs.includes(etat.filtres.parc)) etat.filtres.parc="";
    selectParc.value = etat.filtres.parc;
  }

  function nombreInvitesEnvoyesPlanning(reservation) {
    if (reservationHorsAbonnementMembre(reservation)) return 0;
    const stats = reservation?.invitationStats || reservation?.invitationsStats || {};
    const n = Number(stats.in ?? stats.actifs ?? stats.invites ?? 0);
    return Number.isFinite(n) ? Math.max(0,n) : 0;
  }
  function filtresPlanningActifs() {
    const f=etat.filtres;
    return Boolean(f.mois || f.parc || f.departement || !f.recues || !f.envoyees);
  }

  function actualiserEtatFiltresPlanningMembre() {
    const formulaire=etat.formulaireFiltres;
    if(!formulaire)return;
    const inactif=etat.periodeAffichage!=="avenir";
    const conteneur=formulaire.closest("[data-lcdp-liste-card-tools]");
    if(conteneur)conteneur.hidden=inactif||etat.modeAffichage==="agenda";
    for(const select of formulaire.querySelectorAll("select[data-lcdp-filtre]")) {
      select.disabled=inactif;
      select.value=etat.filtres[select.dataset.lcdpFiltre]||"";
    }
    for(const caseACocher of formulaire.querySelectorAll("input[data-lcdp-filtre-invitation]")) {
      caseACocher.disabled=inactif;
      caseACocher.checked=Boolean(etat.filtres[caseACocher.dataset.lcdpFiltreInvitation]);
    }
    const effacer=formulaire.querySelector("[data-lcdp-effacer-filtres]");
    if(effacer)effacer.disabled=inactif || (
      etat.filtres.mois===premierMoisRendezVousPlanningMembre() &&
      !etat.filtres.parc && !etat.filtres.departement &&
      etat.filtres.recues && etat.filtres.envoyees
    );
    formulaire.setAttribute("aria-disabled",String(inactif));
  }

  function filtrerReservationsPlanningMembre(reservations) {
    if(etat.periodeAffichage!=="avenir")return reservations;
    const f=etat.filtres;
    return reservations.filter(reservation=>{
      const parc=reservation.parc||{};
      const departement=String(parc.dptmt||parc.departement||reservation.dptmt||"").trim();
      const nom=String(parc.nom||parc.nomparc||reservation.nomparc||"").trim();
      if(f.mois && moisReservationPlanningMembre(reservation)!==f.mois)return false;
      if(f.departement && departement!==f.departement)return false;
      if(f.parc && nom!==f.parc)return false;
      if(!f.recues && reservationHorsAbonnementMembre(reservation))return false;
      if(!f.envoyees && !reservationHorsAbonnementMembre(reservation) &&
        (nombreInvitesEnvoyesPlanning(reservation)>0 ||
         etat.reservationsAvecInvites.has(String(reservation.idflux||""))))return false;
      return true;
    });
  }

  function filtrerEtTrierReservationsAgenda(
    source,
    periode = etat.periodeAffichage
  ) {
    const reservations =
      (Array.isArray(source) ? source : [])
        .filter((reservation) =>
          reservationDansPeriodeAgenda(
            reservation,
            periode
          )
        );

    reservations.sort((a, b) => {
      const dateA = new Date(
        a?.datebookd || ""
      ).getTime();
      const dateB = new Date(
        b?.datebookd || ""
      ).getTime();

      return periode === "avenir"
        ? dateA - dateB
        : dateB - dateA;
    });

    return reservations;
  }

  function reservationDansPeriodeAgenda(
    reservation,
    periode = etat.periodeAffichage
  ) {
    const annulee =
      reservationAnnuleePlanning(
        reservation
      );
    const passee =
      reservationPasseePlanning(
        reservation
      );

    return periode === "avenir"
      ? !annulee && !passee
      : annulee || passee;
  }

  function reservationAnnuleePlanning(
    reservation
  ) {
    return (
      normaliserTexteTechnique(
        reservation?.statut || ""
      ) === "cancd"
    );
  }

  function actualiserModeWrapperPlanning() {
    if (!etat.wrapperPlanning) return;

    const estListe = etat.modeAffichage === "liste";

    etat.wrapperPlanning.classList.toggle(
      "lcdp-box-liste-card--mode-liste",
      estListe
    );
    etat.wrapperPlanning.classList.toggle(
      "lcdp-box-liste-card--mode-agenda",
      !estListe
    );
    // Le titre/les onglets gardent exactement le même ancrage dans les trois modes.
    etat.wrapperPlanning.classList.add("lcdp-planning-navigation-permanente");
  }

  function actualiserBoutonAffichagePlanningMembre() {
    const bouton = etat.wrapperPlanning
      ? etat.wrapperPlanning.querySelector("[data-lcdp-planning-affichage]")
      : null;

    if (!bouton) return;

    const actif = etat.modeAffichage === "agenda";
    const compte = etat.reservations.filter(reservation =>
      reservationDansPeriodeAgenda(reservation, "avenir")
    ).length;
    definirContenuBoutonVue(bouton, "Planning", compte);
    bouton.setAttribute("aria-pressed", actif ? "true" : "false");
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
      actualiserOptionsFiltresPlanningMembre();
      actualiserEtatFiltresPlanningMembre();
      etat.reservationsParDate = indexerReservationsParDate(etat.reservations);
      actualiserBoutonsPeriodePlanningMembre();
      ajusterMoisCourantSelonPeriode();
      afficherCalendrierMois();

      if (etat.modeAffichage === "liste") {
        afficherPlanningMembreEnListe();
      }
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

  function ajusterMoisCourantSelonPeriode() {
    const aujourdHui =
      dateAujourdhuiParis();
    const reservations =
      filtrerEtTrierReservationsAgenda(
        etat.reservations
      );
    const reservationReference =
      reservations[0] || null;
    const dateReference =
      reservationReference
        ? extraireDateFranceReservation(
            reservationReference.datebookd
          )
        : aujourdHui;

    etat.moisCourant =
      limiterMoisSelonPeriodePlanning(
        debutMois(
          dateReference || aujourdHui
        )
      );
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

    const courant =
      limiterMoisSelonPeriodePlanning(
        etat.moisCourant ||
        debutMois(dateAujourdhuiParis())
      );
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

    // Classes et couleurs du calendrier général PLANIFIER.
    jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--planning-lecture",
      "lcdp-planifier-jour--sans-parc");
    if (estAujourdhui) jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--today");
    if (estPasse) jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--past");
    if (estDansAbonnementAvenir) jour.classList.add("lcdp-planifier-jour--abonnement-couvert");

    PLAGES.forEach((plage) => {
      const slot = jour.querySelector(`[data-lcdp-card-jour-mois-slot="${plage}"]`);
      if (!slot) return;

      // À l'identique de PLANIFIER, un trait n'est visible que si la plage est occupée.
      slot.className = "lcdp-box-card-jour-in-calendrier-mois__slot";
      slot.hidden = true;
      slot.replaceChildren();
      slot.removeAttribute("data-idflux");
      slot.removeAttribute("data-plage");

      const reservationsPlage =
        (reservationsJour.get(plage) || [])
          .filter((reservation) =>
            reservationDansPeriodeAgenda(
              reservation
            )
          )
          .sort((a, b) => {
            const dateA = new Date(
              a?.datebookd || ""
            ).getTime();
            const dateB = new Date(
              b?.datebookd || ""
            ).getTime();

            return etat.periodeAffichage ===
              "avenir"
              ? dateA - dateB
              : dateB - dateA;
          });
      const reservation =
        reservationsPlage[0] || null;

      if (!reservation) return;

      jourReservable = true;
      slot.hidden = false;

      const estAnnulee =
        reservationAnnuleePlanning(
          reservation
        );

      if (estAnnulee) {
        jour.classList.add(
          "lcdp-box-card-jour-in-calendrier-mois--past",
          "lcdp-box-card-jour-in-calendrier-mois--reservation-annulee"
        );
      }

      const estInvite =
        reservationHorsAbonnementMembre(
          reservation
        );
      const estInvitation =
        !estInvite &&
        reservationAvecInvitesActifsAgenda(
          reservation
        );

      const reservationsPersonnelles = reservationsPlage.some(r => !reservationHorsAbonnementMembre(r));
      const invitationsRecues = reservationsPlage.some(r => reservationHorsAbonnementMembre(r));
      slot.classList.add(
        reservationsPersonnelles && invitationsRecues
          ? "lcdp-planifier-plage--acces-et-invitation"
          : invitationsRecues
            ? "lcdp-planifier-plage--invitation-recue"
            : "lcdp-planifier-plage--acces-personnel"
      );
      // Aucune étiquette de parc superposée aux traits de PLANIFIER.
      slot.dataset.idflux =
        String(reservation.idflux || "");
      slot.dataset.plage = plage;
      // Le clic sur un trait doit remonter au bouton du jour :
      // un seul comportement, afficher tous les accès de la journée.

      const nomParcComplet = nomParcReservation(reservation);
      const typeAgenda =
        typeReservationAgenda(reservation);
      const libelleStatut =
        estAnnulee
          ? typeAgenda + " annulée"
          : typeAgenda;

      slot.setAttribute(
        "aria-label",
        libelleStatut +
          " " +
          (nomParcComplet
            ? nomParcComplet + " - "
            : "") +
          libellePlage(plage) +
          " du " +
          formaterDateCourte(
            reservation.datebookd
          )
      );
      slot.title =
        libelleStatut +
        " " +
        (nomParcComplet
          ? nomParcComplet + " - "
          : "") +
        libellePlage(plage);
    });

    // La journée est consultable si elle contient au moins une réservation.
    // Les traits sont purement visuels : leur clic ouvre aussi toute la journée.
    jour.disabled = !jourReservable;
    if (jourReservable) {
      jour.setAttribute("aria-label", "Afficher tous les accès du " + formaterJourMoisDateIso(jourMois.dateIso));
      jour.addEventListener("click", () => {
        ouvrirReservationsJourPlanning(jourMois.dateIso).catch(error => {
          console.error("Erreur ouverture des accès du jour :", error);
          afficherAlerte("Impossible d’afficher les accès de cette journée.").catch(console.error);
        });
      });
    }

    return jour;
  }

  function gererClicSlotCalendrier(event) {
    event.preventDefault();
    event.stopPropagation();

    const slot = event.currentTarget;

    if (!slot || !slot.dataset.idflux) {
      return;
    }

    const reservation =
      trouverReservationPlanningParId(
        slot.dataset.idflux
      );

    if (!reservation) {
      afficherAlerte(
        "Réservation introuvable."
      ).catch(console.error);
      return;
    }

    ouvrirReservationPlanning(
      reservation
    ).catch(console.error);
  }

  // Consultation d'une journée DANS le wrapper membre : aucune lightbox globale.
  function fermerReservationsJourPlanning() {
    const slot = etat.slotPlanning;
    if (!slot || !slot.querySelector("[data-lcdp-planning-jour-inline]")) return;
    slot.replaceChildren(etat.calendrierMois);
    afficherCalendrierMois();
    const retour = slot.querySelector('[data-lcdp-card-jour-mois][data-date="' +
      (etat.jourConsultationPlanning || "") + '"]');
    etat.jourConsultationPlanning = null;
    if (retour) retour.focus({preventScroll:true});
  }

  async function ouvrirReservationsJourPlanning(dateIso) {
    const slot = etat.slotPlanning;
    if (!slot || !etat.templateReservation || etat.modeAffichage !== "agenda") return;
    const reservations = (etat.reservations || [])
      .filter(reservation =>
        extraireDateFranceReservation(reservation.datebookd) === dateIso &&
        reservationDansPeriodeAgenda(reservation)
      )
      .sort((a,b) => {
        const dateA = new Date(a.datebookd || "").getTime();
        const dateB = new Date(b.datebookd || "").getTime();
        if (dateA !== dateB) return dateA - dateB;
        return PLAGES.indexOf(normaliserPlageReservation(a)) -
          PLAGES.indexOf(normaliserPlageReservation(b));
      });
    if (!reservations.length) return;

    const page = document.createElement("section");
    page.className = "lcdp-planning-jour-inline";
    page.dataset.lcdpPlanningJourInline = "true";
    const entete = document.createElement("header");
    entete.className = "lcdp-planning-jour-entete";
    const titre = document.createElement("h2");
    titre.textContent = "Accès du " + formaterJourMoisDateIso(dateIso);
    const fermer = document.createElement("button");
    fermer.type = "button";
    fermer.className = "lcdp-planning-jour-fermer";
    fermer.textContent = "Retour au planning";
    fermer.addEventListener("click", fermerReservationsJourPlanning);
    entete.append(titre,fermer);
    page.appendChild(entete);

    // Le workflow existant est conservé pour les actions Accès/Inviter/Annuler.
    // En mode inline, il n'est ni modal ni en superposition.
    const fragment = await chargerFragmentObjet("/HTMLBASE/04-workflow-reservation.html");
    const workflow = fragment.querySelector("[data-lcdp-box-workflow-reservation]");
    const contenu = fragment.querySelector("[data-lcdp-workflow-reservation-content]");
    if (!workflow || !contenu) throw new Error("Gabarit workflow réservation introuvable.");
    workflow.removeAttribute("role");
    workflow.removeAttribute("aria-modal");
    workflow.classList.add("lcdp-box-workflow-reservation--planning-page",
      "lcdp-planning-jour-workflow-inline");
    const vues = document.createElement("div");
    vues.className = "lcdp-planning-reservation-vues";
    vues.dataset.lcdpPlanningReservationVues = "true";
    const vue = document.createElement("div");
    vue.className = "lcdp-planning-reservation-vue lcdp-planning-reservation-vue--active";
    vue.dataset.lcdpPlanningVue = "reservation";

    const galerie = etat.templateListeParcsDiaporama
      ? etat.templateListeParcsDiaporama.cloneNode(true)
      : document.createElement("div");
    const liste = galerie.querySelector?.("[data-lcdp-liste-card-diaporama-list]") || galerie;
    liste.classList.add("lcdp-planning-jour-liste");
    for (const reservation of reservations) {
      const carteReservation = creerCardReservation(reservation,{contexte:"liste"});
      carteReservation.classList.add("lcdp-box-card-reservation-membre--liste");
      liste.appendChild(creerCarteVisiteDiaporama(carteReservation,reservation));
    }
    vue.appendChild(galerie);
    vues.appendChild(vue);
    contenu.appendChild(vues);
    workflow._lcdpFermerReservationPlanning = fermerReservationsJourPlanning;
    page.appendChild(workflow);

    etat.jourConsultationPlanning = dateIso;
    slot.replaceChildren(page);
    fermer.focus({preventScroll:true});
  }

  // Une seule surface de wrapper pour toutes les boxes : les vues
  // secondaires s'empilent au niveau du main, jamais dans la liste MES ACCÈS.
  // Aucun conteneur ne devient un second élément défilant.
  function ouvrirVueSecondairePlanning() {
    const main = document.querySelector("body.lcdp-mes-acces-page > .lcdp-app-wrapper > .lcdp-site-main");
    if (!main || !etat.slotPlanning?.isConnected) return null;
    const contenuInitial = main.querySelector(":scope > .lcdp-page-section");
    const precedentesVues = Array.from(
      main.querySelectorAll(":scope > [data-lcdp-planning-vue-secondaire]")
    ).map(element => ({ element, hidden: element.hidden, inert: element.inert }));
    const etatInitial = {
      hidden: contenuInitial?.hidden === true,
      inert: contenuInitial?.inert === true,
      scroll: main.scrollTop,
      commandesInertes: etat.commandeBar?.inert === true
    };
    const focusInitial = document.activeElement;
    precedentesVues.forEach(({ element }) => { element.hidden = true; element.inert = true; });
    if (contenuInitial) {
      contenuInitial.hidden = true;
      contenuInitial.inert = true;
    }
    const conteneur = document.createElement("section");
    conteneur.className = "lcdp-planning-vue-secondaire";
    conteneur.dataset.lcdpPlanningVueSecondaire = "true";
    // Évite d'afficher une box vide pendant le chargement de son fragment.
    // Le spinner disparaît dès qu'un véritable composant est monté.
    const attente = document.createElement("div");
    attente.className = "lcdp-mes-acces-calque-attente";
    attente.setAttribute("role", "status");
    attente.setAttribute("aria-label", "Chargement");
    const spinnerOriginal = document.querySelector("#lcdp-planning-attente .lcdp-loading-spinner");
    attente.appendChild(spinnerOriginal
      ? spinnerOriginal.cloneNode(true)
      : document.createTextNode("Chargement…"));
    conteneur.appendChild(attente);
    const surveillerContenu = new MutationObserver(() => {
      if (Array.from(conteneur.children).some(element => element !== attente)) {
        surveillerContenu.disconnect();
        attente.remove();
      }
    });
    surveillerContenu.observe(conteneur, { childList: true });
    main.appendChild(conteneur);
    if (etat.wrapperPlanning) etat.wrapperPlanning.dataset.lcdpVueSecondaireActive = "true";
    if (etat.commandeBar) etat.commandeBar.inert = true;
    main.scrollTop = 0;
    let fermee = false;
    return {
      conteneur,
      fermer() {
        if (fermee) return;
        fermee = true;
        surveillerContenu.disconnect();
        conteneur.remove();
        precedentesVues.forEach(({element, hidden, inert}) => {
          if (element.isConnected) {
            element.hidden = hidden;
            element.inert = inert;
          }
        });
        const autresVues = main.querySelector(":scope > [data-lcdp-planning-vue-secondaire]");
        if (!autresVues) {
          if (contenuInitial) {
            contenuInitial.hidden = etatInitial.hidden;
            contenuInitial.inert = etatInitial.inert;
          }
          etat.wrapperPlanning?.removeAttribute("data-lcdp-vue-secondaire-active");
          if (etat.commandeBar) etat.commandeBar.inert = etatInitial.commandesInertes;
        }
        main.scrollTop = etatInitial.scroll;
        if (focusInitial?.isConnected && !focusInitial.closest("[hidden]") &&
            !focusInitial.closest("[inert]") && typeof focusInitial.focus === "function") {
          focusInitial.focus({ preventScroll: true });
        }
      }
    };
  }

  function preparerDialogueDansWrapper(element) {
    if (!element) return;
    element.removeAttribute("aria-modal");
    element.setAttribute("role", "region");
  }

  // Échap et fermeture agissent uniquement sur la dernière vue ouverte.
  function vueSecondaireAuPremierPlan(conteneur) {
    if (!conteneur?.isConnected) return false;
    const main = document.querySelector("body.lcdp-mes-acces-page > .lcdp-app-wrapper > .lcdp-site-main");
    const vues = main?.querySelectorAll(":scope > [data-lcdp-planning-vue-secondaire]");
    return !!vues?.length && vues[vues.length - 1] === conteneur;
  }

  async function ouvrirReservationPlanning(reservation) {
    const surface = ouvrirVueSecondairePlanning();
    if (!surface || !etat.templateReservation) return;
    const slot = surface.conteneur;

    try {
      const fragmentWorkflow = await chargerFragmentObjet("/HTMLBASE/04-workflow-reservation.html");
      slot.appendChild(fragmentWorkflow);
      const workflow = slot.querySelector("[data-lcdp-box-workflow-reservation]");
      const contenu = slot.querySelector("[data-lcdp-workflow-reservation-content]");
      if (!workflow || !contenu) throw new Error("Structure workflow réservation incomplète.");

      preparerDialogueDansWrapper(workflow);
      workflow.classList.add(
        "lcdp-box-workflow-reservation--planning-page",
        "lcdp-box-workflow-reservation--planning-reservation",
        "lcdp-planning-jour-workflow-inline"
      );

      const boutonRetour = document.createElement("button");
      boutonRetour.type = "button";
      boutonRetour.className = "lcdp-planning-vue-retour";
      boutonRetour.textContent = "Retour à mes accès";
      slot.insertBefore(boutonRetour, workflow);

      const vues = document.createElement("div");
      vues.className = "lcdp-planning-reservation-vues";
      vues.dataset.lcdpPlanningReservationVues = "true";

      const vueReservation = document.createElement("div");
      vueReservation.className = "lcdp-planning-reservation-vue lcdp-planning-reservation-vue--active";
      vueReservation.dataset.lcdpPlanningVue = "reservation";
      vueReservation.appendChild(creerCardReservation(reservation, {contexte:"detail"}));
      vues.appendChild(vueReservation);
      contenu.appendChild(vues);

      function fermer() {
        document.removeEventListener("keydown", gererEchapReservation);
        surface.fermer();
      }
      function gererEchapReservation(event) {
        if (event.key !== "Escape" || !vueSecondaireAuPremierPlan(slot)) return;
        event.preventDefault();
        if (workflow.classList.contains("lcdp-box-workflow-reservation--acces-parc-ouvert")) {
          fermerAccesParcDansReservation(workflow);
        } else {
          fermer();
        }
      }
      workflow._lcdpFermerReservationPlanning = fermer;
      boutonRetour.addEventListener("click", fermer);
      document.addEventListener("keydown", gererEchapReservation);
      boutonRetour.focus({preventScroll:true});
    } catch (error) {
      surface.fermer();
      throw error;
    }
  }

  function creerCardReservation(
    reservation,
    options = {}
  ) {
    const card =
      etat.templateReservation.cloneNode(true);

    const estPasse = reservationPasseePlanning(reservation);
    const delaiActionDepasse = reservationDelaiActionDepasse(reservation);

    const parc = reservation.parc || {};
    const nomParc = parc.nom || parc.nomparc || reservation.nomparc || "Parc";
    const departement = parc.dptmt || parc.departement || reservation.dptmt || "";
    const idParc = parc.idparc || reservation.idparc || "";
    const idFlux = reservation.idflux || "";
    const cheminImageCard = construireCheminImageParcParDefaut(nomParc, departement);

    const media = card.querySelector("[data-lcdp-card-reservation-media]");
    const image = card.querySelector("[data-lcdp-card-reservation-image]");
    const invitation = card.querySelector("[data-lcdp-card-reservation-invitation]");
    const badgeInvitation = card.querySelector("[data-lcdp-card-reservation-invitation-badge]");
    const date = card.querySelector("[data-lcdp-card-reservation-date]");
    const heure = card.querySelector("[data-lcdp-card-reservation-heure]");
    const parcElement = card.querySelector("[data-lcdp-card-reservation-parc]");
    const departementElement = card.querySelector("[data-lcdp-card-reservation-departement]");
    const boutonAdresse = card.querySelector("[data-action='adresse']");
    const boutonInvitation =
      card.querySelector(
        "[data-action='invitation']"
      );
    const boutonAnnuler =
      card.querySelector(
        "[data-action='annuler']"
      );
    const boutonFermer =
      card.querySelector(
        "[data-action='fermer']"
      );

    card.dataset.idflux = idFlux;

    const estAnnulee =
      reservationAnnuleePlanning(
        reservation
      );

    if (estPasse || estAnnulee) {
      card.classList.add(
        "lcdp-box-card-reservation-membre--passe"
      );
    }

    if (estAnnulee) {
      card.classList.add(
        "lcdp-box-card-reservation-membre--annulee"
      );
    }

    if (
      options.prochaine === true &&
      !estPasse &&
      !estAnnulee
    ) {
      card.classList.add(
        "lcdp-box-card-reservation-membre--prochaine"
      );
      card.dataset.lcdpProchaineReservation =
        "true";
    }

    if (boutonFermer) {
      const afficherFermer =
        options.contexte === "detail";

      boutonFermer.hidden =
        !afficherFermer;
      boutonFermer.setAttribute(
        "aria-hidden",
        afficherFermer
          ? "false"
          : "true"
      );
    }

    const estReservationHorsAbonnement = reservationHorsAbonnementMembre(reservation);

    if (estReservationHorsAbonnement) {
      card.classList.add("lcdp-box-card-reservation-membre--invitation");
    }

    if (image && media) {
      const srcImage = construireUrlImageParc(cheminImageCard);

      if (srcImage) {
        image.src = srcImage;
        image.alt = "Parc de " + nomParc;
        image.addEventListener("error", () => {
          const secours = construireUrlObjet("/IMAG/PARC/cardlogo.webp");
          if (image.src !== secours) image.src = secours;
        }, { once: true });
        media.hidden = false;
        card.classList.add("lcdp-box-card-reservation-membre--avec-image");
      } else {
        image.removeAttribute("src");
        image.alt = "";
        media.hidden = true;
      }
    }

    if (invitation) {
      invitation.textContent =
        estAnnulee
          ? "Annulée"
          : "";
      invitation.hidden =
        !estAnnulee;
    }

    if (date) date.textContent = formaterDateCourte(reservation.datebookd);
    if (heure) {
      heure.textContent = formaterPlageAccesReservation(reservation);
      actualiserHoraireEffectifReservation(reservation, horaire => {
        heure.textContent = horaire;
      });
    }
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
      boutonInvitation.hidden =
        estAnnulee;
      boutonInvitation.classList.remove(
        "lcdp-box-card-reservation-membre__micro-action--delai-depasse",
        "lcdp-box-card-reservation-membre__micro-action--invit-recu"
      );

      if (estReservationHorsAbonnement) {
        boutonInvitation.textContent = "Invit’";
        boutonInvitation.classList.add("lcdp-box-card-reservation-membre__micro-action--invit-recu");
        boutonInvitation.setAttribute("aria-disabled", "false");
        boutonInvitation.removeAttribute("disabled");
        boutonInvitation.disabled = false;
        boutonInvitation.style.pointerEvents = "auto";
        boutonInvitation.title = "Afficher le parrain";
        if (options.contexte !== "liste") boutonInvitation.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          afficherParrainReservationInvitee(reservation).catch((error) => {
            console.error("[LCDP invitation reçue] affichage parrain impossible", error);
            afficherErreurCalendrier(formaterParrainInvitationRecue(reservation));
          });
        });
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
      boutonAnnuler.hidden =
        estAnnulee;
      boutonAnnuler.textContent =
        estReservationHorsAbonnement
          ? "Annuler l’invite"
          : "Annuler la réservation";
      boutonAnnuler.hidden = estAnnulee;
      const annulationInterdite = annulationAccesImpossibleParis(reservation);
      boutonAnnuler.classList.toggle("lcdp-box-card-reservation-membre__micro-action--delai-depasse", annulationInterdite);
      boutonAnnuler.setAttribute("aria-disabled", annulationInterdite ? "true" : "false");

      if (annulationInterdite) {
        boutonAnnuler.title = "Annulation impossible après 14h";
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
    const boutonRetourAcces = event.target.closest("[data-lcdp-card-acces-parc-retour]");
    const boutonFermerReservation = event.target.closest("[data-action='fermer']");
    const boutonAdresse = event.target.closest("[data-action='adresse']");
    const boutonInvitation = event.target.closest("[data-action='invitation']");
    const boutonAnnuler = event.target.closest("[data-action='annuler']");

    if (boutonRetourAcces) {
      event.preventDefault();
      event.stopPropagation();
      const workflow = boutonRetourAcces.closest("[data-lcdp-box-workflow-reservation]");
      fermerAccesParcDansReservation(workflow);
      return;
    }

    if (boutonFermerReservation) {
      event.preventDefault();
      event.stopPropagation();
      const workflow = boutonFermerReservation.closest("[data-lcdp-box-workflow-reservation]");

      if (workflow && typeof workflow._lcdpFermerReservationPlanning === "function") {
        workflow._lcdpFermerReservationPlanning();
        return;
      }

      return;
    }

    if (boutonAdresse) {
      const cardReservation = boutonAdresse.closest("[data-lcdp-box-card-reservation-membre]");
      const idflux = String(boutonAdresse.dataset.id || cardReservation?.dataset.idflux || "").trim();
      await ouvrirAccesParcReservation(idflux, boutonAdresse);
      return;
    }

    if (boutonInvitation) {
      const cardReservation = boutonInvitation.closest("[data-lcdp-box-card-reservation-membre]");
      const idflux = String(boutonInvitation.dataset.id || cardReservation?.dataset.idflux || "").trim();
      const reservation = trouverReservationPlanningParId(idflux);

      if (reservationHorsAbonnementMembre(reservation)) {
        event.preventDefault();
        event.stopPropagation();
        if (boutonInvitation.closest(".lcdp-planning-carte-visite")) {
          await ouvrirListeInvitesReservation(
            String(reservation?.idfluxparrain || idflux), boutonInvitation, { lectureSeule: true }
          );
        } else {
          await afficherParrainReservationInvitee(reservation);
        }
        return;
      }

      await ouvrirPageInvitation(idflux, boutonInvitation);
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
      : etat.slotPlanning?.querySelector("[data-lcdp-box-workflow-reservation]");

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

      const fragmentAcces = await chargerFragmentObjet("/HTMLBASE/04-card-acces-parc.html");
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

    let boutonRetour = boxAcces.querySelector("[data-lcdp-card-acces-parc-retour]");
    const header = boxAcces.querySelector(".lcdp-box-card-acces-parc__header");
    const titre = boxAcces.querySelector("[data-lcdp-card-acces-parc-title]");

    if (!boutonRetour) {
      boutonRetour = boxAcces.querySelector("[data-lcdp-card-acces-parc-close]");

      if (boutonRetour) {
        boutonRetour.removeAttribute("data-lcdp-card-acces-parc-close");
        boutonRetour.setAttribute("data-lcdp-card-acces-parc-retour", "");
        boutonRetour.setAttribute("aria-label", "Retour à la réservation");
        boutonRetour.textContent = "← Retour";
      }
    }

    if (boutonRetour) {
      boutonRetour.classList.add("lcdp-box-card-acces-parc__close--retour");
      boutonRetour.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fermerAccesParcDansReservation(workflow);
      });

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
    const racine = workflow || etat.slotPlanning?.querySelector("[data-lcdp-box-workflow-reservation]");
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

    const fragmentMap = await chargerFragmentObjet("/HTMLBASE/04-card-map-parc.html");
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
      await afficherAlerteInvitationReservation(formaterParrainInvitationRecue(reservation), declencheur, { profil: "information" });
      return;
    }

    // Inviter et Invité(s) ouvrent la même surface ; les droits restent
    // contrôlés à l'enregistrement côté service.
    await ouvrirListeInvitesReservation(idReservation, declencheur);
  }

  function trouverReservationPlanningParId(idflux) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) return null;

    return etat.reservations.find((item) => String(item.idflux || "") === idReservation) || null;
  }

  async function afficherParrainReservationInvitee(reservation) {
    const message = formaterParrainInvitationRecue(reservation);

    try {
      await afficherInformationPlanning(message, { superposition: true });
    } catch (error) {
      console.error("[LCDP invitation reçue] alerte objet impossible", error);
      afficherErreurCalendrier(message);
    }
  }

  function nettoyerTexteSimple(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function nettoyerEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function formaterParrainInvitationRecue(reservation) {
    const affichage = nettoyerTexteSimple(reservation?.parrainInvitation?.affichage || "");

    if (affichage) return "Invitation par : " + affichage;

    const parrain = reservation?.parrainInvitation || reservation?.parrain || {};
    const alias = nettoyerTexteSimple(
      parrain.alias ||
      parrain.aliasmembre ||
      reservation?.aliasparrain ||
      reservation?.aliasParrain ||
      ""
    );

    if (alias) return "Invitation par : " + alias;

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

    return "Invitation par : " + (identite || "Parrain non renseigné");
  }

  function reservationAvecInvitesActifsAgenda(
    reservation
  ) {
    if (
      !reservation ||
      reservationHorsAbonnementMembre(
        reservation
      )
    ) {
      return false;
    }

    const idflux = String(
      reservation.idflux || ""
    ).trim();

    if (
      idflux &&
      etat.reservationsAvecInvites.has(idflux)
    ) {
      return true;
    }

    const stats =
      reservation.invitationStats ||
      reservation.invitationsStats ||
      null;
    const actifs = Number(
      stats?.in ||
      stats?.actifs ||
      stats?.invites ||
      0
    );

    return (
      Number.isFinite(actifs) &&
      actifs > 0
    );
  }

  function typeReservationAgenda(reservation) {
    if (
      reservationHorsAbonnementMembre(
        reservation
      )
    ) {
      return "Invite";
    }

    if (
      reservationAvecInvitesActifsAgenda(
        reservation
      )
    ) {
      return "Invitation";
    }

    return "Réservation";
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

      if (reservationHorsAbonnementMembre(reservation) && !bouton.closest(".lcdp-planning-carte-visite")) {
        bouton.textContent = "Invit’";
        bouton.classList.add("lcdp-box-card-reservation-membre__micro-action--invit-recu");
        bouton.setAttribute("aria-disabled", "false");
        bouton.title = "Afficher le parrain";
        return;
      }

      if (bouton.closest(".lcdp-planning-carte-visite")) {
        habillerBoutonInvitesVerso(bouton, reservation);
      } else {
        bouton.textContent = reservationAvecInvitesPlanning(reservation) ? "Invité(s)" : "Inviter";
      }
      bouton.setAttribute("aria-disabled", "false");
      bouton.removeAttribute("title");
    });
  }

  async function ouvrirListeInvitesReservation(idflux, declencheur, options = {}) {
    const idReservation = String(idflux || "").trim();
    const reservation = trouverReservationPlanningParId(idReservation);
    const invites = await chargerInvitesReservation(idReservation, declencheur);

    if (!invites) return;

    if (options.lectureSeule === true || (reservation && reservationDelaiActionDepasse(reservation))) {
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
    const surface = ouvrirVueSecondairePlanning();
    if (!surface) return null;
    const conteneur = surface.conteneur;
    conteneur.classList.add("lcdp-box-card-listinvites-oui-non", "lcdp-box-card-listinvites-oui-non--lecture");
    conteneur.dataset.lcdpInvitationInvitesOverlay = "true";
    conteneur.setAttribute("role", "region");
    conteneur.setAttribute("aria-labelledby", "lcdp-listinvites-lecture-title");

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
      card.append(titre, message);
    } else {
      invitesActifs.forEach(invite => liste.appendChild(creerLigneInviteLectureSeule(invite)));
      card.append(titre, liste);
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
    return new Promise(resolve => {
      let resolu = false;
      function fermer() {
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        surface.fermer();
        resolve(true);
      }
      function gererEchap(event) {
        if (event.key === "Escape" && vueSecondaireAuPremierPlan(conteneur)) {
          event.preventDefault();
          fermer();
        }
      }
      boutonOk.addEventListener("click", fermer);
      document.addEventListener("keydown", gererEchap);
      boutonOk.focus({preventScroll:true});
    });
  }

  // Même niveau de surface que Fiche/Carte : le contenu MES ACCÈS
  // (onglets, filtres, listes) reste monté mais n'est plus visible.
  function ouvrirSurfaceInvitationPleinePage() {
    const main = document.querySelector("body.lcdp-mes-acces-page > .lcdp-app-wrapper > .lcdp-site-main");
    if (!main || !etat.slotPlanning?.isConnected || main.querySelector("[data-lcdp-invitation-vue-page]")) return null;

    const conteneur = document.createElement("div");
    conteneur.dataset.lcdpInvitationVuePage = "true";
    const contenuInitial = Array.from(main.childNodes);
    const focusInitial = document.activeElement;
    const scrollers = [main.closest(".lcdp-app-wrapper"), document.scrollingElement]
      .filter(Boolean).map(element => ({ element, position: element.scrollTop }));
    // On sort matériellement MES ACCÈS du DOM affiché, au lieu de seulement
    // masquer sa liste. Le composant intégral et tous ses écouteurs sont conservés.
    main.replaceChildren(conteneur);
    scrollers.forEach(({ element }) => { element.scrollTop = 0; });

    let fermee = false;
    return {
      conteneur,
      fermer() {
        if (fermee) return;
        fermee = true;
        if (conteneur.parentNode === main) main.replaceChildren(...contenuInitial);
        else conteneur.remove();
        scrollers.forEach(({ element, position }) => { element.scrollTop = position; });
        if (focusInitial?.isConnected && typeof focusInitial.focus === "function") {
          focusInitial.focus({ preventScroll: true });
        }
      }
    };
  }

  // Réutilisation des dialogues de référence, au-dessus de la vue pleine page.
  async function afficherInformationInvitation(texteMessage) {
    const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-information.html");
    const dialogue = fragment.querySelector('[data-lcdp-dialogue-reference="information"]');
    const titre = dialogue?.querySelector("[data-lcdp-dialogue-titre]");
    const texte = dialogue?.querySelector("[data-lcdp-dialogue-message]");
    const bouton = dialogue?.querySelector('[data-lcdp-dialogue-action="compris"]');
    if (!dialogue || !titre || !texte || !bouton) throw new Error("Dialogue INFORMATION incomplet.");
    titre.textContent = "Information";
    texte.textContent = String(texteMessage || "");
    bouton.textContent = "Fermer";
    document.body.appendChild(dialogue);
    return new Promise(resolve => {
      bouton.addEventListener("click", () => { dialogue.remove(); resolve(true); }, { once:true });
      bouton.focus({ preventScroll:true });
    });
  }

  async function confirmerSuppressionInvitation(identiteInvite) {
    const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-suppression.html");
    const dialogue = fragment.querySelector('[data-lcdp-dialogue-reference="suppression"]');
    const titre = dialogue?.querySelector("[data-lcdp-dialogue-titre]");
    const texte = dialogue?.querySelector("[data-lcdp-dialogue-message]");
    const conserver = dialogue?.querySelector('[data-lcdp-dialogue-action="conserver"]');
    const supprimer = dialogue?.querySelector('[data-lcdp-dialogue-action="supprimer"]');
    if (!dialogue || !titre || !texte || !conserver || !supprimer) {
      throw new Error("Dialogue SUPPRESSION incomplet.");
    }
    titre.textContent = "Supprimer cet invité ?";
    texte.textContent = "Supprimer " + String(identiteInvite || "cet invité") + " de cette réservation ?";
    conserver.textContent = "Non";
    supprimer.textContent = "Oui, supprimer";
    document.body.appendChild(dialogue);
    return new Promise(resolve => {
      let resolu = false;
      const fermer = valeur => {
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        dialogue.remove();
        resolve(valeur);
      };
      const gererEchap = event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); fermer(false); }
      };
      document.addEventListener("keydown", gererEchap, true);
      conserver.addEventListener("click", () => fermer(false), { once:true });
      supprimer.addEventListener("click", () => fermer(true), { once:true });
      conserver.focus({ preventScroll:true });
    });
  }

  async function ouvrirBoxListeInvitesModifiable(idflux, invites, declencheur) {
    const idReservation = String(idflux || "").trim();
    const surface = ouvrirSurfaceInvitationPleinePage();
    if (!surface) return null;
    const conteneur = surface.conteneur;
    try {
      conteneur.appendChild(await chargerFragmentObjet("/HTMLBASE/04-card-listinvites-oui-non.html?v=20261113-inviter-wrapper-v6"));
    } catch (erreur) {
      surface.fermer();
      throw erreur;
    }
    const box = conteneur.querySelector("[data-lcdp-box-card-listinvites-oui-non]");
    if (!box) {
      surface.fermer();
      throw new Error("Formulaire des invitations introuvable.");
    }
    const titre = conteneur.querySelector("[data-lcdp-listinvites-title]");
    const liste = conteneur.querySelector("[data-lcdp-listinvites-list]");
    const champ = conteneur.querySelector("[data-lcdp-invite-email]");
    const effacer = conteneur.querySelector("[data-lcdp-invite-effacer]");
    const ajouter = conteneur.querySelector("[data-lcdp-listinvites-add-email]");
    const inviter = conteneur.querySelector("[data-lcdp-listinvites-update]");
    const sansEmail = conteneur.querySelector("[data-lcdp-listinvites-sans-email]");
    const annuler = conteneur.querySelector("[data-lcdp-listinvites-cancel]");
    const message = conteneur.querySelector("[data-lcdp-listinvites-message]");
    const formulaire = conteneur.querySelector("[data-lcdp-invitation-form]");
    if (![titre,liste,champ,effacer,ajouter,inviter,sansEmail,annuler,message,formulaire].every(Boolean)) {
      surface.fermer();
      throw new Error("Structure du formulaire des invitations incomplète.");
    }
    titre.textContent = "Inviter";
    const anciens = (Array.isArray(invites) ? invites : []).filter(x =>
      normaliserStatutInvitationInvite(x?.invit) !== "cancd"
    );
    const annulations = new Map();
    let adresseSaisie = "";
    let enregistrementEnCours = false;
    let resolu = false;

    function identifiant(x) { return String(x?.idmembre || "").trim(); }
    function email(x) { return nettoyerEmail(x?.emailmembre || x?.email || ""); }
    function identite(x) {
      return email(x) || [x?.prenommembre || x?.prenom, x?.nommembre || x?.nom]
        .map(v => String(v || "").trim()).filter(Boolean).join(" ") || "Invité enregistré";
    }
    function restants() { return anciens.filter(x => !annulations.has(identifiant(x))); }
    function afficherMessage(texte, erreur = false) {
      message.hidden = !texte;
      message.textContent = texte || "";
      message.classList.toggle("lcdp-box-dialogue-champ-inviter__erreur", erreur);
    }
    const corbeille = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6"/></svg>';
    const croix = effacer.innerHTML;

    return new Promise(resolve => {
      function fermer(valeur) {
        if (resolu || enregistrementEnCours) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        surface.fermer();
        resolve(valeur);
      }
      function gererEchap(event) {
        if (event.key !== "Escape" || resolu || document.querySelector('[data-lcdp-dialogue-reference]')) return;
        event.preventDefault();
        afficherMessage("Utilisez « Annuler » pour fermer ce formulaire.");
      }
      async function demanderRetrait(personne) {
        const id = identifiant(personne);
        if (!id) {
          await afficherInformationInvitation("Cet invité ne peut pas être supprimé actuellement.");
          return;
        }
        const ok = await confirmerSuppressionInvitation(identite(personne));
        if (!ok || resolu) return;
        annulations.set(id,{idmembre:id,invit:"cancd"});
        afficherMessage("");
        afficherLignes();
      }
      function afficherLignes() {
        const actifs = restants();
        liste.replaceChildren();
        const principal = actifs[0] || null;
        if (principal) {
          champ.value = identite(principal);
          champ.readOnly = true;
          effacer.innerHTML = corbeille;
          effacer.title = "Supprimer cet invité";
          effacer.setAttribute("aria-label","Supprimer cet invité");
        } else {
          champ.readOnly = false;
          champ.value = adresseSaisie;
          effacer.innerHTML = croix;
          effacer.title = "Effacer";
          effacer.setAttribute("aria-label","Effacer l'adresse e-mail");
        }
        actifs.slice(1).forEach(personne => {
          const item = document.createElement("li");
          item.className = "lcdp-box-card-listinvites-oui-non__item";
          const texte = document.createElement("span");
          texte.className = "lcdp-box-card-listinvites-oui-non__identite";
          texte.textContent = identite(personne);
          const bouton = document.createElement("button");
          bouton.type = "button";
          bouton.className = "lcdp-button lcdp-button-secondary";
          bouton.textContent = "Supprimer";
          bouton.addEventListener("click", () => demanderRetrait(personne));
          item.append(texte, bouton);
          liste.appendChild(item);
        });
        liste.classList.toggle("lcdp-box-card-listinvites-oui-non__list", actifs.length > 1);
        liste.hidden = actifs.length <= 1;
      }
      champ.addEventListener("input", () => { if (!champ.readOnly) adresseSaisie = champ.value; });
      effacer.addEventListener("click", async () => {
        const premier = restants()[0];
        if (premier) return demanderRetrait(premier);
        adresseSaisie = "";
        champ.value = "";
        champ.focus();
      });
      ajouter.addEventListener("click", () =>
        afficherInformationInvitation("L’action n’est pas autorisée actuellement.")
      );
      sansEmail.addEventListener("click", () =>
        afficherInformationInvitation("Cette fonctionnalité n’est pas disponible actuellement.")
      );
      annuler.addEventListener("click", () => fermer(null));

      document.addEventListener("keydown", gererEchap);
      afficherLignes();

      formulaire.addEventListener("submit", async event => {
        event.preventDefault();
        if (enregistrementEnCours) return;
        const actifs = restants();
        const valeur = !actifs.length ? nettoyerEmail(champ.value) : "";
        if (valeur && !emailValide(valeur)) {
          afficherMessage("Saisissez une adresse e-mail valide.",true);
          return;
        }
        if (actifs.length > 1 || (actifs.length && valeur)) {
          afficherMessage("Une seule invitation est autorisée par accès.",true);
          return;
        }
        if (!annulations.size && !valeur) {
          afficherMessage(actifs.length ? "Aucune modification à enregistrer." : "Saisissez l’adresse e-mail de l’invité.");
          return;
        }

        enregistrementEnCours = true;
        [inviter,ajouter,sansEmail,annuler,effacer].forEach(x => x.disabled = true);
        inviter.textContent = "Enregistrement…";
        afficherMessage("Mise à jour des invitations en cours.");
        let resultat = null;
        try {
          resultat = await enregistrerListeInvitesReservation(idReservation, {
            invites:Array.from(annulations.values()),
            emails:valeur ? [valeur] : [],
            personnesSansEmail:[]
          }, declencheur);
        } catch (erreur) {
          afficherMessage(erreur?.message || "Enregistrement impossible. La saisie est conservée.",true);
        } finally {
          enregistrementEnCours = false;
          if (!resolu) {
            [inviter,ajouter,sansEmail,annuler,effacer].forEach(x => x.disabled = false);
            inviter.textContent = "Inviter et mettre à jour";
          }
        }
        if (!resultat || resolu) {
          if (!resolu && !message.textContent.includes("impossible")) {
            afficherMessage("Enregistrement non confirmé. Votre saisie est conservée.",true);
          }
          return;
        }
        const reservation = trouverReservationPlanningParId(idReservation);
        const nbActifs = Number(resultat.nbInvitesActifs);
        const nbAnnules = Number(resultat.nbInvitesAnnules);
        if (reservation && Number.isFinite(nbActifs) && Number.isFinite(nbAnnules)) {
          reservation.invitationStats = {
            ...(reservation.invitationStats || {}), in:nbActifs, out:nbAnnules
          };
        }
        if (Number.isFinite(nbActifs)) {
          if (nbActifs > 0) etat.reservationsAvecInvites.add(idReservation);
          else etat.reservationsAvecInvites.delete(idReservation);
        }
        actualiserBoutonsInvitationPlanning(idReservation, declencheur);
        fermer(resultat);
        await afficherInformationInvitation(resultat.message || "Liste des invités mise à jour.");
      });
      champ.focus();
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

  function normaliserStatutInvitationInvite(value) {
    const statut = normaliserTexteTechnique(value);
    return statut || "true";
  }

  async function enregistrerListeInvitesReservation(idflux, payload, declencheur) {
    const idReservation = String(idflux || "").trim();
    const donnees = payload || {};
    const invites = Array.isArray(donnees.invites) ? donnees.invites : [];
    const emails = Array.isArray(donnees.emails) ? donnees.emails : [];
    const personnesSansEmail = Array.isArray(donnees.personnesSansEmail) ? donnees.personnesSansEmail : [];

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
        emails,
        personnesSansEmail
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
    const nom = [invite?.prenommembre || invite?.prenom, invite?.nommembre || invite?.nom]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");

    const email = nettoyerEmail(invite?.emailmembre || invite?.email || "");

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

  // Annulation interdite dès 14h à Paris la veille du jour de visite.
  function annulationAccesImpossibleParis(reservation) {
    const dateVisite = extraireDateFranceReservation(reservation?.datebookd);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVisite)) return true;
    const maintenant = dateHeureParis(new Date());
    if (!maintenant.dateIso) return true;
    const [annee, mois, jour] = dateVisite.split("-").map(Number);
    const veille = new Date(Date.UTC(annee, mois - 1, jour - 1)).toISOString().slice(0,10);
    if (maintenant.dateIso > veille) return true;
    return maintenant.dateIso === veille && (maintenant.heure * 60 + maintenant.minute) >= 840;
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

  async function afficherInformationPlanning(message, options = {}) {
    const surface = ouvrirVueSecondairePlanning();
    if (!surface) return null;
    const conteneur = surface.conteneur;
    try {
      conteneur.appendChild(await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-information.html"));
      const dialogue = conteneur.querySelector('[data-lcdp-dialogue-reference="information"]');
      const titre = conteneur.querySelector("[data-lcdp-dialogue-titre]");
      const texte = conteneur.querySelector("[data-lcdp-dialogue-message]");
      const bouton = conteneur.querySelector('[data-lcdp-dialogue-action="compris"]');
      if (!dialogue || !titre || !texte || !bouton) {
        throw new Error("Structure INFORMATION incomplète.");
      }
      preparerDialogueDansWrapper(dialogue);
      titre.textContent = options.titre || "Information";
      texte.textContent = String(message || "");
      bouton.textContent = "Fermer";
      return await new Promise(resolve => {
        let resolu = false;
        function fermer() {
          if (resolu) return;
          resolu = true;
          document.removeEventListener("keydown", gererEchap);
          surface.fermer();
          resolve(true);
        }
        function gererEchap(event) {
          if (event.key === "Escape" && vueSecondaireAuPremierPlan(conteneur)) {
            event.preventDefault();
            fermer();
          }
        }
        bouton.addEventListener("click", fermer, {once:true});
        document.addEventListener("keydown", gererEchap);
        bouton.focus({preventScroll:true});
      });
    } catch (error) {
      surface.fermer();
      throw error;
    }
  }

  async function afficherAlerteInvitationReservation(message, declencheur, options = {}) {
    if (options.profil === "information") {
      return afficherInformationPlanning(message);
    }
    return afficherAlerteOk(message);
  }

  async function ouvrirBoxEmailsInvitationReservation(idflux, declencheur) {
    const idReservation = String(idflux || "").trim();

    if (!idReservation) {
      await afficherAlerteInvitationReservation("Réservation manquante.", declencheur);
      return null;
    }
    const surface = ouvrirVueSecondairePlanning();
    if (!surface) return null;
    const conteneur = surface.conteneur;
    conteneur.dataset.lcdpInvitationEmailsOverlay = "true";

    const fragment = await chargerFragmentObjet("/HTMLBASE/04-listemails.html");
    conteneur.appendChild(fragment);

    const box = conteneur.querySelector("[data-lcdp-box-card-listemails]");
    preparerDialogueDansWrapper(box);
    const titre = conteneur.querySelector("[data-lcdp-listemails-title]");
    const message = conteneur.querySelector("[data-lcdp-listemails-message]");
    const liste = conteneur.querySelector("[data-lcdp-listemails-list]");
    const actions = conteneur.querySelector("[data-lcdp-listemails-actions]");
    const boutonFermer = conteneur.querySelector("[data-lcdp-listemails-close]");

    if (!box || !titre || !message || !liste || !actions) {
      surface.fermer();
      throw new Error("Structure liste e-mails incomplète.");
    }

    titre.textContent = "Inviter";
    message.hidden = true;
    message.textContent = "";

    const limiteEmails = limiteEmailsInvitation();
    let traitementEnCours = false;
    let fermerBox = () => {};

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

    function collecterEmailsBox() {
      const emailsSaisis = Array.from(liste.querySelectorAll("input[type='email']"))
        .map((input) => nettoyerEmail(input.value))
        .filter(Boolean);

      const emails = emailsSaisis.filter((email, index, array) => array.indexOf(email) === index);
      const emailInvalide = emails.find((email) => !emailValide(email));

      if (!emails.length) {
        return { emails: [], erreur: "Renseignez au moins une adresse e-mail." };
      }

      if (emailInvalide) {
        return { emails: [], erreur: "Une adresse e-mail est invalide." };
      }

      if (emails.length > limiteEmails) {
        return {
          emails: [],
          erreur: "Votre droit d'invitation est limité à " + String(limiteEmails) + " e-mail" + (limiteEmails > 1 ? "s" : "") + "."
        };
      }

      return { emails, erreur: "" };
    }

    ajouterChamp();

    actions.innerHTML = "";

    const boutonAjouter = creerBoutonInvitationEmails("Ajouter un e-mail", "lcdp-button-secondary", () => ajouterChamp());
    const boutonInviter = creerBoutonInvitationEmails("Inviter", "lcdp-button-primary", async () => {
      if (traitementEnCours) return;

      const collecte = collecterEmailsBox();

      if (collecte.erreur) {
        afficherMessageEmails(collecte.erreur, true);
        return;
      }

      definirTraitementEnCours(true);
      boutonInviter.textContent = "Envoi en cours...";
      afficherMessageEmails("Patientez, l’invitation est en cours d’enregistrement...");

      try {
        console.info("[LCDP invitation] POST /inviter-reservation", {
          idflux: idReservation,
          nbEmails: collecte.emails.length
        });

        const resultat = await posterInvitationReservation(idReservation, collecte.emails);

        console.info("[LCDP invitation] invitation enregistrée", resultat);
        fermerBox(resultat);
      } catch (error) {
        console.error("[LCDP invitation] échec invitation", error);
        definirTraitementEnCours(false);
        boutonInviter.textContent = "Inviter";
        afficherMessageEmails(error.message || "Impossible d’envoyer l’invitation.", true);
      }
    });
    const boutonAnnuler = creerBoutonInvitationEmails("Annuler", "lcdp-button-secondary", () => fermerBox(null));

    actions.appendChild(boutonAjouter);
    actions.appendChild(boutonInviter);
    actions.appendChild(boutonAnnuler);

    return new Promise((resolve) => {
      let resolu = false;

      fermerBox = (valeur) => {
        if (traitementEnCours && !valeur) return;
        if (resolu) return;
        resolu = true;
        document.removeEventListener("keydown", gererEchap);
        surface.fermer();
        resolve(valeur || null);
      };

      function gererEchap(event) {
        if (event.key === "Escape" && vueSecondaireAuPremierPlan(conteneur)) {
          event.preventDefault();
          fermerBox(null);
        }
      }

      if (boutonFermer) {
        boutonFermer.addEventListener("click", () => fermerBox(null));
      }

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

    let reponse = null;

    try {
      reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/inviter-reservation", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
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
      console.error("[LCDP invitation] fetch impossible", error);
      throw new Error("Le service invitation membre est indisponible.");
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
      await afficherAlerteInvitationReservation(data.message || "Invitation envoyée.", declencheur, { profil: "information" });
      return data;
    } catch (error) {
      await afficherAlerteInvitationReservation(error.message || "Impossible d’envoyer l’invitation.", declencheur);
      return null;
    }
  }

  async function confirmerSuppressionPlanning(message, superposition, options = {}) {
    // Validation destructive impossible si la surface interne est indisponible.
    const surface = ouvrirVueSecondairePlanning();
    if (!surface) return false;
    const conteneur = surface.conteneur;
    try {
      conteneur.appendChild(await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-suppression.html"));
      const dialogue = conteneur.querySelector('[data-lcdp-dialogue-reference="suppression"]');
      const titre = conteneur.querySelector("[data-lcdp-dialogue-titre]");
      const texte = conteneur.querySelector("[data-lcdp-dialogue-message]");
      const conserver = conteneur.querySelector('[data-lcdp-dialogue-action="conserver"]');
      const supprimer = conteneur.querySelector('[data-lcdp-dialogue-action="supprimer"]');
      if (!dialogue || !titre || !texte || !conserver || !supprimer) {
        throw new Error("Dialogue SUPPRESSION incomplet.");
      }
      preparerDialogueDansWrapper(dialogue);
      const mentionInvites = String(message || "").trim();
      titre.textContent = options.titre || ("Annuler cet accès ?" + (mentionInvites ? " " + mentionInvites : ""));
      texte.textContent = options.message || "Ce créneau sera immédiatement libéré et ne pourra pas être récupéré.";
      conserver.textContent = options.conserver || "Conserver";
      supprimer.textContent = options.supprimer || "Oui, annuler";
      conserver.focus({preventScroll:true});
      return await new Promise(resolve => {
        let termine = false;
        const fermer = valeur => {
          if (termine) return;
          termine = true;
          document.removeEventListener("keydown", gererClavier);
          surface.fermer();
          resolve(valeur);
        };
        const gererClavier = event => {
          if (!vueSecondaireAuPremierPlan(conteneur)) return;
          if (event.key === "Escape") {
            event.preventDefault();
            fermer(false);
          }
          if (event.key === "Tab") {
            const cible = event.shiftKey ? conserver : supprimer;
            if (document.activeElement === cible) {
              event.preventDefault();
              (event.shiftKey ? supprimer : conserver).focus();
            }
          }
        };
        document.addEventListener("keydown", gererClavier);
        conserver.addEventListener("click", () => fermer(false), {once:true});
        supprimer.addEventListener("click", () => fermer(true), {once:true});
      });
    } catch (error) {
      console.error("Confirmation d’annulation indisponible :", error);
      surface.fermer();
      return false;
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

    if (annulationAccesImpossibleParis(reservation)) {
      await afficherInformationPlanning(
        "Annulation impossible après 14h",
        { titre: "Information", superposition: Boolean(workflowReservation) }
      );
      return;
    }

    const estInvite =
      reservationHorsAbonnementMembre(
        reservation
      );
    const nombreInvites = estInvite ? 0 : nombreInvitesEnvoyesPlanning(reservation);
    const mentionInvites = nombreInvites > 0
      ? "(" + nombreInvites + " invité" + (nombreInvites > 1 ? "s" : "") + ")"
      : "";
    const confirmation = await confirmerSuppressionPlanning(
      mentionInvites,
      Boolean(workflowReservation)
    );

    if (!confirmation) return;

    const texteInitial = boutonAnnuler.textContent;
    boutonAnnuler.disabled = true;
    boutonAnnuler.textContent = "Annulation...";

    try {
      await annulerReservation(idflux);
      await afficherInformationPlanning(
        estInvite
          ? "Votre invite est annulée."
          : "Votre réservation est annulée."
      );
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

  // Navigation uniquement entre les mois contenant des accès ou invitations
  // pour la période affichée ; aucun mois intercalaire sans rendez-vous.
  function moisAvecAccesPlanning() {
    return [...new Set(
      filtrerEtTrierReservationsAgenda(etat.reservations)
        .map(reservation => extraireDateFranceReservation(reservation.datebookd))
        .filter(Boolean)
        .map(dateIso => debutMois(dateIso))
    )].sort();
  }

  function moisMinimumPlanning() {
    return moisAvecAccesPlanning()[0] || debutMois(dateAujourdhuiParis());
  }

  function moisMaximumPlanning() {
    const mois = moisAvecAccesPlanning();
    return mois[mois.length - 1] || debutMois(dateAujourdhuiParis());
  }

  function moisDansLimitesPeriodePlanning(moisIso) {
    return moisAvecAccesPlanning().includes(debutMois(moisIso || dateAujourdhuiParis()));
  }

  function moisAdjacentAvecAccesPlanning(direction, moisIso = etat.moisCourant) {
    const mois = moisAvecAccesPlanning();
    const courant = debutMois(moisIso || dateAujourdhuiParis());
    if (direction < 0) return [...mois].reverse().find(value => value < courant) || null;
    return mois.find(value => value > courant) || null;
  }

  function limiterMoisSelonPeriodePlanning(moisIso) {
    const mois = moisAvecAccesPlanning();
    const cible = debutMois(moisIso || dateAujourdhuiParis());
    if (!mois.length) return debutMois(dateAujourdhuiParis());
    if (mois.includes(cible)) return cible;
    return mois.find(value => value > cible) || mois[mois.length - 1];
  }

  function actualiserNavigationMoisPlanning() {
    const calendrier = etat.calendrierMois;
    if (!calendrier) return;
    const precedent = calendrier.querySelector("[data-lcdp-calendrier-mois-prev]");
    const suivant = calendrier.querySelector("[data-lcdp-calendrier-mois-next]");
    if (precedent) {
      const actif = Boolean(moisAdjacentAvecAccesPlanning(-1));
      precedent.disabled = !actif;
      precedent.setAttribute("aria-disabled", String(!actif));
    }
    if (suivant) {
      const actif = Boolean(moisAdjacentAvecAccesPlanning(1));
      suivant.disabled = !actif;
      suivant.setAttribute("aria-disabled", String(!actif));
    }
  }

  function normaliserPlageReservation(reservation) {
    const brut = String(reservation?.plagebookd || reservation?.plage || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_-]+/g, "");

    if (
      brut.includes("plage1") ||
      brut === "1"
    ) {
      return "plage1";
    }

    if (
      brut.includes("plage2") ||
      brut === "2"
    ) {
      return "plage2";
    }

    if (
      brut.includes("plage3") ||
      brut === "3"
    ) {
      return "plage3";
    }

    if (
      brut.includes("plage4") ||
      brut === "4"
    ) {
      return "plage4";
    }

    if (
      brut.includes("plage5") ||
      brut === "5"
    ) {
      return "plage5";
    }

    const date = new Date(
      reservation?.datebookd || ""
    );

    if (!Number.isNaN(date.getTime())) {
      const heure = Number(
        new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Europe/Paris",
          hour: "2-digit",
          hour12: false,
          hourCycle: "h23"
        }).format(date)
      );

      if (heure >= 6 && heure < 10) {
        return "plage1";
      }

      if (heure >= 10 && heure < 13) {
        return "plage2";
      }

      if (heure >= 13 && heure < 17) {
        return "plage3";
      }

      if (heure >= 17 && heure < 21) {
        return "plage4";
      }

      return "plage5";
    }

    return "";
  }

  function libellePlage(plage) {
    if (plage === "plage1") {
      return "6 h–10 h";
    }

    if (plage === "plage2") {
      return "10 h–13 h";
    }

    if (plage === "plage3") {
      return "13 h–17 h";
    }

    if (plage === "plage4") {
      return "17 h–21 h";
    }

    if (plage === "plage5") {
      return "21 h–2 h";
    }

    return "plage horaire";
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

    const footer = await chargerFragmentObjet("/HTMLBASE/02-footer.html");
    slot.appendChild(footer);
    appliquerRoutesSite(slot);
  }

  async function afficherAlertePlanningDansWrapper(message) {
    const surface = ouvrirVueSecondairePlanning();
    if (!surface) return null;
    const conteneur = surface.conteneur;
    try {
      conteneur.appendChild(await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-erreur.html"));
      const dialogue = conteneur.querySelector('[data-lcdp-dialogue-reference="erreur"]');
      const titre = conteneur.querySelector("[data-lcdp-dialogue-titre]");
      const texte = conteneur.querySelector("[data-lcdp-dialogue-message]");
      const bouton = conteneur.querySelector('[data-lcdp-dialogue-action="fermer"]');
      if (!dialogue || !titre || !texte || !bouton) {
        throw new Error("Structure ERREUR dans wrapper incomplète.");
      }
      preparerDialogueDansWrapper(dialogue);
      titre.textContent = "Erreur";
      texte.textContent = message || "";
      bouton.textContent = "Fermer";
      return await new Promise(resolve => {
        let resolu = false;
        const fermer = valeur => {
          if (resolu) return;
          resolu = true;
          document.removeEventListener("keydown", gererEchap);
          surface.fermer();
          resolve(valeur);
        };
        const gererEchap = event => {
          if (event.key === "Escape" && vueSecondaireAuPremierPlan(conteneur)) {
            event.preventDefault();
            fermer(false);
          }
        };
        bouton.addEventListener("click", () => fermer(true), { once: true });
        dialogue.addEventListener("click", event => {
          if (event.target === dialogue && vueSecondaireAuPremierPlan(conteneur)) {
            fermer(false);
          }
        });
        document.addEventListener("keydown", gererEchap);
        bouton.focus({preventScroll:true});
      });
    } catch (error) {
      surface.fermer();
      throw error;
    }
  }

  async function afficherAlerte(message) {
    return afficherAlertePlanningDansWrapper(message);
  }

  async function afficherAlerteOk(message) {
    return afficherAlertePlanningDansWrapper(message);
  }

  async function afficherAlerteOkParDessusLightbox(message) {
    return afficherAlertePlanningDansWrapper(message);
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

    return "/IMAG/PARC/" + dptmt + "/" + nom + "/" + nomFichier;
  }

  function normaliserSegmentCheminImageParc(value) {
    // Même normalisation que la galerie Parc de PLANIFIER.
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
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

    const cheminParc = chemin
      .replace(/^\/?OBJET\/IMAG\/PARC\//i, "/IMAG/PARC/")
      .replace(/^\/?IMAG\/PARC\//i, "/IMAG/PARC/");

    if (cheminParc.startsWith("/IMAG/PARC/")) {
      return construireUrlObjet(cheminParc);
    }

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

  // Date en français : aujourd'hui/demain, puis jour seul sur la semaine
  // civile courante (lundi à dimanche), sinon jour + date sans année.
  function formaterDateCourte(dateIso) {
    const dateFranceIso = extraireDateFranceReservation(dateIso);
    if (!dateFranceIso) return "Date non renseignée";

    const aujourdHui = dateAujourdhuiParis();
    if (dateFranceIso === aujourdHui) return "Aujourd’hui";
    if (dateFranceIso === ajouterJoursDateIso(aujourdHui, 1)) return "Demain";

    const dateLocale = new Date(dateFranceIso + "T12:00:00Z");
    const jourSemaine = dateLocale.toLocaleDateString("fr-FR", {
      timeZone: "UTC", weekday: "long"
    });
    const jourAujourdhui = new Date(aujourdHui + "T12:00:00Z").getUTCDay();
    const debutSemaine = ajouterJoursDateIso(aujourdHui, -((jourAujourdhui + 6) % 7));
    const finSemaine = ajouterJoursDateIso(debutSemaine, 6);

    if (dateFranceIso >= debutSemaine && dateFranceIso <= finSemaine) {
      return majusculePremiereLettre(jourSemaine);
    }
    const jourMois = dateLocale.toLocaleDateString("fr-FR", {
      timeZone: "UTC", day: "numeric", month: "long"
    });
    return majusculePremiereLettre(jourSemaine + " " + jourMois);
  }

  // Une plage réservée est une période et non une heure ponctuelle.
  // Le Worker actuel n'expose pas les horaires réduits : ne pas les inventer.
  function formaterPlageAccesReservation(reservation) {
    const plage = normaliserPlageReservation(reservation);
    return plage ? libellePlage(plage).replace(/\s*h\s*/g, "h").replace(/\s*–\s*/g, "–") : "";
  }

  // Horaires réduits depuis le planning canonique du parc, sans nouvel endpoint.
  // Une lecture par parc et par mois ; si le service ne confirme pas la plage,
  // la carte conserve sa plage nominale sans fabriquer de réduction.
  function actualiserHoraireEffectifReservation(reservation, appliquer) {
    if (!ENDPOINT_PLANNING_PARC) return;
    const idparc = String(reservation?.idparc || reservation?.parc?.idparc || "").trim();
    const dateIso = extraireDateFranceReservation(reservation?.datebookd);
    const plage = normaliserPlageReservation(reservation);
    if (!idparc || !dateIso || !plage) return;
    const moisIso = dateIso.slice(0, 7);
    const cleCache = idparc + "|" + moisIso;
    if (!cacheHorairesParcMois.has(cleCache)) {
      const [annee, mois] = moisIso.split("-");
      const url = ENDPOINT_PLANNING_PARC +
        "/planning-parc-mois?idparc=" + encodeURIComponent(idparc) +
        "&annee=" + encodeURIComponent(annee) +
        "&mois=" + encodeURIComponent(Number(mois)) +
        "&contexte=membre";
      const promesse = fetch(url, {
        method: "GET", credentials: "include", cache: "no-store",
        headers: { "Accept": "application/json" }
      }).then(async reponse => {
        if (!reponse.ok) return null;
        const data = await reponse.json().catch(() => null);
        return data?.ok === true && Array.isArray(data.planning) ? data.planning : null;
      }).catch(() => null);
      cacheHorairesParcMois.set(cleCache, promesse);
    }
    cacheHorairesParcMois.get(cleCache).then(planning => {
      const jour = planning?.find(entree => entree.date === dateIso);
      const detail = jour?.plages?.[plage];
      if (!detail?.ouverte) return;
      const debut = formaterHeurePlageEffectif(detail.debut);
      const fin = formaterHeurePlageEffectif(detail.fin);
      if (debut && fin) appliquer(debut + "–" + fin);
    });
  }

  function formaterHeurePlageEffectif(heure) {
    const match = String(heure || "").match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if (!match) return "";
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (hh > 24 || mm > 59 || (hh === 24 && mm !== 0)) return "";
    return String(hh) + "h" + (mm === 0 ? "" : String(mm).padStart(2, "0"));
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
