(function () {
  const host = window.location.hostname;

  const isGithub = host === "huguespavret.github.io";

  const CONFIG = {
    github: {
      publicBase: "https://huguespavret.github.io/LCDP_public",
      membreBase: "https://huguespavret.github.io/LCDP_membre",
      parcBase: "https://huguespavret.github.io/LCDP_parc",
      coachBase: "https://huguespavret.github.io/LCDP_coach"
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