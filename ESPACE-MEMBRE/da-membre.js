(() => {
  "use strict";

  const CONFIG_DA_MEMBRE = window.SITE_CONFIG || {};
  const PAGE_ABONNEMENT_MEMBRE = "/ESPACE-MEMBRE/abonnement-membre.html";
  const PAGE_REGLEMENT_CLUB = "/ESPACE-PUBLIC/reglement-club.html";
  const PAGE_REGLEMENT_APPLICATION = "/ESPACE-PUBLIC/reglement-app.html";

  const ENDPOINT_DA_MEMBRE = construireEndpointApi(
    "workerDaMembreUrl",
    "WORKER_DA_MEMBRE_URL",
    "da-membre-api"
  );

  function construireEndpointApi(cleModerne, cleLegacy, sousDomaineWorker) {
    const depuisConfig =
      CONFIG_DA_MEMBRE?.[cleModerne] ||
      CONFIG_DA_MEMBRE?.[cleLegacy] ||
      "";

    if (depuisConfig) return String(depuisConfig).replace(/\/+$/, "");

    if (typeof CONFIG_DA_MEMBRE.apiUrl === "function") {
      return CONFIG_DA_MEMBRE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    }

    return "";
  }

  function construireUrlPublic(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlPublic === "function") return window.LCDP_urlPublic(valeur);
    if (typeof CONFIG_DA_MEMBRE.publicUrl === "function") return CONFIG_DA_MEMBRE.publicUrl(valeur);

    return buildUrl(CONFIG_DA_MEMBRE.publicBaseUrl || CONFIG_DA_MEMBRE.PUBLIC_BASE || "", valeur);
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlMembre === "function") return window.LCDP_urlMembre(valeur);
    if (typeof CONFIG_DA_MEMBRE.membreUrl === "function") return CONFIG_DA_MEMBRE.membreUrl(valeur);

    return buildUrl(
      CONFIG_DA_MEMBRE.membreBaseUrl ||
      CONFIG_DA_MEMBRE.MEMBRE_BASE ||
      CONFIG_DA_MEMBRE.siteBase ||
      "",
      valeur
    );
  }

  function construireUrlObjet(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlObjet === "function") return window.LCDP_urlObjet(valeur);
    if (typeof CONFIG_DA_MEMBRE.objetUrl === "function") return CONFIG_DA_MEMBRE.objetUrl(valeur);

    const objetBase =
      CONFIG_DA_MEMBRE.objetBaseUrl ||
      CONFIG_DA_MEMBRE.OBJET_BASE ||
      buildUrl(CONFIG_DA_MEMBRE.publicBaseUrl || CONFIG_DA_MEMBRE.PUBLIC_BASE || "", "/OBJET");

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

  function chargerCssObjetUneFois(chemin) {
    const href = construireUrlObjet(chemin);

    if (document.querySelector(`link[data-lcdp-css-objet="${chemin}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const lien = document.createElement("link");
      lien.rel = "stylesheet";
      lien.href = href;
      lien.dataset.lcdpCssObjet = chemin;
      lien.onload = resolve;
      lien.onerror = () => reject(new Error("CSS OBJET introuvable : " + chemin));
      document.head.appendChild(lien);
    });
  }

  function chargerScriptObjetUneFois(chemin) {
    const src = construireUrlObjet(chemin);

    if (document.querySelector(`script[data-lcdp-script-objet="${chemin}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.lcdpScriptObjet = chemin;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Script OBJET introuvable : " + chemin));
      document.body.appendChild(script);
    });
  }

  function valeurBooleenneVraie(valeur) {
    return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
  }

  function normaliserStatuda(value) {
    const statut = String(value || "").trim().toLowerCase();

    return ["encours", "oui", "non"].includes(statut) ? statut : null;
  }

  function formaterDateDa(value) {
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

  function obtenirLightboxSlotDa() {
    let slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      slot = document.createElement("div");
      slot.id = "lcdp-lightbox-slot";
      document.body.appendChild(slot);
    }

    return slot;
  }

  async function afficherAlerteDa(message, options = {}) {
    try {
      await chargerDependancesAlerteDa();
    } catch (error) {
      console.error("CSS alerte DA :", error);
    }

    const container = document.createElement("div");
    container.className = "lcdp-da-membre-alerte";
    document.body.appendChild(container);

    let fragment = null;

    try {
      fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
    } catch (error) {
      console.error("Fragment alerte DA :", error);
      container.remove();
      alert(message || "");
      return true;
    }

    container.appendChild(fragment);

    const alerte = container.querySelector("[data-lcdp-box-alerte]");
    const texte = container.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = container.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = container.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      container.remove();
      alert(message || "");
      return true;
    }

    texte.textContent = message || "";
    boutonOk.textContent = options.boutonOk || "OK";

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

  async function chargerDependancesAlerteDa() {
    await chargerCssObjetUneFois("/BOX/02-box-alerte.css");
  }

  async function chargerDependancesWorkflowDa() {
    await Promise.all([
      chargerCssObjetUneFois("/BOX/02-box-dialogue-bouton.css"),
      chargerCssObjetUneFois("/BOX/04-box-workflow-abonnement.css")
    ]);
  }

  async function chargerDependancesFormulaireDa() {
    await Promise.all([
      chargerCssObjetUneFois("/BOX/03-box-formulaire.css"),
      chargerCssObjetUneFois("/BOX/03-box-champ-formulaire.css"),
      chargerScriptObjetUneFois("/BOX/03-box-formulaire.js")
    ]);

    if (typeof window.LCDP_creerFormulaire !== "function") {
      throw new Error("Composant formulaire introuvable.");
    }
  }

  async function chargerContexteDa() {
    if (!ENDPOINT_DA_MEMBRE) {
      throw new Error("Le service DA membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_DA_MEMBRE + "/contexte", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const data = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      throw new Error("Session membre inactive.");
    }

    if (!reponse.ok || !data || !(data.ok === true || data.success === true)) {
      throw new Error(data?.message || "Impossible de préparer votre DA.");
    }

    return data;
  }

  async function ouvrirPremiereDaMembre(options = {}) {
    const contexte = options.contexte || {};

    try {
      const data = await chargerContexteDa();
      const membre = data.membre || {};
      const parrain = data.parrain || {};
      const statuda = normaliserStatuda(data.statuda);
      const datenext = data.datenext || contexte.datenext || null;

      majContexte(options, {
        statuda,
        dateda: data.dateda || null,
        datenext
      });

      if (statuda === "encours") {
        await afficherAlerteDa("Vous avez une DA en cours.");
        return;
      }

      if (statuda === "oui") {
        window.location.href = construireUrlMembre(PAGE_ABONNEMENT_MEMBRE);
        return;
      }

      if (statuda === "non") {
        await afficherAlerteDa("Vous êtes membre invité. Vous pouvez faire une DA à partir du " + formaterDateDa(datenext) + ".");
        return;
      }

      await afficherIntroductionDa(membre, parrain, options);
    } catch (error) {
      console.error("Erreur DA membre :", error);
      await afficherAlerteDa(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  function majContexte(options, donnees) {
    const contexte = options?.contexte || null;

    if (contexte) {
      contexte.statudaConnue = true;
      contexte.statuda = normaliserStatuda(donnees.statuda);
      contexte.dateda = donnees.dateda || contexte.dateda || null;
      contexte.datenext = donnees.datenext || contexte.datenext || null;
    }

    if (typeof options?.onStatudaChange === "function") {
      options.onStatudaChange({
        statuda: normaliserStatuda(donnees.statuda),
        dateda: donnees.dateda || null,
        datenext: donnees.datenext || null
      });
    }
  }

  async function ouvrirWorkflowDa() {
    await chargerDependancesWorkflowDa();

    const slot = obtenirLightboxSlotDa();
    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/04-box-workflow-abonnement.html");
    slot.appendChild(fragment);

    const workflow = slot.querySelector("[data-lcdp-box-workflow-abonnement]");
    const contenu = slot.querySelector("[data-lcdp-workflow-abonnement-content]");
    const card = slot.querySelector("[data-lcdp-workflow-abonnement-card]");

    if (!workflow || !contenu || !card) {
      slot.innerHTML = "";
      throw new Error("Structure workflow DA incomplète.");
    }

    const boutonFermer = document.createElement("button");
    boutonFermer.type = "button";
    boutonFermer.className = "lcdp-box-dialogue-bouton__close";
    boutonFermer.setAttribute("aria-label", "Fermer");
    boutonFermer.textContent = "×";
    boutonFermer.addEventListener("click", demanderQuitterDa);
    card.insertBefore(boutonFermer, card.firstChild);

    workflow.addEventListener("click", (event) => {
      if (event.target === workflow) {
        demanderQuitterDa().catch(console.error);
      }
    });

    return { slot, contenu };
  }

  async function afficherIntroductionDa(membre, parrain, options) {
    const { contenu } = await ouvrirWorkflowDa();
    contenu.innerHTML = "";

    const bloc = document.createElement("div");
    bloc.className = "lcdp-stack";

    const titre = document.createElement("h2");
    titre.className = "lcdp-title-page-center";
    titre.textContent = "Demande d'abonnement";
    bloc.appendChild(titre);

    const intro = document.createElement("p");
    intro.textContent = "Cette demande permet au club de valider votre accès à l'abonnement.";
    bloc.appendChild(intro);

    ajouterBlocInfoDa(
      bloc,
      "À renseigner",
      "alias, mobile, qualités, loisirs, motivation, coordonnées bancaires de remboursement."
    );
    ajouterBlocInfoDa(
      bloc,
      "Après envoi",
      "votre demande passe en cours d'étude et peut donner lieu à un échange avec le club."
    );
    ajouterBlocInfoDa(
      bloc,
      "Règlements",
      "en transmettant la demande, vous confirmez votre accord avec les règlements du club et de l'application."
    );

    const mention = document.createElement("p");
    mention.className = "lcdp-text-muted";
    mention.append("Consulter le ");
    mention.appendChild(creerLienReglement("règlement du club", PAGE_REGLEMENT_CLUB));
    mention.append(" et le ");
    mention.appendChild(creerLienReglement("règlement de l'application", PAGE_REGLEMENT_APPLICATION));
    mention.append(".");
    bloc.appendChild(mention);

    const actions = document.createElement("div");
    actions.className = "lcdp-box-formulaire__actions";

    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-primary";
    bouton.textContent = "Faire ma demande";
    bouton.addEventListener("click", () => afficherFormulaireDa(membre, parrain, options).catch(console.error));

    actions.appendChild(bouton);
    bloc.appendChild(actions);
    contenu.appendChild(bloc);
  }

  function ajouterBlocInfoDa(parent, titre, texte) {
    const section = document.createElement("section");

    const h3 = document.createElement("h3");
    h3.textContent = titre;
    section.appendChild(h3);

    const p = document.createElement("p");
    p.textContent = texte;
    section.appendChild(p);

    parent.appendChild(section);
  }

  function creerLienReglement(label, href) {
    const lien = document.createElement("a");
    lien.className = "lcdp-link-secondary";
    lien.href = construireUrlPublic(href);
    lien.textContent = label;
    lien.target = "_blank";
    lien.rel = "noopener noreferrer";
    return lien;
  }

  async function afficherFormulaireDa(membre, parrain, options) {
    await chargerDependancesFormulaireDa();

    const slot = obtenirLightboxSlotDa();
    const contenu = slot.querySelector("[data-lcdp-workflow-abonnement-content]");

    if (!contenu) {
      throw new Error("Zone formulaire DA introuvable.");
    }

    contenu.innerHTML = "";
    const formSlot = document.createElement("div");
    formSlot.id = "lcdp-formulaire-da-slot";
    contenu.appendChild(formSlot);

    const form = await window.LCDP_creerFormulaire(formSlot, construireConfigurationDa());

    if (!form) {
      throw new Error("Formulaire DA introuvable.");
    }

    initialiserValeursFormulaireDa(form, membre, parrain);

    const boutonSubmit = form.querySelector("button[type='submit']");
    if (boutonSubmit) boutonSubmit.textContent = "Transmettre";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await transmettreDaDepuisFormulaire(form, options);
    });
  }

  function construireConfigurationDa() {
    return {
      id: "formulaire-da-membre",
      ariaLabel: "Première demande d'abonnement membre",
      titre: "Faire la 1ère demande d'abonnement (DA)",
      sousTitre: "La Clé du Parc | Demande d'abonnement",
      champs: [
        champLectureSeule("da-nom-membre", "nommembre", "Nom", "text", "Nom d'état civil"),
        champLectureSeule("da-prenom-membre", "prenommembre", "Prénom", "text", "Prénom d'état civil"),
        champTexte("da-alias", "alias", "Alias", true, "Alias souhaité"),
        champLectureSeule("da-email-membre", "emailmembre", "E-mail", "email", "E-mail de membre"),
        champTexte("da-tel", "tel", "N° de mobile personnel", true, "Mobile personnel", "tel", "numeric"),
        champTexte("da-autoquali", "autoquali", "Vos trois qualités", true, "Vos 3 qualités", "text", "text", 100),
        champTexte("da-autoloisir", "autoloisir", "Vos trois hobbies", true, "Vos 3 loisirs", "text", "text", 100),
        champTexte("da-autonouschoisir", "autonouschoisir", "Pourquoi La Clé du Parc ?", true, "Votre motivation", "text", "text", 100),
        {
          type: "checkbox",
          id: "da-checkboxvaleurs",
          name: "checkboxvaleurs",
          label: "Valeurs du club",
          checkboxLabel: "Vous reconnaissez-vous dans les valeurs de respect, de convivialité et de curiosité ?",
          required: false
        },
        {
          type: "checkbox",
          id: "da-targetfamill",
          name: "targetfamill",
          label: "Abonnement Famille",
          checkboxLabel: "Recherchez-vous un abonnement Famille ?",
          required: false
        },
        champEmailParrain(),
        champTexte("da-iban", "iban", "Votre IBAN", true, "IBAN remboursement", "text", "text"),
        champTexte("da-swift", "swift", "SWIFT de votre banque", true, "BIC / SWIFT", "text", "text"),
        champTexte("da-rib", "rib", "Nom du titulaire selon RIB", true, "Titulaire du RIB")
      ],
      bouton: {
        id: "bouton-transmettre-da",
        type: "submit",
        label: "Transmettre",
        style: "lcdp-button-primary"
      },
      noteHtml: `* Votre réponse est obligatoire pour compléter le formulaire, sauf parrain, valeurs du club et abonnement Famille.<br>Ce formulaire et les données qu’il contient sont soumis au <a href="${construireUrlPublic(PAGE_REGLEMENT_CLUB)}" target="_blank" rel="noopener noreferrer">règlement du club</a> et au <a href="${construireUrlPublic(PAGE_REGLEMENT_APPLICATION)}" target="_blank" rel="noopener noreferrer">règlement de l'application</a>.`
    };
  }

  function champLectureSeule(id, name, label, type = "text", placeholder = "") {
    return {
      type,
      id,
      name,
      label,
      required: false,
      placeholder: placeholder || label
    };
  }

  function champEmailParrain() {
    return {
      type: "email",
      id: "da-emailparrain",
      name: "emailparrain",
      label: "Êtes-vous parrainé ?",
      required: false,
      placeholder: "E-mail de votre parrain",
      autocomplete: "email",
      autocapitalize: "none",
      spellcheck: "false"
    };
  }

  function champTexte(id, name, label, required, placeholder, type = "text", inputmode = "text", maxlength = null) {
    const champ = {
      type,
      id,
      name,
      label,
      required,
      placeholder,
      inputmode
    };

    if (maxlength) {
      champ.description = String(maxlength) + " caractères maximum.";
    }

    return champ;
  }

  function initialiserValeursFormulaireDa(form, membre, parrain) {
    remplirInput(form, "nommembre", membre.nommembre || "", true);
    remplirInput(form, "prenommembre", membre.prenommembre || "", true);
    remplirInput(form, "emailmembre", membre.emailmembre || "", true);
    remplirInput(form, "emailparrain", parrain.emailparrain || membre.emailparrain || "", false);
    remplirInput(form, "alias", membre.alias || "", false);
    remplirInput(form, "tel", membre.tel || "", false);
    remplirInput(form, "autoquali", membre.autoquali || "", false);
    remplirInput(form, "autoloisir", membre.autoloisir || "", false);
    remplirInput(form, "autonouschoisir", membre.autonouschoisir || "", false);
    remplirInput(form, "iban", membre.iban || "", false);
    remplirInput(form, "swift", membre.swift || "", false);
    remplirInput(form, "rib", membre.rib || "", false);

    ["autoquali", "autoloisir", "autonouschoisir"].forEach((name) => {
      const input = form.querySelector(`[name="${name}"]`);
      if (input) input.maxLength = 100;
    });

    const checkboxValeurs = form.querySelector('[name="checkboxvaleurs"]');
    if (checkboxValeurs) checkboxValeurs.checked = valeurBooleenneVraie(membre.checkboxvaleurs);

    const targetFamille = form.querySelector('[name="targetfamill"]');
    if (targetFamille) targetFamille.checked = valeurBooleenneVraie(membre.targetfamill);
  }

  function remplirInput(form, name, value, readOnly) {
    const input = form.querySelector(`[name="${name}"]`);

    if (!input) return;

    input.value = value || "";

    if (readOnly) {
      input.readOnly = true;
      input.setAttribute("aria-readonly", "true");
    }
  }

  async function transmettreDaDepuisFormulaire(form, options) {
    const payload = lirePayloadDa(form);
    const erreur = verifierPayloadDa(payload);

    if (erreur) {
      await afficherAlerteDa(erreur);
      return;
    }

    const confirmation = await afficherAlerteDa("Votre DA est terminée ?", { boutonOk: "Confirmer" });
    if (!confirmation) return;

    const bouton = form.querySelector("button[type='submit']");
    if (bouton) {
      bouton.disabled = true;
      bouton.textContent = "Transmission...";
    }

    try {
      const reponse = await fetchAvecDelai(ENDPOINT_DA_MEMBRE + "/transmettre", {
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

      if (!reponse.ok || !data || !(data.ok === true || data.success === true)) {
        throw new Error(data?.message || "Impossible de transmettre votre DA.");
      }

      majContexte(options, {
        statuda: "encours",
        dateda: data.dateda || null,
        datenext: data.datenext || null
      });

      await afficherAlerteDa("Votre DA est envoyée. Merci. Nous espérons vous compter prochainement parmi nos membres abonnés !");
      obtenirLightboxSlotDa().innerHTML = "";

      if (typeof options?.onTerminee === "function") {
        options.onTerminee();
      }
    } catch (error) {
      console.error("Transmission DA :", error);

      const message =
        error?.name === "AbortError"
          ? "La transmission n'a pas répondu dans le délai attendu. Merci de réessayer."
          : error.message || "Erreur technique. Merci de réessayer.";

      await afficherAlerteDa(message);

      if (bouton) {
        bouton.disabled = false;
        bouton.textContent = "Transmettre";
      }
    }
  }

  async function fetchAvecDelai(url, options = {}, delaiMs = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), delaiMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function lirePayloadDa(form) {
    return {
      alias: valeurChamp(form, "alias"),
      emailparrain: nettoyerEmail(valeurChamp(form, "emailparrain")),
      tel: valeurChamp(form, "tel").replace(/\s+/g, ""),
      autoquali: valeurChamp(form, "autoquali"),
      autoloisir: valeurChamp(form, "autoloisir"),
      autonouschoisir: valeurChamp(form, "autonouschoisir"),
      checkboxvaleurs: caseCochee(form, "checkboxvaleurs"),
      targetfamill: caseCochee(form, "targetfamill"),
      iban: valeurChamp(form, "iban").replace(/\s+/g, "").toUpperCase(),
      swift: valeurChamp(form, "swift").replace(/\s+/g, "").toUpperCase(),
      rib: valeurChamp(form, "rib"),
      regleclub_v1: true,
      regleapp_v1: true
    };
  }

  function valeurChamp(form, name) {
    return String(form.querySelector(`[name="${name}"]`)?.value || "").trim();
  }

  function caseCochee(form, name) {
    return form.querySelector(`[name="${name}"]`)?.checked === true;
  }

  function verifierPayloadDa(payload) {
    if (!payload.alias) return "Votre alias est obligatoire.";
    if (payload.emailparrain && !emailValide(payload.emailparrain)) return "L’adresse e-mail du parrain est invalide.";
    if (!/^\d{10}$/.test(payload.tel)) return "Votre numéro de mobile doit contenir 10 chiffres, sans espace.";
    if (!payload.autoquali) return "Vos trois qualités sont obligatoires.";
    if (!payload.autoloisir) return "Vos trois hobbies sont obligatoires.";
    if (!payload.autonouschoisir) return "Pourquoi La Clé du Parc ? est obligatoire.";
    if (payload.autoquali.length > 100 || payload.autoloisir.length > 100 || payload.autonouschoisir.length > 100) return "Les champs limités ne doivent pas dépasser 100 caractères.";
    if (!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(payload.iban)) return "Votre IBAN est invalide.";
    if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(payload.swift)) return "Le SWIFT de votre banque est invalide.";
    if (!payload.rib) return "Le nom du titulaire selon RIB est obligatoire.";

    return "";
  }

  function nettoyerEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  async function demanderQuitterDa(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const ok = await afficherAlerteDa("Quitter ma DA ?");
    if (ok) obtenirLightboxSlotDa().innerHTML = "";
  }

  window.LCDP_ouvrirPremiereDaMembre = ouvrirPremiereDaMembre;
})();
