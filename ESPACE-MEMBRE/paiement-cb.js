(() => {
  "use strict";

  function initialiserPaiementCB(racine, options = {}) {
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
  const orderid = String(options.orderid ?? params.get("orderid") ?? "").trim();
  const echeance = String(options.echeance ?? params.get("echeance") ?? "1").trim() || "1";
  const retour = String(options.retour ?? params.get("retour") ?? "").trim().toLowerCase();
  const sourcePaiement = String(options.source ?? params.get("source") ?? "").trim().toLowerCase();

  // Conserver l’origine dans cet onglet, y compris au retour de Stripe.
  // Une URL de retour externe ou une autre page de paiement est refusée.
  const cleOrigine = "lcdp:origine-paiement-cb:" + JSON.stringify([orderid, echeance]);
  const pageOrigine = options.integre ? window.location.href : retrouverPageOrigine();
  const listeImpayes = construireUrlMembre("/ESPACE-MEMBRE/paiement-cb.html?liste=1");
  const cleRetourListe = "lcdp:impayes:origine";
  function memoriserOrigineListe() {
    try {
      const origine = new URL(pageOrigine,window.location.href);
      const accueil = new URL(PAGE_ACCUEIL_MEMBRE,window.location.href);
      const dossier = accueil.pathname.slice(0,accueil.pathname.lastIndexOf("/")+1);
      if(origine.origin===accueil.origin && origine.pathname.startsWith(dossier) &&
         !/^paiement(?:[-_]|\.html)/i.test(origine.pathname.slice(dossier.length))) {
        sessionStorage.setItem(cleRetourListe,origine.href);
      }
    } catch {}
  }
  if (options.integre && orderid) { try { sessionStorage.setItem(cleOrigine, pageOrigine); } catch {} }
  let redirectionPaiementValideProgrammee = false;
  let checkoutEnCours = false;

  function origineMembreSure(valeur) {
    if (!valeur) return "";
    try {
      const url = new URL(valeur, window.location.href);
      if (url.origin !== window.location.origin ||
          !/^\/ESPACE-MEMBRE\/[a-zA-Z0-9_-]+\.html$/.test(url.pathname) ||
          /^\/ESPACE-MEMBRE\/paiement(?:[-_]|\.html)/i.test(url.pathname) ||
          url.pathname === window.location.pathname) return "";
      return url.href;
    } catch { return ""; }
  }

  function retrouverPageOrigine() {
    let origine = origineMembreSure(document.referrer);
    try {
      if (!origine) origine = origineMembreSure(sessionStorage.getItem(cleOrigine));
      if (!origine && sourcePaiement === "suspension") origine = origineMembreSure(PAGE_ACCUEIL_MEMBRE);
      if (origine && orderid) sessionStorage.setItem(cleOrigine, origine);
    } catch {
      if (!origine && sourcePaiement === "suspension") origine = origineMembreSure(PAGE_ACCUEIL_MEMBRE);
    }
    return origine;
  }

  function revenirPageOrigine(actualiser = false) {
    if (!racine.isConnected) return;
    if (sourcePaiement === "suspension" && (!options.integre || actualiser)) {
      memoriserOrigineListe();
      try { sessionStorage.removeItem(cleOrigine); } catch {}
      window.location.replace(listeImpayes);
      return;
    }
    if (!pageOrigine) return;
    try { sessionStorage.removeItem(cleOrigine); } catch {}
    if (options.integre && !actualiser && typeof options.quitter === "function") {
      options.quitter();
      return;
    }
    window.location.replace(pageOrigine);
  }

  async function initialiserPage() {
    const boutonPayer = racine.querySelector("[data-lcdp-paiement-cb-payer]");
    const boutonRecommencer = racine.querySelector("[data-lcdp-paiement-cb-recommencer]");
    const boutonQuitter = racine.querySelector("[data-lcdp-paiement-cb-quitter]");

    if (boutonQuitter) boutonQuitter.addEventListener("click", () => revenirPageOrigine());

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
    if (!racine.isConnected) return;
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
      if (!racine.isConnected) return;

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
    const details = racine.querySelector("[data-lcdp-paiement-cb-details]");
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

    if (retour === "cancel" && pageOrigine) {
      revenirPageOrigine();
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

  async function creerCheckout(event) {
    if (!racine.isConnected || checkoutEnCours) return;
    checkoutEnCours = true;
    const bouton = event?.currentTarget || racine.querySelector("[data-lcdp-paiement-cb-payer]");
    const restaurer = activerAttenteBouton(bouton);
    const quitter = racine.querySelector("[data-lcdp-paiement-cb-quitter]");
    if (quitter) quitter.disabled = true;
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
        body: JSON.stringify({ orderid, echeance, source: sourcePaiement, ...(sourcePaiement === "suspension" ? {interface:"elements"} : {}) })
      });

      const data = await reponse.json().catch(() => null);
      if (!racine.isConnected) return;

      if (reponse.status === 401) {
        redirigerConnexionMembre("inactive");
        return;
      }

      if (!reponse.ok || !data || !reponseApiOk(data) || (!data.checkout?.url && !data.checkout?.clientSecret)) {
        throw new Error(messageErreurApi(data, "Impossible de créer le paiement Stripe."));
      }

      if (sourcePaiement === "suspension" && data.checkout?.clientSecret) {
        memoriserOrigineListe();
        const slot = racine.closest("[data-lcdp-compte-parcours-contenu]");
        if(!slot)throw Error("Emplacement du formulaire bancaire indisponible.");
        if(!window.LCDP_monterElementsImpaye){
          await new Promise((resolve,reject)=>{
            const script=document.createElement("script");
            script.src=construireUrlMembre("/ESPACE-MEMBRE/paiement-elements-impaye.js?v=20261126-bouton-deux-niveaux-v5");
            script.onload=resolve;
            script.onerror=()=>{script.remove();reject(Error("Formulaire bancaire indisponible."));};
            document.head.appendChild(script);
          });
        }
        if(!racine.isConnected)return;
        if(typeof window.LCDP_monterElementsImpaye!=="function")throw Error("Formulaire bancaire indisponible.");
        const verification=construireUrlMembre("/ESPACE-MEMBRE/paiement-cb.html?orderid="+encodeURIComponent(orderid)+"&echeance="+encodeURIComponent(echeance)+"&source=suspension&retour=success");
        await window.LCDP_monterElementsImpaye(slot,data.checkout,{
          orderid,echeance,
          quitter:()=>{
            if(options.integre && typeof options.quitter==="function")options.quitter();
            else window.location.replace(listeImpayes);
          },
          confirmer:()=>window.location.replace(verification)
        });
        return;
      }
      if (!data.checkout?.url) throw Error("Session de paiement indisponible.");
      if (sourcePaiement === "suspension") {
        memoriserOrigineListe();
        // Le retour navigateur recharge la même liste, même sans bfcache.
        const cibleListe = new URL(listeImpayes,window.location.href);
        if(cibleListe.origin===window.location.origin){
          try { window.history.replaceState(window.history.state,"",cibleListe.href); } catch {}
        }
        // Si le navigateur restaure le DOM précédent, ne pas conserver l'écran CB occupé.
        window.addEventListener("pageshow",event=>{
          if(event.persisted && checkoutEnCours) window.location.replace(cibleListe.href);
        },{once:true});
      }
      window.location.href = data.checkout.url;
    } catch (error) {
      console.error("Erreur création Checkout Stripe :", error);
      afficherMessage(error.message || "Impossible de créer le paiement Stripe.", "erreur");
      restaurer();
      checkoutEnCours = false;
      if (quitter) quitter.disabled = false;
      masquerActions();
      afficherRecommencer();
      afficherQuitter();
    }
  }

  function afficherMessage(message, type) {
    const element = racine.querySelector("[data-lcdp-paiement-cb-message]");
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
      const bouton = racine.querySelector(selecteur);

      if (!bouton) return;

      bouton.hidden = true;
    });
  }

  function afficherPayer() {
    const bouton = racine.querySelector("[data-lcdp-paiement-cb-payer]");
    afficherBoutonAction(bouton);
  }

  function afficherRecommencer() {
    const bouton = racine.querySelector("[data-lcdp-paiement-cb-recommencer]");
    afficherBoutonAction(bouton);
  }

  function afficherQuitter() {
    if (!pageOrigine) return;
    const bouton = racine.querySelector("[data-lcdp-paiement-cb-quitter]");
    afficherBoutonAction(bouton);
  }

  function afficherBoutonAction(bouton) {
    if (!bouton) return;

    bouton.hidden = false;
  }

  function programmerRedirectionOrigine() {
    if (!pageOrigine || redirectionPaiementValideProgrammee) return;

    redirectionPaiementValideProgrammee = true;
    window.setTimeout(() => revenirPageOrigine(true), 900);
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
  return initialiserPage();
  }

  function activerAttenteBouton(bouton) {
    if (!bouton) return () => {};
    if (window.LCDP_PaiementImpaye?.attendreBouton) return window.LCDP_PaiementImpaye.attendreBouton(bouton);
    const disabled = bouton.disabled;
    const avaitClasse = bouton.classList.contains("lcdp-action-attente");
    bouton.classList.add("lcdp-action-attente");
    bouton.disabled = true;
    bouton.setAttribute("aria-busy","true");
    return () => {
      if (!avaitClasse) bouton.classList.remove("lcdp-action-attente");
      bouton.disabled = disabled;
      bouton.removeAttribute("aria-busy");
    };
  }

  async function monterPaiementCB(slot, options = {}) {
    if (!slot?.isConnected) return;
    if (slot.querySelector("[data-lcdp-paiement-cb-payer]")) return initialiserPaiementCB(slot,options);
    const cfg = window.SITE_CONFIG || {};
    const url = typeof window.LCDP_urlObjet === "function"
      ? window.LCDP_urlObjet("/HTMLBASE/02-dialogue-reference-information.html")
      : cfg.objetUrl("/HTMLBASE/02-dialogue-reference-information.html");
    const reponse = await fetch(url,{credentials:"omit",cache:"no-cache"});
    if (!reponse.ok) throw Error("Boîte de paiement indisponible.");
    const template = document.createElement("template");
    template.innerHTML = (await reponse.text()).trim();
    if (!slot.isConnected) return;
    const dialogue = template.content.querySelector('[data-lcdp-dialogue-reference="information"]');
    const titre = dialogue?.querySelector("[data-lcdp-dialogue-titre]");
    const message = dialogue?.querySelector("[data-lcdp-dialogue-message]");
    const actions = dialogue?.querySelector(".lcdp-dialogue-ref__actions");
    if (!dialogue || !titre || !message || !actions) throw Error("Boîte de paiement incomplète.");
    dialogue.setAttribute("role","region");
    dialogue.removeAttribute("aria-modal");
    titre.textContent = "Paiement CB";
    message.textContent = "Chargement du paiement…";
    message.setAttribute("data-lcdp-paiement-cb-message","");
    message.setAttribute("aria-live","polite");
    const details = document.createElement("p");
    details.className = "lcdp-dialogue-ref__message";
    details.setAttribute("data-lcdp-paiement-cb-details","");
    details.hidden = true;
    message.before(details);
    actions.replaceChildren();
    for (const [type,libelle,style] of [
      ["payer","Accéder au paiement sécurisé","principal"],
      ["recommencer","Recommencer","principal"],
      ["quitter",options.integre ? "Retour à la demande" : "Retour","secondaire"]
    ]) {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "lcdp-dialogue-ref__bouton lcdp-dialogue-ref__bouton--"+style;
      if (type === "payer") {
        const lignes = document.createElement("span");
        lignes.append("Accéder au paiement", document.createElement("br"), "sécurisé");
        bouton.appendChild(lignes);
      } else {
        bouton.textContent = libelle;
      }
      bouton.setAttribute("data-lcdp-paiement-cb-"+type,"");
      bouton.hidden = true;
      actions.appendChild(bouton);
    }
    slot.replaceChildren(template.content);
    return initialiserPaiementCB(dialogue,options);
  }
  window.LCDP_monterPaiementCB = monterPaiementCB;

  async function chargerCoquePaiement() {
    async function charger(id,url) {
      const slot = document.getElementById(id);
      if (!slot) return false;
      const r = await fetch(url,{credentials:"omit",cache:"no-cache"});
      if (!r.ok) throw Error("Coque de paiement indisponible.");
      const template = document.createElement("template");
      template.innerHTML = (await r.text()).trim();
      slot.replaceChildren(template.content);
      slot.querySelectorAll("[data-site-href]").forEach(el => {
        el.href = el.dataset.space === "membre" ? window.LCDP_urlMembre(el.dataset.siteHref) : window.LCDP_urlPublic(el.dataset.siteHref);
      });
      slot.querySelectorAll("[data-site-src]").forEach(el => {
        el.src = window.LCDP_urlObjet(el.dataset.siteSrc.replace(/^\/?OBJET\/?/,"/"));
      });
      return true;
    }
    await Promise.allSettled([
      charger("lcdp-bandeau-slot",window.LCDP_urlMembre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html")).then(async ok => {
        if (!ok) return;
        const script = document.createElement("script");
        script.src = window.LCDP_urlMembre("/ESPACE-MEMBRE/box-menu-burger-membre.js?v=20261126-workflow-impaye-v12");
        await new Promise((resolve,reject) => {script.onload=resolve;script.onerror=reject;document.body.appendChild(script);});
        await window.LCDP_initialiserMenuBurgerMembre?.();
      }),
      charger("lcdp-footer-slot",window.LCDP_urlObjet("/HTMLBASE/02-footer.html"))
    ]);
  }
  function demarrerPage() {
    const slot = document.querySelector("[data-lcdp-paiement-cb]");
    if (!slot) return;
    if (document.getElementById("lcdp-bandeau-slot")) chargerCoquePaiement().catch(console.error);
    const params=new URLSearchParams(window.location.search);
    if(params.get("liste")==="1"){
      const section=slot.closest("[data-lcdp-compte-parcours]");
      const script=document.createElement("script");
      script.src=window.LCDP_urlMembre("/ESPACE-MEMBRE/workflow-paiement-impaye.js?v=20261126-v12");
      script.onload=()=>{
        section?.remove();
        window.LCDP_PaiementImpaye.ouvrir({}, {quitter:()=>{
          const accueil=new URL(window.LCDP_urlMembre("/ESPACE-MEMBRE/accueil-membre.html"));
          let destination=accueil.href;
          try{
            const origine=new URL(sessionStorage.getItem("lcdp:impayes:origine")||accueil.href);
            sessionStorage.removeItem("lcdp:impayes:origine");
            const dossier=accueil.pathname.slice(0,accueil.pathname.lastIndexOf("/")+1);
            if(origine.origin===accueil.origin&&origine.pathname.startsWith(dossier)&&
               !/^paiement(?:[-_]|\.html)/i.test(origine.pathname.slice(dossier.length)))destination=origine.href;
          }catch{}
          window.location.replace(destination);
        }}).catch(erreur=>{
          console.error("Liste des impayés :",erreur);
          window.location.replace(window.LCDP_urlMembre("/ESPACE-MEMBRE/accueil-membre.html"));
        });
      };
      script.onerror=()=>{slot.textContent="Impossible de charger la liste des échéances. Actualisez la page pour réessayer.";};
      document.head.appendChild(script);
      return;
    }
    if(params.get("source")==="suspension"&&params.get("retour")==="cancel"){
      window.location.replace(window.LCDP_urlMembre("/ESPACE-MEMBRE/paiement-cb.html?liste=1"));
      return;
    }
    monterPaiementCB(slot).catch(erreur => {
      console.error("Paiement CB :",erreur);
      const message = slot.querySelector("[data-lcdp-paiement-cb-message]") || slot;
      message.textContent = "Impossible de charger le paiement. Revenez à votre compte pour réessayer.";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",demarrerPage,{once:true});
  else demarrerPage();
})();
