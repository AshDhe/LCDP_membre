/**
 * w-alerte-planifier.js — Cloudflare Worker (à déployer séparément).
 * Recherche ENREGISTRÉE, relance MANUELLE uniquement ; aucune tâche cron.
 * Secrets attendus : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SESSION_SECRET (même secret HMAC que les Workers membres).
 * Origines autorisées : ALLOWED_ORIGINS séparées par virgule.
 *
 * Signature alignée sur w-factupaiement : deux segments HMAC-SHA256.
 */
const JSON_HEADERS = {"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set(["duo","famille","coach","famille-coach","tous"]);
const REPONSE = (data,status=200,origin="") => new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...(origin?{"access-control-allow-origin":origin,"access-control-allow-credentials":"true","vary":"Origin"}:{})}});
const erreur = (message,status=400) => Object.assign(new Error(message),{status});
function originAutorisee(request,env){
  const origin=request.headers.get("Origin")||"";
  const liste=String(env.ALLOWED_ORIGINS||"https://membre.lacleduparc.fr,https://ashdhe.github.io").split(",").map(v=>v.trim()).filter(Boolean);
  return origin&&liste.includes(origin)?origin:"";
}
function urlDb(env,table,params={}){
  const url=new URL(String(env.SUPABASE_URL||"").replace(/\/$/,"")+"/rest/v1/"+table);
  Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  return url;
}
async function db(env,table,params={},options={}){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw erreur("Worker non configuré",503);
  const response=await fetch(urlDb(env,table,params),{...options,headers:{
    apikey:env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type":"application/json",
    Prefer:options.prefer||"return=representation",
    ...(options.headers||{})
  }});
  if(!response.ok)throw erreur("Erreur du service de données",502);
  if(response.status===204)return [];
  return response.json();
}
function base64urlBytes(value){
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw erreur("Session invalide",401);
  const binary=atob(value.replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function base64urlJson(value){
  try{return JSON.parse(new TextDecoder().decode(base64urlBytes(value)));}
  catch{throw erreur("Session invalide",401);}
}
async function session(request,env){
  const cookie=request.headers.get("Cookie")||"";
  const value=cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith("idsession_membre="))?.slice("idsession_membre=".length);
  if(!value||!env.SESSION_SECRET)throw erreur("Session non vérifiable",401);
  let token;try{token=decodeURIComponent(value);}catch{throw erreur("Session invalide",401);}
  const parts=token.split(".");
  // Même format que w-factupaiement : payload_base64url.signature_HMAC_base64url.
  if(parts.length!==2)throw erreur("Session invalide",401);
  const claims=base64urlJson(parts[0]);
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("HMAC",key,base64urlBytes(parts[1]),new TextEncoder().encode(parts[0])))throw erreur("Signature de session invalide",401);
  if(claims.typ!=="session_membre"||!UUID.test(claims.idsession)||!UUID.test(claims.idmembre)||!Number.isFinite(Number(claims.exp))||Number(claims.exp)<=Date.now()/1000)throw erreur("Session expirée ou invalide",401);
  const active=await db(env,"sessactive",{select:"idsession,idmembre,dateexpiration,revoked_reason",idsession:"eq."+claims.idsession,idmembre:"eq."+claims.idmembre,dateexpiration:"gt."+new Date().toISOString(),limit:"1"});
  if(!active.length||active[0].revoked_reason)throw erreur("Session révoquée ou expirée",401);
  return claims.idmembre;
}
function listeUniq(valeur,max,validateur,nom){
  if(!Array.isArray(valeur)||valeur.length>max)throw erreur(nom+" : maximum "+max+" valeurs");
  const res=[...new Set(valeur.map(v=>String(v).trim()).filter(Boolean))];
  if(!res.every(validateur))throw erreur(nom+" : valeur invalide");
  return res;
}
function criteresValides(input){
  if(!input||typeof input!=="object"||Array.isArray(input))throw erreur("Critères invalides");
  const departements=listeUniq(input.departements||[],3,v=>/^(?:0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(v),"Départements");
  const parcs=listeUniq(input.parcs||[],3,v=>UUID.test(v),"Parcs");
  const mois=listeUniq(input.mois||[],3,v=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(v),"Mois");
  const jours=listeUniq(input.jours||[],7,v=>/^[1-7]$/.test(v),"Jours");
  const plages=listeUniq(input.plages||[],5,v=>/^[1-5]$/.test(v),"Plages");
  const dateValide=v=>/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
  const dates=listeUniq(input.dates||[],6,dateValide,"Dates");
  if(!Array.isArray(input.periodes||[])||input.periodes.length>3)throw erreur("Trois périodes maximum.");
  const periodes=(input.periodes||[]).map(p=>{
    const debut=String(p?.debut||""),fin=String(p?.fin||"");
    if(!dateValide(debut)||!dateValide(fin)||fin<debut)throw erreur("Période de dates invalide.");
    return {debut,fin};
  });
  const categories=listeUniq(input.categories||(
    input.categorie==="tous"?["duo","famille","coach"]:
    input.categorie==="famille-coach"?["duo","famille","coach"]:
    input.categorie?[input.categorie]:["duo"]
  ),3,v=>["duo","famille","coach"].includes(v),"Catégories d'invités");
  if(!categories.length)throw erreur("Sélectionnez un type d'accès.");
  if(![departements,parcs,mois,jours,plages,dates,periodes].some(v=>v.length))throw erreur("Sélectionnez au moins un critère.");
  return {departements,parcs,categories,plages,mois,jours,dates,periodes};
}
async function verifierParcs(env,crit){
  if(!crit.parcs.length)return;
  const parcs=await db(env,"parcs",{select:"idparc,dptmt",idparc:"in.("+crit.parcs.join(",")+")",limit:"3"});
  if(parcs.length!==crit.parcs.length)throw erreur("Un parc sélectionné n'existe plus");
  if(crit.departements.length&&!parcs.every(p=>crit.departements.includes(p.dptmt)))throw erreur("Les parcs doivent appartenir aux départements sélectionnés");
}
async function liste(env,idmembre){
  return db(env,"alerte_planification",{select:"idalerte,titre,criteres,actif,datecreation,datemaj,datedernierelancement",idmembre:"eq."+idmembre,order:"datecreation.desc",limit:"5"});
}
async function recuperer(env,idmembre,id){
  const rows=await db(env,"alerte_planification",{select:"idalerte,titre,criteres,actif,datedernierelancement",idmembre:"eq."+idmembre,idalerte:"eq."+id,limit:"1"});
  if(!rows.length)throw erreur("Alerte introuvable",404);
  return rows[0];
}
async function rechercheManuelle(env,crit){
  // Résultats indicatifs uniquement : réservation et droits vérifiés ensuite
  // par PLANIFIER/ABO-RÉZA, sans aucun accès réservé par ce Worker.
  const moisPeriodes=new Set();
  for(const p of crit.periodes){
    let cursor=p.debut.slice(0,7);
    while(cursor<=p.fin.slice(0,7)){
      moisPeriodes.add(cursor);
      const [an,mo]=cursor.split("-").map(Number);
      cursor=new Date(Date.UTC(an,mo,1)).toISOString().slice(0,7);
      if(moisPeriodes.size>18)throw erreur("Recherche limitée à 18 mois. Réduisez les périodes.");
    }
  }
  const candidatsMois=crit.mois.length?crit.mois:(moisPeriodes.size?[...moisPeriodes]:(crit.dates.length?[...new Set(crit.dates.map(d=>d.slice(0,7)))]:[new Date().toISOString().slice(0,7)]));
  const datesSet=new Set(crit.dates);
  // Recherche bornée à un département/parc pour limiter la charge serveur.
  if(!crit.parcs.length&&!crit.departements.length)throw erreur("Choisissez au moins un département ou un parc.");
  const parcQuery={select:"idparc,nom,dptmt",...(crit.parcs.length?{idparc:"in.("+crit.parcs.join(",")+")"}:{dptmt:"in.("+crit.departements.join(",")+")"}),limit:"500"};
  const parcs=await db(env,"parcs",parcQuery);
  const parcsEligibles=parcs.filter(p=>(!crit.departements.length||crit.departements.includes(p.dptmt))&&(!crit.parcs.length||crit.parcs.includes(p.idparc)));
  if(!parcsEligibles.length)return [];
  const noms=new Map(parcsEligibles.map(p=>[p.idparc,p.nom]));
  const correspondances=[];
  const aujourdHui=new Date().toISOString().slice(0,10);
  for(const month of candidatsMois){
    if(correspondances.length>=100)break;
    const first=month+"-01";
    const next=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),1)).toISOString().slice(0,10);
    for(let start=0;start<parcsEligibles.length;start+=30){
      if(correspondances.length>=100)break;
      const ids=parcsEligibles.slice(start,start+30).map(p=>p.idparc);
      // Pagination indispensable : 30 parcs * 31 jours dépassent parfois 1000 lignes.
      for(let offset=0;offset<3000;offset+=500){
        if(correspondances.length>=100)break;
        const rows=await db(env,"hparcs",{
          select:"idparc,datejour,segments",
          idparc:"in.("+ids.join(",")+")",
          and:"(datejour.gte."+first+",datejour.lt."+next+")",
          order:"datejour.asc,idparc.asc",limit:"500",offset:String(offset)
        });
        for(const row of rows){
          if(row.datejour<aujourdHui||datesSet.size&&!datesSet.has(row.datejour))continue;
          if(crit.periodes.length&&!crit.periodes.some(p=>row.datejour>=p.debut&&row.datejour<=p.fin))continue;
          const jour=new Date(row.datejour+"T12:00:00Z").getUTCDay()||7;
          if(crit.jours.length&&!crit.jours.includes(String(jour)))continue;
          for(const seg of Array.isArray(row.segments)?row.segments:[]){
            if(crit.plages.length&&!crit.plages.includes(String(seg.plage)))continue;
            if(seg.fermeture||seg.privatisation)continue;
            const ouvert=c=>seg[c]?.etat===true&&Number(seg[c].capacite)>0;
            const correspond=crit.categories.some(ouvert);
            if(!correspond)continue;
            correspondances.push({idparc:row.idparc,parc:noms.get(row.idparc)||"",date:row.datejour,plage:seg.plage,debut:seg.debut,fin:seg.fin,statut:"à vérifier dans PLANIFIER"});
            if(correspondances.length>=100)break;
          }
          if(correspondances.length>=100)break;
        }
        if(rows.length<500)break;
      }
    }
  }
  return correspondances;
}
export default {async fetch(request,env){
  const origin=originAutorisee(request,env);
  if(request.method==="OPTIONS")return new Response(null,{status:origin?204:403,headers:origin?{"access-control-allow-origin":origin,"access-control-allow-credentials":"true","access-control-allow-methods":"GET, POST, PATCH, DELETE, OPTIONS","access-control-allow-headers":"Content-Type","vary":"Origin"}:{}});
  if(request.headers.has("Origin")&&!origin)return REPONSE({ok:false,message:"Origine interdite"},403);
  const url=new URL(request.url),pathname=url.pathname.replace(/\/$/,"");
  try{
    if(!["GET","POST","PATCH","DELETE"].includes(request.method))throw erreur("Méthode non autorisée",405);
    if(request.method!=="GET"&&!origin)throw erreur("Origine requise",403);
    const membre=await session(request,env);
    if(pathname==="/references"&&request.method==="GET"){
      const departements=await db(env,"dptmt",{select:"code,nom",order:"code.asc",limit:"110"});
      const selection=(url.searchParams.get("departements")||"").split(",").filter(Boolean);
      if(selection.length>3||!selection.every(x=>/^\d{2,3}[A-B]?$/.test(x)))throw erreur("Départements invalides");
      const parcs=[];
      // Les parcs sont chargés à la demande après choix des départements.
      // Ne pas télécharger les milliers de parcs lors de l'ouverture.
      for(let offset=0;selection.length&&offset<6000;offset+=1000){
        const page=await db(env,"parcs",{select:"idparc,nom,dptmt",...(selection.length?{dptmt:"in.("+selection.join(",")+")"}:{}),order:"nom.asc",limit:"1000",offset:String(offset)});
        parcs.push(...page);
        if(page.length<1000)break;
      }
      return REPONSE({ok:true,departements,parcs},200,origin);
    }
    if(pathname==="/alertes"&&request.method==="GET")return REPONSE({ok:true,alertes:await liste(env,membre)},200,origin);
    if(pathname==="/alertes"&&request.method==="POST"){
      if((await liste(env,membre)).length>=5)throw erreur("Maximum de cinq alertes enregistré",409);
      const body=await request.json().catch(()=>null);
      const crit=criteresValides(body?.criteres);await verifierParcs(env,crit);
      const titre=String(body?.titre||"").trim();
      if(!titre||titre.length>80)throw erreur("Titre obligatoire (80 caractères maximum)");
      const rows=await db(env,"alerte_planification",{}, {method:"POST",body:JSON.stringify({idmembre:membre,titre,criteres:crit})});
      return REPONSE({ok:true,alerte:rows[0]},201,origin);
    }
    const match=pathname.match(/^\/alertes\/([0-9a-f-]{36})(?:\/(relancer))?$/i);
    if(!match||!UUID.test(match[1]))throw erreur("Route introuvable",404);
    const id=match[1],action=match[2],alerte=await recuperer(env,membre,id);
    if(action==="relancer"&&request.method==="POST"){
      if(!alerte.actif)throw erreur("Réactivez cette alerte avant de la relancer.",409);
      const crit=criteresValides(alerte.criteres);
      const resultats=await rechercheManuelle(env,crit);
      await db(env,"alerte_planification",{idalerte:"eq."+id,idmembre:"eq."+membre},{method:"PATCH",body:JSON.stringify({datedernierelancement:new Date().toISOString()})});
      return REPONSE({ok:true,resultats,avertissement:"Recherche indicative : disponibilité et droits vérifiés à la réservation dans PLANIFIER."},200,origin);
    }
    if(!action&&request.method==="PATCH"){
      const body=await request.json().catch(()=>null);
      const updates={datemaj:new Date().toISOString()};
      if(typeof body?.titre==="string"){updates.titre=body.titre.trim();if(!updates.titre||updates.titre.length>80)throw erreur("Titre invalide");}
      if(body&&Object.prototype.hasOwnProperty.call(body,"criteres")){updates.criteres=criteresValides(body.criteres);await verifierParcs(env,updates.criteres);}
      if(typeof body?.actif==="boolean")updates.actif=body.actif;
      await db(env,"alerte_planification",{idmembre:"eq."+membre,idalerte:"eq."+id},{method:"PATCH",body:JSON.stringify(updates)});
      return REPONSE({ok:true},200,origin);
    }
    if(!action&&request.method==="DELETE"){
      await db(env,"alerte_planification",{idmembre:"eq."+membre,idalerte:"eq."+id},{method:"DELETE"});
      return REPONSE({ok:true},200,origin);
    }
    throw erreur("Méthode non autorisée",405);
  }catch(e){return REPONSE({ok:false,message:e.status===502?"Service de données indisponible":e.message||"Erreur technique"},e.status||500,origin);}
}};
