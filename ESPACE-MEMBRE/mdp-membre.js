(() => {
  "use strict";

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

    const endpointMdptokenz = obtenirEndpointMdptokenz();
    const urlConnexionMembre = construireUrlConnexionMembre();

    let envoiEnCours = false;

    if (lienConnexionMembre) {
      lienConnexionMembre.href = urlConnexionMembre;
    }

    if (texteModeMdp) {
      texteModeMdp.textContent =
        mode === "change"
          ? "Choisissez le mot de passe de votre compte membre"
          : "Choisissez le mot de passe de votre compte membre";
    }

    if (!formulaire || !champMotDePasse || !boutonValider) {
      afficherInformation(
        "Erreur technique",
        "Le formulaire est incomplet. Veuillez réessayer."
      );
      return;
    }

    if (!endpointMdptokenz) {
      champMotDePasse.disabled = true;
      boutonValider.disabled = true;

      afficherInformation(
        "Configuration manquante",
        "L’adresse du service de mot de passe n’est pas configurée."
      );
      return;
    }

    if (!token || !mode) {
      champMotDePasse.disabled = true;
      boutonValider.disabled = true;

      afficherInformation(
        "Lien invalide",
        "Le lien utilisé n’est pas valide ou a expiré."
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
          "Veuillez saisir un mot de passe."
        );
        return;
      }

      if (passwordmembre.length < 10) {
        afficherInformation(
          "Mot de passe trop court",
          "Le mot de passe doit contenir au moins 10 caractères."
        );
        return;
      }

      envoiEnCours = true;
      boutonValider.disabled = true;
      boutonValider.textContent = "Validation en cours...";

      try {
        const response = await fetch(endpointMdptokenz, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
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
            data?.message || "La demande n’a pas pu être enregistrée."
          );

          envoiEnCours = false;
          boutonValider.disabled = false;
          boutonValider.textContent = "Valider";
          return;
        }

        afficherInformation(
          "Mot de passe enregistré",
          "Votre mot de passe a bien été enregistré. Vous pouvez maintenant vous connecter à votre compte membre.",
          urlConnexionMembre
        );

      } catch (error) {
        console.error("Erreur appel mdptokenz :", error);

        afficherInformation(
          "Erreur",
          "Une erreur est survenue. Veuillez réessayer."
        );

        envoiEnCours = false;
        boutonValider.disabled = false;
        boutonValider.textContent = "Valider";
      }
    }
  }

  function obtenirEndpointMdptokenz() {
    const config = window.SITE_CONFIG || {};

    const depuisConfig =
      config.workerMdptokenzUrl ||
      config.WORKER_MDPTOKENZ_URL ||
      "";

    if (depuisConfig) {
      return nettoyerBaseUrl(depuisConfig);
    }

    if (typeof config.apiUrl === "function") {
      return nettoyerBaseUrl(config.apiUrl("mdptokenz-api"));
    }

    return "";
  }

  function construireUrlConnexionMembre() {
    const chemin = "/ESPACE-PUBLIC/connexion-membre.html";
    const config = window.SITE_CONFIG || {};

    if (typeof config.publicUrl === "function") {
      return config.publicUrl(chemin);
    }

    const publicBaseUrl = nettoyerBaseUrl(
      config.publicBaseUrl ||
      config.PUBLIC_BASE ||
      ""
    );

    if (publicBaseUrl) {
      return joindreBaseEtChemin(publicBaseUrl, chemin);
    }

    return chemin;
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

  async function afficherInformation(titre, message, redirectUrl = null) {
    const slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      alert(message || titre);

      if (redirectUrl) {
        window.location.href = redirectUrl;
      }

      return;
    }

    slot.innerHTML = "";

    const alerte = document.createElement("div");
    alerte.className = "lcdp-box-alerte";
    alerte.setAttribute("role", "alertdialog");
    alerte.setAttribute("aria-modal", "true");
    alerte.dataset.lcdpBoxAlerte = "";

    const carte = document.createElement("div");
    carte.className = "lcdp-box-alerte__card";

    const boutonFermer = document.createElement("button");
    boutonFermer.className = "lcdp-box-alerte__close";
    boutonFermer.type = "button";
    boutonFermer.setAttribute("aria-label", "Fermer");
    boutonFermer.textContent = "×";

    const paragraphe = document.createElement("p");
    paragraphe.className = "lcdp-box-alerte__message";
    paragraphe.textContent = titre && message
      ? titre + " — " + message
      : titre || message || "";

    const boutonOk = document.createElement("button");
    boutonOk.className = "lcdp-button lcdp-button-primary";
    boutonOk.type = "button";
    boutonOk.textContent = "OK";

    carte.appendChild(boutonFermer);
    carte.appendChild(paragraphe);
    carte.appendChild(boutonOk);
    alerte.appendChild(carte);
    slot.appendChild(alerte);

    await new Promise((resolve) => {
      const fermer = () => {
        slot.innerHTML = "";
        resolve();
      };

      boutonFermer.addEventListener("click", fermer, { once: true });
      boutonOk.addEventListener("click", fermer, { once: true });

      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) {
          fermer();
        }
      }, { once: true });
    });

    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  }
})();
