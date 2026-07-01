(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "reserver-membre";
  const DOSSIER_IMAGES_PARC_OBJET = "/IMAG/IMAGE%20PARC";

  const ENDPOINT_NOUVELLE_DATE_MEMBRE = construireEndpointApi(
    "workerNouvelleDateMembreUrl",
    "WORKER_NOUVELLE_DATE_MEMBRE_URL",
    "nouvelle-date-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");

  let pageInitialisee = false;

  const etatPage = {
    departement: "",
    autourDeMoi: true,
    parcs: [],
    templateCardParc: null,
    templateJourMois: null
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    if (pageInitialisee) return;
    pageInitialisee = true;

    try {
      await initialiserBandeau();
      await initialiserFooter();
      await initialiserListeParcs();
      initialiserBoutonIa();
      initialiserActionsListeParcs();
      document.addEventListener("click", gererClicDocument);
      await chargerParcsAutourDeMoi();
    } catch (error) {
      console.error("Erreur réserver membre :", error);
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function initialiserListeParcs() {
    const slot = document.getElementById("lcdp-liste-card-parcs-slot");

    if (!slot) {
      throw new Error("Slot liste des parcs introuvable.");
    }

    const fragmentListe = await chargerFragmentObjet("/BOX/04-box-liste-card.html");
    slot.innerHTML = "";
    slot.appendChild(fragmentListe);

    const fragmentCard = await chargerFragmentObjet("/BOX/04-box-card-parc.html");
    etatPage.templateCardParc = fragmentCard.querySelector("[data-lcdp-box-card-parc]");

    const fragmentJour = await chargerFragmentObjet("/BOX/04-box-card-jour-in-calendrier-mois.html");
    etatPage.templateJourMois = fragmentJour.querySelector("[data-lcdp-card-jour-mois]");

    if (!etatPage.templateCardParc || !etatPage.templateJourMois) {
      throw new Error("Templates parc ou jour introuvables.");
    }
  }

  function initialiserBoutonIa() {
    const bouton = document.getElementById("bouton-demander-ia");

    if (!bouton) return;

    bouton.addEventListener("click", () => {
      afficherAlerte("La recherche avec l’IA sera traitée après la réservation classique.").catch(console.error);
    });
  }

  function initialiserActionsListeParcs() {
    const zoneActions = document.querySelector("[data-lcdp-liste-card-actions]");

    if (!zoneActions) return;

    zoneActions.innerHTML = "";

    const boutonAutour = document.createElement("button");
    boutonAutour.type = "button";
    boutonAutour.className = "lcdp-button lcdp-button-secondary";
    boutonAutour.textContent = "Autour de moi";

    const boutonDepartement = document.createElement("button");
    boutonDepartement.type = "button";
    boutonDepartement.className = "lcdp-button lcdp-button-secondary";
    boutonDepartement.textContent = "Changer de département";

    boutonAutour.addEventListener("click", () => {
      chargerParcsAutourDeMoi().catch(console.error);
    });

    boutonDepartement.addEventListener("click", () => {
      ouvrirChoixDepartement().catch(console.error);
    });

    zoneActions.appendChild(boutonAutour);
    zoneActions.appendChild(boutonDepartement);
  }

  async function ouvrirChoixDepartement() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Changer de département",
      champs: [
        {
          id: "departement-recherche-parc",
          name: "dptmt",
          label: "Département",
          type: "text",
          inputmode: "numeric",
          autocomplete: "off",
          required: true
        }
      ]
    });

    if (!resultat) return;

    const departement = nettoyerDepartement(resultat.dptmt);

    if (!departement) {
      await afficherAlerte("Le département est obligatoire.");
      return;
    }

    await chargerParcsDepartement(departement);
  }

  async function chargerParcsAutourDeMoi() {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      afficherErreurListe("Le service de réservation membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementListe("Chargement des parcs autour de vous...");

      const reponse = await fetch(ENDPOINT_NOUVELLE_DATE_MEMBRE + "/autour-de-moi", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(messageErreurApi(data, "Impossible de charger les parcs autour de vous."));
      }

      etatPage.departement = String(data.departement || "");
      etatPage.autourDeMoi = true;
      etatPage.parcs = Array.isArray(data.parcs) ? data.parcs : [];

      afficherTitreListe();
      afficherParcs(etatPage.parcs);
    } catch (error) {
      console.error("Erreur chargement parcs autour de moi :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function chargerParcsDepartement(departement) {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      afficherErreurListe("Le service de réservation membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementListe("Chargement des parcs du département...");

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

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(messageErreurApi(data, "Impossible de charger les parcs de ce département."));
      }

      etatPage.departement = String(data.departement || departement);
      etatPage.autourDeMoi = false;
      etatPage.parcs = Array.isArray(data.parcs) ? data.parcs : [];

      afficherTitreListe();
      afficherParcs(etatPage.parcs);
    } catch (error) {
      console.error("Erreur chargement parcs département :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function afficherTitreListe() {
    const titre = document.querySelector("[data-lcdp-liste-card-title]");

    if (!titre) return;

    titre.textContent = etatPage.autourDeMoi
      ? "Parcs autour de moi" + (etatPage.departement ? " (" + etatPage.departement + ")" : "")
      : "Parcs dans le " + etatPage.departement;
  }

  function afficherParcs(parcs) {
    const zoneListe = obtenirZoneListe();

    if (!zoneListe) return;

    zoneListe.innerHTML = "";

    if (!Array.isArray(parcs) || !parcs.length) {
      afficherMessageListe("Aucun parc trouvé pour ce département.", "information");
      return;
    }

    masquerMessageListe();

    parcs.forEach((parc) => {
      zoneListe.appendChild(creerCardParc(parc));
    });
  }

  function creerCardParc(parc) {
    const card = etatPage.templateCardParc.cloneNode(true);

    const idparc = String(parc.idparc || parc.id || "");
    const nom = String(parc.nom || parc.nomparc || "Parc").trim() || "Parc";
    const departement = String(parc.dptmt || parc.departement || "").trim();
    const description = nettoyerTexteCourt(parc.prez || parc.presentation || "", 190);

    const image = card.querySelector("[data-lcdp-card-parc-image]");
    const titre = card.querySelector("[data-lcdp-card-parc-title]");
    const meta = card.querySelector("[data-lcdp-card-parc-meta]");
    const texte = card.querySelector("[data-lcdp-card-parc-description]");
    const boutonFiche = card.querySelector("[data-action='ouvrir-fiche-parc']");
    const boutonReserver = card.querySelector("[data-action='nouvelle-date-parc']");

    card.dataset.idparc = idparc;

    if (image) {
      image.src = construireUrlImageParc(parc.imageparc);
      image.alt = "Image du parc " + nom;
    }

    if (titre) titre.textContent = nom;

    if (meta) {
      meta.textContent = departement ? "Département " + departement : "Département non renseigné";
    }

    if (texte) {
      texte.textContent = description;
      texte.hidden = !description;
    }

    if (boutonFiche) {
      boutonFiche.dataset.idparc = idparc;
    }

    if (boutonReserver) {
      boutonReserver.dataset.idparc = idparc;
    }

    return card;
  }

  async function gererClicDocument(event) {
    const boutonFiche = event.target.closest("[data-action='ouvrir-fiche-parc']");
    const boutonReserver = event.target.closest("[data-action='nouvelle-date-parc']");
    const jourCalendrier = event.target.closest("[data-lcdp-card-jour-mois]");

    if (boutonFiche) {
      event.preventDefault();
      await afficherAlerte("La fiche du parc sera traitée après le choix de réservation.");
      return;
    }

    if (boutonReserver) {
      event.preventDefault();
      const parc = trouverParcParId(boutonReserver.dataset.idparc);

      if (!parc) {
        await afficherAlerte("Parc introuvable.");
        return;
      }

      await ouvrirCalendrierMoisParc(parc);
      return;
    }

    if (jourCalendrier && !jourCalendrier.disabled) {
      event.preventDefault();
      await afficherAlerte("Le choix de l’heure d’arrivée sera traité à l’étape suivante.");
    }
  }

  function trouverParcParId(idparc) {
    const id = String(idparc || "");

    return etatPage.parcs.find((parc) => String(parc.idparc || parc.id || "") === id) || null;
  }

  async function ouvrirCalendrierMoisParc(parc) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-calendrier-mois.html");
    slot.appendChild(fragment);

    const calendrier = slot.querySelector("[data-lcdp-box-calendrier-mois]");
    const titre = slot.querySelector("[data-lcdp-calendrier-mois-title]");
    const meta = slot.querySelector("[data-lcdp-calendrier-mois-meta]");
    const boutonFermer = slot.querySelector("[data-lcdp-calendrier-mois-close]");
    const boutonPrecedent = slot.querySelector("[data-lcdp-calendrier-mois-prev]");
    const boutonSuivant = slot.querySelector("[data-lcdp-calendrier-mois-next]");

    if (!calendrier || !titre || !meta || !boutonFermer || !boutonPrecedent || !boutonSuivant) {
      throw new Error("Structure calendrier mois incomplète.");
    }

    const nomParc = String(parc.nom || parc.nomparc || "Parc").trim() || "Parc";
    const departement = String(parc.dptmt || parc.departement || "").trim();

    titre.textContent = "Planning du parc";
    meta.textContent = nomParc + (departement ? " · " + departement : "");

    const maintenant = new Date();
    const etatCalendrier = {
      parc,
      annee: maintenant.getFullYear(),
      mois: maintenant.getMonth() + 1
    };

    async function fermer() {
      slot.innerHTML = "";
    }

    boutonFermer.addEventListener("click", fermer);

    calendrier.addEventListener("click", (event) => {
      if (event.target === calendrier) fermer();
    });

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") fermer();
      },
      { once: true }
    );

    boutonPrecedent.addEventListener("click", () => {
      changerMois(etatCalendrier, -1);
      afficherCalendrierMois(etatCalendrier).catch(console.error);
    });

    boutonSuivant.addEventListener("click", () => {
      changerMois(etatCalendrier, 1);
      afficherCalendrierMois(etatCalendrier).catch(console.error);
    });

    await afficherCalendrierMois(etatCalendrier);
  }

  async function afficherCalendrierMois(etatCalendrier) {
    const moisCourant = document.querySelector("[data-lcdp-calendrier-mois-current]");
    const message = document.querySelector("[data-lcdp-calendrier-mois-message]");
    const grille = document.querySelector("[data-lcdp-calendrier-mois-grid]");

    if (!moisCourant || !message || !grille) return;

    moisCourant.textContent = formaterMoisAnnee(etatCalendrier.annee, etatCalendrier.mois);
    grille.innerHTML = "";
    message.hidden = false;
    message.textContent = "Chargement du planning...";

    try {
      const planning = await chargerPlanningParcMois(etatCalendrier);
      message.hidden = true;
      message.textContent = "";
      remplirGrilleCalendrier(grille, etatCalendrier, planning);
    } catch (error) {
      console.error("Erreur planning parc mois :", error);
      message.hidden = false;
      message.textContent = error.message || "Impossible de charger le planning du parc.";
    }
  }

  async function chargerPlanningParcMois(etatCalendrier) {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      throw new Error("Le service de réservation membre n’est pas configuré.");
    }

    const idparc = String(etatCalendrier.parc.idparc || etatCalendrier.parc.id || "").trim();

    if (!idparc) {
      throw new Error("Parc manquant.");
    }

    const url =
      ENDPOINT_NOUVELLE_DATE_MEMBRE +
      "/planning-parc-mois?idparc=" + encodeURIComponent(idparc) +
      "&annee=" + encodeURIComponent(etatCalendrier.annee) +
      "&mois=" + encodeURIComponent(etatCalendrier.mois);

    const reponse = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return [];
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible de charger le planning du parc."));
    }

    return Array.isArray(data.planning) ? data.planning : [];
  }

  function remplirGrilleCalendrier(grille, etatCalendrier, planning) {
    grille.innerHTML = "";

    const planningParDate = new Map(
      (Array.isArray(planning) ? planning : []).map((jour) => [String(jour.date || ""), jour])
    );

    const premierJour = new Date(etatCalendrier.annee, etatCalendrier.mois - 1, 1);
    const nombreJours = new Date(etatCalendrier.annee, etatCalendrier.mois, 0).getDate();
    const decalageLundi = (premierJour.getDay() + 6) % 7;

    for (let i = 0; i < decalageLundi; i += 1) {
      grille.appendChild(creerCardJourVide());
    }

    for (let jour = 1; jour <= nombreJours; jour += 1) {
      const dateIso = construireDateIso(etatCalendrier.annee, etatCalendrier.mois, jour);
      grille.appendChild(creerCardJourCalendrier(dateIso, jour, planningParDate.get(dateIso)));
    }
  }

  function creerCardJourVide() {
    const card = etatPage.templateJourMois.cloneNode(true);
    card.classList.add("lcdp-box-card-jour-in-calendrier-mois--empty");
    card.disabled = true;
    card.setAttribute("aria-hidden", "true");
    return card;
  }

  function creerCardJourCalendrier(dateIso, numeroJour, planningJour) {
    const card = etatPage.templateJourMois.cloneNode(true);
    const numero = card.querySelector("[data-lcdp-card-jour-mois-number]");

    const ouvert = Boolean(planningJour && planningJour.ouvert);
    const estPasse = dateIso < dateAujourdhuiIso();
    const estAujourdhui = dateIso === dateAujourdhuiIso();

    card.dataset.date = dateIso;
    card.setAttribute("aria-label", construireLibelleJour(dateIso, ouvert));

    if (numero) {
      numero.textContent = String(numeroJour);
    }

    if (estAujourdhui) {
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

    remplirPlagesJour(card, planningJour);

    return card;
  }

  function remplirPlagesJour(card, planningJour) {
    ["plage1", "plage2", "plage3"].forEach((nomPlage) => {
      const slot = card.querySelector('[data-lcdp-card-jour-mois-slot="' + nomPlage + '"]');

      if (!slot) return;

      const plage = planningJour && planningJour.plages ? planningJour.plages[nomPlage] : null;
      const couleur = normaliserCouleurClasse(plage && plage.ouverte ? plage.couleur : "gris_clair");

      slot.className = "lcdp-box-card-jour-in-calendrier-mois__slot lcdp-box-card-jour-in-calendrier-mois__slot--" + couleur;
    });
  }

  function changerMois(etatCalendrier, delta) {
    const date = new Date(etatCalendrier.annee, etatCalendrier.mois - 1 + delta, 1);
    etatCalendrier.annee = date.getFullYear();
    etatCalendrier.mois = date.getMonth() + 1;
  }

  async function afficherAlerte(message) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
    slot.appendChild(fragment);

    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      throw new Error("Structure de l’alerte incomplète.");
    }

    texte.textContent = message || "";

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", () => fermer(false));
      boutonOk.addEventListener("click", () => fermer(true));
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) fermer(false);
      });
    });
  }

  async function ouvrirDialogueChamp(options) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-dialogue-champ.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-champ]");
    const titre = slot.querySelector("[data-lcdp-dialogue-champ-title]");
    const formulaire = slot.querySelector("[data-lcdp-dialogue-champ-form]");
    const zoneContent = slot.querySelector("[data-lcdp-dialogue-champ-content]");
    const erreur = slot.querySelector("[data-lcdp-dialogue-champ-error]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-champ-close]");
    const boutonAnnuler = slot.querySelector("[data-lcdp-dialogue-champ-cancel]");

    if (!dialogue || !titre || !formulaire || !zoneContent || !erreur || !boutonFermer || !boutonAnnuler) {
      throw new Error("Structure de dialogue champ incomplète.");
    }

    titre.textContent = options.titre || "";

    for (const champ of options.champs || []) {
      zoneContent.appendChild(await creerChampDialogue(champ));
    }

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", () => fermer(null));
      boutonAnnuler.addEventListener("click", () => fermer(null));

      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) fermer(null);
      });

      formulaire.addEventListener("submit", (event) => {
        event.preventDefault();

        erreur.hidden = true;
        erreur.textContent = "";

        const data = {};
        let champRequisManquant = false;

        (options.champs || []).forEach((champ) => {
          const input = formulaire.querySelector('[name="' + champ.name + '"]');
          const valeur = input ? String(input.value || "").trim() : "";

          if (champ.required && !valeur) {
            champRequisManquant = true;
          }

          data[champ.name] = valeur;
        });

        if (champRequisManquant) {
          erreur.textContent = "Merci de renseigner le champ demandé.";
          erreur.hidden = false;
          return;
        }

        fermer(data);
      });

      const premierInput = formulaire.querySelector("input, textarea, select");
      if (premierInput) premierInput.focus();
    });
  }

  async function creerChampDialogue(configurationChamp) {
    const fragment = await chargerFragmentObjet("/BOX/03-box-champ-formulaire.html");

    const champ = fragment.querySelector("[data-lcdp-box-champ-formulaire]");
    const zoneLabel = fragment.querySelector("[data-lcdp-champ-label-zone]");
    const zoneControl = fragment.querySelector("[data-lcdp-champ-control]");

    if (!champ || !zoneLabel || !zoneControl) {
      throw new Error("Structure champ formulaire incomplète.");
    }

    const label = document.createElement("label");
    label.className = "lcdp-box-champ-formulaire__label";
    label.setAttribute("for", configurationChamp.id);
    label.textContent = configurationChamp.label || "";

    const input = document.createElement("input");
    input.id = configurationChamp.id;
    input.name = configurationChamp.name;
    input.type = configurationChamp.type || "text";
    input.required = configurationChamp.required === true;
    input.value = configurationChamp.value || "";

    if (configurationChamp.inputmode) {
      input.inputMode = configurationChamp.inputmode;
    }

    if (configurationChamp.autocomplete) {
      input.autocomplete = configurationChamp.autocomplete;
    }

    zoneLabel.appendChild(label);
    zoneControl.appendChild(input);

    return champ;
  }

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const bandeau = await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html");
    slot.appendChild(bandeau);
    appliquerRoutesSite(slot);

    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js");

    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre({
        etatMembre: {
          abonne: true
        }
      });
    }
  }

  async function initialiserFooter() {
    const slot = document.getElementById("lcdp-footer-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const footer = await chargerFragmentObjet("/BOX/02-box-footer.html");
    slot.appendChild(footer);
    appliquerRoutesSite(slot);
  }

  function appliquerRoutesSite(racine = document) {
    racine.querySelectorAll("[data-site-href]").forEach((element) => {
      const chemin = element.dataset.siteHref || "";
      const espace = element.dataset.space || "public";

      element.setAttribute(
        "href",
        espace === "membre" ? construireUrlMembre(chemin) : construireUrlPublic(chemin)
      );
    });

    racine.querySelectorAll("[data-site-src]").forEach((element) => {
      const chemin = element.dataset.siteSrc || "";
      const cheminObjet = chemin.replace(/^\/?OBJET\/?/, "/");
      element.setAttribute("src", construireUrlObjet(cheminObjet));
    });
  }

  async function chargerFragmentObjet(chemin) {
    const reponse = await fetch(construireUrlObjet(chemin), {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });

    if (!reponse.ok) {
      throw new Error("Fragment OBJET introuvable : " + chemin);
    }

    const html = await reponse.text();
    const template = document.createElement("template");
    template.innerHTML = html.trim();

    return template.content.cloneNode(true);
  }

  async function chargerFragmentMembre(chemin) {
    const reponse = await fetch(construireUrlMembre(chemin), {
      method: "GET",
      credentials: "omit",
      cache: "no-cache"
    });

    if (!reponse.ok) {
      throw new Error("Fragment membre introuvable : " + chemin);
    }

    const html = await reponse.text();
    const template = document.createElement("template");
    template.innerHTML = html.trim();

    return template.content.cloneNode(true);
  }

  function chargerScriptMembreUneFois(chemin) {
    const src = construireUrlMembre(chemin);

    if (document.querySelector('script[data-lcdp-script="' + chemin + '"]')) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.lcdpScript = chemin;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Script membre introuvable : " + chemin));
      document.body.appendChild(script);
    });
  }

  function obtenirZoneListe() {
    return document.querySelector("[data-lcdp-liste-card-list]");
  }

  function obtenirZoneMessageListe() {
    return document.querySelector("[data-lcdp-liste-card-message]");
  }

  function afficherChargementListe(message) {
    const zoneListe = obtenirZoneListe();

    if (zoneListe) zoneListe.innerHTML = "";

    afficherMessageListe(message || "Chargement...", "information");
  }

  function afficherErreurListe(message) {
    const zoneListe = obtenirZoneListe();

    if (zoneListe) zoneListe.innerHTML = "";

    afficherMessageListe(message, "erreur");
  }

  function afficherMessageListe(message, type) {
    const zoneMessage = obtenirZoneMessageListe();

    if (!zoneMessage) return;

    zoneMessage.hidden = false;
    zoneMessage.textContent = message || "";
    zoneMessage.dataset.lcdpMessageType = type || "information";
  }

  function masquerMessageListe() {
    const zoneMessage = obtenirZoneMessageListe();

    if (!zoneMessage) return;

    zoneMessage.hidden = true;
    zoneMessage.textContent = "";
    delete zoneMessage.dataset.lcdpMessageType;
  }

  function construireEndpointApi(cleModerne, cleLegacy, sousDomaineWorker) {
    const depuisConfig =
      CONFIG_PAGE?.[cleModerne] ||
      CONFIG_PAGE?.[cleLegacy] ||
      "";

    if (depuisConfig) return String(depuisConfig).replace(/\/+$/, "");

    if (typeof CONFIG_PAGE.apiUrl === "function") {
      return CONFIG_PAGE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    }

    return "";
  }

  function construireUrlPublic(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlPublic === "function") return window.LCDP_urlPublic(valeur);
    if (typeof CONFIG_PAGE.publicUrl === "function") return CONFIG_PAGE.publicUrl(valeur);

    return buildUrl(CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "", valeur);
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlMembre === "function") return window.LCDP_urlMembre(valeur);
    if (typeof CONFIG_PAGE.membreUrl === "function") return CONFIG_PAGE.membreUrl(valeur);

    return buildUrl(
      CONFIG_PAGE.membreBaseUrl ||
      CONFIG_PAGE.MEMBRE_BASE ||
      CONFIG_PAGE.siteBase ||
      "",
      valeur
    );
  }

  function construireUrlObjet(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlObjet === "function") return window.LCDP_urlObjet(valeur);
    if (typeof CONFIG_PAGE.objetUrl === "function") return CONFIG_PAGE.objetUrl(valeur);

    const objetBase =
      CONFIG_PAGE.objetBaseUrl ||
      CONFIG_PAGE.OBJET_BASE ||
      buildUrl(CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "", "/OBJET");

    return buildUrl(objetBase, valeur);
  }

  function construireUrlImageParc(imageparc) {
    const fichier = String(imageparc || "").trim() || "parc-defaut.jpg";

    return construireUrlObjet(DOSSIER_IMAGES_PARC_OBJET + "/" + encodeURIComponent(fichier));
  }

  function redirigerConnexionMembre(motif) {
    const separateur = PAGE_CONNEXION_MEMBRE.includes("?") ? "&" : "?";

    window.location.href =
      PAGE_CONNEXION_MEMBRE +
      separateur +
      "source=" +
      encodeURIComponent(SOURCE_PAGE) +
      "&session=" +
      encodeURIComponent(motif || "inactive");
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

  function nettoyerTexteCourt(valeur, longueurMax) {
    const texte = String(valeur || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!texte) return "";

    if (texte.length <= longueurMax) return texte;

    return texte.slice(0, Math.max(0, longueurMax - 1)).trim() + "…";
  }

  function construireDateIso(annee, mois, jour) {
    return [
      String(annee).padStart(4, "0"),
      String(mois).padStart(2, "0"),
      String(jour).padStart(2, "0")
    ].join("-");
  }

  function dateAujourdhuiIso() {
    const maintenant = new Date();
    return construireDateIso(
      maintenant.getFullYear(),
      maintenant.getMonth() + 1,
      maintenant.getDate()
    );
  }

  function formaterMoisAnnee(annee, mois) {
    const date = new Date(annee, mois - 1, 1);

    return date.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric"
    });
  }

  function construireLibelleJour(dateIso, ouvert) {
    const date = new Date(dateIso + "T00:00:00");
    const libelleDate = Number.isNaN(date.getTime())
      ? dateIso
      : date.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        });

    return libelleDate + (ouvert ? " disponible" : " indisponible");
  }

  function normaliserCouleurClasse(couleur) {
    const valeur = String(couleur || "gris_clair").trim().toLowerCase();

    if (valeur === "vert") return "vert";
    if (valeur === "orange") return "orange";
    if (valeur === "gris_fonce" || valeur === "fonce") return "gris-fonce";

    return "gris-clair";
  }

  function reponseApiOk(data) {
    return data && (data.ok === true || data.success === true);
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
  }

  function estUrlExterneOuAncre(chemin) {
    return (
      !chemin ||
      chemin.startsWith("#") ||
      chemin.startsWith("mailto:") ||
      chemin.startsWith("tel:") ||
      chemin.startsWith("http://") ||
      chemin.startsWith("https://") ||
      chemin.startsWith("data:")
    );
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }
})();
