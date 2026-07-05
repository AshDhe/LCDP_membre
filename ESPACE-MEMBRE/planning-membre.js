(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "planning-membre";

  const ENDPOINT_PLANNING_MEMBRE = construireEndpointApi(
    "workerPlanningMembreUrl",
    "WORKER_PLANNING_MEMBRE_URL",
    "planning-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_RESERVER_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/reserver-membre.html");
  const PAGE_INVITER_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/inviter-membre.html");

  let pageInitialisee = false;

  const etat = {
    reservations: [],
    filtre: "avenir",
    templateReservation: null
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
      await initialiserListeReservations("Mes réservations");
      initialiserBoutonNouvelleDate();
      initialiserActionsListePlanning();
      document.addEventListener("click", gererClicDocument);
      await chargerReservations();
    } catch (error) {
      console.error("Erreur planning membre :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function initialiserBoutonNouvelleDate() {
    const bouton = document.getElementById("bouton-nouvelle-date-planning");

    if (!bouton) return;

    bouton.href = PAGE_RESERVER_MEMBRE;

    bouton.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = PAGE_RESERVER_MEMBRE;
    });
  }

  function initialiserActionsListePlanning() {
    const zoneActions = document.querySelector("[data-lcdp-liste-card-actions]");

    if (!zoneActions) return;

    zoneActions.innerHTML = "";

    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-secondary";
    bouton.textContent = "Passé";

    bouton.addEventListener("click", () => {
      etat.filtre = etat.filtre === "avenir" ? "passe" : "avenir";
      bouton.textContent = etat.filtre === "avenir" ? "Passé" : "À venir";
      afficherReservations(etat.reservations);
    });

    zoneActions.appendChild(bouton);
  }

  async function chargerReservations() {
    if (!ENDPOINT_PLANNING_MEMBRE) {
      afficherErreurListe("Le service planning membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementListe("Chargement de votre planning...");

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
      afficherReservations(etat.reservations);
    } catch (error) {
      console.error("Erreur chargement planning membre :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
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

    if (!membreAbonne()) {
      await afficherAlerte("Cette fonction est réservée aux membres abonnés.");
      return;
    }

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

  async function initialiserListeReservations(titreListe) {
    const slot = document.getElementById("lcdp-liste-card-reservations-slot");

    if (!slot) {
      throw new Error("Slot liste des réservations introuvable.");
    }

    const fragmentListe = await chargerFragmentObjet("/BOX/04-box-liste-card.html");
    slot.innerHTML = "";
    slot.appendChild(fragmentListe);

    const fragmentCard = await chargerFragmentObjet("/BOX/04-box-card-reservation-membre.html");
    etat.templateReservation = fragmentCard.querySelector("[data-lcdp-box-card-reservation-membre]");

    if (!etat.templateReservation) {
      throw new Error("Template card réservation membre introuvable.");
    }

    const titre = slot.querySelector("[data-lcdp-liste-card-title]");
    if (titre) titre.textContent = titreListe || "Mes réservations";
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
    zoneMessage.textContent = message;
    zoneMessage.dataset.lcdpMessageType = type || "information";
  }

  function masquerMessageListe() {
    const zoneMessage = obtenirZoneMessageListe();

    if (!zoneMessage) return;

    zoneMessage.hidden = true;
    zoneMessage.textContent = "";
    delete zoneMessage.dataset.lcdpMessageType;
  }

  function afficherReservations(reservations) {
    const zoneListe = obtenirZoneListe();

    if (!zoneListe) return;

    const reservationsFiltrees = filtrerEtTrierReservations(reservations);

    zoneListe.innerHTML = "";

    if (!reservationsFiltrees.length) {
      afficherMessageListe(
        etat.filtre === "avenir" ? "Aucune date à venir." : "Aucune date passée.",
        "information"
      );
      return;
    }

    masquerMessageListe();

    reservationsFiltrees.forEach((reservation, index) => {
      zoneListe.appendChild(creerCardReservation(reservation, {
        premiereReservationAvenir: etat.filtre === "avenir" && index === 0
      }));
    });
  }

  function filtrerEtTrierReservations(source) {
    const maintenant = new Date();

    return (Array.isArray(source) ? source : [])
      .filter((reservation) => {
        const dateReservation = new Date(reservation.datebookd);

        if (Number.isNaN(dateReservation.getTime())) return false;

        if (etat.filtre === "avenir") return dateReservation >= maintenant;

        return dateReservation < maintenant;
      })
      .sort((a, b) => {
        const dateA = new Date(a.datebookd);
        const dateB = new Date(b.datebookd);

        return etat.filtre === "avenir"
          ? dateA - dateB
          : dateB - dateA;
      });
  }

  function creerCardReservation(reservation, options = {}) {
    const card = etat.templateReservation.cloneNode(true);

    const dateReservation = new Date(reservation.datebookd);
    const estPasse = dateReservation < new Date();

    const parc = reservation.parc || {};
    const nomParc = parc.nom || parc.nomparc || reservation.nomparc || "Parc";
    const departement = parc.dptmt || parc.departement || reservation.dptmt || "";
    const idParc = parc.idparc || reservation.idparc || "";
    const idFlux = reservation.idflux || "";

    const invitation = card.querySelector("[data-lcdp-card-reservation-invitation]");
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

    if (options.premiereReservationAvenir === true && !estPasse) {
      card.classList.add("lcdp-box-card-reservation-membre--prochaine");
    }

    if (reservation.invitation === true) {
      card.classList.add("lcdp-box-card-reservation-membre--invitation");
    }

    if (invitation) {
      const ligneInvitation = creerLigneInvitation(reservation);
      invitation.textContent = ligneInvitation;
      invitation.hidden = !ligneInvitation;
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
      boutonInvitation.hidden = estPasse || reservation.invitation === true;
    }

    if (boutonAnnuler) {
      boutonAnnuler.dataset.id = idFlux;
      boutonAnnuler.hidden = estPasse;
    }

    return card;
  }

  function creerLigneInvitation(reservation) {
    if (reservation.invitation !== true) return "";

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

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }

  function formaterDateCourte(dateIso) {
    const date = new Date(dateIso);

    if (Number.isNaN(date.getTime())) return "Date non renseignée";

    const dateFormatee = date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "long",
      day: "numeric",
      month: "long"
    });

    return majusculePremiereLettre(dateFormatee);
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
