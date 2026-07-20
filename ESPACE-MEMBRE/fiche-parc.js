(() => {
  "use strict";

  const siteBase = (
    window.SITE_BASE ||
    window.SITE_CONFIG?.publicBaseUrl ||
    window.SITE_CONFIG?.siteBase ||
    ""
  ).replace(/\/$/, "");

  const config = window.SITE_CONFIG || {};
  const ficheParcBuild = "20260716-0839";
  document.documentElement.dataset.lcdpFicheParcBuild = ficheParcBuild;
  const dossierImagesParc = "/IMAG/PARC";
  const endpointNouvelleDateMembre = String(
    config.workerNouvelleDateMembreUrl ||
    config.WORKER_NOUVELLE_DATE_MEMBRE_URL ||
    (typeof config.apiUrl === "function"
      ? config.apiUrl("nouvelle-date-membre-api")
      : "")
  ).replace(/\/$/, "");

  const endpointPlanningParc = String(
    config.workerPlanningParcUrl ||
    config.WORKER_PLANNING_PARC_URL ||
    (typeof config.apiUrl === "function"
      ? config.apiUrl("planning-parc-api")
      : "")
  ).replace(/\/$/, "");

  const endpointFluxm = String(
    config.workerFluxmUrl ||
    config.WORKER_FLUXM_URL ||
    (typeof config.apiUrl === "function"
      ? config.apiUrl("fluxm-api")
      : "")
  ).replace(/\/$/, "");

  const pageConnexionMembre = construireUrlSite(
    "/ESPACE-PUBLIC/connexion-membre.html"
  );

  let pageInitialisee = false;
  let parcActif = null;
  let accesPublic = null;
  const parametresPartage = new URLSearchParams(window.location.search);
  const tokenPartage = nettoyerTexte(parametresPartage.get("token"));
  const contextePartage = nettoyerTexte(parametresPartage.get("ctx"));
  const vuePartage = nettoyerTexte(parametresPartage.get("vue")).toLowerCase();

  const etatInteraction = {
    templateShiftDetail: null,
    templateJourMois: null,
    templateHeureJour: null,
    templateCardParc: null,
    calendrier: null
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    if (pageInitialisee) {
      return;
    }

    pageInitialisee = true;
    appliquerRoutesSite(document);

    const promesseBandeau = initialiserBandeau().catch((erreur) => {
      console.warn("Bandeau public indisponible.", erreur);
    });

    const promesseFooter = initialiserFooter().catch((erreur) => {
      console.warn("Footer indisponible.", erreur);
    });

    try {
      await initialiserObjetsInteraction();

      const referenceParc = lireParcDepuisUrl();
      const fiche = await chargerFicheParc(referenceParc.idparc);
      const parc = {
        ...referenceParc,
        ...(fiche.parc || {}),
        resparc: fiche.resparc || null,
        parcsDepartement: Array.isArray(fiche.parcsDepartement)
          ? fiche.parcsDepartement
          : [],
        localitesCarte: Array.isArray(fiche.localites)
          ? fiche.localites
          : [],
        acces: fiche.acces || null
      };

      accesPublic = fiche.acces || null;

      parcActif = parc;
      await afficherFicheParc(parc);

      if (vuePartage === "planning") {
        await ouvrirShiftDetailParc(parc, "planning");
      }

      afficherStatut("", true);
    } catch (erreur) {
      console.error("Erreur fiche parc :", erreur);
      afficherStatut(
        erreur.message || "Impossible d’afficher la fiche du parc.",
        false
      );
    }

    await Promise.allSettled([
      promesseBandeau,
      promesseFooter
    ]);
  }

  function lireParcDepuisUrl() {
    const parametres = new URLSearchParams(window.location.search);

    return {
      idparc: nettoyerTexte(parametres.get("idparc")),
      nom: nettoyerTexte(
        parametres.get("nom") ||
        parametres.get("nomparc")
      ),
      dptmt: nettoyerDepartement(
        parametres.get("dptmt") ||
        parametres.get("departement")
      ),
      prez: nettoyerTexte(
        parametres.get("prez") ||
        parametres.get("presentation") ||
        parametres.get("description")
      ),
      latparc: nettoyerTexte(
        parametres.get("latparc") ||
        parametres.get("latitude")
      ),
      lngparc: nettoyerTexte(
        parametres.get("lngparc") ||
        parametres.get("longitude")
      ),
      contact: nettoyerTexte(
        parametres.get("contact") ||
        parametres.get("contactparc")
      ),
      emailparc: nettoyerTexte(
        parametres.get("emailparc") ||
        parametres.get("email")
      ),
      telparc: nettoyerTexte(
        parametres.get("telparc") ||
        parametres.get("telephone") ||
        parametres.get("tel")
      )
    };
  }

  async function chargerFicheParc(idparc) {
    const identifiant = nettoyerTexte(idparc);

    if (!identifiant) {
      throw new Error("Identifiant du parc manquant dans le lien partagé.");
    }

    if (!endpointNouvelleDateMembre) {
      throw new Error("Le service de fiche parc n’est pas configuré.");
    }

    const reponse = await fetch(
      endpointNouvelleDateMembre +
        "/fiche-parc?idparc=" +
        encodeURIComponent(identifiant) +
        "&token=" + encodeURIComponent(tokenPartage) +
        "&ctx=" + encodeURIComponent(contextePartage),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      }
    );

    const data = await reponse.json().catch(() => null);

    if (
      !reponse.ok ||
      !data ||
      (data.success !== true && data.ok !== true)
    ) {
      throw new Error(
        nettoyerTexte(data?.message) ||
        "Impossible de charger la fiche du parc."
      );
    }

    return {
      parc: data.parc || null,
      resparc: data.resparc || null,
      parcsDepartement: Array.isArray(data.parcs) ? data.parcs : [],
      localites: Array.isArray(data.localites) ? data.localites : [],
      acces: data.acces || null
    };
  }

  async function afficherFicheParc(parc) {
    const slot = document.getElementById("lcdp-fiche-parc-slot");

    if (!slot) {
      throw new Error("Slot fiche parc introuvable.");
    }

    slot.innerHTML = "";

    const [fragmentShift, fragmentFiche] = await Promise.all([
      chargerFragment("/OBJET/BOX/04-box-shift-detail-parc.html"),
      chargerFragment("/OBJET/BOX/04-box-fiche-parc.html")
    ]);

    const shift = fragmentShift.querySelector(
      "[data-lcdp-box-shift-detail-parc]"
    );
    const contenuShift = fragmentShift.querySelector(
      "[data-lcdp-shift-detail-parc-content]"
    );
    const fiche = fragmentFiche.querySelector(
      "[data-lcdp-box-fiche-parc]"
    );

    if (!shift || !contenuShift || !fiche) {
      throw new Error("Structure de la fiche parc incomplète.");
    }

    shift.classList.add("lcdp-box-shift-detail-parc--page");
    shift.removeAttribute("role");
    shift.removeAttribute("aria-modal");

    const boutonFermerShift = shift.querySelector(
      "[data-lcdp-shift-detail-parc-close]"
    );
    const boutonFermerFiche = fiche.querySelector(
      "[data-lcdp-fiche-parc-close]"
    );

    if (boutonFermerShift) boutonFermerShift.remove();
    if (boutonFermerFiche) boutonFermerFiche.remove();

    contenuShift.appendChild(fiche);
    slot.appendChild(shift);

    const nom = parc.nom || "Parc";
    const titre = fiche.querySelector(
      "[data-lcdp-fiche-parc-title]"
    );
    const actionsSlot = fiche.querySelector(
      "[data-lcdp-fiche-parc-actions]"
    );
    const presentationElement = fiche.querySelector(
      "[data-lcdp-fiche-parc-presentation]"
    );
    const galerieSlot = fiche.querySelector(
      "[data-lcdp-fiche-parc-galerie-slot]"
    );
    const carteSlot = fiche.querySelector(
      "[data-lcdp-fiche-parc-map-slot]"
    );
    const contactElement = fiche.querySelector(
      "[data-lcdp-fiche-parc-contact]"
    );
    const accesElement = fiche.querySelector(
      "[data-lcdp-fiche-parc-acces]"
    );

    if (titre) {
      titre.textContent = "Parc de " + nom;
    }

    document.title =
      "Parc de " + nom + " - La Clé du Parc";

    if (actionsSlot) {
      actionsSlot.innerHTML = "";
      actionsSlot.appendChild(
        creerActionsFicheParc(parc)
      );
    }

    await remplacerSectionParBoxText(
      presentationElement?.closest(
        ".lcdp-box-fiche-parc__section"
      ),
      "Présentation",
      parc.prez || "Présentation non renseignée."
    );

    await ajouterGalerieParc(galerieSlot, parc);
    await ajouterCarteParc(carteSlot, parc);

    await remplacerSectionParBoxText(
      contactElement?.closest(
        ".lcdp-box-fiche-parc__section"
      ),
      "Contact",
      construireTexteContactParc(parc)
    );

    await remplacerSectionParBoxText(
      accesElement?.closest(
        ".lcdp-box-fiche-parc__section"
      ),
      "Accès",
      construireTexteAccesParc(parc)
    );

    appliquerRoutesSite(slot);
  }

  async function remplacerSectionParBoxText(
    section,
    titre,
    contenu
  ) {
    if (!section) {
      throw new Error(
        "Section " + titre + " introuvable."
      );
    }

    section.innerHTML = "";

    const titreSection = document.createElement("h3");
    titreSection.textContent = titre;
    section.appendChild(titreSection);

    const fragment = await chargerFragment(
      "/OBJET/BOX/01-box-text.html"
    );

    const box = fragment.querySelector(
      "[data-lcdp-boxtext]"
    );
    const titreObjet = fragment.querySelector(
      "[data-lcdp-boxtext-title]"
    );
    const contenuObjet = fragment.querySelector(
      "[data-lcdp-boxtext-content]"
    );

    if (!box || !titreObjet || !contenuObjet) {
      throw new Error(
        "Structure de la Box Text incomplète."
      );
    }

    titreObjet.textContent = titre;
    box.classList.add(
      "lcdp-box-fiche-parc__box-text"
    );

    remplirParagraphes(contenuObjet, contenu);
    section.appendChild(fragment);
  }

  function remplirParagraphes(conteneur, texte) {
    conteneur.innerHTML = "";

    const lignes = String(texte || "")
      .split("\n")
      .map(nettoyerTexte)
      .filter(Boolean);

    if (!lignes.length) {
      lignes.push("Non renseigné.");
    }

    lignes.forEach((ligne) => {
      const paragraphe = document.createElement("p");
      paragraphe.textContent = ligne;
      conteneur.appendChild(paragraphe);
    });
  }

  async function ajouterGalerieParc(slot, parc) {
    if (!slot) {
      throw new Error(
        "Slot galerie fiche parc introuvable."
      );
    }

    if (
      typeof window.LCDP_ajouterGalerie !==
      "function"
    ) {
      throw new Error(
        "Objet galerie V3 introuvable."
      );
    }

    const nom = parc.nom || "Parc";
    const cartes = [];

    for (let index = 1; index <= 6; index += 1) {
      const numero = String(index).padStart(2, "0");

      cartes.push({
        titre: "",
        imageSrc: construireCheminImageParc(
          parc,
          numero + ".jpg"
        ),
        imageAlt:
          "Photo " +
          numero +
          " du parc de " +
          nom,
        imageLegende: "",
        texte: ""
      });
    }

    await window.LCDP_ajouterGalerie(
      slot,
      {
        titre: "",
        ariaLabel: "Galerie photo du parc",
        cartes
      }
    );
  }
  async function ajouterCarteParc(slot, parc) {
    if (!slot) {
      throw new Error("Slot carte fiche parc introuvable.");
    }

    slot.innerHTML = "";

    const [fragment, reponseGeojson] = await Promise.all([
      chargerFragment("/OBJET/BOX/04-carte-dynamique.html"),
      fetch(construireUrlSite("/OBJET/BOX/04-carte-dynamique.geojson"), {
        method: "GET",
        credentials: "same-origin",
        cache: "no-cache",
        headers: { "Accept": "application/geo+json, application/json" }
      })
    ]);

    if (!reponseGeojson.ok) {
      throw new Error("GeoJSON de la carte introuvable.");
    }

    const geojson = await reponseGeojson.json();
    const carte = fragment.querySelector("[data-lcdp-carte-dynamique]");

    if (!carte) {
      throw new Error("Structure de la carte dynamique incomplète.");
    }

    carte.classList.add("lcdp-carte-dynamique--fiche-parc");
    slot.appendChild(carte);

    const entete = carte.querySelector(".lcdp-carte-dynamique__header");
    const filtres = carte.querySelector("[data-lcdp-carte-filters]");
    const statut = carte.querySelector("[data-lcdp-carte-status]");
    const svg = carte.querySelector("[data-lcdp-carte-svg]");
    const coucheDepartements = carte.querySelector("[data-lcdp-carte-departements-layer]");
    const coucheSelection = carte.querySelector("[data-lcdp-carte-selection-layer]");
    const coucheLocalites = carte.querySelector("[data-lcdp-carte-localites-layer]");
    const coucheParcs = carte.querySelector("[data-lcdp-carte-parcs-layer]");
    const boutonZoomPlus = carte.querySelector("[data-lcdp-carte-zoom-plus]");
    const boutonZoomMoins = carte.querySelector("[data-lcdp-carte-zoom-moins]");
    const cardSlot = carte.querySelector("[data-lcdp-carte-card-slot]");

    if (
      !svg ||
      !coucheDepartements ||
      !coucheSelection ||
      !coucheLocalites ||
      !coucheParcs ||
      !boutonZoomPlus ||
      !boutonZoomMoins ||
      !cardSlot
    ) {
      throw new Error("Structure SVG de la carte dynamique incomplète.");
    }

    if (entete) entete.hidden = true;
    if (filtres) filtres.hidden = true;
    if (statut) statut.hidden = true;
    cardSlot.hidden = true;

    svg.setAttribute("focusable", "false");
    svg.setAttribute("tabindex", "-1");

    const codeDepartement = nettoyerDepartement(parc.dptmt || parc.departement);
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    const traces = [];

    features.forEach((feature) => {
      const code = nettoyerDepartement(feature?.properties?.code);
      const trace = construireTraceGeometrie(feature?.geometry);

      if (code && trace) {
        traces.push({ feature, code, trace });
      }
    });

    if (!traces.length) {
      throw new Error("Données cartographiques incomplètes.");
    }

    coucheDepartements.innerHTML = "";
    coucheSelection.innerHTML = "";
    coucheLocalites.innerHTML = "";
    coucheParcs.innerHTML = "";
    carte.querySelectorAll(".lcdp-carte-dynamique__marker-actif-halo").forEach((element) => element.remove());

    traces.forEach(({ code, trace }) => {
      const path = creerElementSvg("path");
      path.setAttribute("d", trace.d);
      path.setAttribute("class", "lcdp-carte-dynamique__departement");
      path.dataset.code = code;
      coucheDepartements.appendChild(path);

      if (code === codeDepartement) {
        const selection = creerElementSvg("path");
        selection.setAttribute("d", trace.d);
        selection.setAttribute(
          "class",
          "lcdp-carte-dynamique__departement-selection"
        );
        coucheSelection.appendChild(selection);
      }
    });

    const traceSelectionnee = traces.find((item) => item.code === codeDepartement);
    const bboxFrance = fusionnerBbox(traces.map((item) => item.trace.bbox));
    const bboxCible = traceSelectionnee?.trace?.bbox || bboxFrance;
    const viewBoxInitiale = bboxVersViewBox(
      bboxCible,
      traceSelectionnee ? 0.24 : 0.045
    );

    if (!viewBoxInitiale) {
      throw new Error("Emprise cartographique inexploitable.");
    }

    let viewBoxCourante = [...viewBoxInitiale];
    const viewBoxLimite = bboxVersViewBox(bboxFrance, 0.045) || [...viewBoxInitiale];

    function appliquerViewBox() {
      svg.setAttribute("viewBox", viewBoxCourante.join(" "));
      actualiserTailleElementsCarte();
    }

    function actualiserTailleElementsCarte() {
      const largeurMesuree = svg.getBoundingClientRect().width || svg.clientWidth || 800;
      const largeurEcran = Math.max(320, largeurMesuree);
      const uniteEcran = viewBoxCourante[2] / largeurEcran;
      const rayonParc = Math.max(0.04, uniteEcran * 6);
      const rayonLocalite = Math.max(0.035, uniteEcran * 4.2);
      const tailleLibelle = Math.max(0.12, uniteEcran * 11);
      const decalageLibelle = Math.max(0.08, uniteEcran * 7);

      coucheParcs
        .querySelectorAll(".lcdp-carte-dynamique__marker")
        .forEach((marker) => marker.setAttribute("r", String(rayonParc)));

      coucheLocalites
        .querySelectorAll(".lcdp-carte-dynamique__localite-marker")
        .forEach((marker) => marker.setAttribute("r", String(rayonLocalite)));

      coucheLocalites
        .querySelectorAll(".lcdp-carte-dynamique__localite-label")
        .forEach((libelle) => {
          const x = Number(libelle.dataset.pointX);
          libelle.setAttribute("font-size", String(tailleLibelle));
          libelle.setAttribute("x", String(x + decalageLibelle));
        });
    }

    function zoomer(facteur) {
      const [x, y, largeur, hauteur] = viewBoxCourante;
      const centreX = x + largeur / 2;
      const centreY = y + hauteur / 2;
      const largeurMin = Math.max(0.25, viewBoxInitiale[2] / 12);
      const hauteurMin = Math.max(0.25, viewBoxInitiale[3] / 12);
      const largeurFinale = Math.min(
        viewBoxLimite[2],
        Math.max(largeurMin, largeur * facteur)
      );
      const hauteurFinale = Math.min(
        viewBoxLimite[3],
        Math.max(hauteurMin, hauteur * facteur)
      );

      viewBoxCourante = [
        centreX - largeurFinale / 2,
        centreY - hauteurFinale / 2,
        largeurFinale,
        hauteurFinale
      ];
      appliquerViewBox();
    }

    boutonZoomPlus.addEventListener("click", () => zoomer(0.82));
    boutonZoomMoins.addEventListener("click", () => zoomer(1.22));

    let glissement = null;

    svg.addEventListener("pointerdown", (event) => {
      const cible = event.target instanceof Element ? event.target : null;

      if (cible?.closest(".lcdp-carte-dynamique__marker")) {
        return;
      }

      svg.setPointerCapture(event.pointerId);
      glissement = {
        x: event.clientX,
        y: event.clientY,
        viewBox: [...viewBoxCourante]
      };
      svg.classList.add("is-dragging");
    });

    svg.addEventListener("pointermove", (event) => {
      if (!glissement) return;

      const largeurEcran = Math.max(1, svg.getBoundingClientRect().width);
      const hauteurEcran = Math.max(1, svg.getBoundingClientRect().height);
      const dx = (event.clientX - glissement.x) * glissement.viewBox[2] / largeurEcran;
      const dy = (event.clientY - glissement.y) * glissement.viewBox[3] / hauteurEcran;

      viewBoxCourante = [
        glissement.viewBox[0] - dx,
        glissement.viewBox[1] - dy,
        glissement.viewBox[2],
        glissement.viewBox[3]
      ];
      appliquerViewBox();
    });

    function terminerGlissement(event) {
      if (
        glissement &&
        event?.pointerId !== undefined &&
        svg.hasPointerCapture(event.pointerId)
      ) {
        svg.releasePointerCapture(event.pointerId);
      }
      glissement = null;
      svg.classList.remove("is-dragging");
    }

    svg.addEventListener("pointerup", terminerGlissement);
    svg.addEventListener("pointercancel", terminerGlissement);
    window.addEventListener("resize", actualiserTailleElementsCarte);

    (Array.isArray(parc.localitesCarte) ? parc.localitesCarte : [])
      .forEach((localite) => {
        const point = projeterCoordonnee(
          localite.longitude,
          localite.latitude
        );

        if (!point) return;

        const groupe = creerElementSvg("g");
        groupe.setAttribute("aria-hidden", "true");

        const marker = creerElementSvg("circle");
        marker.setAttribute("cx", String(point.x));
        marker.setAttribute("cy", String(point.y));
        marker.setAttribute("r", "0.1");
        marker.setAttribute(
          "class",
          "lcdp-carte-dynamique__localite-marker"
        );

        const libelle = creerElementSvg("text");
        libelle.setAttribute("x", String(point.x));
        libelle.setAttribute("y", String(point.y));
        libelle.setAttribute("dominant-baseline", "middle");
        libelle.setAttribute(
          "class",
          "lcdp-carte-dynamique__localite-label"
        );
        libelle.dataset.pointX = String(point.x);
        libelle.textContent = String(localite.nom || "")
          .trim()
          .toLocaleUpperCase("fr");

        groupe.appendChild(marker);
        groupe.appendChild(libelle);
        coucheLocalites.appendChild(groupe);
      });

    function fermerCardParc() {
      cardSlot.innerHTML = "";
      cardSlot.hidden = true;
      cardSlot.classList.remove("is-open");
      cardSlot.style.removeProperty("display");
    }

    function ouvrirFicheParcDepuisCarte(parcCarte) {
      const idparc = nettoyerTexte(parcCarte?.idparc || parcCarte?.id);

      if (!idparc) {
        return;
      }

      const url = construireUrlAvecParc(
        construireUrlSite("/ESPACE-PUBLIC/fiche-parc.html"),
        parcCarte,
        {}
      );

      window.location.href = url;
    }

    function construireUrlImageCardParc(parcCarte) {
      const chemin = construireCheminImageParc(parcCarte, "card1.webp");

      if (!chemin || chemin.endsWith("/parc-defaut.webp")) {
        return "";
      }

      return construireUrlSite("/OBJET" + chemin);
    }

    function ouvrirCardParc(parcCarte) {
      const card = etatInteraction.templateCardParc.cloneNode(true);
      const image = card.querySelector("[data-lcdp-card-parc-image]");
      const media = card.querySelector(".lcdp-box-card-parc__media");
      const titre = card.querySelector("[data-lcdp-card-parc-title]");
      const meta = card.querySelector("[data-lcdp-card-parc-meta]");
      const description = card.querySelector("[data-lcdp-card-parc-description]");
      const badgePrepa = card.querySelector("[data-lcdp-card-parc-badge-prepa]");
      const boutonFiche = card.querySelector("[data-action='ouvrir-fiche-parc']");
      const boutonPlanning = card.querySelector("[data-action='voir-planning-parc']");
      const boutonReserver = card.querySelector("[data-action='nouvelle-date-parc']");

      if (titre) {
        titre.textContent = nettoyerTexte(parcCarte?.nom) || "Parc";
      }

      if (meta) {
        const departement = nettoyerDepartement(
          parcCarte?.dptmt || parcCarte?.departement
        );
        meta.textContent = departement ? "Département " + departement : "";
      }

      if (description) {
        description.hidden = true;
        description.textContent = "";
      }

      if (badgePrepa) {
        badgePrepa.hidden =
          nettoyerTexte(parcCarte?.statut).toLowerCase() !== "prepa";
      }

      if (image) {
        const src = construireUrlImageCardParc(parcCarte);

        if (src) {
          image.src = src;
          image.alt = "Image du parc " + (nettoyerTexte(parcCarte?.nom) || "");
          image.addEventListener(
            "error",
            () => {
              if (media) {
                media.hidden = true;
              }
            },
            { once: true }
          );
        } else if (media) {
          media.hidden = true;
        }
      }

      if (boutonFiche) {
        boutonFiche.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          ouvrirFicheParcDepuisCarte(parcCarte);
        });
      }

      if (boutonPlanning) {
        boutonPlanning.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          fermerCardParc();
          ouvrirPlanningPublic(parcCarte);
        });
      }

      if (boutonReserver) {
        boutonReserver.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          fermerCardParc();
          ouvrirReservationMembre(parcCarte);
        });
      }

      const boutonFermerCard = document.createElement("button");
      boutonFermerCard.type = "button";
      boutonFermerCard.className = "lcdp-carte-dynamique__card-close";
      boutonFermerCard.textContent = "×";
      boutonFermerCard.setAttribute("aria-label", "Fermer la Card Parc");
      boutonFermerCard.addEventListener("click", fermerCardParc);

      cardSlot.replaceChildren(boutonFermerCard, card);
      cardSlot.hidden = false;
      cardSlot.removeAttribute("hidden");
      cardSlot.classList.add("is-open");
      cardSlot.style.display = "block";
      boutonFermerCard.focus({ preventScroll: true });
    }

    const idParcActif = nettoyerTexte(parc.idparc || parc.id);
    const parcsDepartement = Array.isArray(parc.parcsDepartement) && parc.parcsDepartement.length
      ? parc.parcsDepartement
      : [parc];
    const parcsCarteParId = new Map();

    parcsDepartement.forEach((parcCarte) => {
      const idparc = nettoyerTexte(parcCarte?.idparc || parcCarte?.id);

      if (idparc) {
        parcsCarteParId.set(idparc, parcCarte);
      }
    });

    function obtenirMarqueurDepuisEvenement(event) {
      const cible = event.target instanceof Element ? event.target : null;
      return cible?.closest(".lcdp-carte-dynamique__marker") || null;
    }

    svg.addEventListener("pointerdown", (event) => {
      if (!obtenirMarqueurDepuisEvenement(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }, true);

    svg.addEventListener("mousedown", (event) => {
      if (!obtenirMarqueurDepuisEvenement(event)) {
        return;
      }

      event.preventDefault();
    }, true);

    svg.addEventListener("click", (event) => {
      const marker = obtenirMarqueurDepuisEvenement(event);

      if (!marker) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const idparc = nettoyerTexte(marker.dataset.idparc);
      const parcCarte = parcsCarteParId.get(idparc);

      if (parcCarte) {
        ouvrirCardParc(parcCarte);
      }

      const elementActif = document.activeElement;
      if (elementActif && typeof elementActif.blur === "function") {
        elementActif.blur();
      }
    });

    function ajouterMarqueurParc(parcCarte, estParcActif) {
      const longitude = parcCarte.lngparc ?? parcCarte.longitude ?? parcCarte.lngloc;
      const latitude = parcCarte.latparc ?? parcCarte.latitude ?? parcCarte.latloc;
      const point = projeterCoordonnee(longitude, latitude);

      if (!point) return;

      const idparc = nettoyerTexte(parcCarte.idparc || parcCarte.id);
      const groupe = creerElementSvg("g");
      groupe.dataset.idparc = idparc;

      const marker = creerElementSvg("circle");
      marker.setAttribute("cx", String(point.x));
      marker.setAttribute("cy", String(point.y));
      marker.setAttribute("r", "0.1");
      marker.setAttribute("class", "lcdp-carte-dynamique__marker");
      marker.style.pointerEvents = "all";
      marker.style.cursor = "pointer";
      marker.dataset.idparc = idparc;
      marker.dataset.statut = nettoyerTexte(parcCarte.statut).toLowerCase();
      marker.classList.toggle("is-validcarte", parcCarte.validcarte === true);
      marker.classList.toggle(
        "lcdp-carte-dynamique__marker--parc-actif",
        estParcActif
      );

      /* Le marqueur reste un élément graphique pur.
         Le clic est traité par délégation sur le SVG afin que Chrome
         ne lui applique jamais de surface de focus blanche. */
      marker.setAttribute("focusable", "false");
      marker.setAttribute("tabindex", "-1");
      marker.setAttribute("aria-hidden", "true");
      marker.removeAttribute("role");
      marker.removeAttribute("aria-label");

      groupe.appendChild(marker);
      coucheParcs.appendChild(groupe);
    }

    const parcsSecondaires = [];
    let parcCourant = null;

    parcsDepartement.forEach((parcCarte) => {
      const idparc = nettoyerTexte(parcCarte.idparc || parcCarte.id);

      if (idparc && idparc === idParcActif) {
        parcCourant = parcCarte;
        return;
      }

      parcsSecondaires.push(parcCarte);
    });

    parcsSecondaires.forEach((parcCarte) => {
      ajouterMarqueurParc(parcCarte, false);
    });

    ajouterMarqueurParc(parcCourant || parc, true);

    svg.setAttribute(
      "aria-label",
      "Carte du département " + (codeDepartement || "du parc")
    );

    coucheParcs.addEventListener("click", (event) => {
      const cible = event.target instanceof Element ? event.target : null;
      const marker = cible?.closest(".lcdp-carte-dynamique__marker");

      if (!marker) {
        return;
      }

      const parcCarte = parcsCarteParId.get(nettoyerTexte(marker.dataset.idparc));

      if (!parcCarte) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      ouvrirCardParc(parcCarte);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !cardSlot.hidden) {
        fermerCardParc();
      }
    });

    appliquerViewBox();
  }

  function projeterCoordonnee(longitude, latitude) {
    const lon = Number(longitude);
    const lat = Number(latitude);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return null;
    }

    const latitudeBornee = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const latitudeRadians = latitudeBornee * Math.PI / 180;
    const sinus = Math.sin(latitudeRadians);

    return {
      x: ((lon + 180) / 360) * 1000,
      y: (0.5 - Math.log((1 + sinus) / (1 - sinus)) / (4 * Math.PI)) * 1000
    };
  }

  function construireTraceGeometrie(geometry) {
    const type = String(geometry?.type || "");
    const coordinates = geometry?.coordinates;
    const parties = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    function ajouterAnneau(anneau) {
      if (!Array.isArray(anneau) || anneau.length < 3) return;

      const points = anneau
        .map((coord) => projeterCoordonnee(coord?.[0], coord?.[1]))
        .filter(Boolean);

      if (points.length < 3) return;

      points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });

      parties.push(
        "M " + points.map((point) => point.x.toFixed(4) + " " + point.y.toFixed(4)).join(" L ") + " Z"
      );
    }

    if (type === "Polygon" && Array.isArray(coordinates)) {
      coordinates.forEach(ajouterAnneau);
    } else if (type === "MultiPolygon" && Array.isArray(coordinates)) {
      coordinates.forEach((polygone) => {
        if (Array.isArray(polygone)) polygone.forEach(ajouterAnneau);
      });
    }

    if (!parties.length || ![minX, minY, maxX, maxY].every(Number.isFinite)) {
      return null;
    }

    return { d: parties.join(" "), bbox: [minX, minY, maxX, maxY] };
  }

  function fusionnerBbox(boxes) {
    const valides = boxes.filter((bbox) => Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite));
    if (!valides.length) return null;

    return [
      Math.min(...valides.map((bbox) => bbox[0])),
      Math.min(...valides.map((bbox) => bbox[1])),
      Math.max(...valides.map((bbox) => bbox[2])),
      Math.max(...valides.map((bbox) => bbox[3]))
    ];
  }

  function bboxVersViewBox(bbox, ratioMarge = 0.12) {
    if (!bbox) return null;

    const largeur = Math.max(0.5, bbox[2] - bbox[0]);
    const hauteur = Math.max(0.5, bbox[3] - bbox[1]);
    const marge = Math.max(0.35, Math.max(largeur, hauteur) * ratioMarge);

    return [
      bbox[0] - marge,
      bbox[1] - marge,
      largeur + marge * 2,
      hauteur + marge * 2
    ];
  }

  function creerElementSvg(nom) {
    return document.createElementNS("http://www.w3.org/2000/svg", nom);
  }

  function creerActionsFicheParc(parc) {
    const actions = document.createElement("div");
    actions.className =
      "lcdp-box-fiche-parc__actions-list";

    const boutonReserver =
      document.createElement("button");

    boutonReserver.type = "button";
    boutonReserver.className =
      "lcdp-button " +
      "lcdp-box-calendrier-mois__action-reserver " +
      "lcdp-box-fiche-parc__action-reserver";
    boutonReserver.textContent = "RÉSERVER";

    boutonReserver.addEventListener("click", () => {
      ouvrirReservationMembre(parc);
    });

    const boutonPlanning =
      document.createElement("button");

    boutonPlanning.type = "button";
    boutonPlanning.className =
      "lcdp-button lcdp-button-primary " +
      "lcdp-box-fiche-parc__action-planning";
    boutonPlanning.textContent = "Planning parc";

    boutonPlanning.addEventListener("click", () => {
      ouvrirPlanningPublic(parc);
    });

    const actionPartager =
      creerActionPartagerFicheParc();

    actionPartager.addEventListener(
      "click",
      () => {
        partagerFicheParc(parc).catch(
          console.error
        );
      }
    );

    actions.appendChild(boutonReserver);
    actions.appendChild(boutonPlanning);
    actions.appendChild(actionPartager);

    return actions;
  }

  function creerActionPartagerFicheParc() {
    const action = document.createElement("span");
    action.className =
      "lcdp-box-fiche-parc__partage";
    action.setAttribute("role", "button");
    action.setAttribute("tabindex", "0");
    action.setAttribute(
      "aria-label",
      "Partager la page"
    );

    const bouton = document.createElement("span");
    bouton.className =
      "lcdp-box-fiche-parc__partage-icone";
    bouton.setAttribute("aria-hidden", "true");

    const icone = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );

    icone.setAttribute("viewBox", "0 0 24 24");
    icone.setAttribute("width", "20");
    icone.setAttribute("height", "20");
    icone.setAttribute("aria-hidden", "true");
    icone.setAttribute("focusable", "false");
    icone.setAttribute("fill", "none");
    icone.setAttribute(
      "stroke",
      "currentColor"
    );
    icone.setAttribute("stroke-width", "2");
    icone.setAttribute(
      "stroke-linecap",
      "round"
    );
    icone.setAttribute(
      "stroke-linejoin",
      "round"
    );

    const trace = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );

    trace.setAttribute("d", "M22 2 11 13");

    const trace2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );

    trace2.setAttribute(
      "d",
      "M22 2 15 22 11 13 2 9 22 2Z"
    );

    icone.appendChild(trace);
    icone.appendChild(trace2);
    bouton.appendChild(icone);

    const libelle = document.createElement("span");
    libelle.className =
      "lcdp-box-fiche-parc__partage-libelle";
    libelle.textContent = "Partager la page";

    action.appendChild(bouton);
    action.appendChild(libelle);

    action.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          action.click();
        }
      }
    );

    return action;
  }

  async function initialiserObjetsInteraction() {
    const [fragmentShift, fragmentJour, fragmentHeure, fragmentCardParc] = await Promise.all([
      chargerFragment("/OBJET/BOX/04-box-shift-detail-parc.html"),
      chargerFragment("/OBJET/BOX/04-box-card-jour-in-calendrier-mois.html"),
      chargerFragment("/OBJET/BOX/04-box-card-heure-in-calendrier-jour.html"),
      chargerFragment("/OBJET/BOX/04-box-card-parc.html")
    ]);

    etatInteraction.templateShiftDetail = fragmentShift.querySelector(
      "[data-lcdp-box-shift-detail-parc]"
    );
    etatInteraction.templateJourMois = fragmentJour.querySelector(
      "[data-lcdp-card-jour-mois]"
    );
    etatInteraction.templateHeureJour = fragmentHeure.querySelector(
      "[data-lcdp-card-heure-jour]"
    );
    etatInteraction.templateCardParc = fragmentCardParc.querySelector(
      "[data-lcdp-box-card-parc]"
    );

    if (
      !etatInteraction.templateShiftDetail ||
      !etatInteraction.templateJourMois ||
      !etatInteraction.templateHeureJour ||
      !etatInteraction.templateCardParc
    ) {
      throw new Error("Objets fiche, planning et réservation incomplets.");
    }
  }

  async function ouvrirReservationMembre(parc) {
    const acces = parc?.acces || accesPublic || {};

    if (acces.peutReserver === true) {
      const page = construireUrlSite("/ESPACE-MEMBRE/reserver-membre.html");
      const url = new URL(page, window.location.href);
      url.searchParams.set("idparc", nettoyerTexte(parc?.idparc || parc?.id));
      url.searchParams.set("source", "fiche-parc");
      window.location.href = url.toString();
      return;
    }

    await afficherBlocageReservationPublique(acces);
  }

  async function afficherBlocageReservationPublique(acces) {
    const message = "Vous devez être membre abonné pour utiliser la fonction RESERVER. Et être à jour du paiement de vos échéances si cela n'est pas votre cas.";
    const detail = document.querySelector("[data-lcdp-box-shift-detail-parc]");
    const slot = detail?.querySelector("[data-lcdp-shift-detail-parc-alerte-slot]");

    if (!slot) {
      window.alert(message);
      return;
    }

    slot.innerHTML = "";
    const box = document.createElement("div");
    box.className = "lcdp-box-shift-detail-parc__alerte-box";
    const texte = document.createElement("p");
    texte.className = "lcdp-box-shift-detail-parc__alerte-message";
    texte.textContent = message;
    const actions = document.createElement("div");
    actions.className = "lcdp-fiche-parc__dialogue-actions";

    if (acces?.actionSecondaire === "abonnement") {
      actions.appendChild(creerBoutonCommande("Abonnement", "lcdp-button-secondary", () => {
        window.location.href = construireUrlSite("/ESPACE-MEMBRE/abonnement-membre.html");
      }));
    }

    if (acces?.actionSecondaire === "regulariser" && acces?.orderid) {
      actions.appendChild(creerBoutonCommande("Régulariser", "lcdp-button-secondary", () => {
        const page = construireUrlSite("/ESPACE-MEMBRE/paiement-cb.html");
        const url = new URL(page, window.location.href);
        url.searchParams.set("orderid", acces.orderid);
        url.searchParams.set("echeance", String(acces.echeance || 1));
        url.searchParams.set("source", "suspension");
        window.location.href = url.toString();
      }));
    }

    actions.appendChild(creerBoutonCommande("OK", "lcdp-button-primary", () => {
      slot.innerHTML = "";
    }));
    box.append(texte, actions);
    slot.appendChild(box);
  }

  function ouvrirPlanningPublic(parc) {
    ouvrirShiftDetailParc(parc, "planning").catch(console.error);
  }
  async function ouvrirShiftDetailParc(parc, vue) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      throw new Error("Slot lightbox introuvable.");
    }

    const shift = etatInteraction.templateShiftDetail.cloneNode(true);
    const contenu = shift.querySelector("[data-lcdp-shift-detail-parc-content]");
    const boutonFermer = shift.querySelector("[data-lcdp-shift-detail-parc-close]");

    if (!contenu || !boutonFermer) {
      throw new Error("Structure Shift Detail Parc incomplète.");
    }

    const fermer = () => {
      fermerShiftDetailParcEnDouceur(slot, shift).catch(console.error);
    };

    boutonFermer.addEventListener("click", fermer);
    shift.addEventListener("click", (event) => {
      if (event.target === shift) fermer();
    });

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && slot.contains(shift)) fermer();
      },
      { once: true }
    );

    await afficherVueShiftDetailParc(contenu, parc, vue);
    slot.replaceChildren(shift);
    requestAnimationFrame(() => {
      shift.classList.add("lcdp-box-shift-detail-parc--visible");
    });
  }
  async function afficherVueShiftDetailParc(contenu, parc, vue) {
    if (!contenu) return;

    const ancienneVue = contenu.querySelector(
      ":scope > .lcdp-fiche-parc__shift-view"
    );
    const nouvelleVue = document.createElement("div");
    nouvelleVue.className =
      "lcdp-fiche-parc__shift-view lcdp-fiche-parc__shift-view--enter";

    await afficherCalendrierMoisParcDansShift(
      nouvelleVue,
      parc,
      vue
    );

    const hauteurCourante = ancienneVue
      ? ancienneVue.getBoundingClientRect().height
      : contenu.getBoundingClientRect().height;

    if (hauteurCourante > 0) {
      contenu.style.minHeight = hauteurCourante + "px";
    }

    contenu.appendChild(nouvelleVue);

    requestAnimationFrame(() => {
      if (ancienneVue) {
        ancienneVue.classList.add("lcdp-fiche-parc__shift-view--leave");
      }
      nouvelleVue.classList.remove("lcdp-fiche-parc__shift-view--enter");
    });

    await attendre(180);

    if (ancienneVue) {
      ancienneVue.remove();
    }

    contenu.style.minHeight = "";
  }
  async function afficherCalendrierMoisParcDansShift(contenu, parc, mode) {
    const fragment = await chargerFragment("/OBJET/BOX/04-box-calendrier-mois.html");
    contenu.appendChild(fragment);

    const calendrier = contenu.querySelector("[data-lcdp-box-calendrier-mois]");
    const commande = contenu.querySelector("[data-lcdp-calendrier-mois-commande]");
    const titre = contenu.querySelector("[data-lcdp-calendrier-mois-title]");
    const meta = contenu.querySelector("[data-lcdp-calendrier-mois-meta]");
    const boutonFermer = contenu.querySelector("[data-lcdp-calendrier-mois-close]");
    const boutonPrecedent = contenu.querySelector("[data-lcdp-calendrier-mois-prev]");
    const boutonSuivant = contenu.querySelector("[data-lcdp-calendrier-mois-next]");
    const grille = contenu.querySelector("[data-lcdp-calendrier-mois-grid]");

    if (
      !calendrier || !commande || !titre || !meta || !boutonFermer ||
      !boutonPrecedent || !boutonSuivant || !grille
    ) {
      throw new Error("Structure calendrier mensuel incomplète.");
    }

    calendrier.classList.add("lcdp-box-calendrier-mois--shift-detail");
    calendrier.dataset.lcdpModeFicheParc = mode;

    const nomParc = parc.nom || parc.nomparc || "Parc";
    const departement = nettoyerDepartement(parc.dptmt || parc.departement);

    titre.textContent =
      "Parc de " + nomParc + (departement ? " - " + departement : "");
    meta.hidden = true;
    meta.textContent = "";
    boutonFermer.hidden = true;

    titre.insertAdjacentElement("afterend", commande);
    commande.classList.add("lcdp-fiche-parc__commande-detail");
    commande.innerHTML = "";

    const boutonFiche = creerBoutonCommande(
      "Fiche parc",
      "lcdp-button-secondary",
      () => {
        const slot = document.getElementById("lcdp-lightbox-slot");
        const shift = slot?.querySelector("[data-lcdp-box-shift-detail-parc]");
        if (slot && shift) {
          fermerShiftDetailParcEnDouceur(slot, shift).catch(console.error);
        }
      }
    );

    if (mode === "planning") {
      const boutonReserver = creerBoutonCommande(
        "RÉSERVER",
        "lcdp-box-calendrier-mois__action-reserver",
        () => afficherVueShiftDetailParc(contenu.parentElement, parc, "reservation")
      );
      const actionPartager = creerActionPartagerFicheParc();
      actionPartager.addEventListener("click", () => {
        partagerFicheParc(parc).catch(console.error);
      });

      commande.appendChild(boutonReserver);
      commande.appendChild(actionPartager);
      commande.appendChild(boutonFiche);
    } else {
      const boutonPlanning = creerBoutonCommande(
        "Planning parc",
        "lcdp-button-primary",
        () => afficherVueShiftDetailParc(contenu.parentElement, parc, "planning")
      );

      commande.appendChild(boutonFiche);
      commande.appendChild(boutonPlanning);
    }

    const maintenant = new Date();
    etatInteraction.calendrier = {
      parc,
      mode,
      annee: maintenant.getFullYear(),
      mois: maintenant.getMonth() + 1,
      planning: [],
      contenu
    };

    boutonPrecedent.addEventListener("click", () => {
      changerMois(etatInteraction.calendrier, -1);
      afficherCalendrierMoisActif().catch(console.error);
    });

    boutonSuivant.addEventListener("click", () => {
      changerMois(etatInteraction.calendrier, 1);
      afficherCalendrierMoisActif().catch(console.error);
    });

    grille.addEventListener("click", (event) => {
      const card = event.target.closest("[data-lcdp-card-jour-mois]");
      if (!card || card.disabled || mode !== "reservation") return;
      ouvrirCalendrierJourDepuisCard(card).catch(console.error);
    });

    await afficherCalendrierMoisActif();
  }

  async function fermerShiftDetailParcEnDouceur(slot, shift) {
    if (!slot || !shift) return;

    shift.classList.add("lcdp-box-shift-detail-parc--closing");
    await attendre(160);

    if (slot.contains(shift)) {
      slot.innerHTML = "";
    }

    etatInteraction.calendrier = null;
  }

  function creerBoutonCommande(label, style, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button " + style;
    bouton.textContent = label;
    bouton.addEventListener("click", action);
    return bouton;
  }
  async function afficherCalendrierMoisActif() {
    const etat = etatInteraction.calendrier;
    if (!etat || !etat.contenu) return;

    const moisCourant = etat.contenu.querySelector("[data-lcdp-calendrier-mois-current]");
    const message = etat.contenu.querySelector("[data-lcdp-calendrier-mois-message]");
    const grille = etat.contenu.querySelector("[data-lcdp-calendrier-mois-grid]");

    if (!moisCourant || !message || !grille) return;

    moisCourant.textContent = formaterMoisAnnee(etat.annee, etat.mois);
    message.hidden = true;
    message.textContent = "";
    grille.classList.add("lcdp-box-calendrier-mois__grid--loading");

    try {
      const planning = await chargerPlanningParcMois(etat);
      etat.planning = planning;
      remplirGrilleCalendrier(grille, etat, planning);
    } catch (error) {
      console.error("Erreur planning parc :", error);
      message.hidden = false;
      message.textContent = error.message || "Impossible de charger le planning du parc.";
    } finally {
      grille.classList.remove("lcdp-box-calendrier-mois__grid--loading");
    }
  }

  async function chargerPlanningParcMois(etat) {
    const endpoint = etat.mode === "reservation"
      ? endpointNouvelleDateMembre
      : endpointPlanningParc;

    if (!endpoint) {
      throw new Error("Le service planning parc n’est pas configuré.");
    }

    const idparc = nettoyerTexte(etat.parc.idparc || etat.parc.id);
    if (!idparc) throw new Error("Identifiant du parc manquant.");

    const url =
      endpoint +
      "/planning-parc-mois?idparc=" + encodeURIComponent(idparc) +
      "&annee=" + encodeURIComponent(etat.annee) +
      "&mois=" + encodeURIComponent(etat.mois) +
      "&token=" + encodeURIComponent(tokenPartage) +
      "&ctx=" + encodeURIComponent(contextePartage);

    const reponse = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      throw new Error("Cette fonction nécessite une session membre active.");
    }

    if (!reponse.ok || !data || (data.ok !== true && data.success !== true)) {
      throw new Error(nettoyerTexte(data?.message) || "Impossible de charger le planning du parc.");
    }

    return Array.isArray(data.planning) ? data.planning : [];
  }

  function remplirGrilleCalendrier(grille, etat, planning) {
    grille.innerHTML = "";

    const planningParDate = new Map(
      planning.map((jour) => [String(jour.date || ""), jour])
    );
    const premierJour = new Date(etat.annee, etat.mois - 1, 1);
    const nombreJours = new Date(etat.annee, etat.mois, 0).getDate();
    const decalageLundi = (premierJour.getDay() + 6) % 7;

    for (let index = 0; index < decalageLundi; index += 1) {
      const vide = etatInteraction.templateJourMois.cloneNode(true);
      vide.classList.add("lcdp-box-card-jour-in-calendrier-mois--empty");
      vide.disabled = true;
      vide.setAttribute("aria-hidden", "true");
      grille.appendChild(vide);
    }

    for (let jour = 1; jour <= nombreJours; jour += 1) {
      const dateIso = construireDateIso(etat.annee, etat.mois, jour);
      grille.appendChild(
        creerCardJourCalendrier(etat, dateIso, jour, planningParDate.get(dateIso))
      );
    }
  }

  function creerCardJourCalendrier(etat, dateIso, numeroJour, planningJour) {
    const card = etatInteraction.templateJourMois.cloneNode(true);
    const numero = card.querySelector("[data-lcdp-card-jour-mois-number]");
    const ouvert = Boolean(planningJour?.ouvert);
    const estPasse = dateIso < dateAujourdhuiIso();

    card.dataset.date = dateIso;
    card.dataset.idparc = nettoyerTexte(etat.parc.idparc || etat.parc.id);
    card.setAttribute("aria-label", formaterDateFr(dateIso) + (ouvert ? " disponible" : " fermé"));

    if (numero) numero.textContent = String(numeroJour);

    if (dateIso === dateAujourdhuiIso()) {
      card.classList.add("lcdp-box-card-jour-in-calendrier-mois--today");
    }

    if (estPasse) {
      card.classList.add("lcdp-box-card-jour-in-calendrier-mois--past");
      card.disabled = true;
    }

    if (!ouvert) {
      card.classList.add("lcdp-box-card-jour-in-calendrier-mois--closed");
      card.disabled = true;
    }

    if (etat.mode !== "reservation") {
      card.disabled = true;
      card.setAttribute("aria-disabled", "true");
    }

    ["plage1", "plage2", "plage3"].forEach((nomPlage) => {
      const slot = card.querySelector('[data-lcdp-card-jour-mois-slot="' + nomPlage + '"]');
      if (!slot) return;

      const plage = planningJour?.plages?.[nomPlage];
      const couleur = normaliserCouleurClasse(plage?.ouverte ? plage.couleur : "gris_clair");
      slot.className =
        "lcdp-box-card-jour-in-calendrier-mois__slot " +
        "lcdp-box-card-jour-in-calendrier-mois__slot--" + couleur;
    });

    return card;
  }

  async function ouvrirCalendrierJourDepuisCard(card) {
    const etat = etatInteraction.calendrier;
    const dateIso = nettoyerTexte(card.dataset.date);
    const planningJour = etat?.planning?.find((jour) => String(jour.date || "") === dateIso);

    if (!etat || !planningJour?.ouvert) {
      throw new Error("Aucun horaire disponible pour cette date.");
    }

    const contenu = etat.contenu;
    contenu.innerHTML = "";

    const fragment = await chargerFragment("/OBJET/BOX/04-box-calendrier-jour.html");
    contenu.appendChild(fragment);

    const calendrier = contenu.querySelector("[data-lcdp-box-calendrier-jour]");
    const titre = contenu.querySelector("[data-lcdp-calendrier-jour-title]");
    const meta = contenu.querySelector("[data-lcdp-calendrier-jour-meta]");
    const message = contenu.querySelector("[data-lcdp-calendrier-jour-message]");
    const grille = contenu.querySelector("[data-lcdp-calendrier-jour-grid]");
    const boutonFermer = contenu.querySelector("[data-lcdp-calendrier-jour-close]");

    if (!calendrier || !titre || !meta || !message || !grille || !boutonFermer) {
      throw new Error("Structure calendrier journalier incomplète.");
    }

    calendrier.classList.add("lcdp-box-calendrier-jour--shift-detail");
    boutonFermer.hidden = true;
    titre.textContent = "Votre heure d’arrivée";
    meta.textContent = formaterDateFr(dateIso) + " · " + (etat.parc.nom || "Parc");

    const navigation = document.createElement("div");
    navigation.className = "lcdp-fiche-parc__navigation-shift";
    navigation.appendChild(
      creerBoutonCommande("Retour au planning", "lcdp-button-secondary", () => {
        afficherVueShiftDetailParc(contenu, etat.parc, "reservation").catch(console.error);
      })
    );
    calendrier.querySelector(".lcdp-box-calendrier-jour__header")?.prepend(navigation);

    const plages = construirePlagesJour(planningJour);
    const heures = genererHeuresDisponibles();

    heures.forEach((heure) => {
      const plage = trouverPlagePourHeure(plages, heure);
      if (!plage) return;

      const bouton = etatInteraction.templateHeureJour.cloneNode(true);
      const label = bouton.querySelector("[data-lcdp-card-heure-jour-label]");
      bouton.classList.add(
        "lcdp-box-card-heure-in-calendrier-jour--" + normaliserCouleurClasse(plage.couleur)
      );
      bouton.dataset.idparc = nettoyerTexte(etat.parc.idparc || etat.parc.id);
      bouton.dataset.date = dateIso;
      bouton.dataset.heure = heure;
      bouton.dataset.plagebookd = plage.nom;
      if (label) label.textContent = formaterHeureAffichee(heure);

      bouton.addEventListener("click", () => {
        traiterChoixHeure(bouton, etat.parc).catch(console.error);
      });
      grille.appendChild(bouton);
    });

    message.hidden = grille.children.length > 0;
    message.textContent = grille.children.length
      ? ""
      : "Aucun horaire d’arrivée n’est disponible pour cette date.";
  }

  function construirePlagesJour(planningJour) {
    const plages = [];
    const definitions = {
      plage1: { debut: "06:00", fin: "13:00" },
      plage2: { debut: "13:00", fin: "19:00" },
      plage3: { debut: "19:00", fin: "21:30" }
    };

    Object.entries(definitions).forEach(([nom, defaut]) => {
      const plage = planningJour?.plages?.[nom];
      if (!plage?.ouverte) return;

      plages.push({
        nom,
        debut: plage.debut || defaut.debut,
        fin: plage.fin || defaut.fin,
        couleur: normaliserCouleurClasse(plage.couleur)
      });
    });

    return plages;
  }

  function genererHeuresDisponibles() {
    const heures = [];
    for (let minutes = 6 * 60; minutes <= 21 * 60; minutes += 30) {
      heures.push(
        String(Math.floor(minutes / 60)).padStart(2, "0") + ":" +
        String(minutes % 60).padStart(2, "0")
      );
    }
    return heures;
  }

  function trouverPlagePourHeure(plages, heure) {
    const minutes = convertirHeureEnMinutes(heure);
    return plages.find((plage) => {
      return minutes >= convertirHeureEnMinutes(plage.debut) &&
        minutes < convertirHeureEnMinutes(plage.fin);
    }) || null;
  }

  function convertirHeureEnMinutes(heure) {
    const [h, m] = String(heure || "00:00").split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
  }

  async function traiterChoixHeure(bouton, parc) {
    const dateIso = nettoyerTexte(bouton.dataset.date);
    const heure = nettoyerTexte(bouton.dataset.heure);
    const plagebookd = nettoyerTexte(bouton.dataset.plagebookd);
    const idparc = nettoyerTexte(bouton.dataset.idparc);

    const confirme = await ouvrirConfirmationShift(
      "Confirmer l’heure d’arrivée",
      "Vous avez choisi le " + formaterDateFr(dateIso) + " à " + formaterHeureAffichee(heure) + "."
    );

    if (!confirme) return;

    bouton.disabled = true;

    try {
      await enregistrerReservation({
        idparc,
        datebookd: new Date(dateIso + "T" + heure + ":00").toISOString(),
        plagebookd
      });

      await afficherMessageShift("Votre nouvelle date a bien été enregistrée.");
      const slot = document.getElementById("lcdp-lightbox-slot");
      if (slot) slot.innerHTML = "";
    } catch (error) {
      bouton.disabled = false;
      await afficherMessageShift(error.message || "Impossible d’enregistrer la réservation.");
    }
  }

  async function enregistrerReservation(payload) {
    if (!endpointFluxm) {
      throw new Error("Le service de réservation n’est pas configuré.");
    }

    const reponse = await fetch(endpointFluxm + "/creer-reservation", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      window.location.href = pageConnexionMembre + "?source=fiche-parc&motif=inactive";
      return null;
    }

    if (!reponse.ok || !data || (data.ok !== true && data.success !== true)) {
      throw new Error(nettoyerTexte(data?.message) || "Impossible d’enregistrer la réservation.");
    }

    return data.reservation || null;
  }

  async function ouvrirConfirmationShift(titre, texte) {
    const detail = document.querySelector("[data-lcdp-box-shift-detail-parc]");
    const slot = detail?.querySelector("[data-lcdp-shift-detail-parc-alerte-slot]");
    if (!slot) return window.confirm(texte);

    slot.innerHTML = "";
    const box = document.createElement("div");
    box.className = "lcdp-box-shift-detail-parc__alerte-box";

    const heading = document.createElement("h3");
    heading.textContent = titre;
    const message = document.createElement("p");
    message.className = "lcdp-box-shift-detail-parc__alerte-message";
    message.textContent = texte;
    const actions = document.createElement("div");
    actions.className = "lcdp-fiche-parc__dialogue-actions";

    const annuler = creerBoutonCommande("Annuler", "lcdp-button-secondary", () => fermer(false));
    const confirmer = creerBoutonCommande("Confirmer", "lcdp-button-primary", () => fermer(true));
    actions.append(annuler, confirmer);
    box.append(heading, message, actions);
    slot.appendChild(box);

    let resoudre;
    const promesse = new Promise((resolve) => { resoudre = resolve; });

    function fermer(valeur) {
      slot.innerHTML = "";
      resoudre(valeur);
    }

    return promesse;
  }

  async function afficherMessageShift(message) {
    const detail = document.querySelector("[data-lcdp-box-shift-detail-parc]");
    const slot = detail?.querySelector("[data-lcdp-shift-detail-parc-alerte-slot]");
    if (!slot) {
      window.alert(message);
      return;
    }

    slot.innerHTML = "";
    const box = document.createElement("div");
    box.className = "lcdp-box-shift-detail-parc__alerte-box";
    const texte = document.createElement("p");
    texte.className = "lcdp-box-shift-detail-parc__alerte-message";
    texte.textContent = message;
    const ok = creerBoutonCommande("OK", "lcdp-button-primary", () => {
      slot.innerHTML = "";
    });
    box.append(texte, ok);
    slot.appendChild(box);
  }

  function changerMois(etat, delta) {
    const date = new Date(etat.annee, etat.mois - 1 + delta, 1);
    etat.annee = date.getFullYear();
    etat.mois = date.getMonth() + 1;
  }

  function construireDateIso(annee, mois, jour) {
    return String(annee) + "-" + String(mois).padStart(2, "0") + "-" + String(jour).padStart(2, "0");
  }

  function dateAujourdhuiIso() {
    const maintenant = new Date();
    return construireDateIso(maintenant.getFullYear(), maintenant.getMonth() + 1, maintenant.getDate());
  }

  function formaterMoisAnnee(annee, mois) {
    return new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric"
    }).format(new Date(annee, mois - 1, 1));
  }

  function formaterDateFr(dateIso) {
    const date = new Date(dateIso + "T12:00:00");
    return Number.isNaN(date.getTime())
      ? dateIso
      : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formaterHeureAffichee(heure) {
    const match = String(heure || "").match(/^(\d{2}):(\d{2})$/);
    return match ? String(Number(match[1])) + "h" + match[2] : heure;
  }

  function normaliserCouleurClasse(couleur) {
    const valeur = String(couleur || "gris_clair").trim().toLowerCase();
    if (["vert", "orange", "rouge_clair", "rouge", "gris_fonce", "gris_clair"].includes(valeur)) {
      return valeur;
    }
    if (valeur === "fonce") return "gris_fonce";
    return "gris_clair";
  }

  function attendre(delai) {
    return new Promise((resolve) => window.setTimeout(resolve, delai));
  }

  async function partagerFicheParc(parc) {
    const nom = parc.nom || "ce parc";
    const donneesPartage = {
      title:
        "Parc de " +
        nom +
        " - La Clé du Parc",
      text:
        "Découvrez le parc de " +
        nom +
        " sur La Clé du Parc.",
      url: window.location.href
    };

    if (navigator.share) {
      await navigator.share(donneesPartage);
      return;
    }

    const sujet = encodeURIComponent(
      donneesPartage.title
    );
    const corps = encodeURIComponent(
      donneesPartage.text +
      "\n\n" +
      donneesPartage.url
    );

    window.location.href =
      "mailto:?subject=" +
      sujet +
      "&body=" +
      corps;
  }

  function construireUrlAvecParc(
    urlSource,
    parc,
    parametresComplementaires = {}
  ) {
    const url = new URL(
      urlSource,
      window.location.href
    );

    if (parc.idparc) {
      url.searchParams.set(
        "idparc",
        parc.idparc
      );
    }

    if (parc.nom) {
      url.searchParams.set("nom", parc.nom);
    }

    if (parc.dptmt) {
      url.searchParams.set(
        "dptmt",
        parc.dptmt
      );
    }

    Object.entries(
      parametresComplementaires
    ).forEach(([cle, valeur]) => {
      if (valeur !== undefined && valeur !== null) {
        url.searchParams.set(
          cle,
          String(valeur)
        );
      }
    });

    return url.toString();
  }

  function construireCheminImageParc(
    parc,
    fichier
  ) {
    const departement = nettoyerDepartement(
      parc.dptmt
    );
    const dossierParc =
      normaliserNomParcPourChemin(parc.nom);
    const nomFichier = String(fichier || "")
      .replace(/^\/+/, "");

    if (
      !departement ||
      !dossierParc ||
      !nomFichier
    ) {
      return (
        dossierImagesParc +
        "/parc-defaut.webp"
      );
    }

    return (
      dossierImagesParc +
      "/" +
      encodeURIComponent(departement) +
      "/" +
      encodeURIComponent(dossierParc) +
      "/" +
      encodeURIComponent(nomFichier)
    );
  }

  function construireTexteAccesParc(parc) {
    const horaire = String(parc?.horaire || "").trim() ||
      "Horaires d’accès non renseignés.";
    const dateActualisation = formaterDateMajHoraire(
      parc?.datemajhoraire
    );
    const mentionActualisation = dateActualisation
      ? "Informations actualisées le " + dateActualisation + "."
      : "Informations actualisées : date non disponible.";

    return horaire + "\n" + mentionActualisation;
  }

  function formaterDateMajHoraire(value) {
    const date = new Date(value || "");

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const morceaux = new Intl.DateTimeFormat(
      "fr-FR",
      {
        timeZone: "Europe/Paris",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }
    ).formatToParts(date);
    const lire = (type) =>
      morceaux.find((item) => item.type === type)?.value || "";

    return (
      lire("day") +
      " " +
      lire("month") +
      " " +
      lire("year") +
      " à " +
      lire("hour") +
      " h " +
      lire("minute")
    );
  }

  function construireTexteContactParc(parc) {
    const responsable = parc?.resparc || null;
    const prenom = nettoyerTexte(responsable?.prenomresp || responsable?.prenom);
    const nom = nettoyerTexte(responsable?.nomresp || responsable?.nom);
    const identite = [prenom, nom].filter(Boolean).join(" ");

    return identite || "Contact non renseigné.";
  }

  function normaliserNomParcPourChemin(valeur) {
    return String(valeur || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
  }

  function nettoyerDepartement(valeur) {
    const departement = String(valeur || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (/^[1-9]$/.test(departement)) {
      return "0" + departement;
    }

    return departement;
  }

  function nettoyerTexte(valeur) {
    return String(valeur || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function afficherStatut(message, termine) {
    const statut = document.getElementById(
      "lcdp-fiche-parc-status"
    );

    if (!statut) {
      return;
    }

    if (termine) {
      statut.hidden = true;
      statut.textContent = "";
      return;
    }

    statut.hidden = false;
    statut.textContent =
      message || "[Chargement de la fiche parc]";
  }

  function construireUrlSite(chemin) {
    if (!chemin) return chemin;

    if (
      chemin.startsWith("#") ||
      chemin.startsWith("mailto:") ||
      chemin.startsWith("tel:") ||
      chemin.startsWith("http://") ||
      chemin.startsWith("https://") ||
      chemin.startsWith("data:")
    ) {
      return chemin;
    }

    if (siteBase) {
      return chemin.startsWith("/")
        ? siteBase + chemin
        : siteBase +
            "/" +
            chemin.replace(/^\.\//, "");
    }

    return chemin.startsWith("/")
      ? ".." + chemin
      : chemin;
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");

    if (
      valeur.startsWith("http://") ||
      valeur.startsWith("https://")
    ) {
      return valeur;
    }

    if (
      typeof config.membreUrl === "function"
    ) {
      return config.membreUrl(valeur);
    }

    const membreBase = String(
      config.membreBaseUrl ||
      config.MEMBRE_BASE ||
      config.siteBase ||
      siteBase ||
      ""
    ).replace(/\/$/, "");

    if (membreBase) {
      return valeur.startsWith("/")
        ? membreBase + valeur
        : membreBase +
            "/" +
            valeur.replace(/^\.\//, "");
    }

    return valeur.startsWith("/")
      ? ".." + valeur
      : valeur;
  }

  function appliquerRoutesSite(
    racine = document
  ) {
    racine
      .querySelectorAll("[data-site-href]")
      .forEach((element) => {
        element.setAttribute(
          "href",
          construireUrlSite(
            element.dataset.siteHref
          )
        );
      });

    racine
      .querySelectorAll("[data-site-src]")
      .forEach((element) => {
        element.setAttribute(
          "src",
          construireUrlSite(
            element.dataset.siteSrc
          )
        );
      });

    racine
      .querySelectorAll("a[href^='/']")
      .forEach((element) => {
        element.setAttribute(
          "href",
          construireUrlSite(
            element.getAttribute("href")
          )
        );
      });

    racine
      .querySelectorAll("img[src^='/']")
      .forEach((element) => {
        element.setAttribute(
          "src",
          construireUrlSite(
            element.getAttribute("src")
          )
        );
      });
  }

  async function chargerFragment(chemin) {
    const reponse = await fetch(
      construireUrlSite(chemin),
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-cache"
      }
    );

    if (!reponse.ok) {
      throw new Error(
        "Fragment introuvable : " + chemin
      );
    }

    const html = await reponse.text();
    const template =
      document.createElement("template");

    template.innerHTML = html.trim();

    return template.content.cloneNode(true);
  }

  function chargerScriptUneFois(chemin) {
    const src = construireUrlSite(chemin);

    if (
      document.querySelector(
        `script[data-lcdp-script="${chemin}"]`
      )
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script =
        document.createElement("script");

      script.src = src;
      script.defer = true;
      script.dataset.lcdpScript = chemin;
      script.onload = resolve;
      script.onerror = () => {
        reject(
          new Error(
            "Script introuvable : " + chemin
          )
        );
      };

      document.body.appendChild(script);
    });
  }

  async function initialiserBandeau() {
    const slot = document.getElementById(
      "lcdp-bandeau-slot"
    );

    if (!slot) {
      return;
    }

    slot.innerHTML = "";

    const bandeau = await chargerFragment(
      "/ESPACE-PUBLIC/box-bandeau-nav-public.html"
    );

    slot.appendChild(bandeau);
    appliquerRoutesSite(slot);

    await chargerScriptUneFois(
      "/ESPACE-PUBLIC/box-menu-burger-public.js"
    );

    if (
      typeof window
        .LCDP_initialiserMenuBurgerPublic ===
      "function"
    ) {
      await window
        .LCDP_initialiserMenuBurgerPublic();
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById(
      "lcdp-footer-slot"
    );

    if (!slot) {
      return;
    }

    slot.innerHTML = "";

    const footer = await chargerFragment(
      "/OBJET/BOX/02-box-footer.html"
    );

    slot.appendChild(footer);
    appliquerRoutesSite(slot);
  }
})();
