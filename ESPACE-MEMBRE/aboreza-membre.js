/* Aboresa — Cas 1, 2 et 3. Le calendrier reste celui de PLANIFIER.
 * Les accès sont des lignes de panier liées à des retenues fluxm temporaires.
 */
(() => {
  'use strict';
  const cfg=window.SITE_CONFIG||{};
  const ENDPOINT=String(cfg.workerAboRezaUrl||cfg.WORKER_ABOREZA_URL||
    (typeof cfg.apiUrl==='function'?cfg.apiUrl('aboreza-api'):'https://aboreza-api.lacleduparc.fr')).replace(/\/+$/,'');
  const bridge=()=>window.LCDP_PLANIFIER_ABOREZA;
  const HTML_URL=new URL('./aboreza-membre.html',document.currentScript?.src||location.href).href;
  let templateBoite=null;
  async function chargerTemplates(){
    if(templateBoite)return;
    const r=await fetch(HTML_URL,{cache:'no-store'});
    if(!r.ok)throw Error('Interface ABO-RÉZA indisponible.');
    const doc=new DOMParser().parseFromString(await r.text(),'text/html');
    const tpl=doc.getElementById('lcdp-aboreza-template-dialogue');
    if(!tpl?.content)throw Error('Modèle de dialogue ABO-RÉZA manquant.');
    templateBoite=tpl;
  }
  let courant=null;
  let occupe=false;
  let bandeau=null;
  const moisLibelle=cle=>new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(cle+'-01T12:00:00Z'));
  const dateLibelle=iso=>new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}).format(new Date(iso+'T12:00:00Z'));
  const nomFormule=f=>({'1J':'1 jour','1M':'1 mois','3M':'3 mois','5M':'5 mois','10M':'10 mois','11M':'11 mois','12M':'1 an'}[f]||f);

  async function api(path,method='GET',body){
    const res=await fetch(ENDPOINT+path,{method,credentials:'include',cache:'no-store',headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await res.json().catch(()=>null);
    if(!res.ok||result?.ok!==true)throw new Error(result?.message||'Le service ABO-RÉZA est indisponible.');
    return result;
  }
  function elem(tag,cls,texte){const x=document.createElement(tag);if(cls)x.className=cls;if(texte!==undefined)x.textContent=texte;return x;}
  function modal(titre,installer){
    return new Promise(resolve=>{
      if(!templateBoite)throw Error('Le modèle de boîte ABO-RÉZA n’est pas chargé.');
      const voile=templateBoite.content.firstElementChild.cloneNode(true);
      const boite=voile.querySelector('.lcdp-aboreza-dialogue');
      const x=voile.querySelector('.lcdp-aboreza-fermer');
      const h=voile.querySelector('[data-aboreza-titre]');
      h.textContent=titre;boite.setAttribute('aria-label',titre);
      document.body.append(voile);
      let clos=false;
      const finir=v=>{if(clos)return;clos=true;voile.remove();document.removeEventListener('keydown',esc);resolve(v);};
      const esc=e=>{if(e.key==='Escape')finir(null);};document.addEventListener('keydown',esc);
      x.addEventListener('click',()=>finir(null));voile.addEventListener('click',e=>{if(e.target===voile)finir(null);});
      installer(boite,finir);
      x.focus();
    });
  }
  function actions(box,choix,finir){
    const ligne=elem('div','lcdp-aboreza-actions');
    for(const c of choix){const b=elem('button',c.primaire?'lcdp-aboreza-primary':'',c.texte);b.type='button';
      b.addEventListener('click',()=>finir(c.valeur));ligne.append(b);}
    box.append(ligne);
  }
  async function choisirFormuleCatalogue(offres){
    return modal('Choisissez votre abonnement',(boite,finir)=>{
      boite.append(elem('p','lcdp-aboreza-intro',
        'Toutes les formules sont présentées. Les abonnements indisponibles dans votre situation apparaissent en gris.'));
      const liste=elem('div','lcdp-aboreza-formules');
      for(const offre of offres){
        const actif=offre.disponible!==false;
        const bouton=elem('button','lcdp-aboreza-formule'+(actif?'':' lcdp-aboreza-formule--inactive'));
        bouton.type='button';bouton.setAttribute('aria-disabled',String(!actif));
        bouton.append(elem('strong','',nomFormule(offre.formule)),
          elem('span','',actif?'Choisir':'Indisponible'));
        bouton.onclick=()=>{
          if(actif)finir(offre.formule);
          else informerIndisponibilite(offre).catch(e=>console.error(e));
        };
        liste.append(bouton);
      }
      boite.append(liste);
    });
  }
  async function informerIndisponibilite(offre){
    return modal('Formule indisponible',(boite,finir)=>{
      boite.append(elem('p','',offre.motifIndisponibilite||
        'Aucune date de démarrage compatible avec votre situation.'));
      actions(boite,[{texte:'Fermer',valeur:true,primaire:true}],finir);
    });
  }
  async function choisirDateDemarrage(offre){
    return modal('Choisissez votre date de démarrage',(boite,finir)=>{
      boite.append(elem('p','lcdp-aboreza-intro',`Abonnement ${nomFormule(offre.formule)}`));
      const label=elem('label','','Date de démarrage');
      let entree;
      if(offre.formule==='1J'){
        entree=elem('input');entree.type='date';entree.min=offre.dateMin;
        entree.max=offre.dateMax;entree.value=offre.dateMin;
      }else{
        entree=elem('select');
        for(const date of offre.debuts){
          const option=elem('option','',dateLibelle(date));option.value=date;entree.append(option);
        }
      }
      entree.required=true;label.append(entree);boite.append(label);
      const note=elem('p','lcdp-aboreza-intro',
        'Aboresa vérifie cette date avec tous vos abonnements actuels.');
      boite.append(note);
      const ligne=elem('div','lcdp-aboreza-actions');
      const retour=elem('button','','Retour aux abonnements');retour.type='button';retour.onclick=()=>finir(null);
      const suivant=elem('button','lcdp-aboreza-primary','Continuer');suivant.type='button';
      suivant.onclick=()=>{if(!entree.value)return;finir(entree.value);};
      ligne.append(retour,suivant);boite.append(ligne);
    });
  }
  async function presenterCompatibilite(verification){
    const {compatible,inclusions=[],dateDebut,dateFin,message}=verification;
    if(!compatible){
      await modal('Date non compatible',(boite,finir)=>{
        boite.append(elem('p','',message||'Ce début ne permet pas d’inclure les abonnements actuels.'));
        actions(boite,[{texte:'Fermer',valeur:true,primaire:true}],finir);
      });
      return false;
    }
    if(!inclusions.length)return true;
    return modal('Inclure vos abonnements',(boite,finir)=>{
      boite.append(elem('p','',
        `Débuter l’abonnement le ${dateLibelle(dateDebut)} et inclure les abonnements actuels sur la période (${moisLibelle(dateDebut.slice(0,7))} – ${moisLibelle(dateFin.slice(0,7))}) ?`));
      actions(boite,[{texte:'Inclure',valeur:true,primaire:true}],finir);
    });
  }
  // K1 garde son écran de qualification existant.
  async function choisirOffre(offres,contexte={}){
    return modal('Choisissez votre abonnement',(boite,finir)=>{
      const a=elem('label','','Formule');
      const choix=elem('select');
      offres.filter(o=>o.disponible!==false).forEach(o=>{
        const option=elem('option','',nomFormule(o.formule));option.value=o.formule;choix.append(option);
      });
      a.append(choix);boite.append(a);
      const b=elem('label','','Date de démarrage');
      const espace=elem('div');b.append(espace);boite.append(b);
      const note=elem('p');boite.append(note);
      const reconstruire=()=>{
        espace.replaceChildren();const o=offres.find(x=>x.formule===choix.value);if(!o)return;
        let el;
        if(o.formule==='1J'){
          el=elem('input');el.type='date';el.min=o.dateMin;el.max=o.dateMax;el.value=o.dateMin;
        } else {
          el=elem('select');o.debuts.forEach(d=>{
            const op=elem('option','',dateLibelle(d));op.value=d;el.append(op);
          });
        }
        el.id='lcdp-aboreza-date-debut';el.required=true;espace.append(el);
        note.textContent=o.formule==='1J'
          ? 'Un accès à sélectionner pour cette journée.'
          : o.nbAccesRequis+' accès obligatoires : deux par mois pendant '+o.nbMoisGuides+' mois consécutif'+(o.nbMoisGuides>1?'s':'')+'.';
      };
      choix.addEventListener('change',reconstruire);reconstruire();
      const ligne=elem('div','lcdp-aboreza-actions');
      const annuler=elem('button','','Annuler');annuler.type='button';annuler.onclick=()=>finir(null);
      const continuer=elem('button','lcdp-aboreza-primary','Continuer');continuer.type='button';
      continuer.onclick=()=>{const date=espace.querySelector('input,select')?.value;
        if(!date){note.textContent='Choisissez une date.';return;}
        finir({formule:choix.value,dateDebut:date});};
      ligne.append(annuler,continuer);boite.append(ligne);
    });
  }
  async function informerContrainte(p){
    return modal('Préparez vos accès',(boite,finir)=>{
      boite.append(elem('p','',`Votre abonnement ${nomFormule(p.formule)} commence le ${dateLibelle(p.dateDebut)}.`));
      boite.append(elem('p','',p.formule==='1J'
        ? 'Vous devez sélectionner un accès pour cette journée avant de poursuivre.'
        : `Le panier requiert deux accès par mois pendant ${p.nbMoisGuides} mois consécutifs, soit ${p.nbAccesRequis} accès. Les accès déjà réservés sont pris en compte.`));
      if(p.nbDejaReserves>0)boite.append(elem('p','',
        `${p.nbSelectionnes} accès obligatoires déjà satisfaits ; il en reste ${Math.max(0,p.nbAccesRequis-p.nbSelectionnes)} à sélectionner.`));
      boite.append(elem('p','','Vous pourrez changer de parc et de département. Le planning avancera automatiquement lorsque les accès du mois seront sélectionnés. Chaque sélection retient vos accès pendant 15 minutes, renouvelées lors de la sélection suivante.'));
      actions(boite,[{texte:'Continuer',valeur:true,primaire:true}],finir);
    });
  }
  function miseAJourBandeau(){
    const hote=bridge()?.hoteBandeau?.();
    if(!hote)return;
    if(!courant){bandeau?.remove();bandeau=null;return;}
    if(!bandeau){bandeau=elem('aside','lcdp-aboreza-bandeau');bandeau.setAttribute('aria-live','polite');hote.append(bandeau);}
    bandeau.replaceChildren();
    bandeau.append(elem('strong','',`ABO-RÉZA — ${nomFormule(courant.formule)}`));
    const m=courant.mois.find(x=>x.mois===courant.moisActif);
    bandeau.append(elem('span','',courant.complet
      ? `Panier prêt : ${courant.nbSelectionnes} accès sur ${courant.nbAccesRequis}.`
      : `${moisLibelle(courant.moisActif)} : ${m?.selectionnes||0}/${m?.attendu||2} accès. Il reste ${m?.restants||0} accès sur ce mois.`));
    const quitter=elem('button','','Quitter ABO-RÉZA sans supprimer le panier');
    quitter.type='button';quitter.onclick=()=>quitterTunnel().catch(e=>bridge()?.alerter?.(e.message));
    if(courant.expirationCommande){
      bandeau.append(elem('small','lcdp-aboreza-echeance','Retenues valides jusqu’à '+new Intl.DateTimeFormat('fr-FR',{
        timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'
      }).format(new Date(courant.expirationCommande))+'.'));
    }
    bandeau.append(quitter);
  }
  async function entrerDansCalendrier(p){
    courant=p;
    bridge()?.changerMode?.(true);
    miseAJourBandeau();
    bridge()?.viderCache?.();
    await bridge()?.allerMois?.(p.moisActif);
  }
  async function quitterTunnel(){
    courant=null;bridge()?.changerMode?.(false);miseAJourBandeau();bridge()?.viderCache?.();
    const parts=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).formatToParts(new Date());
    const v=x=>parts.find(p=>p.type===x)?.value;
    await bridge()?.allerMois?.(v('year')+'-'+v('month'));
  }
  async function reprendreOuRecommencer(p){
    return modal('Un panier existe déjà',(boite,finir)=>{
      boite.append(elem('p','',`Abonnement ${nomFormule(p.formule)}, début ${dateLibelle(p.dateDebut)}. ${p.nbSelectionnes} accès sélectionné${p.nbSelectionnes>1?'s':''} sur ${p.nbAccesRequis}.`));
      actions(boite,[{texte:'Reprendre',valeur:'reprendre',primaire:true},{texte:'Annuler ce panier et recommencer',valeur:'recommencer'}],finir);
    });
  }
  async function demarrer(contexte={}){
    if(!['sans_abonnement','jour_hors_couverture','horizon'].includes(contexte.origine)){
      await bridge()?.alerter?.('Cette entrée ABO-RÉZA n’est pas encore raccordée.');return;
    }
    if(occupe)return;
    occupe=true;
    try{
      await chargerTemplates();
      const enCours=(await api('/panier')).panier;
      if(enCours){
        const decision=await reprendreOuRecommencer(enCours);
        if(decision==='reprendre'){
          await entrerDansCalendrier(enCours);
          if(enCours.complet)await afficherRecap(enCours);
          return;
        }
        if(decision!=='recommencer')return;
        await api('/annuler','POST',{idpanier:enCours.idpanier});
      }
      const parametres=new URLSearchParams({origine:contexte.origine});
      if(contexte.origine==='jour_hors_couverture')parametres.set('dateCible',contexte.date||'');
      if(contexte.origine==='horizon')parametres.set('moisCible',contexte.moisCible||'');
      const offres=(await api('/catalogue?'+parametres.toString())).offres;
      let demande=null;
      let inclureExistants=false;
      if(['jour_hors_couverture','horizon'].includes(contexte.origine)){
        // K2/K3 : même catalogue et même écran de démarrage, filtrages distincts.
        while(!demande){
          const formule=await choisirFormuleCatalogue(offres);
          if(!formule)return;
          const offre=offres.find(o=>o.formule===formule);
          while(!demande){
            const dateDebut=await choisirDateDemarrage(offre);
            if(!dateDebut)break;
            const verification=(await api('/verifier-debut','POST',{
              origine:contexte.origine,dateCible:contexte.date||'',moisCible:contexte.moisCible||'',formule,dateDebut
            })).verification;
            if(!verification.compatible){await presenterCompatibilite(verification);continue;}
            const accord=await presenterCompatibilite(verification);
            if(accord!==true)continue;
            demande={formule,dateDebut};inclureExistants=verification.inclusions.length>0;
          }
        }
      }else{
        demande=await choisirOffre(offres,contexte);
        if(!demande)return;
      }
      const nouveau=(await api('/panier','POST',{
        ...demande,origine:contexte.origine,inclureExistants,
        ...(contexte.origine==='jour_hors_couverture'?{dateCible:contexte.date}:{}),
        ...(contexte.origine==='horizon'?{moisCible:contexte.moisCible}:{}),
      })).panier;
      const suivant=await informerContrainte(nouveau);
      if(!suivant)return; // Le panier reste récupérable.
      await entrerDansCalendrier(nouveau);
    } catch(e){await bridge()?.alerter?.(e.message||'Erreur ABO-RÉZA.');}
    finally{occupe=false;}
  }
  async function selectionnerAcces(choix){
    if(!courant||occupe)return;
    occupe=true;
    try{
      const avant=courant.moisActif;
      const reponse=await api('/acces','POST',{idpanier:courant.idpanier,
        idparc:String(choix.parc.idparc||choix.parc.id||''),date:choix.dateIso,plagebookd:choix.plagebookd});
      courant=reponse.panier;
      bridge()?.fermerJour?.();bridge()?.viderCache?.();miseAJourBandeau();
      if(courant.moisActif!==avant)await bridge()?.allerMois?.(courant.moisActif);
      else await bridge()?.actualiser?.();
      if(courant.complet){
        await bridge()?.alerter?.('Les accès obligatoires sont sélectionnés. Votre panier est prêt pour paiement.');
        await afficherRecap(courant);
      }else{
        const texte=courant.moisActif!==avant
          ? `Les deux accès de ${moisLibelle(avant)} sont sélectionnés. Passage à ${moisLibelle(courant.moisActif)}.`
          : `Accès ajouté. Il vous reste ${courant.restantsMois} accès à réserver pour ${moisLibelle(courant.moisActif)}.`;
        await bridge()?.alerter?.(texte);
      }
    }finally{occupe=false;}
  }
  async function afficherRecap(p){
    await chargerTemplates();
    await modal('Récapitulatif de votre abonnement',(boite,finir)=>{
      boite.append(elem('p','',`Formule : ${nomFormule(p.formule)}. Période : du ${dateLibelle(p.dateDebut)} au ${dateLibelle(p.dateFin)}.`));
      boite.append(elem('p','',`${p.nbSelectionnes} accès pris en compte sur ${p.nbAccesRequis} requis, dont ${p.nbDejaReserves||0} déjà réservés.`));
      const liste=elem('ol','lcdp-aboreza-recap');
      p.acces.forEach(a=>liste.append(elem('li','',`${dateLibelle(a.dateacces)} — ${a.nomparc||a.idparc} — ${libellePlage(a.plagebookd)}${a.origine==='existant'?' (déjà réservé)':''}`)));
      boite.append(liste);
      boite.append(elem('p','','Vos accès sont retenus provisoirement pendant 15 minutes après la dernière sélection. Le panier doit être payé avant l’expiration des retenues.'));
      actions(boite,[{texte:'Fermer le récapitulatif',valeur:'fermer',primaire:true}],finir);
      window.dispatchEvent(new CustomEvent('lcdp:aboreza-panier-pret',{detail:{idpanier:p.idpanier,formule:p.formule}}));
    });
  }
  function libellePlage(p){return {plage1:'6 h – 10 h',plage2:'10 h – 13 h',plage3:'13 h – 17 h',plage4:'17 h – 21 h',plage5:'21 h – 2 h'}[p]||p;}
  function datePossible(d){return Boolean(courant && d.slice(0,7)===courant.moisActif && d>=courant.dateDebut&&d<=courant.dateFin);}
  function accesDejaChoisi(date,plage){return courant?.acces?.some(a=>a.dateacces===date&&a.plagebookd===plage);}
  function marquerAccesProvisoires(card,date){
    if(!courant)return;
    const idparc=card.dataset.idparc;
    courant.acces.filter(a=>a.dateacces===date&&a.idparc===idparc).forEach(a=>{
      if(a.origine==='existant')return;
      const slot=card.querySelector('[data-lcdp-card-jour-mois-slot="'+a.plagebookd+'"]');
      if(slot){slot.classList.add('lcdp-planifier-plage--acces-provisoire');slot.title+=' · Accès provisoire ABO-RÉZA';}
    });
  }
  window.LCDP_ABOREZA={actif:()=>Boolean(courant),panier:()=>courant,demarrer,selectionnerAcces,datePossible,accesDejaChoisi,marquerAccesProvisoires};
  window.LCDP_ouvrirAboReza=demarrer;
})();
