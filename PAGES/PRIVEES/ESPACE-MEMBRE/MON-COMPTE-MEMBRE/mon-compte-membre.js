const CONFIG_MON_COMPTE_MEMBRE = window.SITE_CONFIG || {};

const ENDPOINT_INFORMATIONS_MEMBRE =
  construireEndpointApi("workerInformationsMembreUrl", "WORKER_INFORMATIONS_MEMBRE_URL", "informations-membre-api");

const ENDPOINT_MAJ_EMAIL_MEMBRE =
  construireEndpointApi("workerMajEmailMembreUrl", "WORKER_MAJ_EMAIL_MEMBRE_URL", "maj-email-membre-api");

const ENDPOINT_MAJ_PARRAIN_MEMBRE =
  construireEndpointApi("workerMajParrainMembreUrl", "WORKER_MAJ_PARRAIN_MEMBRE_URL", "maj-parrain-membre-api");

const ENDPOINT_MAJ_DEPARTEMENT_MEMBRE =
  construireEndpointApi("workerMajDepartementMembreUrl", "WORKER_MAJ_DEPARTEMENT_MEMBRE_URL", "maj-dptmt-membre-api");

const PAGE_CONNEXION_MEMBRE = construireUrlPublic(
  "/PAGES/PUBLIQUES/CONNEXION%20MEMBRE/connexion-membre.html"
);

let emailMembreActuel = "";

document.addEventListener("DOMContentLoaded", () => {
  initialiserMonCompteMembre();
});

async function initialiserMonCompteMembre() {
  initialiserModificationEmailMembre();
  initialiserModificationParrainMembre();
  initialiserModificationDepartementMembre();

  if (!ENDPOINT_INFORMATIONS_MEMBRE) {
    afficherMessageErreur("Le service du compte membre n’est pas configuré.");
    return;
  }

  try {
    const reponse = await fetch(ENDPOINT_INFORMATIONS_MEMBRE, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const resultat = await reponse.json().catch(() => null);

    if (!reponse.ok || !resultat || resultat.ok !== true || !resultat.informations) {
      redirigerConnexionMembre("inactive");
      return;
    }

    afficherInformationsMembre(resultat.informations);

  } catch (erreur) {
    console.error("Erreur chargement compte membre :", erreur);
    redirigerConnexionMembre("erreur");
  }
}

function afficherInformationsMembre(infos) {
  emailMembreActuel = nettoyerEmail(infos.email);

  remplirChamp("champ-nom-membre", infos.nom);
  remplirChamp("champ-prenom-membre", infos.prenom);
  remplirChamp("champ-email-membre", infos.email);
  remplirChamp("champ-date-creation-membre", formaterDate(infos.membreDepuis));
  remplirChamp("champ-statut-membre", infos.statut);
  remplirChamp("champ-parrain-membre", infos.parrain);
  remplirChamp("champ-departement-membre", infos.departement);
  remplirChamp("champ-reglement-club", formaterDate(infos.reglementClub));
  remplirChamp("champ-reglement-application", formaterDate(infos.reglementApplication));
}

function initialiserModificationEmailMembre() {
  const bouton = document.getElementById("modifier-email-membre");

  if (!bouton || bouton.dataset.initialise === "true") return;

  bouton.dataset.initialise = "true";
  bouton.addEventListener("click", ouvrirBoiteDialogueEmailMembre);
}

async function ouvrirBoiteDialogueEmailMembre() {
  if (typeof window.afficherBoiteDialogue !== "function") {
    afficherMessageErreur("La boîte de dialogue n’est pas disponible.");
    return;
  }

  const resultat = await window.afficherBoiteDialogue({
    titre: "Modifier mon e-mail",
    texteAnnuler: "Annuler",
    texteValider: "Valider",
    champs: [
      {
        id: "nouvel-email-membre",
        name: "emailmembre",
        label: "Nouveau mail",
        type: "email",
        autocomplete: "email",
        required: true
      }
    ]
  });

  if (!resultat) return;

  const nouveauMail = nettoyerEmail(resultat.emailmembre);

  if (!emailValide(nouveauMail)) {
    afficherMessageErreur("L’adresse e-mail saisie est invalide.");
    return;
  }

  if (nouveauMail === emailMembreActuel) {
    afficherMessageErreur("Ce mail est déjà celui de votre compte.");
    return;
  }

  await envoyerDemandeModificationEmail(nouveauMail);
}

async function envoyerDemandeModificationEmail(nouveauMail) {
  if (!ENDPOINT_MAJ_EMAIL_MEMBRE) {
    afficherMessageErreur("Le service de modification d’e-mail n’est pas configuré.");
    return;
  }

  try {
    const reponse = await fetch(ENDPOINT_MAJ_EMAIL_MEMBRE, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        emailmembre: nouveauMail
      })
    });

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return;
    }

    if (!reponse.ok || !resultat || resultat.ok !== true) {
      afficherMessageErreur(messageErreurApi(resultat, "Impossible d’envoyer l’e-mail de validation."));
      return;
    }

    afficherMessageValidation(
      "Email de validation envoyé",
      "Un email de validation a été envoyé. Votre e-mail actuel reste inchangé tant que le nouveau mail n’est pas validé."
    );

  } catch (erreur) {
    console.error("Erreur modification email membre :", erreur);
    afficherMessageErreur("Erreur technique. Merci de réessayer.");
  }
}

function initialiserModificationParrainMembre() {
  const bouton = document.getElementById("modifier-parrain-membre");

  if (!bouton || bouton.dataset.initialise === "true") return;

  bouton.dataset.initialise = "true";
  bouton.addEventListener("click", ouvrirBoiteDialogueParrainMembre);
}

async function ouvrirBoiteDialogueParrainMembre() {
  if (typeof window.afficherBoiteDialogue !== "function") {
    afficherMessageErreur("La boîte de dialogue n’est pas disponible.");
    return;
  }

  const resultat = await window.afficherBoiteDialogue({
    titre: "Modifier mon parrain",
    texteAnnuler: "Annuler",
    texteValider: "Valider",
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
    afficherMessageErreur("L’adresse e-mail du parrain est invalide.");
    return;
  }

  await envoyerModificationParrain(emailparrain);
}

async function envoyerModificationParrain(emailparrain) {
  if (!ENDPOINT_MAJ_PARRAIN_MEMBRE) {
    afficherMessageErreur("Le service de modification du parrain n’est pas configuré.");
    return;
  }

  try {
    const reponse = await fetch(ENDPOINT_MAJ_PARRAIN_MEMBRE, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        emailparrain
      })
    });

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return;
    }

    if (!reponse.ok || !resultat || resultat.ok !== true) {
      afficherMessageErreur(messageErreurApi(resultat, "Impossible d’enregistrer le changement de parrain."));
      return;
    }

    remplirChamp("champ-parrain-membre", emailparrain || null);

    afficherMessageValidation(
      "Changement enregistré",
      "Votre changement de parrain est enregistré."
    );

  } catch (erreur) {
    console.error("Erreur modification parrain membre :", erreur);
    afficherMessageErreur("Erreur technique. Merci de réessayer.");
  }
}

function initialiserModificationDepartementMembre() {
  const bouton = document.getElementById("modifier-departement-membre");

  if (!bouton || bouton.dataset.initialise === "true") return;

  bouton.dataset.initialise = "true";
  bouton.addEventListener("click", ouvrirBoiteDialogueDepartementMembre);
}

async function ouvrirBoiteDialogueDepartementMembre() {
  if (typeof window.afficherBoiteDialogue !== "function") {
    afficherMessageErreur("La boîte de dialogue n’est pas disponible.");
    return;
  }

  const resultat = await window.afficherBoiteDialogue({
    titre: "Modifier mon département",
    texteAnnuler: "Annuler",
    texteValider: "Valider",
    champs: [
      {
        id: "nouveau-departement-membre",
        name: "dptmtmembre",
        label: "Nouveau département",
        type: "text",
        value: "",
        required: true
      }
    ]
  });

  if (!resultat) return;

  const dptmtmembre = nettoyerDepartement(resultat.dptmtmembre);

  if (!dptmtmembre) {
    afficherMessageErreur("Le département est obligatoire.");
    return;
  }

  await envoyerModificationDepartement(dptmtmembre);
}

async function envoyerModificationDepartement(dptmtmembre) {
  if (!ENDPOINT_MAJ_DEPARTEMENT_MEMBRE) {
    afficherMessageErreur("Le service de modification du département n’est pas configuré.");
    return;
  }

  try {
    const reponse = await fetch(ENDPOINT_MAJ_DEPARTEMENT_MEMBRE, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dptmtmembre
      })
    });

    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      redirigerConnexionMembre("inactive");
      return;
    }

    if (!reponse.ok || !resultat || resultat.ok !== true) {
      afficherMessageErreur(messageErreurApi(resultat, "Impossible d’enregistrer le changement de département."));
      return;
    }

    remplirChamp("champ-departement-membre", dptmtmembre);

    afficherMessageValidation(
      "Changement enregistré",
      "Votre changement de département est enregistré."
    );

  } catch (erreur) {
    console.error("Erreur modification département membre :", erreur);
    afficherMessageErreur("Erreur technique. Merci de réessayer.");
  }
}

function construireEndpointApi(cleModerne, cleLegacy, sousDomaineWorker) {
  const depuisConfig =
    CONFIG_MON_COMPTE_MEMBRE?.[cleModerne] ||
    CONFIG_MON_COMPTE_MEMBRE?.[cleLegacy] ||
    "";

  if (depuisConfig) {
    return String(depuisConfig).replace(/\/$/, "");
  }

  if (typeof CONFIG_MON_COMPTE_MEMBRE.apiUrl === "function") {
    return CONFIG_MON_COMPTE_MEMBRE.apiUrl(sousDomaineWorker).replace(/\/$/, "");
  }

  return "";
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

  if (typeof CONFIG_MON_COMPTE_MEMBRE.publicUrl === "function") {
    return CONFIG_MON_COMPTE_MEMBRE.publicUrl(valeur);
  }

  const base = (
    window.ASSETS_BASE ||
    CONFIG_MON_COMPTE_MEMBRE.publicBaseUrl ||
    CONFIG_MON_COMPTE_MEMBRE.PUBLIC_BASE ||
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
    "source=mon-compte-membre&session=" +
    encodeURIComponent(motif || "inactive");
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

function messageErreurApi(resultat, messageDefaut) {
  return resultat && (resultat.message || resultat.error)
    ? String(resultat.message || resultat.error)
    : messageDefaut;
}

function afficherMessageErreur(message) {
  if (typeof window.afficherLightboxInformation === "function") {
    window.afficherLightboxInformation(
      "Erreur",
      message,
      { type: "erreur" }
    );
    return;
  }

  alert(message);
}

function afficherMessageValidation(titre, message) {
  if (typeof window.afficherLightboxInformation === "function") {
    window.afficherLightboxInformation(
      titre,
      message,
      { type: "validation" }
    );
    return;
  }

  alert(message);
}