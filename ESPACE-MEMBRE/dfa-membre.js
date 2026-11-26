(() => {
  "use strict";
  const config = window.SITE_CONFIG || {};
  const endpoint = String(config.workerDfaUrl || config.WORKER_DFA_URL || (typeof config.apiUrl === "function" ? config.apiUrl("dfa-api") : "")).replace(/\/+$/, "");
  const el = id => document.getElementById(id);
  const etat = el("dfa-statut"), form = el("formulaire-dfa-membre"), actions = el("dfa-actions");
  const reprendre = el("dfa-reprendre"), annuler = el("dfa-annuler"), retour = el("dfa-retour");
  const montant = el("dfa-montant"), valeur = el("dfa-valeur"), enregistrer = el("dfa-enregistrer");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const euros = n => new Intl.NumberFormat("fr-FR", {style:"currency",currency:"EUR"}).format(n/100);
  let operation = null, demandeId = null, cents = null, occupe = false, saisie = false;
  function convertir(code) {
    if (!/^\d{1,3}(?:,\d{1,2})?$/.test(code)) return null;
    const [entier, decimal = ""] = code.split(",");
    const n = Number(entier) * 100 + Number(decimal.padEnd(2,"0"));
    return n >= 1000 && n <= 15000 ? n : null;
  }
  async function api(path, body) {
    if (!endpoint) throw Error("Le service DFA n’est pas configuré.");
    const r = await fetch(endpoint+path,{method:body?"POST":"GET",credentials:"include",cache:"no-store",headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
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
    reprendre.hidden = true;
    annuler.hidden = true;
    actions.hidden = true;
    const montantOperation = euros(d.montantCentimes);
    if (d.statut === "paye") message("Votre versement de "+montantOperation+" est confirmé. Merci pour votre soutien aux parcs du réseau La Clé du Parc.");
    else if (d.statut === "annule") message("Votre demande de dotation est annulée. Aucun nouveau paiement n’est engagé.");
    else if (d.statut === "incident") message("Votre dotation est en cours de vérification. Aucun nouveau règlement n’est proposé.");
    else if (retourVerification) message("Votre demande de paiement DFA de "+montantOperation+" est enregistrée. La confirmation définitive du versement vous est transmise avec votre reçu fiscal après confirmation bancaire.");
    else {
      message("Votre dotation de "+montantOperation+" est en cours.");
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
  retour.addEventListener("click",()=>location.assign(window.LCDP_urlPublic("/ESPACE-PUBLIC/boutique.html")));
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
      s.onload = resolve; s.onerror = ()=>reject(Error("Pavé numérique indisponible."));
      document.head.appendChild(s);
    });
  }
  montant.addEventListener("click",async()=>{
    if (occupe || saisie) return;
    saisie = true; actualiserBoutons();
    try {
      const code = await window.LCDP_diginum.ouvrir({
        modeMontant:true,
        titre:"Choisissez votre dotation",
        placeholder:"Montant en euros",
        longueurMax:6,
        valeurInitiale:cents===null?"":(cents/100).toFixed(2).replace(".",","),
        verifier:code=>convertir(code)===null?"Choisissez un montant de 10 € à 150 €.":null
      });
      if (code !== null) {
        const nouveau = convertir(code);
        if (nouveau === null) throw Error("Montant invalide.");
        if (cents !== nouveau) demandeId = null;
        cents = nouveau;
        valeur.textContent = euros(cents);
        message("");
      }
    } catch(e) { erreur(e); }
    finally { saisie = false; actualiserBoutons(); montant.focus({preventScroll:true}); }
  });
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if (occupe || saisie || cents === null) return;
    occupe = true; actualiserBoutons();
    try {
      demandeId = demandeId || crypto.randomUUID();
      const d = await api("/enregistrer",{demandeId,montantCentimes:cents});
      afficherOperation(d.operation);
    } catch(e) {
      erreur(e);
      const c = await api("/contexte").catch(()=>null);
      if (c?.operation) afficherOperation(c.operation);
    } finally { occupe = false; actualiserBoutons(); }
  });
  async function demarrer() {
    const params = new URLSearchParams(location.search), id = params.get("iddfa");
    if (id && uuid.test(id) && params.get("retour") === "verification") {
      const d = await api("/verifier",{iddfa:id}); afficherOperation(d.operation,true); return;
    }
    const contexte = await api("/contexte");
    const bonjour = el("dfa-bonjour");
    if (contexte.prenom) { bonjour.textContent = "Bonjour "+String(contexte.prenom); bonjour.hidden = false; }
    if (contexte.operation) { afficherOperation(contexte.operation); return; }
    await script(window.LCDP_urlObjet("/JSBASE/07-diginum.js?v=b92b39e"));
    if (typeof window.LCDP_diginum?.ouvrir !== "function") throw Error("Pavé numérique indisponible.");
    message("");
    form.hidden = false;
    actualiserBoutons();
  }
  demarrer().catch(erreur);
})();
