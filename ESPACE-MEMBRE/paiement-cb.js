(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};

  const ENDPOINT_FACTUPAIEMENT = construireEndpointApi(
    "workerFactuPaiementUrl",
    "WORKER_FACTUPAIEMENT_URL",
    "factupaiement-api"
  );

  const PAGE_ABONNEMENT_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/abonnement-membre.html");
  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const SOURCE_PAGE = "paiement-cb";

  const params = new URLSearchParams(window.location.search);
  const orderid = String(params.get("orderid") || "").trim();
  const echeance = String(params.get("echeance") || "1").trim() || "1";
  const retour = String(params.get("retour") || "").trim().toLowerCase();
  const sourcePaiement = String(params.get("source") || "").trim().toLowerCase();

  let redirectionPaiementValideProgrammee = false;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    const boutonPayer = document.querySelector("[data-lcdp-paiement-cb-payer]");
    const boutonRecommencer = document.querySelector("[data-lcdp-paiement-cb-recommencer]");
    const boutonQuitter = document.querySelector("[data-lcdp-paiement-cb-quitter]");

    if (!orderid) {
      afficherMessage("Numéro de commande manquant.", "erreur");
      afficherQuitter();
      return;
    }

    if (boutonPayer) boutonPayer.addEventListener("click", creerCheckout);
    if (boutonRecommencer) boutonRecommencer.addEventListener("click", creerCheckout);
    if (boutonQuitter) boutonQuitter.addEventListener("click", () => {
      window.location.href = PAGE_ABONNEMENT_MEMBRE;
    });

    await actualiserEtatPaiement();
  }

  async function actualiserEtatPaiement() {
    if (!ENDPOINT_FACTUPAIEMENT) {
      afficherMessage("Le service de paiement n’est pas configuré.", "erreur");
      afficherQuitter();
      return;
    }

    try {
      const reponse = await fetch(
        ENDPOINT_FACTUPAIEMENT + "/paiement-cb-etat?orderid=" + encodeURIComponent(orderid) + "&echeance=" + encodeURIComponent(echeance),
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Accept": "application/json"
          }
        }
      );

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data)) {
        throw new Error(messageErreurApi(data, "Impossible de charger le paiement."));
      }

      afficherEtat(data.paiement || {});
    } catch (error) {
      console.error("Erreur paiement CB :", error);
      afficherMessage(error.message || "Erreur technique. Merci de réessayer.", "erreur");
      afficherQuitter();
    }
  }

  function afficherEtat(paiement) {
    const details = document.querySelector("[data-lcdp-paiement-cb-details]");
    const statustripe = String(paiement.statustripe || "attente").toLowerCase();
    const montant = formaterMontant(paiement.montant);
    const date = formaterDate(paiement.date);

    masquerActions();

    if (details) {
      details.hidden = false;
      details.innerHTML = "Commande : " + escapeHtml(orderid) + "<br>Échéance " + escapeHtml(echeance) + " : " + escapeHtml(date) + " - " + escapeHtml(montant);
    }

    if (statustripe === "paye") {
      afficherMessage("Votre paiement est validé. Retour vers votre abonnement...", "succes");
      programmerRedirectionAbonnement();
      return;
    }

    if (paiement.delaiPaiementDepasse === true || paiement.abonnementAnnuleNonPaye === true) {
      afficherMessage(paiement.messageDelaiPaiement || "Le délai de paiement est dépassé. Cet abonnement est annulé.", "erreur");
      afficherQuitter();
      return;
    }

    if (statustripe === "impaye") {
      afficherMessage("Votre paiement a échoué.", "erreur");
      if (paiement.peutRecommencer) afficherRecommencer();
      afficherQuitter();
      return;
    }

    if (retour === "cancel") {
      afficherMessage("Votre paiement n'est pas validé. Vous pouvez recommencer.", "information");
      if (paiement.peutRecommencer) afficherRecommencer();
      afficherQuitter();
      return;
    }

    if (retour === "success") {
      afficherMessage("Paiement en cours de confirmation. Cette page peut être actualisée dans quelques secondes.", "information");
      window.setTimeout(actualiserEtatPaiement, 2500);
      afficherQuitter();
      return;
    }

    afficherMessage("Cliquez sur le bouton ci-dessous pour accéder au paiement CB sécurisé.", "information");
    afficherPayer();
    afficherQuitter();
  }

  async function creerCheckout() {
    masquerActions();
    afficherMessage("Préparation du paiement sécurisé...", "information");

    try {
      const reponse = await fetch(ENDPOINT_FACTUPAIEMENT + "/creer-checkout-cb", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ orderid, echeance, source: sourcePaiement })
      });

      const data = await reponse.json().catch(() => null);

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data) || !data.checkout?.url) {
        throw new Error(messageErreurApi(data, "Impossible de créer le paiement Stripe."));
      }

      window.location.href = data.checkout.url;
    } catch (error) {
      console.error("Erreur création Checkout Stripe :", error);
      afficherMessage(error.message || "Impossible de créer le paiement Stripe.", "erreur");
      afficherRecommencer();
      afficherQuitter();
    }
  }

  function afficherMessage(message, type) {
    const element = document.querySelector("[data-lcdp-paiement-cb-message]");
    if (!element) return;
    element.textContent = message || "";
    element.dataset.messageType = type || "information";
  }

  function masquerActions() {
    [
      "[data-lcdp-paiement-cb-payer]",
      "[data-lcdp-paiement-cb-recommencer]",
      "[data-lcdp-paiement-cb-quitter]"
    ].forEach((selecteur) => {
      const bouton = document.querySelector(selecteur);

      if (!bouton) return;

      bouton.hidden = true;
    });
  }

  function afficherPayer() {
    const bouton = document.querySelector("[data-lcdp-paiement-cb-payer]");
    afficherBoutonAction(bouton);
  }

  function afficherRecommencer() {
    const bouton = document.querySelector("[data-lcdp-paiement-cb-recommencer]");
    afficherBoutonAction(bouton);
  }

  function afficherQuitter() {
    const bouton = document.querySelector("[data-lcdp-paiement-cb-quitter]");
    afficherBoutonAction(bouton);
  }

  function afficherBoutonAction(bouton) {
    if (!bouton) return;

    bouton.hidden = false;
  }

  function programmerRedirectionAbonnement() {
    if (redirectionPaiementValideProgrammee) return;

    redirectionPaiementValideProgrammee = true;

    window.setTimeout(() => {
      window.location.replace(PAGE_ABONNEMENT_MEMBRE);
    }, 900);
  }

  function construireEndpointApi(cleModerne, cleLegacy, sousDomaineWorker) {
    const depuisConfig = CONFIG_PAGE?.[cleModerne] || CONFIG_PAGE?.[cleLegacy] || "";
    if (depuisConfig) return String(depuisConfig).replace(/\/+$/, "");
    if (typeof CONFIG_PAGE.apiUrl === "function") return CONFIG_PAGE.apiUrl(sousDomaineWorker).replace(/\/+$/, "");
    return "";
  }

  function construireUrlMembre(chemin) {
    const valeur = String(chemin || "");
    if (typeof window.LCDP_urlMembre === "function") return window.LCDP_urlMembre(valeur);
    if (typeof CONFIG_PAGE.membreUrl === "function") return CONFIG_PAGE.membreUrl(valeur);
    return buildUrl(CONFIG_PAGE.membreBaseUrl || CONFIG_PAGE.MEMBRE_BASE || CONFIG_PAGE.siteBase || "", valeur);
  }

  function construireUrlPublic(chemin) {
    const valeur = String(chemin || "");
    if (typeof window.LCDP_urlPublic === "function") return window.LCDP_urlPublic(valeur);
    if (typeof CONFIG_PAGE.publicUrl === "function") return CONFIG_PAGE.publicUrl(valeur);
    return buildUrl(CONFIG_PAGE.publicBaseUrl || CONFIG_PAGE.PUBLIC_BASE || "", valeur);
  }

  function buildUrl(base, path) {
    return String(base || "").replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");
  }

  function redirigerConnexionMembre(motif) {
    const page = PAGE_CONNEXION_MEMBRE;
    const separateur = page.includes("?") ? "&" : "?";
    window.location.href = page + separateur + "source=" + encodeURIComponent(SOURCE_PAGE) + "&session=" + encodeURIComponent(motif || "inactive");
  }

  function reponseApiOk(data) {
    return data && (data.ok === true || data.success === true);
  }

  function messageErreurApi(resultat, messageDefaut) {
    return resultat && (resultat.message || resultat.error) ? String(resultat.message || resultat.error) : messageDefaut;
  }

  function formaterMontant(value) {
    const nombre = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(nombre)) return "Non renseigné";
    return nombre.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  }

  function formaterDate(value) {
    if (!value) return "Non renseigné";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
