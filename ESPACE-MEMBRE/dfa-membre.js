(() => {
  "use strict";
  const config = window.SITE_CONFIG || {};
  const endpoint = String(config.workerDfaUrl || config.WORKER_DFA_URL || (typeof config.apiUrl === "function" ? config.apiUrl("dfa-api") : "")).replace(/\/+$/, "");
  const el = id => document.getElementById(id);
  const etat = el("dfa-statut"), form = el("formulaire-dfa-membre"), actions = el("dfa-actions");
  const reprendre = el("dfa-reprendre"), annuler = el("dfa-annuler"), retour = el("dfa-retour");
  const montant = el("dfa-montant"), valeur = el("dfa-valeur"), enregistrer = el("dfa-enregistrer");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const euros = n => new Intl.NumberFormat("fr-FR", {style:"currency",currency:"EUR",minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
  let operation = null, demandeId = null, cents = null, occupe = false, saisie = false;
  function convertir(code) {
    if (!/^\d{1,3}(?:,\d{1,2})?$/.test(code)) return null;
    const [entier, decimal = ""] = code.split(",");
    const n = Number(entier) * 100 + Number(decimal.padEnd(2,"0"));
    return n >= 1000 && n <= 15000 ? n : null;
  }
  async function api(path, body) {
    if (!endpoint) throw Error("Le service DFA n’est pas configuré.");
    const r = await fetch(endpoint+path,{method:body?"POST":"GET",credentials:"include",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const d = await r.json().catch(()=>null);
    if (!r.ok || !d?.ok) throw Error(d?.message || "Le service DFA est momentanément indisponible.");
    return d;
  }
  function message(texte, erreur = false) {
    etat.textContent = texte || "";
    etat.classList.toggle("dfa-error", erreur);
    etat.hidden = !texte;
  }
  function erreur(e) { message(e?.message || "Impossible de poursuivre la dotation.", true); }
  function pagePaiement(d) {
    if (!uuid.test(d?.iddfa || "")) throw Error("Référence de dotation indisponible.");
    location.assign("./paiement-dfa.html?iddfa="+encodeURIComponent(d.iddfa));
  }
  function afficherOperation(d, retourVerification = false) {
    if (!d || !uuid.test(d.iddfa || "")) throw Error("Référence de dotation indisponible.");
    operation = d;
    form.hidden = true;
    el("dfa-choix").hidden = false;
    reprendre.hidden = true;
    annuler.hidden = true;
    actions.hidden = true;
    const paye = d.statut === "paye";
    el("dfa-validation").hidden = !paye;
    el("dfa-accueil").hidden = !paye;
    el("dfa-confirmation-mail").hidden = !paye;
    retour.hidden = paye;
    const montantOperation = euros(d.montantCentimes);
    if (d.statut === "paye") message("Votre versement de "+montantOperation+" est confirmé. Merci pour votre soutien aux parcs du réseau La Clé du Parc.");
    else if (d.statut === "annule") message("Votre demande de dotation est annulée. Aucun nouveau paiement n’est engagé.");
    else if (d.statut === "incident") message("Votre dotation est en cours de vérification. Aucun nouveau règlement n’est proposé.");
    else if (retourVerification) message("La confirmation bancaire de votre paiement de "+montantOperation+" est en attente. Aucun nouveau règlement n’est nécessaire à ce stade.");
    else {
      message("Votre demande de dotation de "+montantOperation+" est enregistrée. Le paiement reste à effectuer.");
      actions.hidden = false;
      reprendre.hidden = false;
      annuler.hidden = false;
    }
  }
  function actualiserBoutons() {
    enregistrer.disabled = occupe || saisie || cents === null;
    montant.disabled = occupe || saisie;
    reprendre.disabled = occupe;
    annuler.disabled = occupe;
  }
  retour.href = window.LCDP_urlPublic("/ESPACE-PUBLIC/boutique.html");
  el("dfa-lien-accueil").href = window.LCDP_urlMembre("/ESPACE-MEMBRE/accueil-membre.html");
  reprendre.addEventListener("click",()=>{try{pagePaiement(operation);}catch(e){erreur(e);}});
  annuler.addEventListener("click",async()=>{
    if (occupe || !operation) return;
    occupe = true; actualiserBoutons();
    try { const d = await api("/annuler",{iddfa:operation.iddfa}); afficherOperation(d.operation,true); }
    catch(e) { erreur(e); }
    finally { occupe = false; actualiserBoutons(); }
  });
  function script(src) {
    return new Promise((resolve,reject)=>{
      const s = document.createElement("script"); s.src = src;
      const delai = setTimeout(()=>reject(Error("Pavé numérique indisponible.")),8000);
      s.onload = ()=>{clearTimeout(delai);resolve();};
      s.onerror = ()=>{clearTimeout(delai);reject(Error("Pavé numérique indisponible."));};
      document.head.appendChild(s);
    });
  }
  montant.addEventListener("click",async()=>{
    if (occupe || saisie) return;
    saisie = true; actualiserBoutons();
    try {
      const code = await window.LCDP_diginum.ouvrir({
        modeMontant:true,
        titre:"Merci de soutenir les parcs",
        placeholder:"Montant en euros",
        longueurMax:6,
        valeurInitiale:cents===null?"":String(cents/100).replace(".",","),
        verifier:code=>convertir(code)===null?"Choisissez un montant de 10 € à 150 €.":null
      });
      if (code !== null) {
        const nouveau = convertir(code);
        if (nouveau === null) throw Error("Montant invalide.");
        if (cents !== nouveau) demandeId = null;
        cents = nouveau;
        valeur.textContent = euros(cents);
        montant.setAttribute("data-montant-selectionne", "");
        message("");
      }
    } catch(e) { erreur(e); }
    finally { saisie = false; actualiserBoutons(); montant.focus({preventScroll:true}); }
  });
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if (occupe || saisie || cents === null) return;
    occupe = true; actualiserBoutons();
    enregistrer.setAttribute("aria-busy","true");
    let navigation = false;
    try {
      demandeId = demandeId || crypto.randomUUID();
      const d = await api("/enregistrer",{demandeId,montantCentimes:cents});
      if (["paye","annule","incident"].includes(d.operation?.statut)) {
        afficherOperation(d.operation);
      } else {
        pagePaiement(d.operation);
        navigation = true;
      }
    } catch(e) {
      erreur(e);
      const c = await api("/contexte").catch(()=>null);
      if (c?.operation) afficherOperation(c.operation);
    } finally {
      if (!navigation) {
        occupe = false;
        enregistrer.removeAttribute("aria-busy");
        actualiserBoutons();
      }
    }
  });
  async function demarrer() {
    const params = new URLSearchParams(location.search), id = params.get("iddfa");
    if (id && uuid.test(id) && params.get("retour") === "verification") {
      const d = await api("/verifier",{iddfa:id}); afficherOperation(d.operation,true); return;
    }
    const contexte = await api("/contexte");
    if (contexte.operation) { afficherOperation(contexte.operation); return; }
    const bonjour = el("dfa-bonjour");
    if (contexte.prenom) { bonjour.textContent = "Bonjour "+String(contexte.prenom); bonjour.hidden = false; }
    await script(window.LCDP_urlObjet("/JSBASE/07-diginum.js?v=b92b39e"));
    if (typeof window.LCDP_diginum?.ouvrir !== "function") throw Error("Pavé numérique indisponible.");
    message("");
    form.hidden = false;
    el("dfa-choix").hidden = false;
    actualiserBoutons();
  }
  async function initialiserPage() {
    // Le cadre et les polices ne peuvent pas empêcher l'accès à un formulaire prêt.
    const cadre = Promise.resolve(window.LCDP_cadreAccessoiresPret).catch(error=>console.warn("Cadre DFA :",error));
    const donnees = demarrer().catch(e=>{el("dfa-choix").hidden=false;erreur(e);});
    let delaiCadre;
    await Promise.all([donnees,Promise.race([cadre,new Promise(resolve=>{delaiCadre=setTimeout(resolve,4000);})]).finally(()=>clearTimeout(delaiCadre))]);
    window.LCDP_dfaAttenteTerminer?.();
  }
  initialiserPage().catch(()=>window.LCDP_dfaAttenteErreur?.());
  window.addEventListener("pageshow",event=>{
    if (event.persisted && occupe) location.reload();
  });
})();
