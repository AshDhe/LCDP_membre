(() => {
  "use strict";

  const CONFIG_PAGE = window.SITE_CONFIG || {};

  const ENDPOINT_FACTUPAIEMENT = construireEndpointApi(
    "workerFactuPaiementUrl",
    "WORKER_FACTUPAIEMENT_URL",
    "factupaiement-api"
  );

  const PAGE_ACCUEIL_MEMBRE = construireUrlMembre("/ESPACE-MEMBRE/accueil-membre.html");
  const PAGE_CONNEXION_MEMBRE = construireUrlPublic("/ESPACE-PUBLIC/connexion-membre.html");
  const SOURCE_PAGE = "paiement-cb";

  const params = new URLSearchParams(window.location.search);
  const orderid = String(params.get("orderid") || "").trim();
  const echeance = String(params.get("echeance") || "1").trim() || "1";
  const retour = String(params.get("retour") || "").trim().toLowerCase();
  const sourcePaiement = String(params.get("source") || "").trim().toLowerCase();

  // Conserver l’origine dans cet onglet, y compris au retour de Stripe.
  // Une URL de retour externe ou une autre page de paiement est refusée.
  const cleOrigine = "lcdp:origine-paiement-cb:" + JSON.stringify([orderid, echeance]);
  const pageOrigine = retrouverPageOrigine();
  let redirectionPaiementValideProgrammee = false;

  function origineMembreSure(valeur) {
    if (!valeur) return "";
    try {
      const url = new URL(valeur, window.location.href);
      if (url.origin !== window.location.origin ||
          !/^\/ESPACE-MEMBRE\/[a-zA-Z0-9_-]+\.html$/.test(url.pathname) ||
          url.pathname === window.location.pathname) return "";
      return url.href;
    } catch { return ""; }
  }

  function retrouverPageOrigine() {
    let origine = origineMembreSure(document.referrer);
    try {
      if (!origine && !retour && sourcePaiement === "suspension") {
        origine = origineMembreSure(PAGE_ACCUEIL_MEMBRE);
      }
      if (!origine) origine = origineMembreSure(sessionStorage.getItem(cleOrigine));
      if (origine && orderid) sessionStorage.setItem(cleOrigine, origine);
    } catch {
      if (!origine && sourcePaiement === "suspension") origine = origineMembreSure(PAGE_ACCUEIL_MEMBRE);
    }
    return origine;
  }

  function revenirPageOrigine() {
    if (!pageOrigine) return;
    try { sessionStorage.removeItem(cleOrigine); } catch {}
    window.location.replace(pageOrigine);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserPage);
  } else {
    initialiserPage();
  }

  async function initialiserPage() {
    const boutonPayer = document.querySelector("[data-lcdp-paiement-cb-payer]");
    const boutonRecommencer = document.querySelector("[data-lcdp-paiement-cb-recommencer]");
    const boutonQuitter = document.querySelector("[data-lcdp-paiement-cb-quitter]");

    if (boutonQuitter) boutonQuitter.addEventListener("click", revenirPageOrigine);

    if (!orderid) {
      afficherMessage("Numéro de commande manquant.", "erreur");
      afficherQuitter();
      return;
    }

    if (boutonPayer) boutonPayer.addEventListener("click", creerCheckout);
    if (boutonRecommencer) boutonRecommencer.addEventListener("click", creerCheckout);

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

    const etat = String(paiement.etat || "").trim().toLowerCase();
    if (statustripe === "paye" && etat === "paye") {
      afficherMessage(pageOrigine ? "Votre paiement est validé. Retour à la page d’origine..." : "Votre paiement est validé.", "succes");
      if (pageOrigine) programmerRedirectionOrigine();
      return;
    }

    if (statustripe === "paye" || etat === "paye") {
      afficherMessage("Le statut de cette échéance est incohérent. Aucun nouveau paiement n’est proposé. Contactez l’association.", "erreur");
      afficherQuitter();
      return;
    }

    if (paiement.delaiPaiementDepasse === true || paiement.abonnementAnnuleNonPaye === true) {
      afficherMessage(paiement.messageDelaiPaiement || "Le règlement de cette échéance est indisponible.", "erreur");
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
    if (!pageOrigine) return;
    const bouton = document.querySelector("[data-lcdp-paiement-cb-quitter]");
    afficherBoutonAction(bouton);
  }

  function afficherBoutonAction(bouton) {
    if (!bouton) return;

    bouton.hidden = false;
  }

  function programmerRedirectionOrigine() {
    if (!pageOrigine || redirectionPaiementValideProgrammee) return;

    redirectionPaiementValideProgrammee = true;
    window.setTimeout(revenirPageOrigine, 900);
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
