(() => {
  "use strict";

  const PAGE_CONNEXION_MEMBRE = urlPublic(
    "/ESPACE-PUBLIC/connexion-membre.html"
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage, {
      once: true
    });
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    try {
      await Promise.all([
        initialiserBandeau(),
        initialiserFooter()
      ]);

      const controleurOnglets = await initialiserOngletsFactures();

      await Promise.all([
        initialiserTableMesFactures(controleurOnglets.zones.factures),
        initialiserTablePaiements(controleurOnglets.zones.paiements),
        initialiserTableAvoirs(controleurOnglets.zones.avoirs)
      ]);
    } catch (error) {
      console.error("Erreur Mes factures membre :", error);
      await afficherAlerte(
        String(error?.message || error || "Erreur de chargement.")
      );
    }
  }

  async function initialiserOngletsFactures() {
    const slot = document.getElementById(
      "lcdp-mes-factures-membre-slot"
    );

    if (!slot) {
      throw new Error("Slot Mes factures introuvable.");
    }

    if (!window.LCDP_WRAPER_ONGLETS) {
      throw new Error("Objet générique onglets indisponible.");
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet(
        "/BOX/05-wraper-onglets.html?v=20260803-1446"
      )
    );

    const racine = slot.querySelector(
      "[data-lcdp-wraper-onglets]"
    );

    if (!racine) {
      throw new Error("Objet onglets introuvable.");
    }

    return window.LCDP_WRAPER_ONGLETS.initialiser({
      racine,
      idPrefix: "lcdp-mes-factures",
      ariaLabel: "Navigation des factures du membre",
      navigationAriaLabel: "Sections Mes factures",
      actif: "factures",
      onglets: [
        { key: "factures", label: "Mes Factures" },
        { key: "paiements", label: "Paiements" },
        { key: "avoirs", label: "Mes avoirs" }
      ]
    });
  }

  async function initialiserTableMesFactures(zone) {
    const controleur = await initialiserTable(zone, {
      ariaLabel: "Liste des factures du membre",
      emptyMessage: "Aucune facture.",
      columns: [
        { key: "commande", label: "Commande" },
        { key: "dateCommande", label: "Date", type: "date" },
        { key: "facture", label: "Facture" },
        { key: "dateFacture", label: "Date", type: "date" }
      ]
    });

    controleur.mettreAJour([]);
  }

  async function initialiserTablePaiements(zone) {
    const controleur = await initialiserTable(zone, {
      ariaLabel: "Liste des paiements du membre",
      emptyMessage: "Aucun paiement.",
      columns: [
        { key: "facture", label: "Facture" },
        { key: "paiement1", label: "Paiement" },
        { key: "datePaiement1", label: "Date", type: "date" },
        { key: "paiement2", label: "Paiement" },
        { key: "datePaiement2", label: "Date", type: "date" },
        { key: "paiement3", label: "Paiement" },
        { key: "datePaiement3", label: "Date", type: "date" }
      ]
    });

    controleur.mettreAJour([]);
  }

  async function initialiserTableAvoirs(zone) {
    const controleur = await initialiserTable(zone, {
      ariaLabel: "Liste des avoirs du membre",
      emptyMessage: "Aucun avoir.",
      columns: [
        { key: "factureSource", label: "Sur facture" },
        { key: "avoir", label: "Avoir dû" },
        { key: "remboursement", label: "Remboursement" },
        { key: "dateRemboursement", label: "Date", type: "date" }
      ]
    });

    controleur.mettreAJour([]);
  }

  async function initialiserTable(zone, options) {
    if (!zone) {
      throw new Error("Zone de tableau introuvable.");
    }

    if (!window.LCDP_TABLE_LECTURE) {
      throw new Error("Objet générique de lecture indisponible.");
    }

    zone.innerHTML = "";
    zone.appendChild(
      await chargerFragmentObjet("/BOX/05-table-lecture.html")
    );

    return window.LCDP_TABLE_LECTURE.initialiser({
      slot: zone,
      ariaLabel: options.ariaLabel,
      emptyMessage: options.emptyMessage,
      columns: options.columns,
      rows: []
    });
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentMembre(
        "/ESPACE-MEMBRE/box-bandeau-nav-membre.html"
      )
    );
    appliquerRoutesSite(slot);

    await chargerScriptMembreUneFois(
      "/ESPACE-MEMBRE/box-menu-burger-membre.js"
    );

    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre();
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");

    if (!slot) return;

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet("/BOX/02-box-footer.html")
    );
    appliquerRoutesSite(slot);
  }

  function appliquerRoutesSite(racine) {
    racine.querySelectorAll("[data-site-href]").forEach((element) => {
      const path = element.dataset.siteHref || "";
      const space = element.dataset.space || "public";

      element.setAttribute(
        "href",
        space === "membre" ? urlMembre(path) : urlPublic(path)
      );
    });

    racine.querySelectorAll("[data-site-src]").forEach((element) => {
      const path = String(element.dataset.siteSrc || "")
        .replace(/^\/?OBJET\/?/, "/");
      element.setAttribute("src", urlObjet(path));
    });
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      window.alert(message || "");
      return;
    }

    try {
      slot.innerHTML = "";
      slot.appendChild(
        await chargerFragmentObjet("/BOX/02-box-alerte.html")
      );

      const alerte = slot.querySelector("[data-lcdp-box-alerte]");
      const texte = slot.querySelector("[data-lcdp-alerte-message]");
      const fermer = slot.querySelector("[data-lcdp-alerte-close]");
      const ok = slot.querySelector("[data-lcdp-alerte-ok]");

      if (!alerte || !texte || !fermer || !ok) {
        throw new Error("Structure alerte incomplète.");
      }

      texte.textContent = message || "";

      const nettoyer = () => {
        slot.innerHTML = "";
      };

      fermer.addEventListener("click", nettoyer, { once: true });
      ok.addEventListener("click", nettoyer, { once: true });
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) nettoyer();
      });
    } catch {
      slot.innerHTML = "";
      window.alert(message || "");
    }
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

    if (!response.ok) {
      throw new Error(label + " introuvable.");
    }

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
      script.onerror = () => reject(
        new Error("Script membre introuvable : " + path)
      );
      document.body.appendChild(script);
    });
  }

  function redirigerConnexion() {
    if (typeof window.LCDP_redirigerConnexionMembre === "function") {
      window.LCDP_redirigerConnexionMembre(
        "mes-factures-membre",
        "inactive"
      );
      return;
    }

    window.location.href = PAGE_CONNEXION_MEMBRE +
      "?source=mes-factures-membre&session=inactive";
  }

  function urlPublic(path) {
    return typeof window.LCDP_urlPublic === "function"
      ? window.LCDP_urlPublic(path)
      : path;
  }

  function urlMembre(path) {
    return typeof window.LCDP_urlMembre === "function"
      ? window.LCDP_urlMembre(path)
      : path;
  }

  function urlObjet(path) {
    return typeof window.LCDP_urlObjet === "function"
      ? window.LCDP_urlObjet(path)
      : path;
  }
})();
