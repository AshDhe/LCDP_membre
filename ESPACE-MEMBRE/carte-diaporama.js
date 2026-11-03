/* La Clé du Parc — Carte de navigation PLANIFIER indépendante de fiche-parc.js.
 * Le rendu SVG historique a été isolé pour conserver ses comportements.
 */
(() => {
  "use strict";
  window.LCDP_CARTE_DIAPORAMA = { rendreCarteDansConteneur };

  async function rendreCarteDansConteneur(slot, parc, options = {}) {
    if (!slot) return;

    slot.innerHTML = "";

    const [fragment, reponseGeojson] = await Promise.all([
      options.chargerFragmentObjet("/BOX/04-carte-dynamique.html"),
      fetch(options.construireUrlObjet("/BOX/04-carte-dynamique.geojson"), {
        method: "GET",
        credentials: "omit",
        cache: "no-cache",
        headers: {
          "Accept": "application/geo+json, application/json"
        }
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
    if (options.carteNavigation) {
      carte.classList.add("lcdp-carte-dynamique--navigation");
      cardSlot.className = "lcdp-planifier-carte-cartouche";
      carte.appendChild(cardSlot);
    }

    svg.setAttribute("focusable", "false");
    svg.setAttribute("tabindex", "-1");
    // Même cadrage proportionnel dans la fiche et dans la vue CARTE de PLANIFIER.
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    if (options.carteNavigation) svg.setAttribute("role", "group");

    const codeDepartement = nettoyerDepartement(parc.dptmt || parc.departement);
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    const traces = [];

    features.forEach((feature) => {
      const code = nettoyerDepartement(feature?.properties?.code);
      const trace = construireTraceGeometrie(feature?.geometry);

      if (code && trace) {
        traces.push({ code, trace });
      }
    });

    if (!traces.length) {
      throw new Error("Données cartographiques incomplètes.");
    }

    coucheDepartements.innerHTML = "";
    coucheSelection.innerHTML = "";
    coucheLocalites.innerHTML = "";
    coucheParcs.innerHTML = "";

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
    // La fiche reprend exactement l'emprise initiale de la vue CARTE.
    const viewBoxInitiale = bboxVersViewBox(bboxCible, traceSelectionnee ? 0.04 : 0.045);

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
      const rectangle = svg.getBoundingClientRect();
      const largeurMesuree = rectangle.width || svg.clientWidth || 800;
      const hauteurMesuree = rectangle.height || svg.clientHeight || 450;
      // preserveAspectRatio="meet" : l’axe limitant détermine l’échelle réelle.
      // Les marqueurs secondaires font 12 px de diamètre, l’actif 15,6 px.
      const uniteEcran = Math.max(
        viewBoxCourante[2] / Math.max(1, largeurMesuree),
        viewBoxCourante[3] / Math.max(1, hauteurMesuree)
      );
      const rayonParc = uniteEcran * 6;
      const rayonLocalite = Math.max(0.035, uniteEcran * 4.2);
      const carteMobile = largeurMesuree <= 520;
      const tailleLibelle = Math.max(0.12, uniteEcran * (carteMobile ? 12.5 : 11));
      const decalageLibelle = Math.max(0.08, uniteEcran * (carteMobile ? 10 : 7));

      coucheParcs
        .querySelectorAll(".lcdp-carte-dynamique__marker")
        .forEach((marker) => {
          const estParcActif = marker.classList.contains("lcdp-carte-dynamique__marker--parc-actif");
          const rayon = rayonParc * (estParcActif ? 1.3 : 1);
          marker.setAttribute("r", String(rayon));
          // La propriété CSS r peut primer sur l'attribut SVG :
          // imposer la même dimension uniquement sur les marqueurs des parcs.
          marker.style.setProperty("r", rayon + "px", "important");
        });

      // Taille et couleurs volontairement identiques sur la carte du diaporama
      // et sur la fiche parc, sans dépendre des règles CSS contextuelles.
      coucheLocalites
        .querySelectorAll(".lcdp-carte-dynamique__localite-marker")
        .forEach((marker) => {
          marker.setAttribute("r", String(rayonLocalite));
          marker.style.setProperty("r", rayonLocalite + "px", "important");
          marker.style.setProperty("fill", "#202020", "important");
          marker.style.setProperty("stroke", "#202020", "important");
          marker.style.setProperty("stroke-width", (uniteEcran * 2) + "px", "important");
        });

      coucheLocalites
        .querySelectorAll(".lcdp-carte-dynamique__localite-label")
        .forEach((libelle) => {
          const x = Number(libelle.dataset.pointX);
          const y = Number(libelle.dataset.pointY);

          libelle.setAttribute("font-size", String(tailleLibelle));
          libelle.style.setProperty("fill", "#202020", "important");

          if (carteMobile) {
            libelle.setAttribute("x", String(x));
            libelle.setAttribute("y", String(y - decalageLibelle));
            libelle.setAttribute("text-anchor", "middle");
          } else {
            libelle.setAttribute("x", String(x + decalageLibelle));
            libelle.setAttribute("y", String(y));
            libelle.setAttribute("text-anchor", "start");
          }
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
    let pincementTactile = null;

    function distanceEntrePointeurs(a, b) {
      return Math.hypot(b.x - a.x, b.y - a.y);
    }

    function centreEntrePointeurs(a, b) {
      return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
      };
    }

    function bornerDimensionsViewBox(largeur, hauteur) {
      const largeurMin = Math.max(0.25, viewBoxInitiale[2] / 12);
      const hauteurMin = Math.max(0.25, viewBoxInitiale[3] / 12);

      return {
        largeur: Math.min(viewBoxLimite[2], Math.max(largeurMin, largeur)),
        hauteur: Math.min(viewBoxLimite[3], Math.max(hauteurMin, hauteur))
      };
    }

    function convertirTouchEnPoint(touch) {
      return {
        x: touch.clientX,
        y: touch.clientY
      };
    }

    function demarrerPincementTactile(touches) {
      if (!touches || touches.length < 2) {
        pincementTactile = null;
        return;
      }

      const premier = convertirTouchEnPoint(touches[0]);
      const second = convertirTouchEnPoint(touches[1]);
      const distance = distanceEntrePointeurs(premier, second);

      if (!(distance > 0)) {
        pincementTactile = null;
        return;
      }

      const centre = centreEntrePointeurs(premier, second);
      const rect = svg.getBoundingClientRect();
      const largeurEcran = Math.max(1, rect.width);
      const hauteurEcran = Math.max(1, rect.height);

      pincementTactile = {
        distance,
        viewBox: [...viewBoxCourante],
        ancreX:
          viewBoxCourante[0] +
          ((centre.x - rect.left) / largeurEcran) * viewBoxCourante[2],
        ancreY:
          viewBoxCourante[1] +
          ((centre.y - rect.top) / hauteurEcran) * viewBoxCourante[3]
      };
    }

    svg.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        return;
      }

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
      if (event.pointerType === "touch" || !glissement) {
        return;
      }

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

    function terminerInteractionPointeur(event) {
      if (event?.pointerType === "touch") {
        return;
      }

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

    svg.addEventListener("pointerup", terminerInteractionPointeur);
    svg.addEventListener("pointercancel", terminerInteractionPointeur);

    svg.addEventListener("touchstart", (event) => {
      if (event.touches.length < 2) {
        pincementTactile = null;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      demarrerPincementTactile(event.touches);
    }, { passive: false });

    svg.addEventListener("touchmove", (event) => {
      if (event.touches.length < 2) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (!pincementTactile) {
        demarrerPincementTactile(event.touches);
      }

      if (!pincementTactile) {
        return;
      }

      const premier = convertirTouchEnPoint(event.touches[0]);
      const second = convertirTouchEnPoint(event.touches[1]);
      const distance = distanceEntrePointeurs(premier, second);
      const centre = centreEntrePointeurs(premier, second);

      if (!(distance > 0)) {
        return;
      }

      const facteur = pincementTactile.distance / distance;
      const dimensions = bornerDimensionsViewBox(
        pincementTactile.viewBox[2] * facteur,
        pincementTactile.viewBox[3] * facteur
      );

      const rect = svg.getBoundingClientRect();
      const largeurEcran = Math.max(1, rect.width);
      const hauteurEcran = Math.max(1, rect.height);

      viewBoxCourante = [
        pincementTactile.ancreX -
          ((centre.x - rect.left) / largeurEcran) * dimensions.largeur,
        pincementTactile.ancreY -
          ((centre.y - rect.top) / hauteurEcran) * dimensions.hauteur,
        dimensions.largeur,
        dimensions.hauteur
      ];

      appliquerViewBox();
    }, { passive: false });

    svg.addEventListener("touchend", (event) => {
      if (event.touches.length >= 2) {
        demarrerPincementTactile(event.touches);
      } else {
        pincementTactile = null;
      }
    }, { passive: true });

    svg.addEventListener("touchcancel", () => {
      pincementTactile = null;
    }, { passive: true });

    const bloquerZoomNavigateurDansCarte = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    svg.addEventListener("gesturestart", bloquerZoomNavigateurDansCarte, {
      passive: false
    });
    svg.addEventListener("gesturechange", bloquerZoomNavigateurDansCarte, {
      passive: false
    });
    svg.addEventListener("gestureend", bloquerZoomNavigateurDansCarte, {
      passive: false
    });

    window.addEventListener("resize", actualiserTailleElementsCarte);
    const observateurDimensionsCarte = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => actualiserTailleElementsCarte())
      : null;
    observateurDimensionsCarte?.observe(svg);

    // Source commune aux deux cartes : localités validées par le service.
    // Une localité par département, avec coordonnées et libellé obligatoires.
    const localitesDejaTracees = new Set();
    (Array.isArray(parc.localitesCarte) ? parc.localitesCarte : [])
      .forEach((localite) => {
        const nom = nettoyerTexte(localite?.nom);
        const latitude = localite?.latitude;
        const longitude = localite?.longitude;
        if (!nom || latitude == null || longitude == null ||
            String(latitude).trim() === "" || String(longitude).trim() === "") return;
        const point = projeterCoordonnee(longitude, latitude);
        if (!point) return;
        const cle = nettoyerDepartement(localite?.dptmt || parc.dptmt || parc.departement);
        if (localitesDejaTracees.has(cle)) return;
        localitesDejaTracees.add(cle);

        const groupe = creerElementSvg("g");
        groupe.setAttribute("aria-label", "Localité : " + nom);
        const marker = creerElementSvg("circle");
        marker.setAttribute("cx", String(point.x));
        marker.setAttribute("cy", String(point.y));
        marker.setAttribute("r", "0.1");
        marker.setAttribute("class", "lcdp-carte-dynamique__localite-marker");
        const titre = creerElementSvg("title");
        titre.textContent = "Localité : " + nom;
        marker.appendChild(titre);

        const libelle = creerElementSvg("text");
        libelle.setAttribute("x", String(point.x));
        libelle.setAttribute("y", String(point.y));
        libelle.setAttribute("dominant-baseline", "middle");
        libelle.setAttribute("class", "lcdp-carte-dynamique__localite-label");
        libelle.dataset.pointX = String(point.x);
        libelle.dataset.pointY = String(point.y);
        libelle.textContent = nom.toLocaleUpperCase("fr");

        groupe.appendChild(marker);
        groupe.appendChild(libelle);
        coucheLocalites.appendChild(groupe);
      });

    let numeroCard = 0;
    let carteDetruite = false;

    function fermerCardParc() {
      numeroCard += 1;
      cardSlot.innerHTML = "";
      cardSlot.hidden = true;
      cardSlot.classList.remove("is-open");
      cardSlot.style.removeProperty("display");
    }

    async function ouvrirCardParc(parcCarte) {
      const numero = ++numeroCard;
      if (typeof options.creerCardParcCarte !== "function") {
        throw new Error("Créateur de carte du diaporama indisponible.");
      }
      const card = await options.creerCardParcCarte(parcCarte);
      if (carteDetruite || numero !== numeroCard || !card) return;
      cardSlot.replaceChildren(card);
      cardSlot.hidden = false;
      cardSlot.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
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

    function ajouterMarqueurParc(parcCarte, estParcActif) {
      const longitude = parcCarte.lngparc ?? parcCarte.longitude ?? parcCarte.lngloc;
      const latitude = parcCarte.latparc ?? parcCarte.latitude ?? parcCarte.latloc;
      if (options.carteNavigation && (
        longitude == null || latitude == null ||
        String(longitude).trim() === "" || String(latitude).trim() === ""
      )) return;
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
      marker.setAttribute("focusable", "false");
      marker.setAttribute("tabindex", "-1");
      marker.setAttribute("aria-hidden", "true");
      if (options.carteNavigation) {
        marker.setAttribute("focusable", "true");
        marker.setAttribute("tabindex", "0");
        marker.removeAttribute("aria-hidden");
        marker.setAttribute("role", "button");
        marker.setAttribute("aria-label", "Afficher " + (parcCarte.nom || parcCarte.nomparc || "le parc"));
        marker.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          ouvrirCardParc(parcCarte).catch(console.error);
        });
      }

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

    if (!options.carteNavigation || parcCourant) {
      ajouterMarqueurParc(parcCourant || parc, !options.carteNavigation);
    }

    svg.addEventListener("click", (event) => {
      const cible = event.target instanceof Element ? event.target : null;
      const marker = cible?.closest(".lcdp-carte-dynamique__marker");

      if (!marker) return;

      event.preventDefault();
      event.stopPropagation();

      const parcCarte = parcsCarteParId.get(
        nettoyerTexte(marker.dataset.idparc)
      );

      if (parcCarte) {
        ouvrirCardParc(parcCarte).catch(console.error);
      }
    });

    svg.setAttribute(
      "aria-label",
      "Carte du département " + (codeDepartement || "du parc")
    );

    appliquerViewBox();
    return {
      detruire() {
        carteDetruite = true;
        numeroCard += 1;
        window.removeEventListener("resize", actualiserTailleElementsCarte);
        observateurDimensionsCarte?.disconnect();
      }
    };
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


  function nettoyerDepartement(valeur) {
    const code = String(valeur || "").trim().toUpperCase().replace(/\s+/g, "");
    return /^[1-9]$/.test(code) ? "0" + code : code;
  }
  function nettoyerTexte(valeur) {
    return String(valeur || "").replace(/\s+/g, " ").trim();
  }

})();
