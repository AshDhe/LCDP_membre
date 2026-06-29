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

    nouvelleDateMembre: "https://nouvelle-date-membre-api.lacleduparc.fr",
    fluxm: "https://worker-fluxm-api.lacleduparc.fr",
    planningMembre: "https://planning-membre-api.lacleduparc.fr",
    inviterMembre: "https://inviter-membre-api.lacleduparc.fr",
    invitationMembre: "https://invitation-membre-api.lacleduparc.fr",

    monCompteMembre: "https://mon-compte-membre-api.lacleduparc.fr",
    majEmailMembre: "https://maj-email-membre-api.lacleduparc.fr",
    majParrainMembre: "https://maj-parrain-membre-api.lacleduparc.fr",
    majDepartementMembre: "https://maj-dptmt-membre-api.lacleduparc.fr"
  };

  function buildUrl(base, path) {
    return String(base || "").replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");
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

    workerNouvelleDateMembreUrl: WORKERS.nouvelleDateMembre,
    workerFluxmUrl: WORKERS.fluxm,
    workerPlanningMembreUrl: WORKERS.planningMembre,
    workerInviterMembreUrl: WORKERS.inviterMembre,
    workerInvitationMembreUrl: WORKERS.invitationMembre,

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

    WORKER_NOUVELLE_DATE_MEMBRE_URL: WORKERS.nouvelleDateMembre,
    WORKER_FLUXM_URL: WORKERS.fluxm,
    WORKER_PLANNING_MEMBRE_URL: WORKERS.planningMembre,
    WORKER_INVITER_MEMBRE_URL: WORKERS.inviterMembre,
    WORKER_INVITATION_MEMBRE_URL: WORKERS.invitationMembre,

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
})();