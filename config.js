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

    nouvelleDateMembre: "https://nouvelle-date-membre-api.lacleduparc.fr",
    fluxm: "https://fluxm-api.lacleduparc.fr",
    planningMembre: "https://planning-membre-api.lacleduparc.fr",
    inviterMembre: "https://inviter-membre-api.lacleduparc.fr",
    invitationMembre: "https://invitation-membre-api.lacleduparc.fr",
    aboMembre: "https://abo-membre-api.lacleduparc.fr",
    factuPaiement: "https://factupaiement-api.lacleduparc.fr",

    monCompteMembre: "https://mon-compte-membre-api.lacleduparc.fr",
    majEmailMembre: "https://maj-email-membre-api.lacleduparc.fr",
    majParrainMembre: "https://maj-parrain-membre-api.lacleduparc.fr",
    majDepartementMembre: "https://maj-dptmt-membre-api.lacleduparc.fr"
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

    workerNouvelleDateMembreUrl: WORKERS.nouvelleDateMembre,
    workerFluxmUrl: WORKERS.fluxm,
    workerPlanningMembreUrl: WORKERS.planningMembre,
    workerInviterMembreUrl: WORKERS.inviterMembre,
    workerInvitationMembreUrl: WORKERS.invitationMembre,
    workerAboMembreUrl: WORKERS.aboMembre,
    workerFactuPaiementUrl: WORKERS.factuPaiement,

    workerMonCompteMembreUrl: WORKERS.monCompteMembre,
    workerMajEmailMembreUrl: WORKERS.majEmailMembre,
    workerMajParrainMembreUrl: WORKERS.majParrainMembre,
    workerMajDepartementMembreUrl: WORKERS.majDepartementMembre,

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

    WORKER_NOUVELLE_DATE_MEMBRE_URL: WORKERS.nouvelleDateMembre,
    WORKER_FLUXM_URL: WORKERS.fluxm,
    WORKER_PLANNING_MEMBRE_URL: WORKERS.planningMembre,
    WORKER_INVITER_MEMBRE_URL: WORKERS.inviterMembre,
    WORKER_INVITATION_MEMBRE_URL: WORKERS.invitationMembre,
    WORKER_ABO_MEMBRE_URL: WORKERS.aboMembre,
    WORKER_FACTUPAIEMENT_URL: WORKERS.factuPaiement,

    WORKER_MON_COMPTE_MEMBRE_URL: WORKERS.monCompteMembre,
    WORKER_MAJ_EMAIL_MEMBRE_URL: WORKERS.majEmailMembre,
    WORKER_MAJ_PARRAIN_MEMBRE_URL: WORKERS.majParrainMembre,
    WORKER_MAJ_DEPARTEMENT_MEMBRE_URL: WORKERS.majDepartementMembre,

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
  const DUREE_SESSION_MEMBRE_SECONDES = 60 * 60 * 10;
  const SEUIL_RENOUVELLEMENT_SESSION_MEMBRE_SECONDES = 60 * 60 * 2;
  const DELAI_VERIFICATION_SESSION_MEMBRE_SECONDES =
    DUREE_SESSION_MEMBRE_SECONDES - SEUIL_RENOUVELLEMENT_SESSION_MEMBRE_SECONDES;
  const DELAI_REESSAI_REFRESH_ERREUR_SECONDES = 60 * 10;
  const DUREE_MEMOIRE_RETOUR_MEMBRE_SECONDES = 60 * 60 * 24 * 30;
  const CHEMINS_MEMBRE_SANS_SESSION = new Set([
    "/ESPACE-MEMBRE/mdp-membre.html"
  ]);

  memoriserRetourMembreSiNecessaire();
  initialiserRenouvellementSessionMembre();

  window.LCDP_estUrlRetourMembreValide = estUrlRetourMembreValide;
  window.LCDP_lireRetourMembre = lireRetourMembre;
  window.LCDP_effacerRetourMembre = effacerRetourMembre;
  window.LCDP_programmerProchaineVerificationSessionMembre = programmerProchaineVerificationSessionMembre;
  window.LCDP_lireCookie = lireCookie;
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
    if (!WORKERS.indexMembre) return;

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
          const reponse = await fetchNatif(nettoyerBaseUrl(WORKERS.indexMembre) + "/session-refresh", {
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
            window.LCDP_redirigerConnexionMembre("session-refresh", "inactive");
            return false;
          }

          if (!reponse.ok || !data || data.success !== true) {
            programmerProchaineVerificationSessionMembre(DELAI_REESSAI_REFRESH_ERREUR_SECONDES);
            return true;
          }

          programmerProchaineVerificationSessionMembre(
            nombreSecondesValide(data.nextRefreshInSeconds, DELAI_VERIFICATION_SESSION_MEMBRE_SECONDES)
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

    if (url.href === nettoyerBaseUrl(WORKERS.indexMembre) + "/session-refresh") {
      return false;
    }

    return url.hostname.endsWith("-api.lacleduparc.fr");
  }

  function programmerProchaineVerificationSessionMembre(delaiSecondes) {
    const delai = nombreSecondesValide(delaiSecondes, DELAI_VERIFICATION_SESSION_MEMBRE_SECONDES);
    const timestamp = Date.now() + delai * 1000;

    ecrireCookiePartage(
      COOKIE_SESSION_MEMBRE_NEXT_REFRESH,
      String(timestamp),
      DUREE_SESSION_MEMBRE_SECONDES
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
