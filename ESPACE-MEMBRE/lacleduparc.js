(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};
  const CHEMIN_PICTOWAIT = "/BOX/pictowait.gif";

  const ENDPOINT_LA_CLE_DU_PARC = construireEndpointApi(
    "workerLaCleDuParcUrl",
    "WORKER_LA_CLE_DU_PARC_URL",
    "W_LA_CLE_DU_PARC_URL",
    "w-la-cle-du-parc-api"
  );

  const PAGE_ACCUEIL_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/accueil-membre.html");

  const attenteInitiale = document.querySelector("[data-lcdp-cle-wait]");
  const workflowCle = document.querySelector("[data-lcdp-cle-workflow]");
  const ecranCheckin = document.querySelector('[data-lcdp-cle-screen="checkin"]');
  const ecranActif = document.querySelector('[data-lcdp-cle-screen="active"]');
  const boutonCode1 = document.querySelector('[data-lcdp-cle-code-button="1"]');
  const boutonCode2 = document.querySelector('[data-lcdp-cle-code-button="2"]');
  const valeurCode1 = document.querySelector('[data-lcdp-cle-code-value="1"]');
  const valeurCode2 = document.querySelector('[data-lcdp-cle-code-value="2"]');
  const boutonValider = document.querySelector("[data-lcdp-cle-submit]");
  const boutonAnnuler = document.querySelector("[data-lcdp-cle-cancel]");
  const boutonBrighta = document.querySelector("[data-lcdp-cle-brighta]");
  const boutonCheckout = document.querySelector("[data-lcdp-cle-checkout]");
  const texteCooldown = document.querySelector("[data-lcdp-cle-cooldown]");

  let code1 = "";
  let code2 = "";
  let cleActive = false;
  let navigationVerrouillee = false;
  let brightaDisponibleA = 0;
  let intervalleCooldown = null;
  let timeoutEtatPresence = null;
  let timeoutExpirationVerrouillage = null;
  let depassementPresenceA = 0;
  let modeSaisie = "checkin";
  let bluetoothActif = null;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    lierActions();
    appliquerRoutesSite(document);

    if (!ENDPOINT_LA_CLE_DU_PARC) {
      masquerAttenteInitiale();
      await initialiserGabaritMembre();
      await afficherAlerte("Le service Ma clé n'est pas configuré.");
      redirigerAccueil();
      return;
    }

    try {
      const statut = await appelerApi("/status", { method: "GET" });
      bluetoothActif = statut?.bluetooth || null;
      masquerAttenteInitiale();

      if (statut.allowed !== true) {
        await initialiserGabaritMembre();
        await afficherAlerte(messageErreurAccesCle(statut));
        redirigerAccueil();
        return;
      }

      if (statut.screen === "active" || statut.checkinActive === true) {
        afficherEcranActif(
          statut.brightaAvailableAt || statut.brightaDisponibleA || "",
          statut.overstayAt || "",
          statut.presenceState || "active",
          statut.lockExpiresAt || ""
        );
        return;
      }

      await initialiserGabaritMembre();
      afficherEcranCheckin();
    } catch (error) {
      masquerAttenteInitiale();

      if (error?.sessionRemplaceeTraitee === true) return;

      console.error("Erreur initialisation Ma clé :", error);

      try {
        await initialiserGabaritMembre();
      } catch (gabaritError) {
        console.error("Erreur gabarit membre Ma clé :", gabaritError);
      }

      await afficherAlerte(error.message || "Impossible d'ouvrir Ma clé.");
      redirigerAccueil();
    }
  }

  function lierActions() {
    boutonCode1?.addEventListener("click", () => saisirCode(1));
    boutonCode2?.addEventListener("click", () => saisirCode(2));
    boutonValider?.addEventListener("click", validerCle);
    boutonAnnuler?.addEventListener("click", gererAnnulationSaisie);
    boutonBrighta?.addEventListener("click", gererBrighta);
    boutonCheckout?.addEventListener("click", gererCheckout);

    window.addEventListener("popstate", gererRetourNavigateur);
    window.addEventListener("beforeunload", gererFermeturePage);
  }

  async function saisirCode(numero) {
    const valeurActuelle = numero === 1 ? code1 : code2;
    const valeur = await ouvrirDialogueChamp({
      titre: "Code n°" + String(numero),
      label: "Saisissez le code à 4 chiffres",
      valeur: valeurActuelle,
      longueur: 4,
      boutonValider: "Valider"
    });

    if (valeur === null) return;

    if (numero === 1) {
      code1 = valeur;
      afficherValeurCode(valeurCode1, code1);
      return;
    }

    code2 = valeur;
    afficherValeurCode(valeurCode2, code2);
  }

  function afficherValeurCode(element, valeur) {
    if (!element) return;
    element.textContent = valeur || "Saisir le code";
    element.classList.toggle("is-filled", Boolean(valeur));
  }

  async function validerCle() {
    if (!/^\d{4}$/.test(code1) || !/^\d{4}$/.test(code2)) {
      await afficherAlerte("Saisissez les deux codes à 4 chiffres.");
      return;
    }

    definirChargementBoutonLogo(true);

    try {
      const estCheckout = modeSaisie === "checkout";
      let appareilCheckout = null;
      let erreurExtinctionBracelet = null;

      if (estCheckout && bluetoothActif) {
        try {
          appareilCheckout = await selectionnerBraceletBluetooth(
            bluetoothActif
          );
        } catch (errorBluetooth) {
          erreurExtinctionBracelet = errorBluetooth;
        }
      }

      const geolocalisation = await obtenirGeolocalisation();
      const resultat = await appelerApi(estCheckout ? "/checkout" : "/checkin", {
        method: "POST",
        body: {
          code1,
          code2,
          geolocalisation
        }
      });

      if (estCheckout) {
        if (resultat.success !== true || resultat.checkout !== true) {
          throw creerErreurApi(resultat, "Votre clé n'est pas reconnue");
        }

        cleActive = false;
        document.body.classList.remove("is-cle-overstay");
        arreterTransitionPresence();
        if (timeoutExpirationVerrouillage) {
          window.clearTimeout(timeoutExpirationVerrouillage);
          timeoutExpirationVerrouillage = null;
        }
        deverrouillerNavigation();

        if (resultat.braceletOff) {
          try {
            if (!appareilCheckout) {
              throw erreurExtinctionBracelet ||
                new Error("Le bracelet Bluetooth n'a pas pu être sélectionné.");
            }

            await envoyerCommandeBluetooth(
              appareilCheckout,
              resultat.braceletOff.bluetooth || bluetoothActif,
              resultat.braceletOff.command
            );
          } catch (errorBluetooth) {
            console.error(
              "Erreur extinction Bluetooth au checkout :",
              errorBluetooth
            );

            await afficherAlerte(
              "Votre checkout est enregistré. Le bracelet n'a pas pu être éteint automatiquement.",
              { fermetureParOkUniquement: true }
            );
            redirigerAccueil();
            return;
          }
        }

        await afficherAlerte("Votre checkout est enregistré.", {
          fermetureParOkUniquement: true
        });
        redirigerAccueil();
        return;
      }

      if (resultat.success !== true || resultat.checkin !== true) {
        throw creerErreurApi(resultat, "Votre clé n'est pas reconnue");
      }

      await afficherAlerte("Votre clé est validée.", {
        fermetureParOkUniquement: true
      });

      afficherEcranActif(
        resultat.brightaAvailableAt || "",
        resultat.overstayAt || "",
        resultat.presenceState || "active",
        resultat.lockExpiresAt || ""
      );
    } catch (error) {
      if (error?.sessionRemplaceeTraitee === true) return;

      console.error("Erreur validation clé :", error);

      if (error.reason === "key_unrecognized") {
        await afficherAlerte("Votre clé n'est pas reconnue", {
          boutonOkLabel: "Recommencer"
        });
        return;
      }

      await afficherAlerte(error.message || "Impossible de valider votre clé.");
    } finally {
      definirChargementBoutonLogo(false);
    }
  }

  async function gererBrighta() {
    if (!cleActive || Date.now() < brightaDisponibleA) return;

    definirBoutonEnCours(boutonBrighta, true);

    try {
      const preparation = await preparerConfirmation("brighta");
      if (!preparation) return;

      if (!preparation.bluetooth) {
        throw new Error("Le Bluetooth de votre bracelet n'est pas configuré.");
      }

      const confirmation = await demanderCodeConfirmation(
        "Confirmer BRIGHT-A",
        preparation.code
      );

      if (!confirmation) return;

      const appareil = await selectionnerBraceletBluetooth(
        preparation.bluetooth
      );

      let geolocalisation = null;

      if (preparation.locationRequired === true) {
        geolocalisation = await obtenirGeolocalisation();
      }

      const resultatPreparation = await appelerApi("/brighta", {
        method: "POST",
        body: {
          code: confirmation,
          token: preparation.token,
          geolocalisation
        }
      });

      if (
        resultatPreparation.success !== true ||
        resultatPreparation.prepared !== true ||
        !resultatPreparation.command
      ) {
        throw creerErreurApi(
          resultatPreparation,
          "Impossible de préparer l'allumage du bracelet."
        );
      }

      const ack = await envoyerCommandeBluetooth(
        appareil,
        resultatPreparation.bluetooth || preparation.bluetooth,
        resultatPreparation.command
      );

      const resultat = await appelerApi("/brighta-confirm", {
        method: "POST",
        body: {
          command: resultatPreparation.command,
          ack,
          geolocalisation
        }
      });

      if (resultat.success !== true || resultat.brighta !== true) {
        throw creerErreurApi(
          resultat,
          "Le bracelet n'a pas confirmé son allumage."
        );
      }

      definirDisponibiliteBrighta(
        resultat.brightaAvailableAt || ""
      );

      await afficherAlerte("Votre bracelet est allumé.", {
        fermetureParOkUniquement: true
      });
    } catch (error) {
      if (error?.sessionRemplaceeTraitee === true) return;

      console.error("Erreur BRIGHT-A :", error);

      const message =
        error?.name === "NotFoundError"
          ? "Connexion Bluetooth au bracelet annulée."
          : error?.message ||
            "Le bracelet n'a pas pu être allumé. Vous pouvez réessayer.";

      await afficherAlerte(message);
    } finally {
      definirBoutonEnCours(boutonBrighta, false);
      actualiserCooldown();
    }
  }

  async function gererCheckout() {
    if (!cleActive) return;

    definirBoutonEnCours(boutonCheckout, true);

    try {
      const statut = await appelerApi("/status", { method: "GET" });
      bluetoothActif = statut?.bluetooth || bluetoothActif;
      const visiteToujoursActive =
        statut?.success === true &&
        (statut.screen === "active" || statut.checkinActive === true);

      if (!visiteToujoursActive) {
        cleActive = false;
        arreterTransitionPresence();

        if (timeoutExpirationVerrouillage) {
          window.clearTimeout(timeoutExpirationVerrouillage);
          timeoutExpirationVerrouillage = null;
        }

        deverrouillerNavigation();
        await afficherAlerte("Cette visite est déjà terminée.");
        window.location.replace(PAGE_ACCUEIL_MEMBRE);
        return;
      }

      if (statut.checkoutAllowed === false) {
        await afficherAlerte(
          statut.checkoutMessage ||
          "Votre parrain doit d'abord effectuer son checkout."
        );
        return;
      }

      reinitialiserCodes();
      modeSaisie = "checkout";
      ecranActif.hidden = true;
      ecranCheckin.hidden = false;
      document.body.classList.remove("is-cle-active", "is-cle-overstay");
      document.body.classList.add("is-cle-checkout");
      verrouillerNavigation();
    } catch (error) {
      if (error?.sessionRemplaceeTraitee === true) return;

      console.error("Erreur vérification checkout :", error);
      await afficherAlerte(
        error.message || "Impossible de vérifier l'état de votre visite."
      );
    } finally {
      definirBoutonEnCours(boutonCheckout, false);
    }
  }

  function gererAnnulationSaisie() {
    if (modeSaisie !== "checkout") {
      redirigerAccueil();
      return;
    }

    modeSaisie = "checkin";
    reinitialiserCodes();
    ecranCheckin.hidden = true;
    ecranActif.hidden = false;
    document.body.classList.remove("is-cle-checkout");
    document.body.classList.add("is-cle-active");
    actualiserEtatPresence(false);
    verrouillerNavigation();
  }

  async function preparerConfirmation(action) {
    const resultat = await appelerApi("/action-code", {
      method: "POST",
      body: { action }
    });

    if (
      resultat.success !== true ||
      !/^\d{2}$/.test(String(resultat.code || "")) ||
      !resultat.token
    ) {
      throw creerErreurApi(resultat, "Impossible de préparer la confirmation.");
    }

    return {
      code: String(resultat.code),
      token: String(resultat.token),
      locationRequired: resultat.locationRequired === true,
      bracelet: resultat.bracelet || null,
      bluetooth: resultat.bluetooth || null
    };
  }

  async function demanderCodeConfirmation(titre, codeAffiche) {
    return ouvrirDialogueChamp({
      titre,
      label: "Saisissez le code affiché",
      longueur: 2,
      boutonValider: "Confirmer",
      codeAffiche
    });
  }

  function masquerAttenteInitiale() {
    if (!attenteInitiale) return;
    attenteInitiale.hidden = true;
  }

  function afficherWorkflowCle() {
    if (!workflowCle) return;
    workflowCle.hidden = false;
  }

  function afficherEcranCheckin() {
    modeSaisie = "checkin";
    cleActive = false;
    reinitialiserCodes();
    ecranCheckin.hidden = false;
    ecranActif.hidden = true;
    document.body.classList.remove("is-cle-active", "is-cle-checkout", "is-cle-overstay");
    arreterTransitionPresence();
    deverrouillerNavigation();
    afficherWorkflowCle();
  }

  function afficherEcranActif(disponibiliteBrighta, overstayAt, presenceState, lockExpiresAt) {
    modeSaisie = "checkin";
    cleActive = true;
    ecranCheckin.hidden = true;
    ecranActif.hidden = false;
    document.body.classList.add("is-cle-active");
    document.body.classList.remove("is-cle-checkout");
    definirEtatPresence(overstayAt, presenceState);
    definirExpirationVerrouillage(lockExpiresAt);
    definirDisponibiliteBrighta(disponibiliteBrighta);
    verrouillerNavigation();
    afficherWorkflowCle();
  }

  function definirEtatPresence(overstayAt, presenceState) {
    const date = new Date(overstayAt || 0);
    depassementPresenceA = Number.isNaN(date.getTime()) ? 0 : date.getTime();

    arreterTransitionPresence(false);
    actualiserEtatPresence(presenceState === "overstay");

    if (depassementPresenceA > Date.now()) {
      timeoutEtatPresence = window.setTimeout(() => {
        actualiserEtatPresence(false);
      }, depassementPresenceA - Date.now() + 50);
    }
  }

  function definirExpirationVerrouillage(lockExpiresAt) {
    if (timeoutExpirationVerrouillage) {
      window.clearTimeout(timeoutExpirationVerrouillage);
      timeoutExpirationVerrouillage = null;
    }

    const date = new Date(lockExpiresAt || 0);
    const expiration = Number.isNaN(date.getTime()) ? 0 : date.getTime();

    if (!expiration) return;

    const delai = expiration - Date.now();

    if (delai <= 0) {
      terminerVerrouillageExpire();
      return;
    }

    timeoutExpirationVerrouillage = window.setTimeout(
      terminerVerrouillageExpire,
      delai + 50
    );
  }

  function terminerVerrouillageExpire() {
    if (!cleActive) return;

    cleActive = false;
    document.body.classList.remove("is-cle-active", "is-cle-overstay", "is-cle-checkout");
    arreterTransitionPresence();
    deverrouillerNavigation();
    redirigerAccueil();
  }

  function actualiserEtatPresence(forcerDepassement) {
    const depassee =
      forcerDepassement === true ||
      (depassementPresenceA > 0 && Date.now() >= depassementPresenceA);

    document.body.classList.toggle("is-cle-overstay", cleActive && depassee);
  }

  function arreterTransitionPresence(reinitialiser = true) {
    if (timeoutEtatPresence) {
      window.clearTimeout(timeoutEtatPresence);
      timeoutEtatPresence = null;
    }

    if (reinitialiser) {
      depassementPresenceA = 0;
    }
  }


  function reinitialiserCodes() {
    code1 = "";
    code2 = "";
    afficherValeurCode(valeurCode1, "");
    afficherValeurCode(valeurCode2, "");
  }

  function definirDisponibiliteBrighta(valeur) {
    const date = new Date(valeur || 0);
    brightaDisponibleA = Number.isNaN(date.getTime()) ? 0 : date.getTime();
    actualiserCooldown();

    if (intervalleCooldown) {
      window.clearInterval(intervalleCooldown);
    }

    intervalleCooldown = window.setInterval(actualiserCooldown, 30000);
  }

  function actualiserCooldown() {
    if (!boutonBrighta || !texteCooldown) return;

    const restant = brightaDisponibleA - Date.now();

    if (restant <= 0) {
      boutonBrighta.disabled = false;
      boutonBrighta.textContent = "BRIGHT-A";
      texteCooldown.hidden = true;
      texteCooldown.textContent = "";
      return;
    }

    const minutes = Math.max(1, Math.ceil(restant / 60000));
    boutonBrighta.disabled = true;
    boutonBrighta.textContent = "BRIGHT-A";
    texteCooldown.hidden = false;
    texteCooldown.textContent = "Disponible dans " + String(minutes) + " min";
  }

  function verrouillerNavigation() {
    if (navigationVerrouillee) return;
    navigationVerrouillee = true;
    window.history.pushState({ lcdpCleActive: true }, "", window.location.href);
  }

  function deverrouillerNavigation() {
    navigationVerrouillee = false;
  }

  function gererRetourNavigateur() {
    if (!cleActive || !navigationVerrouillee) return;
    window.history.pushState({ lcdpCleActive: true }, "", window.location.href);
  }

  function gererFermeturePage(event) {
    if (!cleActive) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function definirChargementBoutonLogo(enCours) {
    if (!boutonValider) return;

    boutonValider.disabled = enCours;
    boutonValider.classList.toggle("is-loading", enCours);

    const image = boutonValider.querySelector(".lcdp-button-logo__image, img");

    if (!image) return;

    if (enCours) {
      if (!image.dataset.lcdpSrcInitial) {
        image.dataset.lcdpSrcInitial = image.getAttribute("src") || "";
      }

      image.src = construireUrlObjet(CHEMIN_PICTOWAIT);
      image.alt = "";
      return;
    }

    const srcInitial = image.dataset.lcdpSrcInitial || "";

    if (srcInitial) {
      image.setAttribute("src", srcInitial);
    }

    delete image.dataset.lcdpSrcInitial;
  }

  function definirBoutonEnCours(bouton, enCours) {
    if (!bouton) return;
    bouton.dataset.lcdpEnCours = enCours ? "true" : "false";
    bouton.disabled = enCours || (bouton === boutonBrighta && Date.now() < brightaDisponibleA);
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
    const contenu = slot.querySelector("[data-lcdp-dialogue-champ-content]");
    const erreur = slot.querySelector("[data-lcdp-dialogue-champ-error]");
    const boutonFermer = slot.querySelector("[data-lcdp-dialogue-champ-close]");
    const boutonAnnuler = slot.querySelector("[data-lcdp-dialogue-champ-cancel]");
    const boutonSoumettre = slot.querySelector("[data-lcdp-dialogue-champ-submit]");

    if (
      !dialogue ||
      !titre ||
      !formulaire ||
      !contenu ||
      !erreur ||
      !boutonFermer ||
      !boutonAnnuler ||
      !boutonSoumettre
    ) {
      slot.innerHTML = "";
      throw new Error("Structure du dialogue de saisie incomplète.");
    }

    titre.textContent = options.titre || "Saisie";
    boutonSoumettre.textContent = options.boutonValider || "Valider";
    contenu.innerHTML = "";

    if (options.codeAffiche) {
      const note = document.createElement("p");
      note.className = "lcdp-cle-dialogue-note";
      note.textContent = "Code de confirmation";

      const code = document.createElement("p");
      code.className = "lcdp-cle-confirm-code";
      code.textContent = String(options.codeAffiche);

      contenu.appendChild(note);
      contenu.appendChild(code);
    }

    const champ = document.createElement("label");
    champ.className = "lcdp-box-dialogue-champ__field";

    const libelle = document.createElement("span");
    libelle.className = "lcdp-box-dialogue-champ__label";
    libelle.textContent = options.label || "Code";

    const input = document.createElement("input");
    input.className = "lcdp-box-dialogue-champ__input";
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "one-time-code";
    input.maxLength = Number(options.longueur || 4);
    input.pattern = "[0-9]*";
    input.value = String(options.valeur || "");
    input.setAttribute("aria-label", libelle.textContent);

    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, input.maxLength);
      erreur.hidden = true;
      erreur.textContent = "";
    });

    champ.appendChild(libelle);
    champ.appendChild(input);
    contenu.appendChild(champ);

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur);
      }

      formulaire.addEventListener("submit", (event) => {
        event.preventDefault();
        const valeur = input.value.replace(/\D/g, "");

        if (valeur.length !== input.maxLength) {
          erreur.textContent = "Saisissez exactement " + String(input.maxLength) + " chiffres.";
          erreur.hidden = false;
          input.focus();
          return;
        }

        fermer(valeur);
      });

      boutonFermer.addEventListener("click", () => fermer(null));
      boutonAnnuler.addEventListener("click", () => fermer(null));
      dialogue.addEventListener("click", (event) => {
        if (event.target === dialogue) fermer(null);
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") fermer(null);
        },
        { once: true }
      );

      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    });
  }

  async function afficherAlerte(message, options = {}) {
    const slot = document.getElementById("lcdp-lightbox-slot");
    if (!slot) return false;

    slot.innerHTML = "";
    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
    slot.appendChild(fragment);

    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      slot.innerHTML = "";
      throw new Error("Structure de l'alerte incomplète.");
    }

    texte.textContent = normaliserPonctuation(message);
    boutonOk.textContent = options.boutonOkLabel || "OK";

    const fermetureParOkUniquement =
      options.fermetureParOkUniquement === true;

    if (fermetureParOkUniquement) {
      boutonFermer.hidden = true;
    }

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur);
      }

      boutonFermer.addEventListener("click", () => {
        if (!fermetureParOkUniquement) fermer(false);
      });
      boutonOk.addEventListener("click", () => fermer(true));
      alerte.addEventListener("click", (event) => {
        if (!fermetureParOkUniquement && event.target === alerte) {
          fermer(false);
        }
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (!fermetureParOkUniquement && event.key === "Escape") {
            fermer(false);
          }
        },
        { once: true }
      );
    });
  }

  async function selectionnerBraceletBluetooth(configuration) {
    if (!navigator.bluetooth) {
      throw new Error(
        "L'allumage Bluetooth du bracelet n'est pas disponible sur ce navigateur."
      );
    }

    const nom = String(configuration?.name || "").trim();
    const serviceUuid = String(configuration?.serviceUuid || "").trim();

    if (!nom || !serviceUuid) {
      throw new Error("La configuration Bluetooth du bracelet est incomplète.");
    }

    return navigator.bluetooth.requestDevice({
      filters: [{ name: nom }],
      optionalServices: [serviceUuid]
    });
  }

  async function envoyerCommandeBluetooth(
    appareil,
    configuration,
    commande
  ) {
    if (!appareil) {
      throw new Error("Aucun bracelet Bluetooth n'a été sélectionné.");
    }

    const serviceUuid = String(configuration?.serviceUuid || "").trim();
    const commandUuid = String(
      configuration?.commandCharacteristicUuid || ""
    ).trim();
    const ackUuid = String(
      configuration?.ackCharacteristicUuid || ""
    ).trim();
    const commandeTexte = String(commande || "").trim();

    if (
      !serviceUuid ||
      !commandUuid ||
      !ackUuid ||
      !commandeTexte
    ) {
      throw new Error("La commande Bluetooth du bracelet est incomplète.");
    }

    const serveur = appareil.gatt?.connected
      ? appareil.gatt
      : await appareil.gatt?.connect();

    if (!serveur) {
      throw new Error("Impossible de se connecter au bracelet Bluetooth.");
    }

    try {
      const service = await serveur.getPrimaryService(serviceUuid);
      const caracteristiqueCommande =
        await service.getCharacteristic(commandUuid);
      const caracteristiqueAck =
        await service.getCharacteristic(ackUuid);

      await caracteristiqueAck.startNotifications();

      let annulerAttenteAck = () => {};

      const ackPromise = new Promise((resolve, reject) => {
        let termine = false;

        const nettoyer = () => {
          if (termine) return;
          termine = true;
          window.clearTimeout(timeout);
          caracteristiqueAck.removeEventListener(
            "characteristicvaluechanged",
            gererAck
          );
        };

        const timeout = window.setTimeout(() => {
          if (termine) return;
          nettoyer();
          reject(
            new Error("Le bracelet n'a pas confirmé la commande Bluetooth.")
          );
        }, 10000);

        function gererAck(event) {
          if (termine) return;

          const vue = event?.target?.value;

          if (!vue) return;

          const octets = new Uint8Array(
            vue.buffer,
            vue.byteOffset,
            vue.byteLength
          );
          const valeur = new TextDecoder().decode(octets).trim();

          if (!valeur) return;

          nettoyer();
          resolve(valeur);
        }

        annulerAttenteAck = nettoyer;

        caracteristiqueAck.addEventListener(
          "characteristicvaluechanged",
          gererAck
        );
      });

      const donnees = new TextEncoder().encode(commandeTexte);

      try {
        if (
          typeof caracteristiqueCommande.writeValueWithResponse ===
          "function"
        ) {
          await caracteristiqueCommande.writeValueWithResponse(donnees);
        } else {
          await caracteristiqueCommande.writeValue(donnees);
        }
      } catch (error) {
        annulerAttenteAck();
        throw error;
      }

      return await ackPromise;
    } finally {
      if (appareil.gatt?.connected) {
        appareil.gatt.disconnect();
      }
    }
  }

  function obtenirGeolocalisation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("La géolocalisation n'est pas disponible sur ce téléphone."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: new Date(position.timestamp || Date.now()).toISOString()
          });
        },
        () => {
          reject(new Error("La géolocalisation est nécessaire pour valider cette action."));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    });
  }

  async function appelerApi(chemin, options = {}) {
    const configuration = {
      method: options.method || "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    };

    if (options.body !== undefined) {
      configuration.headers["Content-Type"] = "application/json";
      configuration.body = JSON.stringify(options.body);
    }

    const reponse = await fetch(ENDPOINT_LA_CLE_DU_PARC + chemin, configuration);
    const resultat = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      if (
        String(resultat?.reason || "") === "session_replaced" &&
        typeof window.LCDP_gererSessionRemplacee === "function"
      ) {
        await window.LCDP_gererSessionRemplacee();
        const erreur = new Error(
          resultat?.message ||
          "Ce compte vient d'être connecté sur un autre appareil. Votre session a été fermée."
        );
        erreur.reason = "session_replaced";
        erreur.sessionRemplaceeTraitee = true;
        throw erreur;
      }

      redirigerConnexion();
      throw new Error("Votre session membre n'est plus active.");
    }

    if (!reponse.ok || !resultat) {
      throw creerErreurApi(resultat, "Erreur technique. Merci de réessayer.", reponse.status);
    }

    return resultat;
  }

  function creerErreurApi(resultat, messageDefaut, status = 0) {
    const erreur = new Error(
      String(resultat?.message || resultat?.error || messageDefaut || "Erreur technique.")
    );
    erreur.reason = String(resultat?.reason || "");
    erreur.status = Number(status || resultat?.status || 0);
    return erreur;
  }

  function messageErreurAccesCle(resultat) {
    const raison = String(resultat?.reason || "").trim().toLowerCase();

    if (raison === "no_reservation" || raison === "no_invitation") {
      return "Vous n'avez pas de réservation en cours.";
    }

    if (raison === "key_inactive" || raison === "too_early" || raison === "too_late") {
      return "Votre clé n'est pas active actuellement.";
    }

    if (raison === "subscription_unpaid") {
      return "Votre abonnement n'est pas payé.";
    }

    if (raison === "sponsor_not_checked_in") {
      return "Votre clé n'est pas activée par votre parrain.";
    }

    return String(resultat?.message || resultat?.error || "Impossible d'ouvrir Ma clé.");
  }


  async function initialiserGabaritMembre() {
    try {
      await initialiserBandeauMembre();
      await initialiserFooter();
    } catch (error) {
      console.error("Erreur gabarit membre Ma clé :", error);
    }
  }

  async function initialiserBandeauMembre() {
    const slot = document.getElementById("lcdp-bandeau-slot");

    if (!slot) return;

    slot.innerHTML = "";

    const bandeau = await chargerFragmentMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html");
    slot.appendChild(bandeau);
    appliquerRoutesSite(slot);

    await chargerScriptMembreUneFois("/ESPACE-MEMBRE/box-menu-burger-membre.js");

    if (typeof window.LCDP_initialiserMenuBurgerMembre === "function") {
      await window.LCDP_initialiserMenuBurgerMembre({});
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

  function construireEndpointApi(cleModerne, cleLegacy, cleCourte, sousDomaineWorker) {
    const depuisConfig =
      (cleModerne ? CONFIG_PAGE?.[cleModerne] : "") ||
      (cleLegacy ? CONFIG_PAGE?.[cleLegacy] : "") ||
      (cleCourte ? CONFIG_PAGE?.[cleCourte] : "") ||
      "";

    if (depuisConfig) return String(depuisConfig).replace(/\/+$/, "");

    if (typeof CONFIG_PAGE.apiUrl === "function") {
      return CONFIG_PAGE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    }

    return "";
  }

  function construireUrlMembre(chemin) {
    if (typeof window.LCDP_urlMembre === "function") {
      return window.LCDP_urlMembre(chemin);
    }

    return buildUrl(
      CONFIG_PAGE.membreBaseUrl || CONFIG_PAGE.MEMBRE_BASE || CONFIG_PAGE.siteBase || "",
      chemin
    );
  }

  function construireUrlPublic(chemin) {
    if (typeof window.LCDP_urlPublic === "function") {
      return window.LCDP_urlPublic(chemin);
    }

    return buildUrl(
      CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "",
      chemin
    );
  }

  function construireUrlObjet(chemin) {
    if (typeof window.LCDP_urlObjet === "function") {
      return window.LCDP_urlObjet(chemin);
    }

    const base =
      CONFIG_PAGE.objetBaseUrl ||
      CONFIG_PAGE.OBJET_BASE ||
      buildUrl(CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "", "/OBJET");

    return buildUrl(base, chemin);
  }

  function buildUrl(base, path) {
    return String(base || "").replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");
  }

  function normaliserPonctuation(message) {
    const texte = String(message || "").trim();
    if (!texte || /[.!?…]$/.test(texte)) return texte;
    return texte + ".";
  }

  function redirigerAccueil() {
    window.location.href = PAGE_ACCUEIL_MEMBRE;
  }

  function redirigerConnexion() {
    const chemin =
      "/ESPACE-PUBLIC/connexion-membre.html" +
      "?source=" + encodeURIComponent("lacleduparc") +
      "&session=" + encodeURIComponent("inactive");

    window.location.href = construireUrlPublic(chemin);
  }
})();
