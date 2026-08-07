(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};

  const ENDPOINT_LA_CLE_DU_PARC = construireEndpointApi(
    "workerLaCleDuParcUrl",
    "WORKER_LA_CLE_DU_PARC_URL",
    "W_LA_CLE_DU_PARC_URL",
    "w-la-cle-du-parc-api"
  );

  const PAGE_ACCUEIL_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/accueil-membre.html");

  const ecranCheckin = document.querySelector('[data-lcdp-cle-screen="checkin"]');
  const ecranActif = document.querySelector('[data-lcdp-cle-screen="active"]');
  const boutonCode1 = document.querySelector('[data-lcdp-cle-code-button="1"]');
  const boutonCode2 = document.querySelector('[data-lcdp-cle-code-button="2"]');
  const valeurCode1 = document.querySelector('[data-lcdp-cle-code-value="1"]');
  const valeurCode2 = document.querySelector('[data-lcdp-cle-code-value="2"]');
  const boutonValider = document.querySelector("[data-lcdp-cle-submit]");
  const boutonBrighta = document.querySelector("[data-lcdp-cle-brighta]");
  const boutonCheckout = document.querySelector("[data-lcdp-cle-checkout]");
  const texteCooldown = document.querySelector("[data-lcdp-cle-cooldown]");

  let code1 = "";
  let code2 = "";
  let cleActive = false;
  let navigationVerrouillee = false;
  let brightaDisponibleA = 0;
  let intervalleCooldown = null;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    lierActions();

    if (!ENDPOINT_LA_CLE_DU_PARC) {
      await afficherAlerte("Le service Ma clé n'est pas configuré.");
      redirigerAccueil();
      return;
    }

    try {
      const statut = await appelerApi("/status", { method: "GET" });

      if (statut.allowed !== true) {
        await afficherAlerte(messageErreurAccesCle(statut));
        redirigerAccueil();
        return;
      }

      if (statut.screen === "active" || statut.checkinActive === true) {
        afficherEcranActif(statut.brightaAvailableAt || statut.brightaDisponibleA || "");
        return;
      }

      afficherEcranCheckin();
    } catch (error) {
      console.error("Erreur initialisation Ma clé :", error);
      await afficherAlerte(error.message || "Impossible d'ouvrir Ma clé.");
      redirigerAccueil();
    }
  }

  function lierActions() {
    boutonCode1?.addEventListener("click", () => saisirCode(1));
    boutonCode2?.addEventListener("click", () => saisirCode(2));
    boutonValider?.addEventListener("click", validerCle);
    boutonBrighta?.addEventListener("click", gererBrighta);
    boutonCheckout?.addEventListener("click", gererCheckout);

    window.addEventListener("popstate", gererRetourNavigateur);
    window.addEventListener("beforeunload", gererFermeturePage);
  }

  async function saisirCode(numero) {
    const valeurActuelle = numero === 1 ? code1 : code2;
    const valeur = await ouvrirDialogueChamp({
      titre: "Code n°" + String(numero),
      label: "Saisissez le code à 4 chiffres",
      valeur: valeurActuelle,
      longueur: 4,
      boutonValider: "Valider"
    });

    if (valeur === null) return;

    if (numero === 1) {
      code1 = valeur;
      afficherValeurCode(valeurCode1, code1);
      return;
    }

    code2 = valeur;
    afficherValeurCode(valeurCode2, code2);
  }

  function afficherValeurCode(element, valeur) {
    if (!element) return;
    element.textContent = valeur || "Saisir le code";
    element.classList.toggle("is-filled", Boolean(valeur));
  }

  async function validerCle() {
    if (!/^\d{4}$/.test(code1) || !/^\d{4}$/.test(code2)) {
      await afficherAlerte("Saisissez les deux codes à 4 chiffres.");
      return;
    }

    definirChargementBoutonLogo(true);

    try {
      const geolocalisation = await obtenirGeolocalisation();
      const resultat = await appelerApi("/checkin", {
        method: "POST",
        body: {
          code1,
          code2,
          geolocalisation
        }
      });

      if (resultat.success !== true || resultat.checkin !== true) {
        throw creerErreurApi(resultat, "Votre clé n'est pas reconnue");
      }

      afficherEcranActif(resultat.brightaAvailableAt || "");
    } catch (error) {
      console.error("Erreur validation clé :", error);

      if (error.reason === "key_unrecognized" || error.status === 422) {
        await afficherAlerte("Votre clé n'est pas reconnue", {
          boutonOkLabel: "Recommencer"
        });
        return;
      }

      await afficherAlerte(error.message || "Impossible de valider votre clé.");
    } finally {
      definirChargementBoutonLogo(false);
    }
  }

  async function gererBrighta() {
    if (!cleActive || Date.now() < brightaDisponibleA) return;

    definirBoutonEnCours(boutonBrighta, true);

    try {
      const preparation = await preparerConfirmation("brighta");
      if (!preparation) return;

      const confirmation = await demanderCodeConfirmation(
        "Confirmer BRIGHT-A",
        preparation.code
      );

      if (!confirmation) return;

      let geolocalisation = null;

      if (preparation.locationRequired === true) {
        geolocalisation = await obtenirGeolocalisation();
      }

      const resultat = await appelerApi("/brighta", {
        method: "POST",
        body: {
          code: confirmation,
          token: preparation.token,
          geolocalisation
        }
      });

      if (resultat.success !== true || resultat.brighta !== true) {
        throw creerErreurApi(resultat, "Impossible d'allumer le bracelet.");
      }

      definirDisponibiliteBrighta(
        resultat.brightaAvailableAt || new Date(Date.now() + 50 * 60 * 1000).toISOString()
      );
    } catch (error) {
      console.error("Erreur BRIGHT-A :", error);
      await afficherAlerte(error.message || "Impossible d'allumer le bracelet.");
    } finally {
      definirBoutonEnCours(boutonBrighta, false);
      actualiserCooldown();
    }
  }

  async function gererCheckout() {
    if (!cleActive) return;

    definirBoutonEnCours(boutonCheckout, true);

    try {
      const preparation = await preparerConfirmation("checkout");
      if (!preparation) return;

      const confirmation = await demanderCodeConfirmation(
        "Confirmer le checkout",
        preparation.code
      );

      if (!confirmation) return;

      const geolocalisation = await obtenirGeolocalisation();
      const resultat = await appelerApi("/checkout", {
        method: "POST",
        body: {
          code: confirmation,
          token: preparation.token,
          geolocalisation
        }
      });

      if (resultat.success !== true || resultat.checkout !== true) {
        throw creerErreurApi(resultat, "Impossible de valider le checkout.");
      }

      cleActive = false;
      deverrouillerNavigation();
      redirigerAccueil();
    } catch (error) {
      console.error("Erreur checkout :", error);
      await afficherAlerte(error.message || "Impossible de valider le checkout.");
    } finally {
      definirBoutonEnCours(boutonCheckout, false);
    }
  }

  async function preparerConfirmation(action) {
    const resultat = await appelerApi("/action-code", {
      method: "POST",
      body: { action }
    });

    if (
      resultat.success !== true ||
      !/^\d{2}$/.test(String(resultat.code || "")) ||
      !resultat.token
    ) {
      throw creerErreurApi(resultat, "Impossible de préparer la confirmation.");
    }

    return {
      code: String(resultat.code),
      token: String(resultat.token),
      locationRequired: resultat.locationRequired === true
    };
  }

  async function demanderCodeConfirmation(titre, codeAffiche) {
    return ouvrirDialogueChamp({
      titre,
      label: "Saisissez le code affiché",
      longueur: 2,
      boutonValider: "Confirmer",
      codeAffiche
    });
  }

  function afficherEcranCheckin() {
    cleActive = false;
    ecranCheckin.hidden = false;
    ecranActif.hidden = true;
    document.body.classList.remove("is-cle-active");
    deverrouillerNavigation();
  }

  function afficherEcranActif(disponibiliteBrighta) {
    cleActive = true;
    ecranCheckin.hidden = true;
    ecranActif.hidden = false;
    document.body.classList.add("is-cle-active");
    definirDisponibiliteBrighta(disponibiliteBrighta);
    verrouillerNavigation();
  }

  function definirDisponibiliteBrighta(valeur) {
    const date = new Date(valeur || 0);
    brightaDisponibleA = Number.isNaN(date.getTime()) ? 0 : date.getTime();
    actualiserCooldown();

    if (intervalleCooldown) {
      window.clearInterval(intervalleCooldown);
    }

    intervalleCooldown = window.setInterval(actualiserCooldown, 30000);
  }

  function actualiserCooldown() {
    if (!boutonBrighta || !texteCooldown) return;

    const restant = brightaDisponibleA - Date.now();

    if (restant <= 0) {
      boutonBrighta.disabled = false;
      boutonBrighta.textContent = "BRIGHT-A";
      texteCooldown.hidden = true;
      texteCooldown.textContent = "";
      return;
    }

    const minutes = Math.max(1, Math.ceil(restant / 60000));
    boutonBrighta.disabled = true;
    boutonBrighta.textContent = "BRIGHT-A";
    texteCooldown.hidden = false;
    texteCooldown.textContent = "Disponible dans " + String(minutes) + " min";
  }

  function verrouillerNavigation() {
    if (navigationVerrouillee) return;
    navigationVerrouillee = true;
    window.history.pushState({ lcdpCleActive: true }, "", window.location.href);
  }

  function deverrouillerNavigation() {
    navigationVerrouillee = false;
  }

  function gererRetourNavigateur() {
    if (!cleActive || !navigationVerrouillee) return;
    window.history.pushState({ lcdpCleActive: true }, "", window.location.href);
  }

  function gererFermeturePage(event) {
    if (!cleActive) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function definirChargementBoutonLogo(enCours) {
    if (!boutonValider) return;
    boutonValider.disabled = enCours;
    boutonValider.classList.toggle("is-loading", enCours);
  }

  function definirBoutonEnCours(bouton, enCours) {
    if (!bouton) return;
    bouton.dataset.lcdpEnCours = enCours ? "true" : "false";
    bouton.disabled = enCours || (bouton === boutonBrighta && Date.now() < brightaDisponibleA);
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
    const contenu = slot.querySelector("[data-lcdp-dialogue-champ-content]");
    const erreur = slot.querySelector("[data-lcdp-dialogue-champ-error]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-champ-close]");
    const boutonAnnuler = slot.querySelector("[data-lcdp-dialogue-champ-cancel]");
    const boutonSoumettre = slot.querySelector("[data-lcdp-dialogue-champ-submit]");

    if (
      !dialogue ||
      !titre ||
      !formulaire ||
      !contenu ||
      !erreur ||
      !boutonFermer ||
      !boutonAnnuler ||
      !boutonSoumettre
    ) {
      slot.innerHTML = "";
      throw new Error("Structure du dialogue de saisie incomplète.");
    }

    titre.textContent = options.titre || "Saisie";
    boutonSoumettre.textContent = options.boutonValider || "Valider";
    contenu.innerHTML = "";

    if (options.codeAffiche) {
      const note = document.createElement("p");
      note.className = "lcdp-cle-dialogue-note";
      note.textContent = "Code de confirmation";

      const code = document.createElement("p");
      code.className = "lcdp-cle-confirm-code";
      code.textContent = String(options.codeAffiche);

      contenu.appendChild(note);
      contenu.appendChild(code);
    }

    const champ = document.createElement("label");
    champ.className = "lcdp-box-dialogue-champ__field";

    const libelle = document.createElement("span");
    libelle.className = "lcdp-box-dialogue-champ__label";
    libelle.textContent = options.label || "Code";

    const input = document.createElement("input");
    input.className = "lcdp-box-dialogue-champ__input";
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "one-time-code";
    input.maxLength = Number(options.longueur || 4);
    input.pattern = "[0-9]*";
    input.value = String(options.valeur || "");
    input.setAttribute("aria-label", libelle.textContent);

    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, input.maxLength);
      erreur.hidden = true;
      erreur.textContent = "";
    });

    champ.appendChild(libelle);
    champ.appendChild(input);
    contenu.appendChild(champ);

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur);
      }

      formulaire.addEventListener("submit", (event) => {
        event.preventDefault();
        const valeur = input.value.replace(/\D/g, "");

        if (valeur.length !== input.maxLength) {
          erreur.textContent = "Saisissez exactement " + String(input.maxLength) + " chiffres.";
          erreur.hidden = false;
          input.focus();
          return;
        }

        fermer(valeur);
      });

      boutonFermer.addEventListener("click", () => fermer(null));
      boutonAnnuler.addEventListener("click", () => fermer(null));
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

      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    });
  }

  async function afficherAlerte(message, options = {}) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return false;

    slot.innerHTML = "";
    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
    slot.appendChild(fragment);

    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      slot.innerHTML = "";
      throw new Error("Structure de l'alerte incomplète.");
    }

    texte.textContent = normaliserPonctuation(message);
    boutonOk.textContent = options.boutonOkLabel || "OK";

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

  function obtenirGeolocalisation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("La géolocalisation n'est pas disponible sur ce téléphone."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: new Date(position.timestamp || Date.now()).toISOString()
          });
        },
        () => {
          reject(new Error("La géolocalisation est nécessaire pour valider cette action."));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    });
  }

  async function appelerApi(chemin, options = {}) {
    const configuration = {
      method: options.method || "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    };

    if (options.body !== undefined) {
      configuration.headers["Content-Type"] = "application/json";
      configuration.body = JSON.stringify(options.body);
    }

    const reponse = await fetch(ENDPOINT_LA_CLE_DU_PARC + chemin, configuration);
    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexion();
      throw new Error("Votre session membre n'est plus active.");
    }

    if (!reponse.ok || !resultat) {
      throw creerErreurApi(resultat, "Erreur technique. Merci de réessayer.", reponse.status);
    }

    return resultat;
  }

  function creerErreurApi(resultat, messageDefaut, status = 0) {
    const erreur = new Error(
      String(resultat?.message || resultat?.error || messageDefaut || "Erreur technique.")
    );
    erreur.reason = String(resultat?.reason || "");
    erreur.status = Number(status || resultat?.status || 0);
    return erreur;
  }

  function messageErreurAccesCle(resultat) {
    const raison = String(resultat?.reason || "").trim().toLowerCase();

    if (raison === "no_reservation" || raison === "no_invitation") {
      return "Vous n'avez pas de réservation en cours.";
    }

    if (raison === "key_inactive" || raison === "too_early" || raison === "too_late") {
      return "Votre clé n'est pas active actuellement.";
    }

    if (raison === "subscription_unpaid") {
      return "Votre abonnement n'est pas payé.";
    }

    if (raison === "sponsor_not_checked_in") {
      return "Votre clé n'est pas encore disponible. Le membre qui vous a invité doit d'abord valider la sienne.";
    }

    return String(resultat?.message || resultat?.error || "Impossible d'ouvrir Ma clé.");
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

  function construireEndpointApi(cleModerne, cleLegacy, cleCourte, sousDomaineWorker) {
    const depuisConfig =
      (cleModerne ? CONFIG_PAGE?.[cleModerne] : "") ||
      (cleLegacy ? CONFIG_PAGE?.[cleLegacy] : "") ||
      (cleCourte ? CONFIG_PAGE?.[cleCourte] : "") ||
      "";

    if (depuisConfig) return String(depuisConfig).replace(/\/+$/, "");

    if (typeof CONFIG_PAGE.apiUrl === "function") {
      return CONFIG_PAGE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    }

    return "";
  }

  function construireUrlMembre(chemin) {
    if (typeof window.LCDP_urlMembre === "function") {
      return window.LCDP_urlMembre(chemin);
    }

    return buildUrl(
      CONFIG_PAGE.membreBaseUrl || CONFIG_PAGE.MEMBRE_BASE || CONFIG_PAGE.siteBase || "",
      chemin
    );
  }

  function construireUrlPublic(chemin) {
    if (typeof window.LCDP_urlPublic === "function") {
      return window.LCDP_urlPublic(chemin);
    }

    return buildUrl(
      CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "",
      chemin
    );
  }

  function construireUrlObjet(chemin) {
    if (typeof window.LCDP_urlObjet === "function") {
      return window.LCDP_urlObjet(chemin);
    }

    const base =
      CONFIG_PAGE.objetBaseUrl ||
      CONFIG_PAGE.OBJET_BASE ||
      buildUrl(CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "", "/OBJET");

    return buildUrl(base, chemin);
  }

  function buildUrl(base, path) {
    return String(base || "").replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");
  }

  function normaliserPonctuation(message) {
    const texte = String(message || "").trim();
    if (!texte || /[.!?…]$/.test(texte)) return texte;
    return texte + ".";
  }

  function redirigerAccueil() {
    window.location.href = PAGE_ACCUEIL_MEMBRE;
  }

  function redirigerConnexion() {
    const chemin =
      "/ESPACE-PUBLIC/connexion-membre.html" +
      "?source=" + encodeURIComponent("lacleduparc") +
      "&session=" + encodeURIComponent("inactive");

    window.location.href = construireUrlPublic(chemin);
  }
})();
