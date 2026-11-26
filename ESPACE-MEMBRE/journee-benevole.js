/* Journée bénévole — socle de la liste, sans raccordement aux données. */
(() => {
  "use strict";
  const urlMembre = window.LCDP_urlMembre;
  const urlPublic = window.LCDP_urlPublic;
  const urlObjet = window.LCDP_urlObjet;
  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    if (!slot) return;

    slot.innerHTML = "";
    slot.appendChild(await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html"));
    appliquerRoutesSite(slot);
    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js");

    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre();
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");
    if (!slot) return;
    slot.innerHTML = "";
    slot.appendChild(await chargerFragmentObjet("/HTMLBASE/02-footer.html"));
    appliquerRoutesSite(slot);
  }

  function appliquerRoutesSite(racine) {
    racine.querySelectorAll("[data-site-href]").forEach((element) => {
      const path = element.dataset.siteHref || "";
      const space = element.dataset.space || "public";
      element.setAttribute("href", space === "membre" ? urlMembre(path) : urlPublic(path));
    });

    racine.querySelectorAll("[data-site-src]").forEach((element) => {
      const path = String(element.dataset.siteSrc || "").replace(/^\/?OBJET\/?/, "/");
      element.setAttribute("src", urlObjet(path));
    });
  }


  async function chargerFragmentObjet(path) {
    return chargerFragment(urlObjet(path), "Fragment OBJET " + path);
  }

  async function chargerFragmentMembre(path) {
    return chargerFragment(urlMembre(path), "Fragment membre " + path);
  }

  async function chargerFragment(url, label) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });
    if (!response.ok) throw new Error(label + " introuvable.");
    const template = document.createElement("template");
    template.innerHTML = (await response.text()).trim();
    return template.content.cloneNode(true);
  }

  function chargerScriptMembreUneFois(path) {
    if (document.querySelector(`script[data-lcdp-script="${path}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = urlMembre(path);
      script.defer = true;
      script.dataset.lcdpScript = path;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Script membre introuvable : " + path));
      document.body.appendChild(script);
    });
  }


  // Le contenu de la liste reste visible même si un fragment de navigation échoue.
  Promise.allSettled([initialiserBandeau(), initialiserFooter()]).then(resultats => {
    for (const resultat of resultats) {
      if (resultat.status === "rejected") console.error("Journée bénévole :", resultat.reason);
    }
  });
})();
