(() => {
  "use strict";

  const CONFIG_BURGER_MEMBRE = window.SITE_CONFIG || {};
  const PAGE_ABONNEMENT_MEMBRE = "/ESPACE-MEMBRE/abonnement-membre.html";
  const ENDPOINT_INDEX_MEMBRE = construireEndpointApiBurger(
    "workerIndexMembreUrl",
    "WORKER_INDEX_MEMBRE_URL",
    "W_INDEX_MEMBRE_URL",
    "index-membre-api"
  );
  const ENDPOINT_DECONNEXION_MEMBRE = construireEndpointApiBurger(
    "",
    "W_DECONNEXION_URL",
    "",
    "deconnexion-membre-api"
  );

  const comptesPublicsBurgerMembre = {
    membre: {
      label: "Espace MEMBRE",
      cheminConnexion: "/ESPACE-PUBLIC/connexion-membre.html?source=menu-mon-compte"
    },
    parc: {
      label: "Espace PARC",
      cheminConnexion: "/ESPACE-PUBLIC/connexion-parc.html?source=menu-mon-compte"
    },
    coach: {
      label: "Espace COACH",
      cheminConnexion: "/ESPACE-PUBLIC/connexion-coach.html?source=menu-mon-compte"
    }
  };


  function construireEndpointApiBurger(cleModerne, cleLegacy, cleCourte, sousDomaineWorker) {
    const depuisConfig =
      (cleModerne ? CONFIG_BURGER_MEMBRE?.[cleModerne] : "") ||
      (cleLegacy ? CONFIG_BURGER_MEMBRE?.[cleLegacy] : "") ||
      (cleCourte ? CONFIG_BURGER_MEMBRE?.[cleCourte] : "") ||
      "";

    if (depuisConfig) return String(depuisConfig).replace(/\/+$/, "");

    if (typeof CONFIG_BURGER_MEMBRE.apiUrl === "function") {
      return CONFIG_BURGER_MEMBRE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    }

    return "";
  }

  function construireUrlPublic(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlPublic === "function") return window.LCDP_urlPublic(valeur);
    if (typeof CONFIG_BURGER_MEMBRE.publicUrl === "function") return CONFIG_BURGER_MEMBRE.publicUrl(valeur);

    return buildUrl(CONFIG_BURGER_MEMBRE.publicBaseUrl || CONFIG_BURGER_MEMBRE.PUBLIC_BASE || "", valeur);
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlMembre === "function") return window.LCDP_urlMembre(valeur);
    if (typeof CONFIG_BURGER_MEMBRE.membreUrl === "function") return CONFIG_BURGER_MEMBRE.membreUrl(valeur);

    return buildUrl(
      CONFIG_BURGER_MEMBRE.membreBaseUrl ||
      CONFIG_BURGER_MEMBRE.MEMBRE_BASE ||
      CONFIG_BURGER_MEMBRE.siteBase ||
      "",
      valeur
    );
  }

  function construireUrlObjet(chemin) {
    const valeur = String(chemin || "");

    if (estUrlExterneOuAncre(valeur)) return valeur;
    if (typeof window.LCDP_urlObjet === "function") return window.LCDP_urlObjet(valeur);
    if (typeof CONFIG_BURGER_MEMBRE.objetUrl === "function") return CONFIG_BURGER_MEMBRE.objetUrl(valeur);

    const objetBase =
      CONFIG_BURGER_MEMBRE.objetBaseUrl ||
      CONFIG_BURGER_MEMBRE.OBJET_BASE ||
      buildUrl(CONFIG_BURGER_MEMBRE.publicBaseUrl || CONFIG_BURGER_MEMBRE.PUBLIC_BASE || "", "/OBJET");

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

  function construireUrlConnexionBurger(compte) {
    const configuration = comptesPublicsBurgerMembre[compte];

    if (!configuration) {
      return construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html?source=menu-mon-compte");
    }

    return construireUrlPublic(configuration.cheminConnexion);
  }

  function obtenirWorkerUserRouteurUrlBurger() {
    if (CONFIG_BURGER_MEMBRE.workerUserRouteurUrl) {
      return String(CONFIG_BURGER_MEMBRE.workerUserRouteurUrl).replace(/\/+$/, "");
    }

    if (CONFIG_BURGER_MEMBRE.WORKER_USER_ROUTEUR_URL) {
      return String(CONFIG_BURGER_MEMBRE.WORKER_USER_ROUTEUR_URL).replace(/\/+$/, "");
    }

    if (typeof CONFIG_BURGER_MEMBRE.apiUrl === "function") {
      return String(CONFIG_BURGER_MEMBRE.apiUrl("user-routeur-api") || "").replace(/\/+$/, "");
    }

    return "";
  }

  function messageErreurApiBurger(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error)
      ? String(resultat.message || resultat.error)
      : messageDefaut;
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

  function chargerScriptMembreUneFois(chemin, options = {}) {
    const src = construireUrlMembre(chemin);
    const forcer = options.forcer === true;
    const scriptExistant = document.querySelector(`script[data-lcdp-script-membre="${chemin}"]`);

    if (scriptExistant && !forcer) {
      return Promise.resolve();
    }

    if (scriptExistant && forcer) {
      scriptExistant.remove();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = forcer ? ajouterParametreCacheDa(src) : src;
      script.defer = true;
      script.dataset.lcdpScriptMembre = chemin;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Script membre introuvable : " + chemin));
      document.body.appendChild(script);
    });
  }

  function ajouterParametreCacheDa(src) {
    try {
      const url = new URL(src, window.location.href);
      url.searchParams.set("lcdp_da", String(Date.now()));
      return url.toString();
    } catch (_error) {
      const separateur = String(src || "").includes("?") ? "&" : "?";
      return String(src || "") + separateur + "lcdp_da=" + Date.now();
    }
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

  function normaliserStatutabo(value) {
    const statut = String(value || "").trim().toLowerCase();

    return ["paye", "impaye", "cree", "cancd"].includes(statut) ? statut : "";
  }

  function dateIsoDepuisValeurBurger(value) {
    const texte = String(value || "").trim();
    const match = texte.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      return match[1] + "-" + match[2] + "-" + match[3];
    }

    const date = new Date(texte);

    if (Number.isNaN(date.getTime())) return "";

    return dateIsoParisBurger(date);
  }

  function dateIsoParisBurger(date) {
    const morceaux = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const valeur = (type) => morceaux.find((item) => item.type === type)?.value || "";

    return valeur("year") + "-" + valeur("month") + "-" + valeur("day");
  }

  function dateIsoAujourdhuiParisBurger() {
    return dateIsoParisBurger(new Date());
  }

  function obtenirEtatAffichageInviterBurger(source) {
    const statutabo = normaliserStatutabo(source?.statutabo || source?.statutAbo || "");
    const fin = dateIsoDepuisValeurBurger(source?.fin || source?.finabo || source?.dateFin || source?.datefin || "");
    const aujourdHui = dateIsoAujourdhuiParisBurger();

    if (!statutabo || !fin) {
      return { visible: false };
    }

    if (statutabo === "paye" && fin >= aujourdHui) {
      return {
        visible: true,
        actif: true,
        label: "Inviter",
        statutabo,
        fin
      };
    }

    if (statutabo === "impaye" && fin >= aujourdHui) {
      return {
        visible: true,
        actif: false,
        label: "Inviter (suspendu : abonnement à payer)",
        message: "Abonnement suspendu. Vous ne pouvez pas inviter de membre.",
        peutPayer: true,
        italique: true,
        statutabo,
        fin
      };
    }

    if (statutabo === "cree" && fin >= aujourdHui) {
      return {
        visible: true,
        actif: false,
        label: "Inviter (inactif : abonnement à payer)",
        message: "Abonnement inactif. Vous ne pouvez pas inviter de membre.",
        peutPayer: true,
        italique: false,
        statutabo,
        fin
      };
    }

    if (statutabo === "cancd" && fin === aujourdHui) {
      return {
        visible: true,
        actif: false,
        label: "Inviter (inactif : abonnement annulé)",
        message: "Abonnement inactif. Vous ne pouvez pas inviter de membre.",
        peutPayer: false,
        italique: false,
        statutabo,
        fin
      };
    }

    return { visible: false };
  }

  function extraireDonneesInviterBurger(source) {
    const donnees = source && typeof source === "object" ? source : {};
    const abonnement = trouverAbonnementInviterBurger(donnees);
    const cible = abonnement || donnees;

    return {
      statutabo: normaliserStatutabo(
        cible.statutabo ||
        cible.statutAbo ||
        cible.statutabonnement ||
        cible.statutAbonnement ||
        ""
      ),
      fin: cible.fin || cible.finabo || cible.dateFin || cible.datefin || ""
    };
  }

  function trouverAbonnementInviterBurger(donnees) {
    const candidats = [];

    [
      donnees.abonnementEnCours,
      donnees.abonnementActuel,
      donnees.abonnement,
      donnees.abo
    ].forEach((item) => {
      if (item && typeof item === "object") candidats.push(item);
    });

    if (Array.isArray(donnees.abonnements)) {
      donnees.abonnements.forEach((item) => {
        if (item && typeof item === "object") candidats.push(item);
      });
    }

    let meilleur = null;
    let prioriteMeilleur = 99;

    candidats.forEach((item) => {
      const etat = obtenirEtatAffichageInviterBurger(item);

      if (!etat.visible) return;

      const priorite = etat.actif
        ? 1
        : etat.statutabo === "impaye"
          ? 2
          : etat.statutabo === "cree"
            ? 3
            : 4;

      if (priorite < prioriteMeilleur) {
        meilleur = item;
        prioriteMeilleur = priorite;
      }
    });

    return meilleur;
  }

  function creerItemInviterBurger(contexte) {
    const etatInviter = obtenirEtatAffichageInviterBurger(contexte);

    if (!etatInviter.visible) return null;

    return {
      label: etatInviter.label,
      action: "inviter",
      etatInviter,
      italique: etatInviter.italique === true
    };
  }

  async function completerContexteInviterBurger(contexte) {
    if (!contexte) return;

    if (normaliserStatutabo(contexte.statutabo) && dateIsoDepuisValeurBurger(contexte.fin)) {
      return;
    }

    const donnees = await chargerDonneesInviterDepuisIndexBurger();

    if (!donnees) return;

    contexte.statutabo = donnees.statutabo || contexte.statutabo || "";
    contexte.fin = donnees.fin || contexte.fin || "";
  }

  async function chargerDonneesInviterDepuisIndexBurger() {
    if (!ENDPOINT_INDEX_MEMBRE) return null;

    try {
      const reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || data.success !== true || data.connected !== true) {
        return null;
      }

      return extraireDonneesInviterBurger(data);
    } catch (error) {
      console.error("Erreur vérification invitation burger :", error);
      return null;
    }
  }

  function obtenirLightboxSlotBurger() {
    let slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      slot = document.createElement("div");
      slot.id = "lcdp-lightbox-slot";
      document.body.appendChild(slot);
    }

    return slot;
  }

  async function afficherAlerteBurger(message, options = {}) {
    const container = document.createElement("div");
    container.className = "lcdp-burger-alerte";
    document.body.appendChild(container);

    const fragment = await chargerFragmentObjet("/BOX/02-box-alerte.html");
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

    const boutonActionConfiguration = options.boutonAction && typeof options.boutonAction === "object"
      ? options.boutonAction
      : null;
    let boutonAction = null;

    if (boutonActionConfiguration) {
      boutonAction = document.createElement("button");
      boutonAction.type = "button";
      boutonAction.className = "lcdp-button " + (boutonActionConfiguration.style || "lcdp-button-mini");
      boutonAction.textContent = boutonActionConfiguration.label || "Payer";

      const zoneActions = boutonOk.parentElement || texte.parentElement || alerte;

      if (boutonOk.parentElement === zoneActions) {
        zoneActions.insertBefore(boutonAction, boutonOk);
      } else {
        zoneActions.appendChild(boutonAction);
      }
    }

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
      if (boutonAction) {
        boutonAction.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          fermer("action");

          if (typeof boutonActionConfiguration.action === "function") {
            boutonActionConfiguration.action();
          }
        });
      }
      alerte.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.target === alerte) fermer(false);
      });
    });
  }

  function ouvrirMenu(boutonBurger, navBurger) {
    boutonBurger.setAttribute("aria-expanded", "true");
    navBurger.hidden = false;
    navBurger.removeAttribute("hidden");
  }

  function fermerMenu(boutonBurger, navBurger) {
    boutonBurger.setAttribute("aria-expanded", "false");
    navBurger.hidden = true;
    navBurger.setAttribute("hidden", "");
  }

  function basculerMenu(boutonBurger, navBurger) {
    const ouvert = boutonBurger.getAttribute("aria-expanded") === "true";

    if (ouvert) {
      fermerMenu(boutonBurger, navBurger);
      return;
    }

    ouvrirMenu(boutonBurger, navBurger);
  }

  function lireCookie(nom) {
    if (typeof window.LCDP_lireCookie === "function") {
      return window.LCDP_lireCookie(nom);
    }

    const valeur = document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(nom + "="))
      ?.split("=")
      .slice(1)
      .join("=") || "";

    try {
      return decodeURIComponent(valeur);
    } catch {
      return valeur;
    }
  }

  function membreAbonneDepuisCookie() {
    if (typeof window.LCDP_membreAbonne === "function") {
      return window.LCDP_membreAbonne() === true;
    }

    return Boolean(lireCookie("abonne"));
  }

  function valeurBooleenneVraie(valeur) {
    return valeur === true || valeur === "true" || valeur === 1 || valeur === "1";
  }

  function creerBoutonActionMenu(label, action, options = {}) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "lcdp-box-menu-burger__button-link";
    bouton.textContent = label;

    if (options.italique === true) {
      bouton.classList.add("lcdp-text-italic");
    }

    bouton.addEventListener("click", action);
    return bouton;
  }

  function creerLienMenu(item, boutonBurger, navBurger, contexte) {
    if (item.action === "etre-invite") {
      return creerBoutonActionMenu(item.label, () => {
        fermerMenu(boutonBurger, navBurger);

        if (typeof window.LCDP_gererEtreInviteMembre === "function") {
          window.LCDP_gererEtreInviteMembre().catch(console.error);
        }
      });
    }

    if (item.action === "inviter") {
      return creerBoutonActionMenu(item.label, () => {
        fermerMenu(boutonBurger, navBurger);
        gererClicInviterBurger(contexte, item.etatInviter).catch((error) => {
          console.error(error);
          afficherAlerteBurger(error.message || "Erreur technique. Merci de réessayer.").catch(console.error);
        });
      }, { italique: item.italique === true });
    }

    if (item.action === "abonnement") {
      return creerBoutonActionMenu(item.label, () => {
        fermerMenu(boutonBurger, navBurger);
        gererClicAbonnementBurger(contexte, boutonBurger, navBurger).catch((error) => {
          console.error(error);
          afficherAlerteBurger(error.message || "Erreur technique. Merci de réessayer.").catch(console.error);
        });
      });
    }

    if (item.action === "changer-compte") {
      return creerBoutonActionMenu(item.label, () => {
        fermerMenu(boutonBurger, navBurger);
        ouvrirDialogueChangerCompteBurger().catch((error) => {
          console.error("Erreur dialogue changement de compte :", error);
          window.location.href = construireUrlConnexionBurger("membre");
        });
      });
    }

    if (item.action === "deconnexion") {
      return creerBoutonActionMenu(item.label, () => {
        fermerMenu(boutonBurger, navBurger);
        gererDeconnexionBurger().catch((error) => {
          console.error(error);
          afficherAlerteBurger(error.message || "Erreur technique. Merci de réessayer.").catch(console.error);
        });
      });
    }

    const lien = document.createElement("a");
    lien.className = "lcdp-box-menu-burger__link";
    lien.textContent = item.label;
    lien.href = item.espace === "membre"
      ? construireUrlMembre(item.href)
      : construireUrlPublic(item.href);

    lien.addEventListener("click", () => {
      fermerMenu(boutonBurger, navBurger);
    });

    return lien;
  }

  function suspensionPourNonPaiementBurger(contexte) {
    return Boolean(
      contexte &&
      contexte.abonnementSuspendu === true &&
      contexte.paiementSuspension
    );
  }

  async function redirigerVersAbonnementPourRegularisationBurger() {
    const ok = await afficherAlerteBurger("Votre abonnement est suspendu (non payé). Vous allez être redirigé vers la page d’abonnement.");

    if (!ok) return;

    window.location.href = construireUrlMembre(PAGE_ABONNEMENT_MEMBRE);
  }

  async function gererClicInviterBurger(contexte, etatInviter = null) {
    const etat = etatInviter || obtenirEtatAffichageInviterBurger(contexte);

    if (!etat.visible) return;

    if (etat.actif === true) {
      window.location.href = construireUrlMembre("/ESPACE-MEMBRE/inviter-membre.html");
      return;
    }

    await afficherAlerteInviterBloqueBurger(etat);
  }

  async function afficherAlerteInviterBloqueBurger(etatInviter) {
    const options = {};

    if (etatInviter?.peutPayer === true) {
      options.boutonAction = {
        label: "Payer",
        style: "lcdp-button-mini lcdp-button-mini-orange",
        action: ouvrirPageAbonnementBurgerNouvelOnglet
      };
    }

    await afficherAlerteBurger(
      etatInviter?.message || "Abonnement inactif. Vous ne pouvez pas inviter de membre.",
      options
    );
  }

  function ouvrirPageAbonnementBurgerNouvelOnglet() {
    window.open(construireUrlMembre(PAGE_ABONNEMENT_MEMBRE), "_blank", "noopener");
  }

  async function ouvrirDialogueBoutonsBurger(options) {
    const slot = obtenirLightboxSlotBurger();
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
      throw new Error("Structure de dialogue bouton incomplète.");
    }

    titre.textContent = options.titre || "";
    texte.textContent = options.texte || "";
    actions.innerHTML = "";

    return new Promise((resolve) => {
      let resolu = false;

      function fermer(valeur) {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(valeur || null);
      }

      (options.boutons || []).forEach((configuration) => {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "lcdp-button " + (configuration.style || "lcdp-button-primary");
        bouton.textContent = configuration.label || "Valider";

        bouton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          fermer(configuration.valeur || configuration.label || true);
        });

        actions.appendChild(bouton);
      });

      boutonFermer.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fermer(null);
      });

      dialogue.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.target === dialogue) fermer(null);
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") fermer(null);
        },
        { once: true }
      );
    });
  }

  async function redirigerCompteBurger(compte) {
    const workerUrl = obtenirWorkerUserRouteurUrlBurger();

    if (!workerUrl) {
      window.location.href = construireUrlConnexionBurger(compte);
      return;
    }

    try {
      const reponse = await fetch(workerUrl, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ compte })
      });

      if (!reponse.ok) {
        throw new Error("Routeur utilisateur indisponible.");
      }

      const data = await reponse.json().catch(() => null);

      if (data && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      window.location.href = construireUrlConnexionBurger(compte);

    } catch (error) {
      console.error("Erreur routeur utilisateur :", error);
      window.location.href = construireUrlConnexionBurger(compte);
    }
  }

  async function ouvrirDialogueChangerCompteBurger() {
    const confirmation = await ouvrirDialogueBoutonsBurger({
      titre: "Espace connecté",
      texte: "Choisissez votre espace",
      boutons: Object.entries(comptesPublicsBurgerMembre).map(([compte, configuration]) => ({
        label: configuration.label,
        valeur: compte,
        style: "lcdp-button-primary"
      }))
    });

    if (!confirmation) return;

    await redirigerCompteBurger(confirmation);
  }

  async function gererDeconnexionBurger() {
    const confirmation = await ouvrirDialogueBoutonsBurger({
      titre: "Confirmer la déconnexion",
      texte: "Voulez-vous vous déconnecter de votre espace membre ?",
      boutons: [
        {
          label: "Confirmer",
          valeur: "confirmer",
          style: "lcdp-button-primary"
        }
      ]
    });

    if (confirmation !== "confirmer") return;

    if (!ENDPOINT_DECONNEXION_MEMBRE) {
      throw new Error("Le service de déconnexion membre n’est pas configuré.");
    }

    const reponse = await fetch(ENDPOINT_DECONNEXION_MEMBRE + "/deconnexion", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    const resultat = await reponse.json().catch(() => null);

    if (!reponse.ok || !resultat || resultat.success !== true) {
      throw new Error(messageErreurApiBurger(resultat, "Impossible de fermer la session membre."));
    }

    window.location.href = construireUrlPublic("/ESPACE-PUBLIC/accueil-public.html");
  }

  async function gererClicAbonnementBurger(contexte, boutonBurger, navBurger) {
    let statudaConnue = contexte && contexte.statudaConnue === true;
    let statuda = normaliserStatuda(contexte?.statuda);
    let datenext = contexte?.datenext || null;

    if (!statudaConnue) {
      const statutCharge = await chargerStatutDaDepuisIndexBurger();

      if (statutCharge && statutCharge.statudaConnue === true) {
        statudaConnue = true;
        statuda = normaliserStatuda(statutCharge.statuda);
        datenext = statutCharge.datenext || null;

        if (contexte) {
          contexte.statudaConnue = true;
          contexte.statuda = statuda;
          contexte.datenext = datenext;
        }
      }
    }

    if (statuda === "oui") {
      window.location.href = construireUrlMembre(PAGE_ABONNEMENT_MEMBRE);
      return;
    }

    if (statuda === "encours") {
      await afficherAlerteBurger("Votre DA est en cours. Les abonnements sont accessibles après confirmation.");
      return;
    }

    if (statuda === "non") {
      await afficherAlerteBurger("Vous pouvez nous transmettre votre DA à partir du " + formaterDateDa(datenext) + ".");
      return;
    }

    if (!statudaConnue) {
      await afficherAlerteBurger("Impossible de vérifier techniquement votre accès aux abonnements. Faîtes votre demande depuis la page La Clé.");
      return;
    }

    await ouvrirPremiereDaDepuisBurger(contexte, boutonBurger, navBurger);
  }

  async function chargerStatutDaDepuisIndexBurger() {
    if (!ENDPOINT_INDEX_MEMBRE) return null;

    try {
      const reponse = await fetch(ENDPOINT_INDEX_MEMBRE + "/index", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await reponse.json().catch(() => null);

      if (!reponse.ok || !data || data.success !== true || data.connected !== true) {
        return null;
      }

      return {
        statudaConnue: Object.prototype.hasOwnProperty.call(data, "statuda"),
        statuda: normaliserStatuda(data.statuda),
        datenext: data.datenext || null
      };
    } catch (error) {
      console.error("Erreur vérification DA burger :", error);
      return null;
    }
  }

  async function ouvrirPremiereDaDepuisBurger(contexte, boutonBurger, navBurger) {
    try {
      if (typeof window.LCDP_ouvrirPremiereDaMembre !== "function") {
        await chargerScriptMembreUneFois("/ESPACE-MEMBRE/da-membre.js", { forcer: true });
      }

      if (typeof window.LCDP_ouvrirPremiereDaMembre !== "function") {
        throw new Error("Module DA membre introuvable.");
      }

      await window.LCDP_ouvrirPremiereDaMembre({
        contexte,
        onStatudaChange: (donnees = {}) => {
          if (!contexte) return;
          contexte.statudaConnue = true;
          contexte.statuda = normaliserStatuda(donnees.statuda);
          contexte.datenext = donnees.datenext || contexte.datenext || null;
        },
        onTerminee: () => {
          ouvrirMenu(boutonBurger, navBurger);
        }
      });
    } catch (error) {
      console.error("Erreur ouverture DA membre :", error);
      await afficherAlerteBurger(error.message || "Erreur technique. Merci de réessayer.");
    }
  }

  async function initialiserMenuBurgerMembre(options = {}) {
    const slot = document.querySelector("[data-lcdp-burger-slot]");

    if (!slot) return;

    const etatMembre = options.etatMembre || {};
    const abonne = Object.prototype.hasOwnProperty.call(etatMembre, "abonne")
      ? valeurBooleenneVraie(etatMembre.abonne)
      : membreAbonneDepuisCookie();
    const contexte = {
      abonne,
      abonnementSuspendu: valeurBooleenneVraie(etatMembre.abonnementSuspendu || etatMembre.suspendu),
      paiementSuspension: etatMembre.paiementSuspension || etatMembre.paiementRegularisation || null,
      statutabo: normaliserStatutabo(etatMembre.statutabo || etatMembre.statutAbo || ""),
      fin: etatMembre.fin || etatMembre.finabo || etatMembre.dateFin || etatMembre.datefin || "",
      statudaConnue: Object.prototype.hasOwnProperty.call(etatMembre, "statuda"),
      statuda: normaliserStatuda(etatMembre.statuda),
      datenext: etatMembre.datenext || null
    };

    await completerContexteInviterBurger(contexte);

    slot.innerHTML = "";

    const fragment = await chargerFragmentObjet("/BOX/02-box-menu-burger.html");
    slot.appendChild(fragment);

    const boutonBurger = slot.querySelector("[data-lcdp-burger-button]");
    const navBurger = slot.querySelector("[data-lcdp-burger-nav]");
    const listeBurger = slot.querySelector("[data-lcdp-burger-list]");

    if (!boutonBurger || !navBurger || !listeBurger) {
      throw new Error("Structure du menu burger générique incomplète.");
    }

    fermerMenu(boutonBurger, navBurger);

    const liens = [
      {
        label: "La Clé",
        espace: "membre",
        href: "/ESPACE-MEMBRE/accueil-membre.html"
      }
    ];

    const itemInviter = creerItemInviterBurger(contexte);

    if (itemInviter) {
      liens.push(itemInviter);
    }

    liens.push(
      {
        label: "Mon compte",
        espace: "membre",
        href: "/ESPACE-MEMBRE/mes-informations.html"
      },
      {
        label: "Abonnement",
        action: "abonnement"
      },
      {
        label: "Actualité",
        espace: "public",
        href: "/ESPACE-PUBLIC/actualite.html"
      },
      {
        label: "Le club",
        espace: "public",
        href: "/ESPACE-PUBLIC/la-cle-du-parc.html"
      },
      {
        label: "Changer d'espace connecté",
        action: "changer-compte"
      },
      {
        label: "Déconnexion",
        action: "deconnexion"
      }
    );

    listeBurger.innerHTML = "";

    liens.forEach((item) => {
      listeBurger.appendChild(creerLienMenu(item, boutonBurger, navBurger, contexte));
    });

    boutonBurger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      basculerMenu(boutonBurger, navBurger);
    });

    navBurger.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", (event) => {
      if (!slot.contains(event.target)) {
        fermerMenu(boutonBurger, navBurger);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        fermerMenu(boutonBurger, navBurger);
      }
    });
  }

  window.LCDP_initialiserMenuBurgerMembre = initialiserMenuBurgerMembre;
})();
