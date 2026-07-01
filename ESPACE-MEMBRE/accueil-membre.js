(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "accueil-membre";

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
      window.SITE_BASE ||
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

    if (typeof CONFIG_PAGE.apiUrl === "function" && sousDomaineWorker) {
      return CONFIG_PAGE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    }

    return "";
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

  function lireCookie(nom) {
    return document.cookie
      .split(";")
      .map((part) => part.trim())
      .some((part) => part.startsWith(nom + "="));
  }

  function sessionMembrePresente() {
    return lireCookie("idsession_membre") || lireCookie("session_membre");
  }

  function membreAbonne() {
    return lireCookie("abonne");
  }

  function redirigerConnexionMembre() {
    const cible = construireUrlPublic(
      "/ESPACE-PUBLIC/connexion-membre.html?source=" +
      encodeURIComponent(SOURCE_PAGE) +
      "&session=inactive"
    );

    window.location.href = cible;
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

  async function afficherAlerte(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return;

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

    const fermer = () => {
      slot.innerHTML = "";
    };

    boutonFermer.addEventListener("click", fermer);
    boutonOk.addEventListener("click", fermer);

    alerte.addEventListener("click", (event) => {
      if (event.target === alerte) fermer();
    });

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") fermer();
      },
      { once: true }
    );
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const bandeau = await chargerFragmentObjet("/BOX/02-box-bandeau-nav.html");
    slot.appendChild(bandeau);

    const lienLogo = slot.querySelector(".lcdp-box-bandeau-nav__logo-link");
    const label = slot.querySelector("[data-lcdp-bandeau-nav-label]");

    if (lienLogo) {
      lienLogo.dataset.siteHref = "/ESPACE-MEMBRE/accueil-membre.html";
      lienLogo.dataset.space = "membre";
      lienLogo.setAttribute("aria-label", "Accueil espace membre");
    }

    if (label) {
      label.textContent = "Espace membre";
    }

    appliquerRoutesSite(slot);

    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js");

    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre();
    }
  }

  function verifierAccesBouton(configurationBouton) {
    if (configurationBouton.type !== "membre") {
      return { autorise: true, message: "" };
    }

    if (!sessionMembrePresente()) {
      return {
        autorise: false,
        redirectionConnexion: true,
        message: "Session membre inactive."
      };
    }

    if (configurationBouton.abonnementRequis && !membreAbonne()) {
      return {
        autorise: false,
        redirectionConnexion: false,
        message: configurationBouton.message || "Cette fonction est réservée aux membres abonnés."
      };
    }

    return { autorise: true, message: "" };
  }

  async function initialiserMenuCentral() {
    const slot = document.getElementById("lcdp-menu-central-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/02-box-menu-bouton.html");
    slot.appendChild(fragment);

    const liste = slot.querySelector("[data-lcdp-menu-bouton-list]");

    if (!liste) {
      throw new Error("Structure du menu bouton incomplète.");
    }

    const boutons = [
      {
        label: "VALIDER",
        type: "membre",
        target: "/ESPACE-MEMBRE/valider-membre.html",
        abonnementRequis: true,
        style: "lcdp-button-primary",
        message: "La fonction valider est réservée aux membres abonnés."
      },
      {
        label: "RÉSERVER",
        type: "membre",
        target: "/ESPACE-MEMBRE/reserver-membre.html",
        abonnementRequis: true,
        style: "lcdp-button-primary",
        message: "La fonction réserver est réservée aux membres abonnés."
      },
      {
        label: "PLANNING",
        type: "membre",
        target: "/ESPACE-MEMBRE/planning-membre.html",
        abonnementRequis: false,
        style: "lcdp-button-primary"
      },
      {
        label: "INVITER",
        type: "membre",
        target: "/ESPACE-MEMBRE/inviter-membre.html",
        abonnementRequis: true,
        style: "lcdp-button-primary",
        message: "La fonction inviter est réservée aux membres abonnés."
      },
      {
        label: "ÊTRE INVITÉ(E)",
        type: "public",
        target: "/ESPACE-PUBLIC/inscription.html",
        style: "lcdp-button-orange"
      },
      {
        label: "LE CLUB",
        type: "public",
        target: "/ESPACE-PUBLIC/la-cle-du-parc.html",
        style: "lcdp-button-primary"
      },
      {
        label: "ACTUALITÉ",
        type: "public",
        target: "/ESPACE-PUBLIC/actualite.html",
        style: "lcdp-button-primary"
      },
      {
        label: "CONNEXION",
        type: "dialogue",
        style: "lcdp-button-primary"
      }
    ];

    boutons.forEach((configurationBouton) => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-button " + (configurationBouton.style || "lcdp-button-primary");
      bouton.textContent = configurationBouton.label;

      bouton.addEventListener("click", () => {
        if (configurationBouton.type === "dialogue") {
          ouvrirDialogueConnexion().catch((error) => {
            console.error("Erreur dialogue connexion :", error);
            window.location.href = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html?source=accueil-membre");
          });
          return;
        }

        if (configurationBouton.type === "public") {
          window.location.href = construireUrlPublic(configurationBouton.target);
          return;
        }

        const acces = verifierAccesBouton(configurationBouton);

        if (!acces.autorise && acces.redirectionConnexion) {
          redirigerConnexionMembre();
          return;
        }

        if (!acces.autorise) {
          afficherAlerte(acces.message).catch(console.error);
          return;
        }

        window.location.href = construireUrlMembre(configurationBouton.target);
      });

      liste.appendChild(bouton);
    });
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const footer = await chargerFragmentObjet("/BOX/02-box-footer.html");
    slot.appendChild(footer);

    appliquerRoutesSite(slot);
  }

  function obtenirWorkerUserRouteurUrl() {
    return construireEndpointApi("workerUserRouteurUrl", "WORKER_USER_ROUTEUR_URL", "user-routeur-api");
  }

  async function redirigerCompte(compte) {
    const workerUrl = obtenirWorkerUserRouteurUrl();

    if (!workerUrl) {
      window.location.href = construireUrlConnexion(compte);
      return;
    }

    try {
      const reponse = await fetch(workerUrl, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ compte })
      });

      if (!reponse.ok) {
        throw new Error("Routeur utilisateur indisponible.");
      }

      const data = await reponse.json().catch(() => null);

      if (data && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      window.location.href = construireUrlConnexion(compte);

    } catch (error) {
      console.error("Erreur routeur utilisateur :", error);
      window.location.href = construireUrlConnexion(compte);
    }
  }

  function construireUrlConnexion(compte) {
    const chemins = {
      membre: "/ESPACE-PUBLIC/connexion-membre.html?source=accueil-membre-dialogue",
      parc: "/ESPACE-PUBLIC/connexion-parc.html?source=accueil-membre-dialogue",
      coach: "/ESPACE-PUBLIC/connexion-coach.html?source=accueil-membre-dialogue"
    };

    return construireUrlPublic(chemins[compte] || chemins.membre);
  }

  async function ouvrirDialogueConnexion() {
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
      throw new Error("Structure de dialogue connexion incomplète.");
    }

    titre.textContent = "Connexion";
    texte.textContent = "Choisissez votre espace de connexion.";
    actions.innerHTML = "";

    [
      { compte: "membre", label: "Espace MEMBRE" },
      { compte: "parc", label: "Espace PARC" },
      { compte: "coach", label: "Espace COACH" }
    ].forEach((item) => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-button lcdp-button-primary";
      bouton.textContent = item.label;

      bouton.addEventListener("click", () => {
        redirigerCompte(item.compte).catch(console.error);
      });

      actions.appendChild(bouton);
    });

    const fermer = () => {
      slot.innerHTML = "";
    };

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

  function nettoyerPrenom(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60);
  }

  async function initialiserMessageAccueil() {
    const messageAccueil = document.getElementById("message-accueil-membre");

    if (!messageAccueil) return;

    const workerIndexMembreUrl = construireEndpointApi(
      "workerIndexMembreUrl",
      "WORKER_INDEX_MEMBRE_URL",
      ""
    );

    if (!workerIndexMembreUrl) {
      messageAccueil.textContent = "Bonjour, que voulez-vous faire ?";
      return;
    }

    try {
      const reponse = await fetch(workerIndexMembreUrl, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || data.success !== true || data.connected !== true) {
        messageAccueil.textContent = "Bonjour, que voulez-vous faire ?";
        return;
      }

      const prenom = nettoyerPrenom(data.prenommembre);

      messageAccueil.textContent = prenom
        ? `Bonjour ${prenom}, que voulez-vous faire ?`
        : "Bonjour, que voulez-vous faire ?";

    } catch (error) {
      console.error("Erreur message accueil membre :", error);
      messageAccueil.textContent = "Bonjour, que voulez-vous faire ?";
    }
  }

  async function initialiserPage() {
    if (!sessionMembrePresente()) {
      redirigerConnexionMembre();
      return;
    }

    await initialiserBandeau();
    await initialiserMenuCentral();
    await initialiserFooter();
    await initialiserMessageAccueil();
  }

  initialiserPage().catch((error) => {
    console.error("Erreur accueil membre :", error);
  });
})();
