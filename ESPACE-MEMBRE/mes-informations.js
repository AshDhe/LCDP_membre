(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const SOURCE_PAGE = "mes-informations";

  const ENDPOINT_MON_COMPTE_MEMBRE = construireEndpointApi(
    "workerMonCompteMembreUrl",
    "WORKER_MON_COMPTE_MEMBRE_URL",
    "mon-compte-membre-api"
  );

  const ENDPOINT_MAJ_EMAIL_MEMBRE = construireEndpointApi(
    "workerMajEmailMembreUrl",
    "WORKER_MAJ_EMAIL_MEMBRE_URL",
    "maj-email-membre-api"
  );

  const ENDPOINT_MAJ_PARRAIN_MEMBRE = construireEndpointApi(
    "workerMajParrainMembreUrl",
    "WORKER_MAJ_PARRAIN_MEMBRE_URL",
    "maj-parrain-membre-api"
  );

  const ENDPOINT_MAJ_DEPARTEMENT_MEMBRE = construireEndpointApi(
    "workerMajDepartementMembreUrl",
    "WORKER_MAJ_DEPARTEMENT_MEMBRE_URL",
    "maj-dptmt-membre-api"
  );

  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const PAGE_PAIEMENT_CB = construireUrlMembre("/ESPACE-MEMBRE/paiement-cb.html");

  let pageInitialisee = false;
  let emailMembreActuel = "";

  const PAGE_POINTS_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/points-membre.html");
  const PAGE_ABONNEMENT_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/abonnement-membre.html");

  let compteMembreActuel = null;

  const champsCompte = [
    {
      section: "Etat civil",
      id: "champ-nom-membre",
      name: "nom",
      label: "Nom",
      type: "text",
      key: "nom"
    },
    {
      section: "Etat civil",
      id: "champ-prenom-membre",
      name: "prenom",
      label: "Prénom",
      type: "text",
      key: "prenom"
    },
    {
      section: "Etat civil",
      id: "champ-alias-membre",
      name: "alias",
      label: "Alias",
      type: "text",
      key: "alias",
      action: {
        id: "modifier-alias-membre",
        texte: "Modifier l'alias",
        mode: "picto"
      }
    },
    {
      section: "Etat civil",
      id: "champ-email-membre",
      name: "email",
      label: "E-mail",
      type: "email",
      key: "email",
      action: {
        id: "modifier-email-membre",
        texte: "Modifier l'e-mail",
        mode: "picto",
        pictoRouge: true
      }
    },
    {
      section: "Participation au club",
      id: "champ-membre-depuis",
      name: "membreDepuisAffichage",
      label: "Depuis",
      type: "text",
      key: "membreDepuisAffichage"
    },
    {
      section: "Participation au club",
      id: "champ-parrain-membre",
      name: "parrainAffichage",
      label: "Parrain",
      type: "text",
      key: "parrainAffichage",
      action: {
        id: "modifier-parrain-membre",
        texte: "Modifier le parrain",
        mode: "picto"
      }
    },
    {
      section: "Participation au club",
      id: "champ-departement-membre",
      name: "departementAffichage",
      label: "Département",
      type: "text",
      key: "departementAffichage",
      action: {
        id: "modifier-departement-membre",
        texte: "Modifier le département",
        mode: "picto"
      }
    },
    {
      section: "Participation au club",
      id: "champ-da-membre",
      name: "daAffichage",
      label: "DA",
      type: "text",
      key: "daAffichage"
    },
    {
      section: "Participation au club",
      id: "champ-statut-membre",
      name: "statutAffichage",
      label: "Membre",
      type: "text",
      key: "statutAffichage"
    },
    {
      section: "Participation au club",
      id: "champ-points-club-membre",
      name: "pointsClubAffichage",
      label: "Points club",
      type: "text",
      key: "pointsClubAffichage",
      action: {
        id: "voir-points-membre",
        texte: "Voir mes points"
      },
      badge: {
        id: "badge-points-club-membre",
        type: "points"
      }
    },
    {
      section: "Adresse de facturation",
      id: "champ-adresse1-membre",
      name: "adresse1",
      label: "Adresse 1",
      type: "text",
      key: "adresse1",
      action: {
        id: "modifier-adresse1-membre",
        texte: "Modifier l'adresse de facturation",
        mode: "picto",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "Adresse de facturation",
      id: "champ-adresse2-membre",
      name: "adresse2",
      label: "Adresse 2",
      type: "text",
      key: "adresse2",
      action: {
        id: "modifier-adresse2-membre",
        texte: "Modifier l'adresse de facturation",
        mode: "picto",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "Adresse de facturation",
      id: "champ-adresse3-membre",
      name: "adresse3",
      label: "Adresse 3",
      type: "text",
      key: "adresse3",
      action: {
        id: "modifier-adresse3-membre",
        texte: "Modifier l'adresse de facturation",
        mode: "picto",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "Coordonnées de remboursement IBAN",
      id: "champ-iban-membre",
      name: "iban",
      label: "IBAN",
      type: "text",
      key: "iban",
      action: {
        id: "modifier-iban-membre",
        texte: "Modifier l'IBAN",
        mode: "picto",
        champ: "iban",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "Coordonnées de remboursement IBAN",
      id: "champ-swift-membre",
      name: "swift",
      label: "SWIFT",
      type: "text",
      key: "swift",
      action: {
        id: "modifier-swift-membre",
        texte: "Modifier le SWIFT",
        mode: "picto",
        champ: "swift",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "Coordonnées de remboursement IBAN",
      id: "champ-rib-membre",
      name: "rib",
      label: "RIB",
      type: "text",
      key: "rib",
      action: {
        id: "modifier-rib-membre",
        texte: "Modifier le RIB",
        mode: "picto",
        champ: "rib",
        pictoRouge: true,
        affichageDaOui: true
      }
    },
    {
      section: "Acceptation du règlement",
      id: "champ-reglement-club",
      name: "reglementClubAffichage",
      label: "Club",
      type: "text",
      key: "reglementClubAffichage",
      lien: {
        texteAvant: "Lire le ",
        texteLien: "règlement du club",
        href: "/ESPACE-PUBLIC/reglement-club.html"
      }
    },
    {
      section: "Acceptation du règlement",
      id: "champ-reglement-application",
      name: "reglementApplicationAffichage",
      label: "Application",
      type: "text",
      key: "reglementApplicationAffichage",
      lien: {
        texteAvant: "Lire le ",
        texteLien: "règlement de l'application",
        href: "/ESPACE-PUBLIC/reglement-app.html"
      }
    }
  ];

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
      await initialiserFormulaireInformations();
      await chargerCompteMembre();
    } catch (error) {
      console.error("Erreur mes informations membre :", error);
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function initialiserFormulaireInformations() {
    await attendreCreateurFormulaire();

    const form = await window.LCDP_creerFormulaire("lcdp-mes-informations-slot", {
      id: "form-mes-informations-membre",
      ariaLabel: "Informations du compte membre",
      titre: "",
      sousTitre: "",
      champs: champsCompte.map((champ) => ({
        id: champ.id,
        name: champ.name,
        label: champ.label,
        type: champ.type || "text"
      }))
    });

    if (!form) {
      throw new Error("Formulaire mes informations introuvable.");
    }

    const titreFormulaire = form.querySelector("[data-lcdp-formulaire-title]");
    if (titreFormulaire) {
      titreFormulaire.textContent = "";
      titreFormulaire.hidden = true;
    }

    const sousTitreFormulaire = form.querySelector("[data-lcdp-formulaire-subtitle], [data-lcdp-formulaire-sous-titre]");
    if (sousTitreFormulaire) {
      sousTitreFormulaire.textContent = "";
      sousTitreFormulaire.hidden = true;
    }

    const zoneActions = form.querySelector("[data-lcdp-formulaire-actions]");
    if (zoneActions) {
      zoneActions.hidden = true;
    }

    injecterStylesMesInformations();
    ajouterTitresSectionsCompte();
    masquerLabelsCompte();

    champsCompte.forEach((champ) => {
      const input = document.getElementById(champ.id);

      if (input) {
        input.readOnly = true;
        input.value = "Chargement...";
      }

      marquerChampLectureSeuleInfo(champ.id);

      if (champ.action) {
        ajouterBoutonModificationApresChamp(champ.id, champ.action);
      }

      if (champ.badge) {
        ajouterBadgeInformationDansChamp(champ.id, champ.badge);
      }

      if (champ.lien) {
        ajouterLienInformationApresChamp(champ.id, champ.lien);
      }
    });

    ajouterActionsAdresseFacturation();
    initialiserActionsModification();
  }

  function injecterStylesMesInformations() {
    if (document.querySelector('style[data-lcdp-mes-informations-styles="true"]')) return;

    const style = document.createElement("style");
    style.dataset.lcdpMesInformationsStyles = "true";
    style.textContent = `
      #form-mes-informations-membre .lcdp-title-section {
        margin: 1.15rem 0 0.55rem;
      }

      #form-mes-informations-membre [data-lcdp-box-champ-formulaire] + .lcdp-box-formulaire__actions,
      #form-mes-informations-membre .lcdp-box-formulaire__actions {
        margin-top: 0.55rem;
        margin-bottom: 0.55rem;
        padding-top: 0;
      }

      #form-mes-informations-membre .lcdp-box-formulaire__actions + [data-lcdp-box-champ-formulaire],
      #form-mes-informations-membre .lcdp-box-formulaire__actions + .lcdp-title-section {
        margin-top: 0.55rem;
      }

      #form-mes-informations-membre .lcdp-compte-actions-adresse {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--lcdp-space-2);
      }

      #form-mes-informations-membre .lcdp-compte-actions-adresse .lcdp-button {
        margin-top: 0;
      }

      #form-mes-informations-membre .lcdp-compte-actions-adresse .lcdp-button-orange {
        background: var(--lcdp-color-orange);
        border-color: var(--lcdp-color-orange);
        color: var(--lcdp-color-text);
      }

      #form-mes-informations-membre .lcdp-compte-actions-adresse .lcdp-button-orange:hover {
        background: var(--lcdp-color-orange-hover);
        border-color: var(--lcdp-color-orange-hover);
        color: var(--lcdp-color-text);
      }

      #form-mes-informations-membre .lcdp-box-champ-formulaire__action-edit--rouge,
      #form-mes-informations-membre .lcdp-box-champ-formulaire__action-edit--rouge:hover,
      #form-mes-informations-membre .lcdp-box-champ-formulaire__action-edit--rouge:focus-visible {
        color: #b3261e;
      }

      #form-mes-informations-membre .lcdp-box-champ-formulaire__action-edit--rouge .lcdp-box-champ-formulaire__action-edit-icon,
      #form-mes-informations-membre .lcdp-box-champ-formulaire__action-edit--rouge .lcdp-box-champ-formulaire__action-edit-icon path {
        fill: currentColor;
        stroke: currentColor;
      }

      @media (max-width: 767px) {
        #mention-statut-membre {
          margin-top: 0.35rem;
          margin-bottom: 0.45rem;
        }

        #lcdp-mes-informations-slot {
          margin-top: 0.25rem;
        }

        #form-mes-informations-membre {
          margin-top: 0;
        }

        #form-mes-informations-membre .lcdp-title-section {
          font-size: 1.25rem;
          line-height: 1.2;
          margin: 1rem 0 0.55rem;
        }

        #form-mes-informations-membre [data-lcdp-box-champ-formulaire] + .lcdp-box-formulaire__actions,
        #form-mes-informations-membre .lcdp-box-formulaire__actions {
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ajouterTitresSectionsCompte() {
    const sectionsAjoutees = new Set();

    champsCompte.forEach((champ) => {
      if (!champ.section || sectionsAjoutees.has(champ.section)) return;

      const input = document.getElementById(champ.id);
      const blocChamp = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

      if (!blocChamp || !blocChamp.parentNode) return;

      const titre = document.createElement("h3");
      titre.className = "lcdp-title-section";
      titre.textContent = champ.section;

      blocChamp.parentNode.insertBefore(titre, blocChamp);
      sectionsAjoutees.add(champ.section);
    });
  }

  function masquerLabelsCompte() {
    champsCompte.forEach((champ) => {
      masquerLabelChampCompte(champ.id, champ.label || champ.name || "Information");
    });
  }

  function masquerLabelChampCompte(champId, ariaLabel) {
    const input = document.getElementById(champId);
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

    if (!input || !champ) return;

    const label = champ.querySelector(`label[for="${champId}"]`);

    if (label) {
      label.textContent = "";
      label.hidden = true;
      label.setAttribute("aria-hidden", "true");
    }

    const zoneLabel = champ.querySelector("[data-lcdp-champ-label-zone]");

    if (zoneLabel) {
      zoneLabel.hidden = true;
      zoneLabel.setAttribute("aria-hidden", "true");
    }

    input.setAttribute("aria-label", ariaLabel || "Information");
  }

  function marquerChampLectureSeuleInfo(champId) {
    const input = document.getElementById(champId);
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

    if (!input || !champ) return;

    champ.classList.add("lcdp-box-champ-formulaire--lecture-seule-info");
    input.setAttribute("aria-readonly", "true");
  }

  function ajouterLienInformationApresChamp(champId, lienConfig) {
    const input = document.getElementById(champId);
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

    if (!champ) return;

    const note = document.createElement("p");
    note.className = "lcdp-box-champ-formulaire__aide";
    note.append(lienConfig.texteAvant || "");

    const lien = document.createElement("a");
    lien.className = "lcdp-link-secondary";
    lien.href = construireUrlPublic(lienConfig.href || "#");
    lien.textContent = lienConfig.texteLien || "";
    lien.target = "_blank";
    lien.rel = "noopener noreferrer";

    note.appendChild(lien);
    champ.appendChild(note);
  }

  function ajouterActionsAdresseFacturation() {
    const input = document.getElementById("champ-adresse3-membre");
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

    if (!champ || document.getElementById("voir-factures-membre")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "lcdp-box-formulaire__actions lcdp-compte-actions-adresse";

    const boutonFactures = document.createElement("button");
    boutonFactures.id = "voir-factures-membre";
    boutonFactures.type = "button";
    boutonFactures.className = "lcdp-button lcdp-button-secondary";
    boutonFactures.textContent = "Voir mes factures";

    wrapper.appendChild(boutonFactures);
    champ.insertAdjacentElement("afterend", wrapper);
  }

  function ajouterBoutonModificationApresChamp(champId, action) {
    const input = document.getElementById(champId);
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

    if (!champ) return;

    if (action.mode === "picto" || action.id === "modifier-alias-membre" || action.id === "modifier-email-membre") {
      ajouterPictoModificationDansChamp(input, champ, action);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "lcdp-box-formulaire__actions";

    const bouton = document.createElement("button");
    bouton.id = action.id;
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-secondary";
    bouton.textContent = action.texte;

    wrapper.appendChild(bouton);
    champ.insertAdjacentElement("afterend", wrapper);
  }

  function ajouterPictoModificationDansChamp(input, champ, action) {
    const zoneControl = champ.querySelector("[data-lcdp-champ-control]") || input.parentNode;

    if (!zoneControl) return;

    champ.classList.add("lcdp-box-champ-formulaire--compte-action", "lcdp-box-champ-formulaire--modifiable");
    zoneControl.classList.add("lcdp-box-champ-formulaire__control--modifiable");

    const bouton = document.createElement("button");
    bouton.id = action.id;
    bouton.type = "button";
    bouton.className = "lcdp-box-champ-formulaire__action-edit";

    if (action.pictoRouge === true) {
      bouton.classList.add("lcdp-box-champ-formulaire__action-edit--rouge");
    }

    if (action.affichageDaOui === true) {
      bouton.hidden = true;
      bouton.disabled = true;
      bouton.setAttribute("aria-hidden", "true");
    }

    bouton.setAttribute("aria-label", action.texte || "Modifier l'alias");
    bouton.title = action.texte || "Modifier l'alias";
    bouton.innerHTML = `
      <svg class="lcdp-box-champ-formulaire__action-edit-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M4 16.8V20h3.2L17.9 9.3l-3.2-3.2L4 16.8Z"></path>
        <path d="M19.2 8 16 4.8l1.1-1.1a1.7 1.7 0 0 1 2.4 0l.8.8a1.7 1.7 0 0 1 0 2.4L19.2 8Z"></path>
      </svg>
    `;

    zoneControl.appendChild(bouton);
  }

  function ajouterBadgeInformationDansChamp(champId, badgeConfig) {
    const input = document.getElementById(champId);
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;
    const zoneControl = champ ? champ.querySelector("[data-lcdp-champ-control]") || input.parentNode : null;

    if (!input || !champ || !zoneControl) return;

    champ.classList.add("lcdp-box-champ-formulaire--badge");
    zoneControl.classList.add("lcdp-box-champ-formulaire__control--badge");

    const badge = document.createElement("span");
    badge.id = badgeConfig.id || champId + "-badge";
    badge.className = "lcdp-box-champ-formulaire__badge";
    badge.hidden = true;
    badge.setAttribute("aria-hidden", "true");

    const image = document.createElement("img");
    image.className = "lcdp-box-champ-formulaire__badge-image";
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";

    badge.appendChild(image);
    zoneControl.appendChild(badge);
  }


  function initialiserActionsModification() {
    const boutonAlias = document.getElementById("modifier-alias-membre");
    const boutonEmail = document.getElementById("modifier-email-membre");
    const boutonPoints = document.getElementById("voir-points-membre");
    const boutonParrain = document.getElementById("modifier-parrain-membre");
    const boutonDepartement = document.getElementById("modifier-departement-membre");
    const actionsAdresseFacturation = [
      { bouton: document.getElementById("modifier-adresse1-membre"), champ: "adresse1", label: "Adresse 1" },
      { bouton: document.getElementById("modifier-adresse2-membre"), champ: "adresse2", label: "Adresse 2" },
      { bouton: document.getElementById("modifier-adresse3-membre"), champ: "adresse3", label: "Adresse 3" }
    ].filter((action) => action.bouton);
    const boutonFactures = document.getElementById("voir-factures-membre");
    const boutonIban = document.getElementById("modifier-iban-membre");
    const boutonSwift = document.getElementById("modifier-swift-membre");
    const boutonRib = document.getElementById("modifier-rib-membre");

    if (boutonAlias) boutonAlias.addEventListener("click", ouvrirDialogueAliasMembre);
    if (boutonEmail) boutonEmail.addEventListener("click", ouvrirDialogueEmailMembre);
    if (boutonPoints) boutonPoints.addEventListener("click", ouvrirPagePointsMembre);
    if (boutonParrain) boutonParrain.addEventListener("click", ouvrirDialogueParrainMembre);
    if (boutonDepartement) boutonDepartement.addEventListener("click", ouvrirDialogueDepartementMembre);
    actionsAdresseFacturation.forEach((action) => {
      action.bouton.addEventListener("click", ouvrirDialogueAdresseFacturationMembre);
    });
    if (boutonFactures) boutonFactures.addEventListener("click", ouvrirPageFacturesMembre);
    if (boutonIban) boutonIban.addEventListener("click", () => ouvrirDialogueCoordonneeRemboursementMembre("iban", "IBAN"));
    if (boutonSwift) boutonSwift.addEventListener("click", () => ouvrirDialogueCoordonneeRemboursementMembre("swift", "SWIFT"));
    if (boutonRib) boutonRib.addEventListener("click", () => ouvrirDialogueCoordonneeRemboursementMembre("rib", "RIB"));
  }

  async function chargerCompteMembre() {
    if (!ENDPOINT_MON_COMPTE_MEMBRE) {
      await afficherAlerte("Le service du compte membre n’est pas configuré.");
      return;
    }

    const reponse = await fetch(ENDPOINT_MON_COMPTE_MEMBRE + "/compte", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return;
    }

    if (!reponse.ok || !resultat || resultat.ok !== true || !resultat.compte) {
      throw new Error(messageErreurApi(resultat, "Impossible de charger vos informations."));
    }

    afficherCompteMembre(resultat.compte);
    afficherEtatMembreCompte(resultat.compte);
    await actualiserBurgerMembre(compteIndiqueAbonne(resultat.compte));
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

  function compteIndiqueAbonne(compte) {
    const statut = String(compte?.statut || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

    return statut === "abonne";
  }

  function afficherEtatMembreCompte(compte) {
    let mention = document.getElementById("mention-statut-membre");

    if (!mention) {
      const titre = document.querySelector(".lcdp-title-page-center");
      if (!titre || !titre.parentNode) return;

      mention = document.createElement("p");
      mention.id = "mention-statut-membre";
      mention.className = "lcdp-mention-connexion";
      titre.insertAdjacentElement("afterend", mention);
    }

    mention.textContent = compteIndiqueAbonne(compte)
      ? "MEMBRE ABONNÉ"
      : "MEMBRE INVITÉ";

    afficherSuspensionMembre({
      abonnementSuspendu: valeurBooleenneVraie(compte?.abonnementSuspendu || compte?.suspendu),
      paiementSuspension: compte?.paiementSuspension || compte?.paiementRegularisation || null
    });
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

    if (paiementSuspensionDelaiDepasse(paiement)) {
      await afficherAlerte(messageDelaiPaiementDepasse());
      return;
    }

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

  function formaterAliasAffichage(value) {
    const alias = nettoyerTexteSimple(value);
    return "Alias : " + (alias || "alias non renseigné");
  }

  function formaterMembreDepuis(value) {
    return "Inscription le " + formaterDate(value);
  }

  function formaterParrainAffichage(value) {
    const email = nettoyerEmail(value);
    return email || "Pas de parrain indiqué";
  }

  function formaterDepartementAffichage(value) {
    const departement = nettoyerDepartement(value);
    return "Département actuel : " + (departement || "Non renseigné");
  }

  function formaterDaCompte(compte) {
    const dateDa = compte?.dateDa || compte?.dateda || "";
    const statuda = nettoyerTexteSimple(compte?.statuda || "");

    if (dateDa || statuda) {
      return "DA du " + formaterDate(dateDa) + " (" + (statuda || "Non renseigné") + ")";
    }

    return "DA non transmise";
  }

  function formaterStatutCompte(value) {
    const statut = String(value || "").trim().toLowerCase();

    if (statut === "abonné" || statut === "abonne") {
      return "Membre abonné";
    }

    return "Membre invité";
  }

  function formaterPointsClub(compte) {
    const pointsObjet = compte?.points || {};
    const statut = nettoyerTexteSimple(compte?.statutPointsClub || pointsObjet.statut || "");
    const points = compte?.pointsClub ?? compte?.pointsclub ?? pointsObjet.points ?? null;
    const date = compte?.datePointsClub || pointsObjet.date || "";

    if (points === null || points === undefined || points === "") {
      return "";
    }

    const libellePoint = Number(points) === 1 ? "point club" : "points club";

    return "Référent " + (statut || "Non classé") + " : " + String(points) + " " + libellePoint + " au " + formaterDate(date);
  }

  function actualiserBadgePointsClub(compte) {
    const badge = document.getElementById("badge-points-club-membre");
    const image = badge ? badge.querySelector(".lcdp-box-champ-formulaire__badge-image") : null;

    if (!badge || !image) return;

    const pointsObjet = compte?.points || {};
    const badgePoints = normaliserBadgePoints(compte?.statutPointsClub || pointsObjet.statut || "");

    if (!badgePoints) {
      badge.hidden = true;
      image.removeAttribute("src");
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      return;
    }

    const cheminBadge = "/IMAG/BADG/" + badgePoints;

    image.src = construireUrlObjet(cheminBadge + "96.webp");
    image.srcset = [
      construireUrlObjet(cheminBadge + "64.webp") + " 64w",
      construireUrlObjet(cheminBadge + "96.webp") + " 96w",
      construireUrlObjet(cheminBadge + "192.webp") + " 192w"
    ].join(", ");
    image.sizes = "(min-width: 768px) 44px, (max-width: 420px) 38px, 40px";
    badge.hidden = false;
  }

  function normaliserBadgePoints(value) {
    const badge = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "");

    const correspondances = {
      bronze: "bronze",
      bronse: "bronze",
      argent: "argent",
      or: "or",
      platine: "platine"
    };

    return correspondances[badge] || "";
  }

  function formaterReglementCompte(label, value) {
    return label + " le " + formaterDate(value);
  }

  function afficherCompteMembre(compte) {
    compteMembreActuel = compte || {};
    emailMembreActuel = nettoyerEmail(compteMembreActuel.email);

    const compteAffiche = {
      ...compteMembreActuel,
      alias: formaterAliasAffichage(compteMembreActuel.alias),
      membreDepuisAffichage: formaterMembreDepuis(compteMembreActuel.membreDepuis),
      parrainAffichage: formaterParrainAffichage(compteMembreActuel.parrain),
      departementAffichage: formaterDepartementAffichage(compteMembreActuel.departement),
      daAffichage: formaterDaCompte(compteMembreActuel),
      statutAffichage: formaterStatutCompte(compteMembreActuel.statut),
      pointsClubAffichage: formaterPointsClub(compteMembreActuel),
      reglementClubAffichage: formaterReglementCompte("Club", compteMembreActuel.reglementClub),
      reglementApplicationAffichage: formaterReglementCompte("Application", compteMembreActuel.reglementApplication)
    };

    champsCompte.forEach((champ) => {
      remplirChamp(champ.id, compteAffiche[champ.key]);
    });

    actualiserBadgePointsClub(compteMembreActuel);
    actualiserActionsProtegeesDa(compteMembreActuel);
  }

  function actualiserActionsProtegeesDa(compte) {
    const afficherActionsProtegees = membreAvecDaOui(compte);

    champsCompte.forEach((champ) => {
      if (!champ.action || champ.action.affichageDaOui !== true || !champ.action.id) return;

      const bouton = document.getElementById(champ.action.id);
      if (!bouton) return;

      bouton.hidden = !afficherActionsProtegees;
      bouton.disabled = !afficherActionsProtegees;
      bouton.setAttribute("aria-hidden", afficherActionsProtegees ? "false" : "true");
    });
  }

  function membreAvecDaOui(compte) {
    return normaliserStatudaCompte(compte?.statuda || compte?.statutDa || compte?.da || "") === "oui";
  }

  function normaliserStatudaCompte(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function ouvrirPagePointsMembre() {
    window.location.href = PAGE_POINTS_MEMBRE;
  }

  function ouvrirPageFacturesMembre() {
    window.location.href = PAGE_ABONNEMENT_MEMBRE;
  }

  async function ouvrirDialogueAdresseFacturationMembre() {
    const champsAdresse = ["adresse1", "adresse2", "adresse3"];

    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier l'adresse de facturation",
      champs: champsAdresse.map((champ) => {
        const label = libelleChampAdresseFacturation(champ);

        return {
          id: "nouvelle-" + champ + "-membre",
          name: champ,
          label,
          type: "text",
          required: champ !== "adresse3",
          value: compteMembreActuel?.[champ] || "",
          nettoyer: nettoyerTexteSimple,
          messageRequis: label + " est obligatoire.",
          valider: (valeur) => messageValidationAdresseFacturation(champ, valeur)
        };
      })
    });

    if (!resultat) return;

    const donnees = {
      adresse1: nettoyerTexteSimple(resultat.adresse1),
      adresse2: nettoyerTexteSimple(resultat.adresse2),
      adresse3: nettoyerTexteSimple(resultat.adresse3)
    };

    const messageValidation = champsAdresse
      .map((champ) => messageValidationAdresseFacturation(champ, donnees[champ]))
      .find(Boolean);

    if (messageValidation) {
      await afficherAlerte(messageValidation);
      return;
    }

    await envoyerModificationAdresseFacturation(donnees);
  }

  function normaliserChampAdresseFacturation(champ) {
    const valeur = String(champ || "").trim().toLowerCase();
    return ["adresse1", "adresse2", "adresse3"].includes(valeur) ? valeur : "";
  }

  function libelleChampAdresseFacturation(champ) {
    if (champ === "adresse1") return "Adresse 1";
    if (champ === "adresse2") return "Adresse 2";
    if (champ === "adresse3") return "Adresse 3";

    return "Adresse";
  }

  function messageValidationAdresseFacturation(champ, valeur) {
    const label = libelleChampAdresseFacturation(champ);
    const texte = nettoyerTexteSimple(valeur);

    if (!texte) {
      return champ === "adresse3" ? "" : label + " est obligatoire.";
    }

    if (!/[0-9A-Za-zÀ-ÿ]/.test(texte)) {
      return label + " doit contenir au moins une lettre ou un chiffre.";
    }

    return "";
  }

  async function envoyerModificationAdresseFacturation(donnees) {
    if (!ENDPOINT_MON_COMPTE_MEMBRE) {
      await afficherAlerte("Le service du compte membre n’est pas configuré.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MON_COMPTE_MEMBRE + "/adresse-facturation", donnees);
      const compte = resultat?.compte || {};

      compteMembreActuel = {
        ...compteMembreActuel,
        adresse1: compte.adresse1 || "",
        adresse2: compte.adresse2 || "",
        adresse3: compte.adresse3 || ""
      };

      remplirChamp("champ-adresse1-membre", compteMembreActuel.adresse1);
      remplirChamp("champ-adresse2-membre", compteMembreActuel.adresse2);
      remplirChamp("champ-adresse3-membre", compteMembreActuel.adresse3);

      await afficherAlerte(messageErreurApi(resultat, "Votre adresse de facturation est enregistrée."));
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function ouvrirDialogueCoordonneeRemboursementMembre(champ, label) {
    const champAutorise = normaliserChampRemboursement(champ);

    if (!champAutorise) {
      await afficherAlerte("Champ de remboursement non autorisé.");
      return;
    }

    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier " + label,
      champs: [
        {
          id: "nouvelle-coordonnee-remboursement-membre",
          name: "valeur",
          label,
          type: "text",
          required: true,
          value: compteMembreActuel?.[champAutorise] || "",
          nettoyer: (valeur) => normaliserValeurCoordonneeRemboursement(champAutorise, valeur),
          messageRequis: label + " est obligatoire.",
          valider: (valeur) => messageValidationCoordonneeRemboursement(champAutorise, valeur)
        }
      ]
    });

    if (!resultat) return;

    const valeur = normaliserValeurCoordonneeRemboursement(champAutorise, resultat.valeur);
    const messageValidation = messageValidationCoordonneeRemboursement(champAutorise, valeur);

    if (messageValidation) {
      await afficherAlerte(messageValidation);
      return;
    }

    await envoyerModificationCoordonneeRemboursement(champAutorise, valeur);
  }

  async function envoyerModificationCoordonneeRemboursement(champ, valeur) {
    if (!ENDPOINT_MON_COMPTE_MEMBRE) {
      await afficherAlerte("Le service du compte membre n’est pas configuré.");
      return;
    }

    const champAutorise = normaliserChampRemboursement(champ);

    if (!champAutorise) {
      await afficherAlerte("Champ de remboursement non autorisé.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MON_COMPTE_MEMBRE + "/coordonnees-remboursement", {
        champ: champAutorise,
        valeur
      });
      const compte = resultat?.compte || {};
      const nouvelleValeur = compte[champAutorise] || "";

      compteMembreActuel = {
        ...compteMembreActuel,
        [champAutorise]: nouvelleValeur
      };

      remplirChamp("champ-" + champAutorise + "-membre", nouvelleValeur);

      await afficherAlerte(messageErreurApi(resultat, "Vos coordonnées de remboursement sont enregistrées."));
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function normaliserValeurCoordonneeRemboursement(champ, valeur) {
    const texte = nettoyerTexteSimple(valeur).toUpperCase();

    if (["iban", "swift", "rib"].includes(champ)) {
      return texte.replace(/\s+/g, "");
    }

    return texte;
  }

  function messageValidationCoordonneeRemboursement(champ, valeur) {
    const champAutorise = normaliserChampRemboursement(champ);
    const texte = normaliserValeurCoordonneeRemboursement(champAutorise, valeur);

    if (!texte) {
      return libelleChampRemboursement(champAutorise) + " est obligatoire.";
    }

    if (champAutorise === "iban") {
      if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(texte) || texte.length < 15 || texte.length > 34) {
        return "L’IBAN saisi doit être un IBAN valide.";
      }

      if (!ibanValideMod97(texte)) {
        return "L’IBAN saisi est invalide.";
      }
    }

    if (champAutorise === "swift" && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(texte)) {
      return "Le SWIFT/BIC saisi doit contenir 8 ou 11 caractères au format bancaire attendu.";
    }

    if (champAutorise === "rib" && !/^[A-Z0-9]{21}[0-9]{2}$/.test(texte)) {
      return "Le RIB saisi doit contenir 23 caractères, avec une clé RIB finale sur 2 chiffres.";
    }

    return "";
  }

  function libelleChampRemboursement(champ) {
    if (champ === "iban") return "IBAN";
    if (champ === "swift") return "SWIFT";
    if (champ === "rib") return "RIB";

    return "Coordonnée de remboursement";
  }

  function ibanValideMod97(iban) {
    const valeur = String(iban || "").toUpperCase();
    const rearrange = valeur.slice(4) + valeur.slice(0, 4);
    let reste = 0;

    for (const caractere of rearrange) {
      const bloc = /[0-9]/.test(caractere)
        ? caractere
        : String(caractere.charCodeAt(0) - 55);

      if (!/^[0-9]+$/.test(bloc)) return false;

      for (const chiffre of bloc) {
        reste = (reste * 10 + Number(chiffre)) % 97;
      }
    }

    return reste === 1;
  }

  function normaliserChampRemboursement(champ) {
    const valeur = String(champ || "").trim().toLowerCase();
    return ["iban", "swift", "rib"].includes(valeur) ? valeur : "";
  }

  async function ouvrirDialogueAliasMembre() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier l'alias",
      champs: [
        {
          id: "nouvel-alias-membre",
          name: "alias",
          label: "Alias",
          type: "text",
          required: false,
          value: compteMembreActuel?.alias || ""
        }
      ]
    });

    if (!resultat) return;

    await envoyerModificationAlias({
      alias: nettoyerTexteSimple(resultat.alias)
    });
  }

  async function envoyerModificationAlias(donnees) {
    if (!ENDPOINT_MON_COMPTE_MEMBRE) {
      await afficherAlerte("Le service du compte membre n’est pas configuré.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MON_COMPTE_MEMBRE + "/alias", donnees);
      const compte = resultat?.compte || {};

      compteMembreActuel = {
        ...compteMembreActuel,
        alias: compte.alias || ""
      };

      remplirChamp("champ-alias-membre", formaterAliasAffichage(compteMembreActuel.alias));

      await afficherAlerte(messageErreurApi(resultat, "Votre alias est enregistré."));
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function ouvrirDialogueEmailMembre() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier mon e-mail",
      champs: [
        {
          id: "nouvel-email-membre",
          name: "emailmembre",
          label: "Nouveau mail",
          type: "email",
          autocomplete: "email",
          required: true
        },
        {
          id: "unikuser-nouvel-email-membre",
          name: "unikuser",
          label: "Utilisateur unique de l'adresse e-mail",
          type: "checkbox",
          checkboxLabel: "Je confirme être l'unique utilisateur de l'adresse e-mail.",
          required: true
        }
      ]
    });

    if (!resultat) return;

    const nouveauMail = nettoyerEmail(resultat.emailmembre);

    if (!emailValide(nouveauMail)) {
      await afficherAlerte("L’adresse e-mail saisie est invalide.");
      return;
    }

    if (nouveauMail === emailMembreActuel) {
      await afficherAlerte("Ce mail est déjà celui de votre compte.");
      return;
    }

    if (valeurBooleenneVraie(resultat.unikuser) !== true) {
      await afficherAlerte("Vous devez confirmer être l'unique utilisateur.");
      return;
    }

    await envoyerDemandeModificationEmail(nouveauMail, true);
  }

  async function envoyerDemandeModificationEmail(nouveauMail, unikuser) {
    if (!ENDPOINT_MAJ_EMAIL_MEMBRE) {
      await afficherAlerte("Le service de modification d’e-mail n’est pas configuré.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MAJ_EMAIL_MEMBRE, {
        emailmembre: nouveauMail,
        unikuser: unikuser === true
      });

      const messageWorker = String(resultat?.message || "").trim();

      if (!messageWorker) {
        throw new Error("Aucun message reçu du worker. Ni OK ni KO = KO.");
      }

      await afficherAlerte(messageWorker);
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function ouvrirDialogueParrainMembre() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier mon parrain",
      champs: [
        {
          id: "nouvel-email-parrain",
          name: "emailparrain",
          label: "Email du parrain",
          type: "email",
          autocomplete: "email",
          required: false
        }
      ]
    });

    if (!resultat) return;

    const emailparrain = nettoyerEmail(resultat.emailparrain);

    if (emailparrain && !emailValide(emailparrain)) {
      await afficherAlerte("L’adresse e-mail du parrain est invalide.");
      return;
    }

    await envoyerModificationParrain(emailparrain);
  }

  async function envoyerModificationParrain(emailparrain) {
    if (!ENDPOINT_MAJ_PARRAIN_MEMBRE) {
      await afficherAlerte("Le service de modification du parrain n’est pas configuré.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MAJ_PARRAIN_MEMBRE, {
        emailparrain
      });

      compteMembreActuel = {
        ...compteMembreActuel,
        parrain: emailparrain || ""
      };

      remplirChamp("champ-parrain-membre", formaterParrainAffichage(compteMembreActuel.parrain));
      await afficherAlerte(messageErreurApi(resultat, "Votre changement de parrain est enregistré."));
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function ouvrirDialogueDepartementMembre() {
    const resultat = await ouvrirDialogueChamp({
      titre: "Modifier mon département",
      champs: [
        {
          id: "nouveau-departement-membre",
          name: "dptmtmembre",
          label: "Nouveau département",
          type: "text",
          required: true,
          value: compteMembreActuel?.departement || ""
        }
      ]
    });

    if (!resultat) return;

    const dptmtmembre = nettoyerDepartement(resultat.dptmtmembre);

    if (!dptmtmembre) {
      await afficherAlerte("Le département est obligatoire.");
      return;
    }

    await envoyerModificationDepartement(dptmtmembre);
  }

  async function envoyerModificationDepartement(dptmtmembre) {
    if (!ENDPOINT_MAJ_DEPARTEMENT_MEMBRE) {
      await afficherAlerte("Le service de modification du département n’est pas configuré.");
      return;
    }

    try {
      const resultat = await posterJson(ENDPOINT_MAJ_DEPARTEMENT_MEMBRE, {
        dptmtmembre
      });

      compteMembreActuel = {
        ...compteMembreActuel,
        departement: dptmtmembre
      };

      remplirChamp("champ-departement-membre", formaterDepartementAffichage(compteMembreActuel.departement));
      await afficherAlerte(messageErreurApi(resultat, "Votre changement de département est enregistré."));
    } catch (error) {
      if (error.redirection === true) return;
      await afficherAlerte(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function posterJson(endpoint, payload) {
    const reponse = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      const erreur = new Error("Session membre inactive.");
      erreur.redirection = true;
      throw erreur;
    }

    if (!reponse.ok || !resultat || resultat.ok !== true) {
      throw new Error(messageErreurApi(resultat, "Erreur technique. Merci de réessayer."));
    }

    return resultat;
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

      formulaire.addEventListener("submit", async (event) => {
        event.preventDefault();

        erreur.hidden = true;
        erreur.textContent = "";

        const data = {};
        let champRequisManquant = false;
        let checkboxRequiseManquante = false;
        let messageValidation = "";

        (options.champs || []).forEach((champ) => {
          const input = formulaire.querySelector(`[name="${champ.name}"]`);
          const estCheckbox = input && input.type === "checkbox";
          let valeur = input
            ? estCheckbox
              ? input.checked
              : String(input.value || "")
            : "";

          if (!estCheckbox) {
            valeur = typeof champ.nettoyer === "function"
              ? champ.nettoyer(valeur)
              : String(valeur || "").trim();

            if (input) {
              input.value = valeur;
            }
          }

          if (champ.required && estCheckbox && input.checked !== true) {
            checkboxRequiseManquante = true;
          } else if (champ.required && !estCheckbox && !valeur) {
            champRequisManquant = true;
            if (!messageValidation) {
              messageValidation = champ.messageRequis || "Merci de renseigner le champ demandé.";
            }
          }

          if (!messageValidation && !estCheckbox && valeur && typeof champ.valider === "function") {
            messageValidation = champ.valider(valeur) || "";
          }

          data[champ.name] = valeur;
        });

        if (checkboxRequiseManquante) {
          await afficherAlerteSuperposee("Vous devez confirmer être l'unique utilisateur.");
          return;
        }

        if (champRequisManquant || messageValidation) {
          erreur.textContent = messageValidation || "Merci de renseigner le champ demandé.";
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
    const zoneDescription = fragment.querySelector("[data-lcdp-champ-description]");
    const zoneControl = fragment.querySelector("[data-lcdp-champ-control]");

    if (!champ || !zoneLabel || !zoneDescription || !zoneControl) {
      throw new Error("Structure champ formulaire incomplète.");
    }

    if (configurationChamp.type === "checkbox") {
      const labelCheckbox = document.createElement("label");
      labelCheckbox.className = "lcdp-box-champ-formulaire__checkbox-line";
      labelCheckbox.setAttribute("for", configurationChamp.id);

      const inputCheckbox = document.createElement("input");
      inputCheckbox.id = configurationChamp.id;
      inputCheckbox.name = configurationChamp.name;
      inputCheckbox.type = "checkbox";
      inputCheckbox.required = configurationChamp.required === true;

      const texteCheckbox = document.createElement("span");
      texteCheckbox.textContent = configurationChamp.checkboxLabel || configurationChamp.label || "";

      labelCheckbox.appendChild(inputCheckbox);
      labelCheckbox.appendChild(texteCheckbox);
      zoneControl.appendChild(labelCheckbox);

      return champ;
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

    if (configurationChamp.autocomplete) {
      input.autocomplete = configurationChamp.autocomplete;
    }

    zoneLabel.appendChild(label);
    zoneControl.appendChild(input);

    return champ;
  }

  async function afficherAlerteSuperposee(message) {
    const conteneur = document.createElement("div");
    document.body.appendChild(conteneur);

    try {
      const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
      conteneur.appendChild(fragment);

      const alerte = conteneur.querySelector("[data-lcdp-box-alerte]");
      const texte = conteneur.querySelector("[data-lcdp-alerte-message]");
      const boutonFermer = conteneur.querySelector("[data-lcdp-alerte-close]");
      const boutonOk = conteneur.querySelector("[data-lcdp-alerte-ok]");

      if (!alerte || !texte || !boutonFermer || !boutonOk) {
        throw new Error("Structure de l’alerte incomplète.");
      }

      texte.textContent = message || "";

      await new Promise((resolve) => {
        let resolu = false;

        function fermer() {
          if (resolu) return;
          resolu = true;
          conteneur.remove();
          resolve();
        }

        boutonFermer.addEventListener("click", fermer, { once: true });
        boutonOk.addEventListener("click", fermer, { once: true });

        alerte.addEventListener("click", (event) => {
          if (event.target === alerte) fermer();
        }, { once: true });
      });
    } catch (error) {
      console.error("Erreur alerte superposée :", error);
      conteneur.remove();
      alert(message || "");
    }
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

  async function initialiserBandeau() {
    const slot = document.getElementById("lcdp-bandeau-slot");
    if (!slot) return;

    slot.innerHTML = "";

    const bandeau = await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html");
    slot.appendChild(bandeau);
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

  function attendreCreateurFormulaire() {
    if (typeof window.LCDP_creerFormulaire === "function") {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let tentatives = 0;

      const timer = window.setInterval(() => {
        tentatives += 1;

        if (typeof window.LCDP_creerFormulaire === "function") {
          window.clearInterval(timer);
          resolve();
          return;
        }

        if (tentatives > 40) {
          window.clearInterval(timer);
          reject(new Error("Le composant formulaire V3 n’est pas disponible."));
        }
      }, 50);
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

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }

  function remplirChamp(id, valeur) {
    const element = document.getElementById(id);

    if (!element) return;

    const texte = valeur || "Non renseigné";

    if ("value" in element) {
      element.value = texte;
      return;
    }

    element.textContent = texte;
  }

  function formaterDate(valeur) {
    if (!valeur) return "Non renseigné";

    const date = new Date(valeur);

    if (Number.isNaN(date.getTime())) {
      return valeur;
    }

    return date.toLocaleDateString("fr-FR");
  }

  function nettoyerTexteSimple(valeur) {
    return String(valeur || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function nettoyerEmail(valeur) {
    return String(valeur || "")
      .trim()
      .toLowerCase();
  }

  function nettoyerDepartement(valeur) {
    return String(valeur || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
  }

  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
  }
})();