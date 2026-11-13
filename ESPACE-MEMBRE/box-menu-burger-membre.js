(() => {
  "use strict";

  const CONFIG_BURGER_MEMBRE = window.SITE_CONFIG || {};
  const PAGE_ABONNEMENT_MEMBRE = "/ESPACE-MEMBRE/abonnement-membre.html";
  const ENDPOINT_INDEX_MEMBRE = construireEndpointApiBurger(
    "workerIndexMembreUrl",
    "WORKER_INDEX_MEMBRE_URL",
    "W_INDEX_MEMBRE_URL",
    "index-membre-api"
  );
  const ENDPOINT_DA_MEMBRE = construireEndpointApiBurger(
    "workerDaMembreUrl",
    "WORKER_DA_MEMBRE_URL",
    "",
    "da-membre-api"
  );
  const ENDPOINT_DECONNEXION_MEMBRE = construireEndpointApiBurger(
    "",
    "W_DECONNEXION_URL",
    "",
    "deconnexion-membre-api"
  );

  const comptesPublicsBurgerMembre = {
    membre: {
      label: "Espace MEMBRE",
      cheminConnexion: "/ESPACE-PUBLIC/connexion-membre.html?source=menu-mon-compte"
    },
    parc: {
      label: "Espace PARC",
      cheminConnexion: "/ESPACE-PUBLIC/connexion-parc.html?source=menu-mon-compte"
    },
    coach: {
      label: "Espace COACH",
      cheminConnexion: "/ESPACE-PUBLIC/connexion-coach.html?source=menu-mon-compte"
    }
  };


  function construireEndpointApiBurger(cleModerne, cleLegacy, cleCourte, sousDomaineWorker) {
    const depuisConfig =
      (cleModerne ? CONFIG_BURGER_MEMBRE?.[cleModerne] : "") ||
      (cleLegacy ? CONFIG_BURGER_MEMBRE?.[cleLegacy] : "") ||
      (cleCourte ? CONFIG_BURGER_MEMBRE?.[cleCourte] : "") ||
      "";

    if (depuisConfig) return String(depuisConfig).replace(/\/+$/, "");

    if (typeof CONFIG_BURGER_MEMBRE.apiUrl === "function") {
      return CONFIG_BURGER_MEMBRE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    }

    return "";
  }

  function construireUrlPublic(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlPublic === "function") return window.LCDP_urlPublic(valeur);
    if (typeof CONFIG_BURGER_MEMBRE.publicUrl === "function") return CONFIG_BURGER_MEMBRE.publicUrl(valeur);

    return buildUrl(CONFIG_BURGER_MEMBRE.publicBaseUrl || CONFIG_BURGER_MEMBRE.PUBLIC_BASE || "", valeur);
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlMembre === "function") return window.LCDP_urlMembre(valeur);
    if (typeof CONFIG_BURGER_MEMBRE.membreUrl === "function") return CONFIG_BURGER_MEMBRE.membreUrl(valeur);

    return buildUrl(
      CONFIG_BURGER_MEMBRE.membreBaseUrl ||
      CONFIG_BURGER_MEMBRE.MEMBRE_BASE ||
      CONFIG_BURGER_MEMBRE.siteBase ||
      "",
      valeur
    );
  }

  function construireUrlObjet(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlObjet === "function") return window.LCDP_urlObjet(valeur);
    if (typeof CONFIG_BURGER_MEMBRE.objetUrl === "function") return CONFIG_BURGER_MEMBRE.objetUrl(valeur);

    const objetBase =
      CONFIG_BURGER_MEMBRE.objetBaseUrl ||
      CONFIG_BURGER_MEMBRE.OBJET_BASE ||
      buildUrl(CONFIG_BURGER_MEMBRE.publicBaseUrl || CONFIG_BURGER_MEMBRE.PUBLIC_BASE || "", "/OBJET");

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

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }

  function construireUrlConnexionBurger(compte) {
    const configuration = comptesPublicsBurgerMembre[compte];

    if (!configuration) {
      return construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html?source=menu-mon-compte");
    }

    return construireUrlPublic(configuration.cheminConnexion);
  }

  function obtenirWorkerUserRouteurUrlBurger() {
    if (CONFIG_BURGER_MEMBRE.workerUserRouteurUrl) {
      return String(CONFIG_BURGER_MEMBRE.workerUserRouteurUrl).replace(/\/+$/, "");
    }

    if (CONFIG_BURGER_MEMBRE.WORKER_USER_ROUTEUR_URL) {
      return String(CONFIG_BURGER_MEMBRE.WORKER_USER_ROUTEUR_URL).replace(/\/+$/, "");
    }

    if (typeof CONFIG_BURGER_MEMBRE.apiUrl === "function") {
      return String(CONFIG_BURGER_MEMBRE.apiUrl("user-routeur-api") || "").replace(/\/+$/, "");
    }

    return "";
  }

  function messageErreurApiBurger(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
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

  function chargerScriptMembreUneFois(chemin, options = {}) {
    const src = construireUrlMembre(chemin);
    const forcer = options.forcer === true;
    const scriptExistant = document.querySelector(`script[data-lcdp-script-membre="${chemin}"]`);

    if (scriptExistant && !forcer) {
      return Promise.resolve();
    }

    if (scriptExistant && forcer) {
      scriptExistant.remove();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = forcer ? ajouterParametreCacheDa(src) : src;
      script.defer = true;
      script.dataset.lcdpScriptMembre = chemin;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Script membre introuvable : " + chemin));
      document.body.appendChild(script);
    });
  }

  function ajouterParametreCacheDa(src) {
    try {
      const url = new URL(src, window.location.href);
      url.searchParams.set("lcdp_da", String(Date.now()));
      return url.toString();
    } catch (_error) {
      const separateur = String(src || "").includes("?") ? "&" : "?";
      return String(src || "") + separateur + "lcdp_da=" + Date.now();
    }
  }

  function normaliserStatuda(value) {
    const statut = String(value || "").trim().toLowerCase();

    return ["encours", "oui", "non"].includes(statut) ? statut : null;
  }

  function formaterDateDa(value) {
    if (!value) return "une date communiquée par le club";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

    return date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function dateDaAtteinteBurger(value) {
    if (!value) return false;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;

    return date.getTime() <= Date.now();
  }

  function normaliserStatutabo(value) {
    const statut = String(value || "").trim().toLowerCase();

    return ["paye", "impaye", "cree", "cancd"].includes(statut) ? statut : "";
  }

  function dateIsoDepuisValeurBurger(value) {
    const texte = String(value || "").trim();
    const match = texte.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      return match[1] + "-" + match[2] + "-" + match[3];
    }

    const date = new Date(texte);

    if (Number.isNaN(date.getTime())) return "";

    return dateIsoParisBurger(date);
  }

  function dateIsoParisBurger(date) {
    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const valeur = (type) => morceaux.find((item) => item.type === type)?.value || "";

    return valeur("year") + "-" + valeur("month") + "-" + valeur("day");
  }

  function dateIsoAujourdhuiParisBurger() {
    return dateIsoParisBurger(new Date());
  }

  function obtenirEtatAffichageInviterBurger(source) {
    const statutabo = normaliserStatutabo(source?.statutabo || source?.statutAbo || "");
    const fin = dateIsoDepuisValeurBurger(source?.fin || source?.finabo || source?.dateFin || source?.datefin || "");
    const aujourdHui = dateIsoAujourdhuiParisBurger();

    if (!statutabo || !fin) {
      return { visible: false };
    }

    if (statutabo === "paye" && fin >= aujourdHui) {
      return {
        visible: true,
        actif: true,
        label: "Inviter",
        statutabo,
        fin
      };
    }

    if (statutabo === "impaye" && fin >= aujourdHui) {
      return {
        visible: true,
        actif: false,
        label: "Inviter (suspendu : abonnement à payer)",
        message: "Abonnement suspendu. Vous ne pouvez pas inviter de membre.",
        peutPayer: true,
        italique: true,
        statutabo,
        fin
      };
    }

    if (statutabo === "cree" && fin >= aujourdHui) {
      return {
        visible: true,
        actif: false,
        label: "Inviter (inactif : abonnement à payer)",
        message: "Abonnement inactif. Vous ne pouvez pas inviter de membre.",
        peutPayer: true,
        italique: false,
        statutabo,
        fin
      };
    }

    if (statutabo === "cancd" && fin === aujourdHui) {
      return {
        visible: true,
        actif: false,
        label: "Inviter (inactif : abonnement annulé)",
        message: "Abonnement inactif. Vous ne pouvez pas inviter de membre.",
        peutPayer: false,
        italique: false,
        statutabo,
        fin
      };
    }

    return { visible: false };
  }

  function extraireDonneesInviterBurger(source) {
    const donnees = source && typeof source === "object" ? source : {};
    const abonnement = trouverAbonnementInviterBurger(donnees);
    const cible = abonnement || donnees;

    return {
      statutabo: normaliserStatutabo(
        cible.statutabo ||
        cible.statutAbo ||
        cible.statutabonnement ||
        cible.statutAbonnement ||
        ""
      ),
      fin: cible.fin || cible.finabo || cible.dateFin || cible.datefin || ""
    };
  }

  function trouverAbonnementInviterBurger(donnees) {
    const candidats = [];

    [
      donnees.abonnementEnCours,
      donnees.abonnementActuel,
      donnees.abonnement,
      donnees.abo
    ].forEach((item) => {
      if (item && typeof item === "object") candidats.push(item);
    });

    if (Array.isArray(donnees.abonnements)) {
      donnees.abonnements.forEach((item) => {
        if (item && typeof item === "object") candidats.push(item);
      });
    }

    let meilleur = null;
    let prioriteMeilleur = 99;

    candidats.forEach((item) => {
      const etat = obtenirEtatAffichageInviterBurger(item);

      if (!etat.visible) return;

      const priorite = etat.actif
        ? 1
        : etat.statutabo === "impaye"
          ? 2
          : etat.statutabo === "cree"
            ? 3
            : 4;

      if (priorite < prioriteMeilleur) {
        meilleur = item;
        prioriteMeilleur = priorite;
      }
    });

    return meilleur;
  }

  function creerItemInviterBurger(contexte) {
    const etatInviter = obtenirEtatAffichageInviterBurger(contexte);

    if (!etatInviter.visible) return null;

    return {
      label: etatInviter.label,
      action: "inviter",
      etatInviter,
      italique: etatInviter.italique === true
    };
  }

  async function completerContexteInviterBurger(contexte) {
    if (!contexte) return;

    if (normaliserStatutabo(contexte.statutabo) && dateIsoDepuisValeurBurger(contexte.fin)) {
      return;
    }

    const donnees = await chargerDonneesInviterDepuisIndexBurger();

    if (!donnees) return;

    contexte.statutabo = donnees.statutabo || contexte.statutabo || "";
    contexte.fin = donnees.fin || contexte.fin || "";
  }

  async function chargerDonneesInviterDepuisIndexBurger() {
    if (!ENDPOINT_INDEX_MEMBRE) return null;

    try {
      const reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || data.success !== true || data.connected !== true) {
        return null;
      }

      return extraireDonneesInviterBurger(data);
    } catch (error) {
      console.error("Erreur vérification invitation burger :", error);
      return null;
    }
  }

  function obtenirLightboxSlotBurger() {
    let slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      slot = document.createElement("div");
      slot.id = "lcdp-lightbox-slot";
      document.body.appendChild(slot);
    }

    return slot;
  }

  async function afficherAlerteBurger(message, options = {}) {
    const container = document.createElement("div");
    container.className = "lcdp-burger-alerte";
    document.body.appendChild(container);

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-alerte.html");
    container.appendChild(fragment);

    const alerte = container.querySelector("[data-lcdp-box-alerte]");
    const texte = container.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = container.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = container.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      container.remove();
      alert(message || "");
      return true;
    }

    texte.textContent = message || "";
    boutonOk.textContent = options.boutonOk || "OK";

    const boutonActionConfiguration = options.boutonAction && typeof options.boutonAction === "object"
      ? options.boutonAction
      : null;
    let boutonAction = null;

    if (boutonActionConfiguration) {
      boutonAction = document.createElement("button");
      boutonAction.type = "button";
      boutonAction.className = "lcdp-button " + (boutonActionConfiguration.style || "lcdp-button-mini");
      boutonAction.textContent = boutonActionConfiguration.label || "Payer";

      const zoneActions = boutonOk.parentElement || texte.parentElement || alerte;

      if (boutonOk.parentElement === zoneActions) {
        zoneActions.insertBefore(boutonAction, boutonOk);
      } else {
        zoneActions.appendChild(boutonAction);
      }
    }

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        container.remove();
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fermer(false);
      });
      boutonOk.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fermer(true);
      });
      if (boutonAction) {
        boutonAction.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          fermer("action");

          if (typeof boutonActionConfiguration.action === "function") {
            boutonActionConfiguration.action();
          }
        });
      }
      alerte.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.target === alerte) fermer(false);
      });
    });
  }

  function ouvrirMenu(boutonBurger, navBurger) {
    boutonBurger.setAttribute("aria-expanded", "true");
    navBurger.hidden = false;
    navBurger.removeAttribute("hidden");
  }

  function fermerMenu(boutonBurger, navBurger) {
    boutonBurger.setAttribute("aria-expanded", "false");
    navBurger.hidden = true;
    navBurger.setAttribute("hidden", "");
  }

  function basculerMenu(boutonBurger, navBurger) {
    const ouvert = boutonBurger.getAttribute("aria-expanded") === "true";

    if (ouvert) {
      fermerMenu(boutonBurger, navBurger);
      return;
    }

    ouvrirMenu(boutonBurger, navBurger);
  }

  function lireCookie(nom) {
    if (typeof window.LCDP_lireCookie === "function") {
      return window.LCDP_lireCookie(nom);
    }

    const valeur = document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(nom + "="))
      ?.split("=")
      .slice(1)
      .join("=") || "";

    try {
      return decodeURIComponent(valeur);
    } catch {
      return valeur;
    }
  }

  function membreAbonneDepuisCookie() {
    if (typeof window.LCDP_membreAbonne === "function") {
      return window.LCDP_membreAbonne() === true;
    }

    return Boolean(lireCookie("abonne"));
  }

  function valeurBooleenneVraie(valeur) {
    return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
  }

  function creerBoutonActionMenu(label, action, options = {}) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-box-menu-burger__button-link";
    bouton.textContent = label;

    if (options.italique === true) {
      bouton.classList.add("lcdp-text-italic");
    }

    bouton.addEventListener("click", action);
    return bouton;
  }

  // Spinner de navigation : même dessin SVG que le chargement de Mon compte.
  // Aucun nouveau fichier CSS ; l'overlay ne s'applique qu'à une vraie navigation.
  function afficherAttenteNavigationBurger() {
    const existant = document.getElementById("lcdp-burger-attente-navigation");
    if (existant) return existant;

    const attente = document.createElement("div");
    attente.id = "lcdp-burger-attente-navigation";
    attente.setAttribute("role", "status");
    attente.setAttribute("aria-label", "Chargement de la page");
    attente.style.cssText = "position:fixed;inset:0;z-index:2147483646;" +
      "display:flex;align-items:center;justify-content:center;background:#fff;";

    const spinner = document.createElement("div");
    spinner.className = "lcdp-loading-spinner";
    spinner.setAttribute("aria-hidden", "true");
    spinner.style.cssText = "position:relative;display:flex;align-items:center;" +
      "justify-content:center;box-sizing:border-box;width:64px;height:64px;";

    const namespaceSvg = "http://www.w3.org/2000/svg";
    const creerAnneau = (classe, couleur, pointille = false) => {
      const svg = document.createElementNS(namespaceSvg, "svg");
      svg.setAttribute("viewBox", "0 0 36 36");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("class", classe);
      svg.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;color:" + couleur + ";";
      const cercle = document.createElementNS(namespaceSvg, "circle");
      cercle.setAttribute("cx", "18");
      cercle.setAttribute("cy", "18");
      cercle.setAttribute("r", "16");
      cercle.setAttribute("fill", "none");
      cercle.setAttribute("stroke", "currentColor");
      cercle.setAttribute("stroke-width", "3");
      cercle.setAttribute("stroke-linecap", "round");
      if (pointille) {
        cercle.setAttribute("stroke-dasharray", "100");
        cercle.setAttribute("stroke-dashoffset", "75");
      }
      svg.appendChild(cercle);
      return svg;
    };

    spinner.appendChild(creerAnneau("lcdp-loading-spinner__track", "rgba(6,95,70,.10)"));
    const arc = creerAnneau("lcdp-loading-spinner__arc", "#e59834", true);
    arc.style.transformOrigin = "center";
    spinner.appendChild(arc);
    const point = document.createElement("span");
    point.className = "lcdp-loading-spinner__dot";
    point.style.cssText = "width:8px;height:8px;border-radius:50%;background:#4e6838;";
    spinner.appendChild(point);
    attente.appendChild(spinner);
    document.body.appendChild(attente);

    // Web Animations : pas de nouvelle feuille CSS ni de keyframe globale.
    const mouvementReduit = typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!mouvementReduit && typeof arc.animate === "function") {
      arc.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: 800, iterations: Infinity, easing: "linear" }
      );
    }
    return attente;
  }

  function naviguerAvecSpinnerBurger(destination) {
    if (!destination) return;
    let url;
    try {
      url = new URL(destination, window.location.href);
    } catch (_error) {
      window.location.href = destination;
      return;
    }
    if (!/^(https?:)$/.test(url.protocol)) {
      window.location.href = destination;
      return;
    }
    if (url.href === window.location.href) return;

    afficherAttenteNavigationBurger();
    // Laisser au navigateur une occasion de peindre le spinner avant la navigation.
    window.setTimeout(() => {
      window.location.assign(url.href);
    }, 50);
  }

  // Un retour depuis le cache arrière du navigateur ne doit pas conserver le masque.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) document.getElementById("lcdp-burger-attente-navigation")?.remove();
  });

  function creerLienMenu(item, boutonBurger, navBurger, contexte) {
    if (item.action === "etre-invite") {
      return creerBoutonActionMenu(item.label, () => {
        fermerMenu(boutonBurger, navBurger);

        if (typeof window.LCDP_gererEtreInviteMembre === "function") {
          window.LCDP_gererEtreInviteMembre().catch(console.error);
        }
      });
    }

    if (item.action === "inviter") {
      return creerBoutonActionMenu(item.label, () => {
        fermerMenu(boutonBurger, navBurger);
        gererClicInviterBurger(contexte, item.etatInviter).catch((error) => {
          console.error(error);
          afficherAlerteBurger(error.message || "Erreur technique. Merci de réessayer.").catch(console.error);
        });
      }, { italique: item.italique === true });
    }

    if (item.action === "abonnement") {
      return creerBoutonActionMenu(item.label, () => {
        fermerMenu(boutonBurger, navBurger);
        gererClicAbonnementBurger(contexte, boutonBurger, navBurger).catch((error) => {
          console.error(error);
          afficherAlerteBurger(error.message || "Erreur technique. Merci de réessayer.").catch(console.error);
        });
      });
    }

    if (item.action === "changer-compte") {
      return creerBoutonActionMenu(item.label, () => {
        fermerMenu(boutonBurger, navBurger);
        ouvrirDialogueChangerCompteBurger().catch((error) => {
          console.error("Erreur dialogue changement de compte :", error);
          naviguerAvecSpinnerBurger(construireUrlConnexionBurger("membre"));
        });
      });
    }

    if (item.action === "deconnexion") {
      return creerBoutonActionMenu(item.label, () => {
        fermerMenu(boutonBurger, navBurger);
        gererDeconnexionBurger().catch((error) => {
          console.error(error);
          afficherAlerteBurger(error.message || "Erreur technique. Merci de réessayer.").catch(console.error);
        });
      });
    }

    const lien = document.createElement("a");
    lien.className = "lcdp-box-menu-burger__link";
    if (item.label === "Mon compte") {
      lien.setAttribute("data-lcdp-menu-compte", "");
    } else if (item.label === "FAQ") {
      lien.setAttribute("data-lcdp-menu-faq", "");
    }
    lien.textContent = item.label;
    lien.href = item.espace === "membre"
      ? construireUrlMembre(item.href)
      : construireUrlPublic(item.href);

    lien.addEventListener("click", (event) => {
      fermerMenu(boutonBurger, navBurger);
      // Conserver le comportement natif des nouveaux onglets et raccourcis clavier.
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
          event.metaKey || event.shiftKey || event.altKey ||
          (lien.target && lien.target !== "_self") || lien.hasAttribute("download")) {
        return;
      }
      const destination = new URL(lien.href, window.location.href);
      if (destination.href === window.location.href) return;
      event.preventDefault();
      naviguerAvecSpinnerBurger(destination.href);
    });

    return lien;
  }

  function suspensionPourNonPaiementBurger(contexte) {
    return Boolean(
      contexte &&
      contexte.abonnementSuspendu === true &&
      contexte.paiementSuspension
    );
  }

  async function redirigerVersAbonnementPourRegularisationBurger() {
    const ok = await afficherAlerteBurger("Votre abonnement est suspendu (non payé). Vous allez être redirigé vers la page d’abonnement.");

    if (!ok) return;

    naviguerAvecSpinnerBurger(construireUrlMembre(PAGE_ABONNEMENT_MEMBRE));
  }

  async function gererClicInviterBurger(contexte, etatInviter = null) {
    const etat = etatInviter || obtenirEtatAffichageInviterBurger(contexte);

    if (!etat.visible) return;

    if (etat.actif === true) {
      naviguerAvecSpinnerBurger(construireUrlMembre("/ESPACE-MEMBRE/inviter-membre.html"));
      return;
    }

    await afficherAlerteInviterBloqueBurger(etat);
  }

  async function afficherAlerteInviterBloqueBurger(etatInviter) {
    const options = {};

    if (etatInviter?.peutPayer === true) {
      options.boutonAction = {
        label: "Payer",
        style: "lcdp-button-mini lcdp-button-mini-orange",
        action: ouvrirPageAbonnementBurgerNouvelOnglet
      };
    }

    await afficherAlerteBurger(
      etatInviter?.message || "Abonnement inactif. Vous ne pouvez pas inviter de membre.",
      options
    );
  }

  function ouvrirPageAbonnementBurgerNouvelOnglet() {
    window.open(construireUrlMembre(PAGE_ABONNEMENT_MEMBRE), "_blank", "noopener");
  }

  async function ouvrirDialogueBoutonsBurger(options) {
    const slot = obtenirLightboxSlotBurger();
    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-dialogue-bouton.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = slot.querySelector("[data-lcdp-dialogue-title]");
    const texte = slot.querySelector("[data-lcdp-dialogue-text]");
    const actions = slot.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      slot.innerHTML = "";
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

        bouton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          fermer(configuration.valeur || configuration.label || true);
        });

        actions.appendChild(bouton);
      });

      boutonFermer.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fermer(null);
      });

      dialogue.addEventListener("click", (event) => {
        event.stopPropagation();
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

  async function redirigerCompteBurger(compte) {
    const workerUrl = obtenirWorkerUserRouteurUrlBurger();

    if (!workerUrl) {
      naviguerAvecSpinnerBurger(construireUrlConnexionBurger(compte));
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
        naviguerAvecSpinnerBurger(data.redirectUrl);
        return;
      }

      naviguerAvecSpinnerBurger(construireUrlConnexionBurger(compte));

    } catch (error) {
      console.error("Erreur routeur utilisateur :", error);
      naviguerAvecSpinnerBurger(construireUrlConnexionBurger(compte));
    }
  }

  async function ouvrirDialogueChangerCompteBurger() {
    const confirmation = await ouvrirDialogueBoutonsBurger({
      titre: "Espace connecté",
      texte: "Choisissez votre espace",
      boutons: Object.entries(comptesPublicsBurgerMembre).map(([compte, configuration]) => ({
        label: configuration.label,
        valeur: compte,
        style: "lcdp-button-compte lcdp-button-compte--" + compte
      }))
    });

    if (!confirmation) return;

    await redirigerCompteBurger(confirmation);
  }

  async function confirmerDeconnexionBurger() {
    const cheminCss = "/CSSBASE/lcdp-lightbox-convergence.css";
    const hrefCss = construireUrlObjet(cheminCss);
    if (!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => link.href === hrefCss)) {
      await new Promise((resolve, reject) => {
        const lien = document.createElement("link");
        lien.rel = "stylesheet";
        lien.href = hrefCss;
        lien.onload = resolve;
        lien.onerror = () => {
          lien.remove();
          reject(new Error("CSS CHOIX indisponible."));
        };
        document.head.appendChild(lien);
      });
    }
    const slot = obtenirLightboxSlotBurger();
    slot.replaceChildren();
    try {
      slot.appendChild(await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-choix.html"));
      const dialogue = slot.querySelector('[data-lcdp-dialogue-reference="choix"]');
      const titre = slot.querySelector("[data-lcdp-dialogue-titre]");
      const texte = slot.querySelector("[data-lcdp-dialogue-message]");
      const annuler = slot.querySelector('[data-lcdp-dialogue-action="annuler"]');
      const confirmer = slot.querySelector('[data-lcdp-dialogue-action="confirmer"]');
      if (!dialogue || !titre || !texte || !annuler || !confirmer) throw new Error("Structure CHOIX incomplète.");
      titre.textContent = "Confirmer la déconnexion";
      texte.textContent = "Voulez-vous vous déconnecter de votre espace membre ?";
      annuler.textContent = "Annuler";
      confirmer.textContent = "Confirmer";
      return await new Promise(resolve => {
        let resolu = false;
        const fermer = valeur => {
          if (resolu) return;
          resolu = true;
          slot.replaceChildren();
          resolve(valeur);
        };
        annuler.addEventListener("click", () => fermer(false), { once: true });
        confirmer.addEventListener("click", () => fermer(true), { once: true });
        dialogue.addEventListener("click", event => {
          if (event.target === dialogue) fermer(false);
        });
        const gererEchap = event => {
          if (event.key === "Escape") fermer(false);
        };
        document.addEventListener("keydown", gererEchap, { once: true });
        confirmer.focus();
      });
    } catch (erreur) {
      slot.replaceChildren();
      throw erreur;
    }
  }

  async function gererDeconnexionBurger() {
    const confirmation = await confirmerDeconnexionBurger();
    if (confirmation !== true) return;

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
      throw new Error(messageErreurApiBurger(resultat, "Impossible de fermer la session membre."));
    }

    naviguerAvecSpinnerBurger(construireUrlPublic("/ESPACE-PUBLIC/accueil-public.html"));
  }

  // Calcule l'échéance à trois mois calendaires de la date de la DA.
  // Une date absente ou non interprétable ne permet pas de conclure à son ancienneté.
  function daNonValideeDepuisTroisMoisBurger(dateda) {
    const valeur = dateIsoDepuisValeurBurger(dateda);
    if (!valeur) return false;
    const [annee, mois, jour] = valeur.split("-").map(Number);
    const debut = new Date(Date.UTC(annee, mois - 1, jour));
    if (debut.getUTCFullYear() !== annee || debut.getUTCMonth() !== mois - 1 || debut.getUTCDate() !== jour) {
      return false;
    }
    const anneeEcheance = annee + Math.floor((mois - 1 + 3) / 12);
    const moisEcheance = (mois - 1 + 3) % 12;
    const dernierJour = new Date(Date.UTC(anneeEcheance, moisEcheance + 1, 0)).getUTCDate();
    const echeance = [anneeEcheance, String(moisEcheance + 1).padStart(2, "0"), String(Math.min(jour, dernierJour)).padStart(2, "0")].join("-");
    return dateIsoAujourdhuiParisBurger() > echeance;
  }

  async function gererClicAbonnementBurger(contexte, boutonBurger, navBurger) {
    let statudaConnue = contexte?.statudaConnue === true;
    let statuda = normaliserStatuda(contexte?.statuda);
    let datenext = contexte?.datenext || null;
    let dateda = contexte?.dateda || null;
    let daactive = contexte?.daactive === true ? true : contexte?.daactive === false ? false : null;

    // Le contexte du Worker fait autorité, lorsqu'il est disponible.
    const contexteDa = await chargerContexteDaBurger();
    if (contexteDa?.statudaConnue === true) {
      statudaConnue = true;
      statuda = normaliserStatuda(contexteDa.statuda);
      datenext = contexteDa.datenext || null;
      dateda = contexteDa.dateda || null;
      daactive = contexteDa.daactive;
    } else if (!statudaConnue) {
      const statutCharge = await chargerStatutDaDepuisIndexBurger();
      if (statutCharge?.statudaConnue === true) {
        statudaConnue = true;
        statuda = normaliserStatuda(statutCharge.statuda);
        datenext = statutCharge.datenext || null;
        dateda = statutCharge.dateda || null;
        daactive = statutCharge.daactive;
      }
    }

    if (contexte) {
      Object.assign(contexte, { statudaConnue, statuda, datenext, dateda, daactive });
    }

    const reserver = () => {
      naviguerAvecSpinnerBurger(construireUrlMembre("/ESPACE-MEMBRE/reserver-membre.html"));
    };

    if (!statudaConnue) {
      await afficherAlerteBurger("Impossible de vérifier votre situation de DA pour le moment.");
      return;
    }

    if (statuda === "oui") {
      await afficherAlerteBurger("Prendre un nouvel abonnement ?", {
        boutonAction: { label: "M'abonner", style: "lcdp-button-mini lcdp-button-mini-orange", action: reserver }
      });
      return;
    }

    if (statuda === "encours" || statuda === "non") {
      if (!dateIsoDepuisValeurBurger(dateda)) {
        await afficherAlerteBurger("Impossible de vérifier la date de votre DA pour le moment.");
        return;
      }
      if (daNonValideeDepuisTroisMoisBurger(dateda)) {
        await ouvrirPremiereDaDepuisBurger(contexte, boutonBurger, navBurger);
      } else {
        await afficherAlerteBurger("Vous ne pouvez pas vous abonner pour le moment. Demandez à être invité(e).", {
          boutonAction: { label: "Être invité(e)", style: "lcdp-button-mini lcdp-button-mini-orange", action: reserver }
        });
      }
      return;
    }

    // Aucune DA enregistrée : ouverture du parcours existant.
    if (!statuda) {
      if (daactive === false && datenext && !dateDaAtteinteBurger(datenext)) {
        await afficherAlerteBurger("Vous pouvez transmettre votre DA à partir du " + formaterDateDa(datenext) + ".");
        return;
      }
      await ouvrirPremiereDaDepuisBurger(contexte, boutonBurger, navBurger);
    }
  }

  async function chargerContexteDaBurger() {
    if (!ENDPOINT_DA_MEMBRE) return null;

    try {
      const reponse = await fetch(ENDPOINT_DA_MEMBRE + "/contexte", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || !(data.ok === true || data.success === true)) {
        return null;
      }

      return {
        statudaConnue: Object.prototype.hasOwnProperty.call(data, "statuda"),
        statuda: normaliserStatuda(data.statuda),
        datenext: data.datenext || null,
        dateda: data.dateda || null,
        daactive: data.daactive === true
          ? true
          : data.daactive === false
            ? false
            : null
      };
    } catch (error) {
      console.error("Erreur vérification DA burger :", error);
      return null;
    }
  }

  async function chargerStatutDaDepuisIndexBurger() {
    if (!ENDPOINT_INDEX_MEMBRE) return null;

    try {
      const reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || data.success !== true || data.connected !== true) {
        return null;
      }

      return {
        statudaConnue: Object.prototype.hasOwnProperty.call(data, "statuda"),
        statuda: normaliserStatuda(data.statuda),
        datenext: data.datenext || null,
        dateda: data.dateda || null,
        daactive: data.daactive === true ? true : data.daactive === false ? false : null
      };
    } catch (error) {
      console.error("Erreur vérification DA burger :", error);
      return null;
    }
  }

  async function ouvrirPremiereDaDepuisBurger(contexte, boutonBurger, navBurger) {
    try {
      if (typeof window.LCDP_ouvrirPremiereDaMembre !== "function") {
        await chargerScriptMembreUneFois("/ESPACE-MEMBRE/da-membre.js", { forcer: true });
      }

      if (typeof window.LCDP_ouvrirPremiereDaMembre !== "function") {
        throw new Error("Module DA membre introuvable.");
      }

      await window.LCDP_ouvrirPremiereDaMembre({
        contexte,
        onStatudaChange: (donnees = {}) => {
          if (!contexte) return;
          contexte.statudaConnue = true;
          contexte.statuda = normaliserStatuda(donnees.statuda);
          contexte.datenext = donnees.datenext || contexte.datenext || null;

          if (donnees.daactive === true || donnees.daactive === false) {
            contexte.daactive = donnees.daactive;
          }
        },
        onTerminee: () => {
          ouvrirMenu(boutonBurger, navBurger);
        }
      });
    } catch (error) {
      console.error("Erreur ouverture DA membre :", error);
      await afficherAlerteBurger(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function initialiserMenuBurgerMembre(options = {}) {
    const slot = document.querySelector("[data-lcdp-burger-slot]");

    if (!slot) return;

    const etatMembre = options.etatMembre || {};
    const abonne = Object.prototype.hasOwnProperty.call(etatMembre, "abonne")
      ? valeurBooleenneVraie(etatMembre.abonne)
      : membreAbonneDepuisCookie();
    const contexte = {
      abonne,
      abonnementSuspendu: valeurBooleenneVraie(etatMembre.abonnementSuspendu || etatMembre.suspendu),
      paiementSuspension: etatMembre.paiementSuspension || etatMembre.paiementRegularisation || null,
      statutabo: normaliserStatutabo(etatMembre.statutabo || etatMembre.statutAbo || ""),
      fin: etatMembre.fin || etatMembre.finabo || etatMembre.dateFin || etatMembre.datefin || "",
      statudaConnue: Object.prototype.hasOwnProperty.call(etatMembre, "statuda"),
      statuda: normaliserStatuda(etatMembre.statuda),
      datenext: etatMembre.datenext || null,
      dateda: etatMembre.dateda || null,
      daactive: etatMembre.daactive === true
        ? true
        : etatMembre.daactive === false
          ? false
          : null
    };

    await completerContexteInviterBurger(contexte);

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/HTMLBASE/02-menu-burger.html");
    slot.appendChild(fragment);

    const boutonBurger = slot.querySelector("[data-lcdp-burger-button]");
    const navBurger = slot.querySelector("[data-lcdp-burger-nav]");
    const listeBurger = slot.querySelector("[data-lcdp-burger-list]");

    if (!boutonBurger || !navBurger || !listeBurger) {
      throw new Error("Structure du menu burger générique incomplète.");
    }

    fermerMenu(boutonBurger, navBurger);

    // Le thème c038 est celui du burger public ; il ne porte que sur ce composant.
    const codesCss = new Set((document.documentElement.getAttribute("data-lcdp-css") || "").split(/\s+/).filter(Boolean));
    if (!codesCss.has("c038")) {
      codesCss.add("c038");
      document.documentElement.setAttribute("data-lcdp-css", Array.from(codesCss).join(" "));
    }
    const racineBurger = navBurger.closest(".lcdp-box-menu-burger");
    if (racineBurger) racineBurger.classList.add("lcdp-box-menu-burger--membre");

    const liens = [
      {
        label: "Accueil espace membre",
        roleGraphique: "accueil",
        espace: "membre",
        href: "/ESPACE-MEMBRE/accueil-membre.html"
      },
      {
        label: "Mon compte",
        roleGraphique: "compte",
        espace: "membre",
        href: "/ESPACE-MEMBRE/mes-informations.html"
      }
    ];

    liens.push(
      {
        label: "Abonnement",
        action: "abonnement"
      },
      {
        label: "Inviter",
        espace: "membre",
        href: "/ESPACE-MEMBRE/planning-membre.html"
      },
      {
        label: "Actualité",
        espace: "public",
        href: "/ESPACE-PUBLIC/actualite.html"
      },
      {
        label: "Le club",
        espace: "public",
        href: "/ESPACE-PUBLIC/le-club.html?source=menu-burger-membre"
      },
      {
        label: "FAQ",
        roleGraphique: "faq",
        espace: "membre",
        href: "/ESPACE-MEMBRE/FAQ-membre.html?source=menu-burger-membre"
      },
      {
        label: "Bénévolat",
        espace: "public",
        href: "/ESPACE-PUBLIC/benevolat.html?source=menu-burger-membre"
      },
      {
        label: "Galerie",
        espace: "public",
        href: "/ESPACE-PUBLIC/galerie.html?source=menu-burger-membre"
      },
      {
        label: "Témoignages",
        espace: "public",
        href: "/ESPACE-PUBLIC/temoignages.html?source=menu-burger-membre"
      },
      {
        label: "Changer d'espace personnel",
        action: "changer-compte"
      },
      {
        label: "Déconnexion",
        action: "deconnexion"
      }
    );

    listeBurger.innerHTML = "";

    liens.forEach((item) => {
      const element = creerLienMenu(item, boutonBurger, navBurger, contexte);
      element.dataset.lcdpMenuRole = item.roleGraphique || "standard";
      listeBurger.appendChild(element);
    });

    boutonBurger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      basculerMenu(boutonBurger, navBurger);
    });

    navBurger.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", (event) => {
      if (!slot.contains(event.target)) {
        fermerMenu(boutonBurger, navBurger);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        fermerMenu(boutonBurger, navBurger);
      }
    });
  }

  window.LCDP_initialiserMenuBurgerMembre = initialiserMenuBurgerMembre;
})();
