(() => {
  "use strict";
  const config = window.SITE_CONFIG || {};
  const endpoint = String(config.workerDfaUrl || config.WORKER_DFA_URL || (typeof config.apiUrl === "function" ? config.apiUrl("dfa-api") : "")).replace(/\/+$/, "");
  const el=id=>document.getElementById(id);
  const etat=el("dfa-statut"), slot=el("dfa-formulaire-slot"), actions=el("dfa-actions"), reprendre=el("dfa-reprendre"), annuler=el("dfa-annuler"), terminer=el("dfa-terminer");
  const retourBoutique=()=>location.assign(window.LCDP_urlPublic("/ESPACE-PUBLIC/boutique.html"));
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const euros=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n/100);
  let operation=null, demandeId=null, occupe=false;
  async function api(path,body){
    if(!endpoint)throw Error("Le service DFA n’est pas configuré.");
    const r=await fetch(endpoint+path,{method:body?"POST":"GET",credentials:"include",cache:"no-store",headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.ok)throw Error(d?.message||"Le service DFA est momentanément indisponible.");
    return d;
  }
  function pagePaiement(d){if(!uuid.test(d?.iddfa||""))throw Error("Référence de dotation indisponible.");location.assign("./paiement-dfa.html?iddfa="+encodeURIComponent(d.iddfa));}
  function afficherOperation(d,retour=false){
    operation=d;slot.replaceChildren();etat.hidden=false;actions.hidden=false;reprendre.hidden=true;annuler.hidden=true;terminer.hidden=false;
    const montant=euros(d.montantCentimes);
    if(d.statut==="paye")etat.textContent="Votre versement de "+montant+" est confirmé. Merci pour votre soutien aux parcs du réseau La Clé du Parc.";
    else if(d.statut==="annule")etat.textContent="Votre demande de dotation est annulée. Aucun nouveau paiement n’est engagé.";
    else if(d.statut==="incident")etat.textContent="Votre dotation est en cours de vérification. Aucun nouveau règlement n’est proposé.";
    else if(retour)etat.textContent="Votre demande de paiement DFA de "+montant+" est enregistrée. La confirmation définitive du versement vous est transmise avec votre reçu fiscal après confirmation bancaire.";
    else{etat.textContent="Vous avez une dotation de "+montant+" en cours.";reprendre.hidden=false;annuler.hidden=false;}
  }
  function erreur(e){etat.hidden=false;etat.textContent=e.message||"Impossible de poursuivre la dotation.";actions.hidden=false;terminer.hidden=false;}
  terminer.addEventListener("click",retourBoutique);reprendre.addEventListener("click",()=>pagePaiement(operation));
  annuler.addEventListener("click",async()=>{if(occupe||!operation)return;occupe=true;annuler.disabled=true;reprendre.disabled=true;try{const d=await api("/annuler",{iddfa:operation.iddfa});afficherOperation(d.operation,true);}catch(e){erreur(e);}finally{occupe=false;annuler.disabled=false;reprendre.disabled=false;}});
  function script(src){return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.onload=resolve;s.onerror=()=>reject(Error("Formulaire indisponible."));document.head.appendChild(s);});}
  async function demarrer(){
    const params=new URLSearchParams(location.search), id=params.get("iddfa");
    if(id&&uuid.test(id)&&params.get("retour")==="verification"){const d=await api("/verifier",{iddfa:id});afficherOperation(d.operation,true);return;}
    const contexte=await api("/contexte");
    if(contexte.operation){afficherOperation(contexte.operation);return;}
    await script(window.LCDP_urlObjet("/JSBASE/03-formulaire.js"));
    if(typeof window.LCDP_creerFormulaire!=="function")throw Error("Composant formulaire indisponible.");
    const form=await window.LCDP_creerFormulaire(slot,{id:"formulaire-dfa-membre",ariaLabel:"Dotation financière annuelle",titre:"Bonjour "+String(contexte.prenom||""),sousTitre:"Dotation financière annuelle",champs:[{type:"number",id:"dfa-montant",name:"montant",label:"Choisissez votre dotation",required:true,min:10,max:150,step:0.01,inputmode:"decimal",placeholder:"Montant en euros"}],bouton:{id:"dfa-enregistrer",type:"submit",label:"Enregistrer",style:"lcdp-button-primary"}});
    if(!form)throw Error("Formulaire DFA indisponible.");
    etat.hidden=true;actions.hidden=false;terminer.hidden=false;
    form.addEventListener("submit",async event=>{
      event.preventDefault();if(occupe)return;const champ=form.querySelector("[name=montant]"),bouton=form.querySelector("button[type=submit]");
      if(!form.reportValidity())return;const valeur=String(champ.value);if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(valeur)){erreur(Error("Montant invalide."));return;}
      const [entier,decimal=""]=valeur.split(".");const cents=Number(entier)*100+Number(decimal.padEnd(2,"0"));
      if(cents<1000||cents>15000){erreur(Error("Choisissez un montant de 10 € à 150 €."));return;}
      occupe=true;bouton.disabled=true;demandeId=demandeId||crypto.randomUUID();
      try{const d=await api("/enregistrer",{demandeId,montantCentimes:cents});pagePaiement(d.operation);}
      catch(e){erreur(e);const c=await api("/contexte").catch(()=>null);if(c?.operation)afficherOperation(c.operation);else bouton.disabled=false;}
      finally{occupe=false;}
    });
  }
  demarrer().catch(erreur);
})();