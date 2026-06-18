(() => {
  const scriptUrl = document.currentScript?.src || "";

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", chargerFooterGlobal);
  } else {
    chargerFooterGlobal();
  }

  async function chargerFooterGlobal() {
    const container = document.getElementById("footer-container");

    if (!container) {
      console.warn("Footer global : conteneur #footer-container introuvable.");
      return;
    }

    const urlsPossibles = construireUrlsPossiblesFooter();

    for (const url of urlsPossibles) {
      try {
        const response = await fetch(url, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-cache"
        });

        if (!response.ok) {
          continue;
        }

        const html = await response.text();

        if (!html.trim().startsWith("<footer")) {
          continue;
        }

        container.innerHTML = html;
        corrigerLiensFooterGlobal(container);
        return;

      } catch (error) {
        console.warn("Footer global : tentative échouée :", url, error);
      }
    }

    console.error("Footer global : aucun fichier footer-global.html valide n'a été chargé.");
    console.error("URLs essayées :", urlsPossibles);
  }

  function construireUrlsPossiblesFooter() {
    const urls = [];

    if (scriptUrl) {
      urls.push(new URL("footer-global.html", scriptUrl).href);
    }

    urls.push(construireUrlSite("/OBJETS/BLOCS/footer-global.html"));

    if (window.SITE_ROOT_RELATIVE) {
      urls.push(
        window.SITE_ROOT_RELATIVE.replace(/\/?$/, "/") +
        "OBJETS/BLOCS/footer-global.html"
      );
    }

    return [...new Set(urls)];
  }

  function corrigerLiensFooterGlobal(scope) {
    corrigerAttributs(scope, "a[href]", "href");
    corrigerAttributs(scope, "img[src]", "src");
  }

  function corrigerAttributs(scope, selector, attribut) {
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
    if (typeof window.construireUrlSite === "function") {
      return window.construireUrlSite(chemin);
    }

    const siteBase = (
      window.SITE_BASE ||
      window.SITE_CONFIG?.publicBaseUrl ||
      window.SITE_CONFIG?.PUBLIC_BASE ||
      window.SITE_CONFIG?.siteBase ||
      ""
    ).replace(/\/$/, "");

    const siteRootRelative = window.SITE_ROOT_RELATIVE || "./";

    if (!chemin) return chemin;

    if (
      chemin.startsWith("#") ||
      chemin.startsWith("mailto:") ||
      chemin.startsWith("tel:") ||
      chemin.startsWith("http://") ||
      chemin.startsWith("https://")
    ) {
      return chemin;
    }

    if (siteBase) {
      return chemin.startsWith("/")
        ? siteBase + chemin
        : siteBase + "/" + chemin.replace(/^\.\//, "");
    }

    return chemin.startsWith("/")
      ? siteRootRelative.replace(/\/?$/, "/") + chemin.replace(/^\//, "")
      : chemin;
  }
})();