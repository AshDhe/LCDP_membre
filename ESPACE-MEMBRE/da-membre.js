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

  window.LCDP_ouvrirPremiereDaMembre = ouvrirPremiereDaMembre;

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

  function dateDaAtteinte(value) {
    if (!value) return false;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;

    return date.getTime() <= Date.now();
  }

  function obtenirLightboxSlotDa() {
    let slot = document.getElementById("lcdp-da-membre-overlay-slot");

    if (!slot) {
      slot = document.createElement("div");
      slot.id = "lcdp-da-membre-overlay-slot";
      document.body.appendChild(slot);
    }

    return slot;
  }

  function fermerWorkflowDa() {
    document.getElementById("lcdp-da-membre-overlay-slot")?.remove();
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
      if (typeof options.onAffiche === "function") options.onAffiche();
      alert(message || "");
      // Sans le dialogue générique, une alerte native ne peut pas confirmer
      // explicitement la transmission : ne jamais envoyer sur ce repli.
      return options.boutonOk !== "Confirmer";
    }

    container.appendChild(fragment);

    const alerte = container.querySelector("[data-lcdp-box-alerte]");
    const texte = container.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = container.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = container.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      container.remove();
      if (typeof options.onAffiche === "function") options.onAffiche();
      alert(message || "");
      // Sans le dialogue générique, une alerte native ne peut pas confirmer
      // explicitement la transmission : ne jamais envoyer sur ce repli.
      return options.boutonOk !== "Confirmer";
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
      // Le spinner reste visible pendant le chargement du composant. Il est
      // retiré une fois la boîte et ses événements effectivement montés.
      if (typeof options.onAffiche === "function") options.onAffiche();
    });
  }

  async function chargerDependancesAlerteDa() {
    await chargerCssObjetUneFois("/BOX/02-box-alerte.css");
  }

  async function chargerDependancesWorkflowDa() {
    await Promise.all([
      chargerCssObjetUneFois("/BOX/02-box-dialogue-bouton.css"),
      chargerCssObjetUneFois("/BOX/04-box-workflow-abonnement.css"),
      chargerCssObjetUneFois("/BOX/04-box-questionnaire.css?v=20261104-v1")
    ]);
  }

  async function chargerDependancesFormulaireDa() {
    await Promise.all([
      chargerCssObjetUneFois("/BOX/03-box-formulaire.css"),
      chargerCssObjetUneFois("/BOX/03-box-champ-formulaire.css"),
      chargerCssObjetUneFois("/BOX/04-box-dialogue-champ.css"),
      chargerScriptObjetUneFois("/BOX/03-box-formulaire.js")
    ]);

    if (typeof window.LCDP_creerFormulaire !== "function") {
      throw new Error("Composant formulaire introuvable.");
    }
  }

  // Attente autonome du module DA, fondée sur le même SVG commun que PLANIFIER.
  // Utilisée aussi lors du passage de l'introduction vers le formulaire.
  function afficherAttenteFormulaireDa(message) {
    const masque = document.createElement("div");
    masque.className = "lcdp-box-questionnaire-attente";
    masque.setAttribute("role", "status");
    masque.setAttribute("aria-label", message || "Chargement en cours");
    const image = document.createElement("img");
    image.src = construireUrlObjet("/BOX/pictowait.svg");
    image.alt = "";
    image.width = 64;
    image.height = 64;
    Object.assign(image.style, { width: "64px", height: "64px", objectFit: "contain" });
    Object.assign(masque.style, {
      position: "fixed", inset: "0", display: "flex",
      alignItems: "center", justifyContent: "center",
      zIndex: "2147483645", background: "rgba(255,255,255,0.94)",
      pointerEvents: "auto"
    });
    masque.appendChild(image);
    document.body.appendChild(masque);
    return () => masque.remove();
  }

  function signalerInterfaceDaPrete(options) {
    if (typeof options?.onAffiche === "function") options.onAffiche();
  }

  async function chargerContexteDa() {
    if (!ENDPOINT_DA_MEMBRE) {
      throw new Error("Le service DA membre n’est pas configuré.");
    }

    const reponse = await fetchAvecDelai(
      ENDPOINT_DA_MEMBRE + "/contexte",
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      },
      20000
    );

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
      const daactive = data.daactive === true
        ? true
        : data.daactive === false
          ? false
          : null;

      majContexte(options, {
        statuda,
        dateda: data.dateda || null,
        datenext,
        daactive
      });

      if (daactive === true) {
        if (statuda === "oui") {
          signalerInterfaceDaPrete(options);
          window.location.href = construireUrlMembre(PAGE_ABONNEMENT_MEMBRE);
          return;
        }

        signalerInterfaceDaPrete(options);
        await afficherAlerteDa("Vous avez une DA en cours.");
        return;
      }

      if (daactive === false) {
        if (!dateDaAtteinte(datenext)) {
          signalerInterfaceDaPrete(options);
          await afficherAlerteDa("Vous êtes membre invité. Vous pouvez faire une DA à partir du " + formaterDateDa(datenext) + ".");
          return;
        }

        await afficherIntroductionDa(membre, parrain, options);
        return;
      }

      if (statuda === "oui") {
        signalerInterfaceDaPrete(options);
        window.location.href = construireUrlMembre(PAGE_ABONNEMENT_MEMBRE);
        return;
      }

      if (statuda === "encours") {
        signalerInterfaceDaPrete(options);
        await afficherAlerteDa("Vous avez une DA en cours.");
        return;
      }

      if (statuda === "non") {
        signalerInterfaceDaPrete(options);
        await afficherAlerteDa("Vous êtes membre invité. Vous pouvez faire une DA à partir du " + formaterDateDa(datenext) + ".");
        return;
      }

      await afficherIntroductionDa(membre, parrain, options);
    } catch (error) {
      console.error("Erreur DA membre :", error);
      signalerInterfaceDaPrete(options);
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

      if (donnees.daactive === true || donnees.daactive === false) {
        contexte.daactive = donnees.daactive;
      }
    }

    if (typeof options?.onStatudaChange === "function") {
      options.onStatudaChange({
        statuda: normaliserStatuda(donnees.statuda),
        dateda: donnees.dateda || null,
        datenext: donnees.datenext || null,
        daactive: donnees.daactive === true
          ? true
          : donnees.daactive === false
            ? false
            : null
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
    workflow.classList.add("lcdp-box-workflow-abonnement--questionnaire");
    workflow.setAttribute("aria-label", "Demande d'abonnement");

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
    const bloc = document.createElement("article");
    bloc.className = "lcdp-box-questionnaire";

    const entete = document.createElement("header");
    entete.className = "lcdp-box-questionnaire__entete";
    const titre = document.createElement("h2");
    titre.className = "lcdp-box-questionnaire__titre";
    titre.id = "lcdp-da-questionnaire-titre";
    titre.textContent = "Demande d'abonnement (DA)";
    entete.appendChild(titre);
    bloc.appendChild(entete);

    const introduction = document.createElement("div");
    introduction.className = "lcdp-box-questionnaire__introduction";
    for (const texte of [
      "Une DA validée est nécessaire avant votre 1er abonnement.",
      "Elle permet de vous connaître et comprendre votre motivation à devenir membre abonné.",
      "Elle s'adresse à chaque membre invité du club qui souhaite devenir membre abonné."
    ]) {
      const p = document.createElement("p");
      p.textContent = texte;
      introduction.appendChild(p);
    }
    bloc.appendChild(introduction);

    ajouterBlocInfoDa(
      bloc,
      "À nous transmettre :",
      "état civil (nom, prénom), pièce d'identité (nous prenons une copie), n° de téléphone où vous êtes joignable, vos qualités / loisirs / motivation à devenir membre abonné, les valeurs du club, vos coordonnées bancaires en cas de remboursement et votre adresse de facturation."
    );
    ajouterBlocInfoDa(
      bloc,
      "Après envoi :",
      [
        "votre DA est étudiée par le club. Un rendez-vous visio ou visu peut être organisé.",
        "Vous êtes informé(e) par e-mail de la suite donnée à votre DA (retenue ou non retenue).",
        "Vous pouvez refaire une DA passé trois mois si la précédente n'a pas été retenue."
      ]
    );
    ajouterBlocInfoDa(
      bloc,
      "Félicitations !",
      "votre DA est retenue. Vous pouvez devenir membre abonné et inviter les membres invités du club. Votre premier bracelet de présence La Clé du Parc d'une valeur de 25€ TTC vous est offert à la souscription de votre premier abonnement et sous 5 à 8 jours de délai de livraison. Ce bracelet est nécessaire pour faire votre checkin-checkout d'accès dans les parcs.",
      true
    );

    const actions = document.createElement("div");
    actions.className = "lcdp-box-questionnaire__actions lcdp-box-formulaire__actions lcdp-workflow-abonnement__actions-full";
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-button lcdp-button-primary";
    bouton.textContent = "Faire ma DA";
    bouton.addEventListener("click", () => {
      if (bouton.disabled) return;
      bouton.disabled = true;
      afficherFormulaireDa(membre, parrain, options).catch(async erreur => {
        console.error("Préparation du formulaire DA :", erreur);
        if (bouton.isConnected) bouton.disabled = false;
        await afficherAlerteDa(erreur?.message || "Impossible d'ouvrir le formulaire de DA.");
      });
    });
    actions.appendChild(bouton);
    bloc.appendChild(actions);

    contenu.replaceChildren(bloc);
    // Le callback doit être appelé après le montage de la lightbox : il
    // retire l'attente du tunnel PLANIFIER dès que l'interface est prête.
    signalerInterfaceDaPrete(options);
  }

  function ajouterBlocInfoDa(parent, titre, textes, valorise = false) {
    const section = document.createElement("section");
    section.className = "lcdp-box-questionnaire__section";
    if (valorise) section.classList.add("lcdp-box-questionnaire__section--valorisee");

    const h3 = document.createElement("h3");
    h3.className = "lcdp-box-questionnaire__section-titre";
    h3.textContent = titre;
    section.appendChild(h3);

    for (const texte of (Array.isArray(textes) ? textes : [textes])) {
      const p = document.createElement("p");
      p.className = "lcdp-box-questionnaire__texte";
      p.textContent = texte;
      section.appendChild(p);
    }
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
    const terminerAttente = afficherAttenteFormulaireDa("Préparation du formulaire de DA");
    let contenu = null;
    let contenuPrecedent = null;
    let workflow = null;
    try {
      await chargerDependancesFormulaireDa();

      const slot = obtenirLightboxSlotDa();
      contenu = slot.querySelector("[data-lcdp-workflow-abonnement-content]");
      workflow = slot.querySelector("[data-lcdp-box-workflow-abonnement]");
      if (!contenu || !workflow) {
        throw new Error("Zone formulaire DA introuvable.");
      }
      // Les composants existants du formulaire sont réutilisés tels quels.
      // Seule la coque est une présentation générique type questionnaire.
      contenuPrecedent = Array.from(contenu.childNodes);
      const coque = document.createElement("section");
      coque.className = "lcdp-box-questionnaire lcdp-box-questionnaire--formulaire";
      coque.setAttribute("aria-label", "Formulaire de demande d'abonnement");
      const formSlot = document.createElement("div");
      formSlot.id = "lcdp-formulaire-da-slot";
      coque.appendChild(formSlot);
      contenu.replaceChildren(coque);
      workflow.classList.add("lcdp-box-workflow-abonnement--questionnaire-formulaire");

      const form = await window.LCDP_creerFormulaire(formSlot, construireConfigurationDa());
      if (!form) throw new Error("Formulaire DA introuvable.");

      initialiserValeursFormulaireDa(form, membre, parrain);
      organiserFormulaireDa(form);
      const boutonSubmit = form.querySelector("button[type='submit']");
      if (boutonSubmit) boutonSubmit.textContent = "Transmettre";

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await transmettreDaDepuisFormulaire(form, options);
      });
    } catch (error) {
      // Restaurer l'introduction en cas d'échec de construction du formulaire.
      if (contenu?.isConnected && contenuPrecedent) {
        contenu.replaceChildren(...contenuPrecedent);
        workflow?.classList.remove("lcdp-box-workflow-abonnement--questionnaire-formulaire");
      }
      throw error;
    } finally {
      terminerAttente();
    }
  }

  function construireConfigurationDa() {
    return {
      id: "formulaire-da-membre",
      ariaLabel: "Première demande d'abonnement membre",
      titre: "DA",
      sousTitre: "La Clé du Parc",
      champs: [
        champLectureSeule("da-nom-membre", "nommembre", "", "text", "Déjà renseigné"),
        champLectureSeule("da-prenom-membre", "prenommembre", "", "text", "Déjà renseigné"),
        champTexte("da-alias", "alias", "", false, "Indiquez ici un alias"),
        champLectureSeule("da-email-membre", "emailmembre", "", "email", "Déjà renseigné"),
        champTexte("da-tel", "tel", "N° de mobile personnel", true, "Numéro de téléphone mobile personnel", "tel", "numeric"),
        champTexte("da-autoquali", "autoquali", "Vos trois qualités", true, "Vos 3 qualités", "text", "text", 100),
        champTexte("da-autoloisir", "autoloisir", "Vos trois loisirs préférés", true, "Vos 3 loisirs", "text", "text", 100),
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
        champTexte("da-iban", "iban", "", false, "IBAN remboursement", "text", "text"),
        champTexte("da-swift", "swift", "", false, "BIC / SWIFT", "text", "text"),
        champTexte("da-rib", "rib", "", false, "Nom sur votre RIB"),
        champTexte("da-adresse1", "adresse1", "", true, "votre adresse", "text", "text"),
        champTexte("da-adresse2", "adresse2", "", true, "votre adresse", "text", "text"),
        champTexte("da-adresse3", "adresse3", "", false, "ville et code postal", "text", "text")
      ],
      bouton: {
        id: "bouton-transmettre-da",
        type: "submit",
        label: "Transmettre",
        style: "lcdp-button-primary"
      },
      noteHtml: `* Votre réponse est nécessaire.<br>Ce formulaire et les données qu’il contient sont soumis au <a href="${construireUrlPublic(PAGE_REGLEMENT_CLUB)}" target="_blank" rel="noopener noreferrer">règlement du club</a> et au <a href="${construireUrlPublic(PAGE_REGLEMENT_APPLICATION)}" target="_blank" rel="noopener noreferrer">règlement de l'application</a>.`
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

  function organiserFormulaireDa(form) {
    const sectionEtatCivil = creerSectionFormulaireDa(form, "Etat civil *", "nommembre");

    if (sectionEtatCivil) {
      const wrapperNom = deplacerChampDansSectionDa(form, sectionEtatCivil, "nommembre");
      const wrapperPrenom = deplacerChampDansSectionDa(form, sectionEtatCivil, "prenommembre");
      ajouterActionModificationEtatCivilDa(form, wrapperNom, "nommembre", "Nom", "modifier-nom-da-membre");
      ajouterActionModificationEtatCivilDa(form, wrapperPrenom, "prenommembre", "Prénom", "modifier-prenom-da-membre");
      deplacerChampDansSectionDa(form, sectionEtatCivil, "alias");
      deplacerChampDansSectionDa(form, sectionEtatCivil, "emailmembre");
      masquerLibelleChampDa(form, "nommembre");
      masquerLibelleChampDa(form, "prenommembre");
      masquerLibelleChampDa(form, "alias");
      masquerLibelleChampDa(form, "emailmembre");
    }

    const sectionTelephone = creerSectionFormulaireDa(form, "Téléphone *", "tel");

    if (sectionTelephone) {
      deplacerChampDansSectionDa(form, sectionTelephone, "tel");
    }

    const sectionMotivations = creerSectionFormulaireDa(form, "Qualités, loisirs et motivations *", "autoquali");
    if (sectionMotivations) {
      for (const champ of ["autoquali", "autoloisir", "autonouschoisir", "checkboxvaleurs", "targetfamill", "emailparrain"]) {
        deplacerChampDansSectionDa(form, sectionMotivations, champ);
      }
    }

    const sectionRemboursement = creerSectionFormulaireDa(form, "Coordonnées bancaires de remboursement *", "iban");

    if (sectionRemboursement) {
      deplacerChampDansSectionDa(form, sectionRemboursement, "iban");
      deplacerChampDansSectionDa(form, sectionRemboursement, "swift");
      deplacerChampDansSectionDa(form, sectionRemboursement, "rib");
      masquerLibelleChampDa(form, "iban");
      masquerLibelleChampDa(form, "swift");
      masquerLibelleChampDa(form, "rib");
    }

    const sectionAdresseFacturation = creerSectionFormulaireDa(form, "Adresse de facturation *", "adresse1");

    if (sectionAdresseFacturation) {
      deplacerChampDansSectionDa(form, sectionAdresseFacturation, "adresse1");
      deplacerChampDansSectionDa(form, sectionAdresseFacturation, "adresse2");
      deplacerChampDansSectionDa(form, sectionAdresseFacturation, "adresse3");
      masquerLibelleChampDa(form, "adresse1");
      masquerLibelleChampDa(form, "adresse2");
      masquerLibelleChampDa(form, "adresse3");
    }

    obtenirChampEtatCivilMajDa(form);
  }

  function creerSectionFormulaireDa(form, titre, nameReference) {
    const reference = trouverWrapperChampDa(form, nameReference);

    if (!reference || !reference.parentNode) return null;

    const section = document.createElement("section");
    section.className = "lcdp-da-formulaire-section lcdp-box-questionnaire__section";

    if (titre) {
      const h3 = document.createElement("h3");
      h3.className = "lcdp-da-formulaire-section__titre lcdp-box-questionnaire__section-titre";
      h3.textContent = titre;
      section.appendChild(h3);
    }

    reference.parentNode.insertBefore(section, reference);

    return section;
  }

  function deplacerChampDansSectionDa(form, section, name) {
    const wrapper = trouverWrapperChampDa(form, name);

    if (!wrapper || !section || wrapper === section || section.contains(wrapper)) return wrapper || null;

    section.appendChild(wrapper);

    return wrapper;
  }

  function trouverWrapperChampDa(form, name) {
    const input = form.querySelector(`[name="${name}"]`);

    if (!input) return null;

    return (
      input.closest("[data-lcdp-box-champ-formulaire]") ||
      input.closest("[data-lcdp-champ-formulaire]") ||
      input.closest(".lcdp-box-champ-formulaire") ||
      input.closest(".lcdp-box-formulaire__champ") ||
      input.closest("label") ||
      input.parentElement
    );
  }

  function masquerLibelleChampDa(form, name) {
    const input = form.querySelector(`[name="${name}"]`);
    const wrapper = trouverWrapperChampDa(form, name);

    if (!input || !wrapper) return;

    const label = wrapper.querySelector(`label[for="${input.id}"]`) || wrapper.querySelector(".lcdp-box-champ-formulaire__label");

    if (label) {
      label.textContent = "";
      label.hidden = true;
    }
  }

  function ajouterActionModificationEtatCivilDa(form, wrapper, name, label, boutonId) {
    const input = form.querySelector(`[name="${name}"]`);
    const zoneControl = wrapper?.querySelector("[data-lcdp-champ-control]") || input?.parentNode;

    if (!input || !wrapper || !zoneControl || document.getElementById(boutonId)) {
      return;
    }

    wrapper.classList.add(
      "lcdp-box-champ-formulaire--compte-action",
      "lcdp-box-champ-formulaire--modifiable"
    );
    zoneControl.classList.add("lcdp-box-champ-formulaire__control--modifiable");

    const bouton = document.createElement("button");
    bouton.id = boutonId;
    bouton.type = "button";
    bouton.className = "lcdp-box-champ-formulaire__action-edit";
    bouton.setAttribute("aria-label", "Modifier " + label.toLowerCase());
    bouton.title = "Modifier " + label.toLowerCase();
    bouton.innerHTML = `
      <svg class="lcdp-box-champ-formulaire__action-edit-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M4 16.8V20h3.2L17.9 9.3l-3.2-3.2L4 16.8Z"></path>
        <path d="M19.2 8 16 4.8l1.1-1.1a1.7 1.7 0 0 1 2.4 0l.8.8a1.7 1.7 0 0 1 0 2.4L19.2 8Z"></path>
      </svg>
    `;

    bouton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const nouvelleValeur = await ouvrirDialogueEtatCivilDa({
        label,
        name,
        value: input.value || "",
        autocomplete: name === "nommembre" ? "family-name" : "given-name"
      });

      if (nouvelleValeur === null) {
        return;
      }

      input.value = nouvelleValeur;
      obtenirChampEtatCivilMajDa(form).value = "true";
    });

    zoneControl.appendChild(bouton);
  }

  async function ouvrirDialogueEtatCivilDa(options) {
    const conteneur = document.createElement("div");
    document.body.appendChild(conteneur);

    try {
      const fragment = await chargerFragmentObjet("/BOX/04-box-dialogue-champ.html");
      conteneur.appendChild(fragment);

      const dialogue = conteneur.querySelector("[data-lcdp-box-dialogue-champ]");
      const titre = conteneur.querySelector("[data-lcdp-dialogue-champ-title]");
      const formulaire = conteneur.querySelector("[data-lcdp-dialogue-champ-form]");
      const zoneContent = conteneur.querySelector("[data-lcdp-dialogue-champ-content]");
      const erreur = conteneur.querySelector("[data-lcdp-dialogue-champ-error]");
      const boutonFermer = conteneur.querySelector("[data-lcdp-dialogue-champ-close]");
      const boutonAnnuler = conteneur.querySelector("[data-lcdp-dialogue-champ-cancel]");

      if (!dialogue || !titre || !formulaire || !zoneContent || !erreur || !boutonFermer || !boutonAnnuler) {
        throw new Error("Structure dialogue champ incomplète.");
      }

      titre.textContent = "Modifier " + options.label.toLowerCase();

      const champFragment = await chargerFragmentObjet("/BOX/03-box-champ-formulaire.html");
      const champ = champFragment.querySelector("[data-lcdp-box-champ-formulaire]");
      const zoneLabel = champFragment.querySelector("[data-lcdp-champ-label-zone]");
      const zoneControl = champFragment.querySelector("[data-lcdp-champ-control]");

      if (!champ || !zoneLabel || !zoneControl) {
        throw new Error("Structure champ formulaire incomplète.");
      }

      const id = "da-modification-" + options.name;
      const label = document.createElement("label");
      label.className = "lcdp-box-champ-formulaire__label";
      label.setAttribute("for", id);
      label.textContent = options.label;

      const input = document.createElement("input");
      input.id = id;
      input.name = options.name;
      input.type = "text";
      input.required = true;
      input.autocomplete = options.autocomplete || "off";
      input.value = options.value || "";

      zoneLabel.appendChild(label);
      zoneControl.appendChild(input);
      zoneContent.appendChild(champFragment);

      return await new Promise((resolve) => {
        let resolu = false;

        function fermer(valeur) {
          if (resolu) return;
          resolu = true;
          conteneur.remove();
          resolve(valeur);
        }

        boutonFermer.addEventListener("click", () => fermer(null));
        boutonAnnuler.addEventListener("click", () => fermer(null));

        dialogue.addEventListener("click", (event) => {
          if (event.target === dialogue) fermer(null);
        });

        formulaire.addEventListener("submit", (event) => {
          event.preventDefault();

          const valeur = String(input.value || "").trim().replace(/\s+/g, " ");

          if (!valeur) {
            erreur.textContent = options.label + " est obligatoire.";
            erreur.hidden = false;
            input.focus();
            return;
          }

          erreur.hidden = true;
          erreur.textContent = "";
          fermer(valeur);
        });

        document.addEventListener(
          "keydown",
          (event) => {
            if (event.key === "Escape") fermer(null);
          },
          { once: true }
        );

        input.focus();
        input.select();
      });
    } catch (error) {
      conteneur.remove();
      throw error;
    }
  }

  function obtenirChampEtatCivilMajDa(form) {
    let input = form.querySelector('[name="etatcivilmaj"]');

    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "etatcivilmaj";
      input.value = "false";
      form.appendChild(input);
    }

    return input;
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
    remplirInput(form, "adresse1", membre.adresse1 || membre.adressefacturation1 || "", false);
    remplirInput(form, "adresse2", membre.adresse2 || membre.adressefacturation2 || "", false);
    remplirInput(form, "adresse3", membre.adresse3 || membre.villecpfacturation || membre.villecp || "", false);

    ["autoquali", "autoloisir", "autonouschoisir"].forEach((name) => {
      const input = form.querySelector(`[name="${name}"]`);
      if (input) input.maxLength = 100;
    });

    const checkboxValeurs = form.querySelector('[name="checkboxvaleurs"]');
    if (checkboxValeurs) {
      checkboxValeurs.checked = false;
      checkboxValeurs.defaultChecked = false;
    }

    const targetFamille = form.querySelector('[name="targetfamill"]');
    if (targetFamille) {
      targetFamille.checked = false;
      targetFamille.defaultChecked = false;
    }
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
    if (
      form.dataset.lcdpTransmissionDaEnCours ===
      "true"
    ) {
      return;
    }

    const payload = lirePayloadDa(form);
    const erreur = verifierPayloadDa(payload);

    if (erreur) {
      await afficherAlerteDa(erreur);
      return;
    }

    // Première attente : l'ouverture du dialogue de confirmation peut
    // nécessiter le chargement du fragment et des CSS de l'alerte.
    const terminerAttenteConfirmation = afficherAttenteFormulaireDa("Préparation de la confirmation de votre DA…");
    let confirmation;
    try {
      confirmation = await afficherAlerteDa("Votre DA est terminée ?", {
        boutonOk: "Confirmer",
        onAffiche: terminerAttenteConfirmation
      });
    } finally {
      terminerAttenteConfirmation();
    }
    if (!confirmation) return;

    const bouton =
      form.querySelector("button[type='submit']");

    form.dataset.lcdpTransmissionDaEnCours =
      "true";

    if (bouton) {
      bouton.disabled = true;
      bouton.textContent = "Transmission...";
    }

    // Dès la validation de « Votre DA est terminée ? », couvrir la requête
    // /transmettre par le pictogramme d'attente commun. La confirmation
    // finale ou l'alerte d'erreur ne doivent jamais être recouvertes.
    const terminerAttenteTransmission = afficherAttenteFormulaireDa("Transmission de votre DA en cours…");
    let transmissionReussie = false;

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
        datenext: data.datenext || null,
        daactive: true
      });

      transmissionReussie = true;
      terminerAttenteTransmission();

      const confirmationLue =
        await afficherAlerteDa(
          "Votre DA est envoyée. Merci. Nous espérons vous compter prochainement parmi nos membres abonnés !"
        );

      fermerWorkflowDa();

      if (
        typeof options?.onTerminee === "function"
      ) {
        await Promise.resolve(
          options.onTerminee()
        );
      }

      if (confirmationLue === true) {
        window.requestAnimationFrame(() => {
          window.location.reload();
        });
      }
    } catch (error) {
      terminerAttenteTransmission();
      console.error("Transmission DA :", error);

      /*
       * Le bouton est rétabli avant l'Alert Box :
       * l'interface ne reste jamais figée sur « Transmission... ».
       */
      if (bouton && bouton.isConnected) {
        bouton.disabled = false;
        bouton.textContent = "Transmettre";
      }

      const message =
        error?.name === "AbortError"
          ? "La transmission n’a pas répondu dans le délai attendu. Vérifiez votre connexion puis réessayez."
          : error.message ||
            "Erreur technique. Merci de réessayer.";

      await afficherAlerteDa(message);
    } finally {
      terminerAttenteTransmission();
      delete form.dataset.lcdpTransmissionDaEnCours;

      if (
        !transmissionReussie &&
        bouton &&
        bouton.isConnected
      ) {
        bouton.disabled = false;
        bouton.textContent = "Transmettre";
      }
    }
  }

  async function fetchAvecDelai(
    url,
    options = {},
    delaiMs = 30000
  ) {
    const controller = new AbortController();
    let timeoutId = null;

    const promesseFetch = Promise.resolve().then(
      () =>
        fetch(url, {
          ...options,
          signal: controller.signal
        })
    );

    const promesseDelai = new Promise(
      (_resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          controller.abort();

          const erreur = new Error(
            "Délai de réponse dépassé."
          );
          erreur.name = "AbortError";
          reject(erreur);
        }, delaiMs);
      }
    );

    try {
      /*
       * Promise.race impose le délai même si window.fetch est
       * intercepté et reste bloqué avant de lancer la requête native.
       */
      return await Promise.race([
        promesseFetch,
        promesseDelai
      ]);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  function lirePayloadDa(form) {
    const etatcivilmaj = valeurChamp(form, "etatcivilmaj") === "true";

    return {
      etatcivilmaj,
      nommembre: etatcivilmaj ? valeurChamp(form, "nommembre") : "",
      prenommembre: etatcivilmaj ? valeurChamp(form, "prenommembre") : "",
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
      adresse1: valeurChamp(form, "adresse1"),
      adresse2: valeurChamp(form, "adresse2"),
      adresse3: valeurChamp(form, "adresse3"),
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
    if (payload.emailparrain && !emailValide(payload.emailparrain)) return "L’adresse e-mail du parrain est invalide.";
    if (!/^\d{10}$/.test(payload.tel)) return "Votre numéro de mobile doit contenir 10 chiffres, sans espace.";
    if (!payload.autoquali) return "Vos trois qualités sont obligatoires.";
    if (!payload.autoloisir) return "Vos trois loisirs sont obligatoires.";
    if (!payload.autonouschoisir) return "Pourquoi La Clé du Parc ? est obligatoire.";
    if (payload.autoquali.length > 100 || payload.autoloisir.length > 100 || payload.autonouschoisir.length > 100) return "Les champs limités ne doivent pas dépasser 100 caractères.";
    if (!payload.iban && !payload.swift && !payload.rib) return "Les coordonnées bancaires de remboursement sont obligatoires.";
    if (payload.iban && !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(payload.iban)) return "Votre IBAN est invalide.";
    if (payload.swift && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(payload.swift)) return "Le SWIFT de votre banque est invalide.";
    if (!payload.adresse1) return "L’adresse de facturation est obligatoire.";
    if (!payload.adresse2) return "Le deuxième champ d’adresse de facturation est obligatoire.";

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
    if (ok) fermerWorkflowDa();
  }

  window.LCDP_ouvrirPremiereDaMembre = ouvrirPremiereDaMembre;
})();
