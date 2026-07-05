(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "accueil-membre";

  const ENDPOINT_INDEX_MEMBRE = construireEndpointApi(
    "workerIndexMembreUrl",
    "WORKER_INDEX_MEMBRE_URL",
    "W_INDEX_MEMBRE_URL",
    "index-membre-api"
  );

  const ENDPOINT_DECONNEXION_MEMBRE = construireEndpointApi(
    "",
    "W_DECONNEXION_URL",
    "",
    "deconnexion-membre-api"
  );

  const PAGE_PAIEMENT_CB = construireUrlMembre("/ESPACE-MEMBRE/paiement-cb.html");
  const PAGE_ABONNEMENT_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/abonnement-membre.html");

  let pageInitialisee = false;
  let etatMembre = {
    prenommembre: "",
    abonne: false,
    emailparrain: "",
    parrainRenseigne: false,
    aReservationEnCours: false,
    abonnementSuspendu: false,
    paiementSuspension: null
  };

  window.LCDP_gererEtreInviteMembre = function LCDP_gererEtreInviteMembre() {
    return gererEtreInvite(etatMembre);
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

      const etat = await chargerEtatMembre();

      if (!etat) return;

      etatMembre = etat;

      afficherEtatMembre(etatMembre);
      await initialiserBurgerMembre(etatMembre);
      await initialiserMenuCentral(etatMembre);
    } catch (error) {
      console.error("Erreur accueil membre :", error);
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function chargerEtatMembre() {
    if (!ENDPOINT_INDEX_MEMBRE) {
      throw new Error("Le service d’accueil membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return null;
    }

    if (!reponse.ok || !resultat || resultat.success !== true || resultat.connected !== true) {
      throw new Error(messageErreurApi(resultat, "Impossible de vérifier votre session membre."));
    }

    return {
      prenommembre: nettoyerPrenom(resultat.prenommembre),
      abonne: valeurBooleenneVraie(resultat.abonne),
      emailparrain: nettoyerEmail(resultat.emailparrain),
      parrainRenseigne: valeurBooleenneVraie(resultat.parrainRenseigne),
      aReservationEnCours: valeurBooleenneVraie(resultat.aReservationEnCours || resultat.aReservationValidable),
      reservationEnCours: resultat.reservationEnCours || resultat.reservationValidable || null,
      abonnementSuspendu: valeurBooleenneVraie(resultat.abonnementSuspendu || resultat.suspendu),
      paiementSuspension: resultat.paiementSuspension || resultat.paiementRegularisation || null
    };
  }

  function afficherEtatMembre(etat) {
    const mention = document.getElementById("mention-statut-membre");
    const message = document.getElementById("message-accueil-membre");

    if (mention) {
      mention.textContent = etat.abonne
        ? "[Vous êtes membre abonné]"
        : "[Vous êtes membre invité]";
    }

    if (message) {
      message.textContent = etat.prenommembre
        ? "Bonjour " + etat.prenommembre + ", que voulez-vous faire ?"
        : "Bonjour, que voulez-vous faire ?";
    }

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
    bouton.className = "lcdp-button lcdp-button-secondary";
    bouton.textContent = "Payer";
    bouton.addEventListener("click", () => {
      gererPaiementSuspensionMembre(etat).catch(console.error);
    });
    bloc.appendChild(bouton);
  }

  async function gererPaiementSuspensionMembre() {
    window.location.href = PAGE_ABONNEMENT_MEMBRE;
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const bandeau = await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html");
    slot.appendChild(bandeau);

    appliquerRoutesSite(slot);

    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js");
  }

  async function initialiserBurgerMembre(etat) {
    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre({ etatMembre: etat });
    }
  }

  async function initialiserMenuCentral(etat) {
    const slot = document.getElementById("lcdp-menu-central-slot");

    if (!slot) return;

    slot.innerHTML = "";
    slot.classList.add("lcdp-stack");

    const messageAccueil = document.createElement("p");
    messageAccueil.className = "lcdp-text-strong-lead";
    messageAccueil.id = "message-accueil-membre";
    messageAccueil.textContent = etat.prenommembre
      ? "Bonjour " + etat.prenommembre + ", que voulez-vous faire ?"
      : "Bonjour, que voulez-vous faire ?";
    slot.appendChild(messageAccueil);

    const fragment = await chargerFragmentObjet("/BOX/02-box-menu-bouton.html");
    slot.appendChild(fragment);

    const liste = slot.querySelector("[data-lcdp-menu-bouton-list]");

    if (!liste) {
      throw new Error("Structure du menu bouton incomplète.");
    }

    const boutons = [
      {
        label: "VALIDER",
        style: "lcdp-button-primary",
        action: () => gererValidationPresence(etat)
      },
      {
        label: "RÉSERVER",
        style: "lcdp-button-primary",
        action: () => ouvrirPageAbonne(etat, "RESERVER", "/ESPACE-MEMBRE/reserver-membre.html")
      },
      {
        label: "PLANNING",
        style: "lcdp-button-primary",
        action: () => redirigerMembre("/ESPACE-MEMBRE/planning-membre.html")
      },
      {
        label: "INVITER",
        style: "lcdp-button-primary",
        action: () => ouvrirPageAbonne(etat, "INVITER", "/ESPACE-MEMBRE/inviter-membre.html")
      }
    ];

    if (!etat.abonne) {
      boutons.push({
        label: "ÊTRE INVITÉ(E)",
        style: "lcdp-button-orange",
        action: () => gererEtreInvite(etat)
      });
    }

    boutons.push(
      {
        label: "ACTUALITÉ",
        style: "lcdp-button-primary",
        action: () => redirigerPublic("/ESPACE-PUBLIC/actualite.html")
      },
      {
        label: "DÉCONNEXION",
        style: "lcdp-button-primary",
        action: gererDeconnexion
      }
    );

    boutons.forEach((configuration) => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-button " + configuration.style;
      bouton.textContent = configuration.label;

      bouton.addEventListener("click", () => {
        Promise.resolve(configuration.action()).catch((error) => {
          console.error(error);
          afficherAlerte(error.message || "Erreur technique. Merci de réessayer.").catch(console.error);
        });
      });

      liste.appendChild(bouton);
    });
  }

  async function gererValidationPresence(etat) {
    if (!etat.aReservationEnCours) {
      await afficherAlerte("Vous n'avez pas de réservation en cours");
      return;
    }

    await ouvrirDialogueBoutons({
      titre: "Valider ma présence",
      texte: "Choisissez le mode de validation.",
      boutons: [
        {
          label: "BALISER",
          valeur: "baliser",
          style: "lcdp-button-primary"
        },
        {
          label: "DÉLÉGUER",
          valeur: "deleguer",
          style: "lcdp-button-secondary"
        }
      ]
    });
  }

  async function ouvrirPageAbonne(etat, fonction, chemin) {
    if (!etat.abonne && !membreAbonne()) {
      await afficherAlerte("Vous devez être membre abonné pour utiliser la fonction " + fonction);
      return;
    }

    if (etat.abonnementSuspendu === true) {
      await gererPaiementSuspensionMembre(etat);
      return;
    }

    redirigerMembre(chemin);
  }

  async function gererEtreInvite(etat) {
    if (!etat.parrainRenseigne) {
      await afficherAlerte('Renseignez votre parrain dans la rubrique "Mes informations"');
      return;
    }

    await afficherAlerte("Votre parrain peut vous inviter depuis son espace.");
  }

  async function gererDeconnexion() {
    const confirmation = await ouvrirDialogueBoutons({
      titre: "Confirmer la déconnexion",
      texte: "Voulez-vous vous déconnecter de votre espace membre ?",
      boutons: [
        {
          label: "Confirmer",
          valeur: "confirmer",
          style: "lcdp-button-primary"
        }
      ]
    });

    if (confirmation !== "confirmer") return;

    if (!ENDPOINT_DECONNEXION_MEMBRE) {
      throw new Error("Le service de déconnexion membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_DECONNEXION_MEMBRE + "/deconnexion", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const resultat = await reponse.json().catch(() => null);

    if (!reponse.ok || !resultat || resultat.success !== true) {
      throw new Error(messageErreurApi(resultat, "Impossible de fermer la session membre."));
    }

    redirigerPublic("/ESPACE-PUBLIC/accueil-public.html");
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

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(true);
      }

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

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const footer = await chargerFragmentObjet("/BOX/02-box-footer.html");
    slot.appendChild(footer);
    appliquerRoutesSite(slot);
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

    if (!reponse.ok) {
      throw new Error("Fragment OBJET introuvable : " + chemin);
    }

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

    if (!reponse.ok) {
      throw new Error("Fragment membre introuvable : " + chemin);
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

  function redirigerMembre(chemin) {
    window.location.href = construireUrlMembre(chemin);
  }

  function redirigerPublic(chemin) {
    window.location.href = construireUrlPublic(chemin);
  }

  function redirigerConnexionMembre(motif) {
    const chemin =
      "/ESPACE-PUBLIC/connexion-membre.html" +
      "?source=" + encodeURIComponent(SOURCE_PAGE) +
      "&session=" + encodeURIComponent(motif || "inactive");

    redirigerPublic(chemin);
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }

  function nettoyerPrenom(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60);
  }

  function nettoyerEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
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

  function valeurBooleenneVraie(valeur) {
    return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
  }
})();
