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


  function installerCommandeFiltres() {
    const tools = document.querySelector("[data-lcdp-liste-card-tools]");
    const formulaire = tools?.querySelector(".lcdp-planning-filtres");
    if (!formulaire) throw new Error("Grille de filtrage indisponible.");
    const commandeFiltres = document.createElement("button");
    commandeFiltres.type = "button";
    commandeFiltres.className = "lcdp-planning-filtres__bascule";
    commandeFiltres.setAttribute("aria-controls", "lcdp-planning-filtres-contenu");
    commandeFiltres.setAttribute("aria-expanded", "false");
    commandeFiltres.setAttribute("aria-label", "Afficher les filtres");

    const libelleFiltres = document.createElement("span");
    libelleFiltres.textContent = "Filtres";
    const signeFiltres = document.createElement("span");
    signeFiltres.textContent = "+";
    signeFiltres.setAttribute("aria-hidden", "true");

    commandeFiltres.append(libelleFiltres, signeFiltres);
    formulaire.id = "lcdp-planning-filtres-contenu";
    formulaire.hidden = true;

    commandeFiltres.addEventListener("click", () => {
      const ouvert = commandeFiltres.getAttribute("aria-expanded") !== "true";
      commandeFiltres.setAttribute("aria-expanded", String(ouvert));
      commandeFiltres.setAttribute("aria-label", ouvert ? "Masquer les filtres" : "Afficher les filtres");
      signeFiltres.textContent = ouvert ? "−" : "+";
      formulaire.hidden = !ouvert;

    });
    tools.replaceChildren(commandeFiltres, formulaire);
    tools.hidden = false;
  }
  async function initialiserPage() {
    try {
      installerCommandeFiltres();
      await Promise.all([initialiserBandeau(), initialiserFooter()]);
      const logo = document.querySelector("#lcdp-bandeau-slot img");
      if (logo && typeof logo.decode === "function") await logo.decode().catch(() => {});
      window.LCDP_terminerAttentePageMembre?.();
    } catch (erreur) {
      console.error("Journée bénévole :", erreur);
      window.LCDP_echecAttentePageMembre?.();
    }
  }
  initialiserPage();
})();
