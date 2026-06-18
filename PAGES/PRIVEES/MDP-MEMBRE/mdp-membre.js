if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiserPageMdpMembre);
} else {
  initialiserPageMdpMembre();
}

function initialiserPageMdpMembre() {
  const formulaire = document.getElementById("formulaire-mdp-membre");
  const champMotDePasse = document.getElementById("passwordmembre");
  const boutonValider = document.getElementById("bouton-valider-formulaire");
  const afficherMotDePasse = document.getElementById("afficher-mdp-membre");
  const lienConnexionMembre = document.getElementById("lien-connexion-membre");
  const texteModeMdp = document.getElementById("texte-mode-mdp");

  const params = new URLSearchParams(window.location.search);

  const token = String(params.get("token") || "").trim();
  const mode = normaliserMode(params.get("mode"));

  const endpointMdptokenz = nettoyerBaseUrl(window.SITE_CONFIG?.workerMdptokenzUrl || "");
  const urlConnexionMembre = construireUrlPublique(
    "/PAGES/PUBLIQUES/CONNEXION-MEMBRE/connexion-membre.html"
  );

  let envoiEnCours = false;

  if (lienConnexionMembre) {
    lienConnexionMembre.href = urlConnexionMembre;
  }

  if (texteModeMdp) {
    texteModeMdp.textContent =
      mode === "change"
        ? "Saisissez le nouveau mot de passe de votre compte membre."
        : "Choisissez le mot de passe qui vous permettra d’accéder à votre compte membre.";
  }

  if (!formulaire || !champMotDePasse || !boutonValider) {
    afficherInformation(
      "Erreur technique",
      "Le formulaire est incomplet. Veuillez réessayer plus tard.",
      "erreur"
    );
    return;
  }

  if (!endpointMdptokenz) {
    champMotDePasse.disabled = true;
    boutonValider.disabled = true;

    afficherInformation(
      "Configuration manquante",
      "L’adresse du service de mot de passe n’est pas configurée.",
      "erreur"
    );
    return;
  }

  if (!token || !mode) {
    champMotDePasse.disabled = true;
    boutonValider.disabled = true;

    afficherInformation(
      "Lien invalide",
      "Le lien utilisé n’est pas valide ou a expiré.",
      "erreur"
    );
    return;
  }

  if (afficherMotDePasse) {
    afficherMotDePasse.addEventListener("change", () => {
      champMotDePasse.type = afficherMotDePasse.checked ? "text" : "password";
    });
  }

  formulaire.addEventListener("submit", (event) => {
    event.preventDefault();
    traiterValidationMotDePasse();
  });

  async function traiterValidationMotDePasse() {
    if (envoiEnCours) return;

    const passwordmembre = champMotDePasse.value;

    if (!passwordmembre.trim()) {
      afficherInformation(
        "Mot de passe manquant",
        "Veuillez saisir un mot de passe.",
        "erreur"
      );
      return;
    }

    if (passwordmembre.length < 10) {
      afficherInformation(
        "Mot de passe trop court",
        "Le mot de passe doit contenir au moins 10 caractères.",
        "erreur"
      );
      return;
    }

    envoiEnCours = true;
    boutonValider.disabled = true;
    boutonValider.textContent = "Validation en cours...";

    try {
      const response = await fetch(endpointMdptokenz, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "omit",
        body: JSON.stringify({
          action: "write-mdp",
          token,
          mode,
          passwordmembre
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || data.success !== true) {
        afficherInformation(
          "Demande non enregistrée",
          data?.message || "La demande n’a pas pu être enregistrée.",
          "erreur"
        );

        envoiEnCours = false;
        boutonValider.disabled = false;
        boutonValider.textContent = "Valider";
        return;
      }

      afficherInformation(
        "Mot de passe enregistré",
        "Votre mot de passe a bien été enregistré. Vous pouvez maintenant vous connecter à votre compte membre.",
        "validation",
        urlConnexionMembre
      );

    } catch (error) {
      console.error("Erreur appel w-mdptokenz :", error);

      afficherInformation(
        "Erreur",
        "Une erreur est survenue. Veuillez réessayer.",
        "erreur"
      );

      envoiEnCours = false;
      boutonValider.disabled = false;
      boutonValider.textContent = "Valider";
    }
  }
}

function construireUrlPublique(chemin) {
  const valeur = String(chemin || "");

  if (
    valeur.startsWith("#") ||
    valeur.startsWith("mailto:") ||
    valeur.startsWith("tel:") ||
    valeur.startsWith("http://") ||
    valeur.startsWith("https://")
  ) {
    return valeur;
  }

  const publicBaseUrl = nettoyerBaseUrl(
    window.SITE_CONFIG?.publicBaseUrl ||
    window.SITE_CONFIG?.PUBLIC_BASE ||
    ""
  );

  if (publicBaseUrl) {
    return joindreBaseEtChemin(publicBaseUrl, valeur);
  }

  if (window.location.hostname.includes("github.io")) {
    return joindreBaseEtChemin("/LCDP_public", valeur);
  }

  return valeur.startsWith("/") ? valeur : "/" + valeur;
}

function joindreBaseEtChemin(baseUrl, chemin) {
  const base = nettoyerBaseUrl(baseUrl);
  const cheminNettoye = "/" + String(chemin || "").replace(/^\/+/, "");

  if (!base) {
    return cheminNettoye;
  }

  return base + cheminNettoye;
}

function nettoyerBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normaliserMode(value) {
  const mode = String(value || "").trim().toLowerCase();

  if (mode === "create") return "create";
  if (mode === "creation") return "create";
  if (mode === "inscription") return "create";

  if (mode === "change") return "change";
  if (mode === "changement") return "change";

  return "";
}

async function afficherInformation(titre, message, type = "information", redirectUrl = null) {
  if (typeof window.afficherLightboxInformation === "function") {
    const affichageOk = await window.afficherLightboxInformation(titre, message, {
      type,
      redirectUrl
    });

    if (affichageOk === true) {
      return;
    }
  }

  alert(message);

  if (redirectUrl) {
    window.location.href = redirectUrl;
  }
}