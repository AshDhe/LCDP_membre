(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "reserver-membre";
  const DOSSIER_IMAGES_PARC_OBJET = "/IMAG/PARC";
  const NOM_IMAGE_CARD_PARC = "card1.webp";
  const CHEMIN_PICTOWAIT = "/BOX/pictowait.gif";
  const MEDIA_DESCRIPTION_CARD_PARC_TABLETTE_DESKTOP = window.matchMedia("(min-width: 768px)");

  const CLES_PLAGES_AFFICHAGE = [
    "plage1",
    "plage2",
    "plage3",
    "plage4",
    "plage5"
  ];

  const CLES_PLAGES_RESERVATION_ACTUELLES = [
    "plage1",
    "plage2",
    "plage3",
    "plage4",
    "plage5"
  ];

  const COULEURS_CSS_PLANNING = {
    "gris-moyen": "#9ca09e",
    "bleu-clair": "#cfe3f7",
    "bleu-fonce": "#2f6fb3",
    "violet": "#7b5aa6",
    "orange-clair": "#ffd8a8",
    "orange-fonce": "#f2a23a"
  };

  const ENDPOINT_NOUVELLE_DATE_MEMBRE = construireEndpointApi(
    "workerNouvelleDateMembreUrl",
    "WORKER_NOUVELLE_DATE_MEMBRE_URL",
    "nouvelle-date-membre-api"
  );

  const ENDPOINT_FLUXM = construireEndpointApi(
    "workerFluxmUrl",
    "WORKER_FLUXM_URL",
    "fluxm-api"
  );

  const ENDPOINT_PLANNING_MEMBRE = construireEndpointApi(
    "workerPlanningMembreUrl",
    "WORKER_PLANNING_MEMBRE_URL",
    "planning-membre-api"
  );

  const ENDPOINT_INDEX_MEMBRE = construireEndpointApi(
    "workerIndexMembreUrl",
    "WORKER_INDEX_MEMBRE_URL",
    "index-membre-api"
  );

  const ENDPOINT_PLANNING_PARC = construireEndpointApi(
    "workerPlanningParcUrl",
    "WORKER_PLANNING_PARC_URL",
    "planning-parc-api"
  );

  const ENDPOINT_PARTAGE_PAGE = construireEndpointApi(
    "workerPartagePageUrl",
    "WORKER_PARTAGE_PAGE_URL",
    "partage-pages-api"
  );

  const ENDPOINT_RESERVER_MEMBRE_IASHIFT = construireEndpointApi(
    "workerReserverMembreIashiftUrl",
    "WORKER_RESERVER_MEMBRE_IASHIFT_URL",
    "reserver-membre-iashift-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_PAIEMENT_CB = construireUrlMembre("/ESPACE-MEMBRE/paiement-cb.html");

  let pageInitialisee = false;
  let etatMembre = { abonne: false, abonnementSuspendu: false, abonnementAnnuleNonPaye: false, paiementSuspension: null, statudaConnue: false, statuda: null, datenext: null };
  let promessePrechargementConstructeurFicheParc = null;

  const etatIaShift = {
    ouverte: false,
    ouvertureEnCours: false,
    ouvertureNumero: 0,
    confirmationOuvertureEnCours: false,
    fermetureEnCours: false,
    fermerApresAudio: false,
    mediaStream: null,
    peerConnection: null,
    dataChannel: null,
    audio: null,
    sessionInitialisee: false,
    slot: null,
    lightbox: null,
    message: null,
    transcription: null,
    propositions: null,
    boutonMicro: null,
    timerFermeture: null,
    appelsTraites: new Set()
  };

  const panierPlanning = { reservations: [], abonnements: [], donneesConnues: false, calcul: null, generation: 0, selection: null, derniereAction: null };
  let choixPlanningEnCours = false;

  const cachePlanningParcLecture = new Map();
  const DUREE_CACHE_PLANNING_LECTURE_MS = 30000;

  const etatPage = {
    departement: "",
    parcs: [],
    reservationsMembre: [],
    templateListeParcs: null,
    templateCardParc: null,
    templateJourMois: null,
    templateHeureJour: null,
    templateShiftDetailParc: null,
    calendrierMoisActif: null,
    planningParcLectureActif: null,
    shiftDetailParc: null
  };

  let attenteListeParcs = null;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    if (pageInitialisee) return;
    pageInitialisee = true;
    document.body.classList.add("lcdp-page-reserver");
    const titrePage = document.querySelector(".lcdp-title-page-center");
    if (titrePage) titrePage.textContent = "PLANIFIER";

    // Les éléments non indispensables ne retardent pas l'affichage du calendrier.
    const bandeauPret = initialiserBandeau().catch(erreur => {
      console.warn("Bandeau indisponible sur la page Planifier.", erreur);
    });
    initialiserFooter().catch(erreur => {
      console.warn("Footer indisponible sur la page Planifier.", erreur);
    });

    try {
      // Vérification de session et construction de la grille indépendantes.
      const [etat] = await Promise.all([
        chargerEtatMembre(),
        ouvrirPlanningGeneralVierge()
      ]);
      etatMembre = etat;
      afficherEtatMembre(etatMembre);
      masquerAttenteInitialePlanifier();

      // L'initialisation du burger dépend du bandeau, mais pas l'affichage du planning.
      bandeauPret.then(() => actualiserBurgerMembre(etatMembre.abonne))
        .catch(erreur => console.warn("Menu burger indisponible.", erreur));
      chargerDialogueFiltrePlanifier()
        .catch(erreur => console.warn("Préchargement du filtre indisponible.", erreur));
    } catch (erreur) {
      console.error("Erreur ouverture du planning général :", erreur);
      masquerAttenteInitialePlanifier();
      await afficherAlerte(erreur.message || "Impossible d’ouvrir le planning.");
    }
  }

  function masquerAttenteInitialePlanifier() {
    const attente = document.getElementById("lcdp-planifier-attente-initiale");
    if (!attente) return;
    // Attendre que la grille ait pu être peinte avant de retirer le GIF.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => attente.remove());
    });
  }

  // Filtres d'affichage : les catégories ne valent pas autorisation de réserver.
  const filtresAccesPlanifier = new Set(["famille", "coach", "famille-coach"]);
  let filtreParcOuvert = false;
  let parcInitialise = false;
  // Le même fragment sert aux deux filtres : une seule requête, anticipée.
  let promesseDialogueFiltre = null;
  function chargerDialogueFiltrePlanifier() {
    if (!promesseDialogueFiltre) {
      promesseDialogueFiltre = chargerFragmentObjet("/BOX/04-box-dialogue-champ.html")
        .catch(erreur => { promesseDialogueFiltre = null; throw erreur; });
    }
    return promesseDialogueFiltre.then(fragment => fragment.cloneNode(true));
  }

  async function ouvrirFiltreAccesPlanifier() {
    const enveloppe = document.createElement("div");
    document.body.appendChild(enveloppe);
    try {
      const fragment = await chargerDialogueFiltrePlanifier();
      enveloppe.appendChild(fragment);
      const dialogue = enveloppe.querySelector("[data-lcdp-box-dialogue-champ]");
      const titre = enveloppe.querySelector("[data-lcdp-dialogue-champ-title]");
      const form = enveloppe.querySelector("[data-lcdp-dialogue-champ-form]");
      const content = enveloppe.querySelector("[data-lcdp-dialogue-champ-content]");
      const close = enveloppe.querySelector("[data-lcdp-dialogue-champ-close]");
      const cancel = enveloppe.querySelector("[data-lcdp-dialogue-champ-cancel]");
      const submit = enveloppe.querySelector("[data-lcdp-dialogue-champ-submit]");
      if (![dialogue,titre,form,content,close,submit].every(Boolean)) throw new Error("Box Autorisation incomplète.");
      dialogue.classList.add("lcdp-planifier-acces-dialogue");
      titre.textContent = "Autorisation";
      submit.textContent = "VALIDER";
      cancel?.remove();
      const choix = [
        ["famille", "Avec FAMILLE"],
        ["coach", "Avec COACH"],
        ["famille-coach", "FAMILLE + COACH"]
      ];
      for (const [valeur, libelle] of choix) {
        const ligne = document.createElement("label");
        ligne.className = "lcdp-planifier-acces-option lcdp-planifier-acces-option--" + valeur;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = "type-acces";
        input.value = valeur;
        input.checked = filtresAccesPlanifier.has(valeur);
        const texte = document.createElement("span");
        texte.textContent = libelle;
        ligne.append(input, texte);
        content.appendChild(ligne);
      }
      return await new Promise(resolve => {
        let termine = false;
        function fermer(appliquer) {
          if (termine) return;
          termine = true;
          if (appliquer) {
            filtresAccesPlanifier.clear();
            content.querySelectorAll('input[name="type-acces"]:checked').forEach(input => filtresAccesPlanifier.add(input.value));
            document.getElementById("lcdp-planifier-bouton-acces")?.setAttribute("aria-label", "ACCÈS : " + (filtresAccesPlanifier.size ? [...filtresAccesPlanifier].join(", ") : "aucun filtre"));
          }
          enveloppe.remove();
          resolve(appliquer);
        }
        form.addEventListener("submit", event => {event.preventDefault();fermer(true);});
        close.addEventListener("click", () => fermer(false));
        dialogue.addEventListener("click", event => {if(event.target === dialogue) fermer(false);});
      });
    } catch(error) {enveloppe.remove(); throw error;}
  }

  function libelleDepartementListeParcs() {
    const code = String(etatPage.departement || "").trim();
    const nom = String(etatPage.nomDepartement || "").trim();
    return nom && code ? nom + " (" + code + ")" : nom || code;
  }

  async function ouvrirFiltreParcPlanifier() {
    if (filtreParcOuvert) return;
    filtreParcOuvert = true;
    const enveloppe = document.createElement("div");
    document.body.appendChild(enveloppe);
    // Le pictogramme démarre immédiatement, avant les chargements réseau.
    const chargement = document.createElement("div");
    chargement.className = "lcdp-planifier-parcs-chargement";
    chargement.setAttribute("role", "status");
    chargement.setAttribute("aria-label", "Chargement des parcs");
    chargement.appendChild(creerPictowait("Chargement des parcs…"));
    enveloppe.appendChild(chargement);
    const barre = document.getElementById("lcdp-commande-bar-reserver-slot");
    const liste = document.getElementById("lcdp-liste-card-parcs-slot");
    try {
      const fragment = await chargerDialogueFiltrePlanifier();
      enveloppe.appendChild(fragment);
      const dialogue = enveloppe.querySelector("[data-lcdp-box-dialogue-champ]");
      const carte = enveloppe.querySelector(".lcdp-box-dialogue-champ__card");
      const titre = enveloppe.querySelector("[data-lcdp-dialogue-champ-title]");
      const form = enveloppe.querySelector("[data-lcdp-dialogue-champ-form]");
      const content = enveloppe.querySelector("[data-lcdp-dialogue-champ-content]");
      const close = enveloppe.querySelector("[data-lcdp-dialogue-champ-close]");
      if (![dialogue,carte,titre,form,content,close,barre,liste].every(Boolean)) throw new Error("Box Parc incomplète.");
      carte.classList.add("lcdp-planifier-parcs-card");
      titre.textContent = "Parcs du département";
      const nomDepartement = document.createElement("p");
      nomDepartement.className = "lcdp-planifier-parcs-departement";
      nomDepartement.textContent = libelleDepartementListeParcs();
      titre.insertAdjacentElement("afterend", nomDepartement);
      form.querySelector(".lcdp-box-dialogue-champ__actions")?.remove();
      content.append(barre,liste);
      content.prepend(chargement);
      barre.hidden = false;
      liste.hidden = false;
      let ferme = false;
      const fermer = () => {
        if (ferme) return;
        ferme = true;
        const pageContent = document.querySelector(".lcdp-page-reserver .lcdp-page-content--avec-entete");
        if (pageContent) pageContent.append(barre,liste);
        barre.hidden = true;
        liste.hidden = true;
        enveloppe.remove();
        filtreParcOuvert = false;
      };
      close.addEventListener("click", fermer);
      dialogue.addEventListener("click", event => {if(event.target === dialogue) fermer();});
      if (!parcInitialise) {
        parcInitialise = true;
        try {
          await initialiserListeParcs();
          await initialiserCommandeBarReserver();
          initialiserBoutonDepartementPrincipal();
          document.addEventListener("click", gererClicDocument);
          await chargerReservationsMembrePourBlocages();
          await chargerParcsDepartementMembre();
          chargement.remove();
          nomDepartement.textContent = libelleDepartementListeParcs();
        } catch(error) {parcInitialise = false; throw error;}
      } else {
        afficherCommandeBarReserver();
        chargement.remove();
      }
    } catch(error) {
      const pageContent = document.querySelector(".lcdp-page-reserver .lcdp-page-content--avec-entete");
      if (pageContent && barre && liste) pageContent.append(barre,liste);
      enveloppe.remove(); filtreParcOuvert = false;
      throw error;
    }
  }

  // Étape 1 du nouveau parcours PLANIFIER : aucune donnée de parc ni d'abonnement
  // n'est utilisée pour remplir la grille. Les filtres seront ajoutés ensuite.
  async function ouvrirPlanningGeneralVierge() {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) throw new Error("Emplacement du planning introuvable.");
    const [fragmentCalendrier, fragmentJour] = await Promise.all([
      chargerFragmentObjet("/BOX/04-box-calendrier-mois.html"),
      chargerFragmentObjet("/BOX/04-box-card-jour-in-calendrier-mois.html")
    ]);
    const calendrier = fragmentCalendrier.querySelector("[data-lcdp-box-calendrier-mois]");
    const templateJour = fragmentJour.querySelector("[data-lcdp-card-jour-mois]");
    if (!calendrier || !templateJour) throw new Error("Grille mensuelle indisponible.");

    const titre = calendrier.querySelector("[data-lcdp-calendrier-mois-title]");
    const meta = calendrier.querySelector("[data-lcdp-calendrier-mois-meta]");
    const courant = calendrier.querySelector("[data-lcdp-calendrier-mois-current]");
    const grille = calendrier.querySelector("[data-lcdp-calendrier-mois-grid]");
    const message = calendrier.querySelector("[data-lcdp-calendrier-mois-message]");
    const precedent = calendrier.querySelector("[data-lcdp-calendrier-mois-prev]");
    const suivant = calendrier.querySelector("[data-lcdp-calendrier-mois-next]");
    const fermer = calendrier.querySelector("[data-lcdp-calendrier-mois-close]");
    if (![titre, meta, courant, grille, message, precedent, suivant, fermer].every(Boolean)) {
      throw new Error("Structure du planning mensuel incomplète.");
    }

    titre.textContent = "PLANIFIER";
    // Commandes de filtre : présentation seule à cette étape du parcours.
    // Elles seront raccordées aux filtres de disponibilité lors du pas-à-pas.
    const enteteFiltres = document.createElement("div");
    enteteFiltres.className = "lcdp-planifier-entete-filtres";
    titre.replaceWith(enteteFiltres);
    enteteFiltres.appendChild(titre);
    const actionsFiltres = document.createElement("div");
    actionsFiltres.className = "lcdp-planifier-actions-filtres";
    const boutonAcces = document.createElement("button");
    boutonAcces.type = "button";
    boutonAcces.className = "lcdp-planifier-filtre lcdp-planifier-filtre--acces";
    boutonAcces.insertAdjacentHTML("beforeend", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">\n  <circle cx="12" cy="7" r="4.5"/>\n  <path d="M12 11.5c-5.1 0-7.8 2.8-7.8 7.8v.9c0 .72.58 1.3 1.3 1.3h13c.72 0 1.3-.58 1.3-1.3v-.9c0-5-2.7-7.8-7.8-7.8Z"/>\n</svg>');
    boutonAcces.appendChild(document.createTextNode("ACCÈS"));
    boutonAcces.id = "lcdp-planifier-bouton-acces";
    boutonAcces.setAttribute("aria-label", "Filtrer les accès autorisés");
    boutonAcces.addEventListener("click", () => ouvrirFiltreAccesPlanifier().catch(console.error));
    const boutonParc = document.createElement("button");
    boutonParc.type = "button";
    boutonParc.className = "lcdp-planifier-filtre lcdp-planifier-filtre--parc";
    boutonParc.setAttribute("aria-label", "Choisir les parcs");
    boutonParc.addEventListener("click", () => ouvrirFiltreParcPlanifier().catch(console.error));
    boutonParc.insertAdjacentHTML("beforeend", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">\n  <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>\n  <circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>\n</svg>');
    boutonParc.appendChild(document.createTextNode("PARC"));
    actionsFiltres.append(boutonAcces, boutonParc);
    enteteFiltres.appendChild(actionsFiltres);
    meta.textContent = "";
    meta.hidden = true;
    message.hidden = true;
    message.textContent = "";
    const morceauxDate = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const lirePartie = type => morceauxDate.find(partie => partie.type === type)?.value || "";
    const aujourdhui = `${lirePartie("year")}-${lirePartie("month")}-${lirePartie("day")}`;
    const annee = Number(lirePartie("year"));
    const mois = Number(lirePartie("month"));
    const etat = { annee, mois };
    const borne = annee * 12 + mois;

    function afficher() {
      courant.textContent = formaterMoisAnnee(etat.annee, etat.mois);
      grille.replaceChildren();
      const premierJour = new Date(etat.annee, etat.mois - 1, 1);
      const decalage = (premierJour.getDay() + 6) % 7;
      const nbJours = new Date(etat.annee, etat.mois, 0).getDate();
      for (let i = 0; i < decalage; i++) {
        const vide = templateJour.cloneNode(true);
        vide.classList.add("lcdp-box-card-jour-in-calendrier-mois--empty");
        vide.disabled = true;
        vide.setAttribute("aria-hidden", "true");
        grille.appendChild(vide);
      }
      for (let jour = 1; jour <= nbJours; jour++) {
        const iso = construireDateIso(etat.annee, etat.mois, jour);
        const card = templateJour.cloneNode(true);
        const numero = card.querySelector("[data-lcdp-card-jour-mois-number]");
        if (numero) numero.textContent = String(jour);
        card.dataset.date = iso;
        card.setAttribute("aria-label", iso);
        // Les plages restent véritablement vides : aucun statut de parc n'est simulé.
        card.querySelectorAll("[data-lcdp-card-jour-mois-slot]").forEach(slotPlage => {
          slotPlage.hidden = true;
          slotPlage.replaceChildren();
        });
        if (iso < aujourdhui) {
          card.classList.add("lcdp-box-card-jour-in-calendrier-mois--past");
          card.disabled = true;
        } else if (iso === aujourdhui) {
          card.classList.add("lcdp-box-card-jour-in-calendrier-mois--today");
        }
        // Aucune action sur les jours avant définition des filtres.
        grille.appendChild(card);
      }
      precedent.disabled = etat.annee * 12 + etat.mois <= borne;
    }
    precedent.addEventListener("click", () => {
      if (etat.annee * 12 + etat.mois <= borne) return;
      changerMois(etat, -1); afficher();
    });
    suivant.addEventListener("click", () => { changerMois(etat, 1); afficher(); });
    fermer.addEventListener("click", () => {
      window.location.href = construireUrlMembre("/ESPACE-MEMBRE/accueil-membre.html");
    });
    slot.replaceChildren(calendrier);
    afficher();

  }

  async function chargerEtatMembre() {
    if (!ENDPOINT_INDEX_MEMBRE) {
      throw new Error("Le service d’état membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return { abonne: false, abonnementSuspendu: false, abonnementAnnuleNonPaye: false, paiementSuspension: null, statudaConnue: false, statuda: null, datenext: null };
    }

    if (!reponse.ok || !resultat || !reponseApiOk(resultat)) {
      throw new Error(messageErreurApi(resultat, "Impossible de vérifier l’état membre."));
    }

    return {
      abonne: valeurBooleenneVraie(resultat.abonne),
      abonnementSuspendu: valeurBooleenneVraie(resultat.abonnementSuspendu || resultat.suspendu),
      abonnementAnnuleNonPaye: valeurBooleenneVraie(resultat.abonnementAnnuleNonPaye || resultat.abonnementAnnule || resultat.annuleNonPaye),
      paiementSuspension: resultat.paiementSuspension || resultat.paiementRegularisation || null,
      statudaConnue: Object.prototype.hasOwnProperty.call(resultat, "statuda"),
      statuda: normaliserStatudaReservation(resultat.statuda),
      datenext: resultat.datenext || null
    };
  }

  function afficherEtatMembre(etat) {
    let mention = document.getElementById("mention-statut-membre");

    if (!mention) {
      const titre = document.querySelector(".lcdp-title-page-center");
      if (!titre || !titre.parentNode) return;

      mention = document.createElement("p");
      mention.id = "mention-statut-membre";
      mention.className = "lcdp-mention-connexion";
      titre.insertAdjacentElement("afterend", mention);
    }

    mention.textContent = etat && etat.abonne ? "MEMBRE ABONNÉ" : "MEMBRE INVITÉ";
    afficherSuspensionMembre(etat);
  }

  function afficherSuspensionMembre(etat) {
    const mention = document.getElementById("mention-statut-membre");
    if (!mention || !mention.parentNode) return;

    let bloc = document.getElementById("mention-suspension-abonnement-membre");

    if (!etat || etat.abonnementSuspendu !== true) {
      if (bloc) bloc.remove();
      return;
    }

    if (!bloc) {
      bloc = document.createElement("div");
      bloc.id = "mention-suspension-abonnement-membre";
      bloc.className = "lcdp-mention-connexion lcdp-mention-suspension-abonnement";
      mention.insertAdjacentElement("afterend", bloc);
    }

    bloc.innerHTML = "";

    const delaiPaiementDepasse = paiementSuspensionDelaiDepasse(etat?.paiementSuspension);

    const texte = document.createElement("span");
    texte.textContent = delaiPaiementDepasse
      ? "[Votre abonnement est annulé (non payé)]"
      : "[Votre abonnement est suspendu (non payé)]";
    bloc.appendChild(texte);

    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-secondary lcdp-workflow-micro-action";
    bouton.classList.toggle("lcdp-workflow-micro-action--paiement-depasse", delaiPaiementDepasse);
    bouton.setAttribute("aria-disabled", delaiPaiementDepasse ? "true" : "false");
    bouton.textContent = "Payer";
    bouton.addEventListener("click", () => {
      gererPaiementSuspensionMembre(etat).catch(console.error);
    });
    bloc.appendChild(bouton);
  }

  async function gererPaiementSuspensionMembre(etat) {
    await afficherEcheancesPaiementSuspension(etat);
  }

  async function afficherEcheancesPaiementSuspension(etat) {
    const paiement = etat && etat.paiementSuspension ? etat.paiementSuspension : null;
    const orderid = String(paiement?.orderid || "").trim();
    const echeances = echeancesPaiementSuspension(paiement);

    if (!orderid) {
      await afficherAlerte("Paiement introuvable.");
      return;
    }

    if (!echeances.length) {
      await afficherAlerte("Aucune échéance non payée.");
      return;
    }

    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = slot.querySelector("[data-lcdp-dialogue-title]");
    const texte = slot.querySelector("[data-lcdp-dialogue-text]");
    const actions = slot.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      slot.innerHTML = "";
      throw new Error("Structure dialogue bouton incomplète.");
    }

    titre.textContent = "Paiement en attente";
    texte.textContent = "";
    texte.hidden = true;
    actions.innerHTML = "";
    actions.classList.add("lcdp-dialogue-echeances-impayees");

    echeances.forEach((echeance) => {
      const ligne = document.createElement("div");
      ligne.className = "lcdp-dialogue-echeances-impayees__row";

      const description = document.createElement("p");
      description.className = "lcdp-dialogue-echeances-impayees__text";
      description.textContent = "Échéance " + String(echeance.numero) + " du " + formaterDatePaiementSuspension(echeance.date) + " : " + formaterMontantPaiementSuspension(echeance.montant) + " TTC\nNon payée";

      const boutonPayer = creerBoutonPaiementSuspension("Payer", "lcdp-button-secondary lcdp-workflow-micro-action lcdp-workflow-micro-action--alerte-paiement", () => {
        ouvrirPagePaiementSuspension(paiement, echeance.numero).catch(console.error);
      });

      ligne.appendChild(description);
      ligne.appendChild(boutonPayer);
      actions.appendChild(ligne);
    });


    function fermer() {
      slot.innerHTML = "";
    }

    boutonFermer.addEventListener("click", fermer);
    dialogue.addEventListener("click", (event) => {
      if (event.target === dialogue) fermer();
    });

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") fermer();
      },
      { once: true }
    );
  }

  function echeancesPaiementSuspension(paiement) {
    const source = Array.isArray(paiement?.echeances) ? paiement.echeances : [];
    const echeances = source
      .map((echeance) => ({
        numero: Number(echeance?.numero || echeance?.echeance || 0),
        date: echeance?.date || "",
        montant: echeance?.montant ?? ""
      }))
      .filter((echeance) => echeance.numero >= 1);

    if (!echeances.length && paiement?.echeance) {
      echeances.push({
        numero: Number(paiement.echeance || 1),
        date: paiement.date || "",
        montant: paiement.montant ?? ""
      });
    }

    return echeances;
  }

  function creerBoutonPaiementSuspension(label, style, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button " + (style || "lcdp-button-primary");
    bouton.textContent = label || "OK";
    bouton.addEventListener("click", action);
    return bouton;
  }

  async function ouvrirPagePaiementSuspension(paiement, numeroEcheance) {
    const orderid = String(paiement?.orderid || "").trim();

    if (!orderid) {
      await afficherAlerte("Commande non renseignée.");
      return;
    }

    if (paiementSuspensionDelaiDepasse(paiement)) {
      await afficherAlerte(messageDelaiPaiementDepasse());
      return;
    }

    const ok = await afficherAlerte("Vous allez être dirigé vers la page de paiement. La régularisation de votre abonnement se fait par carte bancaire uniquement.");
    if (!ok) return;

    const separateur = PAGE_PAIEMENT_CB.includes("?") ? "&" : "?";
    window.location.href = PAGE_PAIEMENT_CB + separateur + "orderid=" + encodeURIComponent(orderid) + "&echeance=" + encodeURIComponent(String(numeroEcheance || 1)) + "&source=suspension";
  }

  function messageDelaiPaiementDepasse() {
    return "Le délai de paiement est dépassé. Cet abonnement est annulé.";
  }

  function messageBlocageNouvelleDate(etat) {
    if (abonnementAnnuleNonPaye(etat)) {
      return "Votre abonnement est annulé (non payé).";
    }

    if (etat && etat.abonnementSuspendu === true) {
      return "Votre abonnement est suspendu (non payé).";
    }

    if (!etat || (etat.abonne !== true && !membreAbonne())) {
      return "Vous devez être membre abonné pour planifier votre activité.";
    }

    return "";
  }

  function normaliserStatudaReservation(value) {
    const statut = String(value || "").trim().toLowerCase();

    return ["encours", "oui", "non"].includes(statut) ? statut : null;
  }

  function formaterDateDaReservation(value) {
    if (!value) return "une date communiquée par le club";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

    return date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function abonnementAnnuleNonPaye(etat) {
    if (!etat) return false;

    if (etat.abonnementAnnuleNonPaye === true) {
      return true;
    }

    return paiementSuspensionDelaiDepasse(etat.paiementSuspension);
  }

  function paiementSuspensionDelaiDepasse(paiement) {
    if (!paiement || typeof paiement !== "object") return false;

    if (valeurBooleenneVraie(paiement.delaiPaiementDepasse) || valeurBooleenneVraie(paiement.abonnementAnnuleNonPaye)) {
      return true;
    }

    return delaiPaiementDepasseDepuisFin(paiement.fin || paiement.dateFin || paiement.finabo || "");
  }

  function delaiPaiementDepasseDepuisFin(value) {
    const fin = dateIsoPaiementDepuisValeur(value);

    if (!fin) return false;

    const maintenantParis = dateHeureParisPaiement(new Date());

    if (maintenantParis.dateIso > fin) return true;
    if (maintenantParis.dateIso < fin) return false;

    return maintenantParis.heure >= 14;
  }

  function dateIsoPaiementDepuisValeur(value) {
    const texte = String(value || "").trim();
    const match = texte.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      return match[1] + "-" + match[2] + "-" + match[3];
    }

    const date = new Date(texte);

    if (Number.isNaN(date.getTime())) return "";

    return dateHeureParisPaiement(date).dateIso;
  }

  function dateHeureParisPaiement(date) {
    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23"
    }).formatToParts(date);

    const valeur = (type) => morceaux.find((item) => item.type === type)?.value || "";

    return {
      dateIso: valeur("year") + "-" + valeur("month") + "-" + valeur("day"),
      heure: Number(valeur("hour") || 0),
      minute: Number(valeur("minute") || 0)
    };
  }

  function formaterDatePaiementSuspension(value) {
    if (!value) return "Non renseignée";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formaterMontantPaiementSuspension(value) {
    const nombre = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(nombre)) return "Non renseigné";
    return nombre.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  }

  function valeurBooleenneVraie(valeur) {
    return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
  }

  async function actualiserBurgerMembre(abonne) {
    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre({
        etatMembre: {
          abonne: abonne === true
        }
      });
    }
  }

  async function initialiserListeParcs() {
    const slot = document.getElementById("lcdp-liste-card-parcs-slot");

    if (!slot) {
      throw new Error("Slot liste des parcs introuvable.");
    }

    afficherPictowaitListeParcs(
      "Construction de la liste des parcs…",
      false
    );

    const fragmentListe = await chargerFragmentObjet(
      "/BOX/04-box-liste-card.html"
    );
    const listeCard = fragmentListe.querySelector(
      "[data-lcdp-box-liste-card]"
    );

    if (!listeCard) {
      throw new Error("Structure List Card parcs incomplète.");
    }

    listeCard.classList.add("lcdp-box-liste-card--encadree");
    etatPage.templateListeParcs = listeCard;

    const fragmentCard = await chargerFragmentObjet("/BOX/04-box-card-parc.html");
    etatPage.templateCardParc = fragmentCard.querySelector("[data-lcdp-box-card-parc]");

    const fragmentShiftDetailParc = await chargerFragmentObjet("/BOX/04-box-shift-detail-parc.html");
    etatPage.templateShiftDetailParc = fragmentShiftDetailParc.querySelector("[data-lcdp-box-shift-detail-parc]");

    const fragmentJour = await chargerFragmentObjet("/BOX/04-box-card-jour-in-calendrier-mois.html");
    etatPage.templateJourMois = fragmentJour.querySelector("[data-lcdp-card-jour-mois]");

    const fragmentHeure = await chargerFragmentObjet("/BOX/04-box-card-heure-in-calendrier-jour.html");
    etatPage.templateHeureJour = fragmentHeure.querySelector("[data-lcdp-card-heure-jour]");

    if (
      !etatPage.templateListeParcs ||
      !etatPage.templateCardParc ||
      !etatPage.templateShiftDetailParc ||
      !etatPage.templateJourMois ||
      !etatPage.templateHeureJour
    ) {
      throw new Error(
        "Templates liste, parc, shift détail parc, " +
        "jour ou heure introuvables."
      );
    }
  }

  async function initialiserCommandeBarReserver() {
    const slot = document.getElementById("lcdp-commande-bar-reserver-slot");
    const boutonDepartement = document.getElementById("bouton-changer-departement");
    const boutonCarte = document.getElementById("bouton-voir-carte");

    if (!slot || !boutonDepartement || !boutonCarte) {
      throw new Error("Structure Command Bar réserver incomplète.");
    }

    ajouterPictoCommandeBar(
      boutonDepartement,
      "/IMAG/PICTO/picto-changer-donnees.svg",
      "Changer de département"
    );
    ajouterPictoCommandeBar(
      boutonCarte,
      "/IMAG/PICTO/picto-localiser.svg",
      "Voir sur la carte"
    );

    const fragment = await chargerFragmentObjet("/BOX/04-box-commande-bar.html");
    const commandeBar = fragment.querySelector("[data-lcdp-box-commande-bar]");
    const actions = fragment.querySelector("[data-lcdp-commande-bar-actions]");

    if (!commandeBar || !actions) {
      throw new Error("Objet Command Bar incomplet.");
    }

    commandeBar.classList.add("lcdp-box-commande-bar--encadree");

    actions.append(boutonDepartement, boutonCarte);
    // La carte sera raccordée lors d'une prochaine étape.

    slot.replaceChildren(commandeBar);
    slot.hidden = true;
    slot.setAttribute("aria-hidden", "true");
  }

  function ajouterPictoCommandeBar(bouton, cheminPicto, libelle) {
    if (!bouton) return;

    const texte = String(libelle || bouton.textContent || "").trim();
    const iconeExistante = bouton.querySelector(".lcdp-box-commande-bar__icone");
    const libelleExistant = bouton.querySelector(".lcdp-box-commande-bar__libelle");

    if (iconeExistante && libelleExistant) {
      iconeExistante.src = construireUrlObjet(cheminPicto);
      libelleExistant.textContent = texte;
      return;
    }

    const icone = document.createElement("img");
    icone.className = "lcdp-box-commande-bar__icone";
    icone.src = construireUrlObjet(cheminPicto);
    icone.alt = "";
    icone.width = 20;
    icone.height = 20;
    icone.decoding = "async";
    icone.draggable = false;
    icone.setAttribute("aria-hidden", "true");

    const span = document.createElement("span");
    span.className = "lcdp-box-commande-bar__libelle";
    span.textContent = texte;

    bouton.replaceChildren(icone, span);
  }

  function afficherCommandeBarReserver() {
    const slot = document.getElementById(
      "lcdp-commande-bar-reserver-slot"
    );

    if (
      !slot ||
      !slot.querySelector("[data-lcdp-box-commande-bar]")
    ) {
      return;
    }

    slot.hidden = false;
    slot.setAttribute("aria-hidden", "false");
  }

  function initialiserBoutonDepartementPrincipal() {
    const boutonDepartement = document.getElementById("bouton-changer-departement");

    if (boutonDepartement) {
      boutonDepartement.addEventListener("click", () => {
        ouvrirChoixDepartement().catch(console.error);
      });
    }

  }

  async function demanderOuvertureRechercheIaShift() {
    if (
      etatIaShift.ouverte ||
      etatIaShift.ouvertureEnCours ||
      etatIaShift.confirmationOuvertureEnCours
    ) {
      return;
    }

    etatIaShift.confirmationOuvertureEnCours = true;

    let confirmation = null;

    try {
      confirmation = await ouvrirDialogueBoutonsSuperpose({
        titre: "Confirmer l’ouverture du micro",
        texte:
          "La recherche avec l’IA utilise votre microphone pendant la conversation.",
        boutons: [
          {
            label: "Annuler",
            valeur: "annuler",
            style: "lcdp-button-secondary"
          },
          {
            label: "Confirmer",
            valeur: "confirmer",
            style: "lcdp-button-orange"
          }
        ]
      });
    } finally {
      etatIaShift.confirmationOuvertureEnCours = false;
    }

    if (confirmation !== "confirmer") return;

    await ouvrirRechercheIaShift();
  }

  async function ouvrirRechercheIaShift() {
    if (etatIaShift.ouverte || etatIaShift.ouvertureEnCours) return;

    if (!ENDPOINT_RESERVER_MEMBRE_IASHIFT) {
      await afficherAlerte(
        "Le service de recherche avec l’IA n’est pas configuré."
      );
      return;
    }

    const ouvertureNumero = etatIaShift.ouvertureNumero + 1;

    etatIaShift.ouvertureNumero = ouvertureNumero;
    etatIaShift.ouvertureEnCours = true;
    actualiserBlocageBoutonsRechercheIaShift(true);

    try {
      await construireInterfaceIaShift();

      if (etatIaShift.ouvertureNumero !== ouvertureNumero) return;

      actualiserStatutIaShift("Connexion à l’assistant…");

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      if (etatIaShift.ouvertureNumero !== ouvertureNumero) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }

      etatIaShift.mediaStream = mediaStream;

      const peerConnection = new RTCPeerConnection();
      const audio = document.createElement("audio");
      const dataChannel = peerConnection.createDataChannel("oai-events");

      etatIaShift.peerConnection = peerConnection;
      etatIaShift.dataChannel = dataChannel;
      etatIaShift.audio = audio;

      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.hidden = true;
      document.body.appendChild(audio);

      peerConnection.addEventListener("track", (event) => {
        const flux = event.streams && event.streams[0];

        if (flux) audio.srcObject = flux;
      });

      peerConnection.addEventListener("connectionstatechange", () => {
        if (
          ["failed", "disconnected", "closed"].includes(
            peerConnection.connectionState
          ) &&
          etatIaShift.ouverte
        ) {
          actualiserStatutIaShift(
            "La connexion avec l’assistant a été interrompue."
          );
        }
      });

      mediaStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, mediaStream);
      });

      dataChannel.addEventListener("open", () => {
        actualiserStatutIaShift("Initialisation de l’assistant…");
      });

      dataChannel.addEventListener("message", (event) => {
        gererEvenementRealtimeIaShift(event.data).catch((error) => {
          console.error("Erreur événement IA Shift :", error);
          actualiserStatutIaShift(
            error?.message || "Une erreur est survenue avec l’assistant."
          );
        });
      });

      dataChannel.addEventListener("close", () => {
        if (etatIaShift.ouverte && !etatIaShift.fermetureEnCours) {
          actualiserStatutIaShift("Conversation terminée.");
        }
      });

      const offre = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offre);

      const reponse = await fetch(
        ENDPOINT_RESERVER_MEMBRE_IASHIFT + "/ouvrir-session",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Accept": "application/sdp",
            "Content-Type": "application/sdp"
          },
          body: offre.sdp
        }
      );
      const reponseTexte = await reponse.text();

      if (etatIaShift.ouvertureNumero !== ouvertureNumero) return;

      if (reponse.status === 401) {
        fermerRechercheIaShift();
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok) {
        let message = "L’assistant vocal est momentanément indisponible.";

        try {
          const data = JSON.parse(reponseTexte);
          message = messageErreurApi(data, message);
        } catch {
          /* Réponse SDP ou texte non JSON. */
        }

        throw new Error(message);
      }

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: reponseTexte
      });
    } catch (error) {
      if (etatIaShift.ouvertureNumero !== ouvertureNumero) return;

      fermerRechercheIaShift();

      if (
        error?.name === "NotAllowedError" ||
        error?.name === "PermissionDeniedError"
      ) {
        await afficherAlerte(
          "L’accès au microphone est nécessaire pour utiliser la recherche avec l’IA."
        );
        return;
      }

      await afficherAlerte(
        error?.message ||
        "Impossible d’ouvrir la recherche avec l’IA."
      );
    } finally {
      if (etatIaShift.ouvertureNumero === ouvertureNumero) {
        etatIaShift.ouvertureEnCours = false;
      }
    }
  }

  async function construireInterfaceIaShift() {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      throw new Error("Slot lightbox introuvable.");
    }

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet(
      "/BOX/04-box-calendrier-jour.html"
    );
    slot.appendChild(fragment);

    const lightbox = slot.querySelector(
      "[data-lcdp-box-calendrier-jour]"
    );
    const titre = slot.querySelector(
      "[data-lcdp-calendrier-jour-title]"
    );
    const meta = slot.querySelector(
      "[data-lcdp-calendrier-jour-meta]"
    );
    const message = slot.querySelector(
      "[data-lcdp-calendrier-jour-message]"
    );
    const contenu = slot.querySelector(
      "[data-lcdp-calendrier-jour-grid]"
    );
    const boutonFermer = slot.querySelector(
      "[data-lcdp-calendrier-jour-close]"
    );

    if (
      !lightbox ||
      !titre ||
      !meta ||
      !message ||
      !contenu ||
      !boutonFermer
    ) {
      slot.innerHTML = "";
      throw new Error("Structure de la lightbox IA incomplète.");
    }

    titre.textContent = "Rechercher avec l’IA";
    meta.textContent = "Assistant vocal IA Shift";
    message.hidden = false;
    message.textContent = "Préparation du microphone…";
    contenu.innerHTML = "";

    const transcription = document.createElement("p");
    transcription.className = "lcdp-text-strong-lead";
    transcription.hidden = true;
    transcription.setAttribute("aria-live", "polite");

    const propositions = document.createElement("div");
    propositions.className = "lcdp-stack-small";
    propositions.setAttribute("aria-live", "polite");

    const actions = document.createElement("div");
    actions.className = "lcdp-box-commande-bar__actions";

    const boutonMicro = document.createElement("button");
    boutonMicro.type = "button";
    boutonMicro.className = "lcdp-button lcdp-button-secondary";
    boutonMicro.textContent = "Couper le micro";
    boutonMicro.addEventListener("click", basculerMicroIaShift);

    const boutonQuitter = document.createElement("button");
    boutonQuitter.type = "button";
    boutonQuitter.className = "lcdp-button lcdp-button-secondary";
    boutonQuitter.textContent = "Fermer";
    boutonQuitter.addEventListener("click", fermerRechercheIaShift);

    actions.appendChild(boutonMicro);
    actions.appendChild(boutonQuitter);
    contenu.appendChild(transcription);
    contenu.appendChild(propositions);
    contenu.appendChild(actions);

    boutonFermer.addEventListener("click", fermerRechercheIaShift);
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) fermerRechercheIaShift();
    });

    etatIaShift.slot = slot;
    etatIaShift.lightbox = lightbox;
    etatIaShift.message = message;
    etatIaShift.transcription = transcription;
    etatIaShift.propositions = propositions;
    etatIaShift.boutonMicro = boutonMicro;
    etatIaShift.ouverte = true;

    document.addEventListener("keydown", gererEchapIaShift);
  }

  function gererEchapIaShift(event) {
    if (event.key === "Escape") fermerRechercheIaShift();
  }

  function actualiserStatutIaShift(message) {
    if (!etatIaShift.message) return;

    etatIaShift.message.hidden = false;
    etatIaShift.message.textContent = String(message || "");
  }

  function afficherTranscriptionIaShift(texte) {
    if (!etatIaShift.transcription) return;

    const valeur = String(texte || "").trim();
    etatIaShift.transcription.hidden = !valeur;
    etatIaShift.transcription.textContent = valeur;
  }

  function afficherPropositionsIaShift(propositions) {
    if (!etatIaShift.propositions) return;

    etatIaShift.propositions.innerHTML = "";

    const liste = Array.isArray(propositions) ? propositions : [];

    if (!liste.length) {
      const message = document.createElement("p");
      message.textContent =
        "Aucun créneau ne correspond à cette demande.";
      etatIaShift.propositions.appendChild(message);
      return;
    }

    liste.forEach((proposition) => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-button lcdp-button-secondary";
      bouton.textContent =
        "Proposition " +
        String(proposition.numero || "") +
        " — " +
        String(proposition.nomparc || "Parc") +
        " — " +
        String(proposition.date_affichage || "") +
        " à " +
        String(proposition.heure_affichage || "");
      bouton.addEventListener("click", () => {
        envoyerChoixVisuelIaShift(proposition);
      });
      etatIaShift.propositions.appendChild(bouton);
    });
  }

  function envoyerChoixVisuelIaShift(proposition) {
    if (!proposition || !etatIaShift.dataChannel) return;

    envoyerEvenementIaShift({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Je choisis la proposition " +
              String(proposition.numero || "") +
              "."
          }
        ]
      }
    });
    envoyerEvenementIaShift({ type: "response.create" });
  }

  function basculerMicroIaShift() {
    const pistes = etatIaShift.mediaStream
      ? etatIaShift.mediaStream.getAudioTracks()
      : [];

    if (!pistes.length) return;

    const activer = pistes.some((track) => track.enabled === false);

    pistes.forEach((track) => {
      track.enabled = activer;
    });

    if (etatIaShift.boutonMicro) {
      etatIaShift.boutonMicro.textContent = activer
        ? "Couper le micro"
        : "Réactiver le micro";
      etatIaShift.boutonMicro.setAttribute(
        "aria-pressed",
        activer ? "false" : "true"
      );
    }

    actualiserStatutIaShift(
      activer ? "Je vous écoute…" : "Microphone coupé."
    );
  }

  async function gererEvenementRealtimeIaShift(messageBrut) {
    let evenement;

    try {
      evenement = JSON.parse(String(messageBrut || ""));
    } catch {
      return;
    }

    if (evenement.type === "session.created") {
      if (!etatIaShift.sessionInitialisee) {
        etatIaShift.sessionInitialisee = true;
        etatIaShift.ouverte = true;
        actualiserStatutIaShift("Je vous écoute…");
        envoyerEvenementIaShift({
          type: "response.create",
          response: {
            instructions:
              "Commence maintenant la conversation en demandant quand le membre souhaite aller au parc."
          }
        });
      }
      return;
    }

    if (evenement.type === "input_audio_buffer.speech_started") {
      actualiserStatutIaShift("Je vous écoute…");
      return;
    }

    if (evenement.type === "input_audio_buffer.speech_stopped") {
      actualiserStatutIaShift("Je traite votre demande…");
      return;
    }

    if (
      evenement.type ===
      "conversation.item.input_audio_transcription.completed"
    ) {
      afficherTranscriptionIaShift(evenement.transcript || "");
      return;
    }

    if (evenement.type === "response.function_call_arguments.done") {
      await executerOutilIaShift({
        callId: evenement.call_id,
        nom: evenement.name,
        arguments: evenement.arguments
      });
      return;
    }

    if (
      evenement.type === "response.output_item.done" &&
      evenement.item?.type === "function_call"
    ) {
      await executerOutilIaShift({
        callId: evenement.item.call_id,
        nom: evenement.item.name,
        arguments: evenement.item.arguments
      });
      return;
    }

    if (evenement.type === "response.done") {
      const sorties = Array.isArray(evenement.response?.output)
        ? evenement.response.output
        : [];

      for (const sortie of sorties) {
        if (sortie?.type !== "function_call") continue;

        await executerOutilIaShift({
          callId: sortie.call_id,
          nom: sortie.name,
          arguments: sortie.arguments
        });
      }
      return;
    }

    if (evenement.type === "output_audio_buffer.stopped") {
      if (etatIaShift.fermerApresAudio) {
        window.setTimeout(fermerRechercheIaShift, 500);
      } else {
        actualiserStatutIaShift("Je vous écoute…");
      }
      return;
    }

    if (evenement.type === "error") {
      throw new Error(
        evenement.error?.message ||
        "L’assistant vocal a rencontré une erreur."
      );
    }
  }

  async function executerOutilIaShift(appel) {
    const callId = String(appel?.callId || "").trim();
    const nom = String(appel?.nom || "").trim();

    if (!callId || !nom) return;
    if (etatIaShift.appelsTraites.has(callId)) return;

    etatIaShift.appelsTraites.add(callId);

    let argumentsOutil = {};

    try {
      argumentsOutil = JSON.parse(String(appel.arguments || "{}"));
    } catch {
      argumentsOutil = {};
    }

    try {
      if (nom === "rechercher_creneaux") {
        actualiserStatutIaShift("Recherche des disponibilités…");

        const resultat = await appelerWorkerIaShift(
          "/rechercher-creneaux",
          argumentsOutil
        );

        afficherPropositionsIaShift(resultat.propositions);
        envoyerResultatOutilIaShift(callId, resultat);
        actualiserStatutIaShift(
          resultat.propositions?.length
            ? "J’attends votre choix…"
            : "Aucun créneau trouvé."
        );
        return;
      }

      if (nom === "confirmer_reservation") {
        actualiserStatutIaShift("Enregistrement de la réservation…");

        const resultat = await appelerWorkerIaShift(
          "/confirmer-reservation",
          argumentsOutil
        );

        envoyerResultatOutilIaShift(callId, resultat);
        actualiserStatutIaShift("Réservation enregistrée.");
        etatIaShift.fermerApresAudio = true;
        etatIaShift.timerFermeture = window.setTimeout(
          fermerRechercheIaShift,
          15000
        );
        return;
      }

      envoyerResultatOutilIaShift(callId, {
        success: false,
        message: "Outil inconnu."
      });
    } catch (error) {
      envoyerResultatOutilIaShift(callId, {
        success: false,
        code: String(error?.code || ""),
        message: error?.message || "Impossible d’exécuter cette action."
      });
      actualiserStatutIaShift(
        error?.message || "Impossible d’exécuter cette action."
      );
    }
  }

  function envoyerResultatOutilIaShift(callId, resultat) {
    envoyerEvenementIaShift({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(resultat || {})
      }
    });
    envoyerEvenementIaShift({ type: "response.create" });
  }

  async function appelerWorkerIaShift(chemin, payload) {
    const reponse = await fetch(
      ENDPOINT_RESERVER_MEMBRE_IASHIFT + chemin,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload || {})
      }
    );
    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      fermerRechercheIaShift();
      redirigerConnexionMembre("inactive");
      throw new Error("Session membre inactive.");
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      const error = new Error(
        messageErreurApi(data, "Le service IA Shift est indisponible.")
      );
      error.code = String(data?.code || "");
      throw error;
    }

    return data;
  }

  function envoyerEvenementIaShift(evenement) {
    const canal = etatIaShift.dataChannel;

    if (!canal || canal.readyState !== "open") return false;

    canal.send(JSON.stringify(evenement));
    return true;
  }

  function actualiserBlocageBoutonsRechercheIaShift(bloquer) {
    const bloque = bloquer === true;

    document
      .querySelectorAll(
        "#bouton-demander-ia, [data-lcdp-action-iashift]"
      )
      .forEach((bouton) => {
        bouton.disabled = bloque;
        bouton.setAttribute(
          "aria-disabled",
          bloque ? "true" : "false"
        );
      });
  }

  function fermerRechercheIaShift() {
    if (etatIaShift.fermetureEnCours) return;

    etatIaShift.fermetureEnCours = true;
    etatIaShift.ouvertureNumero += 1;

    if (etatIaShift.timerFermeture) {
      window.clearTimeout(etatIaShift.timerFermeture);
    }

    try {
      if (etatIaShift.dataChannel) etatIaShift.dataChannel.close();
    } catch {
      /* Fermeture déjà effectuée. */
    }

    try {
      if (etatIaShift.peerConnection) {
        etatIaShift.peerConnection.close();
      }
    } catch {
      /* Fermeture déjà effectuée. */
    }

    if (etatIaShift.mediaStream) {
      etatIaShift.mediaStream.getTracks().forEach((track) => track.stop());
    }

    if (etatIaShift.audio) {
      etatIaShift.audio.srcObject = null;
      etatIaShift.audio.remove();
    }

    if (etatIaShift.slot) etatIaShift.slot.innerHTML = "";

    document.removeEventListener("keydown", gererEchapIaShift);

    etatIaShift.ouverte = false;
    etatIaShift.ouvertureEnCours = false;
    etatIaShift.confirmationOuvertureEnCours = false;
    etatIaShift.fermetureEnCours = false;
    etatIaShift.fermerApresAudio = false;
    etatIaShift.mediaStream = null;
    etatIaShift.peerConnection = null;
    etatIaShift.dataChannel = null;
    etatIaShift.audio = null;
    etatIaShift.sessionInitialisee = false;
    etatIaShift.slot = null;
    etatIaShift.lightbox = null;
    etatIaShift.message = null;
    etatIaShift.transcription = null;
    etatIaShift.propositions = null;
    etatIaShift.boutonMicro = null;
    etatIaShift.timerFermeture = null;
    etatIaShift.appelsTraites = new Set();
    actualiserBlocageBoutonsRechercheIaShift(false);
  }


  function initialiserActionsPersistantesReserver() {
    const boutonDepartement = document.getElementById("bouton-changer-departement");
    const boutonIa = document.getElementById("bouton-demander-ia");

    if (!boutonDepartement || !boutonIa) return;
    if (document.getElementById("lcdp-actions-footer-reserver")) return;

    const slotActionsFooter = obtenirOuCreerSlotActionsFooterReserver();

    if (!slotActionsFooter) return;

    slotActionsFooter.innerHTML = "";
    slotActionsFooter.hidden = true;
    slotActionsFooter.setAttribute("aria-hidden", "true");

    const barreFooter = document.createElement("div");
    barreFooter.id = "lcdp-actions-footer-reserver";
    barreFooter.className = "lcdp-actions-footer-reserver";
    barreFooter.hidden = true;
    barreFooter.setAttribute("aria-hidden", "true");
    barreFooter.appendChild(creerContenuActionsPersistantesReserver(boutonDepartement, boutonIa));
    slotActionsFooter.appendChild(barreFooter);

    const cible = trouverBlocActionsInitialesReserver(boutonDepartement, boutonIa);
    let actionsInitialesVisibles = true;

    function lightboxOuverte() {
      const slotLightbox = document.getElementById("lcdp-lightbox-slot");
      return Boolean(slotLightbox && slotLightbox.children.length > 0);
    }

    function actualiserAffichageBarre() {
      const afficher = actionsInitialesVisibles !== true && !lightboxOuverte();

      barreFooter.hidden = !afficher;
      barreFooter.setAttribute("aria-hidden", afficher ? "false" : "true");

      slotActionsFooter.hidden = !afficher;
      slotActionsFooter.setAttribute("aria-hidden", afficher ? "false" : "true");
      document.body.classList.toggle("lcdp-reserver-actions-footer-active", afficher);
      window.requestAnimationFrame(actualiserEspaceFooterReserver);
    }

    function actualiserDepuisPositionBoutons() {
      if (!cible) {
        actionsInitialesVisibles = true;
        actualiserAffichageBarre();
        return;
      }

      const rect = cible.getBoundingClientRect();
      const hauteurFenetre = window.innerHeight || document.documentElement.clientHeight || 0;
      const marge = 4;

      actionsInitialesVisibles = rect.bottom > marge && rect.top < (hauteurFenetre - marge);
      actualiserAffichageBarre();
    }

    window.addEventListener("scroll", actualiserDepuisPositionBoutons, { passive: true });
    window.addEventListener("resize", () => {
      actualiserDepuisPositionBoutons();
      actualiserEspaceFooterReserver();
    });
    window.addEventListener("orientationchange", () => {
      window.setTimeout(actualiserDepuisPositionBoutons, 180);
    });

    const slotLightbox = document.getElementById("lcdp-lightbox-slot");

    if (slotLightbox && "MutationObserver" in window) {
      const observateurLightbox = new MutationObserver(actualiserDepuisPositionBoutons);
      observateurLightbox.observe(slotLightbox, { childList: true });
    }

    actualiserDepuisPositionBoutons();
    actualiserEspaceFooterReserver();
    window.setTimeout(() => {
      actualiserDepuisPositionBoutons();
      actualiserEspaceFooterReserver();
    }, 250);
  }

  function actualiserEspaceFooterReserver() {
    const footer = document.querySelector("#lcdp-footer-slot .lcdp-box-footer");
    const barre = document.getElementById("lcdp-actions-footer-reserver");

    const hauteurFooter = Math.ceil(footer?.getBoundingClientRect?.().height || 56);

    document.documentElement.style.setProperty(
      "--lcdp-reserver-footer-height",
      hauteurFooter + "px"
    );

    if (barre && barre.hidden !== true) {
      const hauteurActions = Math.ceil(barre.getBoundingClientRect().height || 0);

      if (hauteurActions > 0) {
        document.documentElement.style.setProperty(
          "--lcdp-reserver-actions-footer-height",
          hauteurActions + "px"
        );
      }
    }
  }

  function obtenirOuCreerSlotActionsFooterReserver() {
    const slotPageFooter = document.getElementById("lcdp-footer-slot");

    if (!slotPageFooter) return null;

    let slot = slotPageFooter.querySelector("[data-lcdp-wraper-footer-actions]");

    if (slot) return slot;

    slot = document.createElement("div");
    slot.className = "lcdp-box-wraper-footer__actions";
    slot.dataset.lcdpWraperFooterActions = "";
    slot.setAttribute("aria-hidden", "true");
    slot.hidden = true;

    slotPageFooter.insertBefore(slot, slotPageFooter.firstChild);

    return slot;
  }

  function creerContenuActionsPersistantesReserver(boutonDepartement, boutonIa) {
    const commandeBar = document.createElement("div");
    commandeBar.className =
      "lcdp-box-commande-bar " +
      "lcdp-box-commande-bar--encadree " +
      "lcdp-box-commande-bar--persistante";
    commandeBar.dataset.lcdpBoxCommandeBar = "";

    const actions = document.createElement("div");
    actions.className = "lcdp-box-commande-bar__actions";
    actions.dataset.lcdpCommandeBarActions = "";

    const boutonStickyDepartement = document.createElement("button");
    boutonStickyDepartement.type = "button";
    boutonStickyDepartement.className = "lcdp-button lcdp-button-primary";
    ajouterPictoCommandeBar(
      boutonStickyDepartement,
      "/IMAG/PICTO/picto-changer-donnees.svg",
      "Changer de département"
    );
    boutonStickyDepartement.setAttribute("aria-label", "Changer de département");
    boutonStickyDepartement.title = "Changer de département";
    boutonStickyDepartement.addEventListener("click", (event) => {
      event.preventDefault();
      boutonDepartement.click();
    });

    const boutonStickyIa = document.createElement("button");
    boutonStickyIa.type = "button";
    boutonStickyIa.className = "lcdp-button lcdp-button-orange";
    ajouterPictoCommandeBar(
      boutonStickyIa,
      "/IMAG/PICTO/picto-recherche-ia.svg",
      "Rechercher avec l'IA"
    );
    boutonStickyIa.setAttribute("aria-label", "Rechercher avec l’IA");
    boutonStickyIa.dataset.lcdpActionIashift = "true";
    boutonStickyIa.title = "Rechercher avec l’IA";
    boutonStickyIa.addEventListener("click", (event) => {
      event.preventDefault();
      boutonIa.click();
    });

    actions.appendChild(boutonStickyDepartement);
    actions.appendChild(boutonStickyIa);
    commandeBar.appendChild(actions);

    return commandeBar;
  }

  function trouverBlocActionsInitialesReserver(boutonDepartement, boutonIa) {
    const candidats = [
      boutonDepartement.closest(".lcdp-box-menu-bouton__list"),
      boutonDepartement.parentElement,
      boutonDepartement.parentElement ? boutonDepartement.parentElement.parentElement : null,
      boutonDepartement.closest("[data-lcdp-actions-reserver]"),
      boutonDepartement.closest(".lcdp-page-actions"),
      boutonDepartement.closest(".lcdp-box-formulaire__actions"),
      boutonDepartement.closest(".lcdp-stack-medium"),
      boutonDepartement.closest(".lcdp-stack-large")
    ].filter(Boolean);

    const blocDirect = candidats.find((element) => element.contains(boutonDepartement) && element.contains(boutonIa));

    if (blocDirect) return blocDirect;

    let noeud = boutonDepartement;

    while (noeud && noeud !== document.body) {
      if (noeud.contains(boutonIa)) return noeud;
      noeud = noeud.parentElement;
    }

    return boutonDepartement;
  }


  function initialiserActionsListeParcs() {
    const zoneActions = etatPage.templateListeParcs?.querySelector(
      "[data-lcdp-liste-card-actions]"
    );

    if (!zoneActions) return;

    zoneActions.innerHTML = "";
  }

  async function chargerReservationsMembrePourBlocages() {
    if (!ENDPOINT_PLANNING_MEMBRE) {
      etatPage.reservationsMembre = [];
      return;
    }

    try {
      const reponse = await fetch(ENDPOINT_PLANNING_MEMBRE + "/mes-reservations", {
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
        etatPage.reservationsMembre = [];
        console.warn("Réservations membre indisponibles pour le blocage front.", data);
        return;
      }

      etatPage.reservationsMembre = Array.isArray(data.reservations) ? data.reservations : [];
    } catch (error) {
      etatPage.reservationsMembre = [];
      console.warn("Réservations membre indisponibles pour le blocage front.", error);
    }
  }

  async function ouvrirChoixDepartement() {
    let donneesDepartementVerifiees = null;
    const resultat = await ouvrirDialogueChamp({
      titre: "Changer de département",
      champs: [
        {
          id: "departement-recherche-parc",
          name: "dptmt",
          label: "Département",
          type: "text",
          inputmode: "text",
          autocomplete: "off",
          placeholder: "Exemple : 08",
          required: true
        }
      ],
      // La vérification utilise directement public.dptmt, via le nom
      // renvoyé par le Worker. Aucun code n'est supposé valide par défaut.
      verifier: async (saisie) => {
        const code = nettoyerDepartement(saisie.dptmt);
        if (!/^(?:0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(code)) {
          return "Code de département invalide. Exemple : 08.";
        }
        if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
          return "Service des départements indisponible. Réessayez.";
        }
        const reponse = await fetch(
          ENDPOINT_NOUVELLE_DATE_MEMBRE + "/departement?dptmt=" + encodeURIComponent(code),
          { method: "GET", credentials: "include", cache: "no-store", headers: { Accept: "application/json" } }
        );
        if (reponse.status === 401) {
          redirigerConnexionMembre("inactive");
          return "Session expirée. Reconnectez-vous.";
        }
        const data = await reponse.json().catch(() => null);
        if (!reponse.ok || !data || !reponseApiOk(data)) {
          throw new Error(messageErreurApi(data, "Vérification du département indisponible."));
        }
        if (!String(data.nomDepartement || "").trim()) {
          return "Code de département invalide. Exemple : 08.";
        }
        donneesDepartementVerifiees = data;
        return null;
      }
    });

    if (!resultat || !donneesDepartementVerifiees) return;
    await chargerParcsDepartement(nettoyerDepartement(resultat.dptmt), donneesDepartementVerifiees);
  }

  function creerPictowait(message) {
    const attente = document.createElement("div");
    attente.className = "lcdp-pictowait";
    attente.dataset.lcdpPictowait = "";
    attente.setAttribute("role", "status");
    attente.setAttribute("aria-live", "polite");
    attente.setAttribute(
      "aria-label",
      message || "Chargement en cours"
    );

    const image = document.createElement("img");
    image.className = "lcdp-pictowait__image";
    image.src = construireUrlObjet(CHEMIN_PICTOWAIT);
    image.alt = "";
    image.width = 56;
    image.height = 56;
    image.decoding = "async";
    image.setAttribute("aria-hidden", "true");

    attente.appendChild(image);
    return attente;
  }

  function afficherPictowaitListeParcs() {
    if (!attenteListeParcs && window.LCDP_chargement) {
      attenteListeParcs = window.LCDP_chargement.afficher();
    }
  }

  function afficherPictowaitShiftDetailParc(
    detail,
    message
  ) {
    if (!detail?.racine || !detail?.contenu) {
      return;
    }

    detail.contenu.replaceChildren(
      creerPictowait(
        message || "Chargement de la Fiche Parc…"
      )
    );
    detail.racine.hidden = false;
    detail.racine.classList.remove(
      "lcdp-box-shift-detail-parc--preparation"
    );

    window.requestAnimationFrame(() => {
      detail.racine.classList.add(
        "lcdp-box-shift-detail-parc--visible"
      );
    });
  }


  function masquerPictowaitListeParcs() {
    if (attenteListeParcs) {
      window.LCDP_chargement?.masquer(attenteListeParcs);
      attenteListeParcs = null;
    }
  }

  function construireListeParcsPreparee(parcs, departement) {
    if (!etatPage.templateListeParcs) {
      throw new Error("Template de liste des parcs indisponible.");
    }

    const listeCard = etatPage.templateListeParcs.cloneNode(true);
    const titre = listeCard.querySelector(
      "[data-lcdp-liste-card-title]"
    );
    const zoneListe = listeCard.querySelector(
      "[data-lcdp-liste-card-list]"
    );
    const zoneMessage = listeCard.querySelector(
      "[data-lcdp-liste-card-message]"
    );
    const zoneActions = listeCard.querySelector(
      "[data-lcdp-liste-card-actions]"
    );

    if (!titre || !zoneListe || !zoneMessage) {
      throw new Error("Structure de la liste des parcs incomplète.");
    }

    const enteteListe = titre.closest(
      "[data-lcdp-liste-card-header], .lcdp-box-liste-card__header, header"
    );
    if (enteteListe && listeCard.contains(enteteListe) && !enteteListe.contains(zoneListe)) {
      // Dans cette page, les actions de l'en-tête de liste sont vides.
      enteteListe.remove();
    } else {
      titre.remove();
    }
    zoneListe.innerHTML = "";

    if (zoneActions) {
      zoneActions.innerHTML = "";
    }

    if (!Array.isArray(parcs) || parcs.length < 1) {
      zoneMessage.hidden = false;
      zoneMessage.textContent =
        "Aucun parc trouvé pour ce département";
      zoneMessage.dataset.lcdpMessageType = "information";
      return listeCard;
    }

    zoneMessage.hidden = true;
    zoneMessage.textContent = "";
    delete zoneMessage.dataset.lcdpMessageType;

    parcs.forEach((parc) => {
      zoneListe.appendChild(creerCardParc(parc));
    });

    return listeCard;
  }

  function construireListeParcsErreur(message) {
    const listeCard = construireListeParcsPreparee(
      [],
      etatPage.departement
    );
    const zoneMessage = listeCard.querySelector(
      "[data-lcdp-liste-card-message]"
    );

    if (zoneMessage) {
      zoneMessage.hidden = false;
      zoneMessage.textContent = String(message || "").trim();
      zoneMessage.dataset.lcdpMessageType = "erreur";
    }

    return listeCard;
  }

  function publierListeParcs(listeCard) {
    masquerPictowaitListeParcs();
    const slot = document.getElementById(
      "lcdp-liste-card-parcs-slot"
    );

    if (!slot || !listeCard) {
      return;
    }

    slot.replaceChildren(listeCard);
    slot.hidden = false;
    slot.setAttribute("aria-hidden", "false");

    afficherCommandeBarReserver();
    planifierPrechargementDetailsParcs();
  }

  function listeParcsDejaVisible() {
    const slot = document.getElementById(
      "lcdp-liste-card-parcs-slot"
    );

    return Boolean(
      slot &&
      slot.hidden !== true &&
      slot.querySelector("[data-lcdp-box-liste-card]")
    );
  }

  async function chargerParcsDepartementMembre() {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      publierListeParcs(
        construireListeParcsErreur(
          "Le service de réservation membre n’est pas configuré."
        )
      );
      return;
    }

    try {
      const reponse = await fetch(
        ENDPOINT_NOUVELLE_DATE_MEMBRE + "/autour-de-moi",
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
        throw new Error(
          messageErreurApi(
            data,
            "Impossible de charger les parcs du département."
          )
        );
      }

      const departement = String(data.departement || "");
      const parcs = Array.isArray(data.parcs) ? data.parcs : [];
      etatPage.nomDepartement = String(data.nomDepartement || data.nomdepartement || data.libelleDepartement || data.departementNom || "").trim();
      const listePreparee = construireListeParcsPreparee(
        parcs,
        departement
      );

      etatPage.departement = departement;
      etatPage.parcs = parcs;
      actualiserTitreParcsDepartement();

      publierListeParcs(listePreparee);
    } catch (error) {
      console.error(
        "Erreur chargement parcs du département membre :",
        error
      );

      publierListeParcs(
        construireListeParcsErreur(
          error.message ||
          "Erreur technique. Merci de réessayer."
        )
      );
    }
  }

  async function chargerParcsDepartement(departement, donneesVerifiees = null) {
    if (!ENDPOINT_NOUVELLE_DATE_MEMBRE) {
      await afficherAlerte(
        "Le service de réservation membre n’est pas configuré."
      );
      return;
    }

    afficherPictowaitListeParcs(
      "Construction de la liste des parcs…",
      listeParcsDejaVisible()
    );

    try {
      let data = donneesVerifiees;
      if (!data) {
        const reponse = await fetch(
          ENDPOINT_NOUVELLE_DATE_MEMBRE + "/departement?dptmt=" + encodeURIComponent(departement),
          { method: "GET", credentials: "include", cache: "no-store", headers: { Accept: "application/json" } }
        );
        data = await reponse.json().catch(() => null);
        if (reponse.status === 401) {
          redirigerConnexionMembre("inactive");
          return;
        }
        if (!reponse.ok || !data || !reponseApiOk(data)) {
          throw new Error(messageErreurApi(data, "Impossible de charger les parcs de ce département."));
        }
      }

      const departementRecu = String(
        data.departement || departement
      );
      const parcs = Array.isArray(data.parcs) ? data.parcs : [];
      etatPage.nomDepartement = String(data.nomDepartement || data.nomdepartement || data.libelleDepartement || data.departementNom || "").trim();
      const listePreparee = construireListeParcsPreparee(
        parcs,
        departementRecu
      );

      etatPage.departement = departementRecu;
      etatPage.parcs = parcs;
      actualiserTitreParcsDepartement();

      publierListeParcs(listePreparee);
    } catch (error) {
      console.error(
        "Erreur chargement parcs département :",
        error
      );

      const message =
        error.message ||
        "Erreur technique. Merci de réessayer.";

      if (listeParcsDejaVisible()) {
        masquerPictowaitListeParcs();
        await afficherAlerte(message);
        return;
      }

      publierListeParcs(
        construireListeParcsErreur(message)
      );
    }
  }

  function afficherTitreListe() {
    const titre = document.querySelector("[data-lcdp-liste-card-title]");
    if (titre) {
      titre.textContent = "";
      titre.hidden = true;
    }
    actualiserTitreParcsDepartement();
  }

  function actualiserTitreParcsDepartement() {
    const sousTitre = document.querySelector(".lcdp-planifier-parcs-departement");
    if (sousTitre) sousTitre.textContent = libelleDepartementListeParcs();
    const titre = document.getElementById("titre-parcs-departement");
    if (!titre) return;
    titre.replaceChildren(document.createTextNode("Parcs près de chez vous"));
    if (etatPage.departement) {
      titre.appendChild(document.createElement("br"));
      titre.appendChild(document.createTextNode("dans le " + etatPage.departement));
    }
  }

  function afficherParcs(parcs) {
    const zoneListe = obtenirZoneListe();

    if (!zoneListe) return;

    zoneListe.innerHTML = "";

    if (!Array.isArray(parcs) || !parcs.length) {
      afficherMessageListe("Aucun parc trouvé pour ce département", "information");
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
    const descriptionComplete = nettoyerTexteDescription(
      parc.prez || parc.presentation || ""
    );
    const description = nettoyerTexteCourt(
      descriptionComplete,
      longueurDescriptionCardParc()
    );

    const image = card.querySelector("[data-lcdp-card-parc-image]");
    const badgePrepa = card.querySelector("[data-lcdp-card-parc-badge-prepa]");
    const titre = card.querySelector("[data-lcdp-card-parc-title]");
    const meta = card.querySelector("[data-lcdp-card-parc-meta]");
    const texte = card.querySelector("[data-lcdp-card-parc-description]");
    const actions = card.querySelector(".lcdp-box-card-parc__actions");

    card.dataset.idparc = idparc;
    card.classList.add("lcdp-box-card-parc--reserver");

    if (image) {
      image.src = construireUrlImageParc(parc);
      image.alt = "Image du parc " + nom;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => {
        image.src = construireUrlObjet(DOSSIER_IMAGES_PARC_OBJET + "/cardlogo.webp");
      }, { once: true });
    }

    if (badgePrepa) {
      badgePrepa.hidden = String(parc.statut || "").trim().toLowerCase() !== "prepa";
    }

    if (titre) {
      titre.textContent = nom.replace(/^parc\s+/i, "");
    }

    if (meta) {
      meta.textContent = "";
      meta.hidden = true;
    }

    if (texte) {
      texte.dataset.action = "ouvrir-fiche-parc";
      texte.dataset.idparc = idparc;
      texte.dataset.lcdpDescriptionComplete = descriptionComplete;
      texte.setAttribute(
        "aria-label",
        "Ouvrir la présentation du parc " + nom
      );
      rendreDescriptionCardParc(texte, description);
      texte.hidden = !descriptionComplete;
    }

    if (actions) {
      actions.classList.add(
        "lcdp-box-card-parc__actions--reserver"
      );
      actions.replaceChildren(
        creerBoutonActionCardParc({
          action: "ouvrir-fiche-parc",
          libelle: "Le parc",
          ariaLabel: "Ouvrir la présentation du parc " + nom,
          icone: "presentation",
          variante: "vert-plein",
          idparc
        }),
        creerBoutonActionCardParc({
          action: "voir-planning-parc",
          libelle: "Planning",
          ariaLabel: "Afficher le planning du parc " + nom,
          icone: "planning",
          variante: "orange-plein",
          idparc
        })
      );

      if (texte && texte.parentNode) {
        texte.parentNode.insertBefore(actions, texte);
      }
    }

    return card;
  }

  function creerBoutonActionCardParc(configuration) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className =
      "lcdp-button " +
      "lcdp-box-card-parc__action " +
      "lcdp-box-card-parc__action--" +
      configuration.variante;
    bouton.dataset.action = configuration.action;
    bouton.dataset.idparc = configuration.idparc;
    bouton.setAttribute("aria-label", configuration.ariaLabel);
    bouton.title = configuration.ariaLabel;

    const icone = document.createElement("img");
    icone.className =
      "lcdp-box-card-parc__action-icone " +
      "lcdp-box-card-parc__action-icone--" +
      configuration.icone;
    icone.src = construireUrlObjet(
      "/IMAG/PICTO/picto-" + configuration.icone + ".svg"
    );
    icone.alt = "";
    icone.width = 22;
    icone.height = 22;
    icone.decoding = "async";
    icone.draggable = false;
    icone.setAttribute("aria-hidden", "true");

    const libelle = document.createElement("span");
    libelle.className = "lcdp-box-card-parc__action-libelle";
    libelle.textContent = configuration.libelle;

    if (configuration.icone === "planning") {
      const support = document.createElement("span");
      support.className = "lcdp-box-card-parc__action-icone lcdp-planifier-picto-planning";
      support.setAttribute("aria-hidden", "true");
      support.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\">\n  <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"4\" ry=\"4\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n  <rect x=\"7\" y=\"7\" width=\"2.3\" height=\"2.3\" rx=\"0.4\" fill=\"currentColor\"/>\n  <rect x=\"10.85\" y=\"7\" width=\"2.3\" height=\"2.3\" rx=\"0.4\" fill=\"currentColor\"/>\n  <rect x=\"14.7\" y=\"7\" width=\"2.3\" height=\"2.3\" rx=\"0.4\" fill=\"currentColor\"/>\n  <rect x=\"7\" y=\"10.85\" width=\"2.3\" height=\"2.3\" rx=\"0.4\" fill=\"currentColor\"/>\n  <rect x=\"10.85\" y=\"10.85\" width=\"2.3\" height=\"2.3\" rx=\"0.4\" fill=\"currentColor\"/>\n  <rect x=\"14.7\" y=\"10.85\" width=\"2.3\" height=\"2.3\" rx=\"0.4\" fill=\"currentColor\"/>\n  <rect x=\"7\" y=\"14.7\" width=\"2.3\" height=\"2.3\" rx=\"0.4\" fill=\"currentColor\"/>\n  <rect x=\"10.85\" y=\"14.7\" width=\"2.3\" height=\"2.3\" rx=\"0.4\" fill=\"currentColor\"/>\n  <rect x=\"14.7\" y=\"14.7\" width=\"2.3\" height=\"2.3\" rx=\"0.4\" fill=\"currentColor\"/>\n</svg>";
      bouton.appendChild(support);
    } else {
      bouton.appendChild(icone);
    }
    bouton.appendChild(libelle);

    if (
      configuration.action === "ouvrir-fiche-parc" ||
      configuration.action === "voir-planning-parc"
    ) {
      const precharger = () => {
        const parc = trouverParcParId(configuration.idparc);

        if (!parc) {
          return;
        }

        if (configuration.action === "ouvrir-fiche-parc") {
          prechargerConstructeurFicheParc();
          return;
        }

        prechargerPlanningParcLecture(parc);
      };

      bouton.addEventListener(
        "pointerenter",
        precharger,
        { once: true }
      );
      bouton.addEventListener(
        "focus",
        precharger,
        { once: true }
      );
      bouton.addEventListener(
        "touchstart",
        precharger,
        {
          once: true,
          passive: true
        }
      );
    }

    return bouton;
  }

  async function gererClicDocument(event) {
    const boutonFiche = event.target.closest("[data-action='ouvrir-fiche-parc']");
    const boutonPartager = event.target.closest("[data-action='partager-parc']");
    const boutonPlanning = event.target.closest("[data-action='voir-planning-parc']");
    const boutonReserver = event.target.closest("[data-action='nouvelle-date-parc']");
    const jourCalendrier = event.target.closest("[data-lcdp-card-jour-mois]");

    if (boutonFiche) {
      event.preventDefault();

      const parc = trouverParcParId(boutonFiche.dataset.idparc);

      if (!parc) {
        await afficherAlerte("Parc introuvable.");
        return;
      }

      try {
        // La fiche s'affiche au-dessus de la liste des parcs sans la fermer.
        await ouvrirFicheParc(parc);
      } catch (error) {
        console.error(
          "Erreur ouverture Fiche Parc publique :",
          error
        );
        await afficherAlerte(
          error?.message ||
          "Impossible d’ouvrir la fiche du parc."
        );
      }
      return;
    }

    if (boutonPartager) {
      event.preventDefault();

      const parc = trouverParcParId(boutonPartager.dataset.idparc);

      if (!parc) {
        await afficherAlerte("Parc introuvable.");
        return;
      }

      await ouvrirPartagePlanningParc(parc, "fiche");
      return;
    }

    if (boutonPlanning) {
      event.preventDefault();

      const parc = trouverParcParId(boutonPlanning.dataset.idparc);

      if (!parc) {
        await afficherAlerte("Parc introuvable.");
        return;
      }

      if (await confirmerAffichagePlanningParc()) {
        await ouvrirPlanningMoisParc(parc);
      }
      return;
    }

    if (boutonReserver) {
      event.preventDefault();

      const parc = trouverParcParId(boutonReserver.dataset.idparc);
      await demarrerReservationParc(parc);
      return;
    }

    if (jourCalendrier && !jourCalendrier.disabled) {
      event.preventDefault();

      await ouvrirCalendrierJourDepuisCard(jourCalendrier);
      return;
    }

  }

  async function confirmerAffichagePlanningParc() {
    // Reprise de la box d'alerte existante : seule l'action change.
    const enveloppe = document.createElement("div");
    document.body.appendChild(enveloppe);
    try {
      const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
      enveloppe.appendChild(fragment);
      const box = enveloppe.querySelector("[data-lcdp-box-alerte]");
      const texte = enveloppe.querySelector("[data-lcdp-alerte-message]");
      const fermerBouton = enveloppe.querySelector("[data-lcdp-alerte-close]");
      const afficherBouton = enveloppe.querySelector("[data-lcdp-alerte-ok]");
      if (![box, texte, fermerBouton, afficherBouton].every(Boolean)) {
        throw new Error("Box d'information indisponible.");
      }
      texte.textContent = "sub planning";
      afficherBouton.textContent = "Afficher";
      return await new Promise(resolve => {
        let terminee = false;
        function fermer(confirme) {
          if (terminee) return;
          terminee = true;
          enveloppe.remove();
          resolve(confirme);
        }
        fermerBouton.addEventListener("click", () => fermer(false));
        afficherBouton.addEventListener("click", () => fermer(true));
        box.addEventListener("click", event => { if (event.target === box) fermer(false); });
      });
    } catch (erreur) {
      enveloppe.remove();
      throw erreur;
    }
  }

  async function autoriserReservationParc(parc) {
    if (!parc) {
      await afficherAlerteDetailParcOuPage("Parc introuvable.");
      return false;
    }
    etatMembre = await chargerEtatMembre();
    if (normaliserStatudaReservation(etatMembre.statuda) !== "oui") {
      const message = etatMembre.statuda === "encours"
        ? "Votre demande d’abonnement est en cours. Sa validation est nécessaire pour planifier."
        : "Une demande d’abonnement validée est nécessaire pour planifier.";
      await afficherAlerteDetailParcOuPage(message); return false;
    }
    return true;
  }

  async function demarrerReservationParc(parc) {
    if (!(await autoriserReservationParc(parc))) {
      return;
    }

    await ouvrirShiftDetailParc(
      parc,
      "planning"
    );
  }

  async function ouvrirFicheParc(parc) {
    await ouvrirShiftDetailParc(parc, "fiche");
  }

  async function ouvrirShiftDetailParc(
    parc,
    vueDemandee
  ) {
    if (!parc) {
      await afficherAlerte("Parc introuvable.");
      return;
    }

    const detail = await obtenirOuCreerShiftDetailParc();

    if (!detail || !detail.contenu) {
      throw new Error(
        "Structure shift détail parc incomplète."
      );
    }

    afficherPictowaitShiftDetailParc(
      detail,
      vueDemandee === "planning"
        ? "Chargement du planning du parc…"
        : "Chargement de la Fiche Parc…"
    );

    const constructeur =
      await chargerConstructeurFicheParc();
    const ancienControleur =
      etatPage.shiftDetailParc?.controleur;

    if (
      ancienControleur &&
      typeof ancienControleur.detruire === "function"
    ) {
      ancienControleur.detruire();
    }

    let controleur = null;
    let ouvertureAnnulee = false;
    const controleurProvisoire = {
      detruire: () => {
        ouvertureAnnulee = true;

        if (
          controleur &&
          typeof controleur.detruire === "function"
        ) {
          controleur.detruire();
        }
      }
    };

    etatPage.shiftDetailParc = {
      parc,
      vue: vueDemandee || "fiche",
      controleur: controleurProvisoire
    };

    try {
      controleur = await constructeur.monterDansConteneur(
        detail.contenu,
        parc,
        {
          vueInitiale: vueDemandee || "fiche",
          modeUsage: "reservation-membre",
          nomDepartement: String(parc.nomDepartement || (String(parc.dptmt || "") === String(etatPage.departement || "") ? etatPage.nomDepartement : "") || ""),
          chargerFragmentObjet,
          construireUrlObjet,
          construireUrlImageParcFichier,
          construireUrlImageCardParc:
            construireUrlImageParc,
          appliquerRoutes: appliquerRoutesSite,
          templateCardParc: etatPage.templateCardParc,
          templateJourMois: etatPage.templateJourMois,
          templateHeureJour: etatPage.templateHeureJour,
          chargerDroitsPlanning:
            chargerDroitsPlanningParcMembre,
          chargerPlanningMois:
            chargerPlanningParcMoisLecture,
          chargerPlanningJour:
            chargerPlanningParcJourLecture,
          verifierReservation:
            autoriserReservationParc,
          onInformation:
            afficherAlerteDetailParcOuPage,
          onChoixReservation:
            traiterChoixReservationDepuisFicheParc,
          onPartager: (
            parcCible,
            typePartage
          ) =>
            ouvrirPartagePlanningParc(
              parcCible,
              typePartage
            ),
          onErreur:
            afficherAlerteDetailParcOuPage,
          onVueChange: (
            vue,
            parcCible
          ) => {
            if (ouvertureAnnulee) {
              return;
            }

            etatPage.shiftDetailParc = {
              parc: parcCible,
              vue,
              controleur:
                controleur ||
                controleurProvisoire
            };
            detail.racine.dataset.lcdpShiftVue =
              vue;

            if (detail.alerteSlot) {
              detail.alerteSlot.innerHTML = "";
            }
          }
        }
      );
    } catch (erreur) {
      fermerShiftDetailParc();
      throw erreur;
    }

    if (
      ouvertureAnnulee ||
      !document.body.contains(detail.racine)
    ) {
      controleur.detruire();
      return;
    }

    etatPage.shiftDetailParc = {
      parc: controleur.getParc(),
      vue: controleur.getVue(),
      controleur
    };
    detail.racine.dataset.lcdpShiftVue =
      controleur.getVue();
    detail.racine.hidden = false;
    detail.racine.classList.remove(
      "lcdp-box-shift-detail-parc--preparation"
    );

    window.requestAnimationFrame(() => {
      detail.racine.classList.add(
        "lcdp-box-shift-detail-parc--visible"
      );
    });
  }

  async function obtenirOuCreerShiftDetailParc() {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;

    let racine = slot.querySelector("[data-lcdp-box-shift-detail-parc]");

    if (!racine) {
      slot.innerHTML = "";

      const shift = etatPage.templateShiftDetailParc
        ? etatPage.templateShiftDetailParc.cloneNode(true)
        : (await chargerFragmentObjet("/BOX/04-box-shift-detail-parc.html")).querySelector("[data-lcdp-box-shift-detail-parc]");

      if (!shift) {
        throw new Error("Template shift détail parc introuvable.");
      }

      shift.hidden = true;
      shift.classList.add("lcdp-box-shift-detail-parc--preparation");
      slot.appendChild(shift);
      racine = shift;

      const boutonFermer = racine.querySelector("[data-lcdp-shift-detail-parc-close]");

      if (boutonFermer) {
        boutonFermer.addEventListener(
          "click",
          fermerShiftDetailParc
        );
      }

      racine.addEventListener("click", (event) => {
        if (event.target === racine) {
          fermerShiftDetailParc();
        }
      });

      const gererEscape = (event) => {
        if (document.querySelector("[data-lcdp-box-dialogue-bouton], [data-lcdp-box-alerte]")) return;
        if (
          event.key === "Escape" &&
          document.body.contains(racine)
        ) {
          fermerShiftDetailParc();
        }
      };

      racine._lcdpShiftDetailParcEscape = gererEscape;
      document.addEventListener("keydown", gererEscape);
    }

    return {
      racine,
      contenu: racine.querySelector("[data-lcdp-shift-detail-parc-content]"),
      alerteSlot: racine.querySelector("[data-lcdp-shift-detail-parc-alerte-slot]")
    };
  }

  function obtenirShiftDetailParcActif() {
    const racine = document.querySelector("#lcdp-lightbox-slot [data-lcdp-box-shift-detail-parc]");

    if (!racine) return null;

    return {
      racine,
      contenu: racine.querySelector("[data-lcdp-shift-detail-parc-content]"),
      alerteSlot: racine.querySelector("[data-lcdp-shift-detail-parc-alerte-slot]")
    };
  }

  function fermerShiftDetailParc() {
    const slot = document.getElementById(
      "lcdp-lightbox-slot"
    );
    const racine = slot
      ? slot.querySelector(
          "[data-lcdp-box-shift-detail-parc]"
        )
      : null;
    const controleur =
      etatPage.shiftDetailParc?.controleur;

    if (
      controleur &&
      typeof controleur.detruire === "function"
    ) {
      controleur.detruire();
    }

    if (
      racine &&
      racine._lcdpShiftDetailParcEscape
    ) {
      document.removeEventListener(
        "keydown",
        racine._lcdpShiftDetailParcEscape
      );
    }

    etatPage.shiftDetailParc = null;
    etatPage.planningParcLectureActif = null;

    if (racine) {
      racine.classList.remove(
        "lcdp-box-shift-detail-parc--visible"
      );
    }

    if (slot) {
      slot.innerHTML = "";
    }
  }


  function prechargerConstructeurFicheParc() {
    if (!promessePrechargementConstructeurFicheParc) {
      promessePrechargementConstructeurFicheParc =
        chargerConstructeurFicheParc().catch((error) => {
          promessePrechargementConstructeurFicheParc = null;
          console.warn(
            "Préchargement du constructeur Fiche Parc indisponible.",
            error
          );
          return null;
        });
    }

    return promessePrechargementConstructeurFicheParc;
  }

  function prechargerPlanningParcLecture(parc) {
    if (!parc) {
      return;
    }

    const maintenant = new Date();

    chargerPlanningParcMoisLecture({
      parc,
      annee: maintenant.getFullYear(),
      mois: maintenant.getMonth() + 1
    }).catch((error) => {
      console.warn(
        "Préchargement du planning du parc indisponible.",
        error
      );
    });

    prechargerConstructeurFicheParc();
  }

  function planifierPrechargementDetailsParcs() {
    const executer = () => {
      prechargerConstructeurFicheParc();
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(executer, {
        timeout: 1200
      });
      return;
    }

    window.setTimeout(executer, 200);
  }



  async function afficherAlerteDetailParcOuPage(message) {
    const detail = obtenirShiftDetailParcActif();

    if (detail) {
      await afficherAlerteSuperposee(message);
      return;
    }

    await afficherAlerte(message);
  }

  function construireUrlImageParcFichier(
    parc,
    fichier
  ) {
    const departement = nettoyerDepartement(
      parc?.dptmt ||
      parc?.departement ||
      ""
    );
    const dossierParc = normaliserNomParcPourChemin(
      parc?.nom ||
      parc?.nomparc ||
      ""
    );
    const nomFichier = String(fichier || "")
      .replace(/^\/+/, "");

    if (
      !departement ||
      !dossierParc ||
      !nomFichier
    ) {
      return construireUrlObjet(
        DOSSIER_IMAGES_PARC_OBJET +
        "/parc-defaut.webp"
      );
    }

    return construireUrlObjet(
      DOSSIER_IMAGES_PARC_OBJET +
      "/" +
      encodeURIComponent(departement) +
      "/" +
      encodeURIComponent(dossierParc) +
      "/" +
      encodeURIComponent(nomFichier)
    );
  }

  function trouverParcParId(idparc) {
    const id = String(idparc || "");

    return etatPage.parcs.find((parc) => String(parc.idparc || parc.id || "") === id) || null;
  }

  async function ouvrirPlanningMoisParc(parc) {
    await ouvrirShiftDetailParc(parc, "planning");
  }

  async function chargerDroitsPlanningParcMembre(parc) {
    if (!ENDPOINT_PLANNING_PARC) {
      throw new Error(
        "Le service planning parc n’est pas configuré."
      );
    }

    const idparc = String(
      parc?.idparc ||
      parc?.id ||
      ""
    ).trim();

    if (!idparc) {
      throw new Error("Parc manquant.");
    }

    const url =
      ENDPOINT_PLANNING_PARC +
      "/droits-planning?idparc=" +
      encodeURIComponent(idparc) +
      "&contexte=membre";
    const reponse = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });
    const data =
      await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      throw new Error(
        "Votre session membre a expiré."
      );
    }

    if (
      !reponse.ok ||
      !data ||
      !reponseApiOk(data) ||
      !data.droitsPlanning
    ) {
      throw new Error(
        messageErreurApi(
          data,
          "Impossible de déterminer la période consultable."
        )
      );
    }

    return data.droitsPlanning;
  }

  async function chargerPlanningParcMoisLecture(etatPlanning) {
    if (!ENDPOINT_PLANNING_PARC) {
      throw new Error("Le service planning parc n’est pas configuré.");
    }

    const idparc = String(
      etatPlanning.parc.idparc ||
      etatPlanning.parc.id ||
      ""
    ).trim();

    if (!idparc) {
      throw new Error("Parc manquant.");
    }

    const cleCache = [
      "membre",
      idparc,
      etatPlanning.annee,
      etatPlanning.mois
    ].join(":");
    const cacheExistant = cachePlanningParcLecture.get(
      cleCache
    );

    if (
      cacheExistant &&
      cacheExistant.expireA > Date.now()
    ) {
      return cacheExistant.promesse;
    }

    const promesse = (async () => {
      const url =
        ENDPOINT_PLANNING_PARC +
        "/planning-parc-mois?idparc=" +
        encodeURIComponent(idparc) +
        "&annee=" +
        encodeURIComponent(etatPlanning.annee) +
        "&mois=" +
        encodeURIComponent(etatPlanning.mois) +
        "&contexte=membre";

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
        await afficherAlerteDetailParcOuPage(
          "Cette page est réservée aux membres invités ou abonnés."
        );
        return [];
      }

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(
          messageErreurApi(
            data,
            "Impossible de charger le planning du parc."
          )
        );
      }

      return Array.isArray(data.planning)
        ? data.planning
        : [];
    })();

    cachePlanningParcLecture.set(cleCache, {
      expireA:
        Date.now() +
        DUREE_CACHE_PLANNING_LECTURE_MS,
      promesse
    });

    try {
      return await promesse;
    } catch (error) {
      cachePlanningParcLecture.delete(cleCache);
      throw error;
    }
  }

  async function ouvrirPartagePlanningParc(parc, typepartage = "planning") {
    const emails = await ouvrirDialoguePartageEmails();

    if (!emails) return;

    const attente = document.createElement("div");
    attente.className = "lcdp-planifier-partage-attente";
    attente.appendChild(creerPictowait("Envoi du partage en cours…"));
    document.body.appendChild(attente);
    let messageResultat = "";
    let succes = false;
    try {
      await envoyerPartagePlanningParc(parc, emails, typepartage);
      messageResultat = "Partage envoyé";
      succes = true;
    } catch (error) {
      messageResultat = normaliserMessageErreurPartage(error?.message);
    } finally {
      attente.remove();
    }
    await afficherAlerteSuperposee(messageResultat, succes ? "vert-plein-partage" : "vert-contour");
  }

  async function ouvrirDialoguePartageEmails() {
    const conteneur = document.createElement("div");
    document.body.appendChild(conteneur);

    const fragment = await chargerFragmentObjet("/BOX/04-box-listemails.html");
    conteneur.appendChild(fragment);

    const box = conteneur.querySelector("[data-lcdp-box-card-listemails]");
    const titre = conteneur.querySelector("[data-lcdp-listemails-title]");
    const message = conteneur.querySelector("[data-lcdp-listemails-message]");
    const liste = conteneur.querySelector("[data-lcdp-listemails-list]");
    const actions = conteneur.querySelector("[data-lcdp-listemails-actions]");
    const boutonFermer = conteneur.querySelector("[data-lcdp-listemails-close]");

    if (!box || !titre || !message || !liste || !actions) {
      conteneur.remove();
      throw new Error("Structure liste e-mails incomplète.");
    }

    titre.textContent = "Partager la page";
    message.hidden = true;
    message.textContent = "";

    const ajouterChamp = (valeur = "") => {
      const item = document.createElement("li");
      item.className = "lcdp-box-card-listemails__item";

      const input = document.createElement("input");
      input.type = "email";
      input.value = valeur;
      input.placeholder = "Adresse e-mail";
      input.autocomplete = "email";
      input.className = "lcdp-box-card-listemails__input";

      item.appendChild(input);
      liste.appendChild(item);
      input.focus();
    };

    ajouterChamp();

    actions.innerHTML = "";
    actions.appendChild(creerBoutonPartage("Ajouter un e-mail", "lcdp-button-secondary", () => ajouterChamp()));

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        conteneur.remove();
        resolve(valeur);
      }

      actions.appendChild(creerBoutonPartage("Envoyer", "lcdp-button-primary", () => {
        const emailsSaisis = Array.from(liste.querySelectorAll("input[type='email']"))
          .map((input) => nettoyerEmail(input.value))
          .filter(Boolean);

        const emailsInvalides = emailsSaisis.filter((email) => !emailValide(email));

        if (!emailsSaisis.length) {
          message.hidden = false;
          message.textContent = "Renseignez au moins une adresse e-mail.";
          return;
        }

        if (emailsInvalides.length) {
          message.hidden = false;
          message.textContent = "Une adresse e-mail est invalide.";
          return;
        }

        const emails = emailsSaisis.filter((email, index, array) => array.indexOf(email) === index);

        if (emails.length > 10) {
          message.hidden = false;
          message.textContent = "Le partage est limité à 10 adresses e-mail.";
          return;
        }

        fermer(emails);
      }));

      actions.appendChild(creerBoutonPartage("Annuler", "lcdp-button-secondary", () => fermer(null)));

      if (boutonFermer) {
        boutonFermer.addEventListener("click", () => fermer(null));
      }

      box.addEventListener("click", (event) => {
        if (event.target === box) fermer(null);
      });
    });
  }

  function creerBoutonPartage(label, style, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button " + (style || "lcdp-button-primary");
    bouton.textContent = label;
    bouton.addEventListener("click", action);
    return bouton;
  }

  async function envoyerPartagePlanningParc(parc, emails, typepartage) {
    if (!ENDPOINT_PARTAGE_PAGE) {
      throw new Error("Le service de partage est temporairement indisponible.");
    }

    const typeNormalise = typepartage === "fiche" ? "fiche" : "planning";
    const idparc = String(parc.idparc || parc.id || "").trim();
    const nomparc = String(parc.nom || parc.nomparc || "").trim();
    const dptmt = String(parc.dptmt || parc.departement || "").trim();

    if (!idparc || !nomparc) {
      throw new Error("Le parc à partager est incomplet.");
    }

    const reponse = await fetch(ENDPOINT_PARTAGE_PAGE, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        typepartage: typeNormalise,
        idparc,
        nomparc,
        dptmt,
        emails
      })
    });

    const data = await reponse.json().catch(() => null);

    if (!reponse.ok || !reponseApiOk(data)) {
      throw new Error(
        normaliserMessageErreurPartage(
          messageErreurApi(data, "Le partage n’a pas pu être envoyé pour le moment. Merci de réessayer dans quelques instants.")
        )
      );
    }

    return data;
  }

  function normaliserMessageErreurPartage(message) {
    const texte = String(message || "").trim();

    if (!texte) {
      return "Le partage n’a pas pu être envoyé pour le moment. Merci de réessayer dans quelques instants.";
    }

    if (
      texte.includes("Session membre") ||
      texte.includes("Compte membre invalide") ||
      texte.includes("session membre")
    ) {
      return "Votre session membre a expiré. Merci de vous reconnecter pour partager cette page.";
    }

    if (
      texte.includes("service de partage") ||
      texte.includes("Variables manquantes") ||
      texte.includes("configuration")
    ) {
      return "Le service de partage est temporairement indisponible.";
    }

    if (
      texte.includes("Supabase") ||
      texte.includes("Resend") ||
      texte.includes("Failed to fetch") ||
      texte.includes("NetworkError")
    ) {
      return "Le partage n’a pas pu être envoyé pour le moment. Merci de réessayer dans quelques instants.";
    }

    if (texte === "Le partage n’a pas pu être envoyé.") {
      return "Le partage n’a pas pu être envoyé pour le moment. Merci de réessayer dans quelques instants.";
    }

    return texte;
  }


  async function ouvrirCalendrierMoisParc(parc) {
    const detail = obtenirShiftDetailParcActif();
    const controleur =
      etatPage.shiftDetailParc?.controleur;

    if (
      detail &&
      detail.contenu &&
      controleur &&
      typeof controleur.afficherReservation ===
        "function"
    ) {
      await controleur.afficherReservation(parc);
      return;
    }

    if (detail && detail.contenu) {
      await afficherReservationMoisParcDansConteneur(
        detail.contenu,
        parc,
        true
      );
      return;
    }

    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return;

    slot.innerHTML = "";
    await afficherReservationMoisParcDansConteneur(slot, parc, false);
  }

  async function afficherReservationMoisParcDansConteneur(slot, parc, dansShiftDetail) {
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

    if (dansShiftDetail) {
      calendrier.classList.add("lcdp-box-calendrier-mois--shift-detail");
    }

    const nomParc = String(parc.nom || parc.nomparc || "Parc").trim() || "Parc";
    const departement = String(parc.dptmt || parc.departement || "").trim();

    titre.textContent = "Planning du parc";
    meta.textContent = nomParc + (departement ? " · " + departement : "");

    const maintenant = new Date();
    const etatCalendrier = {
      parc,
      annee: maintenant.getFullYear(),
      mois: maintenant.getMonth() + 1,
      planning: [],
      modePlanning: "reservation"
    };

    etatPage.calendrierMoisActif = etatCalendrier;

    function fermer() {
      if (dansShiftDetail) {
        fermerShiftDetailParc();
        return;
      }

      const lightbox = document.getElementById("lcdp-lightbox-slot");
      if (lightbox) lightbox.innerHTML = "";
    }

    boutonFermer.addEventListener("click", fermer);

    if (!dansShiftDetail) {
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
    }

    boutonPrecedent.addEventListener("click", () => {
      changerMois(etatCalendrier, -1);
      afficherCalendrierMois(etatCalendrier, calendrier).catch(console.error);
    });

    boutonSuivant.addEventListener("click", () => {
      changerMois(etatCalendrier, 1);
      afficherCalendrierMois(etatCalendrier, calendrier).catch(console.error);
    });

    await afficherCalendrierMois(etatCalendrier, calendrier);
  }

  async function afficherCalendrierMois(etatCalendrier, calendrierRacine) {
    const racineCalendrier = calendrierRacine || document;
    const moisCourant = racineCalendrier.querySelector("[data-lcdp-calendrier-mois-current]");
    const message = racineCalendrier.querySelector("[data-lcdp-calendrier-mois-message]");
    const grille = racineCalendrier.querySelector("[data-lcdp-calendrier-mois-grid]");

    if (!moisCourant || !message || !grille) return;

    moisCourant.textContent = formaterMoisAnnee(etatCalendrier.annee, etatCalendrier.mois);
    grille.innerHTML = "";
    message.hidden = false;
    message.textContent = "Chargement du planning...";

    try {
      const planning = await chargerPlanningParcMois(etatCalendrier);
      etatCalendrier.planning = planning;
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
      grille.appendChild(creerCardJourCalendrier(etatCalendrier, dateIso, jour, planningParDate.get(dateIso)));
    }
  }

  function creerCardJourVide() {
    const card = etatPage.templateJourMois.cloneNode(true);
    card.classList.add("lcdp-box-card-jour-in-calendrier-mois--empty");
    card.disabled = true;
    card.setAttribute("aria-hidden", "true");
    return card;
  }

  function creerCardJourCalendrier(etatCalendrier, dateIso, numeroJour, planningJour) {
    const card = etatPage.templateJourMois.cloneNode(true);
    const numero = card.querySelector("[data-lcdp-card-jour-mois-number]");
    const modeLecture = etatCalendrier.modePlanning === "lecture";
    const ouvert = Boolean(planningJour && planningJour.ouvert);
    const estPasse = dateIso < dateAujourdhuiIso();
    const estAujourdhui = dateIso === dateAujourdhuiIso();

    card.dataset.date = dateIso;
    card.dataset.idparc = String(
      etatCalendrier.parc.idparc ||
      etatCalendrier.parc.id ||
      ""
    );
    card.setAttribute(
      "aria-label",
      construireLibelleJour(dateIso, ouvert)
    );

    if (numero) {
      numero.textContent = String(numeroJour);
    }

    if (modeLecture) {
      card.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois--planning-lecture"
      );
    } else {
      card.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois--reservation-trois-plages"
      );
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

    if (modeLecture && !card.disabled) {
      card.title = "Afficher le détail horaire de la journée";
      card.removeAttribute("aria-disabled");
    }

    remplirPlagesJour(
      card,
      planningJour,
      modeLecture ? "lecture" : "reservation"
    );

    return card;
  }

  function remplirPlagesJour(card, planningJour, mode) {
    const clesActives = mode === "lecture"
      ? CLES_PLAGES_AFFICHAGE
      : CLES_PLAGES_RESERVATION_ACTUELLES;

    CLES_PLAGES_AFFICHAGE.forEach((nomPlage) => {
      const slot = card.querySelector(
        '[data-lcdp-card-jour-mois-slot="' + nomPlage + '"]'
      );

      if (!slot) return;

      slot.hidden = !clesActives.includes(nomPlage);
      slot.className = "lcdp-box-card-jour-in-calendrier-mois__slot";
      slot.removeAttribute("style");
      slot.removeAttribute("title");

      if (slot.hidden) {
        return;
      }

      const plage = planningJour?.plages?.[nomPlage] || null;

      if (mode === "lecture") {
        appliquerRenduPlageLecture(slot, nomPlage, plage);
        return;
      }

      const couleur = normaliserCouleurClasse(
        plage && plage.ouverte
          ? plage.couleur
          : "gris_clair"
      );

      slot.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois__slot--" + couleur
      );
    });
  }

  async function chargerPlanningParcJourLecture(
    etatPlanning,
    dateIso
  ) {
    if (!ENDPOINT_PLANNING_PARC) {
      throw new Error("Le service planning parc n’est pas configuré.");
    }

    const idparc = String(
      etatPlanning.parc.idparc ||
      etatPlanning.parc.id ||
      ""
    ).trim();

    if (!idparc || !dateIso) {
      throw new Error("Parc ou date manquant.");
    }

    const url =
      ENDPOINT_PLANNING_PARC +
      "/planning-parc-jour?idparc=" +
      encodeURIComponent(idparc) +
      "&date=" +
      encodeURIComponent(dateIso) +
      "&contexte=membre";
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
      throw new Error(
        "Cette page est réservée aux membres invités ou abonnés."
      );
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(
        messageErreurApi(
          data,
          "Impossible de charger le détail de cette journée."
        )
      );
    }

    return data.jour || {
      date: dateIso,
      ouvert: false,
      segments: []
    };
  }

  async function ouvrirCalendrierJourDepuisCard(cardJour) {
    const dateIso = String(cardJour.dataset.date || "").trim();
    const etatCalendrier = etatPage.calendrierMoisActif;

    if (!dateIso || !etatCalendrier || !etatCalendrier.parc) {
      await afficherAlerte("Date ou parc manquant.");
      return;
    }

    const planningJour = (etatCalendrier.planning || [])
      .find((jour) => String(jour.date || "") === dateIso);

    if (!planningJour || planningJour.ouvert !== true) {
      await afficherAlerte("Aucun horaire disponible pour cette date.");
      return;
    }

    await ouvrirCalendrierJourParc({
      parc: etatCalendrier.parc,
      dateIso,
      planningJour
    });
  }

  async function ouvrirCalendrierJourParc(contexte) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-calendrier-jour.html");
    slot.appendChild(fragment);

    const calendrier = slot.querySelector("[data-lcdp-box-calendrier-jour]");
    const titre = slot.querySelector("[data-lcdp-calendrier-jour-title]");
    const meta = slot.querySelector("[data-lcdp-calendrier-jour-meta]");
    const message = slot.querySelector("[data-lcdp-calendrier-jour-message]");
    const grille = slot.querySelector("[data-lcdp-calendrier-jour-grid]");
    const boutonFermer = slot.querySelector("[data-lcdp-calendrier-jour-close]");

    if (!calendrier || !titre || !meta || !message || !grille || !boutonFermer) {
      throw new Error("Structure calendrier jour incomplète.");
    }

    const nomParc = String(contexte.parc.nom || contexte.parc.nomparc || "Parc").trim() || "Parc";
    const departement = String(contexte.parc.dptmt || contexte.parc.departement || "").trim();

    titre.textContent = "Votre heure d'arrivée";
    meta.textContent = formaterDateFr(contexte.dateIso) + " · " + nomParc + (departement ? " · " + departement : "");

    boutonFermer.addEventListener("click", () => {
      slot.innerHTML = "";
    });

    calendrier.addEventListener("click", (event) => {
      if (event.target === calendrier) slot.innerHTML = "";
    });

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") slot.innerHTML = "";
      },
      { once: true }
    );

    remplirGrilleHoraires(grille, message, contexte);
  }

  function remplirGrilleHoraires(grille, message, contexte) {
    grille.innerHTML = "";

    const plages = construirePlagesJour(contexte.planningJour);
    const heures = genererHeuresDisponibles();
    const messagesBlocage = [];

    plages.forEach((plage) => {
      const reservationPlage = trouverReservationActiveDatePlage(contexte.dateIso, plage.nom);

      if (reservationPlage) {
        messagesBlocage.push(
          "Vous avez déjà une réservation à " +
          formaterHeurePhrase(extraireHeureFranceReservation(reservationPlage.datebookd)) +
          " sur " +
          libellePlageReservation(plage.nom) +
          "."
        );
      }
    });

    heures.forEach((heure) => {
      const plage = trouverPlagePourHeure(plages, heure);

      if (!plage) return;

      const reservationPlage = trouverReservationActiveDatePlage(contexte.dateIso, plage.nom);
      grille.appendChild(creerCardHeure(contexte, heure, plage, reservationPlage));
    });

    if (!grille.children.length) {
      message.hidden = false;
      message.textContent = "Aucun horaire d'arrivée n'est disponible pour cette date.";
      return;
    }

    if (messagesBlocage.length) {
      message.hidden = false;
      message.textContent = messagesBlocage.join(" ");
      return;
    }

    message.hidden = true;
    message.textContent = "";
  }

  function construirePlagesJour(planningJour) {
    if (!planningJour || !planningJour.plages) {
      return [];
    }

    const plages = [];

    ajouterPlageSiOuverte(plages, "plage1", planningJour.plages.plage1, {
      debut: "06:00",
      fin: "10:00"
    });

    ajouterPlageSiOuverte(plages, "plage2", planningJour.plages.plage2, {
      debut: "10:00",
      fin: "13:00"
    });

    ajouterPlageSiOuverte(plages, "plage3", planningJour.plages.plage3, {
      debut: "13:00",
      fin: "17:00"
    });

    ajouterPlageSiOuverte(plages, "plage4", planningJour.plages.plage4, {
      debut: "17:00",
      fin: "21:00"
    });

    ajouterPlageSiOuverte(plages, "plage5", planningJour.plages.plage5, {
      debut: "21:00",
      fin: "23:59"
    });

    return plages;
  }

  function ajouterPlageSiOuverte(plages, nomPlage, plage, defaut) {
    if (!plage || plage.ouverte !== true) {
      return;
    }

    plages.push({
      nom: nomPlage,
      debut: plage.debut || defaut.debut,
      fin: plage.fin || defaut.fin,
      couleur: normaliserCouleurClasse(plage.couleur)
    });
  }

  function genererHeuresDisponibles() {
    const heures = [];

    for (let totalMinutes = 6 * 60; totalMinutes <= 23 * 60 + 30; totalMinutes += 30) {
      const heure = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      heures.push(
        String(heure).padStart(2, "0") + ":" + String(minutes).padStart(2, "0")
      );
    }

    return heures;
  }

  function trouverPlagePourHeure(plages, heure) {
    const totalMinutes = convertirHeureEnMinutes(heure);

    return plages.find((plage) => {
      const debut = convertirHeureEnMinutes(plage.debut);
      const fin = convertirHeureEnMinutes(plage.fin);

      return totalMinutes >= debut && totalMinutes < fin;
    }) || null;
  }

  function convertirHeureEnMinutes(heure) {
    const [heures, minutes] = String(heure || "00:00").split(":").map(Number);

    if (!Number.isFinite(heures) || !Number.isFinite(minutes)) {
      return 0;
    }

    return heures * 60 + minutes;
  }

  function creerCardHeure(contexte, heure, plage, reservationPlage) {
    const card = etatPage.templateHeureJour.cloneNode(true);
    const label = card.querySelector("[data-lcdp-card-heure-jour-label]");
    const couleur = normaliserCouleurClasse(plage.couleur);
    const heureReservee = reservationPlage
      ? extraireHeureFranceReservation(reservationPlage.datebookd)
      : "";
    const estHeureReservee = reservationPlage && heureReservee === heure;

    card.classList.add("lcdp-box-card-heure-in-calendrier-jour--" + couleur);
    card.dataset.idparc = String(contexte.parc.idparc || contexte.parc.id || "");
    card.dataset.date = contexte.dateIso;
    card.dataset.heure = heure;
    card.dataset.plagebookd = plage.nom;

    if (reservationPlage) {
      card.disabled = true;
      card.dataset.indisponible = estHeureReservee ? "deja-reserve" : "plage-deja-reservee";

      if (estHeureReservee) {
        card.classList.add("lcdp-box-card-heure-in-calendrier-jour--deja-reserve");
        card.setAttribute("aria-label", formaterHeureAffichee(heure) + " déjà réservé");
      } else {
        card.classList.add("lcdp-box-card-heure-in-calendrier-jour--plage-bloquee");
        card.setAttribute("aria-label", formaterHeureAffichee(heure) + " indisponible car une réservation existe déjà sur cette plage");
      }
    }

    if (label) {
      label.textContent = formaterHeureAffichee(heure);
    }

    return card;
  }

  function trouverReservationActiveDatePlage(dateIso, plagebookd) {
    return (Array.isArray(etatPage.reservationsMembre) ? etatPage.reservationsMembre : [])
      .find((reservation) => {
        if (!reservation || reservation.statut === "cancd") return false;

        return (
          extraireDateFranceReservation(reservation.datebookd) === dateIso &&
          String(reservation.plagebookd || "") === String(plagebookd || "")
        );
      }) || null;
  }

  function extraireDateFranceReservation(timestampIso) {
    const date = new Date(timestampIso);

    if (Number.isNaN(date.getTime())) return "";

    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const annee = morceaux.find((item) => item.type === "year")?.value || "";
    const mois = morceaux.find((item) => item.type === "month")?.value || "";
    const jour = morceaux.find((item) => item.type === "day")?.value || "";

    return annee && mois && jour ? annee + "-" + mois + "-" + jour : "";
  }

  function extraireHeureFranceReservation(timestampIso) {
    const date = new Date(timestampIso);

    if (Number.isNaN(date.getTime())) return "";

    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);

    const heure = morceaux.find((item) => item.type === "hour")?.value || "";
    const minute = morceaux.find((item) => item.type === "minute")?.value || "";

    return heure && minute ? heure + ":" + minute : "";
  }

  function formaterHeurePhrase(heure) {
    const valeur = String(heure || "");
    const match = valeur.match(/^(\d{2}):(\d{2})$/);

    if (!match) return formaterHeureAffichee(valeur);

    return String(Number(match[1])) + "h" + match[2];
  }

  function libellePlageReservation(plagebookd) {
    if (plagebookd === "plage1") return "la plage de 6 h à 10 h";
    if (plagebookd === "plage2") return "la plage de 10 h à 13 h";
    if (plagebookd === "plage3") return "la plage de 13 h à 17 h";
    if (plagebookd === "plage4") return "la plage de 17 h à 21 h";
    if (plagebookd === "plage5") return "la plage de 21 h à 2 h";

    return "cette plage";
  }


  async function traiterChoixReservationDepuisFicheParc(choix) {
    if(choixPlanningEnCours)return false;
    choixPlanningEnCours=true;
    try {
    if (!choix?.parc || !choix.dateIso || !choix.heure || !choix.heureFin || !choix.plagebookd) {
      throw new Error("Plage, date ou parc manquant.");
    }
    if (choix.planningMembre?.length) {
      const resultat = await ouvrirPlanningEnCours(choix.planningMembre);
      if (resultat === "actualiser") {
        cachePlanningParcLecture.clear();
        await choix.actualiser();
      }
      return false;
    }
    const debut = construireDateBookd(choix.dateIso, choix.heure);
    if (!debut || Date.parse(debut) <= Date.now()) {
      await afficherAlerteSuperposee("Cette plage a déjà commencé."); return false;
    }
    if(panierPlanning.reservations.some(r=>r.dateIso===choix.dateIso && r.plagebookd===choix.plagebookd)){
      await afficherAlerteSuperposee("Ce créneau est déjà dans votre planning.");
      await chargerDonneesPanierPlanning();
      await ouvrirVotrePlanning(choix);return false;
    }
    const contenu = document.createElement("div");
    const date = new Intl.DateTimeFormat("fr-FR", {timeZone:"Europe/Paris",weekday:"long",day:"numeric",month:"long",year:"numeric"})
      .format(new Date(choix.dateIso + "T12:00:00Z"));
    for (const texte of [choix.parc.nom || choix.parc.nomparc || "Parc", date.charAt(0).toUpperCase()+date.slice(1),
      "Horaire : " + formaterHeureAffichee(choix.heure) + "–" + formaterHeureAffichee(choix.heureFin)]) {
      const ligne = document.createElement("div"); ligne.textContent = texte; contenu.append(ligne);
    }
    const reponse = await ouvrirDialogueBoutonsSuperpose({
      titre:"Confirmez votre venue", contenu,
      boutons:[{label:"Annuler",valeur:"annuler",style:"lcdp-button-secondary"},
        {label:"Confirmer",valeur:"confirmer",style:"lcdp-button-orange"}]
    });
    if (reponse !== "confirmer") return false;
    await chargerDonneesPanierPlanning();
    if(!panierPlanning.donneesConnues)return false;
    if(reservationPanierCouverte(choix)===true){
      try {
        const reservation=await enregistrerReservation({
          idparc:String(choix.parc.idparc||choix.parc.id||''),
          datebookd:debut,plagebookd:choix.plagebookd,modePlanningCouvert:true
        });
        if(!reservation?.idflux)throw Error('Le serveur n’a pas confirmé l’enregistrement. Consultez Mon planning avant de réessayer.');
        etatPage.reservationsMembre.push({...reservation,parc:{...choix.parc}});
        cachePlanningParcLecture.clear();
        panierPlanning.derniereAction={enregistree:true,reservation:{...choix}};
        await ouvrirVotrePlanning(choix);
      }catch(error){await afficherAlerteSuperposee(error.message||'Impossible d’enregistrer cette réservation.');}
      return false;
    }
    const resultat = ajouterReservationPanierPlanning(choix);
    if(resultat==='ajoute')panierPlanning.derniereAction={enregistree:false,reservation:{...choix}};
    if (resultat === "doublon") await afficherAlerteSuperposee("Ce créneau est déjà dans votre planning.");
    if (resultat === "existant") await afficherAlerteSuperposee("Vous avez déjà une réservation ou une invitation pour cette plage dans ce parc.");
    if (resultat === "limite") await afficherAlerteSuperposee("Votre planning contient déjà douze nouvelles réservations.");
    if(resultat==="mois")await afficherAlerteSuperposee("Cinq nouvelles réservations maximum par mois, tous parcs confondus.");
    if(resultat==="horizon")await afficherAlerteSuperposee("Choisissez une date entre M et M+12.");
    if(resultat==="conflit")await afficherAlerteSuperposee("Cette plage est déjà dans votre planning, dans ce parc ou un autre.");
    await ouvrirVotrePlanning(choix);
    return false;
    } finally {choixPlanningEnCours=false;}
  }

  function cleReservationPanierPlanning(choix) {
    return [String(choix.parc?.idparc || choix.parc?.id || choix.idparc || ""),
      choix.dateIso || extraireDateFranceReservation(choix.datebookd), choix.plagebookd].join("|");
  }

  function ajouterReservationPanierPlanning(choix) {
    const cle=cleReservationPanierPlanning(choix);
    if (panierPlanning.reservations.some(r=>cleReservationPanierPlanning(r)===cle)) return "doublon";
    if (etatPage.reservationsMembre.some(r=>r.statut!=="cancd" && cleReservationPanierPlanning(r)===cle)) return "existant";
    if (panierPlanning.reservations.length>=12) return "limite";
    const relatif=numeroMoisPanier(choix.dateIso);
    if(relatif<0 || relatif>12)return "horizon";
    if(panierPlanning.reservations.some(r=>r.dateIso===choix.dateIso && r.plagebookd===choix.plagebookd))return "conflit";
    if(panierPlanning.reservations.filter(r=>r.dateIso.slice(0,7)===choix.dateIso.slice(0,7)).length>=5)return "mois";
    panierPlanning.calcul=null;panierPlanning.selection=null;
    panierPlanning.reservations.push({parc:{...choix.parc},dateIso:choix.dateIso,heure:choix.heure,
      heureFin:choix.heureFin,plagebookd:choix.plagebookd,
      datebookd:construireDateBookd(choix.dateIso,choix.heure)});
    return "ajoute";
  }

  async function chargerDonneesPanierPlanning() {
    panierPlanning.donneesConnues=false;
    try {
      if(!ENDPOINT_PLANNING_MEMBRE)throw new Error("Le service du planning membre n’est pas configuré.");
      const response=await fetch(ENDPOINT_PLANNING_MEMBRE+"/mes-reservations",{
        method:"GET",credentials:"include",cache:"no-store",headers:{Accept:"application/json"}
      });
      const data=await response.json().catch(()=>null);
      if(response.status===401){redirigerConnexionMembre("inactive");throw new Error("Votre session membre a expiré.");}
      if(!response.ok || !reponseApiOk(data) || !Array.isArray(data.abonnements) || !Array.isArray(data.reservations)) {
        throw new Error(data?.message || "Impossible de vérifier vos abonnements. Réessayez en ouvrant votre planning.");
      }
      panierPlanning.abonnements=data.abonnements;
      etatPage.reservationsMembre=data.reservations;
      panierPlanning.donneesConnues=true;
    } catch(error) {
      await afficherAlerteSuperposee(error.message || "Impossible de vérifier vos abonnements.");
    }
  }

  function reservationPanierCouverte(reservation) {
    if (!panierPlanning.donneesConnues) return null;
    return panierPlanning.abonnements.some(abo =>
      String(abo.statutabo || "").trim().toLowerCase() !== "cancd" &&
      String(abo.debut || "").slice(0,10) <= reservation.dateIso &&
      String(abo.fin || "").slice(0,10) >= reservation.dateIso);
  }

  function moisRelatifPanier(dateIso) {
    const courant=extraireDateFranceReservation(new Date().toISOString()).slice(0,7).split("-").map(Number);
    const cible=dateIso.slice(0,7).split("-").map(Number);
    const difference=(cible[0]-courant[0])*12+cible[1]-courant[1];
    return difference===0 ? "M" : "M"+(difference>0 ? "+" : "")+difference;
  }

  function nombreMoisPanierPlanning() {
    return new Set(panierPlanning.reservations.map(r=>r.dateIso.slice(0,7))).size;
  }

  function construireContenuVotrePlanning(contenu, actions) {
    contenu.replaceChildren();
    if(panierPlanning.derniereAction){
      const a=panierPlanning.derniereAction,r=a.reservation;
      lignePanier(contenu,'p',a.enregistree?'Votre réservation est enregistrée.':'Cette date est ajoutée à votre planning à confirmer.').className='lcdp-panier-planning__confirmation';
      lignePanier(contenu,'p',(r.parc.nom||r.parc.nomparc||'Parc')+' · '+r.dateIso+' · '+formaterHeureAffichee(r.heure)+'–'+formaterHeureAffichee(r.heureFin));
    }
    const sousTitre=document.createElement("h3"); sousTitre.className="lcdp-panier-planning__sous-titre";
    sousTitre.textContent="Nouvelles réservations";
    const compte=document.createElement("p");compte.className="lcdp-panier-planning__compte";
    const nombre=panierPlanning.reservations.length, mois=nombreMoisPanierPlanning();
    compte.textContent=nombre+" "+(nombre===1 ? "réservation" : "réservations")+" · "+mois+" "+(mois===1 ? "mois concerné" : "mois concernés");
    const table=document.createElement("table");table.className="lcdp-panier-planning__table";
    const caption=document.createElement("caption");caption.className="lcdp-panier-planning__caption";
    caption.textContent="Vos nouvelles réservations et leur couverture par un abonnement";
    const thead=document.createElement("thead"),entete=document.createElement("tr");
    for(const titre of ["Réza","Mois M","Abonnement"]){const th=document.createElement("th");th.scope="col";th.textContent=titre;entete.append(th);}
    thead.append(entete);
    const tbody=document.createElement("tbody");
    for(const reservation of [...panierPlanning.reservations].sort((a,b)=>a.datebookd.localeCompare(b.datebookd)||a.parc.nom?.localeCompare(b.parc.nom || "")||0)){
      const ligne=document.createElement("tr"),detail=document.createElement("td"),colMois=document.createElement("td"),colAbo=document.createElement("td");
      const nom=document.createElement("strong");nom.textContent=reservation.parc.nom || reservation.parc.nomparc || "Parc";
      const date=document.createElement("span");
      date.textContent=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(new Date(reservation.dateIso+"T12:00:00Z"));
      const heure=document.createElement("span");heure.textContent=formaterHeureAffichee(reservation.heure)+"–"+formaterHeureAffichee(reservation.heureFin);
      const retirer=document.createElement("button");retirer.type="button";retirer.className="lcdp-button lcdp-button-secondary lcdp-panier-planning__retirer";
      retirer.textContent="Retirer";retirer.setAttribute("aria-label","Retirer "+nom.textContent+", "+date.textContent+", "+heure.textContent);
      retirer.addEventListener("click",()=>{
        const cle=cleReservationPanierPlanning(reservation);
        panierPlanning.reservations=panierPlanning.reservations.filter(r=>cleReservationPanierPlanning(r)!==cle);
        panierPlanning.calcul=null;panierPlanning.selection=null;
        if(!panierPlanning.derniereAction?.enregistree)panierPlanning.derniereAction=null;
        construireContenuVotrePlanning(contenu,actions);
      });
      detail.append(nom,date,heure,retirer);colMois.textContent=moisRelatifPanier(reservation.dateIso);
      const couvert=reservationPanierCouverte(reservation),picto=document.createElement("span");
      picto.className="lcdp-panier-planning__couverture "+(couvert===true ? "lcdp-panier-planning__couverture--oui" : couvert===false ? "lcdp-panier-planning__couverture--non" : "lcdp-panier-planning__couverture--inconnue");
      picto.textContent=couvert===true ? "✓" : couvert===false ? "●" : "?";
      const libelle=couvert===true ? "Couverte par un abonnement" : couvert===false ? "À couvrir par un abonnement" : "Couverture non vérifiée";
      picto.title=libelle;picto.setAttribute("role","img");picto.setAttribute("aria-label",libelle);
      colAbo.append(picto);ligne.append(detail,colMois,colAbo);tbody.append(ligne);
    }
    table.append(caption,thead,tbody);
    if(nombre)contenu.append(sousTitre,compte,table);
    const ajouter=actions.querySelector('[data-lcdp-dialogue-valeur="ajouter"]');
    const offres=document.createElement("section");offres.className="lcdp-panier-planning__offres";offres.setAttribute("aria-live","polite");contenu.append(offres);
    if(nombre)actualiserOffresPanier(offres,actions);
    const planifier=actions.querySelector('[data-lcdp-dialogue-valeur="planifier"]');
    if(ajouter){ajouter.disabled=nombre>=12;ajouter.setAttribute("aria-disabled",String(ajouter.disabled));}
    if(planifier){planifier.hidden=nombre===0;planifier.disabled=true;planifier.setAttribute("aria-disabled",String(planifier.disabled));}
    const abandonner=actions.querySelector('[data-lcdp-dialogue-valeur="annuler"]');
    if(abandonner)abandonner.hidden=nombre===0;
  }

  function numeroMoisPanier(dateIso){
    const actuel=extraireDateFranceReservation(new Date().toISOString()).slice(0,7).split('-').map(Number);
    const cible=dateIso.slice(0,7).split('-').map(Number);return (cible[0]-actuel[0])*12+cible[1]-actuel[1];
  }
  function texteMoisOffre(offset){
    const actuel=extraireDateFranceReservation(new Date().toISOString()).slice(0,7).split('-').map(Number);
    return new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'Europe/Paris'}).format(new Date(Date.UTC(actuel[0],actuel[1]-1+offset,15,12)));
  }
  function montantPanier(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);}
  function nomOffrePanier(code){return ({'1J':'1 journée','1M':'1 mois','3M':'3 mois','5M':'5 mois','10M':'10 mois','11M':'11 mois','1A':'12 mois'})[code]||code;}
  function lignePanier(parent,tag,texte){const e=document.createElement(tag);e.textContent=texte;parent.append(e);return e;}
  async function calculerOffresPanier(){
    panierPlanning.calcul=null;
    if(!panierPlanning.reservations.length)return null;
    const reservations=panierPlanning.reservations.map(r=>({idparc:String(r.parc.idparc||r.parc.id||''),dateIso:r.dateIso,plagebookd:r.plagebookd}));
    const response=await fetch(ENDPOINT_PLANNING_MEMBRE+'/calculer-panier',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({reservations})});
    const data=await response.json().catch(()=>null);
    if(!response.ok || !data?.ok || !data.calcul)throw Error(data?.message||'Le calcul de votre planning est indisponible.');
    panierPlanning.calcul=data.calcul;return data.calcul;
  }
  async function actualiserOffresPanier(zone,actions){
    const generation=++panierPlanning.generation;
    const bouton=actions.querySelector('[data-lcdp-dialogue-valeur="planifier"]');
    if(bouton)bouton.disabled=true;
    if(!panierPlanning.reservations.length){lignePanier(zone,'p','Ajoutez une première réservation pour découvrir l’abonnement adapté à votre planning.');return;}
    lignePanier(zone,'p','Recherche de l’abonnement adapté à votre planning…');
    try{
      const calcul=await calculerOffresPanier();
      if(generation!==panierPlanning.generation || !zone.isConnected)return;
      zone.replaceChildren();rendreOffresPanier(zone,calcul);
      if(bouton){bouton.disabled=!['optimal','partial'].includes(calcul.status);bouton.setAttribute('aria-disabled',String(bouton.disabled));}
    }catch(error){if(generation!==panierPlanning.generation || !zone.isConnected)return;zone.replaceChildren();lignePanier(zone,'p',error.message);const retry=lignePanier(zone,'button','Réessayer');retry.type='button';retry.className='lcdp-button lcdp-button-secondary';retry.onclick=()=>{zone.replaceChildren();actualiserOffresPanier(zone,actions);};}
  }
  function rendreOffresPanier(zone,c){
    function carte(titre,plan,prix,note){
      const article=document.createElement('article');article.className='lcdp-panier-planning__offre';zone.append(article);
      lignePanier(article,'h3',titre);lignePanier(article,'strong',plan.map(o=>nomOffrePanier(o.code)).join(' + ')+' — '+montantPanier(prix));
      for(const o of plan)lignePanier(article,'p',o.code==='1J'?o.day+' '+texteMoisOffre(o.start):texteMoisOffre(o.start)+' – '+texteMoisOffre(o.end));
      if(note)lignePanier(article,'p',note);
    }
    if(c.status==='limite_calcul'){lignePanier(zone,'p','Le calcul n’a pas abouti. Modifiez votre planning ou réessayez.');return;}
    if(c.summary.toCover===0){lignePanier(zone,'h3','Votre abonnement couvre ces dates');lignePanier(zone,'p','Aucun nouvel abonnement nécessaire.');return;}
    if(c.recommendation){const r=c.recommendation;carte('Abonnement recommandé',r.plan,r.priceCents,'Vos premières réservations sont incluses. Une fois abonné, continuez à enrichir votre planning sans supplément pendant la période souscrite, selon les disponibilités.');}
    if(c.plan?.length){
      const different=!c.recommendation || JSON.stringify(c.recommendation.plan)!==JSON.stringify(c.plan);
      if(different)carte(c.recommendation?'Alternative':'Avec votre planning actuel',c.plan,c.priceCents,c.complete?'Vos nouvelles réservations sont incluses.':c.summary.newlyCovered+' réservation(s) incluse(s) sur '+c.summary.toCover+'.');
    }
    if(c.uncovered?.length){lignePanier(zone,'p',c.uncovered.length+' réservation(s) restent en dehors de l’offre disponible. Elles ne sont pas confirmées.');for(const row of c.uncovered){const r=panierPlanning.reservations[row.id-1];if(r)lignePanier(zone,'p',(r.parc.nom||r.parc.nomparc||'Parc')+' · '+r.dateIso+' · '+formaterHeureAffichee(r.heure));}}
    if(c.provisional && !c.complete){const p=c.provisional;carte('Pour inclure toutes vos dates',[p],p.priceCents,'Ajoutez '+p.missingReservations+' réservation(s) '+(p.additionalDistinctMonths?'dans autant d’autres mois distincts de cette période.':': '+p.missingMonths.map(x=>x.count+' en '+texteMoisOffre(x.month)).join(', '))+ ' Cet abonnement n’est pas encore souscriptible.');}
    if(!c.plan?.length && !c.provisional)lignePanier(zone,'p','Aucune offre ne correspond pour le moment. Ajoutez ou retirez des dates.');
  }
  async function presenterChoixPanier(){
    const c=panierPlanning.calcul;if(!c || !['optimal','partial'].includes(c.status))return;
    const contenu=document.createElement('div');rendreOffresPanier(contenu,c);
    const boutons=[{label:'Modifier mon planning',valeur:'retour',style:'lcdp-button-secondary'}];
    if(c.summary.toCover===0)boutons.push({label:'Continuer',valeur:'couvert',style:'lcdp-button-orange'});
    else {
      if(c.recommendation)boutons.push({label:'Choisir cet abonnement',valeur:'recommande',style:'lcdp-button-orange'});
      if(c.plan?.length && (!c.recommendation || JSON.stringify(c.recommendation.plan)!==JSON.stringify(c.plan)))boutons.push({label:c.recommendation?'Choisir l’alternative':'Choisir cette proposition',valeur:'economique',style:'lcdp-button-secondary'});
    }
    const reponse=await ouvrirDialogueBoutonsSuperpose({titre:'Votre planning',contenu,classe:'lcdp-panier-planning',boutons});
    if(!['couvert','recommande','economique'].includes(reponse))return;
    const offre=reponse==='recommande'?c.recommendation:{plan:c.plan,priceCents:c.priceCents};
    const inclus=new Set([...(c.alreadyCoveredIds||[]),...offre.plan.flatMap(p=>p.reservationIds)]);
    const selection=panierPlanning.reservations.filter((r,i)=>inclus.has(i+1));
    const exclus=panierPlanning.reservations.length-selection.length;
    if(exclus){const decision=await ouvrirDialogueBoutonsSuperpose({titre:'Planning partiellement couvert',texte:exclus+' réservation(s) ne figurent pas dans cette proposition. Continuer avec les '+selection.length+' réservation(s) incluses ?',boutons:[{label:'Modifier mon planning',valeur:'retour',style:'lcdp-button-secondary'},{label:'Continuer',valeur:'oui',style:'lcdp-button-orange'}]});if(decision!=='oui')return;}
    panierPlanning.selection={reservations:selection.map(r=>({...r})),offres:offre.plan,priceCents:offre.priceCents};
    const recap=document.createElement('div');
    lignePanier(recap,'p',selection.length+' réservation(s) · '+montantPanier(offre.priceCents));
    for(const o of offre.plan)lignePanier(recap,'p',nomOffrePanier(o.code)+' · '+texteMoisOffre(o.start)+(o.code==='1J'?' · jour '+o.day:' – '+texteMoisOffre(o.end)));
    for(const r of selection)lignePanier(recap,'p',(r.parc.nom||r.parc.nomparc||'Parc')+' · '+r.dateIso+' · '+formaterHeureAffichee(r.heure)+'–'+formaterHeureAffichee(r.heureFin));
    lignePanier(recap,'p','Votre sélection est prête. Aucune réservation ni souscription n’est encore enregistrée. La finalisation sera disponible après le raccordement du paiement.');
    await ouvrirDialogueBoutonsSuperpose({titre:'Récapitulatif de votre sélection',contenu:recap,classe:'lcdp-panier-planning',boutons:[{label:'Revenir à mon planning',valeur:'retour',style:'lcdp-button-orange'}]});
  }

  async function ouvrirVotrePlanning(choix) {
    while(true){
      const contenu=document.createElement("div");contenu.className="lcdp-panier-planning__contenu";
      const reponse=await ouvrirDialogueBoutonsSuperpose({
        titre:"Votre planning",contenu,classe:"lcdp-panier-planning",fermetureLibre:false,
        preparer:({actions})=>construireContenuVotrePlanning(contenu,actions),
        boutons:[{label:"Ajouter une réservation",valeur:"ajouter",style:"lcdp-button-secondary"},
          {label:"Abandonner les dates en attente",valeur:"annuler",style:"lcdp-button-secondary"},
          {label:"Fermer",valeur:"fermer",style:"lcdp-button-secondary"},
          {label:"Continuer",valeur:"planifier",style:"lcdp-button-orange"}]
      });
      if(reponse==="fermer"){fermerShiftDetailParc();return;}
      if(reponse==="ajouter"){
        const parc=await ouvrirDialogueBoutonsSuperpose({titre:"Ajouter une réservation",texte:"Dans quel parc souhaitez-vous planifier ?",
          boutons:[{label:"Ce parc",valeur:"meme",style:"lcdp-button-orange"},{label:"Autre parc",valeur:"autre",style:"lcdp-button-secondary"}]});
        if(parc==="meme"){
          if(typeof choix.retourMois==="function")choix.retourMois();
          else await ouvrirShiftDetailParc(choix.parc,"planning");
          return;
        }
        if(parc==="autre"){fermerShiftDetailParc();return;}
      }
      if(reponse==="annuler"){
        const annuler=panierPlanning.reservations.length ? await ouvrirDialogueBoutonsSuperpose({titre:"Annuler votre planning ?",
          texte:"Seules les dates en attente sont retirées. Vos réservations déjà enregistrées sont conservées.",
          boutons:[{label:"NON",valeur:"non",style:"lcdp-button-secondary"},{label:"ANNULER",valeur:"annuler",style:"lcdp-button-orange"}]}) : "annuler";
        if(annuler==="annuler"){panierPlanning.reservations=[];panierPlanning.calcul=null;panierPlanning.selection=null;panierPlanning.derniereAction=null;fermerShiftDetailParc();return;}
      }
      if(reponse==="planifier"){
        await chargerDonneesPanierPlanning();
        if(!panierPlanning.donneesConnues)continue;
        try {
          const valide=await calculerOffresPanier();
          if(!valide)continue;
          await presenterChoixPanier();
        } catch(error){await afficherAlerteSuperposee(error.message);}
      }
    }
  }

  async function ouvrirPlanningEnCours(reservations) {
    const contenu = document.createElement("div");
    contenu.className = "lcdp-planning-en-cours";
    return ouvrirDialogueBoutonsSuperpose({
      titre:"Planning en cours", contenu,
      preparer: ({fermer}) => {
        for (const reservation of reservations) {
          const carte = document.createElement("article"); carte.className="lcdp-planning-en-cours__carte";
          const image = document.createElement("img"); image.src=construireUrlImageParc(reservation.parc);
          image.alt=""; image.className="lcdp-planning-en-cours__photo";
          const texte=document.createElement("div");
          const type=document.createElement("strong"); type.textContent=reservation.invitation === true ? "Invitation reçue" : "Réservation";
          const nom=document.createElement("div"); nom.textContent=reservation.parc?.nom || "Parc";
          const date=document.createElement("div");
          date.textContent=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(reservation.datebookd));
          const heure=document.createElement("div");
          const format=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit"});
          heure.textContent=format.format(new Date(reservation.datebookd)) + (reservation.datebookf ? "–"+format.format(new Date(reservation.datebookf)) : "");
          texte.append(type,nom,date,heure);
          const annuler=document.createElement("button"); annuler.type="button";
          annuler.className="lcdp-button lcdp-button-secondary"; annuler.textContent="Annuler";
          annuler.addEventListener("click", async () => {
            annuler.disabled=true;
            try {
              const confirmation=await ouvrirDialogueBoutonsSuperpose({
                titre:"Annuler le planning ?", texte:type.textContent + " · " + nom.textContent + " · " + date.textContent,
                boutons:[{label:"NON",valeur:"non",style:"lcdp-button-secondary"},{label:"ANNULER",valeur:"annuler",style:"lcdp-button-orange"}]
              });
              if(confirmation !== "annuler")return;
              const response=await fetch(ENDPOINT_PLANNING_MEMBRE+"/annuler-reservation",{
                method:"POST",credentials:"include",cache:"no-store",headers:{"Content-Type":"application/json","Accept":"application/json"},
                body:JSON.stringify({idflux:reservation.idflux})
              });
              const data=await response.json().catch(()=>null);
              if(!response.ok || !reponseApiOk(data))throw new Error(data?.message || "Impossible d’annuler ce planning.");
              await afficherAlerteSuperposee(reservation.invitation === true ? "Votre invitation est annulée." : "Votre réservation est annulée.","orange");
              fermer("actualiser");
            } catch(error) {await afficherAlerteSuperposee(error.message);}
            finally {annuler.disabled=false;}
          });
          carte.append(image,texte,annuler); contenu.append(carte);
        }
      },
      boutons:[{label:"OK",valeur:"ok",style:"lcdp-button-orange"}]
    });
  }

  async function enregistrerReservation(payload) {
    if (!ENDPOINT_FLUXM) {
      throw new Error("Le service du planning membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_FLUXM + "/creer-reservation", {
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
      redirigerConnexionMembre("inactive");
      throw new Error("Session membre inactive.");
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible d'enregistrer la réservation."));
    }

    return data.reservation || null;
  }

  function construireDateBookd(dateIso, heure) {
    // Les horaires du parc sont toujours interprétés en Europe/Paris,
    // indépendamment du fuseau configuré sur le téléphone.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || "")) ||
        !/^\d{2}:\d{2}$/.test(String(heure || ""))) return "";
    const cible = Date.parse(dateIso + "T" + heure + ":00Z");
    if (!Number.isFinite(cible) || new Date(cible).toISOString().slice(0, 16) !== dateIso + "T" + heure) return "";
    const format = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    const lireLocal = (instant) => {
      const p = Object.fromEntries(format.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
      return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute + ":" + p.second;
    };
    let instant = cible;
    for (let i = 0; i < 3; i += 1) {
      instant += cible - Date.parse(lireLocal(instant) + "Z");
    }
    // Refuse notamment une heure qui n'existe pas au passage à l'heure d'été.
    if (lireLocal(instant).slice(0, 16) !== dateIso + "T" + heure) return "";
    return new Date(instant).toISOString();
  }

  async function ouvrirDialogueBoutonsSuperpose(options) {
    const conteneur = document.createElement("div");
    document.body.appendChild(conteneur);

    const fragment = await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html");
    conteneur.appendChild(fragment);

    const dialogue = conteneur.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = conteneur.querySelector("[data-lcdp-dialogue-title]");
    const texte = conteneur.querySelector("[data-lcdp-dialogue-text]");
    const actions = conteneur.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = conteneur.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      conteneur.remove();
      throw new Error("Structure de dialogue bouton incomplète.");
    }

    if(options.classe)dialogue.classList.add(options.classe);
    if(options.fermetureLibre===false)boutonFermer.hidden=true;
    titre.textContent = options.titre || "";
    texte.textContent = options.texte || "";
    if (options.contenu) texte.replaceChildren(options.contenu);
    actions.innerHTML = "";

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        conteneur.remove();
        resolve(valeur || null);
      }

      (options.boutons || []).forEach((configuration) => {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-button " + (configuration.style || "lcdp-button-primary");
        bouton.textContent = configuration.label || "Valider";
        bouton.dataset.lcdpDialogueValeur=configuration.valeur || "";

        bouton.addEventListener("click", () => {
          fermer(configuration.valeur || configuration.label || true);
        });

        actions.appendChild(bouton);
      });

      if (typeof options.preparer === "function") options.preparer({fermer,actions,dialogue});
      boutonFermer.addEventListener("click", () => {if(options.fermetureLibre!==false)fermer(null);});
      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue && options.fermetureLibre!==false) fermer(null);
      });
    });
  }

  async function afficherAlerteSuperposee(
    message,
    couleurBouton = "orange"
  ) {
    const conteneur = document.createElement("div");
    document.body.appendChild(conteneur);

    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
    conteneur.appendChild(fragment);

    const alerte = conteneur.querySelector("[data-lcdp-box-alerte]");
    const texte = conteneur.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = conteneur.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = conteneur.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      conteneur.remove();
      throw new Error("Structure de l’alerte incomplète.");
    }

    texte.textContent = message || "";
    if (couleurBouton === "vert-plein-partage") {
      alerte.classList.add("lcdp-planifier-partage-confirmation");
    }
    boutonOk.classList.remove(
      "lcdp-button-primary",
      "lcdp-button-secondary",
      "lcdp-button-orange"
    );
    boutonOk.classList.add(
      couleurBouton === "vert-plein-partage"
        ? "lcdp-button-primary"
        : couleurBouton === "vert-contour"
          ? "lcdp-button-secondary"
          : "lcdp-button-orange"
    );

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        conteneur.remove();
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", () => fermer(false));
      boutonOk.addEventListener("click", () => fermer(true));
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) fermer(false);
      });
    });
  }

  function changerMois(etatCalendrier, delta) {
    const date = new Date(etatCalendrier.annee, etatCalendrier.mois - 1 + delta, 1);
    etatCalendrier.annee = date.getFullYear();
    etatCalendrier.mois = date.getMonth() + 1;
  }

  function moisPlanningIdentique(etatPlanning, borne) {
  if (!etatPlanning || !borne) return false;

    return (
      Number(etatPlanning.annee) === Number(borne.annee) &&
      Number(etatPlanning.mois) === Number(borne.mois)
    );
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
    boutonOk.classList.remove("lcdp-button-primary");
    boutonOk.classList.add("lcdp-button-orange");

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
    const superposition = filtreParcOuvert;
    const conteneur = superposition ? document.createElement("div") : null;
    const slot = conteneur || document.getElementById("lcdp-lightbox-slot");

    if (!slot) return null;
    const fragment = await chargerDialogueFiltrePlanifier();
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-champ]");
    const titre = slot.querySelector("[data-lcdp-dialogue-champ-title]");
    const formulaire = slot.querySelector("[data-lcdp-dialogue-champ-form]");
    const zoneContent = slot.querySelector("[data-lcdp-dialogue-champ-content]");
    const erreur = slot.querySelector("[data-lcdp-dialogue-champ-error]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-champ-close]");
    const boutonAnnuler = slot.querySelector("[data-lcdp-dialogue-champ-cancel]");

    if (!dialogue || !titre || !formulaire || !zoneContent || !erreur || !boutonFermer) {
      throw new Error("Structure de dialogue champ incomplète.");
    }

    titre.textContent = options.titre || "";
    boutonAnnuler?.remove();
    for (const champ of options.champs || []) {
      zoneContent.appendChild(await creerChampDialogue(champ));
    }
    // Le dialogue complet apparaît en une seule fois (pas de flash du champ).
    if (conteneur) document.body.appendChild(conteneur);
    else document.getElementById("lcdp-lightbox-slot")?.replaceChildren(dialogue);

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        if (conteneur) conteneur.remove();
        else slot.innerHTML = "";
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", () => fermer(null));


      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) fermer(null);
      });

      formulaire.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (formulaire.dataset.lcdpVerificationEnCours === "true") return;

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

        if (typeof options.verifier === "function") {
          formulaire.dataset.lcdpVerificationEnCours = "true";
          const boutonValider = formulaire.querySelector('[type="submit"]');
          if (boutonValider) boutonValider.disabled = true;
          try {
            const message = await options.verifier(data);
            if (resolu) return;
            if (message) {
              erreur.textContent = String(message);
              erreur.hidden = false;
              return;
            }
          } catch (error) {
            if (resolu) return;
            erreur.textContent = error?.message || "Vérification momentanément indisponible.";
            erreur.hidden = false;
            return;
          } finally {
            delete formulaire.dataset.lcdpVerificationEnCours;
            if (boutonValider) boutonValider.disabled = false;
          }
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
    if (configurationChamp.placeholder) input.placeholder = configurationChamp.placeholder;

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
          abonne: membreAbonne()
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
    actualiserEspaceFooterReserver();
    window.setTimeout(actualiserEspaceFooterReserver, 250);
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

  async function chargerConstructeurFicheParc() {
    if (
      window.LCDP_FicheParc &&
      typeof window.LCDP_FicheParc.chargerFicheParc ===
        "function" &&
      typeof window.LCDP_FicheParc.monterDansConteneur ===
        "function" &&
      typeof window.LCDP_FicheParc.rendreDansConteneur ===
        "function" &&
      typeof window.LCDP_FicheParc.rendrePlanningDansConteneur ===
        "function"
    ) {
      return window.LCDP_FicheParc;
    }

    await chargerScriptPublicUneFois(
      "/ESPACE-PUBLIC/fiche-parc.js"
    );

    if (
      !window.LCDP_FicheParc ||
      typeof window.LCDP_FicheParc.chargerFicheParc !==
        "function" ||
      typeof window.LCDP_FicheParc.monterDansConteneur !==
        "function" ||
      typeof window.LCDP_FicheParc.rendreDansConteneur !==
        "function" ||
      typeof window.LCDP_FicheParc.rendrePlanningDansConteneur !==
        "function"
    ) {
      throw new Error(
        "Constructeur commun de la fiche parc introuvable."
      );
    }

    return window.LCDP_FicheParc;
  }

  function chargerScriptPublicUneFois(chemin) {
    const src = construireUrlPublic(chemin) +
      (chemin === "/ESPACE-PUBLIC/fiche-parc.js" ? "?v=20261028-fiche-v16" : "");
    const selecteur =
      'script[data-lcdp-script-public="' + chemin + '"]';
    const scriptExistant = document.querySelector(selecteur);

    if (scriptExistant) {
      if (window.LCDP_FicheParc) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        scriptExistant.addEventListener("load", resolve, {
          once: true
        });
        scriptExistant.addEventListener(
          "error",
          () => reject(
            new Error("Script public introuvable : " + chemin)
          ),
          { once: true }
        );
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.lcdpScriptPublic = chemin;
      script.onload = resolve;
      script.onerror = () => reject(
        new Error("Script public introuvable : " + chemin)
      );
      document.body.appendChild(script);
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

  function construireUrlImageParc(parc) {
    const departement = nettoyerDepartement(parc?.dptmt || parc?.departement || "");
    const dossierParc = normaliserNomParcPourChemin(parc?.nom || parc?.nomparc || "");

    if (!departement || !dossierParc) {
      return construireUrlObjet(DOSSIER_IMAGES_PARC_OBJET + "/parc-defaut.webp");
    }

    return construireUrlObjet(
      DOSSIER_IMAGES_PARC_OBJET +
      "/" + encodeURIComponent(departement) +
      "/" + encodeURIComponent(dossierParc) +
      "/" + NOM_IMAGE_CARD_PARC
    );
  }

  function normaliserNomParcPourChemin(valeur) {
    return String(valeur || "")
      .trim()
      .replace(/[ -]/g, "_");
  }

  function redirigerConnexionMembre(motif) {
    masquerPictowaitListeParcs();
    const separateur = PAGE_CONNEXION_MEMBRE.includes("?") ? "&" : "?";

    window.location.href =
      PAGE_CONNEXION_MEMBRE +
      separateur +
      "source=" +
      encodeURIComponent(SOURCE_PAGE) +
      "&session=" +
      encodeURIComponent(motif || "inactive");
  }

  function nettoyerEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
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

  function initialiserDescriptionResponsiveCardParc() {
    const actualiser = () => actualiserDescriptionsCardParc();

    if (
      typeof MEDIA_DESCRIPTION_CARD_PARC_TABLETTE_DESKTOP.addEventListener ===
      "function"
    ) {
      MEDIA_DESCRIPTION_CARD_PARC_TABLETTE_DESKTOP.addEventListener(
        "change",
        actualiser
      );
      return;
    }

    MEDIA_DESCRIPTION_CARD_PARC_TABLETTE_DESKTOP.addListener(actualiser);
  }

  function longueurDescriptionCardParc() {
    return MEDIA_DESCRIPTION_CARD_PARC_TABLETTE_DESKTOP.matches ? 140 : 100;
  }

  function actualiserDescriptionsCardParc() {
    const longueurMax = longueurDescriptionCardParc();

    document
      .querySelectorAll("[data-lcdp-card-parc-description]")
      .forEach((texte) => {
        const descriptionComplete = String(
          texte.dataset.lcdpDescriptionComplete || ""
        );

        rendreDescriptionCardParc(
          texte,
          nettoyerTexteCourt(descriptionComplete, longueurMax)
        );
        texte.hidden = !descriptionComplete;
      });
  }

  function rendreDescriptionCardParc(texte, description) {
    if (!texte) return;

    let contenu = texte.querySelector(
      "[data-lcdp-card-parc-description-texte]"
    );
    let icone = texte.querySelector(
      "[data-lcdp-card-parc-description-icone]"
    );

    if (!contenu) {
      contenu = document.createElement("span");
      contenu.dataset.lcdpCardParcDescriptionTexte = "";
      texte.prepend(contenu);
    }

    if (!icone) {
      icone = document.createElement("img");
      icone.className = "lcdp-box-card-parc__description-icone";
      icone.dataset.lcdpCardParcDescriptionIcone = "";
      icone.alt = "";
      icone.width = 15;
      icone.height = 15;
      icone.decoding = "async";
      icone.draggable = false;
      icone.setAttribute("aria-hidden", "true");
      texte.appendChild(icone);
    }

    contenu.textContent = description || "";
    icone.src = construireUrlObjet(
      "/IMAG/PICTO/picto-presentation.svg"
    );
    icone.hidden = !description;
  }

  function nettoyerTexteDescription(valeur) {
    return String(valeur || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nettoyerTexteCourt(valeur, longueurMax) {
    const texte = nettoyerTexteDescription(valeur);

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

  function formaterDateFr(dateIso) {
    if (!dateIso) return "";

    const date = new Date(dateIso + "T12:00:00");

    if (Number.isNaN(date.getTime())) return dateIso;

    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function formaterHeureAffichee(heure) {
    return String(heure || "").replace(":", "h");
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


  function appliquerRenduPlageLecture(slot, nomPlage, plage) {
    const plageOuverte = plage && plage.ouverte === true;

    if (!plageOuverte) {
      slot.style.visibility = "hidden";
      slot.title = construireTitrePlagePlanning(
        nomPlage,
        null
      );
      return;
    }

    slot.style.removeProperty("visibility");

    const couleurs = normaliserListeCouleursPlanning(plage);

    if (couleurs.length > 1) {
      slot.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois__slot--multicolore"
      );
      slot.style.setProperty(
        "--lcdp-plage-fond",
        construireDegradeCouleursPlanning(couleurs)
      );
    } else {
      slot.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois__slot--" +
        (couleurs[0] || "bleu-clair")
      );
    }

    const largeurJauge = normaliserLargeurJauge(plage?.jauge);

    if (largeurJauge > 0 && plageOuverte) {
      slot.classList.add(
        "lcdp-box-card-jour-in-calendrier-mois__slot--avec-jauge"
      );
      slot.style.setProperty(
        "--lcdp-jauge-largeur",
        largeurJauge + "%"
      );
    }

    slot.title = construireTitrePlagePlanning(
      nomPlage,
      plageOuverte ? plage : null
    );
  }

  function normaliserListeCouleursPlanning(plage) {
    const valeurs = Array.isArray(plage?.couleurs)
      ? plage.couleurs
      : [plage?.couleur];

    const couleursAutorisees = new Set([
      "bleu-clair",
      "bleu-fonce",
      "violet",
      "orange-clair",
      "orange-fonce"
    ]);

    const couleurs = valeurs
      .map(normaliserCouleurClasse)
      .filter((couleur) => couleursAutorisees.has(couleur));

    return couleurs.length ? couleurs : ["bleu-clair"];
  }

  function construireDegradeCouleursPlanning(couleurs) {
    const nombre = couleurs.length;
    const segments = [];

    couleurs.forEach((couleur, index) => {
      const debut = (index * 100) / nombre;
      const fin = ((index + 1) * 100) / nombre;
      const valeurCss = COULEURS_CSS_PLANNING[couleur] ||
        COULEURS_CSS_PLANNING["bleu-clair"];

      segments.push(
        valeurCss + " " + debut + "%",
        valeurCss + " " + fin + "%"
      );
    });

    return "linear-gradient(to right, " + segments.join(", ") + ")";
  }

  function normaliserLargeurJauge(value) {
    const largeur = Number(value);

    if (![0, 60, 80, 100].includes(largeur)) {
      return 0;
    }

    return largeur;
  }

  function construireTitrePlagePlanning(nomPlage, plage) {
    const numero = String(nomPlage || "").replace("plage", "");

    if (!plage || plage.ouverte !== true) {
      return "Plage " + numero + " fermée";
    }

    const categories = Array.isArray(plage.categories)
      ? plage.categories
      : [];

    const libellesCategories = categories.map((categorie) => {
      if (categorie === "DUO") return "Duo";
      if (categorie === "COACH") return "Coach";
      if (categorie === "FAMILLE") return "Famille";
      return String(categorie || "");
    }).filter(Boolean);

    const morceaux = [
      "Plage " + numero,
      plage.debut && plage.fin
        ? plage.debut + "–" + plage.fin
        : "horaire ouvert",
      libellesCategories.length
        ? libellesCategories.join(" + ")
        : "ouverte"
    ];

    if (plage.privatisation) {
      morceaux.push("privatisation");
    }

    const ratio = Number(plage.ratio);

    if (Number.isFinite(ratio) && ratio >= 0) {
      morceaux.push(
        "occupation " + Math.round(ratio * 100) + " %"
      );
    }

    return morceaux.join(" · ");
  }

  function normaliserCouleurClasse(couleur) {
    const valeur = String(couleur || "gris_clair")
      .trim()
      .toLowerCase()
      .replaceAll("_", "-");

    if (
      [
        "gris-moyen",
        "bleu-clair",
        "bleu-fonce",
        "violet",
        "orange-clair",
        "orange-fonce",
        "vert",
        "orange",
        "rouge-clair",
        "rouge",
        "gris-fonce",
        "gris-clair"
      ].includes(valeur)
    ) {
      return valeur;
    }

    if (valeur === "fonce") return "gris-fonce";
    return "gris-clair";
  }

  function lireCookie(nom) {
    return document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(nom + "="))
      ?.split("=")
      .slice(1)
      .join("=") || "";
  }

  function membreAbonne() {
    return Boolean(lireCookie("abonne"));
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
