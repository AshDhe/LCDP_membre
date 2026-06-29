(() => {
  "use strict";

  let initialisationEnCours = null;

  const config = window.SITE_CONFIG || {};

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }

  function estUrlExterneOuAncre(chemin) {
    return (
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

    if (!valeur || estUrlExterneOuAncre(valeur)) {
      return valeur;
    }

    if (typeof config.publicUrl === "function") {
      return config.publicUrl(valeur);
    }

    return buildUrl(config.publicBaseUrl || config.PUBLIC_BASE || "", valeur);
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");

    if (!valeur || estUrlExterneOuAncre(valeur)) {
      return valeur;
    }

    if (typeof config.membreUrl === "function") {
      return config.membreUrl(valeur);
    }

    return buildUrl(config.membreBaseUrl || config.MEMBRE_BASE || config.siteBase || "", valeur);
  }

  function construireUrlObjet(chemin) {
    const valeur = String(chemin || "");

    if (!valeur || estUrlExterneOuAncre(valeur)) {
      return valeur;
    }

    if (typeof config.objetUrl === "function") {
      return config.objetUrl(valeur);
    }

    const objetBase =
      config.objetBaseUrl ||
      config.OBJET_BASE ||
      buildUrl(config.publicBaseUrl || config.PUBLIC_BASE || "", "/OBJET");

    return buildUrl(objetBase, valeur);
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

  function fermerMenu(boutonBurger, navBurger) {
    boutonBurger.setAttribute("aria-expanded", "false");
    navBurger.hidden = true;
  }

  function creerLienMenu(item, boutonBurger, navBurger) {
    const lien = document.createElement("a");
    lien.className = "lcdp-box-menu-burger__link";
    lien.textContent = item.label;

    if (item.space === "membre") {
      lien.href = construireUrlMembre(item.href);
    } else {
      lien.href = construireUrlPublic(item.href);
    }

    lien.addEventListener("click", () => {
      fermerMenu(boutonBurger, navBurger);
    });

    return lien;
  }

  async function initialiserMenuBurgerMembre() {
    const slot = document.querySelector("[data-lcdp-burger-slot]");

    if (!slot) {
      return;
    }

    if (slot.dataset.lcdpBurgerInitialise === "true") {
      return;
    }

    if (initialisationEnCours) {
      return initialisationEnCours;
    }

    initialisationEnCours = (async () => {
      slot.innerHTML = "";

      const fragment = await chargerFragmentObjet("/BOX/02-box-menu-burger.html");
      slot.appendChild(fragment);

      const boutonBurger = slot.querySelector("[data-lcdp-burger-button]");
      const navBurger = slot.querySelector("[data-lcdp-burger-nav]");
      const listeBurger = slot.querySelector("[data-lcdp-burger-list]");

      if (!boutonBurger || !navBurger || !listeBurger) {
        throw new Error("Structure du menu burger générique incomplète.");
      }

      const liensMembreNonAbonne = [
        {
          label: "Accueil",
          href: "/ESPACE-PUBLIC/accueil-public.html",
          space: "public"
        },
        {
          label: "Mon compte",
          href: "/ESPACE-MEMBRE/mon-compte-membre.html",
          space: "membre"
        },
        {
          label: "Actualité",
          href: "/ESPACE-PUBLIC/actualité.html",
          space: "public"
        },
        {
          label: "À propos",
          href: "/ESPACE-PUBLIC/la-cle-du-parc.html",
          space: "public"
        }
      ];

      liensMembreNonAbonne.forEach((item) => {
        listeBurger.appendChild(
          creerLienMenu(item, boutonBurger, navBurger)
        );
      });

      boutonBurger.addEventListener("click", () => {
        const ouvert = boutonBurger.getAttribute("aria-expanded") === "true";

        boutonBurger.setAttribute("aria-expanded", String(!ouvert));
        navBurger.hidden = ouvert;
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

      slot.dataset.lcdpBurgerInitialise = "true";
    })();

    try {
      await initialisationEnCours;
    } finally {
      initialisationEnCours = null;
    }
  }

  window.LCDP_initialiserMenuBurgerMembre = initialiserMenuBurgerMembre;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initialiserMenuBurgerMembre().catch(console.error);
    });
  } else {
    initialiserMenuBurgerMembre().catch(console.error);
  }
})();