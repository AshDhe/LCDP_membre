(function () {
  const host = window.location.hostname;

  const isGithub =
    host === "ashdhe.github.io" ||
    host === "huguespavret.github.io";

  const CONFIG = {
    github: {
      publicBase: "https://ashdhe.github.io/LCDP_public",
      membreBase: "https://ashdhe.github.io/LCDP_membre",
      parcBase: "https://ashdhe.github.io/LCDP_parc",
      coachBase: "https://ashdhe.github.io/LCDP_coach"
    },

    production: {
      publicBase: "https://lacleduparc.fr",
      membreBase: "https://membre.lacleduparc.fr",
      parcBase: "https://parc.lacleduparc.fr",
      coachBase: "https://coach.lacleduparc.fr"
    }
  };

  const active = isGithub ? CONFIG.github : CONFIG.production;

  const WORKERS = {
    mdptokenz: "https://mdptokenz-api.lacleduparc.fr",
    connexionMembre: "https://connexion-membre-api.lacleduparc.fr",
    formInscriptionMembre: "https://form-inscription-membre-api.lacleduparc.fr",
    indexMembre: "https://index-membre-api.lacleduparc.fr",
    monCompteMembre: "https://mon-compte-membre-api.lacleduparc.fr",
    fluxm: "https://fluxm-api.lacleduparc.fr"
  };

  function buildUrl(base, path) {
    return base.replace(/\/$/, "") + "/" + String(path || "").replace(/^\/+/, "");
  }

  window.SITE_CONFIG = {
    publicBaseUrl: active.publicBase,
    siteBase: active.membreBase,

    membreBaseUrl: active.membreBase,
    parcBaseUrl: active.parcBase,
    coachBaseUrl: active.coachBase,

    workerMdptokenzUrl: WORKERS.mdptokenz,
    workerConnexionMembreUrl: WORKERS.connexionMembre,
    workerFormInscriptionMembreUrl: WORKERS.formInscriptionMembre,
    workerIndexMembreUrl: WORKERS.indexMembre,
    workerMonCompteMembreUrl: WORKERS.monCompteMembre,
    workerFluxmUrl: WORKERS.fluxm,

    PUBLIC_BASE: active.publicBase,
    MEMBRE_BASE: active.membreBase,
    PARC_BASE: active.parcBase,
    COACH_BASE: active.coachBase,

    WORKER_MDPTOKENZ_URL: WORKERS.mdptokenz,
    WORKER_CONNEXION_MEMBRE_URL: WORKERS.connexionMembre,
    WORKER_FORM_INSCRIPTION_MEMBRE_URL: WORKERS.formInscriptionMembre,
    WORKER_INDEX_MEMBRE_URL: WORKERS.indexMembre,
    WORKER_MON_COMPTE_MEMBRE_URL: WORKERS.monCompteMembre,
    WORKER_FLUXM_URL: WORKERS.fluxm,

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

    apiUrl(workerSubdomain) {
      return "https://" + workerSubdomain + ".lacleduparc.fr";
    }
  };
})();