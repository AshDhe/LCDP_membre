(() => {
  "use strict";

  const CONFIG_RESERVER_MEMBRE = window.SITE_CONFIG || {};

  const DOSSIER_IMAGES_PARC_OBJET = "/IMAG/IMAGE%20PARC";

  const ENDPOINT_NOUVELLE_DATE_MEMBRE = construireEndpointApi(
    "workerNouvelleDateMembreUrl",
    "WORKER_NOUVELLE_DATE_MEMBRE_URL",
    "nouvelle-date-membre-api"
  );

  const ENDPOINT_FLUXM = construireEndpointApi(
    "workerFluxmUrl",
    "WORKER_FLUXM_URL",
    "worker-fluxm-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_PLANNING_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/planning-membre.html");

  let reserverMembreInitialise = false;

  const etat = {
    parcsCharges: [],
    parcActif: null,
    departementAffiche: null,
    modeAutourDeMoi: true,
    templateCardParc: null,
    templateJourMois: null,
    templateHeureJour: null,
    moisAffiche: null,
    anneeAffichee: null,
    planningMois: [],
    planningParDate: new Map()
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserReserverMembre);
  } else {
    initialiserReserverMembre();
  }

  async function initialiserReserverMembre() {
    if (reserverMembreInitialise) {
      return;
    }

    reserverMembreInitialise = true;

    try {
      await initialiserBandeau();
      await initialiserFooter();
      await initialiserListeParcs();
      await initialiserTemplatesCalendriers();

      const boutonDemanderIA = document.getElementById("bouton-demander-ia");
      const boutonChangerDepartement = document.getElementById("bouton-changer-departement");

      if (boutonDemanderIA) {
        boutonDemanderIA.addEventListener("click", () => {
          afficherAlerte("La recherche avec l’IA sera raccordée ensuite.").catch(console.error);
        });
      }

      if (boutonChangerDepartement) {
        boutonChangerDepartement.addEventListener("click", () => {
          ouvrirChangementDepartement().catch((erreur) => {
            console.error("Erreur changement département :", erreur);
            afficherAlerte(erreur.message || "Impossible d’ouvrir le changement de département.").catch(console.error);
          });
        });
      }

      await chargerParcsAutourDeMoi();
    } catch (erreur) {
      console.error("Erreur initialisation réserver membre :", erreur);
      afficherMessageListe(erreur.message || "Erreur technique. Merci de réessayer.", "erreur");
    }
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
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

  function construireUrlPublic(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) {
      return valeur;
    }

    if (typeof window.LCDP_urlPublic === "function") {
      return window.LCDP_urlPublic(valeur);
    }

    if (typeof CONFIG_RESERVER_MEMBRE.publicUrl === "function") {
      return CONFIG_RESERVER_MEMBRE.publicUrl(valeur);
    }

    return buildUrl(CONFIG_RESERVER_MEMBRE.publicBaseUrl || CONFIG_RESERVER_MEMBRE.PUBLIC_BASE || "", valeur);
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) {
      return valeur;
    }

    if (typeof window.LCDP_urlMembre === "function") {
      return window.LCDP_urlMembre(valeur);
    }

    if (typeof CONFIG_RESERVER_MEMBRE.membreUrl === "function") {
      return CONFIG_RESERVER_MEMBRE.membreUrl(valeur);
    }

    return buildUrl(
      CONFIG_RESERVER_MEMBRE.membreBaseUrl ||
      CONFIG_RESERVER_MEMBRE.MEMBRE_BASE ||
      CONFIG_RESERVER_MEMBRE.siteBase ||
      "",
      valeur
    );
  }

  function construireUrlObjet(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) {
      return valeur;
    }

    if (typeof window.LCDP_urlObjet === "function") {
      return window.LCDP_urlObjet(valeur);
    }

    if (typeof CONFIG_RESERVER_MEMBRE.objetUrl === "function") {
      return CONFIG_RESERVER_MEMBRE.objetUrl(valeur);
    }

    const objetBase =
      CONFIG_RESERVER_MEMBRE.objetBaseUrl ||
      CONFIG_RESERVER_MEMBRE.OBJET_BASE ||
      buildUrl(CONFIG_RESERVER_MEMBRE.publicBaseUrl || CONFIG_RESERVER_MEMBRE.PUBLIC_BASE || "", "/OBJET");

    return buildUrl(objetBase, valeur);
  }

  function construireEndpointApi(cleModerne, cleLegacy, sousDomaineWorker) {
    const depuisConfig =
      CONFIG_RESERVER_MEMBRE?.[cleModerne] ||
      CONFIG_RESERVER_MEMBRE?.[cleLegacy] ||
      "";

    if (depuisConfig) {
      return String(depuisConfig).replace(/\/+$/, "");
    }

    if (typeof CONFIG_RESERVER_MEMBRE.apiUrl === "function") {
      return CONFIG_RESERVER_MEMBRE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    }

    return "";
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

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) {
      return;
    }

    slot.innerHTML = "";

    const bandeau = await chargerFragmentObjet("/BOX/02-box-bandeau-nav.html");
    slot.appendChild(bandeau);

    appliquerRoutesSite(slot);

    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js");

    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre();
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");

    if (!slot) {
      return;
    }

    slot.innerHTML = "";

    const footer = await chargerFragmentObjet("/BOX/02-box-footer.html");
    slot.appendChild(footer);

    appliquerRoutesSite(slot);
  }

  async function initialiserListeParcs() {
    const slotListeCard = document.getElementById("lcdp-liste-card-parcs-slot");

    if (!slotListeCard) {
      throw new Error("Slot liste des parcs introuvable.");
    }

    const fragmentListe = await chargerFragmentObjet("/BOX/04-box-liste-card.html");
    slotListeCard.innerHTML = "";
    slotListeCard.appendChild(fragmentListe);

    const fragmentCard = await chargerFragmentObjet("/BOX/04-box-card-parc.html");
    etat.templateCardParc = fragmentCard.querySelector("[data-lcdp-box-card-parc]");

    if (!etat.templateCardParc) {
      throw new Error("Template card parc introuvable.");
    }
  }

  async function ouvrirChangementDepartement() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Changer de département",
      texteAnnuler: "Annuler",
      texteValider: "Valider",
      texteErreur: "Merci d’indiquer un numéro de département.",
      champs: [
        {
          type: "text",
          name: "dptmt",
          id: "dptmt-reserver-membre",
          label: "Département",
          placeholder: "Ex : 42",
          autocomplete: "off",
          required: true,
          inputmode: "numeric"
        }
      ]
    });

    if (!resultat) {
      return;
    }

    const nouveauDepartement = normaliserDepartement(resultat.dptmt || "");

    if (!nouveauDepartement) {
      await afficherAlerte("Le département est obligatoire.");
      return;
    }

    etat.departementAffiche = nouveauDepartement;
    etat.modeAutourDeMoi = false;

    await chargerParcsDepartement(nouveauDepartement);
  }

  async function initialiserTemplatesCalendriers() {
    const fragmentJourMois = await chargerFragmentObjet("/BOX/04-box-card-jour-in-calendrier-mois.html");
    etat.templateJourMois = fragmentJourMois.querySelector("[data-lcdp-card-jour-mois]");

    const fragmentHeureJour = await chargerFragmentObjet("/BOX/04-box-card-heure-in-calendrier-jour.html");
    etat.templateHeureJour = fragmentHeureJour.querySelector("[data-lcdp-card-heure-jour]");

    if (!etat.templateJourMois || !etat.templateHeureJour) {
      throw new Error("Templates calendrier incomplets.");
    }
  }

  function obtenirZoneListe() {
    return document.querySelector("[data-lcdp-liste-card-list]");
  }

  function obtenirZoneMessageListe() {
    return document.querySelector("[data-lcdp-liste-card-message]");
  }

  function obtenirTitreListe() {
    return document.querySelector("[data-lcdp-liste-card-title]");
  }

  function obtenirZoneActionsListe() {
    return document.querySelector("[data-lcdp-liste-card-actions]");
  }

  function normaliserDepartement(valeur) {
    const departement = String(valeur || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (/^[1-9]$/.test(departement)) {
      return "0" + departement;
    }

    return departement;
  }

  async function chargerParcsAutourDeMoi() {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      afficherErreurListe("Le service de réservation membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementListe("Chargement des parcs...");

      const reponse = await fetch(ENDPOINT_NOUVELLE_DATE_MEMBRE + "/autour-de-moi", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      if (gererSessionExpiree(reponse, "inactive")) {
        return;
      }

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(messageErreurApi(data, "Impossible de charger les parcs autour de vous."));
      }

      etat.departementAffiche = data.departement || null;
      etat.modeAutourDeMoi = true;
      etat.parcsCharges = Array.isArray(data.parcs) ? data.parcs : [];

      afficherTitreListe();
      afficherParcs(etat.parcsCharges);
    } catch (erreur) {
      console.error("Erreur chargement parcs autour du membre :", erreur);
      afficherErreurListe(erreur.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function chargerParcsDepartement(departement) {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      afficherErreurListe("Le service de réservation membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementListe("Chargement des parcs...");

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

      if (gererSessionExpiree(reponse, "inactive")) {
        return;
      }

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(messageErreurApi(data, "Impossible de charger les parcs de ce département."));
      }

      etat.departementAffiche = data.departement || departement;
      etat.modeAutourDeMoi = false;
      etat.parcsCharges = Array.isArray(data.parcs) ? data.parcs : [];

      afficherTitreListe();
      afficherParcs(etat.parcsCharges);
    } catch (erreur) {
      console.error("Erreur chargement parcs département membre :", erreur);
      afficherErreurListe(erreur.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function gererSessionExpiree(reponse, motif) {
    if (reponse.status === 401) {
      redirigerConnexionMembre(motif || "inactive");
      return true;
    }

    return false;
  }

  function afficherTitreListe() {
    const titre = obtenirTitreListe();

    if (!titre) {
      return;
    }

    titre.textContent = etat.modeAutourDeMoi
      ? "Autour de moi"
      : "Parcs dans le " + (etat.departementAffiche || "");
  }

  function afficherChargementListe(message) {
    const zoneListe = obtenirZoneListe();

    if (zoneListe) {
      zoneListe.innerHTML = "";
    }

    afficherMessageListe(message || "Chargement...", "information");
  }

  function afficherErreurListe(message) {
    const zoneListe = obtenirZoneListe();

    if (zoneListe) {
      zoneListe.innerHTML = "";
    }

    afficherMessageListe(message, "erreur");
  }

  function afficherMessageListe(message, type) {
    const zoneMessage = obtenirZoneMessageListe();

    if (!zoneMessage) {
      return;
    }

    zoneMessage.hidden = false;
    zoneMessage.textContent = message;
    zoneMessage.dataset.lcdpMessageType = type || "information";
  }

  function masquerMessageListe() {
    const zoneMessage = obtenirZoneMessageListe();

    if (!zoneMessage) {
      return;
    }

    zoneMessage.hidden = true;
    zoneMessage.textContent = "";
    delete zoneMessage.dataset.lcdpMessageType;
  }

  function afficherParcs(parcs) {
    const zoneListe = obtenirZoneListe();

    if (!zoneListe) {
      return;
    }

    zoneListe.innerHTML = "";

    if (!Array.isArray(parcs) || parcs.length === 0) {
      afficherMessageListe("Il n'y a pas de parc accessible par ici.", "information");
      return;
    }

    masquerMessageListe();

    parcs.forEach((parc) => {
      zoneListe.appendChild(creerCarteParc(parc));
    });
  }

  function creerCarteParc(parc) {
    const card = etat.templateCardParc.cloneNode(true);

    const idParc = String(parc.idparc || parc.id || "");
    const nomParc = String(parc.nom || parc.nomparc || "Parc");
    const departement = String(parc.dptmt || parc.departement || "");
    const imageUrl = construireUrlImageParc(parc.imageparc);

    const image = card.querySelector("[data-lcdp-card-parc-image]");
    const titre = card.querySelector("[data-lcdp-card-parc-title]");
    const meta = card.querySelector("[data-lcdp-card-parc-meta]");
    const boutonFiche = card.querySelector("[data-action='ouvrir-fiche-parc']");
    const boutonNouvelleDate = card.querySelector("[data-action='nouvelle-date-parc']");

    card.dataset.idParc = idParc;

    if (image) {
      image.src = imageUrl;
      image.alt = "Image du parc " + nomParc;
    }

    if (titre) {
      titre.textContent = nomParc;
    }

    if (meta) {
      meta.textContent = departement ? "Département " + departement : "";
      meta.hidden = !departement;
    }

    if (boutonFiche) {
      boutonFiche.dataset.id = idParc;
      boutonFiche.addEventListener("click", () => {
        ouvrirFicheParc(parc).catch(console.error);
      });
    }

    if (boutonNouvelleDate) {
      boutonNouvelleDate.dataset.id = idParc;
      boutonNouvelleDate.addEventListener("click", () => {
        ouvrirChoixDateParc(parc).catch(console.error);
      });
    }

    return card;
  }

  function construireUrlImageParc(imageparc) {
    const fichier = String(imageparc || "").trim() || "parc-defaut.jpg";
    return construireUrlObjet(DOSSIER_IMAGES_PARC_OBJET + "/" + encodeURIComponent(fichier));
  }

  async function ouvrirFicheParc(parc) {
    const fragment = await chargerFragmentObjet("/BOX/04-box-fiche-parc.html");
    afficherFragmentLightbox(fragment);

    const fiche = document.querySelector("[data-lcdp-box-fiche-parc]");

    if (!fiche) {
      throw new Error("Fiche parc introuvable.");
    }

    const nomParc = String(parc.nom || parc.nomparc || "Parc");
    const departement = String(parc.dptmt || parc.departement || "");
    const imageUrl = construireUrlImageParc(parc.imageparc);

    const image = fiche.querySelector("[data-lcdp-fiche-parc-image]");
    const titre = fiche.querySelector("[data-lcdp-fiche-parc-title]");
    const meta = fiche.querySelector("[data-lcdp-fiche-parc-meta]");
    const boutonFermer = fiche.querySelector("[data-lcdp-fiche-parc-close]");

    if (image) {
      image.src = imageUrl;
      image.alt = "Image du parc " + nomParc;
    }

    if (titre) {
      titre.textContent = "Parc de " + nomParc;
    }

    if (meta) {
      meta.textContent = departement ? "Département " + departement : "";
      meta.hidden = !departement;
    }

    if (boutonFermer) {
      boutonFermer.addEventListener("click", fermerLightbox);
    }

    fiche.addEventListener("click", (event) => {
      if (event.target === fiche) {
        fermerLightbox();
      }
    });
  }

  async function ouvrirChoixDateParc(parc) {
    etat.parcActif = parc;

    const confirmation = await ouvrirDialogueBoutons({
      titre: "Nouvelle date",
      texte: "Choisissez une date pour " + String(parc.nom || parc.nomparc || "ce parc") + ".",
      boutons: [
        { label: "Aujourd'hui", valeur: "aujourdhui", style: "lcdp-button-primary" },
        { label: "Demain", valeur: "demain", style: "lcdp-button-primary" },
        { label: "Autre date", valeur: "autre-date", style: "lcdp-button-secondary" }
      ]
    });

    if (!confirmation) {
      return;
    }

    if (confirmation === "aujourdhui" || confirmation === "demain") {
      const dateIso = obtenirDateChoixRapide(confirmation);
      await ouvrirCalendrierJour(parc, dateIso);
      return;
    }

    if (confirmation === "autre-date") {
      await ouvrirCalendrierMois(parc);
    }
  }

  async function ouvrirCalendrierMois(parc) {
    etat.parcActif = parc;

    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);

    etat.moisAffiche = aujourdHui.getMonth();
    etat.anneeAffichee = aujourdHui.getFullYear();

    const fragment = await chargerFragmentObjet("/BOX/04-box-calendrier-mois.html");
    afficherFragmentLightbox(fragment);

    const calendrier = document.querySelector("[data-lcdp-box-calendrier-mois]");

    if (!calendrier) {
      throw new Error("Calendrier mensuel introuvable.");
    }

    const boutonFermer = calendrier.querySelector("[data-lcdp-calendrier-mois-close]");
    const boutonPrecedent = calendrier.querySelector("[data-lcdp-calendrier-mois-prev]");
    const boutonSuivant = calendrier.querySelector("[data-lcdp-calendrier-mois-next]");

    if (boutonFermer) {
      boutonFermer.addEventListener("click", fermerLightbox);
    }

    if (boutonPrecedent) {
      boutonPrecedent.addEventListener("click", async () => {
        changerMois(-1);
        await afficherMoisPlanningParc();
      });
    }

    if (boutonSuivant) {
      boutonSuivant.addEventListener("click", async () => {
        changerMois(1);
        await afficherMoisPlanningParc();
      });
    }

    calendrier.addEventListener("click", async (event) => {
      if (event.target === calendrier) {
        fermerLightbox();
        return;
      }

      const boutonJour = event.target.closest("[data-lcdp-calendrier-date]");

      if (!boutonJour || boutonJour.disabled) {
        return;
      }

      const dateIso = boutonJour.dataset.lcdpCalendrierDate;
      await traiterChoixDate(parc, dateIso);
    });

    await afficherMoisPlanningParc();
  }

  function changerMois(delta) {
    etat.moisAffiche += delta;

    if (etat.moisAffiche < 0) {
      etat.moisAffiche = 11;
      etat.anneeAffichee -= 1;
    }

    if (etat.moisAffiche > 11) {
      etat.moisAffiche = 0;
      etat.anneeAffichee += 1;
    }
  }

  async function afficherMoisPlanningParc() {
    const calendrier = document.querySelector("[data-lcdp-box-calendrier-mois]");
    const titre = calendrier?.querySelector("[data-lcdp-calendrier-mois-title]");
    const meta = calendrier?.querySelector("[data-lcdp-calendrier-mois-meta]");
    const moisCourant = calendrier?.querySelector("[data-lcdp-calendrier-mois-current]");
    const grille = calendrier?.querySelector("[data-lcdp-calendrier-mois-grid]");
    const message = calendrier?.querySelector("[data-lcdp-calendrier-mois-message]");

    if (!calendrier || !moisCourant || !grille || !etat.parcActif) {
      return;
    }

    const parc = etat.parcActif;
    const nomParc = String(parc.nom || parc.nomparc || "Parc");
    const departement = String(parc.dptmt || parc.departement || "");

    if (titre) {
      titre.textContent = "Planning du parc de " + nomParc;
    }

    if (meta) {
      meta.textContent = departement ? "Département " + departement : "";
      meta.hidden = !departement;
    }

    const dateMois = new Date(etat.anneeAffichee, etat.moisAffiche, 1);

    moisCourant.textContent = dateMois.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric"
    });

    grille.innerHTML = "";

    if (message) {
      message.hidden = false;
      message.textContent = "Chargement du planning...";
    }

    try {
      etat.planningMois = await chargerPlanningParcMois({
        idparc: parc.idparc || parc.id,
        annee: etat.anneeAffichee,
        mois: etat.moisAffiche + 1
      });

      etat.planningParDate = new Map();

      etat.planningMois.forEach((jour) => {
        etat.planningParDate.set(jour.date, jour);
      });

      if (message) {
        message.hidden = true;
        message.textContent = "";
      }

      dessinerGrilleMois(grille);
    } catch (erreur) {
      if (message) {
        message.hidden = false;
        message.textContent = erreur.message || "Impossible de charger le planning du parc.";
      }
    }
  }

  async function chargerPlanningParcMois(params) {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      throw new Error("Le service de réservation membre n’est pas configuré.");
    }

    const url =
      ENDPOINT_NOUVELLE_DATE_MEMBRE +
      "/planning-parc-mois?idparc=" + encodeURIComponent(params.idparc) +
      "&annee=" + encodeURIComponent(params.annee) +
      "&mois=" + encodeURIComponent(params.mois);

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

  function dessinerGrilleMois(grille) {
    grille.innerHTML = "";

    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);

    const premierJourMois = new Date(etat.anneeAffichee, etat.moisAffiche, 1);
    const dernierJourMois = new Date(etat.anneeAffichee, etat.moisAffiche + 1, 0);

    const nombreJours = dernierJourMois.getDate();
    const decalageDebut = (premierJourMois.getDay() + 6) % 7;

    for (let index = 0; index < decalageDebut; index += 1) {
      const vide = creerCardJourMoisVide();
      grille.appendChild(vide);
    }

    for (let jour = 1; jour <= nombreJours; jour += 1) {
      const dateJour = new Date(etat.anneeAffichee, etat.moisAffiche, jour);
      dateJour.setHours(0, 0, 0, 0);

      const dateIso = formaterDateIsoLocale(dateJour);
      const donneesJour = etat.planningParDate.get(dateIso) || creerJourFerme(dateIso, jour);

      const estPasse = dateJour < aujourdHui;
      const estAujourdhui = dateJour.getTime() === aujourdHui.getTime();
      const estOuvert = donneesJour.ouvert === true;
      const estCliquable = !estPasse && estOuvert;

      const card = etat.templateJourMois.cloneNode(true);
      const numero = card.querySelector("[data-lcdp-card-jour-mois-number]");

      card.dataset.lcdpCalendrierDate = dateIso;
      card.disabled = !estCliquable;

      if (numero) {
        numero.textContent = String(jour);
      }

      if (estPasse) {
        card.classList.add("lcdp-box-card-jour-in-calendrier-mois--past");
      } else if (!estOuvert) {
        card.classList.add("lcdp-box-card-jour-in-calendrier-mois--closed");
      } else {
        card.classList.add("lcdp-box-card-jour-in-calendrier-mois--active");
      }

      if (estAujourdhui) {
        card.classList.add("lcdp-box-card-jour-in-calendrier-mois--today");
      }

      appliquerCouleurSlotMois(card, "plage1", donneesJour.plages?.plage1, estPasse);
      appliquerCouleurSlotMois(card, "plage2", donneesJour.plages?.plage2, estPasse);
      appliquerCouleurSlotMois(card, "plage3", donneesJour.plages?.plage3, estPasse);

      grille.appendChild(card);
    }
  }

  function creerCardJourMoisVide() {
    const card = etat.templateJourMois.cloneNode(true);

    card.disabled = true;
    card.removeAttribute("data-lcdp-calendrier-date");
    card.classList.add("lcdp-box-card-jour-in-calendrier-mois--empty");

    return card;
  }

  function appliquerCouleurSlotMois(card, plageNom, plage, estPasse) {
    const slot = card.querySelector(`[data-lcdp-card-jour-mois-slot="${plageNom}"]`);

    if (!slot) {
      return;
    }

    slot.classList.add("lcdp-box-card-jour-in-calendrier-mois__slot--" + classeCouleurMois(plage, estPasse));
  }

  function creerJourFerme(dateIso, jour) {
    return {
      date: dateIso,
      jour: jour,
      ouvert: false,
      plages: {
        plage1: { ouverte: false, couleur: "gris_clair" },
        plage2: { ouverte: false, couleur: "gris_clair" },
        plage3: { ouverte: false, couleur: "gris_clair" }
      }
    };
  }

  async function traiterChoixDate(parc, dateIso) {
    const confirmation = await ouvrirDialogueBoutons({
      titre: "Confirmer la date",
      texte: "Vous avez choisi le " + formaterDateFr(dateIso) + ".",
      boutons: [
        { label: "Annuler", valeur: "annuler", style: "lcdp-button-secondary" },
        { label: "Continuer", valeur: "continuer", style: "lcdp-button-primary" }
      ]
    });

    if (confirmation !== "continuer") {
      return;
    }

    await ouvrirCalendrierJour(parc, dateIso);
  }

  async function ouvrirCalendrierJour(parc, dateIso) {
    etat.parcActif = parc;

    const fragment = await chargerFragmentObjet("/BOX/04-box-calendrier-jour.html");
    afficherFragmentLightbox(fragment);

    const calendrier = document.querySelector("[data-lcdp-box-calendrier-jour]");

    if (!calendrier) {
      throw new Error("Calendrier journalier introuvable.");
    }

    const boutonFermer = calendrier.querySelector("[data-lcdp-calendrier-jour-close]");
    const grille = calendrier.querySelector("[data-lcdp-calendrier-jour-grid]");
    const message = calendrier.querySelector("[data-lcdp-calendrier-jour-message]");
    const titre = calendrier.querySelector("[data-lcdp-calendrier-jour-title]");
    const meta = calendrier.querySelector("[data-lcdp-calendrier-jour-meta]");

    const nomParc = String(parc.nom || parc.nomparc || "Parc");
    const departement = String(parc.dptmt || parc.departement || "");

    if (titre) {
      titre.textContent = "Votre heure d'arrivée le " + formaterDateFr(dateIso);
    }

    if (meta) {
      const details = [];

      if (nomParc) {
        details.push("Parc de " + nomParc);
      }

      if (departement) {
        details.push("Département " + departement);
      }

      meta.textContent = details.join(" · ");
    }

    if (boutonFermer) {
      boutonFermer.addEventListener("click", fermerLightbox);
    }

    calendrier.addEventListener("click", async (event) => {
      if (event.target === calendrier) {
        fermerLightbox();
        return;
      }

      const boutonHeure = event.target.closest("[data-action='choisir-heure-arrivee']");

      if (!boutonHeure || boutonHeure.disabled) {
        return;
      }

      await traiterChoixHeure(
        boutonHeure,
        dateIso,
        boutonHeure.dataset.heure,
        boutonHeure.dataset.plagebookd
      );
    });

    if (grille) {
      grille.innerHTML = "";
    }

    if (message) {
      message.hidden = false;
      message.textContent = "Chargement des horaires disponibles...";
    }

    try {
      const jourPlanning = await chargerPlanningJour(parc, dateIso);
      const plagesJour = construirePlagesJour(jourPlanning);

      if (message) {
        message.hidden = true;
        message.textContent = "";
      }

      afficherHorairesJour(grille, message, plagesJour);
    } catch (erreur) {
      if (message) {
        message.hidden = false;
        message.textContent = erreur.message || "Impossible de charger les horaires du parc.";
      }
    }
  }

  async function chargerPlanningJour(parc, dateIso) {
    if (!parc || !dateIso) {
      throw new Error("Parc ou date manquant.");
    }

    const [annee, mois] = dateIso.split("-").map(Number);

    const planning = await chargerPlanningParcMois({
      idparc: parc.idparc || parc.id,
      annee: annee,
      mois: mois
    });

    const jour = planning.find((item) => item.date === dateIso);

    if (!jour) {
      throw new Error("Aucun horaire disponible pour cette date.");
    }

    return jour;
  }

  function construirePlagesJour(jourPlanning) {
    if (!jourPlanning || !jourPlanning.plages) {
      return [];
    }

    const plages = [];

    ajouterPlageSiOuverte(plages, "plage1", jourPlanning.plages.plage1, {
      debut: "06:00",
      fin: "13:00"
    });

    ajouterPlageSiOuverte(plages, "plage2", jourPlanning.plages.plage2, {
      debut: "13:00",
      fin: "19:00"
    });

    ajouterPlageSiOuverte(plages, "plage3", jourPlanning.plages.plage3, {
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
      couleur: normaliserCouleur(plage.couleur)
    });
  }

  function afficherHorairesJour(grille, message, plagesJour) {
    if (!grille) {
      return;
    }

    const heuresDisponibles = genererHeuresDisponibles();

    grille.innerHTML = "";

    heuresDisponibles.forEach((heure) => {
      const plage = trouverPlagePourHeure(heure, plagesJour);

      if (!plage) {
        return;
      }

      const card = etat.templateHeureJour.cloneNode(true);
      const label = card.querySelector("[data-lcdp-card-heure-jour-label]");

      card.classList.add("lcdp-box-card-heure-in-calendrier-jour--" + classeCouleurHeure(plage.couleur));
      card.dataset.heure = heure;
      card.dataset.plagebookd = plage.nom;

      if (label) {
        label.textContent = formaterHeureAffichee(heure);
      } else {
        card.textContent = formaterHeureAffichee(heure);
      }

      grille.appendChild(card);
    });

    if (!grille.children.length && message) {
      message.hidden = false;
      message.textContent = "Aucun horaire d'arrivée n'est disponible pour cette date.";
    }
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

  function trouverPlagePourHeure(heure, plagesJour) {
    const totalMinutes = convertirHeureEnMinutes(heure);

    return plagesJour.find((plage) => {
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

  async function traiterChoixHeure(boutonHeure, dateIso, heure, plagebookd) {
    if (!heure || !plagebookd) {
      await afficherAlerte("Heure ou plage de réservation manquante.");
      return;
    }

    const confirmation = await ouvrirDialogueBoutons({
      titre: "Confirmer l'heure d'arrivée",
      texte:
        "Vous avez choisi le " +
        formaterDateFr(dateIso) +
        " à " +
        formaterHeureAffichee(heure) +
        ".",
      boutons: [
        { label: "Annuler", valeur: "annuler", style: "lcdp-button-secondary" },
        { label: "Confirmer", valeur: "confirmer", style: "lcdp-button-primary" }
      ]
    });

    if (confirmation !== "confirmer") {
      return;
    }

    const texteInitial = boutonHeure ? boutonHeure.textContent : "";

    if (boutonHeure) {
      boutonHeure.disabled = true;
      boutonHeure.textContent = "Enregistrement...";
    }

    try {
      await enregistrerReservation(dateIso, heure, plagebookd);
      await afficherAlerte("Votre nouvelle date a bien été enregistrée.");
      window.location.href = PAGE_PLANNING_MEMBRE;
    } catch (erreur) {
      if (boutonHeure) {
        boutonHeure.disabled = false;
        boutonHeure.textContent = texteInitial;
      }

      await afficherAlerte(erreur.message || "Impossible d'enregistrer la réservation.");
    }
  }

  async function enregistrerReservation(dateIso, heure, plagebookd) {
    if (!ENDPOINT_FLUXM) {
      throw new Error("Le service de réservation membre n’est pas configuré.");
    }

    const parc = etat.parcActif;

    if (!parc) {
      throw new Error("Parc manquant.");
    }

    const datebookd = construireDateBookd(dateIso, heure);

    const reponse = await fetch(ENDPOINT_FLUXM + "/creer-reservation", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        idparc: parc.idparc || parc.id,
        datebookd: datebookd,
        plagebookd: plagebookd
      })
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

  function obtenirDateChoixRapide(choix) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    if (choix === "demain") {
      date.setDate(date.getDate() + 1);
    }

    return formaterDateIsoLocale(date);
  }

  function formaterDateIsoLocale(date) {
    const annee = date.getFullYear();
    const mois = String(date.getMonth() + 1).padStart(2, "0");
    const jour = String(date.getDate()).padStart(2, "0");

    return annee + "-" + mois + "-" + jour;
  }

  function formaterDateFr(dateIso) {
    if (!dateIso) {
      return "";
    }

    const date = new Date(dateIso + "T12:00:00");

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

  function normaliserCouleur(couleur) {
    if (couleur === "vert") {
      return "vert";
    }

    if (couleur === "orange") {
      return "orange";
    }

    if (couleur === "gris_fonce" || couleur === "fonce") {
      return "gris_fonce";
    }

    return "gris_clair";
  }

  function classeCouleurMois(plage, estPasse) {
    if (estPasse) {
      return "gris-clair";
    }

    if (!plage || plage.ouverte !== true) {
      return "gris-clair";
    }

    const couleur = normaliserCouleur(plage.couleur);

    if (couleur === "vert") {
      return "vert";
    }

    if (couleur === "orange") {
      return "orange";
    }

    if (couleur === "gris_fonce") {
      return "gris-fonce";
    }

    return "gris-clair";
  }

  function classeCouleurHeure(couleur) {
    const couleurNormalisee = normaliserCouleur(couleur);

    if (couleurNormalisee === "vert") {
      return "vert";
    }

    if (couleurNormalisee === "orange") {
      return "orange";
    }

    if (couleurNormalisee === "gris_fonce") {
      return "gris-fonce";
    }

    return "gris-clair";
  }

  async function ouvrirDialogueChamp(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      return null;
    }

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-dialogue-champ.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-champ]");
    const titre = slot.querySelector("[data-lcdp-dialogue-champ-title]");
    const form = slot.querySelector("[data-lcdp-dialogue-champ-form]");
    const contenu = slot.querySelector("[data-lcdp-dialogue-champ-content]");
    const erreur = slot.querySelector("[data-lcdp-dialogue-champ-error]");
    const boutonAnnuler = slot.querySelector("[data-lcdp-dialogue-champ-cancel]");
    const boutonValider = slot.querySelector("[data-lcdp-dialogue-champ-submit]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-champ-close]");

    if (!dialogue || !titre || !form || !contenu || !erreur || !boutonAnnuler || !boutonValider || !boutonFermer) {
      throw new Error("Structure de dialogue champ incomplète.");
    }

    titre.textContent = options.titre || "";
    contenu.innerHTML = "";
    erreur.textContent = "";
    erreur.hidden = true;
    boutonAnnuler.textContent = options.texteAnnuler || "Annuler";
    boutonValider.textContent = options.texteValider || "Valider";

    (Array.isArray(options.champs) ? options.champs : []).forEach((champ) => {
      ajouterChampDialogueChamp(champ, contenu);
    });

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) {
          return;
        }

        resolu = true;
        slot.innerHTML = "";
        resolve(valeur || null);
      }

      boutonAnnuler.addEventListener("click", () => fermer(null));
      boutonFermer.addEventListener("click", () => fermer(null));

      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) {
          fermer(null);
        }
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        erreur.hidden = true;
        erreur.textContent = "";

        if (!form.checkValidity()) {
          erreur.textContent = options.texteErreur || "Merci de vérifier le champ saisi.";
          erreur.hidden = false;
          return;
        }

        const formData = new FormData(form);
        const valeurs = {};

        for (const [key, value] of formData.entries()) {
          valeurs[key] = String(value || "").trim();
        }

        fermer(valeurs);
      });

      const premierChamp = contenu.querySelector("input, textarea, select");

      if (premierChamp) {
        premierChamp.focus();
      }
    });
  }

  function ajouterChampDialogueChamp(champ, contenu) {
    const wrapper = document.createElement("div");
    wrapper.className = "lcdp-box-dialogue-champ__field";

    const type = champ.type || "text";
    const idChamp = champ.id || champ.name || "champ-dialogue";
    const nameChamp = champ.name || idChamp;

    const label = document.createElement("label");
    label.className = "lcdp-box-dialogue-champ__label";
    label.setAttribute("for", idChamp);
    label.textContent = champ.label || "";

    let champFormulaire;

    if (type === "textarea") {
      champFormulaire = document.createElement("textarea");
    } else if (type === "select") {
      champFormulaire = document.createElement("select");

      (Array.isArray(champ.options) ? champ.options : []).forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.value || "";
        optionElement.textContent = option.label || "";
        champFormulaire.appendChild(optionElement);
      });
    } else {
      champFormulaire = document.createElement("input");
      champFormulaire.type = type;
    }

    champFormulaire.className = "lcdp-box-dialogue-champ__input";
    champFormulaire.id = idChamp;
    champFormulaire.name = nameChamp;
    champFormulaire.value = champ.value || "";

    if (champ.placeholder) champFormulaire.placeholder = champ.placeholder;
    if (champ.autocomplete) champFormulaire.autocomplete = champ.autocomplete;
    if (champ.required) champFormulaire.required = true;
    if (champ.inputmode) champFormulaire.inputMode = champ.inputmode;

    wrapper.appendChild(label);
    wrapper.appendChild(champFormulaire);
    contenu.appendChild(wrapper);
  }

  async function ouvrirDialogueBoutons(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      return null;
    }

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
        if (resolu) {
          return;
        }

        resolu = true;
        slot.innerHTML = "";
        resolve(valeur || null);
      }

      (options.boutons || []).forEach((item) => {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-button " + (item.style || "lcdp-button-primary");
        bouton.textContent = item.label;
        bouton.addEventListener("click", () => fermer(item.valeur));
        actions.appendChild(bouton);
      });

      boutonFermer.addEventListener("click", () => fermer(null));

      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) {
          fermer(null);
        }
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") {
            fermer(null);
          }
        },
        { once: true }
      );
    });
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      return;
    }

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

    texte.textContent = message;

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) {
          return;
        }

        resolu = true;
        slot.innerHTML = "";
        resolve();
      }

      boutonFermer.addEventListener("click", fermer);
      boutonOk.addEventListener("click", fermer);

      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) {
          fermer();
        }
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") {
            fermer();
          }
        },
        { once: true }
      );
    });
  }

  function afficherFragmentLightbox(fragment) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      throw new Error("Slot lightbox introuvable.");
    }

    slot.innerHTML = "";
    slot.appendChild(fragment);
  }

  function fermerLightbox() {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (slot) {
      slot.innerHTML = "";
    }
  }

  function redirigerConnexionMembre(motif) {
    const separateur = PAGE_CONNEXION_MEMBRE.includes("?") ? "&" : "?";

    window.location.href =
      PAGE_CONNEXION_MEMBRE +
      separateur +
      "source=reserver-membre&session=" +
      encodeURIComponent(motif || "inactive");
  }

  function reponseApiOk(data) {
    return data && (data.ok === true || data.success === true);
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
  }
})();
