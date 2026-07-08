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

    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
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

  function creerLienMenu(item, boutonBurger, navBurger, contexte) {
    if (item.action === "etre-invite") {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-box-menu-burger__button-link";
      bouton.textContent = item.label;

      bouton.addEventListener("click", () => {
        fermerMenu(boutonBurger, navBurger);

        if (typeof window.LCDP_gererEtreInviteMembre === "function") {
          window.LCDP_gererEtreInviteMembre().catch(console.error);
        }
      });

      return bouton;
    }

    if (item.action === "abonnement") {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-box-menu-burger__button-link";
      bouton.textContent = item.label;

      bouton.addEventListener("click", async () => {
        fermerMenu(boutonBurger, navBurger);
        await gererClicAbonnementBurger(contexte, boutonBurger, navBurger);
      });

      return bouton;
    }

    const lien = document.createElement("a");
    lien.className = "lcdp-box-menu-burger__link";
    lien.textContent = item.label;
    lien.href = item.espace === "membre"
      ? construireUrlMembre(item.href)
      : construireUrlPublic(item.href);

    lien.addEventListener("click", () => {
      fermerMenu(boutonBurger, navBurger);
    });

    return lien;
  }

  async function gererClicAbonnementBurger(contexte, boutonBurger, navBurger) {
    let statudaConnue = contexte && contexte.statudaConnue === true;
    let statuda = normaliserStatuda(contexte?.statuda);
    let datenext = contexte?.datenext || null;

    if (!statudaConnue) {
      const statutCharge = await chargerStatutDaDepuisIndexBurger();

      if (statutCharge && statutCharge.statudaConnue === true) {
        statudaConnue = true;
        statuda = normaliserStatuda(statutCharge.statuda);
        datenext = statutCharge.datenext || null;

        if (contexte) {
          contexte.statudaConnue = true;
          contexte.statuda = statuda;
          contexte.datenext = datenext;
        }
      }
    }

    if (statuda === "oui") {
      window.location.href = construireUrlMembre(PAGE_ABONNEMENT_MEMBRE);
      return;
    }

    if (statuda === "encours") {
      await afficherAlerteBurger("Vous avez une DA en cours.");
      return;
    }

    if (statuda === "non") {
      await afficherAlerteBurger("Vous êtes membre invité. Vous pouvez faire une DA à partir du " + formaterDateDa(datenext) + ".");
      return;
    }

    if (!statudaConnue) {
      await afficherAlerteBurger("Impossible de vérifier votre droit d'accès à l'abonnement. Merci de repasser par l'accueil membre.");
      return;
    }

    await ouvrirPremiereDaDepuisBurger(contexte, boutonBurger, navBurger);
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
        datenext: data.datenext || null
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
      statudaConnue: Object.prototype.hasOwnProperty.call(etatMembre, "statuda"),
      statuda: normaliserStatuda(etatMembre.statuda),
      datenext: etatMembre.datenext || null
    };

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/02-box-menu-burger.html");
    slot.appendChild(fragment);

    const boutonBurger = slot.querySelector("[data-lcdp-burger-button]");
    const navBurger = slot.querySelector("[data-lcdp-burger-nav]");
    const listeBurger = slot.querySelector("[data-lcdp-burger-list]");

    if (!boutonBurger || !navBurger || !listeBurger) {
      throw new Error("Structure du menu burger générique incomplète.");
    }

    fermerMenu(boutonBurger, navBurger);

    const liens = [
      {
        label: "Accueil public",
        espace: "public",
        href: "/ESPACE-PUBLIC/accueil-public.html"
      },
      {
        label: "Menu membre",
        espace: "membre",
        href: "/ESPACE-MEMBRE/accueil-membre.html"
      }
    ];

    if (!abonne) {
      liens.push({
        label: "Être invité(e)",
        action: "etre-invite"
      });
    }

    liens.push(
      {
        label: "Mes informations",
        espace: "membre",
        href: "/ESPACE-MEMBRE/mes-informations.html"
      },
      {
        label: "Mes points",
        espace: "membre",
        href: "/ESPACE-MEMBRE/mes-points.html"
      },
      {
        label: "Abonnement",
        action: "abonnement"
      },
      {
        label: "Actualité du club",
        espace: "public",
        href: "/ESPACE-PUBLIC/actualite.html"
      }
    );

    listeBurger.innerHTML = "";

    liens.forEach((item) => {
      listeBurger.appendChild(creerLienMenu(item, boutonBurger, navBurger, contexte));
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
