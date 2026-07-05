(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "inviter-membre";

  const ENDPOINT_INVITATION_MEMBRE = construireEndpointApi(
    "workerInvitationMembreUrl",
    "WORKER_INVITATION_MEMBRE_URL",
    "invitation-membre-api"
  );

  const ENDPOINT_INVITER_MEMBRE = construireEndpointApi(
    "workerInviterMembreUrl",
    "WORKER_INVITER_MEMBRE_URL",
    "inviter-membre-api"
  );

  const ENDPOINT_INDEX_MEMBRE = construireEndpointApi(
    "workerIndexMembreUrl",
    "WORKER_INDEX_MEMBRE_URL",
    "index-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_PAIEMENT_CB = construireUrlMembre("/ESPACE-MEMBRE/paiement-cb.html");

  let pageInitialisee = false;
  let etatMembre = { abonne: false, abonnementSuspendu: false, paiementSuspension: null };

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
      etatMembre = await chargerEtatMembre();
      afficherEtatMembre(etatMembre);
      await actualiserBurgerMembre(etatMembre.abonne);

      if (!etatMembre.abonne && !membreAbonne()) {
        await afficherAlerte("Cette fonction est réservée aux membres abonnés.");
        return;
      }

      if (etatMembre.abonnementSuspendu === true) {
        await afficherAlerte("Votre abonnement est suspendu (non payé).");
        return;
      }

      await initialiserListeReservations("Mes invitations");
      document.addEventListener("click", gererClicDocument);
      await chargerReservations();
    } catch (error) {
      console.error("Erreur inviter membre :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
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
      return { abonne: false, abonnementSuspendu: false, paiementSuspension: null };
    }

    if (!reponse.ok || !resultat || !reponseApiOk(resultat)) {
      throw new Error(messageErreurApi(resultat, "Impossible de vérifier l’état membre."));
    }

    return {
      abonne: valeurBooleenneVraie(resultat.abonne),
      abonnementSuspendu: valeurBooleenneVraie(resultat.abonnementSuspendu || resultat.suspendu),
      paiementSuspension: resultat.paiementSuspension || resultat.paiementRegularisation || null
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

    mention.textContent = etat && etat.abonne ? "[Vous êtes membre abonné]" : "[Vous êtes membre invité]";
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
      bloc.className = "lcdp-mention-connexion";
      bloc.style.display = "flex";
      bloc.style.flexWrap = "wrap";
      bloc.style.alignItems = "center";
      bloc.style.justifyContent = "center";
      bloc.style.gap = "0.5rem";
      mention.insertAdjacentElement("afterend", bloc);
    }

    bloc.innerHTML = "";

    const texte = document.createElement("span");
    texte.textContent = "[Votre abonnement est suspendu (non payé)]";
    bloc.appendChild(texte);

    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-secondary lcdp-workflow-micro-action";
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
      ligne.style.display = "flex";
      ligne.style.flexWrap = "wrap";
      ligne.style.alignItems = "center";
      ligne.style.justifyContent = "space-between";
      ligne.style.gap = "0.75rem";
      ligne.style.width = "100%";

      const description = document.createElement("p");
      description.className = "lcdp-dialogue-echeances-impayees__text";
      description.style.margin = "0";
      description.style.whiteSpace = "pre-line";
      description.textContent = "Échéance " + String(echeance.numero) + " du " + formaterDatePaiementSuspension(echeance.date) + " : " + formaterMontantPaiementSuspension(echeance.montant) + " TTC\nNon payée";

      const boutonPayer = creerBoutonPaiementSuspension("Payer", "lcdp-button-secondary lcdp-workflow-micro-action", () => {
        ouvrirPagePaiementSuspension(paiement, echeance.numero).catch(console.error);
      });

      ligne.appendChild(description);
      ligne.appendChild(boutonPayer);
      actions.appendChild(ligne);
    });

    actions.appendChild(creerBoutonPaiementSuspension("OK", "lcdp-button-primary", fermer));

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

    const ok = await afficherAlerte("Vous allez être dirigé vers la page de paiement. La régularisation de votre abonnement se fait par carte bancaire uniquement.");
    if (!ok) return;

    const separateur = PAGE_PAIEMENT_CB.includes("?") ? "&" : "?";
    window.location.href = PAGE_PAIEMENT_CB + separateur + "orderid=" + encodeURIComponent(orderid) + "&echeance=" + encodeURIComponent(String(numeroEcheance || 1)) + "&source=suspension";
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

  async function chargerReservations() {
    if (!ENDPOINT_INVITATION_MEMBRE) {
      afficherErreurListe("Le service invitation membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementListe("Chargement de vos réservations...");

      const reponse = await fetch(ENDPOINT_INVITATION_MEMBRE + "/reservations-invitables", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(messageErreurApi(data, "Impossible de charger vos invitations."));
      }

      etat.reservations = Array.isArray(data.reservations) ? data.reservations : [];
      afficherReservations(etat.reservations);
    } catch (error) {
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function gererClicDocument(event) {
    const boutonAdresse = event.target.closest("[data-action='adresse']");
    const boutonInvitation = event.target.closest("[data-action='invitation']");
    const boutonOut = event.target.closest("[data-action='invitations-out']");
    const boutonAnnuler = event.target.closest("[data-action='annuler']");

    if (boutonAdresse) {
      await afficherAlerte("L’adresse sera raccordée ensuite.");
      return;
    }

    if (boutonInvitation) {
      await ouvrirDialogueInvitation(String(boutonInvitation.dataset.id || ""));
      return;
    }

    if (boutonOut) {
      await afficherListeEmailsAnnules(String(boutonOut.dataset.id || ""));
      return;
    }

    if (boutonAnnuler) {
      await afficherAlerte("L’annulation se fait depuis votre planning.");
    }
  }

  async function afficherListeEmailsAnnules(idflux) {
    if (!idflux) return;

    const reponse = await fetch(
      ENDPOINT_INVITATION_MEMBRE + "/annulations?idflux=" + encodeURIComponent(idflux),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      }
    );

    const data = await reponse.json().catch(() => null);

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      await afficherAlerte(messageErreurApi(data, "Impossible de charger les annulations."));
      return;
    }

    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-card-listemails.html");
    slot.appendChild(fragment);

    const box = slot.querySelector("[data-lcdp-box-card-listemails]");
    const liste = slot.querySelector("[data-lcdp-listemails-list]");
    const message = slot.querySelector("[data-lcdp-listemails-message]");

    const annulations = Array.isArray(data.annulations) ? data.annulations : [];

    if (!annulations.length) {
      if (message) {
        message.hidden = false;
        message.textContent = "Aucune annulation.";
      }
    } else if (liste) {
      annulations.forEach((item) => {
        const li = document.createElement("li");
        li.className = "lcdp-box-card-listemails__item";
        li.textContent = item.emailmembre || "E-mail non renseigné";
        liste.appendChild(li);
      });
    }

    if (box) {
      box.addEventListener("click", () => {
        slot.innerHTML = "";
      });
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
    if (!slot) return;

    slot.innerHTML = "";
    const bandeau = await chargerFragmentObjet("/BOX/02-box-bandeau-nav.html");
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
    if (typeof window.LCDP_membreAbonne === "function") {
      return window.LCDP_membreAbonne() === true;
    }

    return Boolean(lireCookie("abonne"));
  }

  function lireMaxinvit() {
    const valeur = Number.parseInt(lireCookie("maxinvit") || "0", 10);
    return Number.isFinite(valeur) && valeur > 0 ? valeur : 0;
  }

  function redirigerConnexionMembre(motif) {
    const separateur = PAGE_CONNEXION_MEMBRE.includes("?") ? "&" : "?";

    window.location.href =
      PAGE_CONNEXION_MEMBRE +
      separateur +
      "source=" + encodeURIComponent(SOURCE_PAGE) +
      "&session=" +
      encodeURIComponent(motif || "inactive");
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

    texte.textContent = message;

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

  function reponseApiOk(data) {
    return data && (data.ok === true || data.success === true);
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
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

    const titre = document.querySelector("[data-lcdp-liste-card-title]");
    if (titre) titre.textContent = titreListe || "Mes invitations";
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

    reservationsFiltrees.forEach((reservation) => {
      zoneListe.appendChild(creerCardReservation(reservation));
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

  function creerCardReservation(reservation) {
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
    const boutonIn = card.querySelector("[data-lcdp-card-reservation-in-count-button]");
    const boutonOut = card.querySelector("[data-lcdp-card-reservation-out-count-button]");
    const countIn = card.querySelector("[data-lcdp-card-reservation-in-count]");
    const countOut = card.querySelector("[data-lcdp-card-reservation-out-count]");

    card.dataset.idflux = idFlux;

    if (estPasse) {
      card.classList.add("lcdp-box-card-reservation-membre--passe");
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
      boutonInvitation.hidden = estPasse;
    }

    if (boutonAnnuler) {
      boutonAnnuler.dataset.id = idFlux;
      boutonAnnuler.hidden = estPasse;
    }

    const stats = reservation.invitationStats || null;

    if (stats && boutonIn && boutonOut && countIn && countOut) {
      const totalIn = Number(stats.in || 0);
      const totalOut = Number(stats.out || 0);

      countIn.textContent = String(totalIn);
      countOut.textContent = String(totalOut);

      boutonIn.hidden = false;
      boutonOut.hidden = false;
      boutonIn.dataset.id = idFlux;
      boutonOut.dataset.id = idFlux;
      boutonOut.disabled = totalOut <= 0;
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

  async function ouvrirDialogueInvitation(idflux) {
    if (etatMembre.abonnementSuspendu === true) {
      await gererPaiementSuspensionMembre(etatMembre);
      return;
    }

    if (!etatMembre.abonne && !membreAbonne()) {
      await afficherAlerte("Cette fonction est réservée aux membres abonnés.");
      return;
    }

    const maxinvit = lireMaxinvit();

    if (maxinvit <= 0) {
      await afficherAlerte("Votre droit d'invitation n'est pas configuré.");
      return;
    }

    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-dialogue-champ-inviter.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-champ-inviter]");
    const boutonFermer = slot.querySelector("[data-lcdp-inviter-close]");
    const formulaire = slot.querySelector("[data-lcdp-inviter-form]");
    const zoneFields = slot.querySelector("[data-lcdp-inviter-fields]");
    const boutonAjouter = slot.querySelector("[data-lcdp-inviter-add]");
    const erreur = slot.querySelector("[data-lcdp-inviter-error]");

    if (!dialogue || !boutonFermer || !formulaire || !zoneFields || !boutonAjouter || !erreur) {
      throw new Error("Structure invitation incomplète.");
    }

    function fermer() {
      slot.innerHTML = "";
    }

    function afficherErreur(message) {
      erreur.hidden = !message;
      erreur.textContent = message || "";
    }

    async function ajouterChamp() {
      const nombre = zoneFields.querySelectorAll("input[type='email']").length;

      if (nombre >= maxinvit) {
        await afficherAlerte("Votre maxinvit est atteint.");
        return;
      }

      const index = nombre + 1;
      const label = document.createElement("label");
      label.className = "lcdp-box-dialogue-champ-inviter__field";
      label.innerHTML = `
        <span>Email invité ${index}</span>
        <input
          class="lcdp-box-dialogue-champ-inviter__input"
          type="email"
          name="emailinvite"
          autocomplete="email"
          placeholder="invite@email.fr"
          required
        >
      `;

      zoneFields.appendChild(label);
      const input = label.querySelector("input");
      if (input) input.focus();
    }

    boutonFermer.addEventListener("click", fermer);
    dialogue.addEventListener("click", (event) => {
      if (event.target === dialogue) fermer();
    });

    boutonAjouter.addEventListener("click", () => {
      ajouterChamp().catch(console.error);
    });

    formulaire.addEventListener("submit", async (event) => {
      event.preventDefault();

      afficherErreur("");

      const emails = Array.from(zoneFields.querySelectorAll("input[type='email']"))
        .map((input) => String(input.value || "").trim().toLowerCase())
        .filter(Boolean);

      if (!emails.length) {
        afficherErreur("Merci de saisir au moins une adresse e-mail.");
        return;
      }

      try {
        await envoyerInvitations(idflux, emails);
        fermer();
        await afficherAlerte("Invitation envoyée.");
        await chargerReservations();
      } catch (error) {
        await afficherAlerte(error.message || "Impossible d'envoyer l'invitation.");
      }
    });

    await ajouterChamp();
  }

  async function envoyerInvitations(idflux, emails) {
    if (!ENDPOINT_INVITER_MEMBRE) {
      throw new Error("Le service inviter membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_INVITER_MEMBRE + "/inviter-reservation", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ idflux, emails })
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible d'envoyer l'invitation."));
    }

    return data;
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