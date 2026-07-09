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

  const PAGE_POINTS_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/mes-points.html");

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
        texte: "Modifier l'alias"
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
        texte: "Modifier"
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

      if (champ.lien) {
        ajouterLienInformationApresChamp(champ.id, champ.lien);
      }
    });

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

  function ajouterBoutonModificationApresChamp(champId, action) {
    const input = document.getElementById(champId);
    const champ = input ? input.closest("[data-lcdp-box-champ-formulaire]") : null;

    if (!champ) return;

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

  function initialiserActionsModification() {
    const boutonAlias = document.getElementById("modifier-alias-membre");
    const boutonEmail = document.getElementById("modifier-email-membre");
    const boutonPoints = document.getElementById("voir-points-membre");
    const boutonParrain = document.getElementById("modifier-parrain-membre");
    const boutonDepartement = document.getElementById("modifier-departement-membre");

    if (boutonAlias) boutonAlias.addEventListener("click", ouvrirDialogueAliasMembre);
    if (boutonEmail) boutonEmail.addEventListener("click", ouvrirDialogueEmailMembre);
    if (boutonPoints) boutonPoints.addEventListener("click", ouvrirPagePointsMembre);
    if (boutonParrain) boutonParrain.addEventListener("click", ouvrirDialogueParrainMembre);
    if (boutonDepartement) boutonDepartement.addEventListener("click", ouvrirDialogueDepartementMembre);
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

  function formaterMembreDepuis(value) {
    return "Inscription le " + formaterDate(value);
  }

  function formaterDaCompte(compte) {
    if (compte?.dateRefusDa) {
      return "DA refusée le " + formaterDate(compte.dateRefusDa);
    }

    if (compte?.dateDa) {
      return "DA le " + formaterDate(compte.dateDa);
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
    const niveau = String(compte?.niveauPointsClub || compte?.niveauClub || "").trim();
    const points = compte?.pointsClub ?? compte?.pointsclub ?? null;
    const date = compte?.datePointsClub || compte?.dateDernierComptagePoints || "";

    if (!niveau && (points === null || points === undefined || points === "")) {
      return "";
    }

    const morceaux = ["Membre " + (niveau || "non classé")];

    if (points !== null && points !== undefined && points !== "") {
      morceaux.push(String(points) + " points club");
    }

    if (date) {
      morceaux.push("le " + formaterDate(date));
    }

    return morceaux.join(" - ");
  }

  function formaterReglementCompte(label, value) {
    return label + " le " + formaterDate(value);
  }

  function afficherCompteMembre(compte) {
    compteMembreActuel = compte || {};
    emailMembreActuel = nettoyerEmail(compteMembreActuel.email);

    const compteAffiche = {
      ...compteMembreActuel,
      alias: compteMembreActuel.alias || "alias non renseigné",
      membreDepuisAffichage: formaterMembreDepuis(compteMembreActuel.membreDepuis),
      daAffichage: formaterDaCompte(compteMembreActuel),
      statutAffichage: formaterStatutCompte(compteMembreActuel.statut),
      pointsClubAffichage: formaterPointsClub(compteMembreActuel),
      reglementClubAffichage: formaterReglementCompte("Club", compteMembreActuel.reglementClub),
      reglementApplicationAffichage: formaterReglementCompte("Application", compteMembreActuel.reglementApplication)
    };

    champsCompte.forEach((champ) => {
      remplirChamp(champ.id, compteAffiche[champ.key]);
    });
  }

  function ouvrirPagePointsMembre() {
    window.location.href = PAGE_POINTS_MEMBRE;
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

      remplirChamp("champ-alias-membre", compteMembreActuel.alias || "alias non renseigné");

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

      remplirChamp("champ-parrain-membre", emailparrain || null);
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
          required: true
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

      remplirChamp("champ-departement-membre", dptmtmembre);
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

        (options.champs || []).forEach((champ) => {
          const input = formulaire.querySelector(`[name="${champ.name}"]`);
          const estCheckbox = input && input.type === "checkbox";
          const valeur = input
            ? estCheckbox
              ? input.checked
              : String(input.value || "").trim()
            : "";

          if (champ.required && estCheckbox && input.checked !== true) {
            checkboxRequiseManquante = true;
          } else if (champ.required && !estCheckbox && !valeur) {
            champRequisManquant = true;
          }

          data[champ.name] = valeur;
        });

        if (checkboxRequiseManquante) {
          await afficherAlerteSuperposee("Vous devez confirmer être l'unique utilisateur.");
          return;
        }

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