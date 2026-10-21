(() => {
 "use strict";
 const root=document.querySelector('#contenu');
 const api='https://recuperation-compte-api.lacleduparc.fr';
 const opts={credentials:'include',cache:'no-store'};
 // L'identité du navigateur existante est conservée. En son absence (notamment PC),
 // elle est créée ici avant toute tentative de récupération CODR.
 function assurerIdentiteNavigateur(){
  const nom='lcdp_navigateur_proprietaire';
  const lire=()=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(nom+'='))?.slice(nom.length+1)||'';
  if(/^[a-f0-9]{64}$/.test(lire())) return true;
  const valeur=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const domaine=/(^|\.)lacleduparc\.fr$/i.test(location.hostname)?'; Domain=.lacleduparc.fr':'';
  const secure=location.protocol==='https:'?'; Secure':'';
  document.cookie=nom+'='+valeur+'; Path=/; Max-Age=34560000; SameSite=Lax'+domaine+secure;
  return lire()===valeur;
 }

 function render(title,message){root.replaceChildren();const h=document.createElement('h1');h.textContent=title;const p=document.createElement('p');p.textContent=message;root.append(h,p);}
 function fieldGroup(kind,length=4){const d=document.createElement('div');d.className='cells';const fields=[];
  for(let i=0;i<4;i++){const v=document.createElement('input');v.type='password';v.required=true;v.maxLength=kind==='codr'?4:1;v.inputMode=kind==='codr'?'text':'numeric';v.autocomplete='off';v.setAttribute('aria-label',kind==='codr'?`Mot ${i+1}`:`Chiffre ${i+1}`);v.addEventListener('input',()=>{v.value=kind==='codr'?v.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,4):v.value.replace(/\D/g,'').slice(0,1);if(v.value.length===v.maxLength)fields[i+1]?.focus();});d.append(v);fields.push(v);}return {element:d,fields};}
 function button(label,act){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',act);return b;}
 async function request(path,data){const r=await fetch(api+path,{...opts,method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});return {ok:r.ok,status:r.status,body:await r.json().catch(()=>({}))};}
 function blocked(){render('Compte indisponible','Ce compte nécessite une intervention de l’administrateur du club.');}
 function waiting(){render('Compte en cours de récupération','L’accès à ce compte est momentanément réservé à la personne ayant lancé sa récupération.');}
 function showCODR(){render('Récupérer mon compte','Saisissez les quatre mots de votre CODR. Deux erreurs entraînent le blocage du compte.');const form=document.createElement('form'),words=fieldGroup('codr'),status=document.createElement('p'),submit=document.createElement('button');submit.textContent='Valider le CODR';submit.type='submit';const toggle=document.createElement('label'),ck=document.createElement('input');ck.type='checkbox';ck.addEventListener('change',()=>words.fields.forEach(v=>v.type=ck.checked?'text':'password'));toggle.append(ck,' Afficher les mots');form.append(words.element,toggle,status,submit);root.append(form);
  form.addEventListener('submit',async e=>{e.preventDefault();const mots=words.fields.map(v=>v.value);if(mots.some(v=>v.length!==4)){status.textContent='Saisissez quatre mots de quatre lettres.';return;}submit.disabled=true;try{if(!assurerIdentiteNavigateur()){status.textContent='Les cookies de ce navigateur doivent être autorisés.';return;}const r=await request('/start',{mots});words.fields.forEach(v=>v.value='');if(r.ok&&r.body.success)return showCODA();if(r.body.reason==='codr_disabled'||r.body.reason==='account_blocked')return blocked();status.textContent=r.body.message||'Vérification refusée.';}catch{status.textContent='Service momentanément indisponible.';}finally{submit.disabled=false;}});words.fields[0].focus();}
 function showCODA(){render('Définir un nouveau CODA','Vous disposez de 48 heures pour terminer la récupération sur ce navigateur.');const form=document.createElement('form'),a=fieldGroup('coda'),b=fieldGroup('coda'),title1=document.createElement('p'),title2=document.createElement('p'),status=document.createElement('p'),submit=document.createElement('button');title1.textContent='Nouveau CODA';title2.textContent='Confirmez le CODA';submit.type='submit';submit.textContent='Enregistrer mon CODA';const toggle=document.createElement('label'),ck=document.createElement('input');ck.type='checkbox';ck.addEventListener('change',()=>[...a.fields,...b.fields].forEach(v=>v.type=ck.checked?'text':'password'));toggle.append(ck,' Afficher les chiffres');form.append(title1,a.element,title2,b.element,toggle,status,submit);root.append(form);
  form.addEventListener('submit',async e=>{e.preventDefault();const coda=a.fields.map(v=>v.value).join('');if(!/^\d{4}$/.test(coda)||coda!==b.fields.map(v=>v.value).join('')){status.textContent='Les deux CODA doivent être identiques.';return;}submit.disabled=true;try{const r=await request('/finish',{coda});if(r.ok&&r.body.success){render('Compte récupéré','Votre nouveau CODA est enregistré. Vous pouvez vous reconnecter.');root.append(button('Me connecter',()=>location.assign('https://lacleduparc.fr/ESPACE-PUBLIC/connexion-membre.html')));return;}if(r.body.reason==='account_blocked')return blocked();status.textContent=r.body.reason==='invalid_coda'?'Ce CODA ne respecte pas les règles de sécurité.':'Impossible de confirmer ce CODA.';}catch{status.textContent='Service momentanément indisponible.';}finally{submit.disabled=false;}});a.fields[0].focus();}
 async function init(){try{const r=await request('/status');if(!r.ok)throw Error('status unavailable');if(r.body.owner&&r.body.state==='en_cours')return showCODA();if(r.body.state==='bloque')return blocked();if(r.body.state==='en_cours')return waiting();if(r.body.state==='normal'||r.body.state==='unknown')return showCODR();return waiting();}catch{render('Vérification momentanément indisponible','Réessayez dans quelques instants.');root.append(button('Réessayer',()=>location.reload()));}}
 init();
})();
