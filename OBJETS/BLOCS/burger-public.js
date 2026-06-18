(() => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", chargerBandeauNavigationPublic);
  } else {
    chargerBandeauNavigationPublic();
  }

  async function chargerBandeauNavigationPublic() {
    const container = document.getElementById("bandeau-nav-container");

    if (!container) return;

    try {
      const response = await fetch(construireUrlSite("/OBJETS/BLOCS/bandeau-nav.html"));

      if (!response.ok) {
        throw new Error("Impossible de charger le bandeau de navigation public");
      }

      const html = await response.text();
      container.innerHTML = html;

      corrigerLiensBandeauNavigation(container);
      initialiserSessionsPubliques();
      initialiserBurgerPublic(container);
    } catch (error) {
      console.error("Erreur de chargement du bandeau de navigation public :", error);
    }
  }

  function initialiserBurgerPublic(container) {
    const burgerButton = container.querySelector(".burger-button");
    const burgerNavPublic = container.querySelector(".burger-nav-public");

    if (!burgerButton || !burgerNavPublic) return;

    burgerButton.addEventListener("click", () => {
      const isOpen = burgerButton.classList.toggle("is-open");

      burgerNavPublic.classList.toggle("is-open", isOpen);
      burgerButton.setAttribute("aria-expanded", String(isOpen));
    });

    document.addEventListener("click", (event) => {
      if (!container.contains(event.target)) {
        fermerBurgerPublic(burgerButton, burgerNavPublic);
      }
    });

    burgerNavPublic.querySelectorAll("a").forEach((lien) => {
      lien.addEventListener("click", () => {
        fermerBurgerPublic(burgerButton, burgerNavPublic);
      });
    });
  }

  function fermerBurgerPublic(burgerButton, burgerNavPublic) {
    burgerButton.classList.remove("is-open");
    burgerNavPublic.classList.remove("is-open");
    burgerButton.setAttribute("aria-expanded", "false");
  }

  function initialiserSessionsPubliques() {
    window.LCDP_SESSIONS = {
      membre: cookieExiste("session_membre"),
      parc: cookieExiste("session_parc"),
      coach: cookieExiste("session_coach")
    };
  }

  function cookieExiste(nom) {
    return document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .some((cookie) => cookie.startsWith(nom + "="));
  }

  function corrigerLiensBandeauNavigation(scope) {
    corrigerAttributsAvecSiteBase(scope, "a[href]", "href");
    corrigerAttributsAvecSiteBase(scope, "img[src]", "src");
  }

  function corrigerAttributsAvecSiteBase(scope, selector, attribut) {
    scope.querySelectorAll(selector).forEach((element) => {
      const valeur = element.getAttribute(attribut);

      if (
        !valeur ||
        valeur.startsWith("#") ||
        valeur.startsWith("mailto:") ||
        valeur.startsWith("tel:") ||
        valeur.startsWith("http://") ||
        valeur.startsWith("https://")
      ) {
        return;
      }

      element.setAttribute(attribut, construireUrlSite(valeur));
    });
  }

  function construireUrlSite(chemin) {
    const siteBase = normaliserSiteBase();

    if (!chemin) return chemin;

    if (chemin.startsWith("http://") || chemin.startsWith("https://")) {
      return chemin;
    }

    if (!siteBase) {
      return chemin.startsWith("/") ? "." + chemin : chemin;
    }

    if (chemin.startsWith("/")) {
      return siteBase + chemin;
    }

    return siteBase + "/" + chemin.replace(/^\.\//, "");
  }

  function normaliserSiteBase() {
    const siteBase =
      window.SITE_BASE ||
      window.SITE_CONFIG?.publicBaseUrl ||
      window.SITE_CONFIG?.siteBase ||
      "";

    return siteBase.replace(/\/$/, "");
  }
})();