(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "abonnement-membre";

  const ENDPOINT_ABONNEMENT_MEMBRE = construireEndpointApi(
    "workerAbonnementMembreUrl",
    "WORKER_ABONNEMENT_MEMBRE_URL",
    "abonnement-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");

  let pageInitialisee = false;

  const etat = {
    abonnements: [],
    filtre: "encours",
    templateAbonnement: null
  };

  const titresFiltres = {
    encours: "Abonnement en cours",
    avenir: "Abonnements à venir",
    passe: "Abonnements passés"
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
      afficherEtatMembre();
      await initialiserBandeau();
      await initialiserFooter();
      await initialiserListeAbonnements();
      initialiserBoutonChoisirAbonnement();
      initialiserActionsListeAbonnement();
      document.addEventListener("click", gererClicDocument);
      await chargerAbonnements();
    } catch (error) {
      console.error("Erreur abonnement membre :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function afficherEtatMembre(abonneDepuisApi) {
    const mention = document.getElementById("mention-statut-membre");

    if (!mention) return;

    const abonne = typeof abonneDepuisApi === "boolean" ? abonneDepuisApi : membreAbonne();

    mention.textContent = abonne
      ? "[Vous êtes membre abonné]"
      : "[Vous êtes membre invité]";
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

  async function initialiserListeAbonnements() {
    const slot = document.getElementById("lcdp-liste-card-abonnements-slot");

    if (!slot) {
      throw new Error("Slot liste des abonnements introuvable.");
    }

    const fragmentListe = await chargerFragmentObjet("/BOX/04-box-liste-card.html");
    slot.innerHTML = "";
    slot.appendChild(fragmentListe);

    const fragmentCard = await chargerFragmentObjet("/BOX/04-box-card-abonnement.html");
    etat.templateAbonnement = fragmentCard.querySelector("[data-lcdp-box-card-abonnement]");

    if (!etat.templateAbonnement) {
      throw new Error("Template card abonnement introuvable.");
    }

    actualiserTitreListe();
  }

  function initialiserBoutonChoisirAbonnement() {
    const bouton = document.getElementById("bouton-choisir-abonnement");

    if (!bouton) return;

    bouton.addEventListener("click", async () => {
      await afficherAlerte("Le workflow d'abonnement sera raccordé ensuite.");
    });
  }

  function initialiserActionsListeAbonnement() {
    const zoneActions = document.querySelector("[data-lcdp-liste-card-actions]");

    if (!zoneActions) return;

    zoneActions.innerHTML = "";

    const boutonAvenir = creerBoutonFiltre("À venir", "avenir");
    const boutonPasse = creerBoutonFiltre("Passé", "passe");

    zoneActions.appendChild(boutonAvenir);
    zoneActions.appendChild(boutonPasse);
    actualiserBoutonsFiltre();
  }

  function creerBoutonFiltre(label, filtre) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-secondary";
    bouton.textContent = label;
    bouton.dataset.filtreAbonnement = filtre;

    bouton.addEventListener("click", () => {
      etat.filtre = etat.filtre === filtre ? "encours" : filtre;
      actualiserTitreListe();
      actualiserBoutonsFiltre();
      afficherAbonnements(etat.abonnements);
    });

    return bouton;
  }

  function actualiserTitreListe() {
    const titre = document.querySelector("[data-lcdp-liste-card-title]");

    if (titre) titre.textContent = titresFiltres[etat.filtre] || titresFiltres.encours;
  }

  function actualiserBoutonsFiltre() {
    document.querySelectorAll("[data-filtre-abonnement]").forEach((bouton) => {
      const actif = bouton.dataset.filtreAbonnement === etat.filtre;
      bouton.setAttribute("aria-pressed", actif ? "true" : "false");
    });
  }

  async function chargerAbonnements() {
    if (!ENDPOINT_ABONNEMENT_MEMBRE) {
      afficherErreurListe("Le service abonnement membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementListe("Chargement de votre abonnement...");

      const reponse = await fetch(ENDPOINT_ABONNEMENT_MEMBRE + "/mes-abonnements", {
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
        throw new Error(messageErreurApi(data, "Impossible de charger votre abonnement."));
      }

      if (typeof data.abonne === "boolean") {
        afficherEtatMembre(data.abonne);
      }

      etat.abonnements = Array.isArray(data.abonnements) ? data.abonnements : [];
      afficherAbonnements(etat.abonnements);
    } catch (error) {
      console.error("Erreur chargement abonnement membre :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function gererClicDocument(event) {
    const boutonProlonger = event.target.closest("[data-action='prolonger']");
    const boutonFacture = event.target.closest("[data-action='voir-facture']");

    if (boutonProlonger) {
      await afficherAlerte("Le workflow de changement d'abonnement sera raccordé ensuite.");
      return;
    }

    if (boutonFacture) {
      const card = boutonFacture.closest("[data-lcdp-box-card-abonnement]");
      await ouvrirFacture(card);
    }
  }

  async function ouvrirFacture(card) {
    if (!card) {
      await afficherAlerte("Facture introuvable.");
      return;
    }

    const facture = {
      orderid: card.dataset.orderid || "",
      orderdate: card.dataset.orderdate || "",
      ht: card.dataset.ht || "",
      tva: card.dataset.tva || "",
      ttc: card.dataset.ttc || ""
    };

    if (!facture.orderid) {
      await afficherAlerte("Commande non renseignée.");
      return;
    }

    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-facture.html");
    slot.appendChild(fragment);

    const box = slot.querySelector("[data-lcdp-box-facture]");
    const boutonFermer = slot.querySelector("[data-lcdp-facture-close]");
    const boutonOk = slot.querySelector("[data-lcdp-facture-ok]");

    remplirTexte(slot, "[data-lcdp-facture-orderid]", facture.orderid);
    remplirTexte(slot, "[data-lcdp-facture-orderdate]", formaterDate(facture.orderdate));
    remplirTexte(slot, "[data-lcdp-facture-ht]", formaterMontant(facture.ht));
    remplirTexte(slot, "[data-lcdp-facture-tva]", formaterMontant(facture.tva));
    remplirTexte(slot, "[data-lcdp-facture-ttc]", formaterMontant(facture.ttc));

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(true);
      }

      if (boutonFermer) boutonFermer.addEventListener("click", fermer);
      if (boutonOk) boutonOk.addEventListener("click", fermer);
      if (box) {
        box.addEventListener("click", (event) => {
          if (event.target === box) fermer();
        });
      }

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") fermer();
        },
        { once: true }
      );
    });
  }

  function remplirTexte(racine, selecteur, valeur) {
    const element = racine.querySelector(selecteur);

    if (!element) return;

    element.textContent = valeur || "Non renseigné";
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

  function afficherAbonnements(abonnements) {
    const zoneListe = obtenirZoneListe();

    if (!zoneListe) return;

    const abonnementsFiltres = filtrerEtTrierAbonnements(abonnements);

    zoneListe.innerHTML = "";

    if (!abonnementsFiltres.length) {
      afficherMessageListe(messageVideFiltre(), "information");
      return;
    }

    masquerMessageListe();

    abonnementsFiltres.forEach((abonnement) => {
      zoneListe.appendChild(creerCardAbonnement(abonnement));
    });
  }

  function messageVideFiltre() {
    if (etat.filtre === "avenir") return "Il n'y a pas d'abonnement à venir.";
    if (etat.filtre === "passe") return "Il n'y a pas d'abonnement passé.";

    return "Il n'y a pas d'abonnement en cours.";
  }

  function filtrerEtTrierAbonnements(source) {
    return (Array.isArray(source) ? source : [])
      .filter((abonnement) => categorieAbonnement(abonnement) === etat.filtre)
      .sort((a, b) => {
        const dateA = dateTri(a);
        const dateB = dateTri(b);

        if (etat.filtre === "passe") return dateB - dateA;

        return dateA - dateB;
      });
  }

  function categorieAbonnement(abonnement) {
    const maintenant = new Date();
    const debut = lireDate(abonnement.debut);
    const fin = lireDate(abonnement.fin);

    if (debut && debut > maintenant) return "avenir";
    if (fin && fin < debutJour(maintenant)) return "passe";

    return "encours";
  }

  function dateTri(abonnement) {
    const valeur = etat.filtre === "passe" ? abonnement.fin : abonnement.debut;
    const date = lireDate(valeur);

    return date ? date.getTime() : 0;
  }

  function creerCardAbonnement(abonnement) {
    const card = etat.templateAbonnement.cloneNode(true);
    const commande = normaliserCommande(abonnement);
    const categorie = categorieAbonnement(abonnement);

    if (categorie === "passe") {
      card.classList.add("lcdp-box-card-abonnement--passe");
    }

    card.dataset.idabo = String(abonnement.idabo || abonnement.id || "");
    card.dataset.orderid = commande.orderid;
    card.dataset.orderdate = commande.orderdate;
    card.dataset.ht = normaliserMontantBrut(commande.ht);
    card.dataset.tva = normaliserMontantBrut(commande.tva);
    card.dataset.ttc = normaliserMontantBrut(commande.ttc);

    remplirTexte(card, "[data-lcdp-card-abonnement-type]", abonnement.typabo || abonnement.abonnement || "Non renseigné");
    remplirTexte(card, "[data-lcdp-card-abonnement-debut]", formaterDate(abonnement.debut));
    remplirTexte(card, "[data-lcdp-card-abonnement-fin]", formaterDate(abonnement.fin));
    remplirTexte(card, "[data-lcdp-card-abonnement-orderid]", commande.orderid || "Non renseigné");

    appliquerRoutesSite(card);

    return card;
  }

  function normaliserCommande(abonnement) {
    const commande = abonnement.commande || abonnement.ca || {};

    return {
      orderid: String(commande.orderid || abonnement.orderid || "").trim(),
      orderdate: commande.orderdate || abonnement.orderdate || "",
      ht: commande.ht ?? abonnement.ht ?? "",
      tva: commande.tva ?? abonnement.tva ?? "",
      ttc: commande.ttc ?? abonnement.ttc ?? ""
    };
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
      "source=" + encodeURIComponent(SOURCE_PAGE) +
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

  function lireDate(valeur) {
    if (!valeur) return null;

    const date = new Date(valeur);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function debutJour(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function formaterDate(valeur) {
    if (!valeur) return "Non renseigné";

    const date = new Date(valeur);

    if (Number.isNaN(date.getTime())) return String(valeur);

    return date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function normaliserMontantBrut(valeur) {
    if (valeur === null || typeof valeur === "undefined") return "";

    return String(valeur).trim();
  }

  function formaterMontant(valeur) {
    if (valeur === null || typeof valeur === "undefined" || valeur === "") {
      return "Non renseigné";
    }

    const nombre = Number(String(valeur).replace(",", "."));

    if (Number.isNaN(nombre)) return String(valeur);

    return nombre.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR"
    });
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }
})();
