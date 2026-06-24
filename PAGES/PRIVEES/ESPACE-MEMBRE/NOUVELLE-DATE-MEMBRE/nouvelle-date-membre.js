const CONFIG_NOUVELLE_DATE_MEMBRE = window.SITE_CONFIG || {};

const DOSSIER_NOUVELLE_DATE_MEMBRE =
  "/PAGES/PRIVEES/ESPACE-MEMBRE/NOUVELLE-DATE-MEMBRE";

const ENDPOINT_NOUVELLE_DATE_MEMBRE = construireEndpointApi(
  "workerNouvelleDateMembreUrl",
  "WORKER_NOUVELLE_DATE_MEMBRE_URL",
  "nouvelle-date-membre-api"
);

const PAGE_CONNEXION_MEMBRE = construireUrlPublic(
  "/PAGES/PUBLIQUES/CONNEXION-MEMBRE/connexion-membre.html"
);

let nouvelleDateMembreInitialisee = false;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiserNouvelleDateMembre);
} else {
  initialiserNouvelleDateMembre();
}

function initialiserNouvelleDateMembre() {
  if (nouvelleDateMembreInitialisee) return;

  nouvelleDateMembreInitialisee = true;

  const listeParcs = document.getElementById("liste-parcs-membre");
  const boutonDemanderIA = document.getElementById("bouton-demander-ia");
  const boutonModifierDepartement = document.getElementById("bouton-modifier-departement");
  const titreDepartement = document.getElementById("titre-departement-membre");

  let departementMembre = null;
  let departementAffiche = null;
  let modeAutourDeMoi = true;
  let parcsCharges = [];

  if (boutonDemanderIA) {
    boutonDemanderIA.addEventListener("click", () => {
      afficherMessageInformation(
        "Assistant IA",
        "La demande à l’IA sera raccordée ensuite."
      );
    });
  }

  if (boutonModifierDepartement) {
    boutonModifierDepartement.addEventListener("click", ouvrirDialogueDepartement);
  }

  document.addEventListener("click", gererClicDocument);

  window.addEventListener("message", gererMessageIframePlanning);

  chargerParcsAutourDeMoi();

  function normaliserDepartement(valeur) {
    const departement = String(valeur || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (/^[1-9]$/.test(departement)) {
      return "0" + departement;
    }

    return departement;
  }

  async function ouvrirDialogueDepartement() {
    if (typeof window.afficherBoiteDialogue !== "function") {
      afficherErreur("La boîte de dialogue est indisponible.");
      return;
    }

    const resultat = await window.afficherBoiteDialogue({
      titre: "Choisissez un département",
      texteAnnuler: "Annuler",
      texteValider: "Valider",
      champs: [
        {
          id: "nouveau-departement-recherche",
          name: "dptmt",
          label: "Entrez le n° du département",
          type: "text",
          value: "",
          required: true
        }
      ]
    });

    if (!resultat) return;

    const nouveauDepartement = normaliserDepartement(resultat.dptmt);

    if (!nouveauDepartement) {
      afficherErreur("Le département est obligatoire.");
      return;
    }

    departementAffiche = nouveauDepartement;
    modeAutourDeMoi = false;

    await chargerParcsDepartement(departementAffiche);
  }

  async function chargerParcsAutourDeMoi() {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      afficherErreur("Le service de nouvelle date membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargement();

      const reponse = await fetch(ENDPOINT_NOUVELLE_DATE_MEMBRE + "/autour-de-moi", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      if (gererSessionExpiree(reponse, "inactive")) {
        return;
      }

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(
          messageErreurApi(data, "Impossible de charger les parcs autour de vous.")
        );
      }

      departementMembre = data.departement || null;
      departementAffiche = data.departement || null;
      modeAutourDeMoi = true;
      parcsCharges = Array.isArray(data.parcs) ? data.parcs : [];

      afficherTitreDepartement();
      afficherParcs(parcsCharges);
    } catch (erreur) {
      console.error("Erreur chargement parcs autour du membre :", erreur);
      afficherErreur(erreur.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function chargerParcsDepartement(departement) {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      afficherErreur("Le service de nouvelle date membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargement();

      const reponse = await fetch(
        ENDPOINT_NOUVELLE_DATE_MEMBRE + "/departement?dptmt=" + encodeURIComponent(departement),
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Accept": "application/json"
          }
        }
      );

      if (gererSessionExpiree(reponse, "inactive")) {
        return;
      }

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(
          messageErreurApi(data, "Impossible de charger les parcs de ce département.")
        );
      }

      departementAffiche = data.departement || departement;
      modeAutourDeMoi = false;
      parcsCharges = Array.isArray(data.parcs) ? data.parcs : [];

      afficherTitreDepartement();
      afficherParcs(parcsCharges);
    } catch (erreur) {
      console.error("Erreur chargement parcs département membre :", erreur);
      afficherErreur(erreur.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function gererSessionExpiree(reponse, motif) {
    if (reponse.status === 401) {
      redirigerConnexionMembre(motif || "inactive");
      return true;
    }

    return false;
  }

  function afficherTitreDepartement() {
    if (!titreDepartement) return;

    if (modeAutourDeMoi) {
      titreDepartement.textContent = "Autour de moi";
      return;
    }

    titreDepartement.textContent = "Parcs dans le " + (departementAffiche || "");
  }

  function afficherChargement() {
    if (!listeParcs) return;

    listeParcs.innerHTML = `
      <tr>
        <td colspan="2">
          Chargement des parcs...
        </td>
      </tr>
    `;
  }

  function afficherErreur(message) {
    if (!listeParcs) return;

    listeParcs.innerHTML = `
      <tr>
        <td colspan="2">
          ${echapperHtml(message)}
        </td>
      </tr>
    `;
  }

  function afficherParcs(parcs) {
    if (!listeParcs) return;

    if (!Array.isArray(parcs) || parcs.length === 0) {
      listeParcs.innerHTML = `
        <tr>
          <td colspan="2">
            Il n'y a pas de parc accessible par ici.
          </td>
        </tr>
      `;
      return;
    }

    let html = "";

    for (let index = 0; index < parcs.length; index += 2) {
      html += `
        <tr>
          <td>
            ${creerCarteParc(parcs[index])}
          </td>
          <td>
            ${parcs[index + 1] ? creerCarteParc(parcs[index + 1]) : ""}
          </td>
        </tr>
      `;
    }

    listeParcs.innerHTML = html;
  }

  function creerCarteParc(parc) {
    const idParc = echapperHtml(parc.idparc || parc.id || "");
    const nomParc = echapperHtml(parc.nom || parc.nomparc || "Parc");
    const departement = echapperHtml(parc.dptmt || parc.departement || "");
    const imageUrl = echapperHtml(construireUrlImageParc(parc.imageparc));

    return `
      <article class="carte-parc-membre">

        <img
          class="carte-parc-membre-image"
          src="${imageUrl}"
          alt="Image du parc ${nomParc}"
        >

        <div class="carte-parc-membre-contenu">

          <h3>
            ${nomParc}${departement ? " (" + departement + ")" : ""}
          </h3>

          <div class="carte-parc-membre-actions">

            <button class="lien-fiche-parc" type="button" data-action="ouvrir-fiche-parc" data-id="${idParc}">
              Le parc
            </button>

            <button class="micro-action" type="button" data-action="nouvelle-date-parc" data-id="${idParc}">
              Nouvelle date
            </button>

          </div>

        </div>

      </article>
    `;
  }

  function construireUrlImageParc(imageparc) {
    const fichier = String(imageparc || "").trim() || "parc-defaut.jpg";

    return construireUrlAssets(
      "/OBJETS/IMAGES/IMAGE%20PARC/" + encodeURIComponent(fichier)
    );
  }

  function ouvrirLightboxParc(parc) {
    fermerLightboxParc();

    const urlFiche =
      construireUrlFicheParcNouvelleDate(parc);

    const lightbox = document.createElement("div");
    lightbox.id = "lightbox-fiche-parc";
    lightbox.className = "lightbox-fiche-parc-nouvelle-date-overlay";

    lightbox.innerHTML = `
      <div class="lightbox-fiche-parc-nouvelle-date-box" role="dialog" aria-modal="true">

        <button class="micro-action lightbox-fiche-parc-nouvelle-date-fermer" type="button" data-action="fermer-fiche-parc">
          Fermer
        </button>

        <iframe
          class="lightbox-fiche-parc-nouvelle-date-frame"
          src="${echapperHtml(urlFiche)}"
          title="Fiche du parc"
        ></iframe>

      </div>
    `;

    document.body.appendChild(lightbox);
  }

  function fermerLightboxParc() {
    const lightbox = document.getElementById("lightbox-fiche-parc");

    if (lightbox) {
      lightbox.remove();
    }
  }

  function ouvrirLightboxChoixDate(parc) {
    fermerLightboxChoixDate();

    const idParc = echapperHtml(parc.idparc || parc.id || "");
    const nomParc = echapperHtml(parc.nom || parc.nomparc || "ce parc");

    const lightbox = document.createElement("div");
    lightbox.id = "lightbox-choix-date";
    lightbox.className = "dialog-overlay";

    lightbox.innerHTML = `
      <div class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="titre-choix-date">

        <button
          class="micro-action"
          type="button"
          data-action="fermer-choix-date"
          aria-label="Fermer"
          style="float: right; min-width: 40px; min-height: 40px; padding: 6px 12px; font-size: 24px; line-height: 1;"
        >
          ×
        </button>

        <h2 id="titre-choix-date">
          Nouvelle date
        </h2>

        <p>
          Choisissez une date pour ${nomParc}.
        </p>

        <div class="dialog-actions">

          <button class="button" type="button" data-action="choisir-date-rapide" data-choix="aujourdhui" data-id="${idParc}">
            Aujourd'hui
          </button>

          <button class="button" type="button" data-action="choisir-date-rapide" data-choix="demain" data-id="${idParc}">
            Demain
          </button>

          <button class="button button-secondary" type="button" data-action="choisir-date-rapide" data-choix="autre-date" data-id="${idParc}">
            Autre date
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(lightbox);
  }

  function fermerLightboxChoixDate() {
    const lightbox = document.getElementById("lightbox-choix-date");

    if (lightbox) {
      lightbox.remove();
    }
  }

  function construireUrlFicheParcNouvelleDate(parc) {
    return construireUrlMembre(
      DOSSIER_NOUVELLE_DATE_MEMBRE +
      "/fiche-parc-nouvelle-date.html" +
      construireParametresParc(parc)
    );
  }

  function construireUrlPlanningParcNouvelleDate(parc) {
    return construireUrlMembre(
      DOSSIER_NOUVELLE_DATE_MEMBRE +
      "/planning-parc-nouvelle-date.html" +
      construireParametresParc(parc)
    );
  }

  function construireUrlHoraireParcNouvelleDate(parc, dateIso) {
    return construireUrlMembre(
      DOSSIER_NOUVELLE_DATE_MEMBRE +
      "/horaire-parc-nouvelle-date.html" +
      construireParametresParc(parc) +
      "&date=" +
      encodeURIComponent(dateIso)
    );
  }

  function construireParametresParc(parc) {
    const idParc = encodeURIComponent(parc.idparc || parc.id || "");
    const nomParc = encodeURIComponent(parc.nom || parc.nomparc || "");
    const departement = encodeURIComponent(parc.dptmt || parc.departement || "");

    return (
      "?idparc=" + idParc +
      "&nom=" + nomParc +
      "&dptmt=" + departement
    );
  }

  function formaterDateIsoLocale(date) {
    const annee = date.getFullYear();
    const mois = String(date.getMonth() + 1).padStart(2, "0");
    const jour = String(date.getDate()).padStart(2, "0");

    return annee + "-" + mois + "-" + jour;
  }

  function obtenirDateChoixRapide(choix) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    if (choix === "demain") {
      date.setDate(date.getDate() + 1);
    }

    return formaterDateIsoLocale(date);
  }

  function ouvrirLightboxHoraireParcNouvelleDate(parc, dateIso) {
    fermerLightboxChoixDate();
    fermerLightboxPlanningParcNouvelleDate();

    const urlPlanning = construireUrlPlanningParcNouvelleDate(parc);
    const urlHoraire = construireUrlHoraireParcNouvelleDate(parc, dateIso);

    const lightbox = document.createElement("div");
    lightbox.id = "lightbox-planning-parc-nouvelle-date";
    lightbox.className = "lightbox-fiche-parc-nouvelle-date-overlay";

    lightbox.innerHTML = `
      <div class="lightbox-fiche-parc-nouvelle-date-box" role="dialog" aria-modal="true">

        <button
          class="micro-action lightbox-fiche-parc-nouvelle-date-fermer"
          type="button"
          data-action="fermer-planning-parc-nouvelle-date"
        >
          Fermer
        </button>

        <iframe
          class="lightbox-fiche-parc-nouvelle-date-frame"
          src="${echapperHtml(urlHoraire)}"
          title="Horaire du parc"
          data-url-planning="${echapperHtml(urlPlanning)}"
          data-page-planning="horaire"
        ></iframe>

      </div>
    `;

    document.body.appendChild(lightbox);

    const iframe = lightbox.querySelector("iframe");

    if (iframe) {
      iframe.addEventListener("load", () => {
        mettreAJourEtatIframePlanning(iframe);
      });
    }

    afficherBoutonFermerPlanningParcNouvelleDate(true);
  }

  function ouvrirLightboxPlanningParcNouvelleDate(parc) {
    fermerLightboxChoixDate();
    fermerLightboxPlanningParcNouvelleDate();

    const urlPlanning = construireUrlPlanningParcNouvelleDate(parc);

    const lightbox = document.createElement("div");
    lightbox.id = "lightbox-planning-parc-nouvelle-date";
    lightbox.className = "lightbox-fiche-parc-nouvelle-date-overlay";

    lightbox.innerHTML = `
      <div class="lightbox-fiche-parc-nouvelle-date-box" role="dialog" aria-modal="true">

        <button
          class="micro-action lightbox-fiche-parc-nouvelle-date-fermer"
          type="button"
          data-action="fermer-planning-parc-nouvelle-date"
        >
          Fermer
        </button>

        <iframe
          class="lightbox-fiche-parc-nouvelle-date-frame"
          src="${echapperHtml(urlPlanning)}"
          title="Planning du parc"
          data-url-planning="${echapperHtml(urlPlanning)}"
          data-page-planning="planning"
        ></iframe>

      </div>
    `;

    document.body.appendChild(lightbox);

    const iframe = lightbox.querySelector("iframe");

    if (iframe) {
      iframe.addEventListener("load", () => {
        mettreAJourEtatIframePlanning(iframe);
      });
    }
  }

  function fermerLightboxPlanningParcNouvelleDate() {
    const lightbox = document.getElementById("lightbox-planning-parc-nouvelle-date");

    if (lightbox) {
      lightbox.remove();
    }
  }

  function mettreAJourEtatIframePlanning(iframe) {
    let urlActuelle = "";

    try {
      urlActuelle = iframe.contentWindow.location.href;
    } catch (erreur) {
      urlActuelle = iframe.src || "";
    }

    if (urlActuelle.includes("horaire-parc-nouvelle-date.html")) {
      iframe.dataset.pagePlanning = "horaire";
      return;
    }

    iframe.dataset.pagePlanning = "planning";
  }

  function gererBoutonFermerPlanningParcNouvelleDate() {
    const iframe = document.querySelector(
      "#lightbox-planning-parc-nouvelle-date iframe"
    );

    if (!iframe) {
      fermerLightboxPlanningParcNouvelleDate();
      return;
    }

    mettreAJourEtatIframePlanning(iframe);

    if (iframe.dataset.pagePlanning === "horaire") {
      const urlPlanning = iframe.dataset.urlPlanning;

      if (urlPlanning) {
        iframe.src = urlPlanning;
        iframe.dataset.pagePlanning = "planning";
        afficherBoutonFermerPlanningParcNouvelleDate(true);
        return;
      }
    }

    fermerLightboxPlanningParcNouvelleDate();
  }

  function afficherBoutonFermerPlanningParcNouvelleDate(visible) {
    const boutonFermer = document.querySelector(
      "#lightbox-planning-parc-nouvelle-date [data-action='fermer-planning-parc-nouvelle-date']"
    );

    if (boutonFermer) {
      boutonFermer.style.visibility = visible ? "visible" : "hidden";
    }
  }

  function gererMessageIframePlanning(event) {
    if (event.origin !== window.location.origin) {
      return;
    }

    const data = event.data || {};

    if (data.source !== "lcdp-planning-parc-nouvelle-date") {
      return;
    }

    if (data.action === "masquer-fermer-planning") {
      afficherBoutonFermerPlanningParcNouvelleDate(false);
      return;
    }

    if (data.action === "afficher-fermer-planning") {
      afficherBoutonFermerPlanningParcNouvelleDate(true);
      return;
    }

    if (data.action === "ouvrir-horaire-parc-nouvelle-date" && data.url) {
      const iframe = document.querySelector(
        "#lightbox-planning-parc-nouvelle-date iframe"
      );

      if (iframe) {
        iframe.src = data.url;
        iframe.dataset.pagePlanning = "horaire";
      }

      afficherBoutonFermerPlanningParcNouvelleDate(true);
    }
  }

  function gererClicDocument(event) {
    const lienFicheParc = event.target.closest("[data-action='ouvrir-fiche-parc']");
    const boutonNouvelleDate = event.target.closest("[data-action='nouvelle-date-parc']");
    const boutonFermerFiche = event.target.closest("[data-action='fermer-fiche-parc']");
    const boutonFermerChoixDate = event.target.closest("[data-action='fermer-choix-date']");
    const boutonChoixDateRapide = event.target.closest("[data-action='choisir-date-rapide']");
    const boutonFermerPlanningParcNouvelleDate = event.target.closest("[data-action='fermer-planning-parc-nouvelle-date']");

    if (lienFicheParc) {
      event.preventDefault();

      const parc = trouverParcDepuisBouton(lienFicheParc);

      if (!parc) {
        afficherErreur("Fiche parc introuvable.");
        return;
      }

      ouvrirLightboxParc(parc);
      return;
    }

    if (boutonNouvelleDate) {
      const parc = trouverParcDepuisBouton(boutonNouvelleDate);

      if (!parc) {
        afficherErreur("Parc introuvable.");
        return;
      }

      ouvrirLightboxChoixDate(parc);
      return;
    }

    if (boutonFermerFiche) {
      fermerLightboxParc();
      return;
    }

    if (boutonFermerChoixDate) {
      fermerLightboxChoixDate();
      return;
    }

    if (boutonFermerPlanningParcNouvelleDate) {
      gererBoutonFermerPlanningParcNouvelleDate();
      return;
    }

    if (boutonChoixDateRapide) {
      const choix = boutonChoixDateRapide.dataset.choix;
      const parc = trouverParcDepuisBouton(boutonChoixDateRapide);

      if (!parc) {
        afficherErreur("Parc introuvable.");
        return;
      }

      if (choix === "autre-date") {
        ouvrirLightboxPlanningParcNouvelleDate(parc);
        return;
      }

      if (choix === "aujourdhui" || choix === "demain") {
        const dateIso = obtenirDateChoixRapide(choix);
        ouvrirLightboxHoraireParcNouvelleDate(parc, dateIso);
      }
    }
  }

  function trouverParcDepuisBouton(bouton) {
    const idParc = bouton.dataset.id;

    return parcsCharges.find((item) => {
      return String(item.idparc || item.id) === String(idParc);
    });
  }
}

function construireEndpointApi(cleModerne, cleLegacy, sousDomaineWorker) {
  const depuisConfig =
    CONFIG_NOUVELLE_DATE_MEMBRE?.[cleModerne] ||
    CONFIG_NOUVELLE_DATE_MEMBRE?.[cleLegacy] ||
    "";

  if (depuisConfig) {
    return String(depuisConfig).replace(/\/$/, "");
  }

  if (typeof CONFIG_NOUVELLE_DATE_MEMBRE.apiUrl === "function") {
    return CONFIG_NOUVELLE_DATE_MEMBRE.apiUrl(sousDomaineWorker).replace(/\/$/, "");
  }

  return "";
}

function construireUrlMembre(chemin) {
  const valeur = String(chemin || "");

  if (
    !valeur ||
    valeur.startsWith("#") ||
    valeur.startsWith("mailto:") ||
    valeur.startsWith("tel:") ||
    valeur.startsWith("http://") ||
    valeur.startsWith("https://")
  ) {
    return valeur;
  }

  if (typeof CONFIG_NOUVELLE_DATE_MEMBRE.membreUrl === "function") {
    return CONFIG_NOUVELLE_DATE_MEMBRE.membreUrl(valeur);
  }

  const base = (
    window.SITE_BASE ||
    CONFIG_NOUVELLE_DATE_MEMBRE.membreBaseUrl ||
    CONFIG_NOUVELLE_DATE_MEMBRE.MEMBRE_BASE ||
    ""
  ).replace(/\/$/, "");

  if (base) {
    return valeur.startsWith("/")
      ? base + valeur
      : base + "/" + valeur.replace(/^\.\//, "");
  }

  return valeur.startsWith("/") ? valeur : "/" + valeur;
}

function construireUrlPublic(chemin) {
  const valeur = String(chemin || "");

  if (
    !valeur ||
    valeur.startsWith("#") ||
    valeur.startsWith("mailto:") ||
    valeur.startsWith("tel:") ||
    valeur.startsWith("http://") ||
    valeur.startsWith("https://")
  ) {
    return valeur;
  }

  if (typeof CONFIG_NOUVELLE_DATE_MEMBRE.publicUrl === "function") {
    return CONFIG_NOUVELLE_DATE_MEMBRE.publicUrl(valeur);
  }

  const base = (
    window.ASSETS_BASE ||
    CONFIG_NOUVELLE_DATE_MEMBRE.publicBaseUrl ||
    CONFIG_NOUVELLE_DATE_MEMBRE.PUBLIC_BASE ||
    ""
  ).replace(/\/$/, "");

  if (base) {
    return valeur.startsWith("/")
      ? base + valeur
      : base + "/" + valeur.replace(/^\.\//, "");
  }

  return valeur.startsWith("/") ? valeur : "/" + valeur;
}

function construireUrlAssets(chemin) {
  const valeur = String(chemin || "");

  if (
    !valeur ||
    valeur.startsWith("#") ||
    valeur.startsWith("mailto:") ||
    valeur.startsWith("tel:") ||
    valeur.startsWith("http://") ||
    valeur.startsWith("https://")
  ) {
    return valeur;
  }

  const base = (
    window.ASSETS_BASE ||
    CONFIG_NOUVELLE_DATE_MEMBRE.publicBaseUrl ||
    CONFIG_NOUVELLE_DATE_MEMBRE.PUBLIC_BASE ||
    window.SITE_BASE ||
    ""
  ).replace(/\/$/, "");

  if (base) {
    return valeur.startsWith("/")
      ? base + valeur
      : base + "/" + valeur.replace(/^\.\//, "");
  }

  return valeur.startsWith("/") ? valeur : "/" + valeur;
}

function redirigerConnexionMembre(motif) {
  const separateur = PAGE_CONNEXION_MEMBRE.includes("?") ? "&" : "?";

  window.location.href =
    PAGE_CONNEXION_MEMBRE +
    separateur +
    "source=nouvelle-date-membre&session=" +
    encodeURIComponent(motif || "inactive");
}

function reponseApiOk(data) {
  return data && (data.ok === true || data.success === true);
}

function messageErreurApi(resultat, messageDefaut) {
  return resultat && (resultat.message || resultat.error)
    ? String(resultat.message || resultat.error)
    : messageDefaut;
}

function afficherMessageInformation(titre, message) {
  if (typeof window.afficherLightboxInformation === "function") {
    window.afficherLightboxInformation(
      titre,
      message,
      { type: "information" }
    );
    return;
  }

  alert(message);
}

function echapperHtml(valeur) {
  return String(valeur ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}