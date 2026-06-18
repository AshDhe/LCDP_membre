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

    PUBLIC_BASE: active.publicBase,
    MEMBRE_BASE: active.membreBase,
    PARC_BASE: active.parcBase,
    COACH_BASE: active.coachBase,

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