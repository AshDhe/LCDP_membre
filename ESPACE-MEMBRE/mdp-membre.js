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
    let passwordEnAttente = "";
    let confirmationTerminee = false;
    const formulaireConfirmation = document.getElementById("formulaire-confirmation-mdp");
    const boutonConfirmer = document.getElementById("bouton-confirmer-mdp");
    const casesCoda = Array.from(document.querySelectorAll("[data-coda-case]"));
    const config = window.SITE_CONFIG || {};
    const urlAccueil = typeof config.publicUrl === "function"
      ? config.publicUrl("/ESPACE-PUBLIC/accueil-public.html")
      : joindreBaseEtChemin(config.publicBaseUrl || config.PUBLIC_BASE || "", "/ESPACE-PUBLIC/accueil-public.html");

    casesCoda.forEach((champ, index) => {
      champ.addEventListener("input", () => {
        champ.value = champ.value.replace(/[^0-9]/g, "").slice(-1);
        if (champ.value && index < casesCoda.length - 1) casesCoda[index + 1].focus();
      });
      champ.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !champ.value && index > 0) casesCoda[index - 1].focus();
      });
      champ.addEventListener("focus", () => champ.select());
    });
    formulaireConfirmation?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (envoiEnCours || confirmationTerminee || mode !== "change" || !passwordEnAttente) return;
      const coda = casesCoda.map(champ => champ.value).join("");
      if (!/^[0-9]{4}$/.test(coda)) {
        await afficherInformation("Veuillez renseigner les quatre cases.");
        return;
      }
      await envoyerMotDePasse(passwordEnAttente, coda);
    });

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

    // Démarre à l'arrivée, avant la saisie du mot de passe (création seulement).
    let enregistrementNavigateur = null;
    // Première attribution différée jusqu'à l'opt-in confirmé.
    if (mode === "create") enregistrementNavigateur = Promise.resolve(true);

    async function enregistrerNavigateurInitial() {
      const navigateur = obtenirIdentiteNavigateurMobile();
      if (!navigateur) return true; // Inscription sur ordinateur : attribution ultérieure.
      const reponse = await fetch(endpointMdptokenz, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register-browser", token, navigateur })
      });
      const resultat = await reponse.json().catch(() => null);
      if (!reponse.ok || resultat?.success !== true) {
        throw new Error(resultat?.message || "L’enregistrement du navigateur est indisponible. Veuillez réessayer.");
      }
      return true; // Un propriétaire existant n'est jamais remplacé.
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
        afficherInformation("Vous devez confirmer être l'unique utilisateur du mot de passe.");
        return;
      }

      if (mode === "change") {
        passwordEnAttente = passwordmembre;
        champMotDePasse.value = "";
        formulaire.hidden = true;
        formulaireConfirmation.hidden = false;
        casesCoda[0].focus();
        return;
      }
      await envoyerMotDePasse(passwordmembre);
    }

    async function envoyerMotDePasse(passwordmembre, coda = "") {
      envoiEnCours = true;
      definirEtatBoutonValidation(true);
      if (boutonConfirmer) boutonConfirmer.disabled = true;

      try {
        if (mode === "create") {
          const enregistre = await enregistrementNavigateur;
          if (!enregistre) await enregistrerNavigateurInitial();
        }
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
            ...(mode === "change" ? { coda } : {}),
            unikuser: confirmationUtilisateurUniqueMdp.checked === true
          })
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data || data.success !== true) {
          if (mode === "change" && ["coda_incorrect", "coda_bloque", "coda_absent", "token_invalide"].includes(data?.reason)) {
            confirmationTerminee = true;
            passwordEnAttente = "";
            casesCoda.forEach(champ => { champ.value = ""; champ.disabled = true; });
            await afficherInformation(data.message, urlAccueil);
            return;
          }
          await afficherInformation(data?.message || "La demande n’a pas pu être enregistrée.");
          envoiEnCours = false;
          definirEtatBoutonValidation(false);
          if (boutonConfirmer) boutonConfirmer.disabled = false;
          return;
        }

        confirmationTerminee = true;
        passwordEnAttente = "";
        casesCoda.forEach(champ => { champ.value = ""; champ.disabled = true; });
        champMotDePasse.value = "";
        if (mode === "create") {
          if (!data.nextUrl) throw new Error("Suite du tunnel absente.");
          await afficherInformation("Votre mot de passe est enregistré, merci.", data.nextUrl);
        } else {
          await afficherInformation("Votre mot de passe est enregistré. Vous pouvez maintenant vous connecter à votre compte membre.", urlConnexionMembre);
        }

      } catch (error) {
        console.error("Erreur appel mdptokenz :", error);

        afficherInformation(
          "Une erreur est survenue. Veuillez réessayer."
        );

        envoiEnCours = false;
        definirEtatBoutonValidation(false);
        if (boutonConfirmer) boutonConfirmer.disabled = false;
      }
    }
  }


  // Identité persistante du navigateur, commune aux sous-domaines de production.
  // L'effacement du cookie ne supprime jamais le propriétaire côté serveur.
  function obtenirIdentiteNavigateurMobile() {
    const ua = navigator.userAgent || "";
    if (!/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return null;
    const nom = "lcdp_navigateur_proprietaire";
    const lire = () => {
      const prefixe = nom + "=";
      const cookie = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(prefixe));
      return cookie ? cookie.slice(prefixe.length) : "";
    };
    let identite = lire();
    if (!/^[a-f0-9]{64}$/.test(identite)) {
      const octets = crypto.getRandomValues(new Uint8Array(32));
      identite = Array.from(octets, v => v.toString(16).padStart(2, "0")).join("");
    }
    const domaine = /(^|\.)lacleduparc\.fr$/i.test(window.location.hostname)
      ? "; Domain=.lacleduparc.fr" : "";
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = nom + "=" + identite + "; Path=/; Max-Age=34560000; SameSite=Lax" + domaine + secure;
    if (lire() !== identite) {
      throw new Error("Autorisez les cookies de l’application pour enregistrer ce navigateur.");
    }
    return identite;
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

  async function afficherInformation(message, redirectUrl = null) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    const texteMessage = message || "";

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
