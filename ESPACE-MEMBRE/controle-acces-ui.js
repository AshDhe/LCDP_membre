/* Rendu partagé par la page réelle et les aperçus. Aucune autorisation n'est décidée ici. */
(function(global){
  "use strict";
  function element(tag,className,texte){const e=document.createElement(tag);if(className)e.className=className;if(texte!==undefined)e.textContent=texte;return e;}
  function bouton(texte,action){const b=element("button","lcdp-button",texte);b.type="button";if(action)b.addEventListener("click",action);return b;}
  function render(root,etat,actions={}){
    root.replaceChildren();root.className="lcdp-acces";root.dataset.screen=etat.screen;
    const titre=element("h1","lcdp-acces-titre",etat.screen==="presence"?"CONTRÔLE DE PRÉSENCE":"CONTRÔLE D’ACCÈS");root.appendChild(titre);
    const erreur=element("p","lcdp-acces-erreur");erreur.setAttribute("role","alert");
    if(etat.screen==="access_code"){
      const form=element("form","lcdp-acces-form");form.noValidate=true;
      const cases=element("div","lcdp-cle-code-quatre-cases");cases.setAttribute("role","group");cases.setAttribute("aria-label","Authentifiez-vous avec vos quatre chiffres");
      const champs=[];
      for(let i=0;i<4;i++){
        const input=element("input");input.type="password";input.inputMode="numeric";input.maxLength=1;input.pattern="[0-9]";input.autocomplete="off";input.setAttribute("aria-label","Chiffre "+(i+1)+" sur 4");
        input.addEventListener("input",()=>{input.value=input.value.replace(/\D/g,"").slice(-1);erreur.textContent="";});
        input.addEventListener("paste",event=>{
          const chiffres=(event.clipboardData?.getData("text")||"").replace(/\D/g,"").slice(0,4-i);if(!chiffres)return;
          event.preventDefault();Array.from(chiffres).forEach((ch,j)=>champs[i+j].value=ch);erreur.textContent="";
        });
        champs.push(input);cases.appendChild(input);
      }
      form.append(cases);
      if(etat.attemptsRemaining===1)form.appendChild(element("p","lcdp-acces-dernier-essai","Il ne vous reste plus qu’un essai."));
      const valider=bouton("Valider");valider.type="submit";form.append(erreur,valider);
      form.addEventListener("submit",async event=>{
        event.preventDefault();if(valider.disabled)return;
        const code=champs.map(c=>c.value).join("");
        if(!/^[0-9]{4}$/.test(code)){erreur.textContent="Saisissez les quatre chiffres.";return;}
        valider.disabled=true;
        try{await actions.onCode?.(code);}catch(e){erreur.textContent=e.message || "Vérification momentanément indisponible.";valider.disabled=false;}
      });
      root.appendChild(form);return;
    }
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
      ["Allumez le contrôleur.","Préparez-vous à filmer.","Appuyez sur le bouton caméra.","Laissez l’application filmer et attendez."].forEach(t=>ol.appendChild(element("li","",t)));
      root.appendChild(ol);
      const camera=element("button","lcdp-acces-camera");camera.type="button";camera.disabled=true;camera.setAttribute("aria-label","Contrôle d’accès");
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
  global.LCDP_ControleAccesUI={render};
})(window);
