(() => {
  "use strict";
  const config = window.SITE_CONFIG || {};
  const origine = new URLSearchParams(location.search).get("origine");
  const quitter = () => location.replace(origine === "boutique"
    ? window.LCDP_urlPublic("/ESPACE-PUBLIC/boutique.html")
    : window.LCDP_urlMembre("/ESPACE-MEMBRE/accueil-membre.html"));

  async function lireEtatMembre() {
    const base = config.workerIndexMembreUrl || config.WORKER_INDEX_MEMBRE_URL ||
      config.W_INDEX_MEMBRE_URL || (typeof config.apiUrl === "function" ? config.apiUrl("index-membre-api") : "");
    if (!base) throw Error("Service membre indisponible.");
    const r = await fetch(String(base).replace(/\/+$/, "") + "/index", {
      credentials: "include", cache: "no-store", signal: AbortSignal.timeout(12000),
      headers: {Accept: "application/json"}
    });
    const data = await r.json().catch(() => null);
    if (r.status === 401 || (r.ok && data?.success === true && data.connected === false)) {
      location.replace(window.LCDP_urlPublic("/ESPACE-PUBLIC/connexion-membre.html"));
      return null;
    }
    if (!r.ok || data?.success !== true || data.connected !== true) throw Error("État membre indisponible.");
    return {paiementSuspension: data.paiementSuspension || data.paiementRegularisation || null};
  }
  async function initialiser() {
    const main = document.querySelector(".lcdp-app-wrapper > .lcdp-site-main");
    if (!main || !window.LCDP_PaiementImpaye) throw Error("Parcours indisponible.");
    const [etat] = await Promise.all([lireEtatMembre(), Promise.resolve(window.LCDP_cadreAccessoiresPret)]);
    if (!etat) return;
    // Le masque existant reste visible tant que la liste (ou son dialogue d’erreur) n’est pas montée.
    const pret = () => Boolean(main.querySelector("[data-lcdp-impaye-liste], [data-lcdp-paiement-impaye-parcours] [data-lcdp-dialogue-reference]"));
    const reveiller = () => {
      if (!pret()) return;
      observer.disconnect();
      window.LCDP_impayeAttenteTerminer?.();
      main.querySelector("[data-lcdp-paiement-impaye-parcours] button:not(:disabled)")?.focus();
    };
    const observer = new MutationObserver(reveiller);
    observer.observe(main, {childList:true,subtree:true});
    try {
      await window.LCDP_PaiementImpaye.ouvrir(etat,{quitter});
      reveiller();
    } finally {observer.disconnect();}
  }
  initialiser().catch(error => {
    console.error("Paiements en attente :", error);
    window.LCDP_impayeAttenteErreur?.();
  });
})();
