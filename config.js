(function () {
  "use strict";

  const host = window.location.hostname;

  const isGithub =
    host === "ashdhe.github.io" ||
    host === "huguespavret.github.io";

  const githubOwner = host === "huguespavret.github.io"
    ? "huguespavret"
    : "ashdhe";

  const CONFIG = {
    github: {
      publicBase: "https://" + githubOwner + ".github.io/LCDP_public",
      membreBase: "https://" + githubOwner + ".github.io/LCDP_membre",
      parcBase: "https://" + githubOwner + ".github.io/LCDP_parc",
      coachBase: "https://" + githubOwner + ".github.io/LCDP_coach",
      adminBase: "https://" + githubOwner + ".github.io/LCDP_admin"
    },

    production: {
      publicBase: "https://lacleduparc.fr",
      membreBase: "https://membre.lacleduparc.fr",
      parcBase: "https://parc.lacleduparc.fr",
      coachBase: "https://coach.lacleduparc.fr",
      adminBase: "https://admin.lacleduparc.fr"
    }
  };

  const active = isGithub ? CONFIG.github : CONFIG.production;

  const WORKERS = {
    mdptokenz: "https://mdptokenz-api.lacleduparc.fr",
    connexionMembre: "https://connexion-membre-api.lacleduparc.fr",
    formInscriptionMembre: "https://form-inscription-membre-api.lacleduparc.fr",
    userRouteur: "https://user-routeur-api.lacleduparc.fr",

    indexMembre: "https://index-membre-api.lacleduparc.fr",
    deconnexionMembre: "https://deconnexion-membre-api.lacleduparc.fr",
    laCleDuParc: "https://la-cle-du-parc-api.lacleduparc.fr",

    nouvelleDateMembre: "https://nouvelle-date-membre-api.lacleduparc.fr",
    fluxm: "https://fluxm-api.lacleduparc.fr",
    planningMembre: "https://planning-membre-api.lacleduparc.fr",
    inviterMembre: "https://inviter-membre-api.lacleduparc.fr",
    invitationMembre: "https://invitation-membre-api.lacleduparc.fr",
    aboMembre: "https://abo-membre-api.lacleduparc.fr",
    factuPaiement: "https://factupaiement-api.lacleduparc.fr",
    partagePage: "https://partage-pages-api.lacleduparc.fr",

    monCompteMembre: "https://mon-compte-membre-api.lacleduparc.fr",
    majEmailMembre: "https://maj-email-membre-api.lacleduparc.fr",
    majParrainMembre: "https://maj-parrain-membre-api.lacleduparc.fr",
    majDepartementMembre: "https://maj-dptmt-membre-api.lacleduparc.fr",
    mesPoints: "https://mes-points-api.lacleduparc.fr"
  };

  function nettoyerBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrl(base, path) {
    return nettoyerBaseUrl(base) + "/" + String(path || "").replace(/^\/+/, "");
  }

  const objetBase = buildUrl(active.publicBase, "/OBJET");

  window.SITE_BASE = active.membreBase;

  window.SITE_CONFIG = {
    publicBaseUrl: active.publicBase,
    membreBaseUrl: active.membreBase,
    parcBaseUrl: active.parcBase,
    coachBaseUrl: active.coachBase,
    adminBaseUrl: active.adminBase,

    objetBaseUrl: objetBase,
    siteBase: active.membreBase,

    workerMdptokenzUrl: WORKERS.mdptokenz,
    workerConnexionMembreUrl: WORKERS.connexionMembre,
    workerFormInscriptionMembreUrl: WORKERS.formInscriptionMembre,
    workerUserRouteurUrl: WORKERS.userRouteur,

    workerIndexMembreUrl: WORKERS.indexMembre,
    workerLaCleDuParcUrl: WORKERS.laCleDuParc,

    workerNouvelleDateMembreUrl: WORKERS.nouvelleDateMembre,
    workerFluxmUrl: WORKERS.fluxm,
    workerPlanningMembreUrl: WORKERS.planningMembre,
    workerInviterMembreUrl: WORKERS.inviterMembre,
    workerInvitationMembreUrl: WORKERS.invitationMembre,
    workerAboMembreUrl: WORKERS.aboMembre,
    workerFactuPaiementUrl: WORKERS.factuPaiement,
    workerPartagePageUrl: WORKERS.partagePage,

    workerMonCompteMembreUrl: WORKERS.monCompteMembre,
    workerMajEmailMembreUrl: WORKERS.majEmailMembre,
    workerMajParrainMembreUrl: WORKERS.majParrainMembre,
    workerMajDepartementMembreUrl: WORKERS.majDepartementMembre,
    workerMesPointsUrl: WORKERS.mesPoints,

    PUBLIC_BASE: active.publicBase,
    MEMBRE_BASE: active.membreBase,
    PARC_BASE: active.parcBase,
    COACH_BASE: active.coachBase,
    ADMIN_BASE: active.adminBase,
    OBJET_BASE: objetBase,

    WORKER_MDPTOKENZ_URL: WORKERS.mdptokenz,
    WORKER_CONNEXION_MEMBRE_URL: WORKERS.connexionMembre,
    WORKER_FORM_INSCRIPTION_MEMBRE_URL: WORKERS.formInscriptionMembre,
    WORKER_USER_ROUTEUR_URL: WORKERS.userRouteur,

    WORKER_INDEX_MEMBRE_URL: WORKERS.indexMembre,
    W_INDEX_MEMBRE_URL: WORKERS.indexMembre,
    W_DECONNEXION_URL: WORKERS.deconnexionMembre,
    WORKER_LA_CLE_DU_PARC_URL: WORKERS.laCleDuParc,
    W_LA_CLE_DU_PARC_URL: WORKERS.laCleDuParc,

    WORKER_NOUVELLE_DATE_MEMBRE_URL: WORKERS.nouvelleDateMembre,
    WORKER_FLUXM_URL: WORKERS.fluxm,
    WORKER_PLANNING_MEMBRE_URL: WORKERS.planningMembre,
    WORKER_INVITER_MEMBRE_URL: WORKERS.inviterMembre,
    WORKER_INVITATION_MEMBRE_URL: WORKERS.invitationMembre,
    WORKER_ABO_MEMBRE_URL: WORKERS.aboMembre,
    WORKER_FACTUPAIEMENT_URL: WORKERS.factuPaiement,
    WORKER_PARTAGE_PAGE_URL: WORKERS.partagePage,

    WORKER_MON_COMPTE_MEMBRE_URL: WORKERS.monCompteMembre,
    WORKER_MAJ_EMAIL_MEMBRE_URL: WORKERS.majEmailMembre,
    WORKER_MAJ_PARRAIN_MEMBRE_URL: WORKERS.majParrainMembre,
    WORKER_MAJ_DEPARTEMENT_MEMBRE_URL: WORKERS.majDepartementMembre,
    WORKER_MES_POINTS_URL: WORKERS.mesPoints,

    publicUrl(path) {
      return buildUrl(active.publicBase, path);
    },

    membreUrl(path) {
      return buildUrl(active.membreBase, path);
    },

    parcUrl(path) {
      return buildUrl(active.parcBase, path);
    },

    coachUrl(path) {
      return buildUrl(active.coachBase, path);
    },

    adminUrl(path) {
      return buildUrl(active.adminBase, path);
    },

    objetUrl(path) {
      return buildUrl(objetBase, path);
    },

    apiUrl(workerSubdomain) {
      return "https://" + workerSubdomain + ".lacleduparc.fr";
    }
  };

  const COOKIE_RETOUR_MEMBRE = "retour_membre";
  const COOKIE_SESSION_MEMBRE_NEXT_REFRESH = "lcdp_session_membre_next_refresh";
  const DELAI_REESSAI_REFRESH_ERREUR_SECONDES = 60 * 10;
  const MARGE_COOKIE_PROCHAINE_VERIFICATION_SECONDES = 60 * 60;
  const DUREE_MEMOIRE_RETOUR_MEMBRE_SECONDES = 60 * 60 * 24 * 30;
  const CHEMINS_MEMBRE_SANS_SESSION = new Set([
    "/ESPACE-MEMBRE/mdp-membre.html"
  ]);
  const CLASSE_CONTROLE_CLE = "lcdp-controle-cle-en-cours";
  const ID_STYLE_CONTROLE_CLE = "lcdp-style-controle-cle-en-cours";
  const MESSAGE_SESSION_REMPLACEE =
    "Ce compte vient d'être connecté sur un autre appareil. Votre session a été fermée.";
  let verificationVerrouillageClePromise = null;
  let sessionRemplaceePromise = null;

  memoriserRetourMembreSiNecessaire();
  initialiserRenouvellementSessionMembre();
  initialiserVerrouillageCleActive();

  window.LCDP_estUrlRetourMembreValide = estUrlRetourMembreValide;
  window.LCDP_lireRetourMembre = lireRetourMembre;
  window.LCDP_effacerRetourMembre = effacerRetourMembre;
  window.LCDP_programmerProchaineVerificationSessionMembre = programmerProchaineVerificationSessionMembre;
  window.LCDP_lireCookie = lireCookie;
  window.LCDP_gererSessionRemplacee = gererSessionRemplacee;
  window.LCDP_membreAbonne = function LCDP_membreAbonne() {
    return Boolean(lireCookie("abonne"));
  };
  window.LCDP_redirigerConnexionMembre = function LCDP_redirigerConnexionMembre(source, motif) {
    const retour = estUrlRetourMembreValide(window.location.href)
      ? window.location.href
      : lireRetourMembre();

    if (retour) {
      ecrireCookiePartage(
        COOKIE_RETOUR_MEMBRE,
        retour,
        DUREE_MEMOIRE_RETOUR_MEMBRE_SECONDES
      );
    }

    const params = new URLSearchParams();
    params.set("source", source || "espace-membre");
    params.set("session", motif || "inactive");

    if (retour) {
      params.set("retour", retour);
    }

    window.location.href = buildUrl(
      active.publicBase,
      "/ESPACE-PUBLIC/connexion-membre.html?" + params.toString()
    );
  };

  async function gererSessionRemplacee() {
    if (sessionRemplaceePromise) {
      return sessionRemplaceePromise;
    }

    sessionRemplaceePromise = (async () => {
      supprimerCookiePartage(COOKIE_SESSION_MEMBRE_NEXT_REFRESH);

      try {
        await afficherAlerteSessionRemplacee();
      } catch (error) {
        console.error("Alerte session remplacée :", error);
        window.alert(MESSAGE_SESSION_REMPLACEE);
      }

      window.location.replace(nettoyerBaseUrl(active.publicBase) + "/");
      return false;
    })();

    return sessionRemplaceePromise;
  }

  async function afficherAlerteSessionRemplacee() {
    await attendreBodyDisponible();
    await assurerCssAlerteSessionRemplacee();

    let slot = document.getElementById("lcdp-lightbox-slot");

    if (!slot) {
      slot = document.createElement("div");
      slot.id = "lcdp-lightbox-slot";
      document.body.appendChild(slot);
    }

    slot.innerHTML = "";

    const reponse = await fetch(
      buildUrl(objetBase, "/BOX/02-box-alerte.html"),
      {
        method: "GET",
        credentials: "omit",
        cache: "no-cache"
      }
    );

    if (!reponse.ok) {
      throw new Error("Box alerte indisponible.");
    }

    const html = await reponse.text();
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    slot.appendChild(template.content.cloneNode(true));

    const alerte = slot.querySelector("[data-lcdp-box-alerte]");
    const texte = slot.querySelector("[data-lcdp-alerte-message]");
    const boutonFermer = slot.querySelector("[data-lcdp-alerte-close]");
    const boutonOk = slot.querySelector("[data-lcdp-alerte-ok]");

    if (!alerte || !texte || !boutonFermer || !boutonOk) {
      slot.innerHTML = "";
      throw new Error("Structure de la Box alerte incomplète.");
    }

    texte.textContent = MESSAGE_SESSION_REMPLACEE;
    boutonOk.textContent = "OK";

    return new Promise((resolve) => {
      let resolu = false;

      function fermer() {
        if (resolu) return;
        resolu = true;
        slot.innerHTML = "";
        resolve(true);
      }

      boutonFermer.addEventListener("click", fermer);
      boutonOk.addEventListener("click", fermer);
      alerte.addEventListener("click", (event) => {
        if (event.target === alerte) fermer();
      });
    });
  }

  function assurerCssAlerteSessionRemplacee() {
    const href = buildUrl(objetBase, "/BOX/02-box-alerte.css");
    const existant = Array.from(
      document.querySelectorAll('link[rel="stylesheet"]')
    ).find((link) => String(link.href || "") === href);

    if (existant) return Promise.resolve();

    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.lcdpSessionAlerteCss = "true";
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  }

  function attendreBodyDisponible() {
    if (document.body) return Promise.resolve();

    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  function initialiserVerrouillageCleActive() {
    if (!estUrlDansSiteMembre(window.location.href)) return;
    if (estPageMembreSansSession(window.location.href)) return;
    if (estPageMaCle(window.location.href)) return;
    if (!WORKERS.laCleDuParc) return;

    verifierVerrouillageCleActive();

    window.addEventListener("pageshow", verifierVerrouillageCleActive);
    window.addEventListener("focus", verifierVerrouillageCleActive);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        verifierVerrouillageCleActive();
      }
    });
  }

  function masquerPagePendantControleCle() {
    if (!document.getElementById(ID_STYLE_CONTROLE_CLE)) {
      const style = document.createElement("style");
      style.id = ID_STYLE_CONTROLE_CLE;
      style.textContent =
        "html." + CLASSE_CONTROLE_CLE + " body{" +
        "visibility:hidden!important;" +
        "pointer-events:none!important;" +
        "}";
      document.head.appendChild(style);
    }

    document.documentElement.classList.add(CLASSE_CONTROLE_CLE);
  }

  function libererPageApresControleCle() {
    document.documentElement.classList.remove(CLASSE_CONTROLE_CLE);
  }

  async function verifierVerrouillageCleActive() {
    if (verificationVerrouillageClePromise) {
      return verificationVerrouillageClePromise;
    }

    masquerPagePendantControleCle();

    verificationVerrouillageClePromise = (async () => {
      let conserverMasquage = false;

      try {
        const reponse = await window.fetch(
          nettoyerBaseUrl(WORKERS.laCleDuParc) + "/status",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: { Accept: "application/json" }
          }
        );

        const statut = await reponse.json().catch(() => null);

        if (reponse.status === 401) {
          if (String(statut?.reason || "") === "session_replaced") {
            libererPageApresControleCle();
            await gererSessionRemplacee();
            return;
          }

          conserverMasquage = true;
          window.LCDP_redirigerConnexionMembre?.("ma-cle", "inactive");
          return;
        }

        if (!reponse.ok) return;

        if (
          statut?.success === true &&
          (statut.screen === "active" || statut.checkinActive === true)
        ) {
          const destination = buildUrl(
            active.membreBase,
            "/ESPACE-MEMBRE/lacleduparc.html"
          );

          if (window.location.href !== destination) {
            conserverMasquage = true;
            window.location.replace(destination);
          }
        }
      } catch (error) {
        console.error("Verrouillage Ma clé :", error);
      } finally {
        if (!conserverMasquage) {
          libererPageApresControleCle();
        }

        verificationVerrouillageClePromise = null;
      }
    })();

    return verificationVerrouillageClePromise;
  }

  function estPageMaCle(value) {
    try {
      const url = new URL(String(value || ""), window.location.href);
      return extraireCheminMembre(url) === "/ESPACE-MEMBRE/lacleduparc.html";
    } catch {
      return false;
    }
  }

  function memoriserRetourMembreSiNecessaire() {
    if (estPageMembreSansSession(window.location.href)) return;
    if (!estUrlRetourMembreValide(window.location.href)) return;

    const urlCourante = normaliserUrlRetourMembre(window.location.href);
    const urlMemorisee = lireRetourMembre();

    if (!urlCourante || urlCourante === urlMemorisee) return;

    ecrireCookiePartage(
      COOKIE_RETOUR_MEMBRE,
      urlCourante,
      DUREE_MEMOIRE_RETOUR_MEMBRE_SECONDES
    );
  }

  function initialiserRenouvellementSessionMembre() {
    if (!estUrlDansSiteMembre(window.location.href)) return;
    if (estPageMembreSansSession(window.location.href)) return;
    if (!WORKERS.connexionMembre) return;

    const fetchNatif = window.fetch.bind(window);
    let refreshPromiseEnCours = null;
    let dernierSignalActivite = 0;

    async function verifierSiNecessaire(options = {}) {
      const maintenant = Date.now();
      const verificationAvantFetch = options && options.avantFetch === true;

      if (document.visibilityState === "hidden") return true;

      if (refreshPromiseEnCours) {
        return await refreshPromiseEnCours;
      }

      if (!verificationAvantFetch && maintenant - dernierSignalActivite < 30000) {
        return true;
      }

      dernierSignalActivite = maintenant;

      const prochaineVerification = Number(lireCookie(COOKIE_SESSION_MEMBRE_NEXT_REFRESH) || "0");

      if (Number.isFinite(prochaineVerification) && prochaineVerification > maintenant) {
        return true;
      }

      refreshPromiseEnCours = (async () => {
        try {
          const reponse = await fetchNatif(nettoyerBaseUrl(WORKERS.connexionMembre) + "/session-refresh", {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: {
              "Accept": "application/json"
            }
          });

          const data = await reponse.json().catch(() => null);

          if (reponse.status === 401) {
            supprimerCookiePartage(COOKIE_SESSION_MEMBRE_NEXT_REFRESH);

            if (String(data?.reason || "") === "session_replaced") {
              await gererSessionRemplacee();
              return false;
            }

            window.LCDP_redirigerConnexionMembre("session-refresh", "inactive");
            return false;
          }

          if (!reponse.ok || !data || data.success !== true) {
            programmerProchaineVerificationSessionMembre(DELAI_REESSAI_REFRESH_ERREUR_SECONDES);
            return true;
          }

          programmerProchaineVerificationSessionMembre(
            nombreSecondesValide(data.nextRefreshInSeconds, DELAI_REESSAI_REFRESH_ERREUR_SECONDES)
          );

          return true;
        } catch (error) {
          console.error("Refresh session membre :", error);
          programmerProchaineVerificationSessionMembre(DELAI_REESSAI_REFRESH_ERREUR_SECONDES);
          return true;
        } finally {
          refreshPromiseEnCours = null;
        }
      })();

      return await refreshPromiseEnCours;
    }

    window.LCDP_verifierSessionMembreSiNecessaire = verifierSiNecessaire;
    installerVerificationSessionAvantFetch(fetchNatif, verifierSiNecessaire);

    ["pointerdown", "keydown", "touchstart", "scroll"].forEach((nomEvenement) => {
      window.addEventListener(nomEvenement, verifierSiNecessaire, { passive: true });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        verifierSiNecessaire();
      }
    });

    window.addEventListener("pageshow", verifierSiNecessaire);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", verifierSiNecessaire, { once: true });
    } else {
      window.setTimeout(verifierSiNecessaire, 0);
    }
  }

  function installerVerificationSessionAvantFetch(fetchNatif, verifierSiNecessaire) {
    if (window.LCDP_verificationSessionAvantFetchInstallee === true) return;

    window.LCDP_verificationSessionAvantFetchInstallee = true;

    window.fetch = async function LCDP_fetchAvecVerificationSession(input, init) {
      if (requeteFetchDoitVerifierSessionMembre(input, init)) {
        await verifierSiNecessaire({ avantFetch: true });
      }

      return fetchNatif(input, init);
    };
  }

  function requeteFetchDoitVerifierSessionMembre(input, init) {
    const credentials = String(
      (init && init.credentials) ||
      (typeof Request !== "undefined" && input instanceof Request ? input.credentials : "") ||
      ""
    ).toLowerCase();

    if (credentials !== "include") return false;

    let url;

    try {
      url = new URL(
        typeof input === "string" ? input : input && input.url ? input.url : "",
        window.location.href
      );
    } catch {
      return false;
    }

    if (url.href === nettoyerBaseUrl(WORKERS.connexionMembre) + "/session-refresh") {
      return false;
    }

    return url.hostname.endsWith("-api.lacleduparc.fr");
  }

  function programmerProchaineVerificationSessionMembre(delaiSecondes) {
    const delai = nombreSecondesValide(
      delaiSecondes,
      DELAI_REESSAI_REFRESH_ERREUR_SECONDES
    );
    const timestamp = Date.now() + delai * 1000;

    ecrireCookiePartage(
      COOKIE_SESSION_MEMBRE_NEXT_REFRESH,
      String(timestamp),
      delai +
        MARGE_COOKIE_PROCHAINE_VERIFICATION_SECONDES
    );
  }

  function lireRetourMembre() {
    return normaliserUrlRetourMembre(lireCookie(COOKIE_RETOUR_MEMBRE));
  }

  function effacerRetourMembre() {
    supprimerCookiePartage(COOKIE_RETOUR_MEMBRE);
  }

  function estUrlRetourMembreValide(value) {
    return Boolean(normaliserUrlRetourMembre(value));
  }

  function estPageMembreSansSession(value) {
    if (window.LCDP_PAGE_MEMBRE_SANS_SESSION === true) {
      return true;
    }

    let url;

    try {
      url = new URL(String(value || ""), window.location.href);
    } catch {
      return false;
    }

    return estCheminMembreSansSession(extraireCheminMembre(url));
  }

  function estCheminMembreSansSession(cheminMembre) {
    const cheminNormalise = String(cheminMembre || "").replace(/\/+$/, "");
    return CHEMINS_MEMBRE_SANS_SESSION.has(cheminNormalise);
  }

  function normaliserUrlRetourMembre(value) {
    const texte = String(value || "").trim();

    if (!texte) return "";

    let url;

    try {
      url = new URL(texte, window.location.href);
    } catch {
      return "";
    }

    const cheminMembre = extraireCheminMembre(url);

    if (!cheminMembre) return "";
    if (!cheminMembre.startsWith("/ESPACE-MEMBRE/")) return "";
    if (estCheminMembreSansSession(cheminMembre)) return "";
    if (cheminMembre === "/ESPACE-MEMBRE/accueil-membre.html") return "";
    if (cheminMembre === "/index.html" || cheminMembre === "/") return "";

    return url.href;
  }

  function estUrlDansSiteMembre(value) {
    let url;

    try {
      url = new URL(String(value || ""), window.location.href);
    } catch {
      return false;
    }

    return Boolean(extraireCheminMembre(url));
  }

  function extraireCheminMembre(url) {
    let baseMembre;

    try {
      baseMembre = new URL(active.membreBase);
    } catch {
      return "";
    }

    if (url.origin !== baseMembre.origin) return "";

    const basePath = baseMembre.pathname.replace(/\/+$/, "");
    let chemin = url.pathname;

    if (basePath) {
      if (chemin !== basePath && !chemin.startsWith(basePath + "/")) {
        return "";
      }

      chemin = chemin.slice(basePath.length) || "/";
    }

    return chemin || "/";
  }

  function ecrireCookiePartage(nom, valeur, maxAgeSecondes) {
    const attributs = attributsCookiePartage(maxAgeSecondes);
    document.cookie = nom + "=" + encodeURIComponent(valeur) + attributs;
  }

  function supprimerCookiePartage(nom) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    const domaine = attributDomaineCookie();

    document.cookie = nom + "=; Path=/; Max-Age=0; SameSite=Lax" + secure;

    if (domaine) {
      document.cookie = nom + "=; Path=/; Max-Age=0; SameSite=Lax" + secure + domaine;
    }
  }

  function attributsCookiePartage(maxAgeSecondes) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    const domaine = attributDomaineCookie();
    const maxAge = Number.isFinite(Number(maxAgeSecondes))
      ? "; Max-Age=" + String(Math.max(0, Math.floor(Number(maxAgeSecondes))))
      : "";

    return "; Path=/; SameSite=Lax" + secure + domaine + maxAge;
  }

  function attributDomaineCookie() {
    const hostname = window.location.hostname;

    if (hostname === "lacleduparc.fr" || hostname.endsWith(".lacleduparc.fr")) {
      return "; Domain=.lacleduparc.fr";
    }

    return "";
  }

  function lireCookie(nom) {
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

  function nombreSecondesValide(value, defaut) {
    const nombre = Number(value);

    if (!Number.isFinite(nombre) || nombre <= 0) {
      return defaut;
    }

    return Math.floor(nombre);
  }

})();
