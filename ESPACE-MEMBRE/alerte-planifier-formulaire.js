(() => {
  "use strict";
  const CONFIG_PAGE=window.SITE_CONFIG||{};
  const construireUrlObjet=chemin=>window.LCDP_urlObjet(chemin);
  const chargerFragmentObjet=async chemin=>{
    const rep=await fetch(construireUrlObjet(chemin),{credentials:"omit",cache:"no-cache"});
    if(!rep.ok)throw new Error("Composant de dialogue indisponible.");
    const modele=document.createElement("template");
    modele.innerHTML=(await rep.text()).trim();
    return modele.content.cloneNode(true);
  };
  const construireEndpointApi=(moderne,legacy,courte,worker)=>{
    return String(CONFIG_PAGE[moderne]||CONFIG_PAGE[legacy]||CONFIG_PAGE[courte]||
      (typeof CONFIG_PAGE.apiUrl==="function"?CONFIG_PAGE.apiUrl(worker):"")).replace(/\/+$/,"");
  };
  const afficherInformationLimite=async message=>{
    const slot=document.getElementById("lcdp-lightbox-slot");
    const fragment=await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-information.html");
    slot.replaceChildren(fragment);
    const dlg=slot.querySelector('[data-lcdp-dialogue-reference="information"]');
    dlg.querySelector("[data-lcdp-dialogue-titre]").textContent="ALERTE PLANIFIER";
    dlg.querySelector("[data-lcdp-dialogue-message]").textContent=message;
    const action=dlg.querySelector('[data-lcdp-dialogue-action="compris"]');
    action.textContent="Voir MON COMPTE";
    await new Promise(resolve=>action.addEventListener("click",resolve,{once:true}));
    slot.replaceChildren();
    window.location.assign((window.LCDP_urlMembre||CONFIG_PAGE.membreUrl)("/ESPACE-MEMBRE/mes-informations.html"));
  };
  const afficherAlerte=async message=>{
    const slot=document.getElementById("lcdp-lightbox-slot");
    const fragment=await chargerFragmentObjet("/HTMLBASE/02-dialogue-reference-information.html");
    slot.replaceChildren(fragment);
    const dlg=slot.querySelector('[data-lcdp-dialogue-reference="information"]');
    dlg.querySelector("[data-lcdp-dialogue-titre]").textContent="ALERTE PLANIFIER";
    dlg.querySelector("[data-lcdp-dialogue-message]").textContent=message;
    const action=dlg.querySelector('[data-lcdp-dialogue-action="compris"]');
    action.textContent="Fermer";
    action.addEventListener("click",()=>slot.replaceChildren(),{once:true});
  };
  async function ouvrirFormulaireAlertePlanning(options={}) {
    // Même grille de filtre que MES ACCÈS ; composants Diginum et calendrier
    // identiques à ceux utilisés dans PLANIFIER, sans navigateur de dates natif.
    const slot=document.getElementById("lcdp-lightbox-slot");
    if(!slot)throw new Error("Emplacement de lightbox introuvable.");
    const fragment=await chargerFragmentObjet("/HTMLBASE/02-dialogue-bouton.html");
    slot.replaceChildren(fragment);
    const dialogue=slot.querySelector("[data-lcdp-box-dialogue-bouton]");
    const titre=slot.querySelector("[data-lcdp-dialogue-title]");
    const texte=slot.querySelector("[data-lcdp-dialogue-text]");
    const actions=slot.querySelector("[data-lcdp-dialogue-actions]");
    const croix=slot.querySelector("[data-lcdp-dialogue-close]");
    if(!dialogue||!titre||!texte||!actions||!croix)throw new Error("Structure du dialogue incomplète.");
    dialogue.classList.add("lcdp-alerte-planning-dialogue");
    titre.textContent="ALERTE PLANIFIER";
    texte.textContent="Définissez vos critères de recherche.";
    const source=options.alerte||null;
    const initial=source?.criteres||{};
    const etat={departements:[...(initial.departements||[])],periodes:(initial.periodes||[]).map(p=>({...p})),plages:[...(initial.plages||[])],categories:[...(initial.categories||["duo"])]};
    const limites={departements:3,periodes:3,plages:3};
    const controller=new AbortController();
    let ferme=false,modeCalendrier=false;
    const noeud=(tag,classe,libelle)=>{
      const n=document.createElement(tag);
      if(classe)n.className=classe;
      if(libelle!==undefined)n.textContent=libelle;
      return n;
    };
    const bouton=(libelle,action,principal=false)=>{
      const n=noeud("button","lcdp-button "+(principal?"lcdp-button-primary":"lcdp-button-secondary"),libelle);
      n.type="button";n.addEventListener("click",action,{signal:controller.signal});return n;
    };
    const formulaire=noeud("form","lcdp-planning-filtres lcdp-alerte-formulaire");
    formulaire.setAttribute("aria-label","Filtres ALERTE PLANIFIER");
    const champs=noeud("div","lcdp-planning-filtres__champs");
    const etiquette=(texte,id)=>{
      const label=noeud("label","lcdp-planning-filtres__label",texte);
      if(id)label.htmlFor=id;
      return label;
    };
    const champNom=noeud("div","lcdp-planning-filtres__champ");
    champNom.classList.add("lcdp-alerte-champ-complet");
    const nom=noeud("input","lcdp-planning-filtres__select");
    nom.id="lcdp-alerte-nom";nom.required=true;nom.maxLength=80;
    nom.placeholder="Nom de cette alerte";
    nom.value=source?.titre||"";
    nom.setAttribute("aria-label","Nom de l'alerte");
    champNom.append(nom);
    champs.append(champNom);
    const groupe=(libelle,maximum,classe="")=>{
      const n=noeud("section","lcdp-alerte-critere"+(classe?" "+classe:""));
      const titreGroupe=noeud("div","lcdp-alerte-critere__titre",libelle);
      n.append(titreGroupe);
      if(maximum)n.append(noeud("span","lcdp-alerte-critere__maximum",maximum+" maximum"));
      const liste=noeud("div","lcdp-alerte-critere__valeurs");
      n.append(liste);champs.append(n);
      return {n,liste};
    };
    const departements=groupe("Département",3,"lcdp-alerte-critere--departement");
    const periodes=groupe("Période",3,"lcdp-alerte-critere--periode");
    const horaires=groupe("Horaire",3,"lcdp-alerte-critere--horaire");
    const invites=groupe("Filtre invités (accès parc)",0,"lcdp-alerte-critere--invites");
    const msg=noeud("p","lcdp-alerte-etat");msg.setAttribute("role","status");
    const endpoint=String(CONFIG_PAGE.workerAlertePlanifierUrl||CONFIG_PAGE.WORKER_ALERTE_PLANIFIER_URL||"").replace(/\/+$/,"");
    if(!source){
      if(!endpoint)throw new Error("Le Worker ALERTE PLANIFIER n'est pas configuré.");
      const response=await fetch(endpoint+"/alertes",{method:"GET",credentials:"include",cache:"no-store",headers:{"Accept":"application/json"}});
      const data=await response.json().catch(()=>null);
      if(!response.ok||data?.ok!==true)throw new Error(data?.message||"Vérification des alertes indisponible.");
      // Le contrôle côté Worker reste obligatoire : cette vérification UX ne le remplace pas.
      const maximum=options.permanent===true?2:1;
      if((data.alertes||[]).length>=maximum){
        slot.replaceChildren();
        await afficherInformationLimite("Une alerte planifiée est déjà en cours, modifiez-la depuis MON COMPTE.");
        return;
      }
    }

    const getDiginum=async()=>{
      if(window.LCDP_diginum?.ouvrir)return window.LCDP_diginum;
      await new Promise((resolve,reject)=>{
        const js=document.createElement("script");
        js.src=construireUrlObjet("/JSBASE/07-diginum.js");
        js.onload=resolve;js.onerror=()=>reject(new Error("Diginum indisponible."));
        document.body.append(js);
      });
      if(!window.LCDP_diginum?.ouvrir)throw new Error("Diginum indisponible.");
      return window.LCDP_diginum;
    };
    const actualiser=()=>{
      for(const [container,values,format,remove] of [
        [departements.liste,etat.departements,v=>v,code=>{etat.departements=etat.departements.filter(v=>v!==code);}],
        [periodes.liste,etat.periodes,v=>new Date(v.debut+"T12:00:00Z").toLocaleDateString("fr-FR")+" – "+new Date(v.fin+"T12:00:00Z").toLocaleDateString("fr-FR"),p=>{etat.periodes=etat.periodes.filter(v=>v!==p);}],
        [horaires.liste,etat.plages,v=>plagesReference.find(p=>p[0]===v)?.[1]||v,code=>{etat.plages=etat.plages.filter(v=>v!==code);}]
      ]){
        container.replaceChildren();
        values.forEach(value=>{
          const tag=noeud("span","lcdp-alerte-critere__tag",format(value));
          const retirer=noeud("button","lcdp-alerte-critere__retirer","×");
          retirer.type="button";retirer.setAttribute("aria-label","Retirer "+format(value));
          retirer.addEventListener("click",()=>{remove(value);actualiser();},{signal:controller.signal});
          tag.append(retirer);container.append(tag);
        });
      }
      departements.ajouter.disabled=etat.departements.length>=limites.departements;
      periodes.ajouter.disabled=etat.periodes.length>=limites.periodes;
      horaires.ajouter.disabled=etat.plages.length>=limites.plages;
    };
    const plagesReference=[
      ["1","06:00–10:00"],["2","10:00–13:00"],["3","13:00–17:00"],
      ["4","17:00–21:00"],["5","21:00–02:00"]
    ];
    departements.ajouter=bouton("+ Ajouter",async()=>{
      try{
        const diginum=await getDiginum();
        const code=await diginum.ouvrir({
          titre:"Ajouter un département",placeholder:"exemple 41",longueurMax:3,
          autoValider:v=>(v.length===2&&!v.startsWith("97"))||(v.length===3&&v.startsWith("97")),
          verifier:async v=>{
            if(v==="20")return null; // Corse : choix 2A / 2B après Diginum.
            if(!/^(?:0[1-9]|[1-8][0-9]|9[0-5]|97[1-6])$/.test(v))return "Code de département invalide.";
            if(etat.departements.includes(v))return "Département déjà sélectionné.";
            // Validation par le même service que le choix de département PLANIFIER.
            const url=construireEndpointApi("workerNouvelleDateMembreUrl","WORKER_NOUVELLE_DATE_MEMBRE_URL","","nouvelle-date-membre-api");
            const res=await fetch(url+"/departement?dptmt="+encodeURIComponent(v),{credentials:"include",cache:"no-store"});
            const data=await res.json().catch(()=>null);
            if(!res.ok||!data?.nomDepartement)return "Département non reconnu ou service indisponible.";
            return null;
          }
        });
        if(code==="20"){
          departements.n.querySelector("[data-lcdp-corse-choix]")?.remove();
          const choixCorse=noeud("div","lcdp-alerte-critere__saisie");
          choixCorse.dataset.lcdpCorseChoix="";
          choixCorse.append(noeud("span","lcdp-alerte-etat","Corse :"));
          for(const [corse,libelle] of [["2A","Corse-du-Sud"],["2B","Haute-Corse"]]){
            choixCorse.append(bouton(libelle,()=>{
              if(etat.departements.includes(corse)){msg.textContent="Département déjà sélectionné.";return;}
              if(etat.departements.length<3){etat.departements.push(corse);actualiser();}
              choixCorse.remove();
            }));
          }
          departements.n.append(choixCorse);
        }else if(code&&etat.departements.length<3){etat.departements.push(code);actualiser();}
      }catch(e){msg.textContent=e.message;}
    });
    departements.n.append(departements.ajouter);
    const ouvrirCalendrier=async()=>{
      try{
        if(etat.periodes.length>=3)return;
        const [fragmentCalendrier,fragmentJour]=await Promise.all([
          chargerFragmentObjet("/HTMLBASE/04-calendrier-mois.html"),
          chargerFragmentObjet("/HTMLBASE/04-card-jour-in-calendrier-mois.html")
        ]);
        const selection=document.createElement("div");
        selection.className="lcdp-alerte-calendrier-hote";
        selection.append(fragmentCalendrier);
        const calendrier=selection.querySelector("[data-lcdp-box-calendrier-mois]");
        const grille=selection.querySelector("[data-lcdp-calendrier-mois-grid]");
        const titreCal=selection.querySelector("[data-lcdp-calendrier-mois-title]");
        const meta=selection.querySelector("[data-lcdp-calendrier-mois-meta]");
        const current=selection.querySelector("[data-lcdp-calendrier-mois-current]");
        const prev=selection.querySelector("[data-lcdp-calendrier-mois-prev]");
        const next=selection.querySelector("[data-lcdp-calendrier-mois-next]");
        const fermerCal=selection.querySelector("[data-lcdp-calendrier-mois-close]");
        if(!calendrier||!grille||!titreCal||!current)throw new Error("Calendrier incomplet.");
        const jourTemplate=fragmentJour.querySelector("[data-lcdp-card-jour-mois]");
        if(!jourTemplate)throw new Error("Carte jour indisponible.");
        let month=new Date();month=new Date(month.getFullYear(),month.getMonth(),1);
        let dateDebut="";
        modeCalendrier=true;
        slot.replaceChildren(selection);
        const retour=()=>{modeCalendrier=false;if(!ferme)slot.replaceChildren(dialogue);};
        fermerCal.addEventListener("click",retour,{signal:controller.signal});
        const dessin=()=>{
          current.textContent=new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(month);
          titreCal.textContent=dateDebut?"Choisir la date de fin":"Choisir la date de début";
          meta.textContent=dateDebut?"À partir du "+new Date(dateDebut+"T12:00:00Z").toLocaleDateString("fr-FR"):"Sélectionnez un premier jour.";
          grille.replaceChildren();
          const morceauxDate=new Intl.DateTimeFormat("fr-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
          const today=["year","month","day"].map(c=>morceauxDate.find(p=>p.type===c)?.value).join("-");
          const an=month.getFullYear(),mo=month.getMonth();
          const offset=(new Date(an,mo,1).getDay()+6)%7;
          for(let i=0;i<offset;i++)grille.append(noeud("span","lcdp-alerte-calendrier-vide"));
          const days=new Date(an,mo+1,0).getDate();
          for(let d=1;d<=days;d++){
            const iso=an+"-"+String(mo+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
            const jour=jourTemplate.cloneNode(true);
            jour.querySelector("[data-lcdp-card-jour-mois-number]").textContent=String(d);
            jour.querySelectorAll("[data-lcdp-card-jour-mois-slot]").forEach(el=>el.hidden=true);
            jour.setAttribute("aria-label",new Date(iso+"T12:00:00Z").toLocaleDateString("fr-FR"));
            jour.disabled=iso<today||(dateDebut&&iso<dateDebut);
            if(jour.disabled)jour.classList.add("lcdp-box-card-jour-in-calendrier-mois--past");
            jour.addEventListener("click",()=>{
              if(!dateDebut){dateDebut=iso;dessin();}
              else{
                etat.periodes.push({debut:dateDebut,fin:iso});
                retour();actualiser();
              }
            },{signal:controller.signal});
            grille.append(jour);
          }
          prev.disabled=month.getFullYear()===new Date().getFullYear()&&month.getMonth()<=new Date().getMonth();
        };
        prev.addEventListener("click",()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);dessin();},{signal:controller.signal});
        next.addEventListener("click",()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);dessin();},{signal:controller.signal});
        dessin();
      }catch(e){msg.textContent=e.message;if(modeCalendrier){modeCalendrier=false;slot.replaceChildren(dialogue);}}
    };
    periodes.ajouter=bouton("+ Ajouter",ouvrirCalendrier);
    periodes.n.append(periodes.ajouter);
    const choixPlage=document.createElement("select");
    choixPlage.className="lcdp-planning-filtres__select";
    choixPlage.setAttribute("aria-label","Choisir une plage horaire");
    plagesReference.forEach(([code,lib])=>choixPlage.add(new Option(lib,code)));
    horaires.ajouter=bouton("+ Ajouter",()=>{
      const v=choixPlage.value;
      if(etat.plages.includes(v)){msg.textContent="Cette plage est déjà sélectionnée.";return;}
      if(etat.plages.length<3){etat.plages.push(v);actualiser();msg.textContent="";}
    });
    const choixHoraire=noeud("div","lcdp-alerte-critere__saisie");choixHoraire.append(choixPlage,horaires.ajouter);
    horaires.n.append(choixHoraire);
    // Même structure visuelle que le filtre Invités du planning du parc.
    const ligneInvites=noeud("div","lcdp-box-legende__ligne lcdp-alerte-invites");
    const controlesInvites=new Map();
    const syncInvites=()=>{
      for(const [cle,controle] of controlesInvites){
        controle.checked=cle==="famille-coach"
          ? etat.categories.length===3
          : etat.categories.includes(cle);
      }
    };
    for(const [code,libelle,picto] of [
      ["duo","DUO SEUL","🧑‍🤝‍🧑"],
      ["famille","+ FAMILLE","🏠"],
      ["coach","+ COACH","🏋️"],
      ["famille-coach","TOUS","🌟"]
    ]){
      const label=noeud("label","lcdp-box-legende__item lcdp-planifier-filtre-categorie");
      const box=document.createElement("input");
      box.type="checkbox";box.className="lcdp-planifier-filtre-categorie__input";box.value=code;
      box.setAttribute("aria-label","Filtrer "+libelle);
      const carre=noeud("span","lcdp-box-legende__carre lcdp-box-legende__carre--"+code);
      carre.setAttribute("aria-hidden","true");
      carre.append(noeud("span","lcdp-planifier-filtre-categorie__coche","✓"));
      const labelTexte=noeud("span","lcdp-box-legende__libelle",libelle);
      const icone=noeud("span","lcdp-planifier-filtre-categorie__picto",picto);
      icone.setAttribute("aria-hidden","true");
      box.addEventListener("change",()=>{
        if(code==="famille-coach")etat.categories=box.checked?["duo","famille","coach"]:[];
        else if(box.checked){
          if(!etat.categories.includes(code))etat.categories.push(code);
        }else etat.categories=etat.categories.filter(v=>v!==code);
        syncInvites();
      },{signal:controller.signal});
      label.append(icone,labelTexte,box,carre);
      ligneInvites.append(label);controlesInvites.set(code,box);
    }
    syncInvites();
    invites.n.append(ligneInvites);
    formulaire.append(champs);
    const barre=noeud("div","lcdp-alerte-formulaire__actions");
    const effacer=bouton("Effacer",()=>{
      etat.departements=[];etat.periodes=[];etat.plages=[];etat.categories=["duo"];
      nom.value="";syncInvites();
      msg.textContent="";actualiser();
    });
    const enregistrer=noeud("button","lcdp-button lcdp-button-primary","Enregistrer l’alerte");
    enregistrer.type="submit";
    barre.append(effacer,enregistrer);formulaire.append(barre,msg);
    actions.replaceChildren(formulaire);
    actualiser();
    syncInvites();
    const fermer=()=>{
      if(ferme)return;ferme=true;controller.abort();slot.replaceChildren();
    };
    croix.addEventListener("click",fermer,{signal:controller.signal});
    dialogue.addEventListener("click",e=>{if(e.target===dialogue)fermer();},{signal:controller.signal});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(modeCalendrier){modeCalendrier=false;slot.replaceChildren(dialogue);}else fermer();}},{signal:controller.signal});
    formulaire.addEventListener("submit",async e=>{
      e.preventDefault();
      if(!nom.value.trim()){msg.textContent="Donnez un nom à l'alerte.";return;}
      if(!etat.departements.length){msg.textContent="Ajoutez au moins un département.";return;}
      if(!etat.periodes.length){msg.textContent="Ajoutez au moins une période.";return;}
      if(!etat.categories.length){msg.textContent="Cochez au moins une catégorie d'invités.";return;}
      if(!endpoint){msg.textContent="Le Worker ALERTE PLANIFIER n'est pas configuré.";return;}
      enregistrer.disabled=true;msg.textContent="Enregistrement…";
      try{
        const reponse=await fetch(endpoint+"/alertes"+(source?"/"+encodeURIComponent(source.idalerte):""),{
          method:source?"PATCH":"POST",credentials:"include",cache:"no-store",
          headers:{"Accept":"application/json","Content-Type":"application/json"},
          body:JSON.stringify({titre:nom.value.trim(),criteres:{
            departements:etat.departements,periodes:etat.periodes,
            plages:etat.plages,categories:etat.categories,parcs:[],mois:[],jours:[],dates:[]
          }})
        });
        const data=await reponse.json().catch(()=>null);
        if(!reponse.ok||data?.ok!==true)throw new Error(data?.message||"Enregistrement indisponible.");
        fermer();
        if(typeof options.onEnregistre==="function")await options.onEnregistre(data);
        else await afficherAlerte("Alerte enregistrée. Retrouvez-la dans MON COMPTE → SERVICE.");
      }catch(err){
        // TypeError au fetch : aucun statut HTTP récupérable (réseau, DNS,
        // TLS ou CORS). Ne pas l'attribuer à tort à la session membre.
        if(err instanceof TypeError){
          msg.textContent="Connexion à l'API impossible. Vérifier le domaine Cloudflare et l'autorisation CORS de l'origine membre.";
          console.error("ALERTE PLANIFIER : requête inaboutie vers",endpoint+"/alertes",err);
        }else{
          msg.textContent=err?.message||"Enregistrement indisponible.";
        }
        enregistrer.disabled=false;
      }
    },{signal:controller.signal});
  }

  window.LCDP_ouvrirFormulaireAlertePlanifier=ouvrirFormulaireAlertePlanning;
})();
