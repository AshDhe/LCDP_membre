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
    const confirmationUtilisateurUniqueMdp = document.getElementById("confirmer-utilisateur-unique-mdp");
    const lienConnexionMembre = document.getElementById("lien-connexion-membre");
    const texteModeMdp = document.getElementById("texte-mode-mdp");

    const params = new URLSearchParams(window.location.search);

    const token = String(params.get("token") || "").trim();
    const mode = normaliserMode(params.get("mode"));

    const endpointMdptokenz = obtenirEndpointMdptokenz();
    const urlConnexionMembre = construireUrlConnexionMembre();

    let envoiEnCours = false;

    function definirEtatBoutonValidation(enCours) {
      boutonValider.disabled = enCours;
      boutonValider.classList.toggle("is-loading", enCours);
      boutonValider.setAttribute(
        "aria-label",
        enCours ? "Validation en cours" : "Valider avec La Clé du Parc"
      );
      boutonValider.setAttribute(
        "title",
        enCours ? "Validation en cours" : "Valider avec La Clé du Parc"
      );
    }

    function desactiverBoutonValidation() {
      boutonValider.disabled = true;
      boutonValider.classList.remove("is-loading");
      boutonValider.setAttribute("aria-label", "Validation indisponible");
      boutonValider.setAttribute("title", "Validation indisponible");
    }

    definirEtatBoutonValidation(false);

    if (lienConnexionMembre) {
      lienConnexionMembre.href = urlConnexionMembre;
    }

    if (texteModeMdp) {
      texteModeMdp.textContent = "Mise à jour du mot de passe";
    }

    appliquerSourcesObjet(document);

    if (!formulaire || !champMotDePasse || !boutonValider || !confirmationUtilisateurUniqueMdp) {
      afficherInformation(
        "Le formulaire est incomplet. Veuillez réessayer."
      );
      return;
    }

    if (!endpointMdptokenz) {
      champMotDePasse.disabled = true;
      confirmationUtilisateurUniqueMdp.disabled = true;
      desactiverBoutonValidation();

      afficherInformation(
        "L’adresse du service de mot de passe n’est pas configurée."
      );
      return;
    }

    if (!token || !mode) {
      champMotDePasse.disabled = true;
      confirmationUtilisateurUniqueMdp.disabled = true;
      desactiverBoutonValidation();

      afficherInformation(
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
          "Veuillez saisir un mot de passe."
        );
        return;
      }

      if (passwordmembre.length < 10) {
        afficherInformation(
          "Le mot de passe doit contenir au moins 10 caractères."
        );
        return;
      }

      if (!confirmationUtilisateurUniqueMdp.checked) {
        afficherInformation("Vous devez confirmer être l'unique utilisateur.");
        return;
      }

      envoiEnCours = true;
      definirEtatBoutonValidation(true);

      try {
        const response = await fetch(endpointMdptokenz, {
          method: "POST",
          credentials: "omit",
          cache: "no-store",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "write-mdp",
            token,
            mode,
            passwordmembre,
            unikuser: confirmationUtilisateurUniqueMdp.checked === true
          })
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data || data.success !== true) {
          afficherInformation(
            "Demande non enregistrée",
            data?.message || "La demande n’a pas pu être enregistrée."
          );

          envoiEnCours = false;
          definirEtatBoutonValidation(false);
          return;
        }

        afficherInformation(
          "Votre mot de passe est enregistré. Vous pouvez maintenant vous connecter à votre compte membre.",
          urlConnexionMembre
        );

      } catch (error) {
        console.error("Erreur appel mdptokenz :", error);

        afficherInformation(
          "Une erreur est survenue. Veuillez réessayer."
        );

        envoiEnCours = false;
        definirEtatBoutonValidation(false);
      }
    }
  }

  function appliquerSourcesObjet(racine = document) {
    racine.querySelectorAll("[data-lcdp-objet-src]").forEach((element) => {
      element.setAttribute("src", construireUrlObjet(element.dataset.lcdpObjetSrc));
    });
  }

  function construireUrlObjet(chemin) {
    const valeur = String(chemin || "");

    if (
      !valeur ||
      valeur.startsWith("#") ||
      valeur.startsWith("mailto:") ||
      valeur.startsWith("tel:") ||
      valeur.startsWith("http://") ||
      valeur.startsWith("https://") ||
      valeur.startsWith("data:")
    ) {
      return valeur;
    }

    const config = window.SITE_CONFIG || {};

    if (typeof config.objetUrl === "function") {
      return config.objetUrl(valeur);
    }

    const objetBaseUrl = nettoyerBaseUrl(
      config.objetBaseUrl ||
      config.OBJET_BASE ||
      window.LCDP_OBJET_BASE ||
      ""
    );

    if (objetBaseUrl) {
      return joindreBaseEtChemin(objetBaseUrl, valeur);
    }

    return valeur.startsWith("/") ? valeur : "/" + valeur;
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
    const texteMessage = titre && message
      ? titre + " — " + message
      : titre || message || "";

    if (!slot) {
      alert(texteMessage);

      if (redirectUrl) {
        window.location.href = redirectUrl;
      }

      return;
    }

    slot.innerHTML = "";

    try {
      const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
      slot.appendChild(fragment);

      const alerte = slot.querySelector("[data-lcdp-box-alerte]");
      const texte = slot.querySelector("[data-lcdp-alerte-message]");
      const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
      const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");

      if (!alerte || !texte || !boutonFermer || !boutonOk) {
        throw new Error("Structure de l’alerte incomplète.");
      }

      texte.textContent = texteMessage;

      await new Promise((resolve) => {
        let resolu = false;

        function fermer() {
          if (resolu) return;
          resolu = true;
          slot.innerHTML = "";
          resolve();
        }

        boutonFermer.addEventListener("click", fermer, { once: true });
        boutonOk.addEventListener("click", fermer, { once: true });

        alerte.addEventListener("click", (event) => {
          if (event.target === alerte) fermer();
        }, { once: true });
      });

      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    } catch (error) {
      console.error("Erreur alerte V3 :", error);

      alert(texteMessage);

      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    }
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
})();
