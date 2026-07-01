(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "reserver-membre";
  const DOSSIER_IMAGES_PARC_OBJET = "/IMAG/IMAGE%20PARC";

  const ENDPOINT_NOUVELLE_DATE_MEMBRE = construireEndpointApi(
    "workerNouvelleDateMembreUrl",
    "WORKER_NOUVELLE_DATE_MEMBRE_URL",
    "nouvelle-date-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");

  let pageInitialisee = false;

  const etat = {
    departement: "",
    parcs: [],
    templateCardParc: null
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
      await initialiserListeParcs();
      initialiserActionsPage();
      document.addEventListener("click", gererClicDocument);
      await chargerParcsAutourDeMoi();
    } catch (error) {
      console.error("Erreur réserver membre :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function initialiserActionsPage() {
    const boutonIa = document.getElementById("bouton-rechercher-ia");
    const boutonDepartement = document.getElementById("bouton-changer-departement");

    if (boutonIa) {
      boutonIa.addEventListener("click", () => {
        afficherAlerte("La recherche avec l’IA sera raccordée ensuite.").catch(console.error);
      });
    }

    if (boutonDepartement) {
      boutonDepartement.addEventListener("click", ouvrirDialogueDepartement);
    }
  }

  async function initialiserListeParcs() {
    const slot = document.getElementById("lcdp-liste-card-parcs-slot");

    if (!slot) {
      throw new Error("Slot liste des parcs introuvable.");
    }

    slot.innerHTML = "";

    const fragmentListe = await chargerFragmentObjet("/BOX/04-box-liste-card.html");
    slot.appendChild(fragmentListe);

    const fragmentCard = await chargerFragmentObjet("/BOX/04-box-card-parc.html");
    etat.templateCardParc = fragmentCard.querySelector("[data-lcdp-box-card-parc]");

    if (!etat.templateCardParc) {
      throw new Error("Template card parc introuvable.");
    }

    const titre = slot.querySelector("[data-lcdp-liste-card-title]");
    const zoneActions = slot.querySelector("[data-lcdp-liste-card-actions]");

    if (titre) titre.textContent = "Autour de moi";
    if (zoneActions) zoneActions.hidden = true;
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

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(messageErreurApi(data, "Impossible de charger les parcs autour de vous."));
      }

      etat.departement = nettoyerDepartement(data.departement);
      etat.parcs = Array.isArray(data.parcs) ? data.parcs : [];

      afficherTitreListe("Autour de moi");
      afficherParcs(etat.parcs);
    } catch (error) {
      console.error("Erreur chargement parcs autour de moi :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function chargerParcsDepartement(departement) {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      afficherErreurListe("Le service de réservation membre n’est pas configuré.");
      return;
    }

    const dptmt = nettoyerDepartement(departement);

    if (!dptmt) {
      await afficherAlerte("Le département est obligatoire.");
      return;
    }

    try {
      afficherChargementListe("Chargement des parcs...");

      const reponse = await fetch(
        ENDPOINT_NOUVELLE_DATE_MEMBRE + "/departement?dptmt=" + encodeURIComponent(dptmt),
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

      etat.departement = nettoyerDepartement(data.departement || dptmt);
      etat.parcs = Array.isArray(data.parcs) ? data.parcs : [];

      afficherTitreListe("Parcs du département " + etat.departement);
      afficherParcs(etat.parcs);
    } catch (error) {
      console.error("Erreur chargement parcs département :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function afficherTitreListe(titreTexte) {
    const titre = document.querySelector("[data-lcdp-liste-card-title]");

    if (titre) titre.textContent = titreTexte || "Parcs";
  }

  function afficherChargementListe(message) {
    const zoneListe = obtenirZoneListe();

    if (zoneListe) zoneListe.innerHTML = "";

    afficherMessageListe(message || "Chargement...", "information");
  }

  function afficherErreurListe(message) {
    const zoneListe = obtenirZoneListe();

    if (zoneListe) zoneListe.innerHTML = "";

    afficherMessageListe(message || "Erreur technique. Merci de réessayer.", "erreur");
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

  function afficherParcs(parcs) {
    const zoneListe = obtenirZoneListe();

    if (!zoneListe) return;

    zoneListe.innerHTML = "";

    if (!Array.isArray(parcs) || parcs.length === 0) {
      afficherMessageListe("Aucun parc trouvé pour ce département.", "information");
      return;
    }

    masquerMessageListe();

    parcs.forEach((parc) => {
      zoneListe.appendChild(creerCardParc(parc));
    });
  }

  function creerCardParc(parc) {
    const card = etat.templateCardParc.cloneNode(true);

    const idparc = String(parc.idparc || parc.id || "").trim();
    const nom = String(parc.nom || parc.nomparc || "Parc").trim();
    const departement = nettoyerDepartement(parc.dptmt || parc.departement || "");
    const presentation = nettoyerTexteParc(parc.prez || parc.presentation || "");
    const imageUrl = construireUrlImageParc(parc.imageparc || "");

    const image = card.querySelector("[data-lcdp-card-parc-image]");
    const titre = card.querySelector("[data-lcdp-card-parc-title]");
    const meta = card.querySelector("[data-lcdp-card-parc-meta]");
    const description = card.querySelector("[data-lcdp-card-parc-description]");
    const boutonFiche = card.querySelector("[data-action='ouvrir-fiche-parc']");
    const boutonNouvelleDate = card.querySelector("[data-action='nouvelle-date-parc']");

    card.dataset.idparc = idparc;
    card.dataset.nomparc = nom;

    if (image) {
      if (imageUrl) {
        image.src = imageUrl;
        image.alt = "Image du parc " + nom;
        image.addEventListener("error", () => {
          image.hidden = true;
          image.removeAttribute("src");
          card.classList.add("lcdp-box-card-parc--sans-image");
        }, { once: true });
      } else {
        image.hidden = true;
        card.classList.add("lcdp-box-card-parc--sans-image");
      }
    }

    if (titre) titre.textContent = nom;

    if (meta) {
      meta.textContent = departement ? "Département " + departement : "";
      meta.hidden = !departement;
    }

    if (description) {
      description.textContent = presentation;
      description.hidden = !presentation;
    }

    if (boutonFiche) {
      boutonFiche.dataset.id = idparc;
      boutonFiche.dataset.nom = nom;
    }

    if (boutonNouvelleDate) {
      boutonNouvelleDate.dataset.id = idparc;
      boutonNouvelleDate.dataset.nom = nom;
    }

    return card;
  }

  async function gererClicDocument(event) {
    const boutonFiche = event.target.closest("[data-action='ouvrir-fiche-parc']");
    const boutonNouvelleDate = event.target.closest("[data-action='nouvelle-date-parc']");

    if (boutonFiche) {
      await afficherAlerte("La fiche du parc sera raccordée ensuite.");
      return;
    }

    if (boutonNouvelleDate) {
      await afficherAlerte("Le choix de la date sera raccordé à l’étape suivante.");
    }
  }

  async function ouvrirDialogueDepartement() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Changer de département",
      champs: [
        {
          id: "reservation-departement",
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
          const input = formulaire.querySelector(`[name="${champ.name}"]`);
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

    if (configurationChamp.inputmode) input.inputMode = configurationChamp.inputmode;
    if (configurationChamp.autocomplete) input.autocomplete = configurationChamp.autocomplete;

    zoneLabel.appendChild(label);
    zoneControl.appendChild(input);

    return champ;
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
          abonne: true
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

  function obtenirZoneListe() {
    return document.querySelector("[data-lcdp-liste-card-list]");
  }

  function obtenirZoneMessageListe() {
    return document.querySelector("[data-lcdp-liste-card-message]");
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

  function construireUrlImageParc(imageparc) {
    const valeur = String(imageparc || "").trim();

    if (!valeur) return "";
    if (estUrlExterneOuAncre(valeur)) return valeur;

    if (valeur.startsWith("/OBJET/")) {
      return construireUrlObjet(valeur.replace(/^\/OBJET\/?/, "/"));
    }

    if (valeur.startsWith("/")) {
      return construireUrlPublic(valeur);
    }

    if (valeur.includes("/")) {
      return construireUrlObjet("/" + valeur.replace(/^\/+/, ""));
    }

    return construireUrlObjet(DOSSIER_IMAGES_PARC_OBJET + "/" + encodeURIComponent(valeur));
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

  function reponseApiOk(data) {
    return data && (data.ok === true || data.success === true);
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
  }

  function nettoyerDepartement(value) {
    const departement = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (/^[1-9]$/.test(departement)) {
      return "0" + departement;
    }

    return departement;
  }

  function nettoyerTexteParc(value) {
    const texte = String(value || "")
      .trim()
      .replace(/\s+/g, " ");

    if (texte.length <= 220) return texte;

    return texte.slice(0, 217).trim() + "...";
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }
})();
