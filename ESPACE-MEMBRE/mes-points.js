(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const PAGE_CONNEXION_MEMBRE = urlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const ENDPOINT_MES_POINTS = construireEndpointMesPoints();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage, { once: true });
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    try {
      await Promise.all([
        initialiserBandeau(),
        initialiserFooter()
      ]);

      const racine = await initialiserWraperOnglets();
      initialiserNavigationOnglets(racine);

      await Promise.all([
        chargerReferent(racine),
        chargerPassion(racine)
      ]);
    } catch (error) {
      console.error("Erreur mes points membre :", error);
      await afficherAlerte(
        String(error?.message || error || "Erreur de chargement.")
      );
    }
  }

  async function initialiserWraperOnglets() {
    const slot = document.getElementById("lcdp-mes-points-slot");

    if (!slot) {
      throw new Error("Slot mes points introuvable.");
    }

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentObjet("/BOX/05-wraper-onglets.html")
    );

    const racine = slot.querySelector("[data-lcdp-wraper-onglets]");

    if (!racine) {
      throw new Error("Objet onglets introuvable.");
    }

    return racine;
  }

  function initialiserNavigationOnglets(racine) {
    const boutons = Array.from(
      racine.querySelectorAll("[data-lcdp-onglet]")
    );
    const panneaux = Array.from(
      racine.querySelectorAll("[data-lcdp-panneau-onglet]")
    );

    boutons.forEach((bouton) => {
      bouton.addEventListener("click", () => {
        activerOnglet(bouton.dataset.lcdpOnglet, boutons, panneaux);
      });

      bouton.addEventListener("keydown", (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
          return;
        }

        event.preventDefault();
        const index = boutons.indexOf(bouton);
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const prochain = boutons[(index + direction + boutons.length) % boutons.length];
        prochain.click();
        prochain.focus();
      });
    });
  }

  function activerOnglet(nom, boutons, panneaux) {
    boutons.forEach((bouton) => {
      const actif = bouton.dataset.lcdpOnglet === nom;
      bouton.setAttribute("aria-selected", String(actif));
      bouton.tabIndex = actif ? 0 : -1;
    });

    panneaux.forEach((panneau) => {
      panneau.hidden = panneau.dataset.lcdpPanneauOnglet !== nom;
    });
  }

  async function chargerReferent(racine) {
    const zone = racine.querySelector('[data-lcdp-contenu-onglet="referent"]');

    if (!zone) {
      throw new Error("Zone Référent introuvable.");
    }

    await installerTable(zone);

    try {
      const data = await lireApi("/referent");
      const rows = (Array.isArray(data.rows) ? data.rows : []).map((row) => ({
        mois: formaterMois(row.date),
        referent: row.statut || "—",
        points: row.points,
        badge: row.statut || ""
      }));

      window.LCDP_TABLE_LECTURE.initialiser({
        slot: zone,
        ariaLabel: "Historique du statut référent",
        emptyMessage: "Aucun historique de points.",
        columns: [
          { key: "mois", label: "Mois" },
          { key: "referent", label: "Référent" },
          { key: "points", label: "Points", type: "number" },
          { key: "badge", label: "Badge" }
        ],
        rows,
        renderCell: ({ column, value }) => {
          if (column.key !== "badge") {
            return null;
          }

          return creerBadge(value);
        }
      });
    } catch (error) {
      afficherErreurTable(zone, error);
    }
  }

  async function chargerPassion(racine) {
    const zone = racine.querySelector('[data-lcdp-contenu-onglet="passion"]');

    if (!zone) {
      throw new Error("Zone Passion introuvable.");
    }

    await installerTable(zone);

    try {
      const data = await lireApi("/passion");
      const rows = (Array.isArray(data.rows) ? data.rows : []).map((row) => ({
        date: row.date,
        passion: row.description,
        type: row.type,
        points: row.valpoint
      }));

      window.LCDP_TABLE_LECTURE.initialiser({
        slot: zone,
        ariaLabel: "Détail des points Passion",
        emptyMessage: "Aucun point Passion pour ce mois.",
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "passion", label: "Passion" },
          { key: "type", label: "Type" },
          { key: "points", label: "Points", type: "number" }
        ],
        rows
      });
    } catch (error) {
      afficherErreurTable(zone, error);
    }
  }

  async function installerTable(zone) {
    zone.innerHTML = "";
    zone.appendChild(
      await chargerFragmentObjet("/BOX/05-table-lecture.html")
    );
  }

  function afficherErreurTable(zone, error) {
    const loading = zone.querySelector("[data-lcdp-table-lecture-loading]");
    const errorBox = zone.querySelector("[data-lcdp-table-lecture-error]");

    if (loading) {
      loading.hidden = true;
    }

    if (errorBox) {
      errorBox.textContent = String(
        error?.message || error || "Erreur de chargement."
      );
      errorBox.hidden = false;
    }
  }

  async function lireApi(path) {
    if (!ENDPOINT_MES_POINTS) {
      throw new Error("Le service Mes points n’est pas configuré.");
    }

    const response = await fetch(ENDPOINT_MES_POINTS + path, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });

    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      redirigerConnexion();
      throw new Error("Session membre inactive.");
    }

    if (!response.ok || !data || data.ok !== true) {
      throw new Error(
        data?.message || data?.detail || "Impossible de charger les points."
      );
    }

    return data;
  }

  function creerBadge(statut) {
    const nom = normaliserBadge(statut);

    if (!nom) {
      return document.createTextNode("—");
    }

    const image = document.createElement("img");
    image.src = urlObjet("/IMAG/BADG/" + nom + "96.webp");
    image.srcset = [
      urlObjet("/IMAG/BADG/" + nom + "64.webp") + " 64w",
      urlObjet("/IMAG/BADG/" + nom + "96.webp") + " 96w",
      urlObjet("/IMAG/BADG/" + nom + "192.webp") + " 192w"
    ].join(", ");
    image.sizes = "48px";
    image.alt = "Badge " + statut;
    image.loading = "lazy";
    image.decoding = "async";

    return image;
  }

  function normaliserBadge(value) {
    const nom = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");

    return ["bronze", "argent", "or", "platine"].includes(nom)
      ? nom
      : "";
  }

  function formaterMois(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})/);

    if (!match) {
      return String(value || "");
    }

    const date = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12)
    );

    const libelle = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "Europe/Paris"
    }).format(date);

    return libelle.charAt(0).toUpperCase() + libelle.slice(1);
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";
    slot.appendChild(
      await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html")
    );
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
    slot.appendChild(await chargerFragmentObjet("/BOX/02-box-footer.html"));
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
      slot.appendChild(await chargerFragmentObjet("/BOX/02-box-alerte.html"));

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
      script.onerror = () => reject(new Error("Script membre introuvable : " + path));
      document.body.appendChild(script);
    });
  }

  function construireEndpointMesPoints() {
    const value =
      config.workerMesPointsUrl ||
      config.WORKER_MES_POINTS_URL ||
      "";

    if (value) {
      return String(value).replace(/\/+$/, "");
    }

    return typeof config.apiUrl === "function"
      ? config.apiUrl("mes-points-api").replace(/\/+$/, "")
      : "";
  }

  function redirigerConnexion() {
    if (typeof window.LCDP_redirigerConnexionMembre === "function") {
      window.LCDP_redirigerConnexionMembre("mes-points", "inactive");
      return;
    }

    window.location.href = PAGE_CONNEXION_MEMBRE +
      "?source=mes-points&session=inactive";
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
