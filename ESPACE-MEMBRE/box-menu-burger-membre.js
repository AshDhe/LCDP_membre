(() => {
  "use strict";

  const CONFIG_BURGER_MEMBRE = window.SITE_CONFIG || {};

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

  function creerLienMenu(item, boutonBurger, navBurger) {
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

  async function initialiserMenuBurgerMembre(options = {}) {
    const slot = document.querySelector("[data-lcdp-burger-slot]");

    if (!slot) return;

    const etatMembre = options.etatMembre || {};
    const abonne = etatMembre.abonne === true;

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
        espace: "membre",
        href: "/ESPACE-MEMBRE/abonnement-membre.html"
      },
      {
        label: "Actualité du club",
        espace: "public",
        href: "/ESPACE-PUBLIC/actualite.html"
      }
    );

    listeBurger.innerHTML = "";

    liens.forEach((item) => {
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
  }

  window.LCDP_initialiserMenuBurgerMembre = initialiserMenuBurgerMembre;
})();
