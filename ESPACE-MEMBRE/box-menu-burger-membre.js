(() => {
  "use strict";

  let initialisationEnCours = null;

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
    if (typeof window.SITE_CONFIG?.publicUrl === "function") return window.SITE_CONFIG.publicUrl(valeur);

    return buildUrl(window.SITE_CONFIG?.publicBaseUrl || window.SITE_CONFIG?.PUBLIC_BASE || "", valeur);
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlMembre === "function") return window.LCDP_urlMembre(valeur);
    if (typeof window.SITE_CONFIG?.membreUrl === "function") return window.SITE_CONFIG.membreUrl(valeur);

    return buildUrl(
      window.SITE_CONFIG?.membreBaseUrl ||
      window.SITE_CONFIG?.MEMBRE_BASE ||
      window.SITE_CONFIG?.siteBase ||
      window.SITE_BASE ||
      "",
      valeur
    );
  }

  function construireUrlObjet(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlObjet === "function") return window.LCDP_urlObjet(valeur);
    if (typeof window.SITE_CONFIG?.objetUrl === "function") return window.SITE_CONFIG.objetUrl(valeur);

    const objetBase =
      window.SITE_CONFIG?.objetBaseUrl ||
      window.SITE_CONFIG?.OBJET_BASE ||
      buildUrl(window.SITE_CONFIG?.publicBaseUrl || window.SITE_CONFIG?.PUBLIC_BASE || "", "/OBJET");

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
    navBurger.setAttribute("hidden", "");
  }

  function ouvrirMenu(boutonBurger, navBurger) {
    boutonBurger.setAttribute("aria-expanded", "true");
    navBurger.hidden = false;
    navBurger.removeAttribute("hidden");
  }

  function basculerMenu(boutonBurger, navBurger) {
    const ouvert = boutonBurger.getAttribute("aria-expanded") === "true";

    if (ouvert) {
      fermerMenu(boutonBurger, navBurger);
      return;
    }

    ouvrirMenu(boutonBurger, navBurger);
  }

  function creerLienMenu(item, boutonBurger, navBurger) {
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

  async function initialiserMenuBurgerMembre() {
    const slot = document.querySelector("[data-lcdp-burger-slot]");

    if (!slot) return;

    if (slot.dataset.lcdpBurgerInitialise === "true") return;

    if (initialisationEnCours) return initialisationEnCours;

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

      fermerMenu(boutonBurger, navBurger);

      const liensMembre = [
        {
          label: "Accueil",
          espace: "membre",
          href: "/ESPACE-MEMBRE/accueil-membre.html"
        },
        {
          label: "Mon compte",
          espace: "membre",
          href: "/ESPACE-MEMBRE/mes-informations.html"
        },
        {
          label: "Actualité",
          espace: "public",
          href: "/ESPACE-PUBLIC/actualite.html"
        },
        {
          label: "Le club",
          espace: "public",
          href: "/ESPACE-PUBLIC/la-cle-du-parc.html"
        }
      ];

      listeBurger.innerHTML = "";

      liensMembre.forEach((item) => {
        listeBurger.appendChild(creerLienMenu(item, boutonBurger, navBurger));
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
