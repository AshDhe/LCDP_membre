(() => {
  "use strict";
  const config=window.SITE_CONFIG||{};
  const endpoint=String(config.workerAlertePlanifierUrl||config.WORKER_ALERTE_PLANIFIER_URL||"").replace(/\/$/,"");
  const cle="lcdp-alerte-planifier-resultats-v1";
  const urlObjet=path=>window.LCDP_urlObjet(path);
  async function api(route,method="GET"){
    if(!endpoint)throw new Error("Service ALERTE PLANIFIER non configuré.");
    const rep=await fetch(endpoint+route,{method,credentials:"include",cache:"no-store",headers:{"Accept":"application/json"}});
    const data=await rep.json().catch(()=>null);
    if(!rep.ok||data?.ok!==true)throw new Error(data?.message||"Service d'alerte indisponible.");
    return data;
  }
  async function choix(options,message){
    const slot=document.getElementById("lcdp-lightbox-slot");
    if(!slot)throw new Error("Boîte de dialogue introuvable.");
    const rep=await fetch(urlObjet("/HTMLBASE/02-dialogue-reference-choix.html"),{credentials:"omit"});
    if(!rep.ok)throw new Error("Dialogue CHOIX indisponible.");
    const t=document.createElement("template");
    t.innerHTML=(await rep.text()).trim();
    slot.replaceChildren(t.content.cloneNode(true));
    const dialog=slot.querySelector('[data-lcdp-dialogue-reference="choix"]');
    if(!dialog)throw new Error("Dialogue CHOIX incomplet.");
    dialog.querySelector("[data-lcdp-dialogue-titre]").textContent="ALERTE PLANIFIER";
    dialog.querySelector("[data-lcdp-dialogue-message]").textContent=message;
    const actions=dialog.querySelector(".lcdp-dialogue-ref__actions");
    actions.replaceChildren();
    return new Promise(resolve=>{
      let fini=false;
      function terminer(v){
        if(fini)return;fini=true;
        document.removeEventListener("keydown",escape);
        slot.replaceChildren();resolve(v);
      }
      function escape(e){if(e.key==="Escape")terminer(null);}
      document.addEventListener("keydown",escape);
      options.forEach((option,i)=>{
        const b=document.createElement("button");
        b.type="button";
        b.className="lcdp-dialogue-ref__bouton "+(option.primary?"lcdp-dialogue-ref__bouton--principal":"lcdp-dialogue-ref__bouton--secondaire");
        b.textContent=option.label;
        b.addEventListener("click",()=>terminer(option.value),{once:true});
        actions.append(b);
        if(!i)b.focus();
      });
    });
  }
  async function lancer(alerte){
    const data=await api("/alertes/"+encodeURIComponent(alerte.idalerte)+"/relancer","POST");
    if(!Array.isArray(data.resultats))throw new Error("Résultats de recherche indisponibles.");
    const uniques=new Map();
    for(const r of data.resultats){
      const id=String(r.idparc||"");
      const date=String(r.date||"");
      if(!id||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
      if(!uniques.has(id)||date<uniques.get(id).date){
        uniques.set(id,{idparc:id,nom:String(r.parc||"Parc"),dptmt:String(r.dptmt||""),date,statut:String(r.statut||"").toLowerCase()});
      }
    }
    const parcs=[...uniques.values()].sort((a,b)=>a.nom.localeCompare(b.nom,"fr",{sensitivity:"base"})||a.idparc.localeCompare(b.idparc));
    sessionStorage.setItem(cle,JSON.stringify({version:1,created:Date.now(),idalerte:alerte.idalerte,parcs}));
    const page=window.LCDP_urlMembre("/ESPACE-MEMBRE/reserver-membre.html");
    window.location.assign(page+"?mode=alerte");
  }
  async function accueil({permanent,creer}){
    const data=await api("/alertes");
    const alertes=Array.isArray(data.alertes)?data.alertes.filter(a=>a?.idalerte):[];
    if(!alertes.length){await creer();return;}
    const quota = data.quotaLancements;
    const quotaJournalierAtteint = quota && Number(quota.restants) === 0;
    if(quotaJournalierAtteint){
      await choix([{label:"Annuler",value:null}],
        "Vous ne pouvez plus lancer d'alerte aujourd'hui. Modifiez votre alerte depuis MON COMPTE, si besoin.");
      return;
    }
    const options=alertes.map(a=>({label:"Lancer : "+a.titre,value:a.idalerte,primary:true}));
    if(alertes.length<(permanent?2:1))options.push({label:"Créer une nouvelle alerte",value:"creer"});
    options.push({label:"Annuler",value:null});
    const sel=await choix(options,alertes.length<(permanent?2:1)?
      "Lancez une alerte existante ou créez-en une nouvelle. Modifiez votre alerte depuis MON COMPTE, si besoin.":
      "Modifiez votre alerte depuis MON COMPTE, si besoin.");
    if(sel==="creer")await creer();
    else if(sel){const a=alertes.find(a=>a.idalerte===sel);if(a)await lancer(a);}
  }
  function consommerResultats(){
    const raw=sessionStorage.getItem(cle);
    sessionStorage.removeItem(cle);
    if(!raw)return null;
    try{
      const item=JSON.parse(raw);
      if(item.version!==1||Date.now()-item.created>120000||!Array.isArray(item.parcs))return null;
      return item.parcs;
    }catch{return null;}
  }
  window.LCDP_alerteNavigation={accueil,lancer,consommerResultats};
})();
