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

    if (typeof window.LCDP_initialiserMenuBurgerMembre !== "function") throw new Error("Menu membre indisponible.");
    await window.LCDP_initialiserMenuBurgerMembre();
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


  const transitionAccessoires = document.body.hasAttribute("data-lcdp-accessoires-transition");
  window.LCDP_cadreAccessoiresPret = Promise.all([initialiserBandeau(), initialiserFooter()])
    .then(() => {
      const logo = document.querySelector("#lcdp-bandeau-slot img");
      return logo && typeof logo.decode === "function" ? logo.decode().catch(() => {}) : undefined;
    })
    .catch(error => {
      console.error("Cadre accessoires :", error);
      if (transitionAccessoires) throw error;
    });
  window.LCDP_terminerAttenteAccessoires = () => {
    document.body.classList.remove("public-home--loading");
    document.getElementById("lcdp-attente-arrivee")?.remove();
  };
  if (transitionAccessoires) {
    let termine = false;
    function afficherErreurChargement() {
      if (termine) return;
      termine = true;
      window.clearTimeout(delai);
      const attente = document.getElementById("lcdp-attente-arrivee");
      attente?.removeAttribute("aria-label");
      attente?.querySelector("img")?.setAttribute("hidden", "");
      document.getElementById("lcdp-accessoires-erreur")?.removeAttribute("hidden");
      const reessayer = document.getElementById("lcdp-accessoires-reessayer");
      reessayer?.removeAttribute("hidden");
      reessayer?.addEventListener("click", () => window.location.reload(), { once: true });
    }
    const delai = window.setTimeout(afficherErreurChargement, 25000);
    window.LCDP_cadreAccessoiresPret.then(() => {
      if (termine) return;
      termine = true;
      window.clearTimeout(delai);
      document.documentElement.classList.add("lcdp-accessoires-prets");
      window.LCDP_terminerAttenteAccessoires();
    }, afficherErreurChargement);
  } else {
    if (!document.querySelector("[data-lcdp-accessoires-reserves]")) {
      window.LCDP_cadreAccessoiresPret.finally(window.LCDP_terminerAttenteAccessoires);
    }
    window.setTimeout(window.LCDP_terminerAttenteAccessoires, 25000);
  }
})();
