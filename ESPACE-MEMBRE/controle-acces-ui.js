/* Rendu partagé par la page réelle et les aperçus. Aucune autorisation n'est décidée ici. */
(function(global){
  "use strict";
  function element(tag,className,texte){const e=document.createElement(tag);if(className)e.className=className;if(texte!==undefined)e.textContent=texte;return e;}
  function bouton(texte,action){const b=element("button","lcdp-button",texte);b.type="button";if(action)b.addEventListener("click",action);return b;}
  function render(root,etat,actions={}){
    root.replaceChildren();root.className="lcdp-acces";root.dataset.screen=etat.screen;
    const titre=element("h1","lcdp-acces-titre",etat.action==="checkout"?"CONTRÔLE DE SORTIE":etat.screen==="presence"?"CONTRÔLE DE PRÉSENCE":"CONTRÔLE D’ACCÈS");root.appendChild(titre);
    if(etat.screen==="expired"){
      root.appendChild(element("p","lcdp-acces-message","Votre réservation est terminée. Effectuez votre check-out."));
      root.appendChild(bouton("Faire mon check-out",()=>actions.onCheckout?.()));return;
    }
    if(etat.screen==="checkout_done" || etat.screen==="key_closed"){
      root.appendChild(element("p","lcdp-acces-message",etat.screen==="checkout_done"?"Check-out validé.":"Le processus Ma clé est terminé."));
      if(etat.simulation)root.appendChild(element("p","lcdp-acces-message","Sortie simulée : le verrou réel reste inchangé."));
      if(etat.unlocked)root.appendChild(bouton("Retour à l’accueil",()=>actions.onClosed?.()));return;
    }
    if(etat.simulation)root.appendChild(element("p","lcdp-acces-message","Mode test — validation simulée"));
    if(etat.screen==="processing" || etat.screen==="uploading"){
      const attente=element("div","lcdp-acces-spinner");attente.setAttribute("aria-hidden","true");root.appendChild(attente);
      const message=element("p","lcdp-acces-message",etat.screen==="uploading"?"Envoi de la vidéo…":"Analyse en cours…");message.setAttribute("role","status");root.appendChild(message);return;
    }
    if(etat.screen==="access_confirmed" || etat.screen==="guest_list" || etat.screen==="confirmation_done"){
      root.appendChild(element("p","lcdp-acces-message","Contrôle d’accès validé."));
      if(etat.screen!=="guest_list" && etat.presence?.image)ajouterImagePresence(root,etat.presence);
      if(etat.screen==="guest_list"){
        const form=element("form","lcdp-acces-invites-form");
        const liste=element("ul","lcdp-acces-instructions");
        (etat.guests || []).forEach(g=>{
          const item=element("li"),label=element("label"),casePresence=element("input");casePresence.type="checkbox";casePresence.value=g.id;casePresence.name="guest";casePresence.checked=g.present===true;casePresence.disabled=g.present===true;
          label.append(casePresence,document.createTextNode(" "+g.name+(g.present?" — présence déjà confirmée":"")));item.appendChild(label);liste.appendChild(item);
        });
        const valider=bouton("Valider");valider.type="submit";
        form.append(liste,valider);form.addEventListener("submit",async event=>{event.preventDefault();if(valider.disabled)return;valider.disabled=true;try{await actions.onGuestConfirm?.(Array.from(form.querySelectorAll('input[name="guest"]:checked')).map(i=>i.value));}catch(e){valider.disabled=false;const erreur=element("p","lcdp-acces-erreur",e.message);erreur.setAttribute("role","alert");form.appendChild(erreur);}});
        root.append(form,bouton("Retour",()=>actions.onBack?.()));return;
      }
      if(etat.screen==="confirmation_done")return;
      if(etat.guests?.length){root.appendChild(element("p","lcdp-acces-message","Confirmez des invités."));root.appendChild(bouton("Liste",()=>actions.onGuests?.()));}
      else root.appendChild(bouton("OK",()=>actions.onConfirmed?.()));
      if(etat.checkoutEnabled)root.appendChild(bouton("Faire mon check-out",()=>actions.onCheckout?.()));
      return;
    }
    if(etat.screen==="capture_error"){
      const message=element("p","lcdp-acces-erreur",etat.message || "La capture n’a pas pu être terminée.");message.setAttribute("role","alert");root.appendChild(message);
      root.appendChild(bouton("Réessayer",()=>actions.onRetry?.()));return;
    }
    const erreur=element("p","lcdp-acces-erreur");erreur.setAttribute("role","alert");
    if(etat.reservation){
      const resa=element("section","lcdp-acces-reservation");resa.setAttribute("aria-label",etat.role==="invite"?"Votre invitation":"Votre réservation");
      resa.appendChild(element("h2","lcdp-acces-parc",etat.reservation.parkName));
      const date=new Date(etat.reservation.startsAt);
      const heure=Number.isNaN(date.getTime())?"Heure indisponible":new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit"}).format(date);
      resa.appendChild(element("p","lcdp-acces-heure",heure));
      const n=etat.reservation.guestCount;
      resa.appendChild(element("p","lcdp-acces-invites",Number.isInteger(n)?n+" invité"+(n===1?"":"s"):"Nombre d’invités indisponible"));root.appendChild(resa);
    }
    if(etat.screen==="camera_ready"){
      const ol=element("ol","lcdp-acces-instructions");
      [...(etat.hasBracelet===false?[]:[etat.action==="checkout"?"Préparez votre bracelet.":"Allumez votre bracelet."]),"Allumez le contrôleur.","Préparez-vous à filmer.","Lancez la caméra et suivez les indications de l’application."].forEach(t=>ol.appendChild(element("li","",t)));
      root.appendChild(ol);
      const camera=element("button","lcdp-acces-camera");camera.type="button";camera.disabled=etat.cameraEnabled!==true;camera.addEventListener("click",()=>actions.onCamera?.());camera.setAttribute("aria-label","Contrôle d’accès");
      const image=element("img","lcdp-acces-camera-image");
      image.src=typeof global.LCDP_urlObjet === "function"
        ? global.LCDP_urlObjet("/IMAG/BOUTON/controle-acces.webp")
        : String(global.SITE_CONFIG?.objetBaseUrl || "/OBJET").replace(/\/+$/,"")+"/IMAG/BOUTON/controle-acces.webp";
      image.alt="";image.setAttribute("aria-hidden","true");camera.appendChild(image);
      const bas=element("div","lcdp-acces-bas");bas.appendChild(camera);root.appendChild(bas);return;
    }
    if(etat.screen==="guest_pending" || etat.screen==="guest_waiting_control"){
      const texte=etat.screen==="guest_pending"?"Vous êtes invité(e). Validation en cours.":"Vous êtes invité(e). Votre parrain attend votre contrôle d’accès.";
      const message=element("p","lcdp-acces-message",texte);message.setAttribute("role","status");root.appendChild(message);return;
    }
    if(etat.screen==="presence" && etat.presence?.image){ajouterImagePresence(root,etat.presence);root.appendChild(bouton("Faire mon check-out",()=>actions.onCheckout?.()));return;}
    if(etat.screen==="presence"){
      const indicateur=etat.indicator;
      if(!indicateur || !["active","overstay"].includes(indicateur.state))throw new Error("Indicateur de présence non autorisé.");
      const zone=element("div","lcdp-acces-presence");
      if(indicateur.imageUrl){
        const url=new URL(indicateur.imageUrl,global.location.href);if(url.protocol!=="https:")throw new Error("Image de présence invalide.");
        const img=element("img");img.src=url.href;img.alt=indicateur.label;zone.appendChild(img);
      }else{
        // En attendant les images définitives : couleur explicitement fournie par le serveur.
        if(!/^#[0-9a-f]{6}$/i.test(indicateur.color||""))throw new Error("Couleur de présence invalide.");
        zone.style.backgroundColor=indicateur.color;zone.appendChild(element("p","",indicateur.label));
      }
      zone.setAttribute("role","status");root.appendChild(zone);return;
    }
    if(etat.screen==="denied"){
      const lightbox=element("section","lcdp-acces-lightbox");lightbox.setAttribute("role","alertdialog");lightbox.setAttribute("aria-modal","true");lightbox.setAttribute("aria-label","Accès refusé");
      const contenu=element("div","lcdp-acces-lightbox-contenu");
      contenu.appendChild(element("p","lcdp-acces-refus","Vous n’êtes pas reconnu. Votre accès est refusé."));
      const ok=bouton("OK",()=>actions.onHome?.());const debloquer=bouton("Débloquer ma clé");debloquer.disabled=true;
      contenu.append(ok,debloquer);lightbox.appendChild(contenu);root.appendChild(lightbox);return;
    }
    root.appendChild(element("p","lcdp-acces-message","Le contrôle d’accès est momentanément indisponible."));
  }
  function ajouterImagePresence(root,presence){
    const image=element("img","lcdp-presence-image");
    const fichier="presence_fond_"+presence.image.names[0]+"_cercle_"+presence.image.names[1]+"_cle_"+presence.image.names[2]+".webp";
    const chemin="/IMAG/PRESENCE/"+fichier;
    image.src=typeof global.LCDP_urlObjet==="function"?global.LCDP_urlObjet(chemin):"/OBJET"+chemin;
    image.alt="Présence autorisée — "+presence.image.names.join(", ");
    image.addEventListener("error",()=>{image.hidden=true;root.appendChild(element("p","lcdp-acces-message","Présence autorisée. Le visuel est momentanément indisponible."));},{once:true});
    root.appendChild(image);
  }
  async function filmer(root,options) {
    if(!navigator.mediaDevices?.getUserMedia || !global.MediaRecorder)throw Error("Ce navigateur ne permet pas l’enregistrement vidéo. Utilisez un navigateur compatible en HTTPS.");
    const canvas=document.createElement("canvas");canvas.width=720;canvas.height=960;
    if(typeof canvas.captureStream!=="function")throw Error("L’enregistrement avec changement de caméra n’est pas disponible sur ce navigateur.");
    const ctx=canvas.getContext("2d");
    root.replaceChildren();
    const titre=element("h1","lcdp-acces-titre",options.action==="checkout"?"CONTRÔLE DE SORTIE":"CONTRÔLE D’ACCÈS");
    const instruction=element("p","lcdp-acces-message","Ouverture de la caméra…");instruction.setAttribute("role","status");
    const video=element("video","lcdp-acces-video");video.autoplay=true;video.muted=true;video.playsInline=true;video.setAttribute("playsinline","");
    const compte=element("p","lcdp-acces-message");
    const switcher=bouton("Passer en mode selfie");switcher.hidden=true;
    root.append(titre,instruction,video,compte,switcher);
    let stream=null,sortie=null,recorder=null,raf=null,closed=false,cameraPrete=false,abortError=null,taille=0;
    const morceaux=[];const MAX=20*1024*1024;
    function verifier(){if(abortError)throw abortError;if(closed)throw Error("Capture interrompue. Recommencez la séquence.");}
    function interrompre(){abortError=Error("Capture interrompue. Recommencez la séquence sans quitter l’application.");stream?.getTracks().forEach(t=>t.stop());if(recorder?.state==="recording")recorder.stop();}
    function visibilite(){if(document.visibilityState==="hidden")interrompre();}
    const attente=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    async function ouvrirCamera(mode){
      cameraPrete=false;stream?.getTracks().forEach(t=>t.stop());video.srcObject=null;
      const obtenu=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:mode},width:{ideal:720},height:{ideal:960}},audio:false});
      if(closed || abortError){obtenu.getTracks().forEach(t=>t.stop());verifier();}
      stream=obtenu;video.srcObject=stream;await video.play();
      const debut=performance.now();while(!video.videoWidth){verifier();if(performance.now()-debut>10000)throw Error("La caméra ne fournit pas d’image.");await attente(50);}
      const face=stream.getVideoTracks()[0]?.getSettings?.().facingMode;
      if(face && face!==mode)throw Error("La caméra demandée n’est pas disponible sur cet appareil.");
      cameraPrete=true;
      video.style.transform=mode==="user"?"scaleX(-1)":"none";
    }
    function dessiner(){
      if(closed)return;
      ctx.fillStyle="#000";ctx.fillRect(0,0,canvas.width,canvas.height);
      if(cameraPrete && video.videoWidth){const ratio=Math.min(canvas.width/video.videoWidth,canvas.height/video.videoHeight);const w=video.videoWidth*ratio,h=video.videoHeight*ratio;ctx.drawImage(video,(canvas.width-w)/2,(canvas.height-h)/2,w,h);}
      raf=requestAnimationFrame(dessiner);
    }
    async function minuter(secondes,bracelet=false){
      const debut=performance.now();
      while(performance.now()-debut<secondes*1000){verifier();const ecoule=(performance.now()-debut)/1000;compte.textContent=Math.max(1,Math.ceil(secondes-ecoule))+" s";if(bracelet && ecoule>=options.braceletAtSeconds)instruction.textContent="Mettez le bracelet devant votre visage.";await attente(100);}
      verifier();compte.textContent="";
    }
    document.addEventListener("visibilitychange",visibilite);global.addEventListener("pagehide",interrompre);
    try {
      await ouvrirCamera("environment");verifier();dessiner();
      sortie=canvas.captureStream(24);
      const mime=["video/mp4","video/webm;codecs=vp8","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));
      if(!mime)throw Error("Aucun format vidéo compatible n’est disponible.");
      recorder=new MediaRecorder(sortie,{mimeType:mime,videoBitsPerSecond:1500000});
      let resolveStop,rejectStop;
      const stopPromise=new Promise((resolve,reject)=>{resolveStop=resolve;rejectStop=reject;});
      stopPromise.catch(()=>{});
      recorder.ondataavailable=e=>{if(e.data.size){taille+=e.data.size;if(taille>MAX){interrompre();return;}morceaux.push(e.data);}};
      recorder.onerror=()=>{abortError=Error("L’enregistrement vidéo a échoué.");rejectStop(abortError);};
      recorder.onstop=resolveStop;recorder.start(500);
      instruction.textContent="Filmez le code du boîtier.";
      await minuter(options.boxSeconds);
      if(options.selfieSeconds>0){
      instruction.textContent="Passez en mode selfie. Inversez la prise de vue.";switcher.hidden=false;
      await new Promise((resolve,reject)=>{
        const debut=performance.now();
        const timer=setInterval(()=>{if(abortError || performance.now()-debut>30000){clearInterval(timer);switcher.onclick=null;reject(abortError || Error("Le passage en mode selfie a pris trop de temps. Recommencez."));}},100);
        switcher.onclick=()=>{clearInterval(timer);switcher.onclick=null;resolve();};
      });
      verifier();switcher.hidden=true;instruction.textContent="Ouverture du mode selfie…";
      await ouvrirCamera("user");verifier();
      instruction.textContent="Placez votre visage dans l’image.";
      await minuter(options.selfieSeconds,true);
      }
      if(recorder.state!=="recording")throw Error("L’enregistrement s’est interrompu.");
      recorder.stop();await stopPromise;verifier();
      if(taille>MAX)throw Error("La vidéo est trop volumineuse. Recommencez.");
      const blob=new Blob(morceaux,{type:mime.split(";")[0]});if(!blob.size)throw Error("La vidéo est vide.");
      return blob;
    } finally {
      closed=true;cameraPrete=false;if(raf!==null)cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t=>t.stop());sortie?.getTracks().forEach(t=>t.stop());
      if(recorder?.state==="recording")recorder.stop();video.srcObject=null;
      document.removeEventListener("visibilitychange",visibilite);global.removeEventListener("pagehide",interrompre);
    }
  }
  global.LCDP_ControleAccesUI={render,filmer};
})(window);
