(() => {
  "use strict";
  const conf=window.SITE_CONFIG||{};
  const endpoint=String(conf.workerAlertePlanifierUrl||conf.WORKER_ALERTE_PLANIFIER_URL||(typeof conf.apiUrl==="function"?conf.apiUrl("alerte-planifier-api"):"")).replace(/\/$/,"");
  const membre=path=>(window.LCDP_urlMembre||conf.membreUrl)(path);
  const objet=path=>(window.LCDP_urlObjet||conf.objetUrl)(path);
  const root=document.getElementById("lcdp-alerte-planifier-slot");
  const etat={references:{departements:[],parcs:[]},alertes:[],edition:null};
  const types=[["tous","Tous"],["duo","Duo"],["famille","Famille"],["coach","Coach"],["famille-coach","Famille + coach"]];
  const jours=[["1","Lundi"],["2","Mardi"],["3","Mercredi"],["4","Jeudi"],["5","Vendredi"],["6","Samedi"],["7","Dimanche"]];
  const plages=[["1","Plage 1"],["2","Plage 2"],["3","Plage 3"],["4","Plage 4"],["5","Plage 5"]];
  const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  function bouton(texte,classe,action){const el=node("button","lcdp-button "+classe,texte);el.type="button";el.addEventListener("click",action);return el;}
  function message(txt){const cible=root.querySelector("[data-alerte-message]");if(cible){cible.textContent=txt;cible.setAttribute("role","status");}}
  async function api(path,method="GET",payload){
    if(!endpoint)throw new Error("Worker ALERTE PLANIFIER non configuré.");
    const r=await fetch(endpoint+path,{method,credentials:"include",cache:"no-store",signal:AbortSignal.timeout(12000),headers:{"Accept":"application/json",...(payload?{"Content-Type":"application/json"}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
    const data=await r.json().catch(()=>({}));
    if(r.status===401)throw new Error("Votre session membre doit être renouvelée.");
    if(!r.ok||data.ok!==true)throw new Error(data.message||"Service d'alertes indisponible.");
    return data;
  }
  function select(id,options){
    const el=node("select","lcdp-planning-filtres__select");el.id=id;el.name=id;
    for(const [value,label] of options)el.add(new Option(label,value));
    return el;
  }
  function champ(label,control){
    const div=node("div","lcdp-planning-filtres__champ");
    const etiquette=node("label","lcdp-planning-filtres__label",label);etiquette.htmlFor=control.id;
    div.append(etiquette,control);return div;
  }
  function groupe(parent,cle,nom,options,maximum,kind="select"){
    const wrap=node("div","lcdp-alerte-groupe");
    wrap.dataset.critere=cle;
    wrap.append(node("span","lcdp-alerte-groupe__titre",nom+" — jusqu'à "+maximum));
    const ligne=node("div","lcdp-alerte-groupe__ligne"+(maximum===6?" lcdp-alerte-groupe__ligne--six":""));
    for(let i=0;i<maximum;i++){
      let input;
      if(kind==="select")input=select("lcdp-alerte-"+cle+"-"+i,[["","Indifférent"],...options]);
      else{input=node("input","lcdp-planning-filtres__select");input.id="lcdp-alerte-"+cle+"-"+i;input.type=kind;}
      input.dataset.critereValeur=cle;input.setAttribute("aria-label",nom+" "+(i+1));
      if(cle==="parcs")input.addEventListener("change",()=>{});
      ligne.append(input);
    }
    wrap.append(ligne);parent.append(wrap);return wrap;
  }
  function nettoyerChoix(values){return [...new Set(values.map(x=>x.trim()).filter(Boolean))];}
  function lireCritere(cle){return nettoyerChoix([...root.querySelectorAll('[data-critere-valeur="'+cle+'"]')].map(el=>el.value));}
  function criteres(){
    return {
      departements:lireCritere("departements"),parcs:lireCritere("parcs"),
      categorie:root.querySelector("#lcdp-alerte-categorie").value,
      plages:lireCritere("plages"),mois:lireCritere("mois"),
      jours:lireCritere("jours"),dates:lireCritere("dates")
    };
  }
  async function remplir(formCrit){
    const remplirValeurs=key=>{
      const controls=[...root.querySelectorAll('[data-critere-valeur="'+key+'"]')];
      controls.forEach((el,i)=>el.value=(formCrit?.[key]||[])[i]||"");
    };
    remplirValeurs("departements");
    await chargerParcs(true);
    for(const key of ["parcs","plages","mois","jours","dates"])remplirValeurs(key);
    root.querySelector("#lcdp-alerte-categorie").value=formCrit?.categorie||"tous";
  }
  function ajusterParcs(reinitialiser){
    const deps=lireCritere("departements");
    const options=etat.references.parcs.filter(p=>!deps.length||deps.includes(p.dptmt)).map(p=>[p.idparc,p.nom]);
    const selects=[...root.querySelectorAll('[data-critere-valeur="parcs"]')];
    selects.forEach(el=>{
      const avant=reinitialiser?"":el.value;
      el.replaceChildren(new Option(deps.length?"Indifférent":"Choisir un département",""));
      options.forEach(([v,t])=>el.add(new Option(t,v)));
      el.value=options.some(([v])=>v===avant)?avant:"";
    });
  }
  async function chargerParcs(reinitialiser){
    const deps=lireCritere("departements");
    if(!deps.length){
      etat.references.parcs=[];
      ajusterParcs(true);
      return;
    }
    const data=await api("/references?departements="+encodeURIComponent(deps.join(",")));
    etat.references.parcs=data.parcs||[];
    ajusterParcs(reinitialiser);
  }
  function formulaire(){
    const form=node("form","lcdp-planning-filtres lcdp-alerte-filtres");
    form.setAttribute("aria-label","Créer une recherche ALERTE PLANIFIER");
    form.addEventListener("submit",async event=>{event.preventDefault();await enregistrer();});
    const titre=node("h2","lcdp-title-section","ALERTE PLANIFIER");
    const description=node("p","lcdp-alerte-filtres__intro","Enregistrez jusqu'à 5 recherches. Elles sont relancées uniquement à votre demande.");
    form.append(titre,description);
    const champs=node("div","lcdp-planning-filtres__champs");
    const nom=node("input","lcdp-planning-filtres__select");nom.id="lcdp-alerte-titre";nom.maxLength=80;nom.required=true;nom.placeholder="Ex. Week-ends dans le Loiret";
    const nomChamp=champ("Nom de l'alerte",nom);nomChamp.style.gridColumn="1 / -1";champs.append(nomChamp);
    groupe(champs,"departements","Départements",etat.references.departements.map(d=>[d.code,d.code+" - "+d.nom]),3);
    const parcs=groupe(champs,"parcs","Parcs",[],3);
    for(const el of champs.querySelectorAll('[data-critere-valeur="departements"]'))el.addEventListener("change",async()=>{
      try{await chargerParcs(true);}catch(e){message(e.message);}
    });
    const cat=select("lcdp-alerte-categorie",types),catChamp=champ("Invités",cat);catChamp.style.gridColumn="1 / -1";champs.append(catChamp);
    groupe(champs,"plages","Plages horaires",plages,3);
    groupe(champs,"mois","Mois (avec année)",[],3,"month");
    groupe(champs,"jours","Jours de semaine",jours,3);
    groupe(champs,"dates","Dates précises",[],6,"date");
    form.append(champs);
    const actions=node("div","lcdp-alerte-filtres__boutons");
    actions.append(bouton("Effacer","lcdp-button-secondary",()=>{form.reset();etat.edition=null;nom.value="";ajusterParcs(true);message("Formulaire réinitialisé.");}));
    const sauver=node("button","lcdp-button lcdp-button-primary","Enregistrer l'alerte");sauver.type="submit";actions.append(sauver);
    form.append(actions);
    form.append(node("p","lcdp-alerte-etat","Aucune recherche automatique ni notification."));
    return form;
  }
  async function enregistrer(){
    const titre=root.querySelector("#lcdp-alerte-titre").value.trim();
    if(!titre){message("Donnez un nom à l'alerte.");return;}
    try{
      const origine=etat.edition?etat.alertes.find(a=>a.idalerte===etat.edition)?.criteres:null;
      const filtre=criteres();
      // Ne jamais effacer les périodes et les catégories enregistrées
      // depuis la lightbox de l'accueil en modifiant l'alerte dans MON COMPTE.
      const body={titre,criteres:origine?{
        ...origine,...filtre,
        periodes:origine.periodes||[],
        categories:origine.categories||undefined
      }:filtre};
      if(etat.edition)await api("/alertes/"+encodeURIComponent(etat.edition),"PATCH",body);
      else await api("/alertes","POST",body);
      etat.edition=null;root.querySelector("form").reset();ajusterParcs(true);
      message("Alerte enregistrée.");await chargerListe();
    }catch(e){message(e.message);}
  }
  function resume(c){
    const champs=[["Départements","departements"],["Parcs","parcs"],["Plages","plages"],["Mois","mois"],["Jours","jours"],["Dates","dates"]];
    const invites=c?.categories?.length?"Invités : "+c.categories.join(", "):(c?.categorie&&c.categorie!=="tous"?"Invités : "+c.categorie:"Tous types d'invités");
    const periodes=(c?.periodes||[]).map(p=>p.debut+" au "+p.fin);
    return [invites,...(periodes.length?["Périodes : "+periodes.join(", ")]:[]),...champs.filter(([,k])=>c?.[k]?.length).map(([t,k])=>t+" : "+c[k].join(", "))].join(" | ");
  }
  function afficherListe(){
    const zone=root.querySelector("[data-alerte-liste]");zone.replaceChildren();
    if(!etat.alertes.length){zone.append(node("p","lcdp-alerte-etat","Aucune alerte enregistrée."));return;}
    const ul=node("ul","lcdp-alerte-liste");
    for(const a of etat.alertes){
      const li=node("li");
      const nom=node("strong","",a.titre),details=node("p","lcdp-alerte-etat",resume(a.criteres));
      const statut=node("p","lcdp-alerte-etat",a.datedernierelancement?"Dernière recherche : "+new Date(a.datedernierelancement).toLocaleString("fr-FR"):"Jamais relancée");
      const actions=node("div","lcdp-alerte-liste__actions");
      actions.append(
        bouton("Relancer","lcdp-button-primary",()=>relancer(a.idalerte)),
        bouton("Modifier","lcdp-button-secondary",async()=>{try{etat.edition=a.idalerte;root.querySelector("#lcdp-alerte-titre").value=a.titre;await remplir(a.criteres);root.querySelector("form").scrollIntoView({behavior:"smooth"});message("Modification de "+a.titre);}catch(e){message(e.message);}}),
        bouton(a.actif?"Désactiver":"Activer","lcdp-button-secondary",async()=>{try{await api("/alertes/"+a.idalerte,"PATCH",{actif:!a.actif});await chargerListe();}catch(e){message(e.message);}}),
        bouton("Supprimer","lcdp-button-secondary",async()=>{if(!window.confirm("Supprimer cette alerte ?"))return;try{await api("/alertes/"+a.idalerte,"DELETE");await chargerListe();}catch(e){message(e.message);}})
      );
      li.append(nom,details,statut,actions);ul.append(li);
    }
    zone.append(ul);
  }
  async function chargerListe(){try{const data=await api("/alertes");etat.alertes=data.alertes||[];afficherListe();}catch(e){message(e.message);}}
  async function relancer(id){
    message("Recherche manuelle en cours…");
    try{
      const d=await api("/alertes/"+id+"/relancer","POST");
      const section=root.querySelector("[data-alerte-resultats]");section.replaceChildren();
      section.append(node("h3","lcdp-title-section","Résultats indicatifs"));
      if(!d.resultats.length)section.append(node("p","lcdp-alerte-etat","Aucune disponibilité vérifiable avec ces critères dans les données consultées."));
      else{
        const ul=node("ul","lcdp-alerte-liste");
        d.resultats.forEach(v=>{const li=node("li");li.append(node("strong","",v.parc+" — "+v.date+" — "+v.debut+" à "+v.fin),node("p","lcdp-alerte-etat","À vérifier dans PLANIFIER."));ul.append(li);});
        section.append(ul);
      }
      section.append(node("p","lcdp-alerte-etat",d.avertissement));
      section.append(bouton("Ouvrir PLANIFIER","lcdp-button-primary",()=>{window.location.href=membre("/ESPACE-MEMBRE/reserver-membre.html");}));
      message("Recherche terminée.");await chargerListe();
    }catch(e){message(e.message);}
  }
  function appliquerRoutes(racine){
    // Même convention data-space que MES ACCÈS.
    racine.querySelectorAll("[data-site-href]").forEach(element=>{
      const chemin=element.dataset.siteHref||"";
      const espace=element.dataset.space||"public";
      element.setAttribute("href",espace==="membre"?membre(chemin):(window.LCDP_urlPublic||conf.publicUrl)(chemin));
    });
    racine.querySelectorAll("[data-site-src]").forEach(element=>{
      const chemin=element.dataset.siteSrc||"";
      const cheminObjet=chemin.startsWith("/OBJET/")?chemin.slice(6):chemin;
      element.setAttribute("src",objet(cheminObjet));
    });
  }
  async function fragment(url,slot){
    const r=await fetch(url,{credentials:"omit",cache:"no-cache"});
    if(!r.ok)throw new Error("Composant de navigation indisponible");
    const template=document.createElement("template");template.innerHTML=(await r.text()).trim();
    slot.replaceChildren(template.content.cloneNode(true));appliquerRoutes(slot);
  }
  async function coque(){
    await fragment(membre("/ESPACE-MEMBRE/box-bandeau-nav-membre.html"),document.getElementById("lcdp-bandeau-slot"));
    await fragment(objet("/HTMLBASE/02-footer.html"),document.getElementById("lcdp-footer-slot"));
    if(!window.LCDP_initialiserMenuBurgerMembre){
      await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=membre("/ESPACE-MEMBRE/box-menu-burger-membre.js");script.onload=resolve;script.onerror=reject;document.body.append(script);});
    }
    await window.LCDP_initialiserMenuBurgerMembre?.({etatMembre:{abonne:Boolean(document.cookie.includes("abonne="))}});
  }
  async function init(){
    try{
      await coque();
      // Le formulaire reste visible et testable même avant déploiement du Worker.
      root.replaceChildren(formulaire());
      const messageZone=node("p","lcdp-alerte-etat","");messageZone.dataset.alerteMessage="";root.append(messageZone);
      const section=node("section","lcdp-alerte-resultats");section.dataset.alerteResultats="";root.append(section);
      const list=node("section");list.append(node("h2","lcdp-title-section","MON COMPTE · Services · Mes alertes"));
      const cont=node("div");cont.dataset.alerteListe="";list.append(cont);root.append(list);
      document.getElementById("mention-statut-membre").textContent="ESPACE MEMBRE";
      // Afficher la coque immédiatement, même si le Worker n'est pas publié.
      document.documentElement.classList.add("lcdp-alerte-page-pret");
      document.body.classList.add("lcdp-alerte-page-pret");
      document.getElementById("lcdp-alerte-page-attente-initiale")?.remove();
      try{
        const info=await api("/references");
        etat.references={departements:info.departements||[],parcs:info.parcs||[]};
        const ancien=root.querySelector("form");
        ancien.replaceWith(formulaire());
        ajusterParcs(false);
        await chargerListe();
      }catch(e){
        message("Service non connecté : le formulaire est consultable, mais l'enregistrement et la recherche nécessitent le déploiement du Worker. "+e.message);
        afficherListe();
      }
    }catch(e){
      root.replaceChildren(node("p","lcdp-alerte-etat",e.message));
    }finally{
      document.documentElement.classList.add("lcdp-alerte-page-pret");
      document.body.classList.add("lcdp-alerte-page-pret");
      document.getElementById("lcdp-alerte-page-attente-initiale")?.remove();
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
