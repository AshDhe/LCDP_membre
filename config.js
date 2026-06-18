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

  function buildUrl(base, path) {
    return base.replace(/\/$/, "") + "/" + String(path || "").replace(/^\/+/, "");
  }

  window.SITE_CONFIG = {
    publicBaseUrl: active.publicBase,
    siteBase: active.publicBase,

    membreBaseUrl: active.membreBase,
    parcBaseUrl: active.parcBase,
    coachBaseUrl: active.coachBase,

    workerMdptokenzUrl: isGithub
      ? "https://w-mdptokenz.hugues-pavret.workers.dev"
      : "https://mdptokenz-api.lacleduparc.fr",

    workerConnexionMembreUrl: "https://connexion-membre-api.lacleduparc.fr",

    workerFormInscriptionMembreUrl: "https://form-inscription-membre-api.lacleduparc.fr",

    PUBLIC_BASE: active.publicBase,
    MEMBRE_BASE: active.membreBase,
    PARC_BASE: active.parcBase,
    COACH_BASE: active.coachBase,

    WORKER_MDPTOKENZ_URL: isGithub
      ? "https://w-mdptokenz.hugues-pavret.workers.dev"
      : "https://mdptokenz-api.lacleduparc.fr",

    WORKER_CONNEXION_MEMBRE_URL: "https://connexion-membre-api.lacleduparc.fr",

    WORKER_FORM_INSCRIPTION_MEMBRE_URL: "https://form-inscription-membre-api.lacleduparc.fr",

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