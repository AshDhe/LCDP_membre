(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "abonnement-membre";

  const ENDPOINT_ABO_MEMBRE = construireEndpointApi(
    "workerAboMembreUrl",
    "WORKER_ABO_MEMBRE_URL",
    "abo-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_ABONNEMENT_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/abonnement-membre.html");
  const PAGE_REGLEMENT_CLUB = construireUrlPublic("/ESPACE-PUBLIC/reglement-club.html");
  const PAGE_REGLEMENT_APPLICATION = construireUrlPublic("/ESPACE-PUBLIC/reglement-app.html");

  const PARAMETRES_ABONNEMENT = {
    tauxTva: 20,
    maxInvitesFamille: 10,
    tarifsTtc: {
      duo: {
        "1J": null,
        "1M": null,
        "3M": null,
        "6M": null,
        "1A": null
      },
      famille: {
        "1J": null,
        "1M": null,
        "3M": null,
        "6M": null,
        "1A": null
      }
    },
    economiesPaiementComptantTtc: {
      duo: null,
      famille: null
    },
    echeancesPaiement: {
      duo: 2,
      famille: 3
    }
  };

  const DUREES_ABONNEMENT = [
    { code: "1J", label: "1 jour (1J)", type: "jour", jours: 1, mois: 0 },
    { code: "1M", label: "1 mois (1M)", type: "mois", jours: 0, mois: 1 },
    { code: "3M", label: "3 mois (3M)", type: "mois", jours: 0, mois: 3 },
    { code: "6M", label: "6 mois (6M)", type: "mois", jours: 0, mois: 6 },
    { code: "1A", label: "1 an (1A)", type: "mois", jours: 0, mois: 12 }
  ];

  let pageInitialisee = false;

  const etat = {
    abonnements: [],
    filtre: "encours",
    templateAbonnement: null,
    contexteWorkflow: null,
    calendrierMoisAffiche: null,
    workflow: creerWorkflowVide()
  };

  const titresFiltres = {
    encours: "Abonnement en cours",
    avenir: "Abonnements à venir",
    passe: "Abonnements passés"
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
      afficherEtatMembre();
      await initialiserBandeau();
      await initialiserFooter();
      await initialiserListeAbonnements();
      initialiserBoutonChoisirAbonnement();
      initialiserActionsListeAbonnement();
      document.addEventListener("click", gererClicDocument);
      await chargerAbonnements();
    } catch (error) {
      console.error("Erreur abonnement membre :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function afficherEtatMembre(abonneDepuisApi) {
    const mention = document.getElementById("mention-statut-membre");

    if (!mention) return;

    const abonne = typeof abonneDepuisApi === "boolean" ? abonneDepuisApi : membreAbonne();

    mention.textContent = abonne
      ? "[Vous êtes membre abonné]"
      : "[Vous êtes membre invité]";
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
  }

  async function initialiserListeAbonnements() {
    const slot = document.getElementById("lcdp-liste-card-abonnements-slot");

    if (!slot) {
      throw new Error("Slot liste des abonnements introuvable.");
    }

    const fragmentListe = await chargerFragmentObjet("/BOX/04-box-liste-card.html");
    slot.innerHTML = "";
    slot.appendChild(fragmentListe);

    const fragmentCard = await chargerFragmentObjet("/BOX/04-box-card-abonnement.html");
    etat.templateAbonnement = fragmentCard.querySelector("[data-lcdp-box-card-abonnement]");

    if (!etat.templateAbonnement) {
      throw new Error("Template card abonnement introuvable.");
    }

    actualiserTitreListe();
  }

  function initialiserBoutonChoisirAbonnement() {
    const bouton = document.getElementById("bouton-choisir-abonnement");

    if (!bouton) return;

    bouton.textContent = "Choisir mon nouvel abonnement";
    bouton.addEventListener("click", () => {
      demarrerWorkflowNouvelAbonnement().catch(async (error) => {
        console.error("Erreur workflow abonnement :", error);
        await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
      });
    });
  }

  function initialiserActionsListeAbonnement() {
    const zoneActions = document.querySelector("[data-lcdp-liste-card-actions]");

    if (!zoneActions) return;

    zoneActions.innerHTML = "";

    const boutonPasse = creerBoutonFiltre("Passé", "passe");
    const boutonAvenir = creerBoutonFiltre("À venir", "avenir");

    zoneActions.appendChild(boutonPasse);
    zoneActions.appendChild(boutonAvenir);
    actualiserBoutonsFiltre();
  }

  function creerBoutonFiltre(label, filtre) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-secondary";
    bouton.textContent = label;
    bouton.dataset.filtreAbonnement = filtre;

    bouton.addEventListener("click", () => {
      etat.filtre = etat.filtre === filtre ? "encours" : filtre;
      actualiserTitreListe();
      actualiserBoutonsFiltre();
      afficherAbonnements(etat.abonnements);
    });

    return bouton;
  }

  function actualiserTitreListe() {
    const titre = document.querySelector("[data-lcdp-liste-card-title]");

    if (titre) titre.textContent = titresFiltres[etat.filtre] || titresFiltres.encours;
  }

  function actualiserBoutonsFiltre() {
    document.querySelectorAll("[data-filtre-abonnement]").forEach((bouton) => {
      const filtre = bouton.dataset.filtreAbonnement;
      const actif = filtre === etat.filtre;

      bouton.setAttribute("aria-pressed", actif ? "true" : "false");

      if (actif) {
        bouton.textContent = "En cours";
      } else if (filtre === "passe") {
        bouton.textContent = "Passé";
      } else if (filtre === "avenir") {
        bouton.textContent = "À venir";
      }
    });
  }

  async function chargerAbonnements() {
    if (!ENDPOINT_ABO_MEMBRE) {
      afficherErreurListe("Le service abonnement membre n’est pas configuré.");
      return;
    }

    try {
      afficherChargementListe("Chargement de votre abonnement...");

      const reponse = await fetch(ENDPOINT_ABO_MEMBRE + "/mes-abonnements", {
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
        throw new Error(messageErreurApi(data, "Impossible de charger votre abonnement."));
      }

      if (typeof data.abonne === "boolean") {
        afficherEtatMembre(data.abonne);
      }

      etat.abonnements = Array.isArray(data.abonnements) ? data.abonnements : [];
      afficherAbonnements(etat.abonnements);
    } catch (error) {
      console.error("Erreur chargement abonnement membre :", error);
      afficherErreurListe(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function gererClicDocument(event) {
    const boutonProlonger = event.target.closest("[data-action='prolonger']");
    const boutonFacture = event.target.closest("[data-action='voir-facture']");

    if (boutonProlonger) {
      await afficherAlerte("Le workflow de changement d'abonnement sera raccordé ensuite.");
      return;
    }

    if (boutonFacture) {
      const card = boutonFacture.closest("[data-lcdp-box-card-abonnement]");
      await ouvrirFacture(card);
    }
  }

  async function demarrerWorkflowNouvelAbonnement() {
    etat.workflow = creerWorkflowVide();
    etat.workflow.etape = "type";
    await chargerContexteWorkflow();
    await afficherEtapeChoixTypeAbonnement();
  }

  function creerWorkflowVide() {
    return {
      etape: "type",
      typeAbonnement: "",
      emails: [],
      emailsMode: "nouveau",
      duree: "",
      dateDebut: "",
      dateFin: "",
      codeRemise: "",
      codeRemiseValide: false,
      dernierCodeRemiseValide: "",
      remise: null,
      typeaboPrix: "",
      tauxTva: PARAMETRES_ABONNEMENT.tauxTva,
      prixInitialTtc: null,
      prixNetTtc: null,
      ech: 1,
      mois1: null,
      mois2: null,
      mois3: null,
      vrmt: null,
      calendrierMoisAffiche: null,
      calendrierAnneeAffiche: null,
      paiement: {
        echeancier: "comptant",
        mode: "virement"
      }
    };
  }

  async function chargerContexteWorkflow() {
    if (!ENDPOINT_ABO_MEMBRE) {
      throw new Error("Le service abonnement membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_ABO_MEMBRE + "/contexte-nouvel-abonnement", {
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
      throw new Error(messageErreurApi(data, "Impossible de préparer la demande d'abonnement."));
    }

    etat.contexteWorkflow = data.contexte || {};

    if (Array.isArray(etat.contexteWorkflow.abonnements)) {
      etat.abonnements = etat.contexteWorkflow.abonnements;
      afficherAbonnements(etat.abonnements);
    }
  }

  async function afficherEtapeChoixTypeAbonnement() {
    etat.workflow.etape = "type";

    const valeur = await ouvrirDialogueChoix({
      titre: "",
      texte: "Choisir un abonnement",
      choix: [
        { label: "Duo", valeur: "duo" },
        { label: "Famille", valeur: "famille" }
      ],
      valeurInitiale: etat.workflow.typeAbonnement || "",
      boutonSuivant: "Suivant",
      boutonRetour: "",
      selectionObligatoire: true,
      onFermer: demanderQuitterWorkflow
    });

    if (!valeur) return;

    const typeAvant = etat.workflow.typeAbonnement || "";
    const typeChange = valeur !== typeAvant;

    etat.workflow.typeAbonnement = valeur;

    if (typeChange) {
      etat.workflow.emails = [];
      etat.workflow.emailsMode = "nouveau";
      etat.workflow.duree = "";
      etat.workflow.dateDebut = "";
      etat.workflow.dateFin = "";
      etat.workflow.calendrierMoisAffiche = null;
      etat.workflow.calendrierAnneeAffiche = null;
      reinitialiserPrixEtRemiseWorkflow();
    }

    if (valeur === "duo") {
      etat.workflow.emailsMode = "duo";
      await afficherEtapeEmailDuo();
      return;
    }

    preparerEmailsFamille();
    await afficherEtapeEmailsFamille();
  }

  function preparerEmailsFamille() {
    const contexte = etat.contexteWorkflow || {};
    const dernierAbonnementFamille = contexte.dernierAbonnementFamille === true;
    const emailsFamille = Array.isArray(contexte.emailsFamille)
      ? contexte.emailsFamille.map(nettoyerEmail).filter(Boolean).slice(0, PARAMETRES_ABONNEMENT.maxInvitesFamille)
      : [];

    if (etat.workflow.emailsMode === "famille-nouveau" && etat.workflow.emails.length) {
      return;
    }

    if (etat.workflow.emailsMode === "famille-existant") {
      if (dernierAbonnementFamille && etat.workflow.emails.length) return;
      etat.workflow.emails = [];
    }

    if (dernierAbonnementFamille && emailsFamille.length) {
      etat.workflow.emailsMode = "famille-existant";
      etat.workflow.emails = emailsFamille;
      return;
    }

    etat.workflow.emailsMode = "famille-nouveau";
    etat.workflow.emails = etat.workflow.emails.length ? etat.workflow.emails : [""];
  }

  async function afficherEtapeEmailDuo() {
    etat.workflow.etape = "emails-duo";

    const slot = await obtenirWorkflowAbonnementContenu();
    await preparerTransitionWorkflow(slot);

    const fragment = await chargerFragmentObjet("/BOX/04-box-dialogue-champ-inviter.html");
    slot.appendChild(fragment);

    const box = slot.querySelector("[data-lcdp-box-dialogue-champ-inviter]");
    const titre = slot.querySelector("[data-lcdp-dialogue-inviter-title]");
    const form = slot.querySelector("[data-lcdp-dialogue-inviter-form]");
    const input = slot.querySelector("[data-lcdp-dialogue-inviter-email]");
    const erreur = slot.querySelector("[data-lcdp-dialogue-inviter-error]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-inviter-close]");
    const boutonRetour = slot.querySelector("[data-lcdp-dialogue-inviter-back]");
    const boutonPasser = slot.querySelector("[data-lcdp-dialogue-inviter-skip]");
    const actions = slot.querySelector("[data-lcdp-dialogue-inviter-actions]");

    if (!box || !titre || !form || !input || !erreur || !boutonFermer || !boutonRetour || !boutonPasser || !actions) {
      throw new Error("Structure dialogue invité incomplète.");
    }

    appliquerClasseWorkflow(box, "email-duo");
    actions.classList.add("lcdp-workflow-abonnement__email-actions");

    titre.textContent = "Indiquez votre invité(e)";
    input.value = etat.workflow.emails[0] || "";
    boutonPasser.hidden = false;

    boutonRetour.addEventListener("click", afficherEtapeChoixTypeAbonnement);
    boutonPasser.addEventListener("click", async () => {
      etat.workflow.emails = [];
      await afficherEtapeChoixDuree();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const email = nettoyerEmail(input.value);

      if (!email) {
        await afficherAlerteSuperposee("Indiquez un e-mail ou passez cette étape.");
        input.focus();
        return;
      }

      if (!emailValide(email)) {
        afficherErreurChamp(erreur, "L'adresse e-mail saisie est invalide.");
        return;
      }

      etat.workflow.emails = [email];
      await afficherEtapeChoixDuree();
    });

    box.addEventListener("click", (event) => {
      if (event.target === box) demanderQuitterWorkflow();
    });

    input.focus();
  }

  async function afficherEtapeEmailsFamille() {
    etat.workflow.etape = "emails-famille";

    const modeExistant = etat.workflow.emailsMode === "famille-existant";
    const titre = "Indiquez vos invités famille";

    const slot = await obtenirWorkflowAbonnementContenu();
    await preparerTransitionWorkflow(slot);

    const fragment = await chargerFragmentObjet("/BOX/04-box-listemails.html");
    slot.appendChild(fragment);

    const box = slot.querySelector("[data-lcdp-box-card-listemails]");
    const titreElement = slot.querySelector("[data-lcdp-listemails-title]");
    const message = slot.querySelector("[data-lcdp-listemails-message]");
    const liste = slot.querySelector("[data-lcdp-listemails-list]");
    const actions = slot.querySelector("[data-lcdp-listemails-actions]") || document.createElement("div");
    const boutonFermer = slot.querySelector("[data-lcdp-listemails-close]");

    if (!box || !titreElement || !message || !liste) {
      throw new Error("Structure liste e-mails incomplète.");
    }

    appliquerClasseWorkflow(box, "emails-famille");
    actions.classList.add("lcdp-workflow-abonnement__emails-actions");

    if (!actions.parentNode) {
      box.querySelector(".lcdp-box-card-listemails__card")?.appendChild(actions);
    }

    titreElement.textContent = titre;
    liste.innerHTML = "";
    actions.innerHTML = "";
    message.hidden = true;
    message.textContent = "";

    const emails = preparerEmailsPourAffichageFamille(etat.workflow.emails, modeExistant);
    if (!emails.length) emails.push("");
    etat.workflow.emails = emails;

    for (let index = 0; index < etat.workflow.emails.length; index += 1) {
      liste.appendChild(await creerCardEmail(index, modeExistant));
    }

    if (!modeExistant) {
      const zoneAjouter = document.createElement("div");
      zoneAjouter.className = "lcdp-workflow-abonnement__actions-full";

      zoneAjouter.appendChild(creerBouton("Ajouter un invité famille", "lcdp-button-secondary", async () => {
        sauvegarderEmailsDepuisListe(liste);

        if (etat.workflow.emails.length >= PARAMETRES_ABONNEMENT.maxInvitesFamille) {
          await afficherAlerteSuperposee("10 e-mails maximum.");
          return;
        }

        etat.workflow.emails.push("");
        await afficherEtapeEmailsFamille();
      }));

      actions.appendChild(zoneAjouter);
    }

    const zoneNavigation = document.createElement("div");
    zoneNavigation.className = "lcdp-workflow-abonnement__actions-row";
    zoneNavigation.appendChild(creerBouton("Retour", "lcdp-button-secondary", afficherEtapeChoixTypeAbonnement));
    zoneNavigation.appendChild(creerBouton("Suivant", "lcdp-button-primary", async () => {
      sauvegarderEmailsDepuisListe(liste);

      const emailsValides = normaliserListeEmails(etat.workflow.emails);

      if (!emailsValides.length) {
        await afficherAlerteSuperposee("Vous devez indiquer au moins un e-mail invité pour l'abonnement Famille.");
        return;
      }

      const emailInvalide = emailsValides.find((email) => !emailValide(email));
      if (emailInvalide) {
        await afficherAlerteSuperposee("Un e-mail invité famille est invalide.");
        return;
      }

      etat.workflow.emails = emailsValides;
      await afficherEtapeChoixDuree();
    }));
    actions.appendChild(zoneNavigation);

    if (boutonFermer) boutonFermer.addEventListener("click", demanderQuitterWorkflow);
    box.addEventListener("click", (event) => {
      if (event.target === box) demanderQuitterWorkflow();
    });
  }

  async function creerCardEmail(index, modeExistant) {
    const fragment = await chargerFragmentObjet("/BOX/04-box-card-listemails.html");
    const card = fragment.querySelector("[data-lcdp-box-card-listemails-item]");
    const input = fragment.querySelector("[data-lcdp-card-listemails-email]");
    const boutonModifier = fragment.querySelector("[data-lcdp-card-listemails-modifier]");
    const boutonSupprimer = fragment.querySelector("[data-lcdp-card-listemails-supprimer]");

    if (!card || !input || !boutonModifier || !boutonSupprimer) {
      throw new Error("Structure card e-mail incomplète.");
    }

    card.dataset.index = String(index);
    input.value = etat.workflow.emails[index] || "";
    input.placeholder = "E-mail du membre invité";

    if (modeExistant) {
      input.readOnly = true;
      boutonModifier.hidden = false;
      boutonSupprimer.hidden = false;
      boutonModifier.addEventListener("click", async () => {
        const nouveau = await ouvrirDialogueModifierEmail(input.value);
        if (nouveau === null) return;
        input.value = nettoyerEmail(nouveau);
        etat.workflow.emails[index] = input.value;
      });

      boutonSupprimer.addEventListener("click", async () => {
        const ok = await afficherAlerteSuperposee("Supprimer cet invité famille ?");
        if (!ok) return;

        etat.workflow.emails.splice(index, 1);
        await afficherEtapeEmailsFamille();
      });
    } else {
      input.readOnly = false;
      boutonModifier.remove();
      boutonSupprimer.remove();
    }

    return card;
  }

  function sauvegarderEmailsDepuisListe(liste) {
    const emails = [];

    liste.querySelectorAll("[data-lcdp-card-listemails-email]").forEach((input) => {
      emails.push(nettoyerEmail(input.value));
    });

    etat.workflow.emails = emails;
  }

  function preparerEmailsPourAffichageFamille(source, modeExistant) {
    if (modeExistant) {
      return normaliserListeEmails(source);
    }

    const emails = Array.isArray(source)
      ? source.map(nettoyerEmail).slice(0, PARAMETRES_ABONNEMENT.maxInvitesFamille)
      : [];

    const dejaVus = new Set();
    const resultat = [];

    emails.forEach((email) => {
      if (!email) {
        resultat.push("");
        return;
      }

      if (dejaVus.has(email)) return;

      dejaVus.add(email);
      resultat.push(email);
    });

    return resultat.slice(0, PARAMETRES_ABONNEMENT.maxInvitesFamille);
  }

  async function ouvrirDialogueModifierEmail(valeurInitiale) {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const fragment = await chargerFragmentObjet("/BOX/04-box-dialogue-champ.html");
    container.appendChild(fragment);

    const dialogue = container.querySelector("[data-lcdp-box-dialogue-champ]");
    const titre = container.querySelector("[data-lcdp-dialogue-champ-title]");
    const formulaire = container.querySelector("[data-lcdp-dialogue-champ-form]");
    const zoneContent = container.querySelector("[data-lcdp-dialogue-champ-content]");
    const erreur = container.querySelector("[data-lcdp-dialogue-champ-error]");
    const boutonFermer = container.querySelector("[data-lcdp-dialogue-champ-close]");
    const boutonAnnuler = container.querySelector("[data-lcdp-dialogue-champ-cancel]");

    if (!dialogue || !titre || !formulaire || !zoneContent || !erreur || !boutonFermer || !boutonAnnuler) {
      container.remove();
      throw new Error("Structure dialogue champ incomplète.");
    }

    titre.textContent = "Modifier l'e-mail";

    const label = document.createElement("label");
    label.className = "lcdp-box-champ-formulaire__label";
    label.setAttribute("for", "email-famille-modifie");
    label.textContent = "E-mail du membre invité";

    const input = document.createElement("input");
    input.id = "email-famille-modifie";
    input.name = "email";
    input.type = "email";
    input.value = valeurInitiale || "";
    input.autocomplete = "email";

    zoneContent.appendChild(label);
    zoneContent.appendChild(input);

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        container.remove();
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
        fermer(input.value || "");
      });

      input.focus();
    });
  }

  async function afficherEtapeChoixDuree() {
    etat.workflow.etape = "duree";

    const dureeAvant = etat.workflow.duree || "";
    const valeur = await ouvrirDialogueChoix({
      titre: "",
      texte: "Durée du nouvel abonnement",
      choix: DUREES_ABONNEMENT.map((duree) => ({ label: duree.label, valeur: duree.code })),
      valeurInitiale: dureeAvant,
      boutonSuivant: "Suivant",
      boutonRetour: "Précédent",
      selectionObligatoire: true,
      onRetour: retourDepuisDuree,
      onFermer: demanderQuitterWorkflow
    });

    if (!valeur) return;

    const dureeChangee = valeur !== dureeAvant;
    etat.workflow.duree = valeur;

    if (dureeChangee) {
      etat.workflow.dateDebut = "";
      etat.workflow.dateFin = "";
      etat.workflow.calendrierMoisAffiche = null;
      etat.workflow.calendrierAnneeAffiche = null;
      reinitialiserPrixEtRemiseWorkflow();
    }

    if (valeur === "1J") {
      await afficherEtapeCalendrierJour();
      return;
    }

    await afficherEtapeCalendrierMois();
  }

  async function retourDepuisDuree() {
    if (etat.workflow.typeAbonnement === "duo") {
      await afficherEtapeEmailDuo();
      return;
    }

    await afficherEtapeEmailsFamille();
  }

  async function afficherEtapeCalendrierMois() {
    etat.workflow.etape = "calendrier-mois";

    const slot = await obtenirWorkflowAbonnementContenu();
    await preparerTransitionWorkflow(slot);

    const fragment = await chargerFragmentObjet("/BOX/04-box-calendrier-an.html");
    slot.appendChild(fragment);

    const box = slot.querySelector("[data-lcdp-box-calendrier-an]");
    const titre = slot.querySelector("[data-lcdp-calendrier-an-title]");
    const meta = slot.querySelector("[data-lcdp-calendrier-an-meta]");
    const message = slot.querySelector("[data-lcdp-calendrier-an-message]");
    const years = slot.querySelector("[data-lcdp-calendrier-an-years]");
    const boutonFermer = slot.querySelector("[data-lcdp-calendrier-an-close]");
    const boutonRetour = slot.querySelector("[data-lcdp-calendrier-an-back]");
    const boutonSuivant = slot.querySelector("[data-lcdp-calendrier-an-next]");

    if (!box || !titre || !meta || !message || !years || !boutonFermer || !boutonRetour || !boutonSuivant) {
      throw new Error("Structure calendrier année incomplète.");
    }

    appliquerClasseWorkflow(box, "calendrier-an");
    boutonSuivant.textContent = "Récapitulatif";

    titre.textContent = "Début du nouvel abonnement";
    meta.textContent = "Sélectionnez le mois de début du nouvel abonnement.";
    years.innerHTML = "";

    const maintenant = new Date();
    const anneeCourante = maintenant.getFullYear();
    const anneeMaximum = anneeCourante + 1;
    let dateDebutSelectionnee = lireDateLocale(etat.workflow.dateDebut);

    if (dateDebutSelectionnee) {
      const moisSelectionne = new Date(dateDebutSelectionnee.getFullYear(), dateDebutSelectionnee.getMonth(), 1);
      const horsLimite = dateDebutSelectionnee.getFullYear() < anneeCourante || dateDebutSelectionnee.getFullYear() > anneeMaximum;
      const desactive = !horsLimite && statutMoisAbonnement(moisSelectionne).disabled;

      if (horsLimite || desactive) {
        etat.workflow.dateDebut = "";
        etat.workflow.dateFin = "";
        dateDebutSelectionnee = null;
      }
    }

    const anneeInitiale = dateDebutSelectionnee ? dateDebutSelectionnee.getFullYear() : (etat.workflow.calendrierAnneeAffiche || anneeCourante);

    etat.workflow.calendrierAnneeAffiche = Math.min(
      Math.max(anneeInitiale, anneeCourante),
      anneeMaximum
    );

    const navigationAnnees = document.createElement("div");
    navigationAnnees.className = "lcdp-box-calendrier-an__navigation";

    const boutonAnneePrecedente = document.createElement("button");
    boutonAnneePrecedente.type = "button";
    boutonAnneePrecedente.className = "lcdp-box-calendrier-an__nav-button";
    boutonAnneePrecedente.setAttribute("aria-label", "Année précédente");
    boutonAnneePrecedente.textContent = "←";

    const anneeAffichee = document.createElement("h3");
    anneeAffichee.className = "lcdp-box-calendrier-an__current";

    const boutonAnneeSuivante = document.createElement("button");
    boutonAnneeSuivante.type = "button";
    boutonAnneeSuivante.className = "lcdp-box-calendrier-an__nav-button";
    boutonAnneeSuivante.setAttribute("aria-label", "Année suivante");
    boutonAnneeSuivante.textContent = "→";

    navigationAnnees.appendChild(boutonAnneePrecedente);
    navigationAnnees.appendChild(anneeAffichee);
    navigationAnnees.appendChild(boutonAnneeSuivante);
    years.parentNode.insertBefore(navigationAnnees, years);

    function actualiserBoutonSuivant() {
      const actif = Boolean(etat.workflow.dateDebut);
      boutonSuivant.disabled = !actif;
      boutonSuivant.setAttribute("aria-disabled", actif ? "false" : "true");
    }

    function afficherAnnee() {
      const annee = etat.workflow.calendrierAnneeAffiche;

      anneeAffichee.textContent = String(annee);
      boutonAnneePrecedente.disabled = annee <= anneeCourante;
      boutonAnneeSuivante.disabled = annee >= anneeMaximum;
      boutonAnneePrecedente.setAttribute("aria-disabled", boutonAnneePrecedente.disabled ? "true" : "false");
      boutonAnneeSuivante.setAttribute("aria-disabled", boutonAnneeSuivante.disabled ? "true" : "false");

      years.innerHTML = "";
      years.appendChild(creerBlocAnnee(annee, actualiserBoutonSuivant));
      actualiserBoutonSuivant();
    }

    boutonAnneePrecedente.addEventListener("click", () => {
      if (etat.workflow.calendrierAnneeAffiche <= anneeCourante) return;
      etat.workflow.calendrierAnneeAffiche -= 1;
      afficherAnnee();
    });

    boutonAnneeSuivante.addEventListener("click", () => {
      if (etat.workflow.calendrierAnneeAffiche >= anneeMaximum) return;
      etat.workflow.calendrierAnneeAffiche += 1;
      afficherAnnee();
    });

    boutonRetour.addEventListener("click", afficherEtapeChoixDuree);
    boutonSuivant.addEventListener("click", async () => {
      if (!etat.workflow.dateDebut) {
        afficherMessageInline(message, "Merci de sélectionner un mois de début.");
        return;
      }

      try {
        calculerDatesWorkflow();
        await afficherEtapeRecapitulatif();
      } catch (error) {
        console.error(error);
        await afficherErreurAction(error);
      }
    });

    box.addEventListener("click", (event) => {
      if (event.target === box) demanderQuitterWorkflow();
    });

    afficherAnnee();
  }

  function creerBlocAnnee(annee, onSelectionMois) {
    const section = document.createElement("section");
    section.className = "lcdp-box-calendrier-an__year";

    const mois = document.createElement("div");
    mois.className = "lcdp-box-calendrier-an__months";
    section.appendChild(mois);

    for (let indexMois = 0; indexMois < 12; indexMois += 1) {
      const debutMois = new Date(annee, indexMois, 1);
      const statut = statutMoisAbonnement(debutMois);

      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-box-calendrier-an__month";
      bouton.textContent = nomMois(debutMois);
      bouton.dataset.dateDebut = dateIsoLocale(debutMois);
      bouton.disabled = statut.disabled;
      bouton.title = statut.raison || "";
      bouton.setAttribute("aria-pressed", etat.workflow.dateDebut === bouton.dataset.dateDebut ? "true" : "false");

      if (statut.type === "incompatible") {
        bouton.classList.add("lcdp-box-calendrier-an__month--incompatible");
      }

      bouton.addEventListener("click", () => {
        etat.workflow.dateDebut = bouton.dataset.dateDebut;
        etat.workflow.dateFin = "";

        document.querySelectorAll("[data-lcdp-box-calendrier-an] .lcdp-box-calendrier-an__month").forEach((element) => {
          element.setAttribute("aria-pressed", element === bouton ? "true" : "false");
        });

        if (typeof onSelectionMois === "function") {
          onSelectionMois();
        }
      });

      mois.appendChild(bouton);
    }

    return section;
  }

  function statutMoisAbonnement(debutMois) {
    const maintenant = new Date();
    const premierMoisCourant = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const duree = obtenirDuree(etat.workflow.duree);
    const finCandidate = finAbonnementDepuisDebut(debutMois, duree);
    const finCourante = finAbonnementEnCours();
    const abonnements = Array.isArray(etat.abonnements) ? etat.abonnements : [];

    if (debutMois <= premierMoisCourant) {
      return { disabled: true, type: "passe", raison: debutMois < premierMoisCourant ? "Mois passé" : "Mois en cours" };
    }

    if (finCourante && debutMois <= finCourante) {
      return { disabled: true, type: "occupe", raison: "Abonnement en cours" };
    }

    const chevauchement = abonnements.find((abonnement) => {
      const debut = debutMoisDate(abonnement.debut);
      const fin = finMoisDate(abonnement.fin);
      if (!debut || !fin) return false;
      return plagesSeChevauchent(debutMois, finCandidate, debut, fin);
    });

    if (!chevauchement) {
      return { disabled: false, type: "libre", raison: "" };
    }

    const debutChevauchement = debutMoisDate(chevauchement.debut);
    const finChevauchement = finMoisDate(chevauchement.fin);
    const moisLuiMemeOccupe = debutChevauchement && finChevauchement && plagesSeChevauchent(debutMois, finMoisDate(debutMois), debutChevauchement, finChevauchement);

    return {
      disabled: true,
      type: moisLuiMemeOccupe ? "occupe" : "incompatible",
      raison: moisLuiMemeOccupe ? "Mois déjà occupé" : "Durée incompatible avec un abonnement à venir"
    };
  }

  async function afficherEtapeCalendrierJour() {
    etat.workflow.etape = "calendrier-jour";

    const slot = await obtenirWorkflowAbonnementContenu();
    await preparerTransitionWorkflow(slot);

    const fragment = await chargerFragmentObjet("/BOX/04-box-calendrier-mois.html");
    slot.appendChild(fragment);

    const box = slot.querySelector("[data-lcdp-box-calendrier-mois]");
    const titre = slot.querySelector("[data-lcdp-calendrier-mois-title]");
    const meta = slot.querySelector("[data-lcdp-calendrier-mois-meta]");
    const current = slot.querySelector("[data-lcdp-calendrier-mois-current]");
    const prev = slot.querySelector("[data-lcdp-calendrier-mois-prev]");
    const next = slot.querySelector("[data-lcdp-calendrier-mois-next]");
    const grid = slot.querySelector("[data-lcdp-calendrier-mois-grid]");
    const message = slot.querySelector("[data-lcdp-calendrier-mois-message]");
    const boutonFermer = slot.querySelector("[data-lcdp-calendrier-mois-close]");

    if (!box || !titre || !meta || !current || !prev || !next || !grid || !message || !boutonFermer) {
      throw new Error("Structure calendrier mois incomplète.");
    }

    appliquerClasseWorkflow(box, "calendrier-mois");
    box.classList.add("lcdp-box-calendrier-mois--abonnement");

    titre.textContent = "Début du nouvel abonnement";
    meta.textContent = "Sélectionnez le jour du nouvel abonnement.";

    const maintenant = new Date();
    const moisMinimum = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const moisMaximum = new Date(maintenant.getFullYear() + 1, 11, 1);
    const dateMaximum = new Date(maintenant.getFullYear() + 1, 11, 31, 23, 59, 59, 999);

    const dateDebutSelectionnee = lireDateLocale(etat.workflow.dateDebut);
    if (dateDebutSelectionnee && (dateDebutSelectionnee < debutJour(maintenant) || dateDebutSelectionnee > dateMaximum)) {
      etat.workflow.dateDebut = "";
      etat.workflow.dateFin = "";
    }

    etat.workflow.calendrierMoisAffiche = bornerMoisCalendrier(
      etat.workflow.calendrierMoisAffiche ||
      (dateDebutSelectionnee ? new Date(dateDebutSelectionnee.getFullYear(), dateDebutSelectionnee.getMonth(), 1) : moisMinimum),
      moisMinimum,
      moisMaximum
    );

    const footer = document.createElement("div");
    footer.className = "lcdp-box-calendrier-mois-abonnement__actions";

    const boutonRetour = creerBouton("Précédent", "lcdp-button-secondary", afficherEtapeChoixDuree);
    const boutonSuivant = creerBouton("Récapitulatif", "lcdp-button-primary", async () => {
      if (!etat.workflow.dateDebut) {
        await afficherAlerteSuperposee("Merci de sélectionner un jour de début.");
        return;
      }

      calculerDatesWorkflow();
      await afficherEtapeRecapitulatif();
    });

    footer.appendChild(boutonRetour);
    footer.appendChild(boutonSuivant);
    box.querySelector(".lcdp-box-calendrier-mois__card").appendChild(footer);

    function actualiserBoutonSuivant() {
      const actif = Boolean(etat.workflow.dateDebut);
      boutonSuivant.disabled = !actif;
      boutonSuivant.setAttribute("aria-disabled", actif ? "false" : "true");
    }

    function actualiserNavigation() {
      const moisAffiche = etat.workflow.calendrierMoisAffiche;
      const auMinimum = moisAffiche.getFullYear() === moisMinimum.getFullYear() && moisAffiche.getMonth() === moisMinimum.getMonth();
      const auMaximum = moisAffiche.getFullYear() === moisMaximum.getFullYear() && moisAffiche.getMonth() === moisMaximum.getMonth();

      prev.disabled = auMinimum;
      next.disabled = auMaximum;
      prev.setAttribute("aria-disabled", auMinimum ? "true" : "false");
      next.setAttribute("aria-disabled", auMaximum ? "true" : "false");
    }

    function afficherMois() {
      const moisAffiche = etat.workflow.calendrierMoisAffiche;
      current.textContent = moisAffiche.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      grid.innerHTML = "";

      const premierJour = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), 1);
      const dernierJour = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + 1, 0);
      const decalage = (premierJour.getDay() + 6) % 7;

      for (let index = 0; index < decalage; index += 1) {
        const vide = document.createElement("button");
        vide.type = "button";
        vide.disabled = true;
        vide.className = "lcdp-box-calendrier-mois-abonnement__day lcdp-box-calendrier-mois-abonnement__day--empty";
        vide.setAttribute("aria-hidden", "true");
        grid.appendChild(vide);
      }

      for (let jour = 1; jour <= dernierJour.getDate(); jour += 1) {
        const date = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), jour);
        const statut = statutJourAbonnement(date);
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-box-calendrier-mois-abonnement__day";
        bouton.textContent = String(jour);
        bouton.dataset.dateDebut = dateIsoLocale(date);
        bouton.disabled = statut.disabled;
        bouton.title = statut.raison || "";
        bouton.setAttribute("aria-pressed", etat.workflow.dateDebut === bouton.dataset.dateDebut ? "true" : "false");
        bouton.addEventListener("click", () => {
          etat.workflow.dateDebut = bouton.dataset.dateDebut;
          etat.workflow.dateFin = bouton.dataset.dateDebut;

          grid.querySelectorAll(".lcdp-box-calendrier-mois-abonnement__day").forEach((element) => {
            element.setAttribute("aria-pressed", element === bouton ? "true" : "false");
          });

          actualiserBoutonSuivant();
        });
        grid.appendChild(bouton);
      }

      actualiserNavigation();
      actualiserBoutonSuivant();
    }

    prev.addEventListener("click", () => {
      if (prev.disabled) return;
      const mois = etat.workflow.calendrierMoisAffiche;
      etat.workflow.calendrierMoisAffiche = bornerMoisCalendrier(new Date(mois.getFullYear(), mois.getMonth() - 1, 1), moisMinimum, moisMaximum);
      afficherMois();
    });

    next.addEventListener("click", () => {
      if (next.disabled) return;
      const mois = etat.workflow.calendrierMoisAffiche;
      etat.workflow.calendrierMoisAffiche = bornerMoisCalendrier(new Date(mois.getFullYear(), mois.getMonth() + 1, 1), moisMinimum, moisMaximum);
      afficherMois();
    });

    box.addEventListener("click", (event) => {
      if (event.target === box) demanderQuitterWorkflow();
    });

    afficherMois();
  }

  function bornerMoisCalendrier(mois, moisMinimum, moisMaximum) {
    const candidat = mois instanceof Date && !Number.isNaN(mois.getTime())
      ? new Date(mois.getFullYear(), mois.getMonth(), 1)
      : new Date(moisMinimum.getFullYear(), moisMinimum.getMonth(), 1);

    if (candidat < moisMinimum) return new Date(moisMinimum.getFullYear(), moisMinimum.getMonth(), 1);
    if (candidat > moisMaximum) return new Date(moisMaximum.getFullYear(), moisMaximum.getMonth(), 1);

    return candidat;
  }

  function statutJourAbonnement(date) {
    const maintenant = new Date();
    const aujourdHui = debutJour(maintenant);
    const dateMaximum = new Date(maintenant.getFullYear() + 1, 11, 31, 23, 59, 59, 999);
    const finCourante = finAbonnementEnCours();
    const abonnements = Array.isArray(etat.abonnements) ? etat.abonnements : [];

    if (date < aujourdHui) {
      return { disabled: true, raison: "Date passée" };
    }

    if (date > dateMaximum) {
      return { disabled: true, raison: "Date trop lointaine" };
    }

    if (finCourante && date <= finCourante) {
      return { disabled: true, raison: "Abonnement en cours" };
    }

    const occupe = abonnements.some((abonnement) => {
      const debut = debutJourDate(abonnement.debut);
      const fin = finJourDate(abonnement.fin);
      if (!debut || !fin) return false;
      return date >= debut && date <= fin;
    });

    if (occupe) {
      return { disabled: true, raison: "Date déjà occupée" };
    }

    return { disabled: false, raison: "" };
  }

  async function afficherEtapeRecapitulatif() {
    etat.workflow.etape = "recap";
    await calculerPrixWorkflow();

    const slot = await obtenirWorkflowAbonnementContenu();
    await preparerTransitionWorkflow(slot);

    const fragment = await chargerFragmentObjet("/BOX/04-box-card-recaporder.html");
    slot.appendChild(fragment);

    const box = slot.querySelector("[data-lcdp-box-card-recaporder]");
    const boutonRetour = slot.querySelector("[data-lcdp-recaporder-back]");
    const boutonAnnuler = slot.querySelector("[data-lcdp-recaporder-cancel]");
    const boutonPayer = slot.querySelector("[data-lcdp-recaporder-pay]");
    const boutonValiderCode = slot.querySelector("[data-lcdp-recaporder-valider-code]");
    const inputCode = slot.querySelector("[data-lcdp-recaporder-code-remise]");
    const message = slot.querySelector("[data-lcdp-recaporder-message]");

    if (!box || !boutonRetour || !boutonAnnuler || !boutonPayer || !boutonValiderCode || !inputCode || !message) {
      throw new Error("Structure récapitulatif incomplète.");
    }

    appliquerClasseWorkflow(box, "recapitulatif");

    remplirRecapitulatif(slot);

    inputCode.value = etat.workflow.codeRemise || "";
    boutonValiderCode.disabled = etat.workflow.codeRemiseValide && etat.workflow.dernierCodeRemiseValide === nettoyerCodeRemise(inputCode.value);

    inputCode.addEventListener("input", () => {
      const code = nettoyerCodeRemise(inputCode.value);
      boutonValiderCode.disabled = etat.workflow.codeRemiseValide && etat.workflow.dernierCodeRemiseValide === code;
    });

    boutonValiderCode.addEventListener("click", async () => {
      const code = nettoyerCodeRemise(inputCode.value);

      if (!code) {
        afficherMessageInline(message, "Merci de renseigner un code remise.");
        return;
      }

      try {
        await verifierCodeRemise(code);
        boutonValiderCode.disabled = true;
        await afficherEtapeRecapitulatif();
      } catch (error) {
        afficherMessageInline(message, error.message || "Code remise non applicable.");
      }
    });

    boutonAnnuler.addEventListener("click", demanderQuitterWorkflow);
    boutonRetour.addEventListener("click", async () => {
      if (etat.workflow.duree === "1J") {
        await afficherEtapeCalendrierJour();
        return;
      }

      await afficherEtapeCalendrierMois();
    });
    boutonPayer.addEventListener("click", async () => {
      if (paiementCbDirectDepuisRecapitulatif()) {
        await demarrerPaiementStripe();
        return;
      }

      await afficherEtapePaiement();
    });

    box.addEventListener("click", (event) => {
      if (event.target === box) demanderQuitterWorkflow();
    });
  }

  function remplirRecapitulatif(racine) {
    const workflow = etat.workflow;
    const typeLabel = libelleTypeAbonnement(workflow.typeAbonnement);
    const dureeLabel = libelleDuree(workflow.duree);
    const tauxTva = nombreOuNull(workflow.tauxTva) ?? PARAMETRES_ABONNEMENT.tauxTva;
    const tvaLabel = "(TVA " + String(tauxTva).replace(".", ",") + "%)";

    remplirTexte(racine, "[data-lcdp-recaporder-abonnement]", typeLabel + " - " + dureeLabel);
    remplirTexte(racine, "[data-lcdp-recaporder-debut]", formaterDate(workflow.dateDebut));
    remplirTexte(racine, "[data-lcdp-recaporder-fin]", formaterDate(workflow.dateFin) + " inclus");
    remplirTexte(racine, "[data-lcdp-recaporder-prix-initial]", formaterMontantOuNonConfigure(workflow.prixInitialTtc));
    remplirTexte(racine, "[data-lcdp-recaporder-prix-net]", formaterMontantOuNonConfigure(workflow.prixNetTtc));
    remplirTexte(racine, "[data-lcdp-recaporder-tva-label]", tvaLabel);
    remplirTexte(racine, "[data-lcdp-recaporder-tva-net-label]", tvaLabel);

    const invitesLabel = racine.querySelector("[data-lcdp-recaporder-invites-label]");
    const invitesElement = racine.querySelector("[data-lcdp-recaporder-invites]");
    const emails = normaliserListeEmails(workflow.emails);

    if (invitesLabel && invitesElement) {
      if (workflow.typeAbonnement === "famille") {
        const nombre = emails.length;
        const pluriel = nombre > 1 ? "s" : "";
        invitesLabel.textContent = "Invité(s) Famille";
        invitesElement.textContent = nombre
          ? String(nombre) + " invité" + pluriel + " : " + emails.join(", ")
          : "-";
      } else {
        invitesLabel.textContent = "Invité Duo";
        invitesElement.textContent = emails[0] || "-";
      }
    }

    const lienClub = racine.querySelector("[data-lcdp-recaporder-reglement-club]");
    const lienApplication = racine.querySelector("[data-lcdp-recaporder-reglement-application]");

    if (lienClub) lienClub.href = PAGE_REGLEMENT_CLUB;
    if (lienApplication) lienApplication.href = PAGE_REGLEMENT_APPLICATION;
  }

  async function verifierCodeRemise(code) {
    if (!ENDPOINT_ABO_MEMBRE) {
      throw new Error("Le service abonnement membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_ABO_MEMBRE + "/verifier-remise", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(creerPayloadCommande({ codeRemise: code }))
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Code remise non applicable."));
    }

    etat.workflow.codeRemise = code;
    etat.workflow.codeRemiseValide = true;
    etat.workflow.dernierCodeRemiseValide = code;
    etat.workflow.remise = data.remise || null;
    etat.workflow.typeaboPrix = data.typeaboPrix || data.typeabo || etat.workflow.typeaboPrix || "";
    etat.workflow.tauxTva = nombreOuNull(data.txtvafr ?? data.tauxTva ?? data.tva ?? etat.workflow.tauxTva) ?? PARAMETRES_ABONNEMENT.tauxTva;
    etat.workflow.prixInitialTtc = nombreOuNull(data.prixInitialTtc ?? data.prixabottc ?? etat.workflow.prixInitialTtc);
    etat.workflow.prixNetTtc = nombreOuNull(data.prixNetTtc ?? data.prix_net_ttc ?? etat.workflow.prixNetTtc);
    etat.workflow.ech = entierOuDefaut(data.ech ?? etat.workflow.ech, 1);
    etat.workflow.mois1 = nombreOuNull(data.mois1 ?? etat.workflow.mois1);
    etat.workflow.mois2 = nombreOuNull(data.mois2 ?? etat.workflow.mois2);
    etat.workflow.mois3 = nombreOuNull(data.mois3 ?? etat.workflow.mois3);
    etat.workflow.vrmt = nombreOuNull(data.vrmt ?? etat.workflow.vrmt);
  }

  function paiementCbDirectDepuisRecapitulatif() {
    const nbEcheances = Math.max(1, entierOuDefaut(etat.workflow.ech, 1));

    return nbEcheances <= 1;
  }

  async function demarrerPaiementStripe() {
    etat.workflow.paiement.echeancier = "comptant";
    etat.workflow.paiement.mode = "cb";

    await afficherAlerteSuperposee("Le paiement Stripe sera raccordé ensuite.");
    await afficherEtapeRecapitulatif();
  }

  async function afficherEtapePaiement() {
    if (!montantValide(etat.workflow.prixNetTtc)) {
      await afficherAlerteSuperposee("Le tarif de cet abonnement n'est pas configuré.");
      return;
    }

    etat.workflow.etape = "paiement";

    const slot = await obtenirWorkflowAbonnementContenu();
    await preparerTransitionWorkflow(slot);

    const fragment = await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = slot.querySelector("[data-lcdp-dialogue-title]");
    const texte = slot.querySelector("[data-lcdp-dialogue-text]");
    const actions = slot.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      throw new Error("Structure dialogue paiement incomplète.");
    }

    appliquerClasseWorkflow(dialogue, "paiement");

    titre.textContent = "Mode de paiement";
    texte.textContent = "";
    texte.hidden = true;
    actions.innerHTML = "";

    const zone = document.createElement("div");
    zone.className = "lcdp-workflow-paiement";

    const nbEcheances = Math.max(1, entierOuDefaut(etat.workflow.ech, 1));
    if (nbEcheances <= 1 && etat.workflow.paiement.echeancier === "echelonne") {
      etat.workflow.paiement.echeancier = "comptant";
    }

    zone.appendChild(creerOptionRadioPaiement({
      name: "echeancier-abonnement",
      value: "comptant",
      checked: etat.workflow.paiement.echeancier !== "echelonne",
      label: "Payer en 1x",
      detail: "Montant : " + formaterMontant(etat.workflow.prixNetTtc)
    }));

    if (nbEcheances > 1) {
      zone.appendChild(creerOptionRadioPaiement({
        name: "echeancier-abonnement",
        value: "echelonne",
        checked: etat.workflow.paiement.echeancier === "echelonne",
        label: "Payer en " + String(nbEcheances) + "x sans frais",
        detail: calculerEcheancesPaiementDepuisPrix().join(" / ")
      }));
    }

    zone.appendChild(creerOptionRadioPaiement({
      name: "mode-paiement-abonnement",
      value: "virement",
      checked: etat.workflow.paiement.mode === "virement",
      label: "Payer par virement",
      detail: detailPaiementVirement()
    }));

    zone.appendChild(creerOptionRadioPaiement({
      name: "mode-paiement-abonnement",
      value: "cb",
      checked: etat.workflow.paiement.mode === "cb",
      label: "Payer par CB",
      detail: ""
    }));

    const confirmationLabel = document.createElement("label");
    confirmationLabel.className = "lcdp-workflow-paiement__check";

    const confirmation = document.createElement("input");
    confirmation.type = "checkbox";
    confirmation.dataset.confirmationPaiement = "1";
    confirmationLabel.appendChild(confirmation);
    confirmationLabel.append("Mon abonnement n'est pas utilisable tant que je ne respecte pas les échéances de paiement.");
    zone.appendChild(confirmationLabel);

    const message = document.createElement("p");
    message.className = "lcdp-workflow-paiement__message";
    message.hidden = true;
    zone.appendChild(message);

    actions.appendChild(zone);
    actions.appendChild(creerBouton("Payer", "lcdp-button-primary", async () => {
      lireOptionsPaiementDepuisDialogue(slot);

      if (!confirmation.checked) {
        await afficherAlerteSuperposee("Vous devez cocher la case d'acceptation d'utilisation de l'abonnement.");
        return;
      }

      if (etat.workflow.paiement.mode === "cb") {
        await demarrerPaiementStripe();
        return;
      }

      await enregistrerCommandeVirement();
    }));
    actions.appendChild(creerBouton("Annuler", "lcdp-button-secondary", demanderQuitterWorkflow));
    actions.appendChild(creerBouton("Précédent", "lcdp-button-secondary", afficherEtapeRecapitulatif));

    synchroniserOptionsPaiement(slot);

    slot.querySelectorAll("input[name='echeancier-abonnement'], input[name='mode-paiement-abonnement']").forEach((input) => {
      input.addEventListener("change", () => {
        lireOptionsPaiementDepuisDialogue(slot);
        synchroniserOptionsPaiement(slot);
      });
    });

    boutonFermer.addEventListener("click", demanderQuitterWorkflow);
    dialogue.addEventListener("click", (event) => {
      if (event.target === dialogue) demanderQuitterWorkflow();
    });
  }

  function creerOptionRadioPaiement(options) {
    const label = document.createElement("label");
    label.className = "lcdp-workflow-paiement__option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = options.name;
    input.value = options.value;
    input.checked = options.checked === true;

    const texte = document.createElement("span");
    texte.className = "lcdp-workflow-paiement__option-text";
    texte.textContent = options.label || "";

    const detail = document.createElement("small");
    detail.textContent = options.detail || "";

    label.appendChild(input);
    label.appendChild(texte);
    if (options.detail) label.appendChild(detail);

    return label;
  }

  function lireOptionsPaiementDepuisDialogue(racine) {
    const echeancier = racine.querySelector("input[name='echeancier-abonnement']:checked")?.value || "comptant";
    let mode = racine.querySelector("input[name='mode-paiement-abonnement']:checked")?.value || "virement";

    if (echeancier === "echelonne") {
      mode = "cb";
    }

    etat.workflow.paiement.echeancier = echeancier;
    etat.workflow.paiement.mode = mode;
  }

  function synchroniserOptionsPaiement(racine) {
    const nbEcheances = Math.max(1, entierOuDefaut(etat.workflow.ech, 1));
    let echeancier = etat.workflow.paiement.echeancier || "comptant";
    const virement = racine.querySelector("input[name='mode-paiement-abonnement'][value='virement']");
    const cb = racine.querySelector("input[name='mode-paiement-abonnement'][value='cb']");

    if (!virement || !cb) return;

    if (nbEcheances <= 1 && echeancier === "echelonne") {
      echeancier = "comptant";
      etat.workflow.paiement.echeancier = "comptant";
    }

    if (echeancier === "echelonne") {
      virement.checked = false;
      virement.disabled = true;
      cb.checked = true;
      etat.workflow.paiement.mode = "cb";
    } else {
      virement.disabled = false;

      if (!virement.checked && !cb.checked) {
        virement.checked = true;
        etat.workflow.paiement.mode = "virement";
      }
    }

    racine.querySelectorAll(".lcdp-workflow-paiement__option").forEach((option) => {
      const input = option.querySelector("input[type='radio']");
      option.classList.toggle("lcdp-workflow-paiement__option--selected", Boolean(input && input.checked));
      option.classList.toggle("lcdp-workflow-paiement__option--disabled", Boolean(input && input.disabled));
    });
  }

  async function enregistrerCommandeVirement() {
    if (!ENDPOINT_ABO_MEMBRE) {
      throw new Error("Le service abonnement membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_ABO_MEMBRE + "/enregistrer-commande-virement", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(creerPayloadCommande())
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible d'enregistrer la commande."));
    }

    await afficherAlerte(
      "La commande d'abonnement est enregistrée sous le n° " +
      String(data.orderid || data.commande?.orderid || "") +
      ". Le récapitulatif a été envoyé par mail avec le RIB de l'association et le rappel des règles de paiement par virement : 1. Indiquer le montant de la commande dans l'objet du virement. 2. Payer dans les 10 jours."
    );

    window.location.href = PAGE_ABONNEMENT_MEMBRE;
  }

  function creerPayloadCommande(extra = {}) {
    calculerDatesWorkflow();

    return {
      typeAbonnement: etat.workflow.typeAbonnement,
      typabo: etat.workflow.typeAbonnement,
      typeaboPrix: etat.workflow.typeaboPrix,
      duree: etat.workflow.duree,
      debut: etat.workflow.dateDebut,
      fin: etat.workflow.dateFin,
      emails: normaliserListeEmails(etat.workflow.emails),
      tva: etat.workflow.tauxTva,
      txtvafr: etat.workflow.tauxTva,
      prixInitialTtc: etat.workflow.prixInitialTtc,
      prixNetTtc: etat.workflow.prixNetTtc,
      ech: etat.workflow.ech,
      mois1: etat.workflow.mois1,
      mois2: etat.workflow.mois2,
      mois3: etat.workflow.mois3,
      vrmt: etat.workflow.vrmt,
      codeRemise: etat.workflow.codeRemise,
      remise: etat.workflow.remise,
      paiement: etat.workflow.paiement,
      ...extra
    };
  }

  function creerPayloadPrix(extra = {}) {
    calculerDatesWorkflow();

    return {
      typeAbonnement: etat.workflow.typeAbonnement,
      typabo: etat.workflow.typeAbonnement,
      duree: etat.workflow.duree,
      debut: etat.workflow.dateDebut,
      fin: etat.workflow.dateFin,
      emails: normaliserListeEmails(etat.workflow.emails),
      codeRemise: etat.workflow.codeRemiseValide ? etat.workflow.dernierCodeRemiseValide : "",
      ...extra
    };
  }

  function calculerDatesWorkflow() {
    const debut = lireDateLocale(etat.workflow.dateDebut);
    if (!debut) return;

    const duree = obtenirDuree(etat.workflow.duree);
    const fin = finAbonnementDepuisDebut(debut, duree);

    etat.workflow.dateDebut = dateIsoLocale(debut);
    etat.workflow.dateFin = dateIsoLocale(fin);
  }

  async function calculerPrixWorkflow() {
    if (!ENDPOINT_ABO_MEMBRE) {
      throw new Error("Le service abonnement membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_ABO_MEMBRE + "/calculer-prix", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(creerPayloadPrix())
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return;
    }

    if (!reponse.ok || !data || !reponseApiOk(data)) {
      throw new Error(messageErreurApi(data, "Impossible de calculer le prix de l'abonnement."));
    }

    const prixInitial = nombreOuNull(data.prixInitialTtc ?? data.prixabottc);
    const tauxTva = nombreOuNull(data.txtvafr ?? data.tauxTva ?? data.tva) ?? PARAMETRES_ABONNEMENT.tauxTva;

    etat.workflow.typeaboPrix = data.typeaboPrix || data.typeabo || "";
    etat.workflow.tauxTva = tauxTva;
    etat.workflow.prixInitialTtc = prixInitial;
    etat.workflow.ech = entierOuDefaut(data.ech, 1);
    etat.workflow.mois1 = nombreOuNull(data.mois1);
    etat.workflow.mois2 = nombreOuNull(data.mois2);
    etat.workflow.mois3 = nombreOuNull(data.mois3);
    etat.workflow.vrmt = nombreOuNull(data.vrmt);

    if (etat.workflow.remise && montantValide(etat.workflow.remise.prixNetTtc)) {
      etat.workflow.prixNetTtc = nombreOuNull(etat.workflow.remise.prixNetTtc);
      return;
    }

    const pourcentRemise = nombreOuNull(etat.workflow.remise?.pourcent ?? etat.workflow.remise?.pourcentage) || 0;
    etat.workflow.prixNetTtc = prixInitial === null
      ? null
      : arrondirMontant(prixInitial * (1 - pourcentRemise / 100));
  }

  function reinitialiserPrixEtRemiseWorkflow() {
    etat.workflow.codeRemise = "";
    etat.workflow.codeRemiseValide = false;
    etat.workflow.dernierCodeRemiseValide = "";
    etat.workflow.remise = null;
    etat.workflow.typeaboPrix = "";
    etat.workflow.tauxTva = PARAMETRES_ABONNEMENT.tauxTva;
    etat.workflow.prixInitialTtc = null;
    etat.workflow.prixNetTtc = null;
    etat.workflow.ech = 1;
    etat.workflow.mois1 = null;
    etat.workflow.mois2 = null;
    etat.workflow.mois3 = null;
    etat.workflow.vrmt = null;
  }

  async function ouvrirDialogueChoix(options) {
    const slot = await obtenirWorkflowAbonnementContenu();
    await preparerTransitionWorkflow(slot);

    const fragment = await chargerFragmentObjet("/BOX/02-box-dialogue-bouton.html");
    slot.appendChild(fragment);

    const dialogue = slot.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre = slot.querySelector("[data-lcdp-dialogue-title]");
    const texte = slot.querySelector("[data-lcdp-dialogue-text]");
    const actions = slot.querySelector("[data-lcdp-dialogue-actions]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-close]");

    if (!dialogue || !titre || !texte || !actions || !boutonFermer) {
      throw new Error("Structure dialogue bouton incomplète.");
    }

    appliquerClasseWorkflow(dialogue, "dialogue-choix");

    titre.textContent = options.titre || "";
    titre.hidden = !options.titre;
    texte.textContent = options.texte || "";
    actions.innerHTML = "";
    actions.classList.add("lcdp-workflow-abonnement__dialogue-actions");

    let valeur = options.valeurInitiale || "";
    const selectionObligatoire = options.selectionObligatoire === true;

    const zoneChoix = document.createElement("div");
    zoneChoix.className = "lcdp-workflow-choice-zone lcdp-workflow-abonnement__choice-zone";

    let boutonSuivant = null;

    function actualiserEtatSuivant() {
      if (!boutonSuivant || !selectionObligatoire) return;
      boutonSuivant.disabled = !valeur;
      boutonSuivant.setAttribute("aria-disabled", valeur ? "false" : "true");
    }

    (options.choix || []).forEach((choix) => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-button lcdp-button-secondary";
      bouton.textContent = choix.label || choix.valeur || "";
      bouton.dataset.workflowChoix = choix.valeur || "";
      bouton.setAttribute("aria-pressed", bouton.dataset.workflowChoix === valeur ? "true" : "false");

      bouton.addEventListener("click", () => {
        valeur = bouton.dataset.workflowChoix;
        zoneChoix.querySelectorAll("[data-workflow-choix]").forEach((element) => {
          element.setAttribute("aria-pressed", element === bouton ? "true" : "false");
        });
        actualiserEtatSuivant();
      });

      zoneChoix.appendChild(bouton);
    });

    actions.appendChild(zoneChoix);

    const zoneNavigation = document.createElement("div");
    zoneNavigation.className = options.boutonRetour
      ? "lcdp-workflow-abonnement__actions-row"
      : "lcdp-workflow-abonnement__actions-full";

    if (options.boutonRetour) {
      zoneNavigation.appendChild(creerBouton(options.boutonRetour, "lcdp-button-secondary", async () => {
        if (typeof options.onRetour === "function") {
          await options.onRetour();
        }
      }));
    }

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(resultat) {
        if (resolu) return;
        resolu = true;
        resolve(resultat || null);
      }

      boutonSuivant = creerBouton(options.boutonSuivant || "Suivant", "lcdp-button-primary", () => {
        if (selectionObligatoire && !valeur) return;
        fermer(valeur);
      });
      zoneNavigation.appendChild(boutonSuivant);
      actions.appendChild(zoneNavigation);
      actualiserEtatSuivant();

      boutonFermer.addEventListener("click", () => {
        if (typeof options.onFermer === "function") options.onFermer();
        fermer(null);
      });
      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) {
          if (typeof options.onFermer === "function") options.onFermer();
          fermer(null);
        }
      });
    });
  }

  async function demanderQuitterWorkflow() {
    const ok = await afficherAlerteSuperposee("Quitter la demande d'abonnement ?");

    if (ok) {
      window.location.href = PAGE_ABONNEMENT_MEMBRE;
    }
  }

  async function ouvrirFacture(card) {
    if (!card) {
      await afficherAlerte("Facture introuvable.");
      return;
    }

    const facture = {
      orderid: card.dataset.orderid || "",
      orderdate: card.dataset.orderdate || "",
      ht: card.dataset.ht || "",
      tva: card.dataset.tva || "",
      ttc: card.dataset.ttc || ""
    };

    if (!facture.orderid) {
      await afficherAlerte("Commande non renseignée.");
      return;
    }

    const slot = obtenirLightboxSlot();
    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-facture.html");
    slot.appendChild(fragment);

    const box = slot.querySelector("[data-lcdp-box-facture]");
    const boutonFermer = slot.querySelector("[data-lcdp-facture-close]");
    const boutonOk = slot.querySelector("[data-lcdp-facture-ok]");

    remplirTexte(slot, "[data-lcdp-facture-orderid]", facture.orderid);
    remplirTexte(slot, "[data-lcdp-facture-orderdate]", formaterDate(facture.orderdate));
    remplirTexte(slot, "[data-lcdp-facture-ht]", formaterMontant(facture.ht));
    remplirTexte(slot, "[data-lcdp-facture-tva]", formaterMontant(facture.tva));
    remplirTexte(slot, "[data-lcdp-facture-ttc]", formaterMontant(facture.ttc));

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(true);
      }

      if (boutonFermer) boutonFermer.addEventListener("click", fermer);
      if (boutonOk) boutonOk.addEventListener("click", fermer);
      if (box) {
        box.addEventListener("click", (event) => {
          if (event.target === box) fermer();
        });
      }
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
    zoneMessage.textContent = message;
    zoneMessage.dataset.lcdpMessageType = type || "information";
  }

  function masquerMessageListe() {
    const zoneMessage = obtenirZoneMessageListe();

    if (!zoneMessage) return;

    zoneMessage.hidden = true;
    zoneMessage.textContent = "";
    delete zoneMessage.dataset.lcdpMessageType;
  }

  function afficherAbonnements(abonnements) {
    const zoneListe = obtenirZoneListe();

    if (!zoneListe) return;

    const abonnementsFiltres = filtrerEtTrierAbonnements(abonnements);

    zoneListe.innerHTML = "";

    if (!abonnementsFiltres.length) {
      afficherMessageListe(messageVideFiltre(), "information");
      return;
    }

    masquerMessageListe();

    abonnementsFiltres.forEach((abonnement) => {
      zoneListe.appendChild(creerCardAbonnement(abonnement));
    });
  }

  function messageVideFiltre() {
    if (etat.filtre === "avenir") return "Il n'y a pas d'abonnement à venir.";
    if (etat.filtre === "passe") return "Il n'y a pas d'abonnement passé.";

    return "Il n'y a pas d'abonnement en cours.";
  }

  function filtrerEtTrierAbonnements(source) {
    return (Array.isArray(source) ? source : [])
      .filter((abonnement) => categorieAbonnement(abonnement) === etat.filtre)
      .sort((a, b) => {
        const dateA = dateTri(a);
        const dateB = dateTri(b);

        if (etat.filtre === "passe") return dateB - dateA;

        return dateA - dateB;
      });
  }

  function categorieAbonnement(abonnement) {
    const maintenant = new Date();
    const debut = lireDate(abonnement.debut);
    const fin = lireDate(abonnement.fin);

    if (debut && debut > maintenant) return "avenir";
    if (fin && fin < debutJour(maintenant)) return "passe";

    return "encours";
  }

  function dateTri(abonnement) {
    const valeur = etat.filtre === "passe" ? abonnement.fin : abonnement.debut;
    const date = lireDate(valeur);

    return date ? date.getTime() : 0;
  }

  function creerCardAbonnement(abonnement) {
    const card = etat.templateAbonnement.cloneNode(true);
    const commande = normaliserCommande(abonnement);
    const categorie = categorieAbonnement(abonnement);

    if (categorie === "passe") {
      card.classList.add("lcdp-box-card-abonnement--passe");
    }

    card.dataset.idabo = String(abonnement.idabo || abonnement.id || "");
    card.dataset.orderid = commande.orderid;
    card.dataset.orderdate = commande.orderdate;
    card.dataset.ht = normaliserMontantBrut(commande.ht);
    card.dataset.tva = normaliserMontantBrut(commande.tva);
    card.dataset.ttc = normaliserMontantBrut(commande.ttc);

    remplirTexte(card, "[data-lcdp-card-abonnement-type]", abonnement.typabo || abonnement.abonnement || "Non renseigné");
    remplirTexte(card, "[data-lcdp-card-abonnement-debut]", formaterDate(abonnement.debut));
    remplirTexte(card, "[data-lcdp-card-abonnement-fin]", formaterDate(abonnement.fin));
    remplirTexte(card, "[data-lcdp-card-abonnement-orderid]", commande.orderid || "Non renseigné");

    appliquerRoutesSite(card);

    return card;
  }

  function normaliserCommande(abonnement) {
    const commande = abonnement.commande || abonnement.ca || {};

    return {
      orderid: String(commande.orderid || abonnement.orderid || "").trim(),
      orderdate: commande.orderdate || abonnement.orderdate || "",
      ht: commande.ht ?? abonnement.ht ?? "",
      tva: commande.tva ?? abonnement.tva ?? "",
      ttc: commande.ttc ?? abonnement.ttc ?? ""
    };
  }

  async function afficherAlerteSuperposee(message) {
    const container = document.createElement("div");
    container.className = "lcdp-workflow-abonnement-alerte";
    document.body.appendChild(container);

    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
    container.appendChild(fragment);

    const alerte = container.querySelector("[data-lcdp-box-alerte]");
    const texte = container.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = container.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = container.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      container.remove();
      throw new Error("Structure de l’alerte incomplète.");
    }

    texte.textContent = message || "";

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        container.remove();
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fermer(false);
      });
      boutonOk.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fermer(true);
      });
      alerte.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.target === alerte) fermer(false);
      });
    });
  }

  async function afficherAlerte(message) {
    const slot = obtenirLightboxSlot();
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

      boutonFermer.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fermer(false);
      });
      boutonOk.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fermer(true);
      });
      alerte.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.target === alerte) fermer(false);
      });
    });
  }

  function afficherErreurChamp(element, message) {
    if (!element) return;

    element.hidden = false;
    element.textContent = message || "";
  }

  function afficherMessageInline(element, message) {
    if (!element) return;

    element.hidden = false;
    element.textContent = message || "";
  }

  function creerBouton(label, style, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button " + (style || "lcdp-button-primary");
    bouton.textContent = label || "Valider";

    bouton.addEventListener("click", () => {
      Promise.resolve(action()).catch(async (error) => {
        console.error(error);
        await afficherErreurAction(error);
      });
    });

    return bouton;
  }

  async function afficherErreurAction(error) {
    const message = error && error.message
      ? error.message
      : "Erreur technique. Merci de réessayer.";

    if (document.querySelector("[data-lcdp-box-workflow-abonnement]")) {
      await afficherAlerteSuperposee(message);
      return;
    }

    await afficherAlerte(message);
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

    if (!reponse.ok) throw new Error("Fragment OBJET introuvable : " + chemin);

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

    if (!reponse.ok) throw new Error("Fragment membre introuvable : " + chemin);

    const html = await reponse.text();
    const template = document.createElement("template");
    template.innerHTML = html.trim();

    return template.content.cloneNode(true);
  }

  function chargerScriptMembreUneFois(chemin) {
    const src = construireUrlMembre(chemin);

    if (document.querySelector(`script[data-lcdp-script="${chemin}"]`)) {
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

  function redirigerConnexionMembre(motif) {
    const separateur = PAGE_CONNEXION_MEMBRE.includes("?") ? "&" : "?";

    window.location.href =
      PAGE_CONNEXION_MEMBRE +
      separateur +
      "source=" + encodeURIComponent(SOURCE_PAGE) +
      "&session=" +
      encodeURIComponent(motif || "inactive");
  }

  async function obtenirWorkflowAbonnementContenu() {
    const slot = obtenirLightboxSlot();
    let workflow = slot.querySelector("[data-lcdp-box-workflow-abonnement]");

    if (!workflow) {
      slot.innerHTML = "";

      const fragment = await chargerFragmentObjet("/BOX/04-box-workflow-abonnement.html");
      slot.appendChild(fragment);

      workflow = slot.querySelector("[data-lcdp-box-workflow-abonnement]");

      if (!workflow) {
        throw new Error("Structure workflow abonnement incomplète.");
      }

      workflow.addEventListener("click", (event) => {
        if (event.target === workflow) demanderQuitterWorkflow();
      });
    }

    const contenu = slot.querySelector("[data-lcdp-workflow-abonnement-content]");

    if (!contenu) {
      throw new Error("Zone contenu workflow abonnement introuvable.");
    }

    return contenu;
  }

  async function preparerTransitionWorkflow(slot) {
    if (!slot) return;

    if (!slot.firstElementChild) {
      slot.innerHTML = "";
      return;
    }

    const workflow = slot.closest("[data-lcdp-box-workflow-abonnement]");
    const card = workflow?.querySelector("[data-lcdp-workflow-abonnement-card]");

    if (card) {
      const hauteurActuelle = card.getBoundingClientRect().height;
      card.scrollTop = 0;

      if (hauteurActuelle > 0) {
        card.style.minHeight = Math.ceil(hauteurActuelle) + "px";
      }
    }

    slot.classList.add("lcdp-box-workflow-abonnement__content--transition");
    await attendre(70);
    slot.innerHTML = "";
    slot.classList.remove("lcdp-box-workflow-abonnement__content--transition");

    if (card) {
      window.requestAnimationFrame(() => {
        card.scrollTop = 0;

        window.setTimeout(() => {
          card.style.minHeight = "";
        }, 140);
      });
    }
  }

  function appliquerClasseWorkflow(box, variante) {
    if (!box) return;

    box.classList.add("lcdp-workflow-abonnement-box");

    if (variante) {
      box.classList.add("lcdp-workflow-abonnement-box--" + variante);
    }

    const workflow = box.closest("[data-lcdp-box-workflow-abonnement]");

    if (!workflow) return;

    Array.from(workflow.classList).forEach((nomClasse) => {
      if (nomClasse.startsWith("lcdp-box-workflow-abonnement--")) {
        workflow.classList.remove(nomClasse);
      }
    });

    if (variante) {
      workflow.classList.add("lcdp-box-workflow-abonnement--" + variante);
    }
  }

  function attendre(delaiMs) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, delaiMs);
    });
  }

  function obtenirLightboxSlot() {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      throw new Error("Slot lightbox introuvable.");
    }

    return slot;
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

  function lireDate(valeur) {
    if (!valeur) return null;

    const date = new Date(valeur);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function lireDateLocale(valeur) {
    const texte = String(valeur || "").trim();
    const match = texte.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return lireDate(texte);

    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function debutJour(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function debutJourDate(valeur) {
    const date = lireDate(valeur);
    return date ? debutJour(date) : null;
  }

  function finJourDate(valeur) {
    const date = lireDate(valeur);
    return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999) : null;
  }

  function debutMoisDate(valeur) {
    const date = lireDate(valeur);
    return date ? new Date(date.getFullYear(), date.getMonth(), 1) : null;
  }

  function finMoisDate(valeur) {
    const date = lireDate(valeur);
    return date ? new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999) : null;
  }

  function finAbonnementEnCours() {
    const maintenant = new Date();
    const abonnements = Array.isArray(etat.abonnements) ? etat.abonnements : [];
    const abonnement = abonnements.find((ligne) => categorieAbonnement(ligne) === "encours");

    if (!abonnement) return null;

    const fin = lireDate(abonnement.fin);
    return fin ? debutJour(fin) : debutJour(maintenant);
  }

  function finAbonnementDepuisDebut(debut, duree) {
    if (!debut || !duree) return debut;

    if (duree.type === "jour") {
      return new Date(debut.getFullYear(), debut.getMonth(), debut.getDate());
    }

    return new Date(debut.getFullYear(), debut.getMonth() + duree.mois, 0);
  }

  function plagesSeChevauchent(debutA, finA, debutB, finB) {
    return debutA <= finB && debutB <= finA;
  }

  function obtenirDuree(code) {
    return DUREES_ABONNEMENT.find((duree) => duree.code === code) || DUREES_ABONNEMENT[1];
  }

  function libelleDuree(code) {
    return obtenirDuree(code).label;
  }

  function libelleTypeAbonnement(value) {
    return value === "famille" ? "Famille" : "Duo";
  }

  function normaliserListeEmails(source) {
    return (Array.isArray(source) ? source : [])
      .map(nettoyerEmail)
      .filter(Boolean)
      .filter((email, index, array) => array.indexOf(email) === index)
      .slice(0, PARAMETRES_ABONNEMENT.maxInvitesFamille);
  }

  function nettoyerEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function nettoyerCodeRemise(value) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  function nomMois(date) {
    return date.toLocaleDateString("fr-FR", { month: "long" });
  }

  function dateIsoLocale(date) {
    const annee = date.getFullYear();
    const mois = String(date.getMonth() + 1).padStart(2, "0");
    const jour = String(date.getDate()).padStart(2, "0");

    return annee + "-" + mois + "-" + jour;
  }

  function formaterDate(valeur) {
    if (!valeur) return "Non renseigné";

    const date = lireDateLocale(valeur);

    if (!date || Number.isNaN(date.getTime())) return String(valeur);

    return date.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function remplirTexte(racine, selecteur, valeur) {
    const element = racine.querySelector(selecteur);

    if (!element) return;

    element.textContent = valeur || "Non renseigné";
  }

  function normaliserMontantBrut(valeur) {
    if (valeur === null || typeof valeur === "undefined") return "";

    return String(valeur).trim();
  }

  function nombreOuNull(valeur) {
    if (valeur === null || typeof valeur === "undefined" || valeur === "") return null;

    const nombre = Number(String(valeur).replace(",", "."));

    return Number.isFinite(nombre) ? nombre : null;
  }

  function montantValide(valeur) {
    const nombre = nombreOuNull(valeur);
    return nombre !== null && nombre > 0;
  }

  function arrondirMontant(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function formaterMontant(valeur) {
    const nombre = nombreOuNull(valeur);

    if (nombre === null) return "Non renseigné";

    return nombre.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR"
    });
  }

  function formaterMontantOuNonConfigure(valeur) {
    const nombre = nombreOuNull(valeur);

    if (nombre === null) return "Prix non configuré";

    return formaterMontant(nombre);
  }

  function calculerEcheancesPaiementDepuisPrix() {
    const debut = lireDateLocale(etat.workflow.dateDebut) || new Date();
    const montants = [etat.workflow.mois1, etat.workflow.mois2, etat.workflow.mois3]
      .map(nombreOuNull)
      .filter((montant) => montant !== null && montant > 0);

    return montants.map((montant, index) => {
      const moisReference = index - 1;
      const date = new Date(debut.getFullYear(), debut.getMonth() + moisReference + 1, 0);
      return "mois " + String(index + 1) + " : " + formaterDate(dateIsoLocale(date)) + " - " + formaterMontant(montant);
    });
  }

  function detailPaiementVirement() {
    const economieVirement = nombreOuNull(etat.workflow.vrmt);
    const suffixe = "Disponible uniquement pour le paiement en 1x.";

    if (economieVirement && economieVirement > 0) {
      return "Economisez " + formaterMontantCourt(economieVirement) + " de plus en payant par virement dans les 10 jours. " + suffixe;
    }

    return suffixe;
  }

  function entierOuDefaut(value, defaut) {
    const nombre = Number(value);

    return Number.isInteger(nombre) ? nombre : defaut;
  }

  function formaterMontantCourt(value) {
    const nombre = nombreOuNull(value);

    if (nombre === null) return "0 €";

    if (Number.isInteger(nombre)) {
      return nombre.toLocaleString("fr-FR") + " €";
    }

    return formaterMontant(nombre);
  }

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }
})();
